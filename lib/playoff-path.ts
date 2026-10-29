import type { GameVenue } from "./simulator";

export type PlayoffStage = "fr" | "qf" | "sf" | "ncg";
export type PathRound = { stage: PlayoffStage; week: number; opponentSeed: number; venue: GameVenue };

export const PLAYOFF_ROUNDS = [
  { stage: "fr", label: "First round", week: 13 },
  { stage: "qf", label: "Quarterfinal", week: 14 },
  { stage: "sf", label: "Semifinal", week: 15 },
  { stage: "ncg", label: "National championship", week: 16 },
] as const;

// Adjacent quarterfinal branches form each semifinal. No other games are played.
const QUARTERS = [[1, 8, 9], [4, 5, 12], [2, 7, 10], [3, 6, 11]] as const;

/** The smallest seed in each opposite subtree is its projected representative. */
export function playoffSeedPath(seed: number): PathRound[] {
  if (!Number.isInteger(seed) || seed < 1 || seed > 12) throw new Error("Playoff seed must be 1–12");
  const quarter = QUARTERS.findIndex((branch) => branch.some((entry) => entry === seed));
  const branch = QUARTERS[quarter];
  return [
    ...(seed > 4 ? [{ stage: "fr" as const, week: 13, opponentSeed: 17 - seed, venue: seed <= 8 ? "home" as const : "away" as const }] : []),
    { stage: "qf", week: 14, opponentSeed: seed <= 4 ? Math.min(...branch.filter((entry) => entry !== seed)) : branch[0], venue: "neutral" },
    { stage: "sf", week: 15, opponentSeed: Math.min(...QUARTERS[quarter ^ 1]), venue: "neutral" },
    { stage: "ncg", week: 16, opponentSeed: Math.min(...QUARTERS.slice(quarter < 2 ? 2 : 0, quarter < 2 ? 4 : 2).flat()), venue: "neutral" },
  ];
}
