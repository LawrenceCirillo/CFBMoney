import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./client";
import { seasons, type NewSeason, type Season } from "./schema";
import type { SeasonPayload } from "../lib/season-payload";
import { replaySeason, SIM_VERSION } from "../lib/season-replay";
import { GRAVITY_VERSION } from "../lib/gravity";

export type { Season };

/** Leaderboard row: the columns the table actually renders. */
export type LeaderboardRow = Pick<
  Season,
  | "id"
  | "createdAt"
  | "gmName"
  | "programSlug"
  | "programName"
  | "programColor"
  | "budgetM"
  | "wins"
  | "losses"
  | "expectedWins"
  | "avgMargin"
  | "bestWin"
  | "tags"
  | "verified"
  | "simVersion"
>;

export type LeaderboardSort = "wins" | "overachieve";

/** Replay and insert a validated season input; retries share the original id. */
export async function createSeason(payload: SeasonPayload, publishKey: string): Promise<string> {
  const db = getDb();
  const existing = await db.select({ id: seasons.id }).from(seasons)
    .where(eq(seasons.publishKey, publishKey)).limit(1);
  if (existing[0]) return existing[0].id;
  const replay = replaySeason(payload);
  if (!replay.complete) throw new Error("Season replay did not finish");
  const id = nanoid(10);
  const row: NewSeason = {
    id,
    publishKey,
    gmName: payload.gmName?.trim() ? payload.gmName.trim() : null,
    programSlug: payload.programSlug,
    programName: replay.program.name,
    programColor: replay.program.color,
    budgetM: payload.budgetM,
    alloc: replay.fullAlloc,
    starterAlloc: payload.alloc,
    seed: payload.seed,
    mode: payload.mode,
    simVersion: payload.simVersion,
    dataFingerprint: payload.dataFingerprint,
    gameplan: payload.gameplan,
    autoGameplan: payload.autoGameplan,
    gravityOn: payload.gravityOn,
    gravityVersion: payload.gravityVersion,
    verified: true,
    wins: replay.summary.wins,
    losses: replay.summary.losses,
    expectedWins: replay.summary.expectedWins,
    avgMargin: replay.summary.avgMargin,
    off: replay.ratings.off,
    def: replay.ratings.def,
    st: replay.ratings.st,
    tags: replay.tags,
    bestWin: replay.summary.bestWin ?? null,
    worstLoss: replay.summary.worstLoss ?? null,
    games: replay.games.map((g) => ({
      week: g.week,
      oppName: g.opponent.name,
      oppSlug: g.opponent.slug,
      oppColor: g.opponent.color,
      isHome: g.isHome,
      winProb: g.winProb,
      scoreFor: g.result!.scoreFor,
      scoreAgainst: g.result!.scoreAgainst,
      won: g.result!.won,
      stage: g.stage,
      gameplan: g.gameplan,
    })),
  };
  const inserted = await db.insert(seasons).values(row)
    .onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0].id;
  // A concurrent request committed the same key while this request replayed.
  const winner = await db.select({ id: seasons.id }).from(seasons)
    .where(eq(seasons.publishKey, publishKey)).limit(1);
  if (!winner[0]) throw new Error("Publish key conflict without a saved season");
  return winner[0].id;
}

/** Fetch a single season by its share id. */
export async function getSeason(id: string): Promise<Season | null> {
  const db = getDb();
  const rows = await db.select().from(seasons).where(sql`${seasons.id} = ${id}`).limit(1);
  return rows[0] ?? null;
}

const leaderboardCols = {
  id: seasons.id,
  createdAt: seasons.createdAt,
  gmName: seasons.gmName,
  programSlug: seasons.programSlug,
  programName: seasons.programName,
  programColor: seasons.programColor,
  budgetM: seasons.budgetM,
  wins: seasons.wins,
  losses: seasons.losses,
  expectedWins: seasons.expectedWins,
  avgMargin: seasons.avgMargin,
  bestWin: seasons.bestWin,
  tags: seasons.tags,
  verified: seasons.verified,
  simVersion: seasons.simVersion,
} as const;

const currentRules = and(eq(seasons.verified, true), eq(seasons.simVersion, SIM_VERSION),
  eq(seasons.gravityVersion, GRAVITY_VERSION), isNotNull(seasons.gravityOn));
const earlierRules = or(eq(seasons.verified, false), isNull(seasons.simVersion), ne(seasons.simVersion, SIM_VERSION),
  isNull(seasons.gravityVersion), ne(seasons.gravityVersion, GRAVITY_VERSION), isNull(seasons.gravityOn));

/** Top seasons for the leaderboard. */
export async function getLeaderboard(
  sort: LeaderboardSort = "overachieve",
  limit = 100
): Promise<LeaderboardRow[]> {
  const db = getDb();
  const overachieve = sql<number>`${seasons.wins} - ${seasons.expectedWins}`;
  const order =
    sort === "overachieve"
      ? [desc(overachieve), desc(seasons.wins), desc(seasons.avgMargin)]
      : [desc(seasons.wins), desc(overachieve), desc(seasons.avgMargin)];
  return db.select(leaderboardCols).from(seasons).where(currentRules).orderBy(...order).limit(limit);
}

/** Earlier rulesets and pre-replay rows remain available by share link and in an archive. */
export async function getLegacyArchive(limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  return getDb().select(leaderboardCols).from(seasons)
    .where(earlierRules).orderBy(desc(seasons.createdAt)).limit(limit).offset(offset);
}

/** Count seasons ranked under the current rules; pass false for the earlier archive. */
export async function countSeasons(current = true): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons).where(current ? currentRules : earlierRules);
  return rows[0]?.n ?? 0;
}
