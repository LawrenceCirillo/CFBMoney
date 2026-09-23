import Link from "next/link";
import Scatterplot from "@/components/Scatterplot";
import TeamMark from "@/components/TeamMark";
import CostCurveChart from "@/components/moneyball/CostCurveChart";
import WinPriceLadder from "@/components/moneyball/WinPriceLadder";
import EfficiencyTable from "@/components/moneyball/EfficiencyTable";
import { rankedTeams, data } from "@/lib/data";
import {
  fieldRatings,
  sweetSpot,
  winPrices,
  teamEfficiency,
} from "@/lib/moneyball";
import { fmtGap, fmtRange, fmtM, fmtMoney2, fmtMoney1, fmtPollDate } from "@/lib/format";

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mt-16">
      <h2 className="text-xs font-semibold text-fog">{kicker}</h2>
      <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{title}</h3>
      {children ? <p className="mt-3 max-w-2xl text-sm text-fog">{children}</p> : null}
    </div>
  );
}

export default function Moneyball() {
  const field = fieldRatings();
  const sweet = sweetSpot(field);
  const prices = winPrices(5, 12, field);
  const eff = teamEfficiency();
  const cheapest = eff[0];
  const priciest = eff[eff.length - 1];
  const twelfth = prices[prices.length - 1];

  const ranked = rankedTeams();
  const byValue = [...ranked].sort((a, b) => b.value_gap! - a.value_gap!);

  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-xs font-semibold text-fog">Moneyball</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
        What does a win cost?
      </h1>
      <p className="mt-4 max-w-2xl text-fog">
        Each estimated 2026 roster budget midpoint runs through the same model
        that powers the Build simulator. The model assumes spending raises talent
        with diminishing returns, then converts ratings into expected wins against
        an average field. These are modeled comparisons, not observed costs or wins.
      </p>

      <Link
        href="/build"
        className="group mt-8 flex items-center justify-between gap-6 rounded-2xl border border-edge bg-panel/60 p-6 transition-ui hover:border-fog sm:p-8"
      >
        <div>
          <p className="text-xs font-semibold text-fog">The game</p>
          <p className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Think you can beat the market?
          </p>
          <p className="mt-2 max-w-xl text-sm text-fog">
            Set a budget, fill a 22-man depth chart on the playsheet, pick a program,
            and sim the season week by week — rivalry games, playoff chase, bowl
            season and all.
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-emerald-500 px-5 py-3 font-display font-bold text-ink transition-ui group-hover:bg-emerald-400">
          Play →
        </span>
      </Link>

      {/* hero numbers */}
      <div className="mt-8 grid grid-cols-2 gap-px bg-edge lg:grid-cols-4">
        {[
          {
            label: "Modeled sweet spot",
            value: fmtM(Math.round(sweet.budget)),
            sub: `${fmtMoney2(sweet.costPerWin)} per expected win`,
          },
          {
            label: "Lowest modeled $/win",
            value: fmtMoney2(cheapest.costPerWin),
            sub: cheapest.team.name,
          },
          {
            label: "Highest modeled $/win",
            value: fmtMoney2(priciest.costPerWin),
            sub: priciest.team.name,
          },
          {
            label: "12th expected win",
            value: fmtMoney1(twelfth.priceM),
            sub: "marginal, modeled",
          },
        ].map((s) => (
          <div key={s.label} className="bg-ink px-5 py-6">
            <p className="text-[11px] font-semibold text-fog">{s.label}</p>
            <p className="tnum mt-2 text-3xl font-black tracking-tight sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-sm text-fog">{s.sub}</p>
          </div>
        ))}
      </div>

      <SectionHead kicker="The cost curve" title="Diminishing returns, drawn">
        Drag the slider. This is the model&rsquo;s assumed spending-to-rating curve:
        steep at smaller budgets and flatter at larger ones. The green dot marks
        the budget with the lowest modeled cost per expected win.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-2 sm:p-4">
        <CostCurveChart />
      </div>

      <SectionHead kicker="Marginal cost" title="The price of each win">
        The additional modeled budget needed for each expected win, from the 5th
        to the 12th. These are differences along the curve, not observed payments.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-4 sm:p-6">
        <WinPriceLadder prices={prices} />
      </div>

      <SectionHead kicker="Efficiency leaderboard" title="Which budgets look most efficient in the model?">
        All {data.totals.teams} programs ranked by modeled dollars per expected win.
        This measures each budget midpoint against the same assumed curve, not
        actual program spending or results.
      </SectionHead>
      <div className="mt-6">
        <EfficiencyTable rows={eff} />
      </div>

      <SectionHead kicker="Market vs money" title={`What the polls think — through Week ${data.poll.week}`}>
        Budget against the AP Top 25 published {fmtPollDate(data.poll.as_of)}, after Week {data.poll.week}. Top-left is
        a higher AP position with a lower estimated budget midpoint. Value gap is
        the difference between spend rank and current AP rank, not a measure of
        actual financial return.
      </SectionHead>
      <div className="mt-6 rounded-xl border border-edge bg-panel/30 p-2 sm:p-4">
        <Scatterplot teams={ranked} />
      </div>

      <h2 className="mt-12 text-xs font-semibold text-fog">Value leaderboard</h2>
      <div className="mt-4">
        {byValue.map((t, i) => (
          <Link
            key={t.slug}
            href={`/team/${t.slug}`}
            className="group grid grid-cols-[2.5rem_3.5rem_1.75rem_1fr_auto] items-center gap-3 border-b border-line/60 px-2 py-2.5 hover:bg-panel/60"
          >
            <span className="tnum text-sm text-fog">{String(i + 1).padStart(2, "0")}</span>
            <span
              className={`tnum text-sm font-extrabold ${
                t.value_gap! > 0 ? "text-status-success" : t.value_gap! < 0 ? "text-status-loss" : "text-fog"
              }`}
            >
              {fmtGap(t.value_gap!)}
            </span>
            <TeamMark slug={t.slug} name={t.name} abbr={t.abbr} color={t.color} size="sm" />
            <span className="text-sm font-semibold group-hover:underline">{t.name}</span>
            <span className="tnum text-sm text-fog">
              #{t.ap_rank} · {fmtRange(t.budget_low_m, t.budget_high_m)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-16 border-t border-line pt-6 pb-4">
        <p className="text-xs leading-relaxed text-fog">
          Methodology — Expected wins are modeled, not observed. Estimated budget
          midpoints become ratings through an assumed diminishing-returns curve,
          then win probability against the average {data.totals.teams}-program field,
          times 12 games. Budget ranges come from The Athletic; AP ranks are through
          Week {data.poll.week} (published {fmtPollDate(data.poll.as_of)}, {data.season}).
        </p>
        <Link href="/methodology" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 hover:text-paper">
          Read full methodology →
        </Link>
      </div>
    </div>
  );
}
