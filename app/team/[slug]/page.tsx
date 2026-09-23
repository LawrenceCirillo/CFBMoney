import Link from "next/link";
import { notFound } from "next/navigation";
import TeamMark from "@/components/TeamMark";
import { SeasonFigure, TeamRoster } from "@/components/TeamSeason";
import { data, getTeam, conferencePeers } from "@/lib/data";
import { fmtGap, fmtM, fmtPollRank, fmtRange } from "@/lib/format";
import { getTeamSeason } from "@/lib/season-snapshot";
import { conferenceSpendRank } from "@/lib/spend-rank";

export function generateStaticParams() {
  return data.teams.map((t) => ({ slug: t.slug }));
}

const SCALE = 60; // $M axis for the range viz

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = getTeam(slug);
  if (!team) notFound();

  const peers = conferencePeers(team);
  const conf = conferenceSpendRank(team, data.teams);
  const season = getTeamSeason(team.slug);

  const gap = team.value_gap;
  const gapTone = gap == null || gap === 0 ? "text-paper" : gap > 0 ? "text-status-success" : "text-status-loss";
  const book = [
    { label: "National spend", value: `#${team.spend_rank}`, tone: "text-paper" },
    { label: `In the ${team.conference}`, value: `#${conf.rank} of ${conf.of}`, tone: "text-paper" },
    { label: `AP, week ${data.poll.week}`, value: fmtPollRank(team.ap_rank), tone: "text-paper" },
    { label: "Preseason", value: fmtPollRank(team.preseason_rank), tone: "text-paper" },
    { label: "Value vs. the book", value: gap != null ? fmtGap(gap) : "—", tone: gapTone },
  ];

  return (
    <div className="pt-10 sm:pt-16">
      <Link href="/" className="text-sm text-fog hover:text-paper">
        ← All spending
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="xl" />
        <div>
          <p className="text-xs font-semibold text-fog">
            {team.conference} · {team.abbr}
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            {team.name}
          </h1>
        </div>
      </div>

      <div className="mt-8">
        <p className="tnum text-6xl font-black tracking-tight sm:text-7xl">
          {fmtM(team.budget_mid_m)}
        </p>
        <p className="mt-1 text-sm text-fog">
          Est. 2026 roster budget · range {fmtRange(team.budget_low_m, team.budget_high_m)}
        </p>
        <div className="relative mt-6 h-3 rounded-full bg-panel">
          <div
            className="absolute h-full rounded-full"
            style={{
              left: `${(team.budget_low_m / SCALE) * 100}%`,
              width: `${((team.budget_high_m - team.budget_low_m) / SCALE) * 100}%`,
              background: team.color,
              opacity: 0.45,
            }}
          />
          <div
            className="absolute h-full w-1 rounded-full bg-paper"
            style={{ left: `${(team.budget_mid_m / SCALE) * 100}%` }}
          />
        </div>
        <div className="tnum mt-1 flex justify-between text-xs text-fog">
          <span>$0</span>
          <span>${SCALE}M</span>
        </div>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-xs font-semibold text-fog">The book</h2>
          <dl className="mt-2">
            {book.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-6 border-b border-line/60 py-3">
                <dt className="text-sm text-fog">{row.label}</dt>
                <dd className={`tnum text-2xl font-black ${row.tone}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-fog">{data.poll.note} Value is spend rank minus AP rank.</p>
        </div>
        {season ? <SeasonFigure season={season} /> : null}
      </div>

      {season ? <TeamRoster season={season} /> : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/build?program=${team.slug}`}
          className="flex-1 rounded-xl bg-emerald-500 px-6 py-4 text-center font-display text-lg font-bold text-ink transition-ui hover:bg-emerald-400"
        >
          Coach {team.abbr} — build their roster →
        </Link>
        <Link
          href="/moneyball"
          className="flex-1 rounded-xl border border-edge bg-panel/40 px-6 py-4 text-center font-display text-lg font-bold text-paper transition-ui hover:border-fog"
        >
          Run the Moneyball math →
        </Link>
      </div>

      <h2 className="mt-12 text-xs font-semibold text-fog">
        Where they sit in the {team.conference}
      </h2>
      <div className="mt-4">
        {peers.map((p) => (
          <Link
            key={p.slug}
            href={`/team/${p.slug}`}
            className={`grid grid-cols-[3rem_2rem_1fr_auto] items-center gap-3 rounded px-2 py-2 ${
              p.slug === team.slug ? "bg-panel" : "hover:bg-panel/50"
            }`}
          >
            <span className="tnum text-sm text-fog">#{conferenceSpendRank(p, data.teams).rank}</span>
            <TeamMark slug={p.slug} name={p.name} abbr={p.abbr} color={p.color} size="sm" />
            <span className="text-sm font-semibold">{p.name}</span>
            <span className="tnum text-sm text-fog">
              {fmtRange(p.budget_low_m, p.budget_high_m)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
