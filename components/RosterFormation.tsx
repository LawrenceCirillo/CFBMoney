"use client";

import type { ReactNode } from "react";

export type PosId = "QB" | "RB" | "WR" | "TE" | "OL" | "DL" | "LB" | "DB" | "ST";

type Slot = {
  label: string;
  group: PosId;
};

type Alloc = Record<PosId, number>;

function Chip({
  slot,
  selected,
  amount,
  onSelect,
}: {
  slot: Slot;
  selected: boolean;
  amount: number;
  onSelect: (id: PosId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.group)}
      aria-pressed={selected}
      aria-label={`${slot.label}, ${slot.group} group, $${amount.toFixed(1)} million`}
      className={`flex w-full max-w-[3.4rem] flex-col items-center border px-0.5 py-1 font-mono uppercase tracking-wide transition-colors ${
        selected
          ? "border-[#DBFF00] bg-[#DBFF00] text-obsidian"
          : "border-white/35 bg-obsidian/70 text-white hover:border-[#DBFF00]"
      }`}
    >
      <span className="text-[10px] font-medium leading-none">{slot.label}</span>
      <span className="mt-0.5 text-[9px] leading-none tabular-nums opacity-80">
        ${amount.toFixed(1)}
      </span>
    </button>
  );
}

function Empty() {
  return <div aria-hidden className="h-9 w-full max-w-[3.4rem]" />;
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-7 items-center justify-items-center gap-x-1 gap-y-3 sm:gap-x-2">
      {children}
    </div>
  );
}

function unitSum(alloc: Alloc, ids: PosId[]): number {
  return Math.round(ids.reduce((s, id) => s + alloc[id], 0) * 10) / 10;
}

export function RosterFormation({
  selected,
  alloc,
  onSelect,
}: {
  selected: PosId;
  alloc: Alloc;
  onSelect: (id: PosId) => void;
}) {
  const chip = (slot: Slot) => (
    <Chip
      key={slot.label}
      slot={slot}
      selected={selected === slot.group}
      amount={alloc[slot.group]}
      onSelect={onSelect}
    />
  );

  const offense = unitSum(alloc, ["QB", "RB", "WR", "TE", "OL"]);
  const defense = unitSum(alloc, ["DL", "LB", "DB"]);
  const special = alloc.ST;

  return (
    <div className="space-y-4">
      <Field label="Defense · 11" total={defense}>
        <Grid>
          {chip({ label: "LCB", group: "DB" })}
          <Empty />
          {chip({ label: "FS", group: "DB" })}
          <Empty />
          {chip({ label: "SS", group: "DB" })}
          <Empty />
          {chip({ label: "RCB", group: "DB" })}

          <Empty />
          {chip({ label: "LOLB", group: "LB" })}
          <Empty />
          {chip({ label: "MLB", group: "LB" })}
          <Empty />
          {chip({ label: "ROLB", group: "LB" })}
          <Empty />

          <Empty />
          {chip({ label: "LDE", group: "DL" })}
          {chip({ label: "LDT", group: "DL" })}
          <Empty />
          {chip({ label: "RDT", group: "DL" })}
          {chip({ label: "RDE", group: "DL" })}
          <Empty />
        </Grid>
      </Field>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#DBFF00]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">LOS</span>
        <div className="h-px flex-1 bg-[#DBFF00]" />
      </div>

      <Field label="Offense · 11" total={offense}>
        <Grid>
          {chip({ label: "X", group: "WR" })}
          {chip({ label: "LT", group: "OL" })}
          {chip({ label: "LG", group: "OL" })}
          {chip({ label: "C", group: "OL" })}
          {chip({ label: "RG", group: "OL" })}
          {chip({ label: "RT", group: "OL" })}
          {chip({ label: "Z", group: "WR" })}

          <Empty />
          <Empty />
          <Empty />
          <Empty />
          <Empty />
          {chip({ label: "TE", group: "TE" })}
          <Empty />

          <Empty />
          <Empty />
          <Empty />
          {chip({ label: "QB", group: "QB" })}
          <Empty />
          <Empty />
          <Empty />

          <Empty />
          <Empty />
          {chip({ label: "Y", group: "WR" })}
          <Empty />
          {chip({ label: "HB", group: "RB" })}
          <Empty />
          <Empty />
        </Grid>
      </Field>

      <Field label="Special teams" total={special}>
        <Grid>
          <Empty />
          {chip({ label: "KR", group: "ST" })}
          <Empty />
          <Empty />
          <Empty />
          {chip({ label: "PR", group: "ST" })}
          <Empty />

          <Empty />
          <Empty />
          <Empty />
          {chip({ label: "LS", group: "ST" })}
          <Empty />
          <Empty />
          <Empty />

          <Empty />
          <Empty />
          {chip({ label: "K", group: "ST" })}
          <Empty />
          {chip({ label: "P", group: "ST" })}
          <Empty />
          <Empty />
        </Grid>
      </Field>
    </div>
  );
}

function Field({
  label,
  total,
  children,
}: {
  label: string;
  total: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative border border-obsidian px-2 py-6 sm:px-4"
      style={{
        backgroundColor: "#0F172A",
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0 26px, rgba(226,232,240,0.12) 26px 27px)",
      }}
    >
      <div className="absolute left-3 right-3 top-2 flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-stone/80">{label}</p>
        <p className="font-mono text-[10px] tabular-nums text-stone/80">${total.toFixed(1)}M</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
