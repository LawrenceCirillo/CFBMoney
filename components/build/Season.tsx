"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { data } from "@/lib/data";
import type { TeamBudget } from "@/lib/types";
import {
  archetype,
  groupRanks,
  ratingsFromAllocation,
  summarizeSeason,
  type Allocation,
  type ScheduledGame,
} from "@/lib/simulator";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason, type ReplayInput } from "@/lib/season-replay";
import { GRAVITY_VERSION } from "@/lib/gravity";
import { fmtMoney1 } from "@/lib/format";
import TeamMark from "@/components/TeamMark";
import ProbabilityPill from "./ProbabilityPill";
import PublishPanel from "./PublishPanel";

interface Props {
  alloc: Allocation;
  budgetM: number;
  gravityOn: boolean;
  program: TeamBudget;
  onBack: () => void;
}

export default function Season({ alloc, budgetM, gravityOn, program, onBack }: Props) {
  const userR = useMemo(() => ratingsFromAllocation(alloc, { programSlug: program.slug, gravityOn }), [alloc, program.slug, gravityOn]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const input: ReplayInput = { mode: "quick", simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT, seed, programSlug: program.slug, budgetM, alloc, gameplan: [], autoGameplan: true, gravityOn, gravityVersion: GRAVITY_VERSION };
  const [games, setGames] = useState<ScheduledGame[]>(() => replaySeason(input, 0).games);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => summarizeSeason(games), [games]);
  const played = games.filter((g) => g.result).length;
  const done = played === games.length;
  const dna = useMemo(() => groupRanks(alloc, data.teams), [alloc]);
  const tags = useMemo(() => archetype(alloc), [alloc]);
  const qbDna = dna.find((d) => d.key === "QB")!;

  const newSeason = () => {
    const s = Math.floor(Math.random() * 2 ** 31);
    setSeed(s);
    setGames(replaySeason({ ...input, seed: s }, 0).games);
    setCopied(false);
  };

  const simWeek = () => setGames(replaySeason(input, played + 1).games);
  const simSeason = () => setGames(replaySeason(input).games);

  const copySummary = async () => {    const s = summary;
    const text =
      `CFB MONEY — Build-a-Roster sim\n` +
      `$${budgetM}M roster · ${program.name} · ${s.wins}-${s.losses} (${s.expectedWins} expected)\n` +
      `${tags.join(" · ")}\n` +
      `QB room costs ${fmtMoney1(qbDna.spend)} — more than ${qbDna.percentile}% of programs\n` +
      (s.bestWin ? `Best win: ${s.bestWin.opponent} ${s.bestWin.scoreFor}-${s.bestWin.scoreAgainst}\n` : "") +
      (s.worstLoss ? `Worst loss: ${s.worstLoss.opponent} ${s.worstLoss.scoreFor}-${s.worstLoss.scoreAgainst}` : "");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <TeamMark
            slug={program.slug}
            name={program.name}
            abbr={program.abbr}
            color={program.color}
            size="xl"
          />
          <div>
            <p className="text-xs font-semibold text-fog">
              Step 3 · Quick sim · {program.conference}
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              {program.name} <span className="text-fog">2026</span>
            </h2>
            <p className="mt-1 text-sm text-fog">
              Offense {userR.off.toFixed(0)} · Defense {userR.def.toFixed(0)} ·{" "}
              {summary.expectedWins} expected wins
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!done && (
            <>
              <button
                onClick={simWeek}
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink transition-ui hover:bg-emerald-400"
              >
                Sim week {played + 1}
              </button>
              <button
                onClick={simSeason}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-paper transition-ui hover:border-fog"
              >
                Sim season
              </button>
            </>
          )}
          <button
            onClick={newSeason}
            className="rounded-full border border-line px-5 py-2.5 text-sm text-fog transition-ui hover:border-fog hover:text-paper"
          >
            New season
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
        {[
          { label: "Record", value: `${summary.wins}–${summary.losses}`, sub: "this run" },
          { label: "Expected", value: summary.expectedWins.toFixed(1), sub: "preseason" },
          {
            label: "Avg margin",
            value:
              played > 0
                ? `${summary.avgMargin > 0 ? "+" : ""}${summary.avgMargin.toFixed(1)}`
                : "—",
            sub: "points",
          },
          { label: "Played", value: `${played}/${games.length}`, sub: "weeks" },
        ].map((s) => (
          <div key={s.label} className="bg-ink px-5 py-6">
            <p className="text-[11px] font-semibold text-fog">{s.label}</p>
            <p className="tnum mt-2 text-3xl font-black tracking-tight">{s.value}</p>
            <p className="mt-1 text-sm text-fog">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        {games.map((g) => {
          const r = g.result;
          const upset =
            r && ((r.won && g.winProb < 0.35) || (!r.won && g.winProb > 0.65));
          return (
            <div
              key={`${seed}-${g.week}`}
              className="flex items-center gap-4 border-b border-line/60 py-3.5"
            >
              <span className="w-14 shrink-0 text-xs font-semibold text-fog">
                Wk {g.week}
              </span>
              <TeamMark
                slug={g.opponent.slug}
                name={g.opponent.name}
                abbr={g.opponent.abbr}
                color={g.opponent.color}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-paper">
                  <span className="mr-2 text-xs font-normal text-fog">
                    {g.isHome ? "vs" : "at"}
                  </span>
                  {g.opponent.name}
                </p>
                <p className="text-xs text-fog">
                  {g.opponent.conference}
                  {g.opponent.ap_rank != null &&
                    ` · AP #${g.opponent.ap_rank}`}
                </p>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {r ? (
                  <motion.div
                    key={`r-${g.week}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3"
                  >
                    {upset && (
                      <span className="text-[11px] font-semibold text-status-caution">
                        Upset
                      </span>
                    )}
                    <span
                      className={`tnum text-lg font-black ${
                        r.won ? "text-status-success" : "text-status-loss"
                      }`}
                    >
                      {r.won ? "W" : "L"} {r.scoreFor}–{r.scoreAgainst}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`p-${g.week}`}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-2"
                  >
                    <ProbabilityPill probability={g.winProb} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* season report */}
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-16 border-t border-line pt-8"
        >
          <p className="text-xs font-semibold text-fog">Season report</p>
          <p className="mt-1 text-xs font-semibold text-fog">Gravity {gravityOn ? "on" : "off · Pure parity"} · {GRAVITY_VERSION}</p>
          <p className="tnum mt-3 text-6xl font-black tracking-tight sm:text-7xl">
            {summary.wins}–{summary.losses}
          </p>
          <p className="mt-3 max-w-xl text-sm text-fog">
            This roster projected {summary.expectedWins.toFixed(1)} wins.
            {summary.wins - summary.expectedWins > 0.05
              ? ` Beat it by ${(summary.wins - summary.expectedWins).toFixed(1)} — the build outplayed the money.`
              : summary.expectedWins - summary.wins > 0.05
                ? ` Missed it by ${(summary.expectedWins - summary.wins).toFixed(1)} — bad luck, or a soft build.`
                : ` Right on the number. The money never lies.`}
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-2 gap-px bg-edge">
            {summary.bestWin && (
              <div className="bg-ink py-5 pr-5">
                <p className="text-[11px] font-semibold text-status-success">Best win</p>
                <p className="mt-2 font-semibold">
                  {summary.bestWin.opponent}{" "}
                  <span className="tnum text-fog">
                    {summary.bestWin.scoreFor}–{summary.bestWin.scoreAgainst}
                  </span>
                </p>
              </div>
            )}
            {summary.worstLoss && (
              <div className="bg-ink py-5 pl-5">
                <p className="text-[11px] font-semibold text-status-loss">Worst loss</p>
                <p className="mt-2 font-semibold">
                  {summary.worstLoss.opponent}{" "}
                  <span className="tnum text-fog">
                    {summary.worstLoss.scoreFor}–{summary.worstLoss.scoreAgainst}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="mt-8">
            <p className="text-xs font-semibold text-fog">Roster DNA</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-paper"
                >
                  {t}
                </span>
              ))}
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-fog">
              <li>
                <span className="font-semibold text-paper">QB room: {fmtMoney1(qbDna.spend)}</span>{" "}
                — outspends {qbDna.percentile}% of programs, closest to {qbDna.nearestTeam} (
                {fmtMoney1(qbDna.nearestSpend)}).
              </li>
              {dna
                .filter((d) => d.key === "OL" || d.key === "DL")
                .map((d) => (
                  <li key={d.key}>
                    <span className="font-semibold text-paper">
                      {d.label}: {fmtMoney1(d.spend)}
                    </span>{" "}
                    — outspends {d.percentile}% of programs, closest to {d.nearestTeam}.
                  </li>
                ))}
            </ul>
          </div>

          <PublishPanel
            mode="quick"
            games={games}
            program={program}
            alloc={alloc}
            budgetM={budgetM}
            gravityOn={gravityOn}
            seed={seed}
          />

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={copySummary}
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              {copied ? "Copied" : "Copy season summary"}
            </button>
            <button
              onClick={onBack}
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              Back to roster
            </button>
          </div>
        </motion.div>
      )}

      <details className="mt-16 border-t border-line pt-6 text-sm text-fog">
        <summary className="font-semibold text-paper">How the sim works</summary>
        <div className="mt-3 max-w-2xl space-y-2 leading-relaxed">
          <p>
            Every dollar buys talent with diminishing returns — the first million at a
            position matters far more than the tenth. Talent becomes offense, defense
            and special-teams ratings (0–100).
          </p>
          <p>
            Opponents are rated with the same formula from their estimated budgets, so
            nobody gets a thumb on the scale — your edge comes from allocating smarter
            than the average program.
          </p>
          <p>
            Expected score = baseline + rating gaps + home-field edge. Win probability
            comes from the historical spread of college margins; final scores add
            realistic noise, and ties go to overtime. Displayed win % and simulated
            results agree by construction.
          </p>
          <p>
            Opponent budgets are estimates reported by The Athletic. Position-level
            spending splits are modeled, not reported.
          </p>
        </div>
      </details>
    </div>
  );
}
