"use client";

import { useMemo, useState } from "react";
import {
  POSITION_GROUPS,
  GAME_BUDGET_MIN_M,
  GAME_BUDGET_MAX_M,
  allocationFromPlaysheet,
  cappedOptimalAllocation,
  clampGameBudget,
  clampPlaysheetToBudget,
  distributeAllocationToSlots,
  emptyPlaysheet,
  ratingsFromAllocation,
  requiredStarterSpendM,
  setPlaysheetPosition,
  slotMarketCap,
  type PositionKey,
  type Playsheet,
  type PlaysheetKey,
} from "@/lib/simulator";
import { fmtM, fmtMoney1 } from "@/lib/format";
import { data } from "@/lib/data";
import { bookStanding } from "@/lib/spend-rank";
import { gravityTags } from "@/lib/gravity";

interface Props {
  pos: Playsheet;
  setPos: (p: Playsheet) => void;
  budgetM: number;
  programSlug: string;
  gravityOn: boolean;
  setBudgetM: (n: number) => void;
  onNext: () => void;
}

interface FieldPosition {
  key: PlaysheetKey;
  label: string;
  short: string;
  group: PositionKey;
  side: "off" | "def" | "st";
  /** formation coords, 0–100 (x left→right, y top→bottom, LOS at y=50) */
  x: number;
  y: number;
}

/** Spread offense (shotgun) vs 4-2-5 nickel — 11 on each side, like a play sheet. */
const POSITIONS: FieldPosition[] = [
  // offense
  { key: "LT", label: "Left Tackle", short: "LT", group: "OL", side: "off", x: 22, y: 62 },
  { key: "LG", label: "Left Guard", short: "LG", group: "OL", side: "off", x: 36, y: 60 },
  { key: "C", label: "Center", short: "C", group: "OL", side: "off", x: 50, y: 59 },
  { key: "RG", label: "Right Guard", short: "RG", group: "OL", side: "off", x: 64, y: 60 },
  { key: "RT", label: "Right Tackle", short: "RT", group: "OL", side: "off", x: 78, y: 62 },
  { key: "TE", label: "Tight End", short: "TE", group: "WR", side: "off", x: 92, y: 64 },
  { key: "XWR", label: "X Receiver", short: "X", group: "WR", side: "off", x: 8, y: 48 },
  { key: "ZWR", label: "Z Receiver", short: "Z", group: "WR", side: "off", x: 92, y: 48 },
  { key: "SLOT", label: "Slot Receiver", short: "SL", group: "WR", side: "off", x: 8, y: 70 },
  { key: "QB", label: "Quarterback", short: "QB", group: "QB", side: "off", x: 50, y: 76 },
  { key: "RB", label: "Running Back", short: "RB", group: "RB", side: "off", x: 32, y: 80 },
  // defense
  { key: "ED1", label: "Edge Rusher", short: "ED", group: "DL", side: "def", x: 22, y: 39 },
  { key: "DT1", label: "Defensive Tackle", short: "DT", group: "DL", side: "def", x: 38, y: 42 },
  { key: "DT2", label: "Defensive Tackle", short: "DT", group: "DL", side: "def", x: 62, y: 42 },
  { key: "ED2", label: "Edge Rusher", short: "ED", group: "DL", side: "def", x: 78, y: 39 },
  { key: "LB1", label: "Linebacker", short: "LB", group: "LB", side: "def", x: 36, y: 27 },
  { key: "LB2", label: "Linebacker", short: "LB", group: "LB", side: "def", x: 64, y: 27 },
  { key: "NKL", label: "Nickelback", short: "NK", group: "DB", side: "def", x: 12, y: 28 },
  { key: "CB1", label: "Cornerback", short: "CB", group: "DB", side: "def", x: 8, y: 16 },
  { key: "CB2", label: "Cornerback", short: "CB", group: "DB", side: "def", x: 92, y: 16 },
  { key: "SS", label: "Strong Safety", short: "SS", group: "DB", side: "def", x: 34, y: 10 },
  { key: "FS", label: "Free Safety", short: "FS", group: "DB", side: "def", x: 66, y: 10 },
  // special teams lives on the sideline, not the formation
  { key: "ST", label: "Special Teams", short: "ST", group: "ST", side: "st", x: -1, y: -1 },
];

const FIELD = POSITIONS.filter((p) => p.side !== "st");
const toDimes = (m: number) => Math.round(m * 10);
const fromDimes = (d: number) => d / 10;
const totalDimes = (p: Playsheet) =>
  POSITIONS.reduce((s, q) => s + toDimes(p[q.key] ?? 0), 0);

/** Left-to-right, then top-to-bottom on the sheet — not definition order (TE sits before X in POSITIONS). */
function membersOfGroup(group: PositionKey): FieldPosition[] {
  return POSITIONS.filter((p) => p.group === group).sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });
}

function nextKeyInGroup(group: PositionKey, current: PlaysheetKey): PlaysheetKey | undefined {
  const members = membersOfGroup(group);
  if (members.length === 0) return undefined;
  const idx = members.findIndex((p) => p.key === current);
  return members[idx === -1 ? 0 : (idx + 1) % members.length].key;
}

export default function BuildRoster({ pos, setPos, budgetM, programSlug, gravityOn, setBudgetM, onNext }: Props) {
  const [selected, setSelected] = useState<PlaysheetKey>("QB");

  const budget = clampGameBudget(budgetM);
  const budgetD = Math.round(budget * 10);
  const spentD = totalDimes(pos);
  const targetD = toDimes(requiredStarterSpendM(budget));
  const remainingD = targetD - spentD;
  const spent = fromDimes(spentD);
  const remaining = fromDimes(Math.max(0, remainingD));
  const depthReserve = fromDimes(budgetD - targetD);
  const canContinue = remainingD === 0;
  const groups = useMemo(() => allocationFromPlaysheet(pos), [pos]);
  const ratings = useMemo(() => ratingsFromAllocation(groups, { programSlug, gravityOn }), [groups, programSlug, gravityOn]);
  const tags = gravityOn ? gravityTags(programSlug) : [];
  const standing = useMemo(() => bookStanding(budget, data.teams), [budget]);
  const sel = POSITIONS.find((p) => p.key === selected)!;
  const selCap = slotMarketCap(sel.key);
  const selVal = pos[sel.key] ?? 0;

  const commit = (next: Playsheet) => setPos(next);

  /**
   * The budget mechanic: a slider can always grow up to its market cap.
   * Money beyond the unspent remainder is pulled from the other positions
   * (largest-remainder, integer dimes). The chosen book is never breached.
   */
  const setPosition = (key: PlaysheetKey, v: number) => {
    commit(setPlaysheetPosition(pos, budget, key, v));
  };

  const changeBudget = (raw: number) => {
    const nextBudget = clampGameBudget(raw);
    if (nextBudget === budget) return;
    const fitted = clampPlaysheetToBudget(pos, nextBudget);
    setBudgetM(nextBudget);
    commit(fitted);
  };

  const optimize = () =>
    commit(distributeAllocationToSlots(cappedOptimalAllocation(budget, { programSlug, gravityOn })));
  const reset = () => {
    commit(emptyPlaysheet());
  };

  const groupStrip = (className: string) => (
    <div className={className}>
      {POSITION_GROUPS.map((g) => {
        const members = membersOfGroup(g.key);
        const active = sel.group === g.key;
        return (
          <button
            key={g.key}
            type="button"
            aria-label={
              members.length > 1
                ? `${g.label}, cycle ${members.map((p) => p.short).join(", ")}`
                : g.label
            }
            onClick={() => {
              setSelected((current) => nextKeyInGroup(g.key, current) ?? current);
            }}
            className={`bg-ink px-2 py-2.5 text-left transition-ui ${active ? "bg-panel" : "hover:bg-panel/60"}`}
          >
            <p className="text-[10px] font-semibold text-fog">{g.key}</p>
            {tags.some((tag) => tag.group === g.key) && <span className="text-[10px] font-semibold text-status-success">Gravity</span>}
            <p className="tnum mt-0.5 text-sm font-black">{fmtMoney1(groups[g.key])}</p>
          </button>
        );
      })}
    </div>
  );

  const editor = (
    <>
      <p className="hidden text-xs font-semibold text-fog lg:block">
        {sel.side === "off" ? "Offense" : sel.side === "def" ? "Defense" : "Special teams"} ·{" "}
        {POSITION_GROUPS.find((g) => g.key === sel.group)?.label}
      </p>
      <h3 className="text-lg font-black tracking-tight lg:mt-2 lg:text-2xl">{sel.label}</h3>
      {tags.some((tag) => tag.group === sel.group) && (
        <p className="mt-1 text-xs font-semibold text-status-success">
          {fmtMoney1(groups[sel.group])} → plays like {fmtMoney1(groups[sel.group] * (1 + tags.find((tag) => tag.group === sel.group)!.gravity))}
        </p>
      )}
      <div className="mt-2 flex items-center justify-center gap-2 lg:mt-3">
        <button
          onClick={() => setPosition(sel.key, selVal - 0.5)}
          disabled={selVal <= 0}
          aria-label={`Decrease ${sel.label} spend`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg font-bold text-paper transition-ui hover:border-fog disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <span className="tnum min-w-[6.5rem] text-center text-3xl font-black whitespace-nowrap">
          {fmtMoney1(selVal)}
        </span>
        <button
          onClick={() => setPosition(sel.key, selVal + 0.5)}
          disabled={selVal >= selCap}
          aria-label={`Increase ${sel.label} spend`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg font-bold text-paper transition-ui hover:border-fog disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={selCap}
        step={0.1}
        value={selVal}
        onChange={(e) => setPosition(sel.key, Number(e.target.value))}
        className="mt-3 w-full"
        aria-label={`${sel.label} spend in millions`}
      />
      <div className="tnum mt-1 flex justify-between text-xs text-fog">
        <span>$0</span>
        <span>{fmtMoney1(selCap)} market cap</span>
      </div>
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-fog">
            Playsheet · tap a position to allocate
          </p>
          {tags.length > 0 && (
            <p className="text-xs text-fog">
              Gravity preview for {data.teams.find((team) => team.slug === programSlug)?.name ?? programSlug}: {tags.map((tag) => `${tag.group} +${Math.round(tag.gravity * 100)}%`).join(" · ")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={optimize}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              Auto-optimize
            </button>
            <button
              onClick={reset}
              className="rounded-full border border-line px-4 py-2 text-sm text-fog transition-ui hover:border-fog hover:text-paper"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="relative w-full overflow-hidden rounded-xl border border-edge bg-panel/30 max-lg:aspect-[4/5] lg:h-[calc(100dvh-16rem)]">
          <div className="absolute inset-3 sm:inset-4 lg:bottom-[3.75rem]">
            {[14, 28, 42, 58, 72, 86].map((y) => (
              <div
                key={y}
                className="absolute left-0 right-0 border-t border-line/50"
                style={{ top: `${y}%` }}
              />
            ))}
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-line"
              style={{ top: "50%" }}
            />
            <p className="pointer-events-none absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold text-fog/70">
              LOS
            </p>

            {FIELD.map((p) => {
              const isSel = p.key === selected;
              const val = pos[p.key] ?? 0;
              return (
                <button
                  key={p.key}
                  onClick={() => setSelected(p.key)}
                  aria-label={`${p.label}, ${fmtMoney1(val)}`}
                  aria-current={isSel ? "true" : undefined}
                  className={`group no-press absolute z-0 -translate-x-1/2 -translate-y-1/2 ${isSel ? "z-10" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <span
                    className={`flex h-8 w-8 flex-col items-center justify-center rounded-full leading-none transition-transform sm:h-11 sm:w-11 ${
                      p.side === "off"
                        ? "bg-emerald-500 text-ink"
                        : "bg-sky-500 text-ink"
                    } ${isSel ? "scale-110 ring-2 ring-paper ring-offset-2 ring-offset-ink" : "group-hover:scale-105"} ${val === 0 ? "opacity-45" : ""}`}
                  >
                    <span className="text-[8px] font-black tracking-wide sm:text-[10px]">
                      {p.short}
                    </span>
                    <span className="tnum mt-px text-[7px] font-bold sm:mt-0.5 sm:text-[9px]">
                      {val > 0 ? `$${val.toFixed(1)}` : "—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {groupStrip("absolute inset-x-0 bottom-0 hidden grid-cols-8 gap-px bg-line lg:grid")}
        </div>
        {groupStrip("mt-4 grid grid-cols-4 gap-px bg-line sm:grid-cols-8 lg:hidden")}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start lg:border-l lg:border-line lg:pl-6">
        <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-line max-lg:bg-ink/95 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:mb-5 lg:border-b lg:border-line lg:pb-4">
          {editor}
        </div>
        <p className="text-xs font-semibold text-fog">NIL book</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => changeBudget(budget - 1)}
            disabled={budget <= GAME_BUDGET_MIN_M}
            aria-label="Decrease roster budget"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg font-bold text-paper transition-ui hover:border-fog disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="tnum flex-1 text-center text-4xl font-black tracking-tight">{fmtM(budget)}</span>
          <button
            onClick={() => changeBudget(budget + 1)}
            disabled={budget >= GAME_BUDGET_MAX_M}
            aria-label="Increase roster budget"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg font-bold text-paper transition-ui hover:border-fog disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
        <input
          type="range"
          min={GAME_BUDGET_MIN_M}
          max={GAME_BUDGET_MAX_M}
          step={1}
          value={budget}
          onChange={(e) => changeBudget(Number(e.target.value))}
          className="mt-2 w-full"
          aria-label="Roster budget in millions"
        />
        <div className="tnum mt-1 flex justify-between text-xs text-fog">
          <span>{fmtM(GAME_BUDGET_MIN_M)}</span>
          <span>{fmtM(GAME_BUDGET_MAX_M)}</span>
        </div>
        <p className="mt-2 text-xs text-fog">
          <span className="font-semibold text-paper">
            #{standing.rank} of {standing.of}
          </span>
          {standing.tiedWith.length > 0
            ? ` · tied with ${standing.tiedWith.map((t) => t.name).join(" and ")}`
            : ` · nearest ${standing.nearest.name}`}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-px bg-line">
          <div className="bg-ink py-3 pr-3">
            <p className="text-[10px] font-semibold text-fog">Spent</p>
            <p className="tnum mt-0.5 text-2xl font-black tracking-tight">{fmtMoney1(spent)}</p>
          </div>
          <div className="bg-ink py-3 pl-3">
            <p className="text-[10px] font-semibold text-fog">Left to allocate</p>
            <p className="tnum mt-0.5 text-2xl font-black tracking-tight">{fmtMoney1(remaining)}</p>
          </div>
        </div>
        <p id="roster-budget-help" className="mt-2 text-xs text-fog" aria-live="polite">
          Spend {fmtMoney1(fromDimes(targetD))} on the playsheet to continue.
          {depthReserve > 0 ? ` The other ${fmtMoney1(depthReserve)} is reserved for depth.` : ""}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-px bg-line">
          {(
            [
              { label: "OFF", value: ratings.off, color: "#34d399" },
              { label: "DEF", value: ratings.def, color: "#60a5fa" },
              { label: "ST", value: ratings.st, color: "#a78bfa" },
            ] as const
          ).map((r) => (
            <div key={r.label} className="bg-ink px-2 py-2.5">
              <p className="text-[10px] font-semibold text-fog">{r.label}</p>
              <p className="tnum text-xl font-black">{r.value.toFixed(0)}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, r.value)}%`, background: r.color }}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => { if (canContinue) onNext(); }}
          disabled={!canContinue}
          aria-describedby="roster-budget-help"
          className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-lg font-bold text-ink transition-ui hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue
        </button>
      </aside>
    </div>
  );
}
