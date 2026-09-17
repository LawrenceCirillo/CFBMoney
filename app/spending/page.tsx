import type { Metadata } from "next";
import { SpendingTable } from "@/components/SpendingTable";
import { getTeams } from "@/lib/data";

export const metadata: Metadata = {
  title: "Spending",
  description: "2026 roster budget leaderboard with ranges and midpoints.",
};

export default function SpendingPage() {
  const teams = getTeams();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
        Roster spending
      </h1>
      <p className="mt-4 max-w-2xl text-slate">
        Athletic NIL roster budget estimates for assembling the 2026 roster. Every figure is a
        published range; midpoints are for modeling only.
      </p>
      <div className="mt-10">
        <SpendingTable teams={teams} />
      </div>
    </div>
  );
}
