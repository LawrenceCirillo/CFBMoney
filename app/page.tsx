import Link from "next/link";
import { KpiStrip } from "@/components/KpiStrip";
import { SpendWinsScatter } from "@/components/SpendWinsScatter";
import { getMeta, getTeams } from "@/lib/data";

export default function HomePage() {
  const teams = getTeams();
  const meta = getMeta();

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight text-obsidian sm:text-6xl">
            College Football
            <br />
            by the Numbers
          </h1>
          <p className="mt-5 text-lg text-slate">
            What does it cost to win? Roster budgets from The Athletic, paired with 2025 results
            and CFBD context — athletic precision, Bloomberg clarity.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/spending"
              className="inline-flex items-center gap-2 bg-obsidian px-5 py-2.5 text-sm font-medium text-white hover:bg-slate transition-colors"
            >
              Explore teams →
            </Link>
            <Link
              href="/build"
              className="inline-flex items-center gap-2 border border-obsidian px-5 py-2.5 text-sm font-medium text-obsidian hover:bg-stone/50 transition-colors"
            >
              Build a roster
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone pb-4">
          <h2 className="font-display text-2xl font-semibold uppercase tracking-tight text-obsidian">
            Spend vs wins
          </h2>
          <p className="text-xs text-slate max-w-md">{meta.moneyballModel.formula}</p>
        </div>
        <div className="mt-6">
          <SpendWinsScatter teams={teams} />
        </div>
      </section>

      <KpiStrip />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Link
            href="/spending"
            className="group border border-stone p-6 hover:border-obsidian transition-colors"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">01</p>
            <h3 className="mt-2 font-display text-2xl font-bold uppercase text-obsidian group-hover:underline">
              Spending
            </h3>
            <p className="mt-2 text-sm text-slate">
              Full Power 4 + Notre Dame roster budget leaderboard with ranges and midpoints.
            </p>
          </Link>
          <Link
            href="/moneyball"
            className="group border border-stone p-6 hover:border-obsidian transition-colors"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">02</p>
            <h3 className="mt-2 font-display text-2xl font-bold uppercase text-obsidian group-hover:underline">
              Moneyball
            </h3>
            <p className="mt-2 text-sm text-slate">
              Dollars per win and wins above expectation from a transparent budget model.
            </p>
          </Link>
          <Link
            href="/compare?a=texas&b=ohio-state"
            className="group border border-stone p-6 hover:border-obsidian transition-colors"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">03</p>
            <h3 className="mt-2 font-display text-2xl font-bold uppercase text-obsidian group-hover:underline">
              Compare
            </h3>
            <p className="mt-2 text-sm text-slate">
              Texas vs Ohio State — or any two schools — on spend, wins, and efficiency.
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}
