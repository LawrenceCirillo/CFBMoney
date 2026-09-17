"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Team } from "@/lib/types";
import { CONFERENCE_LEGEND, conferenceColor } from "@/lib/conferences";
import { formatBudgetRange, formatRecord, formatSigned } from "@/lib/format";

const MARGIN = { top: 24, right: 24, bottom: 48, left: 56 };
const WIDTH = 720;
const HEIGHT = 420;

type Props = {
  teams: Team[];
};

export function SpendWinsScatter({ teams }: Props) {
  const [hovered, setHovered] = useState<Team | null>(null);
  const [conference, setConference] = useState<string>("All");

  const visible = useMemo(
    () => teams.filter((t) => matchesConference(t, conference)),
    [teams, conference],
  );

  const plot = useMemo(() => {
    const innerW = WIDTH - MARGIN.left - MARGIN.right;
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const xExt = extent(teams, (d) => d.budgetMid) as [number, number];
    const yExt = extent(teams, (d) => d.record2025.wins ?? 0) as [number, number];
    const x = scaleLinear().domain([Math.max(0, xExt[0] - 2), xExt[1] + 2]).range([0, innerW]);
    const y = scaleLinear().domain([0, Math.max(15, yExt[1] + 1)]).range([innerH, 0]);
    return { x, y, innerW, innerH };
  }, [teams]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full max-w-[720px] text-obsidian"
          role="img"
          aria-label="Scatter plot of roster budget midpoint versus 2025 wins"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {[0, 5, 10, 15].map((tick) => (
              <g key={tick}>
                <line
                  x1={0}
                  x2={plot.innerW}
                  y1={plot.y(tick)}
                  y2={plot.y(tick)}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={plot.y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate text-[10px] font-mono"
                >
                  {tick}
                </text>
              </g>
            ))}
            {[10, 20, 30, 40, 50].map((tick) => (
              <g key={tick}>
                <line
                  x1={plot.x(tick)}
                  x2={plot.x(tick)}
                  y1={0}
                  y2={plot.innerH}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={plot.x(tick)}
                  y={plot.innerH + 20}
                  textAnchor="middle"
                  className="fill-slate text-[10px] font-mono"
                >
                  {tick}
                </text>
              </g>
            ))}
            <text
              x={plot.innerW / 2}
              y={plot.innerH + 40}
              textAnchor="middle"
              className="fill-slate text-[11px] font-medium uppercase tracking-wider"
            >
              Roster budget midpoint ($M)
            </text>
            <text
              transform={`translate(-40, ${plot.innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-slate text-[11px] font-medium uppercase tracking-wider"
            >
              2025 wins
            </text>
            {visible.map((team) => {
              const wins = team.record2025.wins ?? 0;
              const cx = plot.x(team.budgetMid);
              const cy = plot.y(wins);
              const active = hovered?.slug === team.slug;
              return (
                <circle
                  key={team.slug}
                  cx={cx}
                  cy={cy}
                  r={active ? 7 : 5}
                  fill={conferenceColor(
                    team.name === "Notre Dame" ? "Independent" : team.conference,
                  )}
                  stroke={active ? "#DBFF00" : "#fff"}
                  strokeWidth={active ? 2 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(team)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </g>
        </svg>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs text-slate">
          <li>
            <button
              type="button"
              onClick={() => setConference("All")}
              className={`border px-2 py-1 ${
                conference === "All"
                  ? "border-obsidian text-obsidian"
                  : "border-stone hover:border-obsidian"
              }`}
            >
              All
            </button>
          </li>
          {CONFERENCE_LEGEND.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => setConference(c.label)}
                className={`inline-flex items-center gap-1.5 border px-2 py-1 ${
                  conference === c.label
                    ? "border-obsidian text-obsidian"
                    : "border-stone hover:border-obsidian"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <aside className="w-full shrink-0 border border-stone bg-white p-5 lg:w-64">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate">
          Hover a team
        </p>
        {hovered && visible.some((t) => t.slug === hovered.slug) ? (
          <div className="mt-3 space-y-2">
            <Link
              href={`/team/${hovered.slug}`}
              className="font-display text-2xl font-bold uppercase text-obsidian hover:underline"
            >
              {hovered.name}
            </Link>
            <p className="text-sm text-slate">{hovered.conference}</p>
            <dl className="space-y-1 font-mono text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate">Budget</dt>
                <dd>
                  {formatBudgetRange(hovered.budgetMin, hovered.budgetMax, hovered.budgetMid)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate">2025</dt>
                <dd>{formatRecord(hovered.record2025.wins, hovered.record2025.losses)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate">WAE</dt>
                <dd>{formatSigned(hovered.moneyball.winsAboveExpected2025)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate">
            {conference === "All"
              ? "Move over a dot to preview budget and wins."
              : `${visible.length} ${conference} team${visible.length === 1 ? "" : "s"} — hover a dot.`}
          </p>
        )}
      </aside>
    </div>
  );
}

function matchesConference(team: Team, filter: string): boolean {
  if (filter === "All") return true;
  if (filter === "Notre Dame") return team.name === "Notre Dame";
  return team.conference === filter;
}
