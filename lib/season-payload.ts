import { z } from "zod";
import {
  GAME_BUDGET_MAX_M,
  GAME_BUDGET_MIN_M,
  MARKET_CAPS,
  requiredStarterSpendM,
  type Allocation,
  type PositionKey,
} from "./simulator";
import { SIM_VERSION } from "./season-replay";
import { GRAVITY_VERSION } from "./gravity";

const GameplanPickSchema = z.object({
  week: z.number().int().min(1).max(15),
  off: z.enum(["air", "balanced", "ground"]),
  def: z.enum(["blitz", "base", "bracket"]),
}).strict();

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
  gameplan: z.array(GameplanPickSchema).max(15),
  autoGameplan: z.boolean(),
  gravityOn: z.boolean(),
  gravityVersion: z.literal(GRAVITY_VERSION),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "quick" && (value.gameplan.length !== 0 || !value.autoGameplan)) {
    ctx.addIssue({ code: "custom", path: ["gameplan"], message: "Quick sim uses a neutral gameplan." });
  }
  const weeks = value.gameplan.map((pick) => pick.week);
  if (new Set(weeks).size !== weeks.length || weeks.some((week, index) => index > 0 && week <= weeks[index - 1])) {
    ctx.addIssue({ code: "custom", path: ["gameplan"], message: "Gameplan weeks must be unique and ordered." });
  }
  const alloc = value.alloc as Allocation;
  const total = GROUPS.reduce((sum, group) => sum + alloc[group], 0);
  const required = requiredStarterSpendM(value.budgetM);
  if (Math.abs(total - required) > 1e-8) {
    ctx.addIssue({ code: "custom", path: ["alloc"], message: `Starter allocation must total $${required.toFixed(1)}M.` });
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
