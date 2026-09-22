import Link from "next/link";
import type { TeamEfficiency } from "@/lib/moneyball";
import { fmtRange, fmtMoney2 } from "@/lib/format";
import TeamMark from "@/components/TeamMark";

/**
 * All 68 programs ranked by modeled $/expected win, cheapest first.
 * Budgets near the $30M sweet spot float to the top; the poorest
 * (too few wins) and the richest (diminishing returns) sink.
 */
export default function EfficiencyTable({ rows }: { rows: TeamEfficiency[] }) {
  const max = Math.max(...rows.map((r) => r.costPerWin));
  return (
    <div>
      {rows.map((r, i) => (
        <Link
          key={r.team.slug}
          href={`/team/${r.team.slug}`}
          className="group grid grid-cols-[2.5rem_1.75rem_1fr_auto] items-center gap-3 border-b border-line/60 px-2 py-2.5 hover:bg-panel/60 sm:grid-cols-[2.5rem_1.75rem_1fr_10rem_6rem_8rem]"
        >
          <span className="tnum text-sm text-fog">{String(i + 1).padStart(2, "0")}</span>
          <TeamMark slug={r.team.slug} name={r.team.name} abbr={r.team.abbr} color={r.team.color} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold group-hover:underline" title={r.team.name}>
              {r.team.name}
            </span>
            <span className="mt-1 block h-1 bg-panel sm:hidden">
              <span
                className="block h-full bg-fog"
                style={{ width: `${(r.costPerWin / max) * 100}%` }}
              />
            </span>
          </span>
          <span className="tnum hidden text-right text-sm text-fog sm:block">
            {fmtRange(r.team.budget_low_m, r.team.budget_high_m)}
          </span>
          <span className="tnum hidden text-right text-sm text-fog sm:block">
            {r.wins.toFixed(1)} wins
          </span>
          <span className="tnum text-right text-sm font-extrabold">
            {fmtMoney2(r.costPerWin)}
            <span className="mt-1 hidden h-1 bg-panel sm:block">
              <span
                className="block h-full bg-fog"
                style={{ width: `${(r.costPerWin / max) * 100}%` }}
              />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
