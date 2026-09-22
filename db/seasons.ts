import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./client";
import { seasons, type NewSeason, type Season } from "./schema";
import type { SeasonPayload } from "../lib/season-payload";
import { replaySeason } from "../lib/season-replay";

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
>;

export type LeaderboardSort = "wins" | "overachieve";

/** Replay and insert a validated season input; no caller-supplied result is stored. */
export async function createSeason(payload: SeasonPayload): Promise<string> {
  const db = getDb();
  const replay = replaySeason(payload);
  if (!replay.complete) throw new Error("Season replay did not finish");
  const id = nanoid(10);
  const row: NewSeason = {
    id,
    gmName: payload.gmName?.trim() ? payload.gmName.trim() : null,
    programSlug: payload.programSlug,
    programName: replay.program.name,
    programColor: replay.program.color,
    budgetM: payload.budgetM,
    alloc: replay.fullAlloc,
    seed: payload.seed,
    mode: payload.mode,
    simVersion: payload.simVersion,
    dataFingerprint: payload.dataFingerprint,
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
    })),
  };
  await db.insert(seasons).values(row);
  return id;
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
} as const;

/** Top seasons for the leaderboard. */
export async function getLeaderboard(
  sort: LeaderboardSort = "wins",
  limit = 100
): Promise<LeaderboardRow[]> {
  const db = getDb();
  const overachieve = sql<number>`${seasons.wins} - ${seasons.expectedWins}`;
  const order =
    sort === "overachieve"
      ? [desc(overachieve), desc(seasons.wins), desc(seasons.avgMargin)]
      : [desc(seasons.wins), desc(overachieve), desc(seasons.avgMargin)];
  return db.select(leaderboardCols).from(seasons).where(eq(seasons.verified, true)).orderBy(...order).limit(limit);
}

/** Older, unranked rows remain available by share link and in an archive. */
export async function getLegacyArchive(limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  return getDb().select(leaderboardCols).from(seasons)
    .where(eq(seasons.verified, false)).orderBy(desc(seasons.createdAt)).limit(limit).offset(offset);
}

/** Count verified seasons by default; pass false for legacy rows. */
export async function countSeasons(verified = true): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons).where(eq(seasons.verified, verified));
  return rows[0]?.n ?? 0;
}
