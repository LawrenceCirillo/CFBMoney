import type { Metadata } from "next";
import Link from "next/link";
import { data } from "@/lib/data";
import { methodologySourceLabels } from "@/lib/methodology";

const AP_SOURCE = "https://apnews.com/hub/ap-top-25-college-football-poll";
const FPI_SOURCE = "https://www.espn.com/college-football/fpi";

export const metadata: Metadata = {
  title: "Methodology · CFB Money",
  description: "How CFB Money uses estimated roster budgets, AP ranks, ESPN schedule strength, and a game model.",
};

const sectionClass = "mt-14 border-t border-line pt-10 sm:mt-16 sm:pt-12";
const linkClass = "font-semibold underline underline-offset-4 hover:text-paper";

export default function Methodology() {
  const labels = methodologySourceLabels(data);

  return (
    <article className="mx-auto max-w-4xl pt-10 sm:pt-16">
      <p className="text-xs font-semibold text-fog">Methodology</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">What the numbers mean.</h1>
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-fog">
        CFB Money combines reported roster budget estimates with current poll and schedule data.
        The Moneyball charts and Build game then apply our own simplified model. The modeled wins
        and dollars per expected win on this site are not observed spending or game results.
      </p>

      <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2 text-sm">
        {[
          ["Sources and dates", "sources"],
          ["Calculations", "calculations"],
          ["Game model", "model"],
          ["Limits", "limits"],
        ].map(([label, id]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-4 py-2 font-semibold text-paper hover:bg-panel">
            {label}
          </a>
        ))}
      </nav>

      <section id="sources" className={sectionClass} aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="text-2xl font-black tracking-tight sm:text-3xl">Sources and dates</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-fog">
          The budget ranges are a fixed source snapshot. Poll and schedule strength are reviewed
          separately as the season moves forward, so their dates can differ. The labels below come
          from the current committed data, not the day you opened this page.
        </p>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-edge bg-panel/40 p-5">
            <dt className="text-xs font-semibold text-fog">Roster budget estimates</dt>
            <dd className="mt-2 text-lg font-bold text-paper">{labels.budgets}</dd>
            <dd className="mt-3 text-sm text-fog">
              <a className={linkClass} href={data.source.url}>The Athletic budget report</a>
              {" · "}held fixed until the source ranges receive a reviewed update.
            </dd>
          </div>
          <div className="rounded-xl border border-edge bg-panel/40 p-5">
            <dt className="text-xs font-semibold text-fog">Current AP Top 25</dt>
            <dd className="tnum mt-2 text-lg font-bold text-paper">{labels.poll}</dd>
            <dd className="mt-3 text-sm text-fog">
              <a className={linkClass} href={AP_SOURCE}>AP college football poll</a>
              {" · "}updated after each reviewed ballot.
            </dd>
          </div>
          <div className="rounded-xl border border-edge bg-panel/40 p-5">
            <dt className="text-xs font-semibold text-fog">ESPN FPI schedule strength</dt>
            <dd className="tnum mt-2 text-lg font-bold text-paper">{labels.fpi}</dd>
            <dd className="mt-3 text-sm text-fog">
              <a className={linkClass} href={FPI_SOURCE}>ESPN FPI</a>
              {" · "}updated after a reviewed capture.
            </dd>
          </div>
        </dl>
      </section>

      <section id="calculations" className={sectionClass} aria-labelledby="calculations-heading">
        <h2 id="calculations-heading" className="text-2xl font-black tracking-tight sm:text-3xl">How the published metrics are calculated</h2>
        <dl className="mt-6 space-y-5 leading-relaxed">
          <div>
            <dt className="font-bold text-paper">Budget midpoint</dt>
            <dd className="mt-1 text-fog">We average the low and high ends of each estimated roster range and round to the nearest $0.1 million. The midpoint is a comparison input, not a verified amount spent.</dd>
          </div>
          <div>
            <dt className="font-bold text-paper">Spend rank</dt>
            <dd className="mt-1 text-fog">The {data.totals.teams} tracked programs are ranked by midpoint, highest first. Equal midpoints share a rank; the next rank skips the tied places.</dd>
          </div>
          <div>
            <dt className="font-bold text-paper">AP value gap</dt>
            <dd className="mt-1 text-fog">Spend rank minus current AP rank, shown only for teams in the current Top 25. A positive gap means the poll ranks a team higher than its budget midpoint rank. It is a rank comparison, not a measure of return on investment.</dd>
          </div>
          <div>
            <dt className="font-bold text-paper">Schedule strength</dt>
            <dd className="mt-1 text-fog">{data.fpi.note} These contextual ESPN ranks do not feed the Moneyball win model.</dd>
          </div>
        </dl>
      </section>

      <section id="model" className={sectionClass} aria-labelledby="model-heading">
        <h2 id="model-heading" className="text-2xl font-black tracking-tight sm:text-3xl">How the game model works</h2>
        <ol className="mt-6 space-y-5 leading-relaxed text-fog">
          <li><strong className="text-paper">1. Budget to ratings.</strong> The model splits each program’s estimated midpoint across eight position groups using fixed shares. Spending in each group passes through an assumed diminishing-returns talent curve, then weighted talent becomes offense, defense, and special-teams ratings. In Build, your playsheet allocation replaces those fixed shares for your team.</li>
          <li><strong className="text-paper">2. Ratings to expected wins.</strong> Moneyball compares each program with the average ratings of the same {data.totals.teams}-program field. It averages home and away win probabilities to cancel the modeled home edge, then multiplies by 12 regular-season games. This is a common-opponent comparison, not a forecast of each school’s actual schedule.</li>
          <li><strong className="text-paper">3. Ratings to simulated games.</strong> Build creates a 12-game slate, calculates rating-based expected scores and a home edge for each matchup, then draws scores with random variation. A saved seed makes a run reproducible. The displayed simulation results are generated games, not recorded {data.season} outcomes.</li>
        </ol>
        <p className="mt-6 rounded-xl border border-edge bg-panel/40 p-5 leading-relaxed text-fog">
          Moneyball’s average dollars per expected win divide a budget midpoint by its modeled expected wins. Its “price of each win” compares budgets at neighboring points on that same curve. Neither figure is an observed cost per win.
        </p>
      </section>

      <section id="limits" className={`${sectionClass} pb-6`} aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="text-2xl font-black tracking-tight sm:text-3xl">Limits and interpretation</h2>
        <ul className="mt-6 list-disc space-y-3 pl-5 leading-relaxed text-fog marker:text-fog">
          <li>The Athletic ranges are third-party estimates, not audited school expenditures. Schools may count roster costs differently; we cannot resolve those accounting differences from the ranges.</li>
          <li>The talent curve, position shares, home edge, and score variation are model assumptions. Coaching, injuries, individual player quality, and many other causes of results are outside this budget-only comparison.</li>
          <li>Coverage is limited to the {data.totals.teams} programs in this dataset. ESPN schedule ranks cover the broader FBS field, so their rank numbers are not ranks within these {data.totals.teams} programs.</li>
          <li>AP ranks and value gaps can change with each reviewed weekly ballot; the budget ranges stay fixed until separately updated.</li>
          <li>Spending alone is not shown to cause wins. Moneyball’s modeled dollars per expected win must not be read as actual {data.season} dollars spent per observed win.</li>
        </ul>
        <p className="mt-8 text-sm text-fog">
          <Link href="/moneyball" className={linkClass}>Return to Moneyball</Link>
        </p>
      </section>
    </article>
  );
}
