import Link from "next/link";
import { notFound } from "next/navigation";
import TeamMark from "@/components/TeamMark";
import { SeasonFigure } from "@/components/TeamSeason";
import TeamRoster from "@/components/TeamRoster";
import { data, getTeam, conferencePeers } from "@/lib/data";
import { fmtGap, fmtM, fmtPollDate, fmtPollRank, fmtRange } from "@/lib/format";
import { getTeamSeason, seasonSnapshot } from "@/lib/season-snapshot";
import { scoreboard } from "@/lib/scores";
import { buildTeamContexts, recordLabel, savedWeekLabel, type SourceStamp } from "@/lib/team-context";
import { conferenceSpendRank } from "@/lib/spend-rank";
import { gravityTags } from "@/lib/gravity";
import { buildSeasonGames } from "@/lib/season-mode";
import { teamRatings } from "@/lib/simulator";

export function generateStaticParams() {
  return data.teams.map((t) => ({ slug: t.slug }));
}

const SCALE = 60; // $M axis for the range viz
const CONTEXTS = buildTeamContexts(data, seasonSnapshot, scoreboard);
function sourceDate(source: SourceStamp | null): string {
  return source ? `${source.name} · ${fmtPollDate(source.asOf)}` : "Source date unavailable";
}
const SAMPLE_SLATES = data.teams.map((program) => {
  const games = buildSeasonGames(2026, teamRatings(program.budget_mid_m), program, data.teams);
  return { slug: program.slug, avg: games.reduce((sum, game) => sum + game.opponent.budget_mid_m, 0) / games.length };
}).sort((a, b) => b.avg - a.avg);

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = getTeam(slug);
  if (!team) notFound();

  const peers = conferencePeers(team);
  const conf = conferenceSpendRank(team, data.teams);
  const season = getTeamSeason(team.slug);
  const context = CONTEXTS.teams[team.slug];
  const gravity = gravityTags(team.slug);
  // The schedule is seed-dependent. Use the same illustrative seed for all
  // programs so this comparison is honest and clearly labeled.
  const slateRank = SAMPLE_SLATES.findIndex((entry) => entry.slug === team.slug) + 1;
  const slateAvg = SAMPLE_SLATES[slateRank - 1].avg;

  const gap = team.value_gap;
  const gapTone = gap == null || gap === 0 ? "text-paper" : gap > 0 ? "text-status-success" : "text-status-loss";
  const book = [
    { label: "National spend", value: `#${team.spend_rank}`, tone: "text-paper" },
    { label: `In the ${team.conference}`, value: `#${conf.rank} of ${conf.of}`, tone: "text-paper" },
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

      <section aria-label="Real season summary" className="mt-8 border-y border-line py-6">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-[1fr_1fr_2fr]">
          <div data-team-record>
            <dt className="text-sm text-fog">Record</dt>
            <dd className={`tnum mt-1 font-black ${context.record == null ? "text-2xl" : "text-4xl"}`}>{recordLabel(context.record)}</dd>
            <dd className="mt-2 text-xs text-fog">{context.games == null ? "Games unavailable" : `${context.games} games`} · {sourceDate(CONTEXTS.sources.record)}</dd>
          </div>
          <div data-team-poll>
            <dt className="text-sm text-fog">AP · Week {data.poll.week}</dt>
            <dd className={`tnum mt-1 font-black ${team.ap_rank == null ? "text-2xl" : "text-4xl"}`}>{fmtPollRank(team.ap_rank)}</dd>
            <dd className="mt-2 text-xs text-fog">{sourceDate(CONTEXTS.sources.poll)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1" data-team-result>
            <dt className="text-sm text-fog">{context.savedWeek.week ? `Week ${context.savedWeek.week} result` : "Saved-week result"}</dt>
            <dd className="tnum mt-2 text-xl font-bold">{savedWeekLabel(context.savedWeek)}</dd>
            <dd className="mt-2 text-xs text-fog">{sourceDate(CONTEXTS.sources.score)} · Single saved score week</dd>
          </div>
        </dl>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
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
        <section aria-labelledby="real-sos-heading" data-real-sos>
          <h2 id="real-sos-heading" className="text-sm font-semibold text-fog">Real schedule · ESPN FPI</h2>
          <dl className="mt-4 grid grid-cols-2 gap-6">
            <div><dt className="text-sm text-fog">SOS, played</dt><dd className="tnum mt-1 text-4xl font-black">{team.sos_played_rank == null ? "Unavailable" : `#${team.sos_played_rank}`}</dd></div>
            <div><dt className="text-sm text-fog">SOS, remaining</dt><dd className="tnum mt-1 text-4xl font-black">{team.sos_remaining_rank == null ? "Unavailable" : `#${team.sos_remaining_rank}`}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-fog">{sourceDate(CONTEXTS.sources.fpi)}. FBS ranks; 1 is hardest. Played covers games already played; remaining covers games left.</p>
        </section>
      </div>

      {season ? <SeasonFigure season={season} year={seasonSnapshot.season} source={seasonSnapshot.source} asOf={seasonSnapshot.as_of} /> : <p className="mt-10 text-fog">Season totals unavailable.</p>}

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="build-heading" data-build-context>
        <h2 id="build-heading" className="text-2xl font-bold">Play their season in Build</h2>
        <p className="mt-2 text-sm text-fog">The game model pairs a program’s edge with the price of its schedule.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-edge bg-panel/40 p-5" aria-labelledby="gravity-heading">
            <h3 id="gravity-heading" className="text-sm font-bold">Program gravity</h3>
            {gravity.length ? <ul className="mt-3 space-y-2 text-sm text-fog">
              {gravity.map((tag) => <li key={tag.group}>At {team.name}, $1M buys ${(1 + tag.gravity).toFixed(2)}M of {tag.group} talent in the game.</li>)}
            </ul> : <p className="mt-3 text-sm text-fog">No tagged position-group edge in the current model.</p>}
          </section>
          <section className="rounded-2xl border border-edge bg-panel/40 p-5" aria-labelledby="slate-heading">
            <h3 id="slate-heading" className="text-sm font-bold">Modeled schedule difficulty</h3>
            <p className="mt-3 text-sm">#{slateRank} hardest of {SAMPLE_SLATES.length} modeled slates</p>
            <p className="mt-1 text-sm text-fog">Average opponent budget ${slateAvg.toFixed(1)}M in a sample 2026-seed schedule. Your season seed sets the actual slate.</p>
          </section>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/build?program=${team.slug}`}
          className="flex-1 rounded-xl bg-paper px-6 py-4 text-center font-display text-lg font-bold text-ink transition-ui hover:opacity-80"
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
      </section>

      {season ? <TeamRoster key={team.slug} roster={season.roster} source={seasonSnapshot.source} asOf={seasonSnapshot.as_of} /> : <p className="mt-10 text-fog">Roster unavailable.</p>}

      <h2 className="mt-12 text-xs font-semibold text-fog">
        Where they sit in the {team.conference}
      </h2>
      <div className="mt-4">
        {peers.map((p) => (
          <Link
            key={p.slug}
            href={`/team/${p.slug}`}
            className={`grid grid-cols-[2rem_2rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 sm:gap-3 ${
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
