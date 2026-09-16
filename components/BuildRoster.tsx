"use client";

import Link from "next/link";
import { useMemo, useReducer } from "react";
import type { Meta, Team } from "@/lib/types";
import {
  formatBudgetMid,
  formatBudgetRange,
  formatRecord,
  formatSigned,
} from "@/lib/format";

const POSITIONS = [
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "OL", label: "OL" },
  { id: "DL", label: "DL" },
  { id: "LB", label: "LB" },
  { id: "DB", label: "DB" },
  { id: "ST", label: "ST" },
] as const;

type PosId = (typeof POSITIONS)[number]["id"];
type Alloc = Record<PosId, number>;

const DEFAULT_ALLOC: Alloc = {
  QB: 4.2,
  RB: 1.9,
  WR: 5.2,
  OL: 5.2,
  DL: 5.2,
  LB: 3.8,
  DB: 3.8,
  ST: 0.7,
};

const PEER_BAND = 3;
const TOTAL_MIN = 8;
const TOTAL_MAX = 55;
const POS_MAX = 20;

type Action =
  | { type: "setPos"; id: PosId; value: number }
  | { type: "setTotal"; value: number }
  | { type: "reset" };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sumAlloc(a: Alloc): number {
  return round1(POSITIONS.reduce((s, p) => s + a[p.id], 0));
}

function scaleAlloc(a: Alloc, target: number): Alloc {
  const current = sumAlloc(a);
  const next = { ...a };
  if (current <= 0) return { ...DEFAULT_ALLOC };
  let running = 0;
  POSITIONS.forEach((p, i) => {
    if (i === POSITIONS.length - 1) {
      next[p.id] = Math.max(0, round1(target - running));
    } else {
      next[p.id] = Math.max(0, round1((a[p.id] * target) / current));
      running += next[p.id];
    }
  });
  return next;
}

function reducer(state: Alloc, action: Action): Alloc {
  switch (action.type) {
    case "setPos":
      return { ...state, [action.id]: round1(Math.min(POS_MAX, Math.max(0, action.value))) };
    case "setTotal": {
      const target = round1(Math.min(TOTAL_MAX, Math.max(TOTAL_MIN, action.value)));
      return scaleAlloc(state, target);
    }
    case "reset":
      return { ...DEFAULT_ALLOC };
    default:
      return state;
  }
}

function budgetMatchPct(mid: number, total: number): number {
  const d = Math.abs(mid - total);
  return Math.max(0, Math.round(100 * (1 - d / 20)));
}

type Props = {
  teams: Team[];
  meta: Meta;
};

export function BuildRoster({ teams, meta }: Props) {
  const [alloc, dispatch] = useReducer(reducer, DEFAULT_ALLOC);
  const total = sumAlloc(alloc);
  const expected = meta.moneyballModel.intercept + meta.moneyballModel.slope * total;

  const nearest = useMemo(() => {
    return [...teams]
      .map((t) => ({
        team: t,
        delta: t.budgetMid - total,
        match: budgetMatchPct(t.budgetMid, total),
      }))
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
      .slice(0, 5);
  }, [teams, total]);

  const peers = useMemo(
    () => teams.filter((t) => Math.abs(t.budgetMid - total) <= PEER_BAND).length,
    [teams, total],
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">
              Your budget
            </p>
            <p className="font-mono text-4xl font-medium text-obsidian">${total.toFixed(1)}M</p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "reset" })}
            className="border border-stone px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-slate hover:border-obsidian hover:text-obsidian"
          >
            Reset
          </button>
        </div>

        <label className="mt-6 block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate">
            Scale total
          </span>
          <input
            type="range"
            min={TOTAL_MIN}
            max={TOTAL_MAX}
            step={0.1}
            value={total}
            onChange={(e) => dispatch({ type: "setTotal", value: Number(e.target.value) })}
            className="mt-2 w-full accent-[#DBFF00]"
          />
        </label>

        <ul className="mt-8 space-y-4">
          {POSITIONS.map((p) => (
            <li key={p.id} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-3">
              <span className="font-mono text-sm font-medium text-obsidian">{p.label}</span>
              <input
                type="range"
                min={0}
                max={POS_MAX}
                step={0.1}
                value={alloc[p.id]}
                onChange={(e) =>
                  dispatch({ type: "setPos", id: p.id, value: Number(e.target.value) })
                }
                className="w-full accent-[#DBFF00]"
                aria-label={`${p.label} allocation`}
              />
              <span className="text-right font-mono text-sm text-obsidian">
                ${alloc[p.id].toFixed(1)}M
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs leading-relaxed text-slate">
          Position splits are a planning sketch, not Athletic data. Published figures are team-level
          ranges only. Expected wins use {meta.moneyballModel.formula}.
        </p>
      </section>

      <aside className="border border-stone p-5 h-fit">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate">
          Model output
        </p>
        <p className="mt-2 font-mono text-3xl font-medium text-obsidian">
          {expected.toFixed(1)}
        </p>
        <p className="text-xs text-slate">Expected 2025-style wins at this midpoint</p>

        <p className="mt-6 text-[10px] font-medium uppercase tracking-wider text-slate">
          Your roster resembles
        </p>
        <p className="mt-1 text-xs text-slate">
          Closest Athletic midpoints · {peers} team{peers === 1 ? "" : "s"} within ±${PEER_BAND}M
        </p>

        <ol className="mt-4 space-y-3">
          {nearest.map(({ team, delta, match }) => (
            <li key={team.slug} className="border-t border-stone pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/team/${team.slug}`}
                  className="font-display text-lg font-bold uppercase text-obsidian hover:underline"
                >
                  {team.name}
                </Link>
                <span className="font-mono text-xs text-slate">{match}% match</span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate">
                {formatBudgetRange(team.budgetMin, team.budgetMax)} · mid{" "}
                {formatBudgetMid(team.budgetMid)}
              </p>
              <p className="font-mono text-xs text-slate">
                {formatRecord(team.record2025.wins, team.record2025.losses)} · WAE{" "}
                {formatSigned(team.moneyball.winsAboveExpected2025)} ·{" "}
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}M vs yours
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
