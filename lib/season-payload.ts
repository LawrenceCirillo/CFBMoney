import { z } from "zod";
import {
  GAME_BUDGET_MAX_M,
  GAME_BUDGET_MIN_M,
} from "./simulator";

/**
 * Shared contract for a publishable season. Used by the API route to validate
 * incoming publishes and by the client to build the request body.
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");

const GameSchema = z.object({
  week: z.number().int().min(1).max(20),
  oppName: z.string().min(1).max(80),
  oppSlug: z.string().min(1).max(60),
  oppColor: hexColor,
  isHome: z.boolean(),
  winProb: z.number().min(0).max(1),
  scoreFor: z.number().int().min(0).max(250),
  scoreAgainst: z.number().int().min(0).max(250),
  won: z.boolean(),
  stage: z.enum(["qf", "sf", "ncg", "bowl"]).optional(),
});

const ResultSchema = z
  .object({
    opponent: z.string().min(1).max(80),
    scoreFor: z.number().int().min(0).max(250),
    scoreAgainst: z.number().int().min(0).max(250),
  })
  .nullable();

const AllocSchema = z.object({
  QB: z.number().min(0).max(50),
  RB: z.number().min(0).max(50),
  WR: z.number().min(0).max(50),
  OL: z.number().min(0).max(50),
  DL: z.number().min(0).max(50),
  LB: z.number().min(0).max(50),
  DB: z.number().min(0).max(50),
  ST: z.number().min(0).max(50),
});

const BUDGET_M = 30;

export const SeasonPayloadSchema = z
  .object({
    gmName: z.string().trim().max(24).optional(),
    programSlug: z.string().min(1).max(60),
    programName: z.string().min(1).max(80),
    programColor: hexColor,
    budgetM: z.number().min(GAME_BUDGET_MIN_M).max(GAME_BUDGET_MAX_M),
    alloc: AllocSchema,
    seed: z.number().int(),
    wins: z.number().int().min(0).max(20),
    losses: z.number().int().min(0).max(20),
    expectedWins: z.number().min(0).max(20),
    avgMargin: z.number().min(-100).max(100),
    off: z.number().min(0).max(100),
    def: z.number().min(0).max(100),
    st: z.number().min(0).max(100),
    tags: z.array(z.string().max(40)).max(10),
    bestWin: ResultSchema,
    worstLoss: ResultSchema,
    games: z.array(GameSchema).min(1).max(20),
  })
  .superRefine((v, ctx) => {
    // Allocation may not exceed the stated budget.
    const total = Object.values(v.alloc).reduce((a, b) => a + b, 0);
    if (total - v.budgetM > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `allocation $${total.toFixed(1)}M exceeds $${v.budgetM}M budget`,
        path: ["alloc"],
      });
    }
    // Wins/losses must match the game log.
    const won = v.games.filter((g) => g.won).length;
    if (won !== v.wins || v.games.length - won !== v.losses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wins/losses do not match the game log",
        path: ["games"],
      });
    }
    // Weeks 1-12 must each appear exactly once; postseason weeks must be
    // strictly increasing within 13-15. A top-4 seed's first-round bye skips
    // week 13, so the postseason run may start at week 14.
    const weeks = v.games.map((g) => g.week).sort((a, b) => a - b);
    const regular = weeks.filter((w) => w <= 12);
    const post = weeks.filter((w) => w > 12);
    const regularOk = regular.length === 12 && regular.every((w, i) => w === i + 1);
    const postOk =
      post.length <= 3 &&
      post.every((w) => w >= 13 && w <= 15) &&
      post.every((w, i) => i === 0 || w > post[i - 1]);
    if (!regularOk || !postOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "game weeks must be 1-12 plus an optional postseason run",
        path: ["games"],
      });
    }
  });

export type SeasonPayload = z.infer<typeof SeasonPayloadSchema>;
export const SEASON_BUDGET_M = BUDGET_M;
