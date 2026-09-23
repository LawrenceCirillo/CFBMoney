"use client";

import { useEffect, useState } from "react";
import ProgramSelect from "@/components/ProgramSelect";
import TeamMark from "@/components/TeamMark";
import { comparePath } from "@/lib/compare";
import { data } from "@/lib/data";
import { fmtGap, fmtPollDate, fmtPollRank, fmtRange } from "@/lib/format";

export default function CompareBoard({ initialA, initialB }: { initialA: string; initialB: string }) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setA(initialA);
    setB(initialB);
  }, [initialA, initialB]);

  const A = data.teams.find((t) => t.slug === a) ?? data.teams[0];
  const B = data.teams.find((t) => t.slug === b) ?? data.teams[1];

  useEffect(() => {
    document.title = `${A.name} vs ${B.name} · CFB Money`;
  }, [A.name, B.name]);

  const rows = [
    { label: "Roster budget", fa: fmtRange(A.budget_low_m, A.budget_high_m), fb: fmtRange(B.budget_low_m, B.budget_high_m) },
    { label: "Spend rank", fa: `#${A.spend_rank}`, fb: `#${B.spend_rank}` },
    { label: `AP through week ${data.poll.week}`, fa: fmtPollRank(A.ap_rank), fb: fmtPollRank(B.ap_rank) },
    { label: "Preseason AP", fa: fmtPollRank(A.preseason_rank), fb: fmtPollRank(B.preseason_rank) },
    { label: `Value vs. week ${data.poll.week}`, fa: A.value_gap != null ? fmtGap(A.value_gap) : "—", fb: B.value_gap != null ? fmtGap(B.value_gap) : "—" },
    { label: "Conference", fa: A.conference, fb: B.conference },
    { label: "ESPN SOS, played", fa: `#${A.sos_played_rank}`, fb: `#${B.sos_played_rank}` },
    { label: "ESPN SOS, remaining", fa: `#${A.sos_remaining_rank}`, fb: `#${B.sos_remaining_rank}` },
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

      <div className="mt-8 grid max-w-xl grid-cols-2 gap-3">
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
        <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-line bg-panel/60 px-4 py-3 text-sm font-bold">
          <span />
          <span className="flex items-center gap-2" style={{ color: A.color }}>
            <TeamMark slug={A.slug} name={A.name} abbr={A.abbr} color={A.color} size="sm" />
            {A.name}
          </span>
          <span className="flex items-center gap-2" style={{ color: B.color }}>
            <TeamMark slug={B.slug} name={B.name} abbr={B.abbr} color={B.color} size="sm" />
            {B.name}
          </span>
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            className="tnum grid grid-cols-[1fr_1fr_1fr] border-b border-line/60 px-4 py-3 text-sm last:border-0"
          >
            <span className="text-fog">{r.label}</span>
            <span>{r.fa}</span>
            <span>{r.fb}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-xs text-fog">
        ESPN FPI ranks among FBS as of {fmtPollDate(data.fpi.as_of)}. 1 is the hardest schedule.
        Played is games already played. Remaining is games left.
      </p>
    </div>
  );
}
