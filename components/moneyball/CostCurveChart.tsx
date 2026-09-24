"use client";

import { useMemo, useState } from "react";
import { data } from "@/lib/data";
import { fmtM } from "@/lib/format";
import { costCurve, expectedWins, fieldRatings } from "@/lib/moneyball";

const BUDGET_STEP_M = 10;
const budgetMidpoints = data.teams.map((team) => team.budget_mid_m);
const minBudget = Math.min(...budgetMidpoints);
const maxBudget = Math.max(...budgetMidpoints);
const maxStart = Math.floor((maxBudget - BUDGET_STEP_M) * 2) / 2;

/** A bounded comparison inside the reported midpoint span, using Build's assumptions. */
export default function CostCurveChart() {
  const [startBudget, setStartBudget] = useState(Math.min(25, maxStart));
  const { field, curve } = useMemo(() => {
    const field = fieldRatings();
    return { field, curve: costCurve(field, minBudget, maxBudget, 0.5) };
  }, []);

  const endBudget = startBudget + BUDGET_STEP_M;
  const startWins = expectedWins(startBudget, field);
  const endWins = expectedWins(endBudget, field);
  const winChange = endWins - startWins;

  const W = 880;
  const H = 430;
  const m = { t: 30, r: 28, b: 58, l: 58 };
  const minWins = Math.floor(curve[0].wins);
  const maxWins = Math.ceil(curve[curve.length - 1].wins);
  const X = (budget: number) => m.l + ((budget - minBudget) / (maxBudget - minBudget)) * (W - m.l - m.r);
  const Y = (wins: number) => m.t + (1 - (wins - minWins) / (maxWins - minWins)) * (H - m.t - m.b);
  const path = curve.map((point, index) => `${index === 0 ? "M" : "L"}${X(point.budget).toFixed(1)},${Y(point.wins).toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: maxWins - minWins + 1 }, (_, index) => minWins + index);
  const xTicks = [minBudget, 20, 30, 40, maxBudget].filter((tick, index, ticks) =>
    tick >= minBudget && tick <= maxBudget && ticks.indexOf(tick) === index,
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Build model: ${fmtM(startBudget)} yields ${startWins.toFixed(1)} expected wins; ${fmtM(endBudget)} yields ${endWins.toFixed(1)} expected wins against an average field.`}
      >
        {yTicks.map((wins) => (
          <g key={wins}>
            <line x1={m.l} y1={Y(wins)} x2={W - m.r} y2={Y(wins)} stroke="var(--chart-faint)" />
            <text x={m.l - 12} y={Y(wins) + 4} textAnchor="end" fontSize={12} fill="var(--chart-text)">
              {wins}
            </text>
          </g>
        ))}
        {xTicks.map((budget) => (
          <g key={budget}>
            <line x1={X(budget)} y1={m.t} x2={X(budget)} y2={H - m.b} stroke="var(--chart-faint)" />
            <text x={X(budget)} y={H - m.b + 22} textAnchor="middle" fontSize={12} fill="var(--chart-text)" className="tnum">
              {fmtM(budget)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--chart-paper)" strokeWidth={3} />
        <line x1={X(startBudget)} y1={Y(startWins)} x2={X(endBudget)} y2={Y(endWins)} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="5 5" />
        <circle cx={X(startBudget)} cy={Y(startWins)} r={8} fill="var(--color-ink)" stroke="var(--chart-paper)" strokeWidth={3} />
        <circle cx={X(endBudget)} cy={Y(endWins)} r={8} fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth={2} />
        <text x={(m.l + W - m.r) / 2} y={H - 5} textAnchor="middle" fontSize={12} fill="var(--chart-text)">
          Estimated roster budget midpoint →
        </text>
        <text
          x={16}
          y={(m.t + H - m.b) / 2}
          textAnchor="middle"
          fontSize={12}
          fill="var(--chart-text)"
          transform={`rotate(-90 16 ${(m.t + H - m.b) / 2})`}
        >
          Modeled expected wins →
        </text>
      </svg>

      <div className="mt-3 border-t border-line pt-5">
        <label htmlFor="moneyball-start-budget" className="block text-sm font-semibold">
          Starting budget: <span className="tnum">{fmtM(startBudget)}</span>
        </label>
        <div className="mt-3 flex items-center gap-3">
          <span className="tnum shrink-0 text-xs text-fog">{fmtM(minBudget)}</span>
          <input
            id="moneyball-start-budget"
            type="range"
            min={minBudget}
            max={maxStart}
            step={0.5}
            value={startBudget}
            onChange={(event) => setStartBudget(Number(event.target.value))}
            className="w-full"
          />
          <span className="tnum shrink-0 text-xs text-fog">{fmtM(maxStart)}</span>
        </div>
        <dl className="mt-5 grid gap-px bg-edge sm:grid-cols-3">
          <div className="bg-ink px-4 py-4">
            <dt className="text-xs text-fog">At {fmtM(startBudget)}</dt>
            <dd className="tnum mt-1 text-2xl font-black">{startWins.toFixed(1)} wins</dd>
          </div>
          <div className="bg-ink px-4 py-4">
            <dt className="text-xs text-fog">At {fmtM(endBudget)}</dt>
            <dd className="tnum mt-1 text-2xl font-black">{endWins.toFixed(1)} wins</dd>
          </div>
          <div className="bg-ink px-4 py-4">
            <dt className="text-xs text-fog">Modeled change</dt>
            <dd className="tnum mt-1 text-2xl font-black">+{winChange.toFixed(1)} wins</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-fog">
          A hypothetical 12-game season against an average {data.season} field at neutral sites.
          The observed budget midpoint span is {fmtM(minBudget)}–{fmtM(maxBudget)}; this is a game-model
          comparison, not an estimate of wins purchased by any school.
        </p>
      </div>
    </div>
  );
}
