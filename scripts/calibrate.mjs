// scripts/calibrate.mjs — dev-only sanity checks for the simulator model.
// Run: node scripts/calibrate.mjs
// Targets:
//   - 68-team overall ratings monotonic in budget, plausible spread
//   - $30M named strategies spread ~4-6 rating points (strategic depth)
//   - Tiered seasons look like college football (elite ~10-11 wins, bad ~2-4)
//   - Simulated upset rate matches displayed win probability

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POSITION_GROUPS,
  emptyAllocation,
  ratingsFromAllocation,
  teamRatings,
  optimalAllocation,
  expectedScore,
  simulateGame,
  generateSchedule,
  mulberry32,
} from "../lib/simulator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "public/data/cfb-2026.json"), "utf8"));

const overall = (r) => 0.46 * r.off + 0.46 * r.def + 0.08 * r.st;

console.log("=== 1. Team rating spread (monotonic in budget) ===");
const rated = data.teams.map((t) => ({ name: t.name, mid: t.budget_mid_m, r: overall(teamRatings(t.budget_mid_m)) }));
rated.sort((a, b) => b.r - a.r);
console.log("top 5:", rated.slice(0, 5).map((t) => `${t.name} ${t.r.toFixed(1)}`).join(" | "));
console.log("bot 5:", rated.slice(-5).map((t) => `${t.name} ${t.r.toFixed(1)}`).join(" | "));

console.log("\n=== 2. $30M optimal vs even ===");
const even = emptyAllocation();
for (const g of POSITION_GROUPS) even[g.key] = 30 / 8;
const opt = optimalAllocation(30);
console.log("even splits overall:", overall(ratingsFromAllocation(even)).toFixed(1));
console.log("optimal overall:   ", overall(ratingsFromAllocation(opt)).toFixed(1));
console.log("optimal alloc:", Object.entries(opt).map(([k, v]) => `${k} $${v.toFixed(1)}`).join(" "));
console.log("Ohio State ($51.5M) overall:", overall(teamRatings(51.5)).toFixed(1));

console.log("\n=== 3. Win-prob consistency (empirical vs displayed, 20k sims each) ===");
const cases = [
  ["pick'em", teamRatings(27.2), teamRatings(27.2)],
  ["good vs avg", teamRatings(40), teamRatings(27.2)],
  ["elite vs bad", teamRatings(51.5), teamRatings(15)],
];
for (const [label, a, b] of cases) {
  const exp = expectedScore(a, b, true);
  const rng = mulberry32(42);
  let w = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (simulateGame(a, b, true, rng).won) w++;
  console.log(`${label}: displayed ${(exp.winProb * 100).toFixed(1)}% vs simulated ${((w / N) * 100).toFixed(1)}%`);
}

console.log("\n=== 4. Named $30M strategies (spread = strategic depth) ===");
const strategies = {
  "even splits": { QB: 3.75, RB: 3.75, WR: 3.75, OL: 3.75, DL: 3.75, LB: 3.75, DB: 3.75, ST: 3.75 },
  "QB + trenches": { QB: 6, RB: 2, WR: 3, OL: 5.5, DL: 5.5, LB: 2, DB: 4.5, ST: 1.5 },
  "air raid": { QB: 7, RB: 1.5, WR: 6, OL: 4, DL: 3.5, LB: 2, DB: 4.5, ST: 1.5 },
  "defense wins": { QB: 3, RB: 2.5, WR: 3, OL: 4, DL: 6.5, LB: 4.5, DB: 5, ST: 1.5 },
  "stars & scrubs": { QB: 8, RB: 1, WR: 5, OL: 3, DL: 6, LB: 1.5, DB: 4, ST: 1.5 },
};
for (const [name, alloc] of Object.entries(strategies)) {
  const r = ratingsFromAllocation(alloc);
  console.log(`${name}: overall ${overall(r).toFixed(1)} (off ${r.off.toFixed(0)} / def ${r.def.toFixed(0)} / st ${r.st.toFixed(0)})`);
}

console.log("\n=== 5. Full tiered seasons (20 seasons each) ===");
const fakeUser = { name: "User", slug: "user", abbr: "USR", color: "#fff", conference: "SEC", budget_low_m: 27, budget_high_m: 27, budget_mid_m: 27, spend_rank: 0, preseason_rank: null, ap_rank: null, value_gap: null };
for (const [label, userR] of [
  ["BC-like ($10.5M splits)", teamRatings(10.5)],
  ["$30M optimal", ratingsFromAllocation(optimalAllocation(30))],
  ["OSU-like ($51.5M splits)", teamRatings(51.5)],
]) {
  const records = [];
  for (let s = 0; s < 20; s++) {
    const sched = generateSchedule(fakeUser, data.teams, 1000 + s);
    const rng = mulberry32(5000 + s);
    let w = 0;
    for (const g of sched) {
      if (simulateGame(userR, g.oppRatings, g.isHome, rng).won) w++;
    }
    records.push(w);
  }
  records.sort((a, b) => a - b);
  console.log(`${label}: ${records.join(",")}`);
}
