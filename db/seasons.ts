import { desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./client";
import { seasons, type NewSeason, type Season } from "./schema";
import type { SeasonPayload } from "../lib/season-payload";

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

/** Insert a validated season payload; returns the new share id. */
export async function createSeason(payload: SeasonPayload): Promise<string> {
  const db = getDb();
  const id = nanoid(10);
  const row: NewSeason = {
    id,
    gmName: payload.gmName?.trim() ? payload.gmName.trim() : null,
    programSlug: payload.programSlug,
    programName: payload.programName,
    programColor: payload.programColor,
    budgetM: payload.budgetM,
    alloc: payload.alloc,
    seed: payload.seed,
    wins: payload.wins,
    losses: payload.losses,
    expectedWins: payload.expectedWins,
    avgMargin: payload.avgMargin,
    off: payload.off,
    def: payload.def,
    st: payload.st,
    tags: payload.tags,
    bestWin: payload.bestWin,
    worstLoss: payload.worstLoss,
    games: payload.games,
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
  return db.select(leaderboardCols).from(seasons).orderBy(...order).limit(limit);
}

/** Total number of published seasons. */
export async function countSeasons(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons);
  return rows[0]?.n ?? 0;
}
