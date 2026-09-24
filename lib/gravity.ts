import table from "../data/program-gravity.json";
import type { PositionKey } from "./simulator";

export const GRAVITY_VERSION = "v1" as const;
export type GravityRates = Partial<Record<PositionKey, number>>;
export type GravityContext = { programSlug: string; gravityOn: boolean };

const groups = new Set<PositionKey>(["QB", "RB", "WR", "OL", "DL", "LB", "DB", "ST"]);
if (table.gravityVersion !== GRAVITY_VERSION) throw new Error("Unsupported gravity table version");

const bySlug = new Map<string, GravityRates>();
for (const team of table.teams) {
  if (bySlug.has(team.slug)) throw new Error(`Duplicate gravity program: ${team.slug}`);
  const rates: GravityRates = {};
  if (team.tags.length > 2) throw new Error(`Too many gravity tags: ${team.slug}`);
  let total = 0;
  for (const tag of team.tags) {
    if (!groups.has(tag.group as PositionKey) || tag.gravity < 0 || tag.gravity > 0.2 ||
      rates[tag.group as PositionKey] !== undefined) throw new Error(`Invalid gravity tag: ${team.slug}`);
    rates[tag.group as PositionKey] = tag.gravity;
    total += tag.gravity;
  }
  if (total > 0.25 + 1e-9) throw new Error(`Gravity exceeds combined cap: ${team.slug}`);
  bySlug.set(team.slug, rates);
}

export function gravityRates(context?: GravityContext): GravityRates {
  return context?.gravityOn ? bySlug.get(context.programSlug) ?? {} : {};
}

export function gravityTags(programSlug: string): { group: PositionKey; gravity: number }[] {
  const rates = bySlug.get(programSlug) ?? {};
  return Object.entries(rates).map(([group, gravity]) => ({ group: group as PositionKey, gravity }));
}

export function gravityFingerprint(): string {
  // Research notes and display names do not affect replay outcomes.
  return JSON.stringify([GRAVITY_VERSION, table.teams.map((team) => [
    team.slug, team.tags.map((tag) => [tag.group, tag.gravity]),
  ])]);
}
