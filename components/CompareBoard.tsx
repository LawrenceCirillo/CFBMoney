"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProgramSelect from "@/components/ProgramSelect";
import TeamMark from "@/components/TeamMark";
import { comparePath } from "@/lib/compare";
import { data } from "@/lib/data";
import { fmtGap, fmtM, fmtPollDate, fmtPollRank, fmtRange } from "@/lib/format";
import { budgetRangeOverlap, recordLabel, savedWeekLabel, type SourceStamp, type TeamContexts } from "@/lib/team-context";

function sourceDate(source: SourceStamp | null): string {
  return source ? `${source.name} · ${fmtPollDate(source.asOf)}` : "Source date unavailable";
}

export default function CompareBoard({ initialA, initialB, contexts }: { initialA: string; initialB: string; contexts: TeamContexts }) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setA(initialA);
    setB(initialB);
  }, [initialA, initialB]);

  const A = data.teams.find((t) => t.slug === a) ?? data.teams[0];
  const B = data.teams.find((t) => t.slug === b) ?? data.teams[1];
  const ca = contexts.teams[A.slug];
  const cb = contexts.teams[B.slug];
  const week = ca?.savedWeek.week ?? cb?.savedWeek.week;
  const overlap = budgetRangeOverlap(A, B);
  const overlapLabel = overlap.kind === "disjoint" ? "Reported ranges do not overlap."
    : overlap.kind === "touch" ? `Ranges meet at ${fmtM(overlap.low)}.`
    : `Reported ranges overlap at ${fmtRange(overlap.low, overlap.high)}.`;

  useEffect(() => {
    document.title = `${A.name} vs ${B.name} · CFB Money`;
  }, [A.name, B.name]);

  const rows = [
    { label: "Roster budget", fa: fmtRange(A.budget_low_m, A.budget_high_m), fb: fmtRange(B.budget_low_m, B.budget_high_m) },
    { label: "Record", note: sourceDate(contexts.sources.record), fa: recordLabel(ca?.record), fb: recordLabel(cb?.record) },
    { label: week ? `Week ${week} result` : "Saved-week result", note: `${sourceDate(contexts.sources.score)} · Single saved score week`, fa: savedWeekLabel(ca?.savedWeek), fb: savedWeekLabel(cb?.savedWeek) },
    { label: "Spend rank", fa: `#${A.spend_rank}`, fb: `#${B.spend_rank}` },
    { label: `AP · Week ${data.poll.week}`, note: sourceDate(contexts.sources.poll), fa: fmtPollRank(A.ap_rank), fb: fmtPollRank(B.ap_rank) },
    { label: "Preseason AP", fa: fmtPollRank(A.preseason_rank), fb: fmtPollRank(B.preseason_rank) },
    { label: `Value vs. week ${data.poll.week}`, fa: A.value_gap != null ? fmtGap(A.value_gap) : "—", fb: B.value_gap != null ? fmtGap(B.value_gap) : "—" },
    { label: "Conference", fa: A.conference, fb: B.conference },
    { label: "ESPN SOS, played", fa: A.sos_played_rank == null ? "Unavailable" : `#${A.sos_played_rank}`, fb: B.sos_played_rank == null ? "Unavailable" : `#${B.sos_played_rank}` },
    { label: "ESPN SOS, remaining", fa: A.sos_remaining_rank == null ? "Unavailable" : `#${A.sos_remaining_rank}`, fb: B.sos_remaining_rank == null ? "Unavailable" : `#${B.sos_remaining_rank}` },
  ];

  function go(nextA: string, nextB: string) {
    setA(nextA);
    setB(nextB);
    setCopied(false);
    window.history.replaceState(null, "", comparePath(nextA, nextB));
  }

  async function copyLink() {
    const url = `${window.location.origin}${comparePath(a, b)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-xs font-semibold text-fog">Compare</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Settle the argument.</h1>

      <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
        <ProgramSelect label="First program" value={A.slug} onChange={(slug) => go(slug, B.slug)} />
        <ProgramSelect label="Second program" value={B.slug} onChange={(slug) => go(A.slug, slug)} />
      </div>
      <button
        type="button"
        onClick={copyLink}
        className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold text-paper"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>

      <div className="mt-6 max-w-3xl overflow-hidden rounded-xl border border-edge">
        <div className="grid grid-cols-2 gap-3 border-b border-line bg-panel/60 px-4 py-3 text-sm font-bold sm:grid-cols-[1fr_1fr_1fr]">
          <span className="hidden sm:block" />
          <Link href={`/team/${A.slug}`} data-compare-name={A.slug} className="flex min-w-0 items-center gap-2 break-words text-paper hover:underline focus-visible:outline-2 focus-visible:outline-paper">
            <TeamMark slug={A.slug} name={A.name} abbr={A.abbr} color={A.color} size="sm" />
            {A.name}
          </Link>
          <Link href={`/team/${B.slug}`} data-compare-name={B.slug} className="flex min-w-0 items-center gap-2 break-words text-paper hover:underline focus-visible:outline-2 focus-visible:outline-paper">
            <TeamMark slug={B.slug} name={B.name} abbr={B.abbr} color={B.color} size="sm" />
            {B.name}
          </Link>
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            data-compare-row={r.label}
            className="tnum grid grid-cols-2 gap-x-3 gap-y-1 border-b border-line/60 px-4 py-3 text-sm last:border-0 sm:grid-cols-[1fr_1fr_1fr]"
          >
            <span className="col-span-2 font-semibold text-fog sm:col-span-1 sm:font-normal">{r.label}{r.note && <span className="mt-1 block text-xs font-normal">{r.note}</span>}</span>
            <span className="min-w-0 break-words font-semibold sm:font-normal">{r.fa}</span>
            <span className="min-w-0 break-words font-semibold sm:font-normal">{r.fb}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-sm" data-budget-overlap>{overlapLabel} <span className="text-fog">These are reported budget estimates; overlap does not establish a precise payroll ordering or efficiency.</span></p>
      <p className="mt-3 max-w-3xl text-xs text-fog">
        {sourceDate(contexts.sources.fpi)}. FPI ranks among FBS; 1 is the hardest schedule.
        Played is games already played. Remaining is games left.
      </p>
    </div>
  );
}
