import type { Metadata } from "next";
import Link from "next/link";
import Scatterplot from "@/components/Scatterplot";
import TeamMark from "@/components/TeamMark";
import CostCurveChart from "@/components/moneyball/CostCurveChart";
import { CostPerWin, MoneyStats, Spotlight } from "@/components/moneyball/MoneyStories";
import { data } from "@/lib/data";
import { fmtGap, fmtM, fmtPollDate, fmtRange } from "@/lib/format";
import { buildMoneyballInsights, costPerWinDescription } from "@/lib/moneyball-insights";
import { seasonSnapshot } from "@/lib/season-snapshot";
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

export default function Moneyball() {
  const insights = buildMoneyballInsights(data.teams, seasonSnapshot.teams, history.currentPoll.ballot);
  const { ranked, facts, above, below, hardestOther } = insights;
  const updated = [data.poll.as_of, seasonSnapshot.as_of, data.fpi.as_of].sort().at(-1)!;

  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-xs font-semibold text-fog">Moneyball · Week {data.poll.week} · Updated {fmtPollDate(updated)}</p>
      <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
        Does spending line up with the poll?
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-fog">{insights.takeaway}</p>
      <section aria-label={`Week ${data.poll.week} money stories`} className="mt-8 grid gap-4 lg:grid-cols-2">
        <Spotlight title="Biggest positive rank gap" teams={above.map((team) => facts[team.slug])} featured />
        <Spotlight title="Biggest negative rank gap" teams={below.map((team) => facts[team.slug])} />
        <Spotlight title="Rank gap, with schedule context" teams={hardestOther.map((team) => facts[team.slug])} />
      </section>

      <SectionHead kicker="Spend versus poll" title="See every tracked AP-ranked team">
        Further left = smaller budget; higher = better AP rank.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-2 sm:p-4">
        <div id="spend-poll-chart" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper" role="region" aria-label="Spend versus poll chart" aria-describedby="spend-parity-caption" tabIndex={0}>
          <div className="min-w-[880px] md:min-w-0">
            <Scatterplot teams={ranked} week={data.poll.week} movements={Object.fromEntries(ranked.map((team) => [team.slug, movementBySlug[team.slug]]))} previousWeek={history.previousPoll?.week ?? null} />
          </div>
        </div>
        <p id="spend-parity-caption" className="px-2 pb-1 pt-2 text-xs leading-relaxed text-fog">Line = spend rank at that budget; distance from the line is the rank gap.</p>
        <p className="moneyball-touch-hint px-2 pb-1 pt-2 text-xs text-fog">Swipe across the chart to inspect it at full size.</p>
      </div>
      <section className="mt-6" aria-labelledby="ranked-team-list-heading" aria-describedby="browse-cost-note">
        <h4 id="ranked-team-list-heading" className="text-base font-bold text-paper">Browse {ranked.length} tracked AP-ranked teams</h4>
        <p className="mt-1 text-sm text-fog">
          {comparisonLabel(history.previousPoll?.week ?? null)}: AP position and spend rank. Select a team for its page.
          {" "}Equal budget midpoints share a spend rank (1, 2, 2, 4).
        </p>
        <p id="browse-cost-note" className="mt-2 text-xs leading-relaxed text-fog">Cost per win: <span>At the budget midpoint · crude, partial-season</span>.</p>
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
                aria-label={`${team.name}, AP #${team.ap_rank}, estimated budget ${fmtRange(team.budget_low_m, team.budget_high_m)}, record ${facts[team.slug].record}, spend rank #${team.spend_rank}, rank gap ${fmtGap(team.value_gap!)}. ${costPerWinDescription(facts[team.slug].costPerWinM, false)}. ${movementSummary(movementBySlug[team.slug], history.previousPoll?.week ?? null)}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-ui hover:bg-panel/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                <span className="w-10 shrink-0 whitespace-nowrap font-display text-lg font-black tabular-nums text-fog">#{team.ap_rank}</span>
                <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="break-words text-sm font-semibold leading-snug text-paper">{team.name}</span>
                    <span className={`shrink-0 whitespace-nowrap text-lg font-black tabular-nums ${team.value_gap! > 0 ? "text-status-success" : team.value_gap! < 0 ? "text-status-loss" : "text-fog"}`} aria-label={`Rank gap ${fmtGap(team.value_gap!)}`}>{fmtGap(team.value_gap!)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-fog">
                    {fmtRange(team.budget_low_m, team.budget_high_m)} · {facts[team.slug].record} · Spend #{team.spend_rank}
                  </span>
                  <span className="mt-1 block"><CostPerWin value={facts[team.slug].costPerWinM} showCaveat={false} /></span>
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

      {insights.unrankedSpenders.length > 0 && (
        <section aria-labelledby="unranked-spenders-heading" className="mt-16">
          <h2 id="unranked-spenders-heading" className="text-2xl font-black tracking-tight sm:text-3xl">Spending big, not ranked</h2>
          <p className="mt-3 text-sm text-fog">Every top-10 spender outside this week’s AP Top 25, including spend-rank ties.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {insights.unrankedSpenders.map((team) => (
              <li key={team.slug} className="rounded-xl border border-line bg-panel/30 p-5 sm:p-6">
                <Link href={`/team/${team.slug}`} className="inline-flex items-center gap-3 text-xl font-black hover:underline">
                  <TeamMark slug={team.slug} name={team.name} abbr={team.abbr} color={team.color} size="lg" />{team.name}
                </Link>
                <div className="mt-5"><MoneyStats fact={facts[team.slug]} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="playoff-cost-heading" className="mt-16 rounded-2xl border border-line bg-panel/30 p-5 sm:p-8">
        <h2 id="playoff-cost-heading" className="text-2xl font-black tracking-tight sm:text-3xl">If the playoff started today</h2>
        <p className="mt-3 text-sm text-fog">AP-poll proxy: the AP Top 12, not the CFP bracket. {insights.field.length} teams{insights.field.length > 12 ? ", including ties at the cutoff" : ""}.</p>
        <p className={`mt-6 font-black tracking-tight tabular-nums ${insights.fieldMidM == null ? "text-2xl" : "whitespace-nowrap text-5xl sm:text-6xl"}`}>{insights.fieldMidM == null ? "Unavailable" : fmtM(insights.fieldMidM)}</p>
        <p className="mt-2 text-sm text-fog">Combined estimated roster spend, at budget midpoints.</p>
        {insights.missingBudgets.length > 0 && <p className="mt-3 text-sm text-fog">Full field cost unavailable: no tracked budget for {insights.missingBudgets.map((row) => row.name).join(", ")}.</p>}
        <div className="mt-6 flex items-center justify-between border-b border-line pb-2 text-xs text-fog" aria-hidden="true"><span>AP rank · program</span><span>Budget midpoint</span></div>
        <ol className="divide-y divide-line">
          {insights.field.map((row) => (
            <li key={row.name} className="text-sm">
              {row.team ? (
                <Link href={`/team/${row.team.slug}`} aria-label={`AP #${row.rank} ${row.name}, budget midpoint ${fmtM(row.team.budget_mid_m)}`} className="grid min-h-12 grid-cols-[2rem_1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-ui hover:bg-panel/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper">
                  <span className="tabular-nums text-fog">#{row.rank}</span>
                  <TeamMark slug={row.team.slug} name={row.team.name} abbr={row.team.abbr} color={row.team.color} size="sm" />
                  <span className="min-w-0 break-words font-semibold">{row.name}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-fog">{fmtM(row.team.budget_mid_m)}</span>
                </Link>
              ) : <div className="flex min-h-12 items-center justify-between gap-3 py-3"><span>#{row.rank} {row.name}</span><span className="text-fog">Budget unavailable</span></div>}
            </li>
          ))}
        </ol>
        {insights.firstOut.map(({ team, outspends }) => (
          <p key={team.slug} className="mt-6 border-t border-line pt-5 text-sm leading-relaxed text-fog">First team out: <Link href={`/team/${team.slug}`} className="font-semibold text-paper hover:underline">#{team.ap_rank} {team.name}</Link>, at a {fmtM(team.budget_mid_m)} budget midpoint, outspends {outspends} of the {insights.field.length} teams in this AP proxy.</p>
        ))}
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

      <section aria-labelledby="moneyball-methodology-heading" className="mt-16 border-t border-line pb-4 pt-6">
        <h2 id="moneyball-methodology-heading" className="text-sm font-bold">Methodology</h2>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-fog">
          These teams are selected by fixed rules: the largest positive and negative AP-versus-spend
          rank gaps, then the hardest played schedule among the other ranked teams. Ties are shown together. A refreshed
          poll or schedule snapshot can change the answers.
        </p>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-fog">
          AP poll: {fmtPollDate(data.poll.as_of)} · records: {fmtPollDate(seasonSnapshot.as_of)} ·
          ESPN played SOS: {fmtPollDate(data.fpi.as_of)}, {data.season}. SOS ranks are among all FBS teams,
          with #1 the hardest schedule; they are context, not an adjustment to the poll or budgets.
        </p>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-fog">
          The budget midpoint is the average of a reported range, and the AP poll is a ranking
          of teams, not a measurement of financial return. These rank gaps are questions to explore,
          not a verdict on how well a program spends. Records and played schedule strength add context;
          neither changes the rank gap. A positive gap means the AP rank is better than the spend rank.
          Select a logo for its team page; browse teams and weekly movement below the chart.
          Cost per win divides the full-season budget midpoint by wins in the current record: a crude,
          partial-season description, not marginal spending, schedule-adjusted efficiency, or a forecast.
          Zero-win teams have no cost-per-win figure. The playoff cost sums the AP-proxy field’s midpoints;
          the AP poll does not apply CFP qualification rules.
        </p>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-fog">
          {`Methodology — Budget ranges come from The Athletic. Spend ranks compare the ${data.totals.teams} tracked budget midpoints; ties share a rank. `}
          AP ranks use the Week {data.poll.week} poll; records and ESPN FPI
          played schedule ranks are separately dated snapshots. The $10M comparison is an output
          of the Build game model, not an observed cost or a forecast of a team’s season.
        </p>
        <Link href="/methodology" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 hover:text-paper">
          Read full methodology →
        </Link>
      </section>
    </div>
  );
}
