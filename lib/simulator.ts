// lib/simulator.ts
//
// Production season simulator for the Build game.
//
// Design:
//   - Every dollar buys "talent" with classic diminishing returns:
//       talent = floor + (1-floor) * spend/(spend + c). The first million at a
//       position matters far more than the tenth; every group always wants
//       *some* money, and stars get expensive fast. This is what makes
//       allocation strategic — and what punishes dumping $0 anywhere.
//   - Talent aggregates to OFF / DEF / ST ratings (0-100) via position weights.
//   - Real teams are rated with the SAME function from their estimated budget
//     and modeled position splits, so the sim is internally consistent. The
//     user's edge comes from allocating smarter than average, not from a
//     thumb on the scale.
//   - Games: expected score = base + rating differentials + home edge;
//     win probability via normal CDF on the margin; scores drawn with noise
//     whose std matches the probability model, so displayed win% == actual
//     simulated upset rate.
//
// Pure functions only — no React, no I/O. All randomness flows through an
// injected rng so seasons are reproducible from a seed.

import type { TeamBudget } from "./types";
import type { GameplanResolution } from "./gameplan";
import { gravityRates, type GravityContext, type GravityRates } from "./gravity";

export type PositionKey = "QB" | "RB" | "WR" | "OL" | "DL" | "LB" | "DB" | "ST";
export type Allocation = Record<PositionKey, number>;

export interface PositionGroup {
  key: PositionKey;
  label: string;
  /** modeled group ceiling */
  max: number;
  /**
   * Half-saturation constant ($M): talent = FLOOR + (1-FLOOR) * spend/(spend+c).
   * Classic diminishing returns — the first million matters most, the tenth
   * barely registers. Marginal talent is highest at $0, so every group always
   * wants *some* money (no degenerate $0 units), and stars get expensive fast.
   * `c` controls the point of diminishing returns.
   */
  c: number;
  side: "off" | "def" | "st";
  /** weight within its side; sums to 1 per side */
  weight: number;
}

export const POSITION_GROUPS: PositionGroup[] = [
  { key: "QB", label: "Quarterback", max: 9, c: 4.9, side: "off", weight: 0.38 },
  { key: "RB", label: "Running Back", max: 2.7, c: 1.9, side: "off", weight: 0.15 },
  { key: "WR", label: "Wide Receiver", max: 12.6, c: 3.2, side: "off", weight: 0.21 },
  { key: "OL", label: "Offensive Line", max: 15.3, c: 4.6, side: "off", weight: 0.26 },
  { key: "DL", label: "Defensive Line", max: 14.4, c: 4.6, side: "def", weight: 0.38 },
  { key: "LB", label: "Linebacker", max: 5.4, c: 2.4, side: "def", weight: 0.3 },
  { key: "DB", label: "Defensive Back", max: 15.3, c: 4.6, side: "def", weight: 0.32 },
  { key: "ST", label: "Special Teams", max: 3.6, c: 0.8, side: "st", weight: 1.0 },
];

/** Modeled share of a real team's budget per group. Labeled as estimates in the UI. */
export const POSITION_SPLITS: Record<PositionKey, number> = {
  QB: 0.18, RB: 0.07, WR: 0.12, OL: 0.17,
  DL: 0.17, LB: 0.09, DB: 0.17, ST: 0.03,
};

/** Default NIL book. Players can set any integer from MIN to MAX. */
export const GAME_BUDGET_M = 55;
export const GAME_BUDGET_MIN_M = 10;
/** Top of The Athletic's 2026 range (Texas high $55M). Program book, not 22 salaries. */
export const GAME_BUDGET_MAX_M = 55;

export function clampGameBudget(budgetM: number): number {
  const n = Math.round(Number.isFinite(budgetM) ? budgetM : GAME_BUDGET_M);
  return Math.max(GAME_BUDGET_MIN_M, Math.min(GAME_BUDGET_MAX_M, n));
}

/**
 * Market ceilings for the 22-man playsheet + ST, scaled by 1.8 from the
 * original relative structure. They total $78.3M (1.42x the $55M book),
 * leaving room for every dime to be spent while retaining scarce premium
 * positions. These are ceilings, not asserted real salaries.
 */
export interface PlaysheetSlot {
  key: string;
  group: PositionKey;
  cap: number;
}

const STAR_QB_CAP = 9;
const PREMIUM_CAP = 4.5;
const STARTER_CAP = 2.7;
const ST_CAP = 3.6;

export const PLAYSHEET_SLOTS = [
  { key: "LT", group: "OL", cap: PREMIUM_CAP },
  { key: "LG", group: "OL", cap: STARTER_CAP },
  { key: "C", group: "OL", cap: STARTER_CAP },
  { key: "RG", group: "OL", cap: STARTER_CAP },
  { key: "RT", group: "OL", cap: STARTER_CAP },
  { key: "TE", group: "WR", cap: STARTER_CAP },
  { key: "XWR", group: "WR", cap: PREMIUM_CAP },
  { key: "ZWR", group: "WR", cap: STARTER_CAP },
  { key: "SLOT", group: "WR", cap: STARTER_CAP },
  { key: "QB", group: "QB", cap: STAR_QB_CAP },
  { key: "RB", group: "RB", cap: STARTER_CAP },
  { key: "ED1", group: "DL", cap: PREMIUM_CAP },
  { key: "DT1", group: "DL", cap: STARTER_CAP },
  { key: "DT2", group: "DL", cap: STARTER_CAP },
  { key: "ED2", group: "DL", cap: PREMIUM_CAP },
  { key: "LB1", group: "LB", cap: STARTER_CAP },
  { key: "LB2", group: "LB", cap: STARTER_CAP },
  { key: "NKL", group: "DB", cap: STARTER_CAP },
  { key: "CB1", group: "DB", cap: PREMIUM_CAP },
  { key: "CB2", group: "DB", cap: STARTER_CAP },
  { key: "SS", group: "DB", cap: STARTER_CAP },
  { key: "FS", group: "DB", cap: STARTER_CAP },
  { key: "ST", group: "ST", cap: ST_CAP },
] as const satisfies readonly PlaysheetSlot[];

export type PlaysheetKey = (typeof PLAYSHEET_SLOTS)[number]["key"];
export type Playsheet = Record<PlaysheetKey, number>;

export function emptyPlaysheet(): Playsheet {
  const slots = {} as Playsheet;
  for (const slot of PLAYSHEET_SLOTS) slots[slot.key] = 0;
  return slots;
}

/** Collapse the individual starter amounts into the groups used by the simulator. */
export function allocationFromPlaysheet(pos: Playsheet): Allocation {
  const dimes = emptyAllocation();
  for (const slot of PLAYSHEET_SLOTS) dimes[slot.group] += Math.round(pos[slot.key] * 10);
  const alloc = emptyAllocation();
  for (const group of POSITION_GROUPS) alloc[group.key] = dimes[group.key] / 10;
  return alloc;
}

export const MARKET_CAPS: Allocation = (() => {
  const caps = emptyAllocation();
  for (const slot of PLAYSHEET_SLOTS) {
    caps[slot.group] = Math.round((caps[slot.group] + slot.cap) * 10) / 10;
  }
  return caps;
})();

/** Sum of per-position starter market caps ($M). */
export const MARKET_HEADROOM_M = PLAYSHEET_SLOTS.reduce((s, slot) => s + slot.cap, 0);

/** The sheet must spend the full book until every starter reaches a market cap. */
export function requiredStarterSpendM(budgetM: number): number {
  return Math.round(Math.min(clampGameBudget(budgetM), MARKET_HEADROOM_M) * 10) / 10;
}

export function slotMarketCap(key: string): number {
  const slot = PLAYSHEET_SLOTS.find((s) => s.key === key);
  return slot?.cap ?? 1.5;
}

export function marketCapsFor(_budgetM?: number): Allocation {
  return { ...MARKET_CAPS };
}

export function marketHeadroomFor(_budgetM?: number): number {
  return MARKET_HEADROOM_M;
}

export function sumAllocation(alloc: Allocation): number {
  return Math.round(POSITION_GROUPS.reduce((s, g) => s + alloc[g.key], 0) * 10) / 10;
}

/**
 * Fold leftover program money into the eight groups the way real teams are
 * rated (POSITION_SPLITS). That's the 2-deep, specialists, and everyone who
 * isn't on the 22-man sheet. Starter caps do not apply to this remainder.
 */
export function withDepth(starter: Allocation, budgetM: number): Allocation {
  const budget = clampGameBudget(budgetM);
  const spent = sumAllocation(starter);
  const depth = Math.max(0, Math.round((budget - spent) * 10) / 10);
  if (depth <= 0) return { QB: starter.QB, RB: starter.RB, WR: starter.WR, OL: starter.OL, DL: starter.DL, LB: starter.LB, DB: starter.DB, ST: starter.ST };
  const out = emptyAllocation();
  for (const g of POSITION_GROUPS) {
    out[g.key] = starter[g.key] + depth * POSITION_SPLITS[g.key];
  }
  const open = emptyAllocation();
  for (const g of POSITION_GROUPS) open[g.key] = 100;
  return settleDimes(out, budget, open);
}

// ---- model constants (see scripts/calibrate.mjs for how these were chosen) ----
const OFF_W = 0.46;
const DEF_W = 0.46;
const ST_W = 0.08;
const BASE_POINTS = 27; // average-team-vs-average-team shootout level
const POINTS_PER_RATING = 0.6; // unchanged: a rating point moves expected score by 0.6
const ST_POINTS_FACTOR = 0.12; // ST rating swings scoring a little
const HOME_EDGE = 1.5; // ≈3-point home swing, in line with college football
const MARGIN_SD = 13.5; // empirical std of FBS victory margins
const SCORE_NOISE_SD = MARGIN_SD / Math.SQRT2; // ≈9.5 per team; keeps sim == win prob

export interface Ratings {
  off: number;
  def: number;
  st: number;
}

// ---------------------------------------------------------------------------
// randomness
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a season can be reproduced from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
export function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return s * y;
}

/** P(Z <= x) for standard normal. */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ---------------------------------------------------------------------------
// dollars -> talent -> ratings
// ---------------------------------------------------------------------------

export function emptyAllocation(): Allocation {
  return { QB: 0, RB: 0, WR: 0, OL: 0, DL: 0, LB: 0, DB: 0, ST: 0 };
}

/** Diminishing-returns talent curve: FLOOR at $0, steep early, saturating late. */
export const TALENT_FLOOR = 0.35;
export function talentFromSpend(spendM: number, c: number): number {
  const s = Math.max(0, spendM);
  return TALENT_FLOOR + (1 - TALENT_FLOOR) * (s / (s + c));
}

export function ratingsFromAllocation(alloc: Allocation, context?: GravityContext): Ratings {
  return ratingsFromAllocationWithRates(alloc, gravityRates(context));
}

/** Explicit rates are for calibration; replay always looks rates up by versioned program. */
export function ratingsFromAllocationWithRates(alloc: Allocation, rates: GravityRates): Ratings {
  let off = 0;
  let def = 0;
  let st = 0;
  for (const g of POSITION_GROUPS) {
    const t = talentFromSpend(alloc[g.key] * (1 + (rates[g.key] ?? 0)), g.c);
    if (g.side === "off") off += g.weight * t;
    else if (g.side === "def") def += g.weight * t;
    else st += g.weight * t;
  }
  return { off: off * 100, def: def * 100, st: st * 100 };
}

/** Rate a real team with the same function, from its estimated budget. */
export function teamRatings(budgetMidM: number): Ratings {
  const alloc = emptyAllocation();
  for (const g of POSITION_GROUPS) alloc[g.key] = budgetMidM * POSITION_SPLITS[g.key];
  return ratingsFromAllocation(alloc);
}

function groupWeight(g: PositionGroup, effectiveC = g.c): number {
  const sideW = g.side === "off" ? OFF_W : g.side === "def" ? DEF_W : ST_W;
  return sideW * g.weight * (1 - TALENT_FLOOR) * effectiveC;
}

/**
 * Unconstrained water-fill among a subset of groups. Returns raw (unrounded)
 * spends that sum to budgetM.
 */
function optimalAmong(groups: PositionGroup[], budgetM: number, rates: GravityRates = {}): Map<PositionKey, number> {
  const out = new Map<PositionKey, number>();
  for (const g of groups) out.set(g.key, 0);
  if (groups.length === 0 || budgetM <= 0) return out;
  // t((1+r)s,c) = t(s,c/(1+r)); water-fill on actual dollars and adjusted c.
  const items = groups.map((g) => ({ g, c: g.c / (1 + (rates[g.key] ?? 0)), wc: groupWeight(g, g.c / (1 + (rates[g.key] ?? 0))) }));
  const totalAt = (lam: number) =>
    items.reduce((s, { c, wc }) => s + Math.max(0, Math.sqrt(wc / lam) - c), 0);
  let lo = 1e-12;
  let hi = 1;
  while (totalAt(hi) > budgetM) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (totalAt(mid) > budgetM) lo = mid;
    else hi = mid;
  }
  const lam = (lo + hi) / 2;
  for (const { g, c, wc } of items) {
    out.set(g.key, Math.max(0, Math.sqrt(wc / lam) - c));
  }
  return out;
}

/**
 * Optimal allocation for a budget. For talent = s/(s+c), the first-order
 * condition gives s_g = sqrt(w'_g * c_g / λ) - c_g (floored at 0); λ is found
 * by bisection so spending sums to the budget. Exact, no iteration heuristics.
 */
export function optimalAllocation(budgetM: number): Allocation {
  const raw = optimalAmong(POSITION_GROUPS, budgetM);
  const alloc = emptyAllocation();
  for (const g of POSITION_GROUPS) {
    alloc[g.key] = Math.round((raw.get(g.key) ?? 0) * 10) / 10;
  }
  return alloc;
}

/** Round a raw allocation to dimes, then nudge so the total equals budgetM without exceeding caps. */
function settleDimes(raw: Allocation, budgetM: number, caps: Allocation): Allocation {
  const budgetD = Math.round(budgetM * 10);
  const dimes = emptyAllocation();
  for (const g of POSITION_GROUPS) dimes[g.key] = Math.round(raw[g.key] * 10);
  let total = POSITION_GROUPS.reduce((s, g) => s + dimes[g.key], 0);
  const capD = (k: PositionKey) => Math.round(caps[k] * 10);
  while (total > budgetD) {
    const g = [...POSITION_GROUPS].filter((x) => dimes[x.key] > 0).sort((a, b) => dimes[b.key] - dimes[a.key])[0];
    if (!g) break;
    dimes[g.key] -= 1;
    total -= 1;
  }
  while (total < budgetD) {
    const g = [...POSITION_GROUPS]
      .filter((x) => dimes[x.key] < capD(x.key))
      .sort((a, b) => capD(b.key) - dimes[b.key] - (capD(a.key) - dimes[a.key]))[0];
    if (!g) break;
    dimes[g.key] += 1;
    total += 1;
  }
  const alloc = emptyAllocation();
  for (const g of POSITION_GROUPS) alloc[g.key] = dimes[g.key] / 10;
  return alloc;
}

/**
 * Optimal starter allocation that respects MARKET_CAPS. Spends at most
 * min(budget, market headroom) on the 22.
 */
export function cappedOptimalAllocation(budgetM: number, context?: GravityContext): Allocation {
  const budget = Math.min(clampGameBudget(budgetM), MARKET_HEADROOM_M);
  const caps = MARKET_CAPS;
  const pinned = new Set<PositionKey>();
  const alloc = emptyAllocation();
  for (let guard = 0; guard < POSITION_GROUPS.length + 2; guard++) {
    const open = POSITION_GROUPS.filter((g) => !pinned.has(g.key));
    const used = POSITION_GROUPS.reduce(
      (s, g) => s + (pinned.has(g.key) ? caps[g.key] : 0),
      0
    );
    const remaining = budget - used;
    if (open.length === 0 || remaining <= 1e-9) break;
    const raw = optimalAmong(open, remaining, gravityRates(context));
    const overflow = open.filter((g) => (raw.get(g.key) ?? 0) > caps[g.key] + 1e-9);
    if (overflow.length === 0) {
      for (const g of open) alloc[g.key] = raw.get(g.key) ?? 0;
      break;
    }
    for (const g of overflow) {
      alloc[g.key] = caps[g.key];
      pinned.add(g.key);
    }
  }
  return settleDimes(alloc, budget, caps);
}

/**
 * Split a group allocation across playsheet slots: even water-fill, then extra
 * dimes go to higher-cap (premium) slots. Never exceeds per-slot market caps.
 */
export function distributeAllocationToSlots(alloc: Allocation): Playsheet {
  const next = emptyPlaysheet();
  for (const g of POSITION_GROUPS) {
    const members = PLAYSHEET_SLOTS.filter((s) => s.group === g.key).map((s) => ({
      key: s.key,
      cap: Math.round(s.cap * 10),
      got: 0,
    }));
    let remaining = Math.round(alloc[g.key] * 10);
    while (remaining > 0) {
      const open = members.filter((m) => m.got < m.cap);
      if (open.length === 0) break;
      const minGot = Math.min(...open.map((m) => m.got));
      const lowest = open.filter((m) => m.got === minGot).sort((a, b) => b.cap - a.cap || a.key.localeCompare(b.key));
      for (const m of lowest) {
        if (remaining <= 0) break;
        m.got += 1;
        remaining -= 1;
      }
    }
    for (const m of members) next[m.key] = m.got / 10;
  }
  return next;
}

/**
 * Fit a playsheet to a new book: clamp each slot to its market cap, then
 * (if still over) shrink proportionally in integer dimes so starters never
 * exceed the program book. Leftover becomes depth.
 */
export function clampPlaysheetToBudget(
  pos: Playsheet,
  budgetM: number
): Playsheet {
  const budget = clampGameBudget(budgetM);
  const budgetD = Math.round(budget * 10);
  const dimes: Record<string, number> = {};
  for (const slot of PLAYSHEET_SLOTS) {
    const cap = Math.round(slot.cap * 10);
    dimes[slot.key] = Math.min(Math.round((pos[slot.key] ?? 0) * 10), cap);
  }
  const total = PLAYSHEET_SLOTS.reduce((s, p) => s + dimes[p.key], 0);
  if (total <= budgetD) {
    const next = emptyPlaysheet();
    for (const slot of PLAYSHEET_SLOTS) next[slot.key] = dimes[slot.key] / 10;
    return next;
  }
  const keys = PLAYSHEET_SLOTS.map((p) => p.key).filter((k) => dimes[k] > 0);
  const parts = keys.map((k) => {
    const exact = (dimes[k] * budgetD) / total;
    const floor = Math.floor(exact);
    return { k, floor, frac: exact - floor };
  });
  let leftover = budgetD - parts.reduce((s, p) => s + p.floor, 0);
  parts.sort((a, b) => b.frac - a.frac || a.k.localeCompare(b.k));
  const next = emptyPlaysheet();
  for (const p of parts) next[p.k] = p.floor;
  for (const p of parts) {
    if (leftover <= 0) break;
    next[p.k] += 1;
    leftover -= 1;
  }
  for (const slot of PLAYSHEET_SLOTS) next[slot.key] = next[slot.key] / 10;
  return next;
}

/** Change one starter amount in tenths, drawing any shortfall from other slots. */
export function setPlaysheetPosition(
  pos: Playsheet,
  budgetM: number,
  key: PlaysheetKey,
  valueM: number
): Playsheet {
  const toDimes = (m: number) => Math.round(m * 10);
  const cap = toDimes(slotMarketCap(key));
  const cur = toDimes(pos[key]);
  const desired = Math.max(0, Math.min(cap, toDimes(valueM)));
  if (desired === cur) return pos;

  const dimes = emptyPlaysheet();
  for (const slot of PLAYSHEET_SLOTS) dimes[slot.key] = toDimes(pos[slot.key]);

  if (desired < cur) {
    dimes[key] = desired;
  } else {
    const budgetD = toDimes(clampGameBudget(budgetM));
    const total = PLAYSHEET_SLOTS.reduce((sum, slot) => sum + dimes[slot.key], 0);
    const free = Math.max(0, budgetD - total);
    const need = desired - cur;
    const take = Math.max(0, need - free);
    const donors = PLAYSHEET_SLOTS.map((slot) => slot.key)
      .filter((donor) => donor !== key && dimes[donor] > 0);
    const donorTotal = donors.reduce((sum, donor) => sum + dimes[donor], 0);
    const target = Math.min(take, donorTotal);
    const parts = donors.map((donor) => {
      const exact = (target * dimes[donor]) / donorTotal;
      const floor = Math.floor(exact);
      return { donor, frac: exact - floor, steal: floor };
    });
    let leftover = target - parts.reduce((sum, part) => sum + part.steal, 0);
    parts.sort((a, b) => b.frac - a.frac || a.donor.localeCompare(b.donor));
    for (const part of parts) {
      if (leftover <= 0) break;
      part.steal += 1;
      leftover -= 1;
    }
    let stolen = 0;
    for (const part of parts) {
      const actual = Math.min(part.steal, dimes[part.donor]);
      dimes[part.donor] -= actual;
      stolen += actual;
    }
    dimes[key] = cur + Math.min(need, free + stolen);
  }

  const next = emptyPlaysheet();
  for (const slot of PLAYSHEET_SLOTS) next[slot.key] = dimes[slot.key] / 10;
  return next;
}

// ---------------------------------------------------------------------------
// games
// ---------------------------------------------------------------------------

export interface ExpectedScore {
  for: number;
  against: number;
  margin: number;
  winProb: number;
}

export function expectedScore(a: Ratings, b: Ratings, aHome: boolean): ExpectedScore {
  const ha = aHome ? HOME_EDGE : -HOME_EDGE;
  const forPts =
    BASE_POINTS +
    POINTS_PER_RATING * (a.off - 50) -
    POINTS_PER_RATING * (b.def - 50) +
    ST_POINTS_FACTOR * (a.st - 50) +
    ha;
  const againstPts =
    BASE_POINTS +
    POINTS_PER_RATING * (b.off - 50) -
    POINTS_PER_RATING * (a.def - 50) +
    ST_POINTS_FACTOR * (b.st - 50) -
    ha;
  const margin = forPts - againstPts;
  return { for: forPts, against: againstPts, margin, winProb: normalCdf(margin / MARGIN_SD) };
}

export interface GameResult {
  scoreFor: number;
  scoreAgainst: number;
  won: boolean;
}

/** Simulate one game. Noise matches the win-probability model by construction. */
export function simulateGame(
  a: Ratings,
  b: Ratings,
  aHome: boolean,
  rng: () => number,
  adjustedWinProb?: number,
): GameResult {
  const exp = expectedScore(a, b, aHome);
  // Keep the score model and displayed probability in the same units. A
  // gameplan changes the expected margin whose normal-CDF gives the new odds.
  let marginShift = 0;
  if (adjustedWinProb !== undefined && Math.abs(adjustedWinProb - exp.winProb) > 1e-12) {
    let lo = -10 * MARGIN_SD;
    let hi = 10 * MARGIN_SD;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (normalCdf(mid / MARGIN_SD) < adjustedWinProb) lo = mid;
      else hi = mid;
    }
    marginShift = (lo + hi) / 2 - exp.margin;
  }
  let scoreFor = Math.max(0, Math.round(exp.for + marginShift / 2 + gauss(rng) * SCORE_NOISE_SD));
  let scoreAgainst = Math.max(0, Math.round(exp.against - marginShift / 2 + gauss(rng) * SCORE_NOISE_SD));
  // overtime: no ties in college football
  let guard = 0;
  while (scoreFor === scoreAgainst && guard++ < 25) {
    scoreFor = Math.max(0, scoreFor + Math.round(gauss(rng) * 3));
    scoreAgainst = Math.max(0, scoreAgainst + Math.round(gauss(rng) * 3));
  }
  if (scoreFor === scoreAgainst) {
    if (rng() < (adjustedWinProb ?? exp.winProb)) scoreFor += 3;
    else scoreAgainst += 3;
  }
  return { scoreFor, scoreAgainst, won: scoreFor > scoreAgainst };
}

// ---------------------------------------------------------------------------
// season
// ---------------------------------------------------------------------------

export interface ScheduledGame {
  week: number;
  opponent: TeamBudget;
  oppRatings: Ratings;
  isHome: boolean;
  winProb: number;
  /** Present only after the weekly call has been made; winProb remains neutral. */
  gameplan?: GameplanResolution;
  result?: GameResult;
  /** postseason stage; undefined for regular-season games */
  stage?: "qf" | "sf" | "ncg" | "bowl";
  /** true for the 4 non-conference games (balanceable, rivalry-replaceable) */
  nonConf?: boolean;
  /** rivalry name when this game is the program's rivalry game */
  rivalry?: string;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a 12-game season for the user's program: conference games plus a
 * tiered non-conference slate (2 cupcakes, 1 peer, 1 statement game).
 */
export function generateSchedule(
  program: TeamBudget,
  teams: TeamBudget[],
  seed: number
): ScheduledGame[] {
  const rng = mulberry32(seed);
  const others = teams.filter((t) => t.slug !== program.slug);
  const bySpend = [...others].sort((a, b) => b.budget_mid_m - a.budget_mid_m);
  const top = bySpend.slice(0, 12);
  const mid = bySpend.slice(12, 45);
  const bottom = bySpend.slice(45);

  const pick = (pool: TeamBudget[], n: number, used: Set<string>): TeamBudget[] => {
    const avail = shuffle(pool.filter((t) => !used.has(t.slug)), rng);
    const out = avail.slice(0, n);
    out.forEach((t) => used.add(t.slug));
    return out;
  };

  const used = new Set<string>();
  const mates = shuffle(
    others.filter((t) => t.conference === program.conference),
    rng
  );
  const confGames = mates.slice(0, 8);
  confGames.forEach((t) => used.add(t.slug));

  const slate: { team: TeamBudget; nonConf: boolean }[] = confGames.map((t) => ({
    team: t,
    nonConf: false,
  }));
  // fill to 8 "conference-style" games from the middle tier if needed (e.g. Notre Dame)
  slate.push(
    ...pick(mid, Math.max(0, 8 - slate.length), used).map((t) => ({ team: t, nonConf: false }))
  );
  // non-conference: 2 cupcakes, 1 peer, 1 statement game
  slate.push(...pick(bottom, 2, used).map((t) => ({ team: t, nonConf: true })));
  slate.push(...pick(mid, 1, used).map((t) => ({ team: t, nonConf: true })));
  slate.push(...pick(top, 1, used).map((t) => ({ team: t, nonConf: true })));

  const ordered = shuffle(slate, rng);
  // exactly 7 home games
  const homeIdx = new Set(shuffle(ordered.map((_, i) => i), rng).slice(0, 7));

  return ordered.map((s, i) => {
    const oppRatings = teamRatings(s.team.budget_mid_m);
    // placeholder ratings for the user; replaced by the Season component with real ones
    const winProb = 0.5;
    return {
      week: i + 1,
      opponent: s.team,
      oppRatings,
      isHome: homeIdx.has(i),
      winProb,
      nonConf: s.nonConf,
    };
  });
}

export interface SeasonSummary {
  wins: number;
  losses: number;
  expectedWins: number;
  avgMargin: number;
  bestWin?: { opponent: string; scoreFor: number; scoreAgainst: number };
  worstLoss?: { opponent: string; scoreFor: number; scoreAgainst: number };
}

export function summarizeSeason(games: ScheduledGame[]): SeasonSummary {
  const played = games.filter((g) => g.result);
  const wins = played.filter((g) => g.result!.won).length;
  const expectedWins = games.reduce((s, g) => s + g.winProb, 0);
  const margins = played.map((g) => g.result!.scoreFor - g.result!.scoreAgainst);
  const avgMargin = margins.length
    ? margins.reduce((s, m) => s + m, 0) / margins.length
    : 0;
  const strength = (g: ScheduledGame) =>
    g.oppRatings.off + g.oppRatings.def + g.oppRatings.st;
  const winsSorted = played.filter((g) => g.result!.won).sort((a, b) => strength(b) - strength(a));
  const lossSorted = played.filter((g) => !g.result!.won).sort((a, b) => strength(a) - strength(b));
  const best = winsSorted[0];
  const worst = lossSorted[0];
  return {
    wins,
    losses: played.length - wins,
    expectedWins: Math.round(expectedWins * 10) / 10,
    avgMargin: Math.round(avgMargin * 10) / 10,
    bestWin: best
      ? { opponent: best.opponent.name, scoreFor: best.result!.scoreFor, scoreAgainst: best.result!.scoreAgainst }
      : undefined,
    worstLoss: worst
      ? { opponent: worst.opponent.name, scoreFor: worst.result!.scoreFor, scoreAgainst: worst.result!.scoreAgainst }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// roster DNA: how the user's spending compares to real programs
// ---------------------------------------------------------------------------

export interface GroupRank {
  key: PositionKey;
  label: string;
  spend: number;
  /** % of the 68 programs spending less on this group */
  percentile: number;
  nearestTeam: string;
  nearestSpend: number;
}

export function groupRanks(alloc: Allocation, teams: TeamBudget[]): GroupRank[] {
  return POSITION_GROUPS.map((g) => {
    const spend = alloc[g.key];
    const estimates = teams.map((t) => ({
      name: t.name,
      est: t.budget_mid_m * POSITION_SPLITS[g.key],
    }));
    const below = estimates.filter((e) => e.est < spend).length;
    const nearest = estimates.reduce((a, b) =>
      Math.abs(b.est - spend) < Math.abs(a.est - spend) ? b : a
    );
    return {
      key: g.key,
      label: g.label,
      spend: Math.round(spend * 10) / 10,
      percentile: Math.round((below / estimates.length) * 100),
      nearestTeam: nearest.name,
      nearestSpend: Math.round(nearest.est * 10) / 10,
    };
  });
}

/** Flavor labels for the allocation's shape. */
export function archetype(alloc: Allocation): string[] {
  const total = Object.values(alloc).reduce((s, v) => s + v, 0) || 1;
  const offShare = (alloc.QB + alloc.RB + alloc.WR + alloc.OL) / total;
  const defShare = (alloc.DL + alloc.LB + alloc.DB) / total;
  const labels: string[] = [];
  if (offShare - defShare > 0.08) labels.push("Offense-first");
  else if (defShare - offShare > 0.08) labels.push("Defense-first");
  else labels.push("Balanced");
  if (alloc.QB / total >= 0.22) labels.push("QB-centric");
  if ((alloc.OL + alloc.DL) / total >= 0.36) labels.push("Trench-built");
  if ((alloc.WR + alloc.DB) / total >= 0.3) labels.push("Speed-first");
  return labels;
}
