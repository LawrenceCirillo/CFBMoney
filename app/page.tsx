"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { data, rankedTeams } from "@/lib/data";
import { fmtGap, fmtRange, fmtTotal, fmtPollDate } from "@/lib/format";
import TeamBars, { type BarDatum } from "@/components/TeamBars";
import TeamMark from "@/components/TeamMark";
import { weekLine } from "@/lib/scores";

type Metric = "spend" | "value" | "poll";

const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: "spend", label: "Roster spend", hint: "Estimated 2026 budget, high to low." },
  { key: "value", label: "Value vs. ranking", hint: `Spots the AP has them ahead (+) or behind (−) of their spend rank, through Week ${data.poll.week}.` },
  { key: "poll", label: "AP Top 25", hint: `The Week ${data.poll.week} ballot, 1 through 25. The number is their spend rank, and the line is how far they moved since the preseason poll.` },
];

type Tone = "up" | "down" | "neutral";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "up":
      return "text-up";
    case "down":
      return "text-down";
    case "neutral":
      return "";
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

function pollMove(preseason: number | null, ap: number): string {
  if (preseason == null) return "Entered the ballot";
  const delta = preseason - ap;
  if (delta > 0) return `Up ${delta} from preseason #${preseason}`;
  if (delta < 0) return `Down ${-delta} from preseason #${preseason}`;
  return `Same spot as preseason #${preseason}`;
}

export default function Home() {
  const [metric, setMetric] = useState<Metric>("spend");

  const bars: BarDatum[] = useMemo(() => {
    switch (metric) {
      case "spend": {
        const max = Math.max(...data.teams.map((t) => t.budget_mid_m));
        return data.teams.map((t) => ({
          slug: t.slug,
          name: t.name,
          abbr: t.abbr,
          color: t.color,
          frac: t.budget_mid_m / max,
          value: fmtRange(t.budget_low_m, t.budget_high_m),
          sub: `#${t.spend_rank} nationally by spending`,
        }));
      }
      case "value": {
        const ranked = rankedTeams();
        const maxGap = Math.max(...ranked.map((t) => Math.abs(t.value_gap!)));
        return [...ranked]
          .sort((a, b) => b.value_gap! - a.value_gap!)
          .map((t) => ({
            slug: t.slug,
            name: t.name,
            abbr: t.abbr,
            color: t.color,
            barColor: t.value_gap! > 0 ? "#22c55e" : t.value_gap! < 0 ? "#ef4444" : "var(--chart-dim)",
            frac: Math.abs(t.value_gap!) / maxGap,
            value: fmtGap(t.value_gap!),
            sub: `AP #${t.ap_rank} through week ${data.poll.week} · spends like #${t.spend_rank}`,
          }));
      }
      case "poll": {
        const field = data.teams.length;
        return rankedTeams()
          .sort((a, b) => a.ap_rank! - b.ap_rank!)
          .map((t) => ({
            slug: t.slug,
            name: t.name,
            abbr: t.abbr,
            color: t.color,
            frac: (field - t.spend_rank + 1) / field,
            value: `spend #${t.spend_rank}`,
            sub: pollMove(t.preseason_rank, t.ap_rank!),
          }));
      }
      default: {
        const _exhaustive: never = metric;
        return _exhaustive;
      }
    }
  }, [metric]).map((row) => {
    const line = weekLine(row.slug);
    return { ...row, result: line?.label, won: line?.won };
  });

  const ranked = useMemo(rankedTeams, []);
  const biggest = data.teams[0];
  const bestValue = [...ranked].sort((a, b) => b.value_gap! - a.value_gap!)[0];
  const worstValue = [...ranked].sort((a, b) => a.value_gap! - b.value_gap!)[0];
  const elite = [...ranked]
    .filter((t) => t.ap_rank! <= 5)
    .sort((a, b) => b.value_gap! - a.value_gap!)[0];

  const stories: { label: string; big: string; sub: string; slug: string; tone: Tone }[] = [
    { label: "Biggest spender", big: fmtRange(biggest.budget_low_m, biggest.budget_high_m), sub: biggest.name, slug: biggest.slug, tone: "neutral" },
    { label: "Moneyball team", big: `#${bestValue.ap_rank}`, sub: `${bestValue.name} spends like #${bestValue.spend_rank}`, slug: bestValue.slug, tone: "up" },
    { label: "Biggest overpayer", big: fmtGap(worstValue.value_gap!), sub: `${worstValue.name} spends #${worstValue.spend_rank}, ranked #${worstValue.ap_rank}`, slug: worstValue.slug, tone: "down" },
    { label: "Elite outlier", big: `#${elite.ap_rank}`, sub: `${elite.name} sits #${elite.ap_rank} on the #${elite.spend_rank} budget`, slug: elite.slug, tone: "neutral" },
  ];

  return (
    <div className="pt-6 sm:pt-10">
      <p className="text-xs font-semibold text-fog">
        2026 season · through Week {data.poll.week} · Power 4 + Notre Dame
      </p>
      <h1 className="mt-3 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
        College football&rsquo;s
        <br />
        {fmtTotal(data.totals.total_mid_m)} roster
      </h1>
      <p className="mt-4 max-w-xl text-pretty text-fog">
        Estimated roster budgets for all {data.totals.teams} programs. AP ranks are through
        Week {data.poll.week} of 2026 (poll of {fmtPollDate(data.poll.as_of)}). Flip the metric — spending is only half of it.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
              metric === m.key ? "bg-panel text-paper" : "text-fog hover:bg-panel hover:text-paper"
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-1 text-sm text-fog">{METRICS.find((m) => m.key === metric)!.hint}</span>
      </div>

      <div className="mt-6">
        <TeamBars data={bars} />
      </div>

      <h2 className="mt-16 text-xs font-semibold text-fog">
        The storylines write themselves
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stories.map((s) => {
          const team = data.teams.find((t) => t.slug === s.slug)!;
          return (
          <Link
            key={s.label}
            href={`/team/${s.slug}`}
            className="rounded-xl border border-edge bg-panel/40 p-5 transition-ui hover:bg-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-fog">{s.label}</p>
              <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="sm" />
            </div>
            <p className={`tnum mt-2 text-3xl font-black ${toneClass(s.tone)}`}>{s.big}</p>
            <p className="mt-1 text-sm text-fog">{s.sub}</p>
          </Link>
          );
        })}
      </div>

      <div className="mt-16 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/moneyball" className="rounded-xl border border-edge p-6 transition-ui hover:bg-panel">
          <p className="text-lg font-extrabold">Moneyball →</p>
          <p className="mt-1 text-sm text-fog">Spend vs. rank: who does more with less?</p>
        </Link>
        <Link href="/compare" className="rounded-xl border border-edge p-6 transition-ui hover:bg-panel">
          <p className="text-lg font-extrabold">Compare →</p>
          <p className="mt-1 text-sm text-fog">Your school vs. anyone. Settle the argument.</p>
        </Link>
        <Link href="/build" className="rounded-xl border border-edge p-6 transition-ui hover:bg-panel">
          <p className="text-lg font-extrabold">Build →</p>
          <p className="mt-1 text-sm text-fog">Set a budget. Build a title roster.</p>
        </Link>
      </div>
    </div>
  );
}
