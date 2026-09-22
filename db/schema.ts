import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/** One game inside a published season, stored as JSONB on the season row. */
export type StoredGame = {
  week: number;
  oppName: string;
  oppSlug: string;
  oppColor: string;
  isHome: boolean;
  winProb: number; // 0..1
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
  stage?: "qf" | "sf" | "ncg" | "bowl";
};

/** The eight position-group allocations, in $M. */
export type StoredAlloc = {
  QB: number;
  RB: number;
  WR: number;
  OL: number;
  DL: number;
  LB: number;
  DB: number;
  ST: number;
};

export type StoredBestWin = {
  opponent: string;
  scoreFor: number;
  scoreAgainst: number;
} | null;

/**
 * Published seasons. One row per published season; the full game log is
 * embedded as JSONB so the share page needs no joins.
 */
export const seasons = pgTable(
  "seasons",
  {
    /** nanoid(10), URL-friendly share id */
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Optional GM display name chosen at publish time */
    gmName: text("gm_name"),
    programSlug: text("program_slug").notNull(),
    programName: text("program_name").notNull(),
    programColor: text("program_color").notNull(),
    /** Roster budget in $M (currently always 30; stored for future flexibility) */
    budgetM: real("budget_m").notNull(),
    alloc: jsonb("alloc").$type<StoredAlloc>().notNull(),
    seed: integer("seed").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    expectedWins: real("expected_wins").notNull(),
    avgMargin: real("avg_margin").notNull(),
    off: real("off").notNull(),
    def: real("def").notNull(),
    st: real("st").notNull(),
    /** Roster DNA tags, e.g. ["Air Raid DNA", "Trenches First"] */
    tags: jsonb("tags").$type<string[]>().notNull(),
    bestWin: jsonb("best_win").$type<StoredBestWin>(),
    worstLoss: jsonb("worst_loss").$type<StoredBestWin>(),
    games: jsonb("games").$type<StoredGame[]>().notNull(),
  },
  (t) => [index("seasons_wins_idx").on(t.wins.desc())]
);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
