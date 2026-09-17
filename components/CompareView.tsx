"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Team } from "@/lib/types";
import {
  formatBudgetMid,
  formatBudgetRange,
  formatMillions,
  formatPct,
  formatRank,
  formatRecord,
  formatSigned,
} from "@/lib/format";

type Props = {
  teams: Team[];
  initialLeft?: string;
  initialRight?: string;
};

type Winner = "left" | "right" | "tie" | null;

type Row = {
  label: string;
  left: string;
  right: string;
  winner: Winner;
  note?: string;
};

function pick(teams: Team[], slug: string | undefined, fallback: string): Team {
  return teams.find((t) => t.slug === slug) ?? teams.find((t) => t.slug === fallback) ?? teams[0];
}

function compareNum(
  a: number | null | undefined,
  b: number | null | undefined,
  prefer: "higher" | "lower",
): Winner {
  if (a == null || b == null) return null;
  if (a === b) return "tie";
  if (prefer === "higher") return a > b ? "left" : "right";
  return a < b ? "left" : "right";
}

export function CompareView({ teams, initialLeft, initialRight }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  const [leftSlug, setLeftSlug] = useState(
    () => pick(teams, initialLeft, "texas").slug,
  );
  const [rightSlug, setRightSlug] = useState(
    () => pick(teams, initialRight, "ohio-state").slug,
  );

  const left = pick(teams, leftSlug, "texas");
  const right = pick(teams, rightSlug, "ohio-state");

  useEffect(() => {
    const next = `${pathname}?a=${left.slug}&b=${right.slug}`;
    router.replace(next, { scroll: false });
  }, [left.slug, right.slug, pathname, router]);

  const rows: Row[] = [
    {
      label: "Budget range",
      left: formatBudgetRange(left.budgetMin, left.budgetMax),
      right: formatBudgetRange(right.budgetMin, right.budgetMax),
      winner: null,
    },
    {
      label: "Budget mid",
      left: formatBudgetMid(left.budgetMid),
      right: formatBudgetMid(right.budgetMid),
      winner: null,
      note: "Modeling only — not audited payroll",
    },
    {
      label: "2025 record",
      left: formatRecord(left.record2025.wins, left.record2025.losses),
      right: formatRecord(right.record2025.wins, right.record2025.losses),
      winner: compareNum(left.record2025.wins, right.record2025.wins, "higher"),
    },
    {
      label: "Expected wins",
      left: left.moneyball.expectedWins2025.toFixed(2),
      right: right.moneyball.expectedWins2025.toFixed(2),
      winner: null,
    },
    {
      label: "WAE",
      left: formatSigned(left.moneyball.winsAboveExpected2025),
      right: formatSigned(right.moneyball.winsAboveExpected2025),
      winner: compareNum(
        left.moneyball.winsAboveExpected2025,
        right.moneyball.winsAboveExpected2025,
        "higher",
      ),
    },
    {
      label: "$/win (mid)",
      left: formatMillions(left.moneyball.dollarsPerWin2025MidM),
      right: formatMillions(right.moneyball.dollarsPerWin2025MidM),
      winner: compareNum(
        left.moneyball.dollarsPerWin2025MidM,
        right.moneyball.dollarsPerWin2025MidM,
        "lower",
      ),
      note: "Lower is more efficient only among teams with enough wins",
    },
    {
      label: "SP+ 2025",
      left: `${left.ratings.spPlus2025?.toFixed(1) ?? "—"} ${formatRank(left.ratings.spRank2025)}`,
      right: `${right.ratings.spPlus2025?.toFixed(1) ?? "—"} ${formatRank(right.ratings.spRank2025)}`,
      winner: compareNum(left.ratings.spPlus2025, right.ratings.spPlus2025, "higher"),
    },
    {
      label: "FPI 2025",
      left: `${left.ratings.fpi2025?.toFixed(1) ?? "—"} ${formatRank(left.ratings.fpiRank2025)}`,
      right: `${right.ratings.fpi2025?.toFixed(1) ?? "—"} ${formatRank(right.ratings.fpiRank2025)}`,
      winner: compareNum(left.ratings.fpi2025, right.ratings.fpi2025, "higher"),
    },
    {
      label: "Recruit rank 2025",
      left: formatRank(left.recruiting.rank2025),
      right: formatRank(right.recruiting.rank2025),
      winner: compareNum(left.recruiting.rank2025, right.recruiting.rank2025, "lower"),
    },
    {
      label: "Portal 2025 avg rating",
      left: left.portal["2025"]?.avgRating?.toFixed(3) ?? "—",
      right: right.portal["2025"]?.avgRating?.toFixed(3) ?? "—",
      winner: compareNum(
        left.portal["2025"]?.avgRating,
        right.portal["2025"]?.avgRating,
        "higher",
      ),
    },
    {
      label: "Portal 2025 4★+",
      left: String(
        (left.portal["2025"]?.stars4 ?? 0) + (left.portal["2025"]?.stars5 ?? 0),
      ),
      right: String(
        (right.portal["2025"]?.stars4 ?? 0) + (right.portal["2025"]?.stars5 ?? 0),
      ),
      winner: compareNum(
        (left.portal["2025"]?.stars4 ?? 0) + (left.portal["2025"]?.stars5 ?? 0),
        (right.portal["2025"]?.stars4 ?? 0) + (right.portal["2025"]?.stars5 ?? 0),
        "higher",
      ),
    },
    {
      label: "Knight athletic rev",
      left: left.knightNewhouse
        ? formatMillions(left.knightNewhouse.totalRevM, 1)
        : "MFRS not published",
      right: right.knightNewhouse
        ? formatMillions(right.knightNewhouse.totalRevM, 1)
        : "MFRS not published",
      winner: compareNum(
        left.knightNewhouse?.totalRevM,
        right.knightNewhouse?.totalRevM,
        "higher",
      ),
    },
    {
      label: "Roster mid % of rev",
      left: left.knightNewhouse
        ? formatPct(left.knightNewhouse.rosterAsPctOfTotalRev)
        : "MFRS not published",
      right: right.knightNewhouse
        ? formatPct(right.knightNewhouse.rosterAsPctOfTotalRev)
        : "MFRS not published",
      winner: compareNum(
        left.knightNewhouse?.rosterAsPctOfTotalRev,
        right.knightNewhouse?.rosterAsPctOfTotalRev,
        "lower",
      ),
      note: "Lower share of athletic revenue can mean more headroom",
    },
  ];

  function swap() {
    setLeftSlug(right.slug);
    setRightSlug(left.slug);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <TeamPicker
          id="compare-left"
          label="Team A"
          teams={sorted}
          value={left.slug}
          onChange={(slug) => {
            if (slug === rightSlug) swap();
            else setLeftSlug(slug);
          }}
        />
        <button
          type="button"
          onClick={swap}
          className="justify-self-center border border-stone px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate hover:text-obsidian hover:border-obsidian"
        >
          Swap
        </button>
        <TeamPicker
          id="compare-right"
          label="Team B"
          teams={sorted}
          value={right.slug}
          onChange={(slug) => {
            if (slug === leftSlug) swap();
            else setRightSlug(slug);
          }}
        />
      </div>

      <div className="mt-10 overflow-x-auto overflow-y-hidden rounded-xl border border-stone">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone bg-stone/40">
              <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-slate">
                Metric
              </th>
              <th className="px-3 py-3 text-right">
                <Link
                  href={`/team/${left.slug}`}
                  className="font-display text-lg font-bold uppercase text-obsidian hover:underline"
                >
                  {left.name}
                </Link>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate">
                  {left.conference}
                </div>
              </th>
              <th className="px-3 py-3 text-right">
                <Link
                  href={`/team/${right.slug}`}
                  className="font-display text-lg font-bold uppercase text-obsidian hover:underline"
                >
                  {right.name}
                </Link>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate">
                  {right.conference}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-stone/20"}>
                <th className="px-3 py-3 text-left font-medium text-slate align-top">
                  {row.label}
                  {row.note ? (
                    <div className="mt-0.5 text-[10px] font-normal leading-snug text-slate/80">
                      {row.note}
                    </div>
                  ) : null}
                </th>
                <td className={`px-3 py-3 text-right font-mono align-top ${cellClass(row.winner, "left")}`}>
                  {row.left}
                </td>
                <td className={`px-3 py-3 text-right font-mono align-top ${cellClass(row.winner, "right")}`}>
                  {row.right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellClass(winner: Winner, side: "left" | "right"): string {
  if (winner === side) return "text-obsidian font-medium shadow-[inset_3px_0_0_0_#DBFF00]";
  if (winner === "tie" || winner == null) return "text-obsidian";
  return "text-slate";
}

function TeamPicker({
  id,
  label,
  teams,
  value,
  onChange,
}: {
  id: string;
  label: string;
  teams: Team[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-stone bg-white px-3 py-2 text-sm text-obsidian"
      >
        {teams.map((team) => (
          <option key={team.slug} value={team.slug}>
            {team.name} · {team.conference}
          </option>
        ))}
      </select>
    </label>
  );
}
