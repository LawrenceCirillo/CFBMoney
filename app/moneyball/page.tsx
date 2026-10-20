import type { Metadata } from "next";
import Link from "next/link";
import Scatterplot from "@/components/Scatterplot";
import TeamMark from "@/components/TeamMark";
import CostCurveChart from "@/components/moneyball/CostCurveChart";
import { data, rankedTeams } from "@/lib/data";
import { fmtPollDate, fmtRange } from "@/lib/format";
import { selectMoneyballQuestions } from "@/lib/moneyball-questions";
import { getTeamSeason, seasonSnapshot } from "@/lib/season-snapshot";
import type { TeamBudget } from "@/lib/types";
import rawHistory from "@/public/data/moneyball-history-2026.json";
import { comparisonLabel, movementLabel, movementSummary, type MoneyballHistory } from "@/lib/moneyball-movement";

const history = rawHistory as MoneyballHistory;
const movementBySlug = Object.fromEntries(history.teams.map((team) => [team.slug, team]));

export const metadata: Metadata = {
  title: "Moneyball · CFB Money",
  description: "Compare estimated 2026 roster budgets with the current AP Top 25, team records, and schedule context.",
};

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mt-16">
      <h2 className="text-xs font-semibold text-fog">{kicker}</h2>
      <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{title}</h3>
      {children ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fog">{children}</p> : null}
    </div>
  );
}

function QuestionCard({ question, teams }: { question: string; teams: TeamBudget[] }) {
  return (
    <article className="rounded-2xl border border-edge bg-panel/40 p-5 sm:p-6">
      <h4 className="min-h-12 text-sm font-semibold leading-snug text-fog">{question}</h4>
      {teams.length > 1 ? <p className="mt-2 text-xs text-fog">{teams.length} teams tied on this measure</p> : null}
      {teams.map((team) => {
        const record = getTeamSeason(team.slug)?.record;
        return (
          <div key={team.slug} className="mt-5 border-t border-line pt-5">
            <Link href={`/team/${team.slug}`} className="inline-flex items-center gap-3 text-xl font-black hover:underline sm:text-2xl">
              <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="lg" />
              {team.name}
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-fog">
              AP #{team.ap_rank} versus spend #{team.spend_rank}: {Math.abs(team.value_gap!)} rank places apart.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-fog">Estimated budget</dt>
                <dd className="tnum mt-1 font-bold">{fmtRange(team.budget_low_m, team.budget_high_m)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fog">Record</dt>
                <dd className="tnum mt-1 font-bold">{record ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt className="text-xs text-fog">AP / spend rank</dt>
                <dd className="tnum mt-1 font-bold">#{team.ap_rank} / #{team.spend_rank}</dd>
              </div>
              <div>
                <dt className="text-xs text-fog">Played SOS rank</dt>
                <dd className="tnum mt-1 font-bold">#{team.sos_played_rank}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </article>
  );
}

export default function Moneyball() {
  const ranked = rankedTeams();
  const { above, below, hardestOther } = selectMoneyballQuestions(data.teams);
  const questions = [
    {
      question: "Which AP-ranked programs sit furthest above their estimated spend rank?",
      teams: above,
    },
    {
      question: "Which AP-ranked programs sit furthest below their estimated spend rank?",
      teams: below,
    },
    {
      question: "Which other AP-ranked programs have faced the toughest schedule?",
      teams: hardestOther,
    },
  ].filter((card) => card.teams.length > 0);

  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-xs font-semibold text-fog">Moneyball</p>
      <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
        Does spending line up with the poll?
      </h1>
      <p className="mt-5 max-w-3xl leading-relaxed text-fog">
        The AP Top 25 through Week {data.poll.week}, set beside estimated {data.season} roster budgets.
        These rank gaps are questions to explore, not a verdict on how well a program spends.
        Records and played schedule strength add context; neither changes the rank gap.
      </p>

      <SectionHead kicker={`Week ${data.poll.week} questions`} title="What stands out in this snapshot?">
        These teams are selected by fixed rules: the largest positive and negative AP-versus-spend
        rank gaps, then the hardest played schedule among the other ranked teams. Ties are shown together. A refreshed
        poll or schedule snapshot can change the answers.
      </SectionHead>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {questions.map((card) => <QuestionCard key={card.question} {...card} />)}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-fog">
        AP poll: {fmtPollDate(data.poll.as_of)} · records: {fmtPollDate(seasonSnapshot.as_of)} ·
        ESPN played SOS: {fmtPollDate(data.fpi.as_of)}, {data.season}. SOS ranks are among all FBS teams,
        with #1 the hardest schedule; they are context, not an adjustment to the poll or budgets.
      </p>

      <SectionHead kicker="Spend versus poll" title="See every tracked AP-ranked team">
        Further left means a lower budget midpoint; higher up means a higher AP position.
        The budget midpoint is the average of a reported range, and the AP poll is a ranking
        of teams, not a measurement of financial return. Select a logo for its team page.
        {" "}You can also browse the tracked ranked teams and their weekly movement below the chart.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-2 sm:p-4">
        <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper" role="region" aria-label="Spend versus poll chart" tabIndex={0}>
          <div className="min-w-[880px] md:min-w-0">
            <Scatterplot teams={ranked} week={data.poll.week} movements={Object.fromEntries(ranked.map((team) => [team.slug, movementBySlug[team.slug]]))} previousWeek={history.previousPoll?.week ?? null} />
          </div>
        </div>
        <p className="moneyball-touch-hint px-2 pb-1 pt-2 text-xs text-fog">Swipe across the chart to inspect it at full size.</p>
      </div>
      <section className="mt-6" aria-labelledby="ranked-team-list-heading">
        <h4 id="ranked-team-list-heading" className="text-base font-bold text-paper">Browse {ranked.length} tracked AP-ranked teams</h4>
        <p className="mt-1 text-sm text-fog">
          {comparisonLabel(history.previousPoll?.week ?? null)}: AP position and spend rank. Select a team for its page.
          {" "}Equal budget midpoints share a spend rank (1, 2, 2, 4).
        </p>
        {history.previousPoll && (
          <p className="mt-2 text-xs leading-relaxed text-fog">
            AP: {history.previousPoll.week === 0 ? "preseason" : `Week ${history.previousPoll.week}`}
            {history.previousPoll.as_of ? ` (${fmtPollDate(history.previousPoll.as_of)})` : " (publication date not captured)"}
            {" → "}Week {history.currentPoll.week} ({fmtPollDate(history.currentPoll.as_of)}).
            {" "}{history.spendBaseline ? `Spend compares with the saved Week ${history.spendBaseline.week} book (${fmtPollDate(history.spendBaseline.captured_as_of)}).` : "No matching saved spend baseline is available."}
            {" "}The budgets remain September {data.season} estimates; an unchanged spend rank is not a new spending report.
          </p>
        )}
        {history.currentPoll.ballot.filter((row) => row.slug === null).map((row) => (
          <p key={row.name} className="mt-2 text-xs text-fog">#{row.rank} {row.name} is outside the {data.totals.teams} tracked programs and is omitted from this chart and list.</p>
        ))}
        <ol className="mt-3 grid overflow-hidden rounded-xl border border-edge bg-panel/30 md:grid-cols-2 xl:grid-cols-3">
          {[...ranked].sort((a, b) => a.ap_rank! - b.ap_rank!).map((team) => (
            <li key={team.slug} className="border-b border-line/60 last:border-0">
              <Link
                href={`/team/${team.slug}`}
                aria-label={`${team.name}, AP #${team.ap_rank}, estimated budget ${fmtRange(team.budget_low_m, team.budget_high_m)}, spend rank #${team.spend_rank}. ${movementSummary(movementBySlug[team.slug], history.previousPoll?.week ?? null)}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-ui hover:bg-panel/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                <span className="w-10 shrink-0 whitespace-nowrap font-display text-lg font-black tabular-nums text-fog">#{team.ap_rank}</span>
                <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold leading-snug text-paper">{team.name}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-fog">
                    {fmtRange(team.budget_low_m, team.budget_high_m)} · Spend #{team.spend_rank}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed tabular-nums text-fog">
                    <span className={movementBySlug[team.slug].ap.status === "up" ? "text-status-success" : movementBySlug[team.slug].ap.status === "down" ? "text-status-loss" : ""}>
                      AP {movementLabel(movementBySlug[team.slug].ap)}
                    </span>
                    {" · "}Spend {movementLabel(movementBySlug[team.slug].spend)}
                  </span>
                </span>
                <span className="shrink-0 text-fog" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <SectionHead kicker="Inside the Build game" title="What does another $10M change in the model?">
        Move the starting budget and compare it with a budget $10M higher. Both points stay
        within the range of reported team midpoints. The curve assumes spending increases
        modeled talent with diminishing returns and compares that talent with an average field.
        It does not use actual results, opponents, or coaching.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-2 sm:p-4">
        <CostCurveChart />
      </div>

      <Link
        href="/build"
        className="group mt-14 flex flex-col gap-5 rounded-2xl border border-edge bg-panel/60 p-6 transition-ui hover:border-fog sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div>
          <p className="text-xs font-semibold text-fog">The game</p>
          <p className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Try your own roster build</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fog">
            Set a budget, fill a 22-player playsheet, and simulate a season with the model
            behind the curve above.
          </p>
        </div>
        <span className="shrink-0 self-start rounded-xl bg-emerald-500 px-5 py-3 font-display font-bold text-ink transition-ui group-hover:bg-emerald-400 sm:self-auto">
          Play →
        </span>
      </Link>

      <div className="mt-16 border-t border-line pb-4 pt-6">
        <p className="max-w-4xl text-xs leading-relaxed text-fog">
          {`Methodology — Budget ranges come from The Athletic. Spend ranks compare the ${data.totals.teams} tracked budget midpoints; ties share a rank. `}
          AP ranks use the Week {data.poll.week} poll; records and ESPN FPI
          played schedule ranks are separately dated snapshots. The $10M comparison is an output
          of the Build game model, not an observed cost or a forecast of a team’s season.
        </p>
        <Link href="/methodology" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 hover:text-paper">
          Read full methodology →
        </Link>
      </div>
    </div>
  );
}
