import { z } from "zod";
import { getTeam } from "./data";
import { type DefensiveTendency, type OffensiveTendency } from "./gameplan";
import { GRAVITY_VERSION } from "./gravity";
import { SeasonPayloadSchema, type SeasonPayload } from "./season-payload";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason, type ReplayInput, type ReplayMode } from "./season-replay";
import { allocationFromPlaysheet, GAME_BUDGET_M, GAME_BUDGET_MIN_M, PLAYSHEET_SLOTS, type Playsheet } from "./simulator";

export const BUILD_DRAFT_KEY = "cfb-money-build-draft-v1-55m";
// Setup is separate so the legacy four-field roster and 010 run envelope stay readable.
export const BUILD_SETUP_KEY = "cfb-money-build-setup-v1";
export type BuildSetup = { version: 1; seed: number; complete: boolean };
const setupSchema = z.object({ version: z.literal(1), seed: z.number().int().min(0).max(2 ** 31 - 1), complete: z.boolean() }).strict();
export function restoreBuildSetup(raw: string | null, createSeed: () => number): BuildSetup {
  try {
    const parsed = setupSchema.safeParse(JSON.parse(raw ?? "null"));
    if (parsed.success) return parsed.data;
  } catch { /* Recover only setup metadata; never discard the saved roster or run. */ }
  return setupSchema.parse({ version: 1, seed: createSeed(), complete: false });
}
export const ACTIVE_RUNS_KEY = "cfb-money-active-runs-v1";
export type BuildDraft = { pos: Playsheet; budgetM: number; gravityOn: boolean; programSlug: string };
export type PublishAttempt = { key: string; payload: SeasonPayload; result?: { id: string } };
export type ActiveRun = {
  id: string;
  input: ReplayInput;
  pos: Playsheet;
  completedGames: number;
  featured: number;
  pending: { week: number; off: OffensiveTendency | null; def: DefensiveTendency | null } | null;
  publish: PublishAttempt | null;
};
export type RunNotice = { mode: ReplayMode; draft: BuildDraft; reason: string };
export type BuildSession = { version: 1; selectedMode: ReplayMode; runs: Partial<Record<ReplayMode, ActiveRun>>; notices: RunNotice[] };
export const emptySession = (): BuildSession => ({ version: 1, selectedMode: "season", runs: {}, notices: [] });

const playsheetSchema = z.object(Object.fromEntries(PLAYSHEET_SLOTS.map((slot) => [slot.key,
  z.number().finite().min(0).max(slot.cap).refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6),
]))).strict();
const draftSchema = z.object({
  pos: playsheetSchema, budgetM: z.number().int().min(GAME_BUDGET_MIN_M).max(GAME_BUDGET_M),
  gravityOn: z.boolean(), programSlug: z.string().refine((slug) => !!getTeam(slug)),
}).strict().refine((draft) => Object.values(draft.pos).reduce((sum, n) => sum + Math.round(n * 10), 0) <= draft.budgetM * 10);
const pendingSchema = z.object({ week: z.number().int().min(1).max(15),
  off: z.enum(["air", "balanced", "ground"]).nullable(), def: z.enum(["blitz", "base", "bracket"]).nullable(),
}).strict();
const publishSchema = z.object({ key: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), payload: SeasonPayloadSchema,
  result: z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) }).strict().optional(),
}).strict();
const runSchema = z.object({ id: z.uuid(), input: SeasonPayloadSchema, pos: playsheetSchema,
  completedGames: z.number().int().min(0).max(15), featured: z.number().int().min(0).max(14),
  pending: pendingSchema.nullable(), publish: publishSchema.nullable(),
}).strict();
const noticeSchema = z.object({ mode: z.enum(["quick", "season"]), draft: draftSchema, reason: z.string().max(200) }).strict();
const envelopeSchema = z.object({ version: z.literal(1), selectedMode: z.enum(["quick", "season"]),
  runs: z.object({ quick: z.unknown().optional(), season: z.unknown().optional() }).strict(),
  notices: z.array(noticeSchema).max(2).refine((notices) => new Set(notices.map((notice) => notice.mode)).size === notices.length),
}).strict();

export function decodeBuildDraft(raw: string | null): BuildDraft | null {
  try { const result = draftSchema.safeParse(JSON.parse(raw ?? "null")); return result.success ? result.data as BuildDraft : null; }
  catch { return null; }
}

function canonicalInput(value: ReplayInput & { gmName?: string }): ReplayInput {
  // A GM name belongs only to the frozen publish payload.
  const { gmName: _gmName, ...input } = value;
  return input;
}

export function validateRun(value: unknown, mode: ReplayMode): ActiveRun | null {
  const parsed = runSchema.safeParse(value);
  if (!parsed.success) return null;
  const run = parsed.data as ActiveRun;
  if ("gmName" in run.input || run.input.mode !== mode || !getTeam(run.input.programSlug) ||
    run.input.dataFingerprint !== DATA_FINGERPRINT) return null;
  const draft = decodeBuildDraft(JSON.stringify({ pos: run.pos, budgetM: run.input.budgetM,
    gravityOn: run.input.gravityOn, programSlug: run.input.programSlug }));
  if (!draft) return null;
  const groups = allocationFromPlaysheet(run.pos);
  if (Object.keys(groups).some((key) => Math.round(groups[key as keyof typeof groups] * 10) !==
    Math.round(run.input.alloc[key as keyof typeof groups] * 10))) return null;
  try {
    const replay = replaySeason(run.input, run.completedGames);
    const finished = replay.games.filter((game) => game.result);
    if (finished.length !== run.completedGames || run.featured >= replay.games.length || run.featured > run.completedGames) return null;
    if (mode === "season" && (run.input.gameplan.length !== finished.length || finished.some((game, i) => run.input.gameplan[i]?.week !== game.week))) return null;
    const featured = replay.games[run.featured];
    if (run.pending && (mode !== "season" || featured.result || run.pending.week !== featured.week)) return null;
    if (run.publish && (!replay.complete || JSON.stringify(canonicalInput(run.publish.payload)) !== JSON.stringify(canonicalInput(run.input)))) return null;
    return run;
  } catch { return null; }
}

export type SessionDecode = { status: "absent" | "valid" | "malformed" | "incompatible"; session: BuildSession };
export function decodeBuildSession(raw: string | null): SessionDecode {
  if (raw === null) return { status: "absent", session: emptySession() };
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { status: "malformed", session: emptySession() };
    const session: BuildSession = { ...parsed.data, runs: {}, notices: parsed.data.notices as RunNotice[] };
    let incompatible = false;
    for (const mode of ["quick", "season"] as const) {
      const saved = parsed.data.runs[mode];
      if (saved === undefined) continue;
      const run = validateRun(saved, mode);
      if (run) { session.runs[mode] = run; continue; }
      const candidate = saved as Partial<ActiveRun> | null;
      const input = candidate?.input;
      const draft = input && decodeBuildDraft(JSON.stringify({ pos: candidate.pos, budgetM: input.budgetM,
        gravityOn: input.gravityOn, programSlug: input.programSlug }));
      if (draft && (input?.simVersion !== SIM_VERSION || input?.dataFingerprint !== DATA_FINGERPRINT || input?.gravityVersion !== GRAVITY_VERSION)) {
        incompatible = true;
        session.notices = session.notices.filter((notice) => notice.mode !== mode);
        session.notices.push({ mode, draft, reason: "This saved run uses an older simulation snapshot. Its roster is available for a new season." });
      } else return { status: "malformed", session: emptySession() };
    }
    if (!session.runs[session.selectedMode]) {
      if (session.runs.season) session.selectedMode = "season";
      else if (session.runs.quick) session.selectedMode = "quick";
    }
    return { status: incompatible ? "incompatible" : "valid", session };
  } catch { return { status: "malformed", session: emptySession() }; }
}

export function encodeBuildSession(session: BuildSession): string {
  const raw = JSON.stringify(session);
  if (decodeBuildSession(raw).status !== "valid") throw new Error("Invalid active season");
  return raw;
}

export function createRun(mode: ReplayMode, draft: BuildDraft, id: string, seed: number): ActiveRun {
  const run: ActiveRun = { id, input: { mode, simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT,
    seed, programSlug: draft.programSlug, budgetM: draft.budgetM, alloc: allocationFromPlaysheet(draft.pos),
    gameplan: [], autoGameplan: mode === "quick", gravityOn: draft.gravityOn, gravityVersion: GRAVITY_VERSION },
    pos: { ...draft.pos }, completedGames: 0, featured: 0, pending: null, publish: null };
  if (!validateRun(run, mode)) throw new Error("Spend the exact selected book before starting a season.");
  return run;
}

type StorageProvider = () => Pick<Storage, "getItem" | "setItem">;
export function readBuildStorage(storage: StorageProvider, key: string): { available: boolean; raw: string | null } {
  try { return { available: true, raw: storage().getItem(key) }; }
  catch { return { available: false, raw: null }; }
}
export function writeBuildStorage(storage: StorageProvider, key: string, raw: string): boolean {
  try { storage().setItem(key, raw); return true; } catch { return false; }
}
