import React from "react";
import Link from "next/link";
import TeamMark from "@/components/TeamMark";
import { fmtGap, fmtMoney2, fmtRange } from "@/lib/format";
import type { MoneyballTeam } from "@/lib/moneyball-insights";

export function CostPerWin({ value, showCaveat = true }: { value: number | null; showCaveat?: boolean }) {
  return (
    <span className="block text-xs leading-relaxed text-fog">
      <span className="tabular-nums">{value == null ? "No wins yet" : `${fmtMoney2(value)} / win`}</span>
      {showCaveat && <span className="block">midpoint · partial-season</span>}
    </span>
  );
}

export function MoneyStats({ fact }: { fact: MoneyballTeam }) {
  const { team, record, costPerWinM } = fact;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
      <div><dt className="text-xs text-fog">Estimated budget</dt><dd className="mt-1 font-bold tabular-nums">{fmtRange(team.budget_low_m, team.budget_high_m)}</dd></div>
      <div><dt className="text-xs text-fog">Record</dt><dd className="mt-1 font-bold tabular-nums">{record}</dd></div>
      <div className="col-span-2"><dt className="sr-only">Crude cost per win</dt><dd><CostPerWin value={costPerWinM} /></dd></div>
      <div><dt className="text-xs text-fog">AP / spend rank</dt><dd className="mt-1 font-bold tabular-nums">{team.ap_rank == null ? "Unranked" : `#${team.ap_rank}`} / #{team.spend_rank}</dd></div>
      <div><dt className="text-xs text-fog">Played SOS rank</dt><dd className="mt-1 font-bold tabular-nums">#{team.sos_played_rank}</dd></div>
    </dl>
  );
}

export function Spotlight({ title, teams, featured = false }: { title: string; teams: MoneyballTeam[]; featured?: boolean }) {
  if (!teams.length) return null;
  return (
    <article aria-label={title} className={`rounded-2xl border border-line p-5 sm:p-8 ${featured ? "bg-panel/60 lg:col-span-2" : "bg-panel/30"}`}>
      <h2 className="text-sm font-semibold text-fog">{title}</h2>
      {teams.length > 1 && <p className="mt-2 text-xs text-fog">{teams.length} teams tied on this measure</p>}
      {teams.map((fact) => {
        const { team } = fact;
        return (
          <div key={team.slug} className={`mt-5 ${teams.length > 1 ? "border-t border-line pt-5" : ""} ${featured ? "grid items-center gap-6 sm:grid-cols-[1fr_1.5fr] lg:grid-cols-[1fr_1.5fr_1.4fr]" : ""}`}>
            <div>
              <p aria-label={`Rank gap ${fmtGap(team.value_gap!)}`} className={`whitespace-nowrap font-black leading-none tracking-tight tabular-nums ${featured ? "text-8xl sm:text-9xl" : "text-5xl"}`}>{fmtGap(team.value_gap!)}</p>
              <p className="mt-2 text-xs text-fog">Rank gap · spend minus AP</p>
            </div>
            <div className={featured ? "" : "mt-5"}>
              <Link href={`/team/${team.slug}`} className={`inline-flex items-center gap-3 font-black hover:underline ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`}>
                <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size={featured ? "xl" : "lg"} />
                {team.name}
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-fog">AP #{team.ap_rank} versus spend #{team.spend_rank}: {Math.abs(team.value_gap!)} rank places apart.</p>
            </div>
            <div className={featured ? "border-t border-line pt-5 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" : "mt-5 border-t border-line pt-5"}>
              <MoneyStats fact={fact} />
            </div>
          </div>
        );
      })}
    </article>
  );
}
