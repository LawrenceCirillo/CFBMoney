"use client";

import Link from "next/link";
import { useMemo, useReducer, useState } from "react";
import { RosterFormation, type PosId } from "@/components/RosterFormation";
import type { Meta, Team } from "@/lib/types";
import {
  formatBudgetMid,
  formatBudgetRange,
  formatRecord,
  formatSigned,
} from "@/lib/format";

const POSITIONS = [
  { id: "QB" as const, label: "Quarterback", unit: "Offense" },
  { id: "RB" as const, label: "Running back", unit: "Offense" },
  { id: "WR" as const, label: "Wide receiver", unit: "Offense" },
  { id: "TE" as const, label: "Tight end", unit: "Offense" },
  { id: "OL" as const, label: "Offensive line", unit: "Offense" },
  { id: "DL" as const, label: "Defensive line", unit: "Defense" },
  { id: "LB" as const, label: "Linebacker", unit: "Defense" },
  { id: "DB" as const, label: "Defensive back", unit: "Defense" },
  { id: "ST" as const, label: "Special teams", unit: "Special teams" },
];

type Alloc = Record<PosId, number>;

const DEFAULT_ALLOC: Alloc = {
  QB: 4.0,
  RB: 1.8,
  WR: 3.6,
  TE: 1.4,
  OL: 5.2,
  DL: 5.0,
  LB: 3.5,
  DB: 4.5,
  ST: 1.0,
};

const PEER_BAND = 3;
const TOTAL_MIN = 8;
const TOTAL_MAX = 55;
const POS_MAX = 25;

type Action =
  | { type: "setPos"; id: PosId; value: number; locked: boolean }
  | { type: "setTotal"; value: number }
  | { type: "reset" };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tenths(n: number): number {
  return Math.round(n * 10);
}

function fromTenths(t: number): number {
  return t / 10;
}

function sumAlloc(a: Alloc): number {
  return fromTenths(POSITIONS.reduce((s, p) => s + tenths(a[p.id]), 0));
}

function apportionTenths(
  ids: PosId[],
  weights: Record<PosId, number>,
  totalTenths: number,
): Record<PosId, number> {
  const out = {} as Record<PosId, number>;
  if (ids.length === 0) return out;
  if (totalTenths <= 0) {
    ids.forEach((id) => {
      out[id] = 0;
    });
    return out;
  }
  const weightSum = ids.reduce((s, id) => s + Math.max(0, weights[id]), 0);
  if (weightSum <= 0) {
    ids.forEach((id, i) => {
      out[id] = i === 0 ? totalTenths : 0;
    });
    return out;
  }
  const raw = ids.map((id) => (Math.max(0, weights[id]) / weightSum) * totalTenths);
  const floors = raw.map((x) => Math.floor(x + 1e-9));
  let leftover = totalTenths - floors.reduce((s, n) => s + n, 0);
  const order = ids
    .map((id, i) => ({ id, frac: raw[i] - floors[i], w: weights[id] }))
    .sort((x, y) => y.frac - x.frac || y.w - x.w);
  ids.forEach((id, i) => {
    out[id] = floors[i];
  });
  for (let k = 0; leftover > 0 && k < order.length; k++) {
    out[order[k].id] += 1;
    leftover -= 1;
  }
  if (leftover > 0) out[ids[0]] += leftover;
  return out;
}

function scaleAlloc(a: Alloc, target: number): Alloc {
  const currentTenths = POSITIONS.reduce((s, p) => s + tenths(a[p.id]), 0);
  if (currentTenths <= 0) return { ...DEFAULT_ALLOC };
  const weights = {} as Record<PosId, number>;
  POSITIONS.forEach((p) => {
    weights[p.id] = a[p.id];
  });
  const parts = apportionTenths(
    POSITIONS.map((p) => p.id),
    weights,
    tenths(target),
  );
  const next = { ...a };
  POSITIONS.forEach((p) => {
    next[p.id] = fromTenths(parts[p.id]);
  });
  return next;
}

function setPosKeepingTotal(a: Alloc, id: PosId, value: number): Alloc {
  const totalTenths = POSITIONS.reduce((s, p) => s + tenths(a[p.id]), 0);
  const newTenths = Math.min(Math.min(tenths(POS_MAX), totalTenths), Math.max(0, tenths(value)));
  const others = POSITIONS.map((p) => p.id).filter((oid) => oid !== id);
  const weights = {} as Record<PosId, number>;
  others.forEach((oid) => {
    weights[oid] = a[oid];
  });
  const parts = apportionTenths(others, weights, totalTenths - newTenths);
  const next = { ...a, [id]: fromTenths(newTenths) };
  others.forEach((oid) => {
    next[oid] = fromTenths(parts[oid]);
  });
  return next;
}

function reducer(state: Alloc, action: Action): Alloc {
  switch (action.type) {
    case "setPos":
      if (action.locked) return setPosKeepingTotal(state, action.id, action.value);
      return {
        ...state,
        [action.id]: round1(Math.min(POS_MAX, Math.max(0, action.value))),
      };
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

function unitTotal(a: Alloc, unit: string): number {
  return round1(
    POSITIONS.filter((p) => p.unit === unit).reduce((s, p) => s + a[p.id], 0),
  );
}

type Props = {
  teams: Team[];
  meta: Meta;
};

export function BuildRoster({ teams, meta }: Props) {
  const [alloc, dispatch] = useReducer(reducer, DEFAULT_ALLOC);
  const [locked, setLocked] = useState(true);
  const [selected, setSelected] = useState<PosId>("QB");
  const total = sumAlloc(alloc);
  const expected = meta.moneyballModel.intercept + meta.moneyballModel.slope * total;
  const selectedMeta = POSITIONS.find((p) => p.id === selected)!;
  const sliderMax = locked ? Math.max(alloc[selected], total) : POS_MAX;

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

  function nudge(delta: number) {
    dispatch({
      type: "setPos",
      id: selected,
      value: alloc[selected] + delta,
      locked,
    });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">
              Your budget
            </p>
            <p className="font-mono text-4xl font-medium text-obsidian">${total.toFixed(1)}M</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate">
              Off {unitTotal(alloc, "Offense").toFixed(1)} · Def{" "}
              {unitTotal(alloc, "Defense").toFixed(1)} · ST {unitTotal(alloc, "Special teams").toFixed(1)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              aria-pressed={locked}
              className={`border px-3 py-1.5 text-xs font-medium uppercase tracking-wider ${
                locked
                  ? "border-obsidian bg-obsidian text-white"
                  : "border-stone text-slate hover:border-obsidian hover:text-obsidian"
              }`}
            >
              {locked ? "Budget locked" : "Lock budget"}
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "reset" });
                setLocked(true);
                setSelected("QB");
              }}
              className="border border-stone px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-slate hover:border-obsidian hover:text-obsidian"
            >
              Reset
            </button>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate">
            {locked ? "Set locked total" : "Scale total"}
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
        <p className="mt-2 text-xs text-slate">
          {locked
            ? "Moving a position takes from the rest of the roster so the total stays put."
            : "Unlocked: raising a position increases the overall budget."}
        </p>

        <div className="mt-8">
          <RosterFormation selected={selected} alloc={alloc} onSelect={setSelected} />
        </div>

        <div className="mt-6 border border-stone p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-xl font-bold uppercase text-obsidian">
              {selectedMeta.label}
            </p>
            <p className="font-mono text-lg text-obsidian">${alloc[selected].toFixed(1)}M</p>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-slate">{selectedMeta.unit}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => nudge(-0.1)}
              className="border border-stone px-2 py-1 font-mono text-sm hover:border-obsidian"
              aria-label="Decrease group"
            >
              −
            </button>
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={0.1}
              value={Math.min(alloc[selected], sliderMax)}
              onChange={(e) =>
                dispatch({
                  type: "setPos",
                  id: selected,
                  value: Number(e.target.value),
                  locked,
                })
              }
              className="w-full accent-[#DBFF00]"
              aria-label={`${selectedMeta.label} allocation`}
            />
            <button
              type="button"
              onClick={() => nudge(0.1)}
              className="border border-stone px-2 py-1 font-mono text-sm hover:border-obsidian"
              aria-label="Increase group"
            >
              +
            </button>
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate">
          Field is 11-on-11 in 11 personnel (X/Y/Z receivers, HB) and a 4–3 front, plus
          returners and specialists. Same-color chips share one group pool — all five OL
          spots are one OL budget. Splits are a planning sketch, not Athletic data. Expected
          wins use {meta.moneyballModel.formula}.
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
