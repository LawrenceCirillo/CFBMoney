import type { Metadata } from "next";
import { MoneyballTable } from "@/components/MoneyballTable";
import { getMeta, getTeams } from "@/lib/data";

export const metadata: Metadata = {
  title: "Moneyball",
  description: "Dollars per win and wins above expectation.",
};

export default function MoneyballPage() {
  const teams = getTeams();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
        Moneyball
      </h1>
      <p className="mt-4 max-w-2xl text-slate">
        Efficiency metrics using 2025 wins and Athletic roster midpoints. Lower $/win can look
        better only when teams have enough wins to compare fairly.
      </p>

      <article className="mt-8 max-w-3xl space-y-3 border border-stone bg-stone/20 p-6 text-sm text-slate">
        <h2 className="font-display text-lg font-semibold uppercase text-obsidian">
          Methodology
        </h2>
        <p>
          Expected wins use ordinary least squares across {meta.teamCount} Power 4 + Notre Dame
          teams: <span className="font-mono text-obsidian">{meta.moneyballModel.formula}</span>.
        </p>
        <p>
          Wins above expected (WAE) = actual 2025 wins minus predicted wins. Dollars per win =
          budget midpoint divided by 2025 wins (blank at 0 wins).
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {meta.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </article>

      <div className="mt-10">
        <MoneyballTable teams={teams} />
      </div>
    </div>
  );
}
