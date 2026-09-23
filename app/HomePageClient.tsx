"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { data, rankedTeams } from "@/lib/data";
import { fmtGap, fmtM, fmtRange, fmtTotal } from "@/lib/format";
import TeamBars, { type BarDatum } from "@/components/TeamBars";
import TeamMark from "@/components/TeamMark";
import ChartDropdown from "@/components/ChartDropdown";
import type { TeamBudget } from "@/lib/types";

type Metric = "spend" | "value" | "poll";
type SortKey = "spend-high" | "spend-low" | "ap-rank" | "best-record" | "value-high" | "value-low";

const METRICS: { key: Metric; label: string }[] = [
  { key: "spend", label: "Roster spend" },
  { key: "value", label: "Value vs. ranking" },
  { key: "poll", label: "AP Top 25" },
];
const DEFAULT_SORT: Record<Metric, SortKey> = {
  spend: "spend-high",
  value: "value-high",
  poll: "ap-rank",
};
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "spend-high", label: "Highest Spend" },
  { value: "spend-low", label: "Lowest Spend" },
  { value: "ap-rank", label: "Best AP Rank" },
  { value: "best-record", label: "Best Record" },
  { value: "value-high", label: "Biggest Bargain" },
  { value: "value-low", label: "Biggest Overpay" },
];
const CONFERENCE_OPTIONS = [
  { value: "all", label: "All Conferences" },
  ...[...new Set(data.teams.map((team) => team.conference))]
    .sort()
    .map((name) => ({ value: name, label: name })),
];

const budgetMidpoints = data.teams.map((team) => team.budget_mid_m).sort((a, b) => a - b);
const middle = Math.floor(budgetMidpoints.length / 2);
const medianBudgetM = budgetMidpoints.length % 2 === 0
  ? (budgetMidpoints[middle - 1] + budgetMidpoints[middle]) / 2
  : budgetMidpoints[middle];
const topTenBudgetM = budgetMidpoints.slice(-10).reduce((total, budget) => total + budget, 0);
const teamBySlug = new Map(data.teams.map((team) => [team.slug, team] as const));

function recordScore(record: string | undefined): { rate: number; wins: number } {
  const match = record?.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!match) return { rate: -1, wins: -1 };
  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const ties = Number(match[3] ?? 0);
  const games = wins + losses + ties;
  return { rate: games ? (wins + ties / 2) / games : -1, wins };
}

function compareTeams(a: TeamBudget, b: TeamBudget, sort: SortKey, records: Record<string, string>): number {
  let difference = 0;
  switch (sort) {
    case "spend-high":
      difference = b.budget_mid_m - a.budget_mid_m;
      break;
    case "spend-low":
      difference = a.budget_mid_m - b.budget_mid_m;
      break;
    case "ap-rank":
      difference = (a.ap_rank ?? 1000) - (b.ap_rank ?? 1000);
      break;
    case "best-record": {
      const first = recordScore(records[a.slug]);
      const second = recordScore(records[b.slug]);
      difference = second.rate - first.rate || second.wins - first.wins;
      break;
    }
    case "value-high":
      difference = (b.value_gap ?? -1000) - (a.value_gap ?? -1000);
      break;
    case "value-low":
      difference = (a.value_gap ?? 1000) - (b.value_gap ?? 1000);
      break;
    default: {
      const exhaustive: never = sort;
      return exhaustive;
    }
  }
  return difference || a.spend_rank - b.spend_rank || a.name.localeCompare(b.name);
}

type Tone = "up" | "down" | "neutral";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "up":
      return "text-status-success";
    case "down":
      return "text-status-loss";
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

export default function HomePageClient({ records }: { records: Record<string, string> }) {
  const [metric, setMetric] = useState<Metric>("spend");
  const [conference, setConference] = useState("all");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT.spend);

  const bars: BarDatum[] = useMemo(() => {
    const teams = (metric === "spend" ? data.teams : rankedTeams())
      .filter((team) => conference === "all" || team.conference === conference)
      .sort((a, b) => compareTeams(a, b, sort, records));
    switch (metric) {
      case "spend": {
        const max = Math.max(...data.teams.map((t) => t.budget_mid_m));
        return teams.map((t) => ({
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
        return teams.map((t) => ({
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
        return teams.map((t) => ({
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
  }, [metric, conference, sort, records]).map((row) => {
    const team = teamBySlug.get(row.slug)!;
    return {
      ...row,
      record: records[row.slug]?.replaceAll("-", "–") ?? "—",
      apRank: team.ap_rank,
      conference: team.conference,
      budget: fmtRange(team.budget_low_m, team.budget_high_m),
    };
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
    <div>
      <section aria-label="2026 season overview" className="relative isolate pt-10 sm:pt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[url('/LanderAssets/landertestbg.svg')] bg-contain bg-right bg-no-repeat opacity-80 md:block dark:opacity-55"
          style={{ maskImage: "linear-gradient(to right, transparent, black 25%)" }}
        />
        <div className="relative md:max-w-[64%] lg:max-w-[58%]">
          <h1 className="mt-9">
            <span className="sr-only">Estimated roster spending in {data.season}: </span>
            <span className="tnum block text-[clamp(4.5rem,10vw,8rem)] font-black leading-[0.9] tracking-[-0.075em]">
              {fmtTotal(data.totals.total_mid_m)}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-fog sm:text-lg">
            The estimated cost of building college football in {data.season}.
          </p>

          <dl aria-label="Estimated roster budget summary" className="mt-10 grid max-w-2xl grid-cols-3 gap-2 sm:mt-12 sm:gap-4">
            {[
              { label: "Programs", value: String(data.teams.length) },
              { label: "Median budget", value: fmtM(medianBudgetM) },
              { label: "Top 10 total", value: fmtM(topTenBudgetM) },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col border-l border-line pl-3 sm:pl-5">
                <dt className="order-2 mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fog sm:text-[11px] sm:tracking-[0.08em] lg:text-xs lg:tracking-[0.16em]">
                  {stat.label}
                </dt>
                <dd className="tnum order-1 text-xl font-bold leading-none sm:text-2xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMetric(m.key);
                setSort(DEFAULT_SORT[m.key]);
              }}
              aria-pressed={metric === m.key}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
                metric === m.key ? "bg-panel text-paper" : "text-fog hover:bg-panel hover:text-paper"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:ml-auto sm:flex sm:w-auto">
          <ChartDropdown
            label="Conference"
            value={conference}
            options={CONFERENCE_OPTIONS}
            onChange={setConference}
            className="sm:w-40"
          />
          <ChartDropdown
            label="Sort chart"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(value) => setSort(value as SortKey)}
            className="sm:w-44"
          />
        </div>
      </div>

      <div className="mt-6">
        {bars.length ? (
          <TeamBars data={bars} metricLabel={METRICS.find((m) => m.key === metric)!.label} />
        ) : (
          <p className="rounded-lg border border-line p-6 text-sm text-fog">No teams match these filters.</p>
        )}
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
