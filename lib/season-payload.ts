import { z } from "zod";
import {
  GAME_BUDGET_MAX_M,
  GAME_BUDGET_MIN_M,
  MARKET_CAPS,
  type Allocation,
  type PositionKey,
} from "./simulator";
import { SIM_VERSION } from "./season-replay";

const GROUPS: PositionKey[] = ["QB", "RB", "WR", "OL", "DL", "LB", "DB", "ST"];
const amount = z.number().finite().min(0).max(GAME_BUDGET_MAX_M);
const AllocSchema = z.object({
  QB: amount,
  RB: amount,
  WR: amount,
  OL: amount,
  DL: amount,
  LB: amount,
  DB: amount,
  ST: amount,
}).strict();

/** Only canonical replay inputs cross the publish boundary. */
export const SeasonPayloadSchema = z.object({
  gmName: z.string().trim().max(24).optional(),
  mode: z.enum(["quick", "season"]),
  simVersion: z.literal(SIM_VERSION),
  dataFingerprint: z.string().regex(/^v\d+-[0-9a-f]{16}$/),
  programSlug: z.string().min(1).max(60),
  budgetM: z.number().int().min(GAME_BUDGET_MIN_M).max(GAME_BUDGET_MAX_M),
  seed: z.number().int().min(0).max(2 ** 31 - 1),
  alloc: AllocSchema,
}).strict().superRefine((value, ctx) => {
  const alloc = value.alloc as Allocation;
  const total = GROUPS.reduce((sum, group) => sum + alloc[group], 0);
  if (total > value.budgetM + 1e-8) {
    ctx.addIssue({ code: "custom", path: ["alloc"], message: "Allocation exceeds the roster budget." });
  }
  for (const group of GROUPS) {
    if (alloc[group] > MARKET_CAPS[group] + 1e-8) {
      ctx.addIssue({ code: "custom", path: ["alloc", group], message: "Allocation exceeds the market cap." });
    }
    if (Math.abs(alloc[group] * 10 - Math.round(alloc[group] * 10)) > 1e-6) {
      ctx.addIssue({ code: "custom", path: ["alloc", group], message: "Allocation must use $0.1M increments." });
    }
  }
});

export type SeasonPayload = z.infer<typeof SeasonPayloadSchema>;
