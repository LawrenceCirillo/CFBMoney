import schemeData from "../data/scheme-tags-client.json";

export type OffTag = "air-raid" | "spread" | "pro-style" | "power-run";
export type DefTag = "4-3" | "3-4" | "4-2-5" | "3-3-5" | "multiple";
export type OffensiveTendency = "air" | "balanced" | "ground";
export type DefensiveTendency = "blitz" | "base" | "bracket";

export interface GameplanPick {
  week: number;
  off: OffensiveTendency;
  def: DefensiveTendency;
}

export interface GameplanResolution extends GameplanPick {
  oppOffTag: OffTag;
  oppDefTag: DefTag;
  offEdge: number;
  defEdge: number;
  netEdge: number;
  adjustedWinProb: number;
}

export const NEUTRAL_OFF: OffensiveTendency = "balanced";
export const NEUTRAL_DEF: DefensiveTendency = "base";
export const OFFENSIVE_OPTIONS: { value: OffensiveTendency; label: string }[] = [
  { value: "air", label: "Air it out" },
  { value: "balanced", label: "Balanced" },
  { value: "ground", label: "Ground & pound" },
];
export const DEFENSIVE_OPTIONS: { value: DefensiveTendency; label: string }[] = [
  { value: "blitz", label: "Blitz heavy" },
  { value: "base", label: "Base defense" },
  { value: "bracket", label: "Bracket their WR1" },
];

const tags = schemeData.teams as Record<string, { offTag: OffTag; defTag: DefTag }>;
const neutralTags = { offTag: "spread", defTag: "multiple" } as const;

/** Client-safe tag table contains only the two public scheme tags per team. */
export function schemeTagsFor(slug: string): { offTag: OffTag; defTag: DefTag } {
  return tags[slug] ?? neutralTags;
}

export function schemeTagFingerprint(): string {
  return JSON.stringify([schemeData.version, Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))]);
}

export function offTagLabel(tag: OffTag): string {
  return { "air-raid": "Air Raid", spread: "Spread", "pro-style": "Pro-Style", "power-run": "Power Run" }[tag];
}

export function defTagLabel(tag: DefTag): string {
  return tag === "multiple" ? "Multiple" : tag;
}

export function tendencyLabel(pick: OffensiveTendency | DefensiveTendency): string {
  return [...OFFENSIVE_OPTIONS, ...DEFENSIVE_OPTIONS].find((option) => option.value === pick)!.label;
}

export function neutralPick(week: number): GameplanPick {
  return { week, off: NEUTRAL_OFF, def: NEUTRAL_DEF };
}

export function offensiveEdge(off: OffensiveTendency, defense: DefTag): number {
  if (off === "balanced") return defense === "multiple" ? 2 : 0;
  if (off === "air") {
    if (defense === "4-3" || defense === "3-4") return 4;
    return defense === "3-3-5" ? -3 : 1;
  }
  if (defense === "3-3-5") return 4;
  return defense === "4-3" || defense === "3-4" ? -3 : 1;
}

export function defensiveEdge(def: DefensiveTendency, offense: OffTag): number {
  if (def === "base") return 0;
  if (def === "blitz") {
    if (offense === "air-raid" || offense === "pro-style") return 5;
    return offense === "power-run" ? -5 : -2;
  }
  return offense === "air-raid" || offense === "spread" ? 4 : -2;
}

export function resolveGameplan(
  pick: GameplanPick,
  opponentSlug: string,
  neutralWinProb: number,
): GameplanResolution {
  const { offTag, defTag } = schemeTagsFor(opponentSlug);
  const offEdge = offensiveEdge(pick.off, defTag);
  const defEdge = defensiveEdge(pick.def, offTag);
  const netEdge = Math.max(-8, Math.min(8, offEdge + defEdge));
  return {
    ...pick, oppOffTag: offTag, oppDefTag: defTag, offEdge, defEdge, netEdge,
    adjustedWinProb: netEdge === 0 ? neutralWinProb
      : Math.max(0.001, Math.min(0.999, neutralWinProb + netEdge / 100)),
  };
}

export function gameplanNarration(plan: GameplanResolution, won: boolean): string | null {
  if (plan.off === "balanced" && plan.def === "base") return null;
  const useDefense = Math.abs(plan.defEdge) >= Math.abs(plan.offEdge) && plan.def !== "base";
  const call = tendencyLabel(useDefense ? plan.def : plan.off);
  const edge = useDefense ? plan.defEdge : plan.offEdge;
  const matchup = useDefense ? offTagLabel(plan.oppOffTag) : `${defTagLabel(plan.oppDefTag)} front`;
  if (edge > 0) return won
    ? `${call} found its edge against the ${matchup}.`
    : `${call} had the matchup edge. The result went the other way.`;
  if (edge < 0) return won
    ? `Won despite a difficult ${call} matchup against the ${matchup}.`
    : `The ${matchup} punished the ${call} call.`;
  return null;
}

export interface GameplanRecordRow {
  label: string;
  wins: number;
  losses: number;
  aboveExpected: number;
}

export function gameplanRecord(games: { won: boolean; winProb: number; gameplan?: GameplanResolution }[]): GameplanRecordRow[] {
  const rows: GameplanRecordRow[] = [];
  for (const option of [...OFFENSIVE_OPTIONS, ...DEFENSIVE_OPTIONS]) {
    if (option.value === "balanced" || option.value === "base") continue;
    const matching = games.filter((game) => game.gameplan &&
      (game.gameplan.off === option.value || game.gameplan.def === option.value));
    if (matching.length === 0) continue;
    const wins = matching.filter((game) => game.won).length;
    rows.push({ label: option.label, wins, losses: matching.length - wins,
      aboveExpected: wins - matching.reduce((sum, game) => sum + game.winProb, 0) });
  }
  return rows;
}
