"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TeamBudget } from "@/lib/types";
import { logoSrc, markDisc } from "@/lib/mark";
import { comparisonLabel, movementLabel, movementSummary, type TeamMovement } from "@/lib/moneyball-movement";

/** Spend (x) vs. the current AP rank (y, inverted). */
export default function Scatterplot({ teams, week, movements, previousWeek }: {
  teams: TeamBudget[];
  week: number;
  movements: Record<string, TeamMovement>;
  previousWeek: number | null;
}) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const clearHoverTimer = () => clearTimeout(hoverTimer.current);
  const hideHover = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setHovered(null), 120);
  };
  const active = teams.find((team) => team.slug === (hovered ?? focused));
  const tooltipOpen = active !== undefined;
  useEffect(() => {
    if (!tooltipOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearTimeout(hoverTimer.current);
        setHovered(null);
        setFocused(null);
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [tooltipOpen]);
  const W = 880;
  const H = 560;
  const m = { t: 46, r: 34, b: 56, l: 56 };

  const xs = teams.map((t) => t.budget_mid_m);
  const x0 = Math.floor(Math.min(...xs)) - 2;
  const x1 = Math.ceil(Math.max(...xs)) + 2;
  const yTop = 0;
  const yBottom = 26;

  const X = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (r: number) => m.t + ((r - yTop) / (yBottom - yTop)) * (H - m.t - m.b);

  const xTicks: number[] = [];
  for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) xTicks.push(v);
  const yTicks = [25, 20, 15, 10, 5];

  return (
    <div className="relative" onPointerLeave={hideHover}>
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label={`Roster spend vs. AP rank through Week ${week}`}>
      {/* grid */}
      {xTicks.map((v) => (
        <g key={v} aria-hidden="true">
          <line x1={X(v)} y1={m.t} x2={X(v)} y2={H - m.b} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={X(v)} y={H - m.b + 22} textAnchor="middle" fontSize={12} fill="var(--chart-text)" className="tnum">
            ${v}M
          </text>
        </g>
      ))}
      {yTicks.map((r) => (
        <g key={r} aria-hidden="true">
          <line x1={m.l} y1={Y(r)} x2={W - m.r} y2={Y(r)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={m.l - 12} y={Y(r) + 4} textAnchor="end" fontSize={12} fill="var(--chart-text)" className="tnum">
            #{r}
          </text>
        </g>
      ))}

      {/* axis titles */}
      <text aria-hidden="true" x={(m.l + W - m.r) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--chart-text)">
        Roster budget →
      </text>
      <text
        aria-hidden="true"
        x={16}
        y={(m.t + H - m.b) / 2}
        textAnchor="middle"
        fontSize={12}
        fill="var(--chart-text)"
        transform={`rotate(-90 16 ${(m.t + H - m.b) / 2})`}
      >
        ↑ Better rank
      </text>

      {/* teams */}
      {teams.map((t) => {
        const cx = X(t.budget_mid_m);
        const cy = Y(t.ap_rank!);
        const r = 14;
        return (
          <a key={t.slug} href={`/team/${t.slug}`} tabIndex={0} className="moneyball-point outline-none"
            aria-label={`${t.name}, spend #${t.spend_rank}, AP #${t.ap_rank}, estimated budget ${t.budget_low_m} to ${t.budget_high_m} million dollars. ${movementSummary(movements[t.slug], previousWeek)}`}
            aria-describedby={active?.slug === t.slug ? tooltipId : undefined}
            onPointerEnter={(event) => { if (event.pointerType !== "touch") { clearHoverTimer(); setHovered(t.slug); } }}
            onPointerLeave={hideHover}
            onFocus={() => { clearHoverTimer(); setHovered(null); setFocused(t.slug); }} onBlur={() => setFocused(null)}>
            <circle className="moneyball-point-ring" cx={cx} cy={cy} r={r + 3} fill="none" stroke="var(--color-paper)" strokeWidth={2} opacity={active?.slug === t.slug ? 1 : 0} />
            <circle cx={cx} cy={cy} r={r} fill={markDisc(t.color)} />
            <image
              href={logoSrc(t.slug)}
              x={cx - 11}
              y={cy - 11}
              width={22}
              height={22}
              preserveAspectRatio="xMidYMid meet"
            />
          </a>
        );
      })}
    </svg>
    {active && (
      <div id={tooltipId} role="tooltip" onPointerEnter={clearHoverTimer} onPointerLeave={hideHover}
        className="absolute z-10 w-60 rounded-lg border border-line bg-ink p-3 text-sm text-paper shadow-sm"
        style={{
          left: `${X(active.budget_mid_m) / W * 100}%`, top: `${Y(active.ap_rank!) / H * 100}%`,
          transform: `translate(${X(active.budget_mid_m) > W / 2 ? "calc(-100% - 16px)" : "16px"}, ${Y(active.ap_rank!) < 180 ? "16px" : "calc(-100% - 16px)"})`,
        }}>
        <p className="font-bold">{active.name}</p>
        <p className="mt-1 tabular-nums">Spend #{active.spend_rank} · AP #{active.ap_rank}</p>
        <p className="mt-2 text-xs text-fog">{comparisonLabel(previousWeek)}</p>
        <p className="mt-1 text-xs leading-relaxed tabular-nums">AP {movementLabel(movements[active.slug].ap)} · Spend {movementLabel(movements[active.slug].spend)}</p>
      </div>
    )}
    </div>
  );
}
