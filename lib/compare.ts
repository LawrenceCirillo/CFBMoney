import { getTeam } from "@/lib/data";

/** `georgia-vs-ohio-state` → the two slugs. Null when either school is unknown. */
export function parseComparePair(pair: string): { a: string; b: string } | null {
  const splitAt = pair.toLowerCase().indexOf("-vs-");
  if (splitAt <= 0) return null;
  const a = pair.slice(0, splitAt).toLowerCase();
  const b = pair.slice(splitAt + 4).toLowerCase();
  if (!a || !b || !getTeam(a) || !getTeam(b)) return null;
  return { a, b };
}

export function comparePath(a: string, b: string): string {
  return `/compare/${a}-vs-${b}`;
}
