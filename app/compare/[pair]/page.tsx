import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CompareBoard from "@/components/CompareBoard";
import { parseComparePair } from "@/lib/compare";
import { getTeam } from "@/lib/data";

type Props = { params: Promise<{ pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  const parsed = parseComparePair(pair);
  if (!parsed) return { title: "Compare · CFB Money" };
  const first = getTeam(parsed.a);
  const second = getTeam(parsed.b);
  if (!first || !second) return { title: "Compare · CFB Money" };
  return {
    title: `${first.name} vs ${second.name} · CFB Money`,
    description: `Roster budgets, spend rank, and AP rank for ${first.name} and ${second.name}.`,
  };
}

export default async function ComparePair({ params }: Props) {
  const { pair } = await params;
  const parsed = parseComparePair(pair);
  if (!parsed) notFound();
  return <CompareBoard initialA={parsed.a} initialB={parsed.b} />;
}
