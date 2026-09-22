"use client";

import { useMemo, useState } from "react";
import {
  costCurve,
  expectedWins,
  costPerWin,
  sweetSpot,
  fieldRatings,
  winPrices,
} from "@/lib/moneyball";
import { fmtM, fmtMoney2 } from "@/lib/format";

/**
 * The signature Moneyball visual: roster budget vs expected wins against an
 * average field, with the model's diminishing returns on full display.
 * Drag the slider to price any budget.
 */
export default function CostCurveChart() {
  const [budget, setBudget] = useState(30);

  const { curve, sweet, prices, field } = useMemo(() => {
    const field = fieldRatings();
    return {
      field,
      curve: costCurve(field, 5, 80, 0.5),
      sweet: sweetSpot(field),
      prices: winPrices(5, 12, field),
    };
  }, []);

  const W = 880;
  const H = 470;
  const m = { t: 44, r: 28, b: 54, l: 54 };
  const x0 = 5;
  const x1 = 80;
  const y1 = 12;

  const X = (b: number) => m.l + ((b - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (w: number) => m.t + (1 - w / y1) * (H - m.t - m.b);

  const path = useMemo(
    () =>
      curve
        .map((p, i) => `${i === 0 ? "M" : "L"}${X(p.budget).toFixed(1)},${Y(p.wins).toFixed(1)}`)
        .join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curve]
  );

  const wins = expectedWins(budget, field);
  const cpw = costPerWin(budget, field);
  const nextK = Math.min(12, Math.max(5, Math.floor(wins) + 1));
  const nextPrice = prices.find((p) => p.win === nextK)?.priceM;

  const xTicks = [10, 20, 30, 40, 50, 60, 70, 80];
  const yTicks = [0, 2, 4, 6, 8, 10, 12];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Roster budget versus expected wins: diminishing returns curve"
      >
        {/* observed budget band */}
        <rect
          x={X(10.5)}
          y={m.t}
          width={X(51.5) - X(10.5)}
          height={H - m.t - m.b}
          fill="var(--chart-paper)"
          opacity={0.035}
        />
        <line x1={X(10.5)} y1={m.t} x2={X(10.5)} y2={H - m.b} stroke="var(--chart-grid)" strokeDasharray="4 4" />
        <line x1={X(51.5)} y1={m.t} x2={X(51.5)} y2={H - m.b} stroke="var(--chart-grid)" strokeDasharray="4 4" />
        <text x={(X(10.5) + X(51.5)) / 2} y={m.t - 12} textAnchor="middle" fontSize={11} fill="var(--chart-dim)" fontWeight={700}>
          2026 budget range
        </text>

        {/* grid */}
        {xTicks.map((v) => (
          <g key={v}>
            <line x1={X(v)} y1={m.t} x2={X(v)} y2={H - m.b} stroke="var(--chart-faint)" strokeWidth={1} />
            <text x={X(v)} y={H - m.b + 22} textAnchor="middle" fontSize={12} fill="var(--chart-text)" className="tnum">
              ${v}M
            </text>
          </g>
        ))}
        {yTicks.map((w) => (
          <g key={w}>
            <line x1={m.l} y1={Y(w)} x2={W - m.r} y2={Y(w)} stroke="var(--chart-faint)" strokeWidth={1} />
            <text x={m.l - 12} y={Y(w) + 4} textAnchor="end" fontSize={12} fill="var(--chart-text)" className="tnum">
              {w}
            </text>
          </g>
        ))}

        {/* curve */}
        <path d={path} fill="none" stroke="var(--chart-paper)" strokeWidth={2.5} />

        {/* sweet spot */}
        <circle cx={X(sweet.budget)} cy={Y(sweet.wins)} r={6} fill="#22c55e" />
        <text
          x={X(sweet.budget)}
          y={Y(sweet.wins) - 16}
          textAnchor="middle"
          fontSize={12}
          fontWeight={800}
          fill="#22c55e"
        >
          Sweet spot · {fmtM(Math.round(sweet.budget))}
        </text>

        {/* slider marker */}
        <line
          x1={X(budget)}
          y1={m.t}
          x2={X(budget)}
          y2={H - m.b}
          stroke="var(--chart-paper)"
          strokeWidth={1}
          strokeDasharray="5 4"
          opacity={0.55}
        />
        <circle cx={X(budget)} cy={Y(wins)} r={7} fill="#0a0a0c" stroke="var(--chart-paper)" strokeWidth={2.5} />

        {/* steep-end annotation */}
        <text x={W - m.r} y={Y(11.55)} textAnchor="end" fontSize={12} fill="var(--chart-dim)" fontStyle="italic">
          wins get expensive up here
        </text>

        {/* axis titles */}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--chart-text)">
          Roster budget →
        </text>
        <text
          x={16}
          y={(m.t + H - m.b) / 2}
          textAnchor="middle"
          fontSize={12}
          fill="var(--chart-text)"
          transform={`rotate(-90 16 ${(m.t + H - m.b) / 2})`}
        >
          Expected wins →
        </text>
      </svg>

      {/* slider + readout */}
      <div className="mt-2 border-t border-line pt-5">
        <div className="flex items-center gap-4">
          <span className="tnum text-sm text-fog">$5M</span>
          <input
            type="range"
            min={5}
            max={80}
            step={0.5}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full"
            aria-label="Roster budget in millions"
          />
          <span className="tnum text-sm text-fog">$80M</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
          {[
            { label: "Budget", value: fmtM(budget) },
            { label: "Expected wins", value: wins.toFixed(1) },
            { label: "$ per win", value: fmtMoney2(cpw) },
            {
              label: `Price of win #${nextK}`,
              value: nextPrice != null ? fmtM(Math.round(nextPrice * 10) / 10) : "—",
            },
          ].map((s) => (
            <div key={s.label} className="bg-ink px-4 py-4">
              <p className="text-[11px] font-semibold text-fog">{s.label}</p>
              <p className="tnum mt-1 text-2xl font-black tracking-tight sm:text-3xl">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-fog">
          Modeled: {wins.toFixed(1)} expected wins across a 12-game season against an average
          2026 field, neutral site. Not a prediction.
        </p>
      </div>
    </div>
  );
}
