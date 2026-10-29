import { data } from "./data";
import { expectedWins as modeledExpectedWins, fieldRatings } from "./moneyball";
import {
  archetype,
  mulberry32,
  ratingsFromAllocation,
  simulateGame,
  summarizeSeason,
  gameVenue,
  type Allocation,
  type ScheduledGame,
} from "./simulator";
import {
  buildSeasonGames,
  nextPostseasonGame,
  buildPostseasonPath,
  projectedRank,
} from "./season-mode";
import type { TeamBudget } from "./types";
import { neutralPick, resolveGameplan, schemeTagFingerprint, type GameplanPick } from "./gameplan";
import { GRAVITY_VERSION, gravityFingerprint } from "./gravity";

/** Change this when schedule, ratings, RNG, or postseason rules change. */
export const SIM_VERSION = 5;
export type ReplayMode = "quick" | "season";

export interface ReplayInput {
  mode: ReplayMode;
  simVersion: number;
  dataFingerprint: string;
  seed: number;
  programSlug: string;
  budgetM: number;
  /** Exact-spend playsheet allocation. */
  alloc: Allocation;
  /** Explicit weekly calls. Quick sim and auto mode resolve missing weeks neutrally. */
  gameplan: GameplanPick[];
  autoGameplan: boolean;
  gravityOn: boolean;
  gravityVersion: typeof GRAVITY_VERSION;
}

/**
 * Fingerprint only attributes that affect the model or the stored game log.
 * AP ranks and snapshot dates intentionally do not change a replay.
 */
export function fingerprintForTeams(teams: TeamBudget[]): string {
  const material = JSON.stringify([
    SIM_VERSION,
    teams.map((t) => [t.slug, t.name, t.color, t.conference, t.budget_mid_m]),
    schemeTagFingerprint(),
    gravityFingerprint(),
  ]);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let i = 0; i < material.length; i++) {
    const code = material.charCodeAt(i);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `v${SIM_VERSION}-${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

export const DATA_FINGERPRINT = fingerprintForTeams(data.teams);

export interface ReplayRun {
  program: TeamBudget;
  games: ScheduledGame[];
  complete: boolean;
  fullAlloc: Allocation;
  ratings: ReturnType<typeof ratingsFromAllocation>;
  summary: ReturnType<typeof summarizeSeason>;
  tags: string[];
  /** Frozen from the 12 regular results. Null until qualification is known. */
  postseasonSeed: number | null;
  /** Potential player rounds only; unplayed entries are projections, not results. */
  postseasonPath: ScheduledGame[];
}

/** Replay from the seed through N finished games (or through the final game). */
export function replaySeason(
  input: ReplayInput,
  throughGames = Number.POSITIVE_INFINITY,
  teams: TeamBudget[] = data.teams
): ReplayRun {
  const program = teams.find((t) => t.slug === input.programSlug);
  if (!program) throw new Error("Unknown program");
  if (input.simVersion !== SIM_VERSION || input.dataFingerprint !== fingerprintForTeams(teams) || input.gravityVersion !== GRAVITY_VERSION || typeof input.gravityOn !== "boolean") {
    throw new Error("Unsupported simulation snapshot");
  }

  const fullAlloc = { ...input.alloc };
  const ratings = ratingsFromAllocation(fullAlloc, { programSlug: program.slug, gravityOn: input.gravityOn });
  const rng = mulberry32((input.seed ^ (input.mode === "quick" ? 0x12345 : 0x9e3779b9)) >>> 0);
  const field = input.mode === "season" ? fieldRatings(teams) : null;
  const fieldProj = field
    ? teams.filter((t) => t.slug !== program.slug).map((t) => modeledExpectedWins(t.budget_mid_m, field))
    : [];
  const ctx = field ? { program, teams, userR: ratings, field } : null;
  const games = buildSeasonGames(input.seed, ratings, program, teams);
  let postseasonSeed: number | null = null;
  let postseasonPath: ScheduledGame[] = [];
  const calls = new Map(input.gameplan.map((pick) => [pick.week, pick]));
  let played = 0;

  while (played < throughGames) {
    const index = games.findIndex((g) => !g.result);
    if (index < 0) break;
    const game = games[index];
    const pick = input.mode === "quick" ? neutralPick(game.week)
      : calls.get(game.week) ?? (input.autoGameplan ? neutralPick(game.week) : undefined);
    if (!pick) throw new Error(`Missing gameplan for week ${game.week}`);
    const resolved = resolveGameplan(pick, game.opponent.slug, game.winProb);
    const gameplan = input.mode === "quick"
      ? { ...resolved, offEdge: 0, defEdge: 0, netEdge: 0, adjustedWinProb: game.winProb }
      : resolved;
    const result = simulateGame(ratings, game.oppRatings, gameVenue(game), rng, gameplan.adjustedWinProb);
    games[index] = { ...game, gameplan, result };
    played++;

    if (!ctx) continue;
    if (!game.stage && games.filter((g) => !g.stage).every((g) => g.result)) {
      // Seeding uses regular-season results only, before any postseason game exists.
      const projection = games
        .filter((g) => !g.stage)
        .reduce((sum, g) => sum + (g.result?.won ? 1 : 0), 0);
      postseasonSeed = projectedRank(projection, fieldProj);
      postseasonPath = buildPostseasonPath(postseasonSeed, new Set(games.filter((g) => !g.stage).map((g) => g.opponent.slug)), ctx);
      games.push(postseasonPath[0]);
    } else if (game.stage && result.won) {
      const next = nextPostseasonGame(game.stage, postseasonPath);
      if (next) games.push(next);
    }
  }

  return {
    program,
    games,
    complete: games.every((g) => !!g.result),
    fullAlloc,
    ratings,
    summary: summarizeSeason(games),
    tags: archetype(input.alloc),
    postseasonSeed,
    postseasonPath,
  };
}
