import type { Metadata } from "next";
import { CompareView } from "@/components/CompareView";
import { getTeams } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare",
  description: "Side-by-side roster budgets, wins, and moneyball efficiency.",
};

type Props = {
  searchParams: Promise<{ a?: string; b?: string }>;
};

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const teams = getTeams();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
        Compare
      </h1>
      <p className="mt-4 max-w-2xl text-slate">
        Two Power 4 programs, one ledger. Budgets stay ranges; lime marks the more efficient or
        productive side where a comparison is meaningful.
      </p>
      <div className="mt-10">
        <CompareView teams={teams} initialLeft={params.a} initialRight={params.b} />
      </div>
    </div>
  );
}
