import type { Metadata } from "next";
import { BuildRoster } from "@/components/BuildRoster";
import { getMeta, getTeams } from "@/lib/data";

export const metadata: Metadata = {
  title: "Build",
  description: "Sketch a roster budget and see which programs it resembles.",
};

export default function BuildPage() {
  const teams = getTeams();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
        Build a roster
      </h1>
      <p className="mt-4 max-w-2xl text-slate">
        Set a hypothetical 2026 roster budget, allocate it by position, and see which Power 4
        programs sit nearest that midpoint. Splits are yours; published Athletic numbers remain
        ranges.
      </p>
      <div className="mt-10">
        <BuildRoster teams={teams} meta={meta} />
      </div>
    </div>
  );
}
