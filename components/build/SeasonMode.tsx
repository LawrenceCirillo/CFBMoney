"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { data } from "@/lib/data";
import type { TeamBudget } from "@/lib/types";
import {
  archetype,
  groupRanks,
  mulberry32,
  ratingsFromAllocation,
  simulateGame,
  summarizeSeason,
  withDepth,
  type Allocation,
  type Ratings,
  type ScheduledGame,
} from "@/lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "@/lib/moneyball";
import {
  PLAYOFF_CUT,
  buildSeasonGames,
  nextPostseasonGame,
  postseasonOpener,
  postseasonOutcome,
  preseasonExpectedWins,
  projectedRank,
  storylineFor,
  type PostseasonStage,
} from "@/lib/season-mode";
import { fmtMoney1 } from "@/lib/format";
import PublishPanel from "./PublishPanel";
import TeamMark from "@/components/TeamMark";

interface Props {
  alloc: Allocation;
  budgetM: number;
  program: TeamBudget;
  onBack: () => void;
}

const STAGE_LABEL: Record<PostseasonStage, string> = {
  qf: "Playoff quarterfinal",
  sf: "Playoff semifinal",
  ncg: "National championship",
  bowl: "The Money Bowl",
};
const STAGE_SHORT: Record<PostseasonStage, string> = {
  qf: "QF",
  sf: "SF",
  ncg: "NCG",
  bowl: "BOWL",
};

/** Projected final wins: actual wins + expected wins from unplayed games. */
function projection(games: ScheduledGame[]): number {
  return games.reduce((s, g) => s + (g.result ? (g.result.won ? 1 : 0) : g.winProb), 0);
}

function rankOf(games: ScheduledGame[], fieldProj: number[]): number {
  return projectedRank(projection(games), fieldProj);
}

function initGames(seed: number, userR: Ratings, program: TeamBudget): ScheduledGame[] {
  return buildSeasonGames(seed, userR, program, data.teams);
}

function probPill(p: number) {
  const pct = Math.round(p * 100);
  const cls =
    p >= 0.6
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : p >= 0.4
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${cls}`}>
      {pct}%
    </span>
  );
}

function ratingBars(you: Ratings, opp: Ratings) {
  const rows = [
    { label: "Offense", y: you.off, o: opp.off, color: "#34d399" },
    { label: "Defense", y: you.def, o: opp.def, color: "#60a5fa" },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-[11px] font-semibold text-fog">
            <span>{r.label}</span>
            <span className="tabular-nums">
              <span className="font-bold text-paper">{r.y.toFixed(0)}</span>
              {" · "}
              <span className="text-fog">{r.o.toFixed(0)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (r.y / 100) * 100)}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 20 }}
            />
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line/50">
            <div
              className="h-full rounded-full bg-fog"
              style={{ width: `${Math.min(100, (r.o / 100) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-fog">You (bright) vs opponent (dim)</p>
    </div>
  );
}

export default function SeasonMode({ alloc, budgetM, program, onBack }: Props) {
  const userR = useMemo(() => ratingsFromAllocation(withDepth(alloc, budgetM)), [alloc, budgetM]);
  const field = useMemo(() => fieldRatings(), []);
  const fieldProj = useMemo(
    () =>
      data.teams
        .filter((t) => t.slug !== program.slug)
        .map((t) => modeledExpectedWins(t.budget_mid_m, field)),
    [program.slug, field]
  );

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const rngRef = useRef<(() => number) | null>(null);
  if (rngRef.current === null) rngRef.current = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [games, setGames] = useState<ScheduledGame[]>(() => initGames(seed, userR, program));
  const [rankHistory, setRankHistory] = useState<number[]>(() => [
    rankOf(initGames(seed, userR, program), fieldProj),
  ]);
  // index into games[] of the matchup featured in the big card
  const [featured, setFeatured] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => summarizeSeason(games), [games]);
  // The honest exam: regular-season wins vs the roster's preseason projection.
  const regWins = games.filter((g) => !g.stage && g.result?.won).length;
  const projWins = preseasonExpectedWins(games);
  const vsProj = regWins - projWins;
  const played = games.filter((g) => g.result).length;
  const done = played === games.length;
  const postseasonStarted = games.some((g) => g.stage);

  const rank = rankHistory[rankHistory.length - 1];
  const prevRank = rankHistory.length > 1 ? rankHistory[rankHistory.length - 2] : null;
  const rankDelta = prevRank != null ? prevRank - rank : 0; // positive = climbed

  const outcome = done ? postseasonOutcome(games) : null;
  const dna = useMemo(() => groupRanks(withDepth(alloc, budgetM), data.teams), [alloc, budgetM]);
  const tags = useMemo(() => archetype(alloc), [alloc]);
  const qbDna = dna.find((d) => d.key === "QB")!;

  const ctx = { program, teams: data.teams, userR, field, rng: () => rngRef.current!() };

  const newSeason = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    const s = Math.floor(Math.random() * 2 ** 31);
    rngRef.current = mulberry32((s ^ 0x9e3779b9) >>> 0);
    setSeed(s);
    const g = initGames(s, userR, program);
    setGames(g);
    setRankHistory([rankOf(g, fieldProj)]);
    setFeatured(0);
    setRevealing(false);
    setCopied(false);
  };

  /** Simulate the featured game with a beat of theater, then schedule what's next. */
  const kickoff = () => {
    if (revealing || done) return;
    const g = games[featured];
    if (!g || g.result) return;
    setRevealing(true);
    revealTimer.current = setTimeout(() => {
      const result = simulateGame(userR, g.oppRatings, g.isHome, rngRef.current!);
      const next = [...games];
      next[featured] = { ...g, result };

      // Rank snapshot from results so far — before any unplayed postseason
      // game is appended and pollutes the projection.
      const snapshot = rankOf(next, fieldProj);

      // Schedule what's next.
      const used = new Set(next.map((x) => x.opponent.slug));
      const regularComplete = next.filter((x) => !x.stage).every((x) => x.result);
      if (!g.stage && regularComplete && !next.some((x) => x.stage)) {
        // Regular season just ended — seed the postseason.
        next.push(postseasonOpener(snapshot, used, ctx));
      } else if (g.stage && result.won) {
        const nxt = nextPostseasonGame(g.stage, used, ctx);
        if (nxt) next.push(nxt);
      }

      setGames(next);
      setRankHistory((h) => [...h, snapshot]);
      setRevealing(false);
    }, 1100);
  };

  const advance = () => {
    const i = games.findIndex((g) => !g.result);
    setFeatured(i === -1 ? games.length - 1 : i);
  };

  /** Skip the theater: simulate every remaining game instantly. */
  const simToEnd = () => {
    if (revealing) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    let next = games.map((g) =>
      g.result ? g : { ...g, result: simulateGame(userR, g.oppRatings, g.isHome, rngRef.current!) }
    );
    // Append postseason stages as they unlock.
    for (;;) {
      const regularComplete = next.filter((x) => !x.stage).every((x) => x.result);
      if (!regularComplete) break;
      const used = new Set(next.map((x) => x.opponent.slug));
      const last = next[next.length - 1];
      if (!next.some((x) => x.stage)) {
        const opener = postseasonOpener(rankOf(next, fieldProj), used, ctx);
        opener.result = simulateGame(userR, opener.oppRatings, opener.isHome, rngRef.current!);
        next = [...next, opener];
        continue;
      }
      if (last.stage && last.result && last.result.won) {
        const nxt = nextPostseasonGame(last.stage, used, ctx);
        if (!nxt) break;
        nxt.result = simulateGame(userR, nxt.oppRatings, nxt.isHome, rngRef.current!);
        next = [...next, nxt];
        continue;
      }
      break;
    }
    setGames(next);
    setRankHistory((h) => [...h, rankOf(next, fieldProj)]);
    setFeatured(next.length - 1);
  };

  const copySummary = async () => {
    const s = summary;
    const text =
      `CFB MONEY — Season mode\n` +
      `$${budgetM}M roster · ${program.name} · ${s.wins}-${s.losses} (${s.expectedWins} expected)\n` +
      `${tags.join(" · ")}\n` +
      (outcome ? `${outcome}\n` : "") +
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

  const fg = games[featured];
  const prevGame = featured > 0 ? games[featured - 1] : null;
  const story = fg && !fg.result ? storylineFor(fg, prevGame) : null;
  const fgUpset =
    fg?.result && ((fg.result.won && fg.winProb < 0.35) || (!fg.result.won && fg.winProb > 0.65));

  const statusCard = !done ? (
    postseasonStarted ? (
      { label: "Postseason", value: "Live", cls: "text-amber-400" }
    ) : rank <= PLAYOFF_CUT ? (
      { label: "Playoff field", value: "In", cls: "text-emerald-400" }
    ) : rank <= 25 ? (
      { label: "Cut line", value: `#${PLAYOFF_CUT}`, cls: "text-amber-400" }
    ) : (
      { label: "Cut line", value: `#${PLAYOFF_CUT}`, cls: "text-fog" }
    )
  ) : outcome ? (
    { label: "Postseason", value: outcome, cls: "text-amber-400" }
  ) : (
    { label: "Postseason", value: "—", cls: "text-fog" }
  );

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
              Step 3 · Season mode · {program.conference}
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              {program.name} <span className="text-fog">2026</span>
            </h2>
            <p className="mt-1 text-sm text-fog">
              Offense {userR.off.toFixed(0)} · Defense {userR.def.toFixed(0)} ·{" "}
              {projWins.toFixed(1)} projected wins
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!done && (
            <button
              onClick={simToEnd}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              Sim to end
            </button>
          )}
          <button
            onClick={newSeason}
            className="rounded-full border border-line px-5 py-2.5 text-sm text-fog transition-ui hover:border-fog hover:text-paper"
          >
            New season
          </button>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
        <div className="bg-ink px-5 py-6">
          <p className="text-[11px] font-semibold text-fog">Record</p>
          <p className="tnum mt-2 text-3xl font-black tracking-tight">{summary.wins}–{summary.losses}</p>
        </div>
        <div className="bg-ink px-5 py-6">
          <p className="text-[11px] font-semibold text-fog">Proj. rank</p>
          <p className="tnum mt-2 text-3xl font-black tracking-tight">
            #{rank}
            {rankDelta !== 0 && (
              <span
                className={`ml-2 align-middle text-sm font-bold ${
                  rankDelta > 0 ? "text-up" : "text-down"
                }`}
              >
                {rankDelta > 0 ? "+" : "−"}{Math.abs(rankDelta)}
              </span>
            )}
          </p>
        </div>
        <div className="bg-ink px-5 py-6">
          <p className="text-[11px] font-semibold text-fog">{statusCard.label}</p>
          <p className={`mt-2 truncate text-2xl font-black tracking-tight ${statusCard.cls}`}>
            {statusCard.value}
          </p>
        </div>
        <div className="bg-ink px-5 py-6">
          <p className="text-[11px] font-semibold text-fog">Played</p>
          <p className="tnum mt-2 text-3xl font-black tracking-tight">
            {played}
            <span className="text-lg text-fog">/{games.length}</span>
          </p>
        </div>
      </div>

      {!done && fg && (
        <div className="mb-12">
          {story && (
            <p className="text-xs font-semibold text-fog">
              {story.tag}
              <span className="ml-3 font-medium text-fog">{story.blurb}</span>
            </p>
          )}
          <div className="mt-3 flex items-center gap-4">
            <TeamMark
              slug={fg.opponent.slug}
              name={fg.opponent.name}
              abbr={fg.opponent.abbr}
              color={fg.opponent.color}
              size="xl"
            />
            <div>
              <p className="text-xs font-semibold text-fog">
                {fg.stage ? STAGE_LABEL[fg.stage] : `Week ${fg.week}`}
                {fg.isHome ? " · vs" : " · at"}
                {fg.stage === "sf" && !games.some((g) => g.stage === "qf") && " · first-round bye"}
              </p>
              <h3 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
                {fg.opponent.name}
              </h3>
              <p className="mt-1 text-sm text-fog">
                {fg.opponent.conference}
                {fg.opponent.ap_rank != null && ` · AP #${fg.opponent.ap_rank}`}
              </p>
              <div className="mt-2">{probPill(fg.winProb)}</div>
            </div>
          </div>

          <div className="mt-8 grid items-end gap-10 sm:grid-cols-2">
            <div>{ratingBars(userR, fg.oppRatings)}</div>
            <div>
              <AnimatePresence mode="wait" initial={false}>
                {revealing ? (
                  <motion.div
                    key="live"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.p
                      animate={{ opacity: [1, 0.35, 1] }}
                      transition={{ repeat: Infinity, duration: 0.9 }}
                      className="text-xs font-semibold text-amber-400"
                    >
                      Live
                    </motion.p>
                    <p className="tnum mt-2 text-6xl font-black tracking-tight text-fog">– : –</p>
                    <p className="mt-2 text-sm text-fog">The sim is deciding.</p>
                  </motion.div>
                ) : fg.result ? (
                  <motion.div
                    key={`final-${featured}-${seed}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {fgUpset && (
                      <p className="text-xs font-semibold text-amber-400">Upset</p>
                    )}
                    <p
                      className={`tnum mt-2 text-6xl font-black tracking-tight sm:text-7xl ${
                        fg.result.won ? "text-up" : "text-down"
                      }`}
                    >
                      {fg.result.won ? "W" : "L"} {fg.result.scoreFor}–{fg.result.scoreAgainst}
                    </p>
                    <button
                      onClick={advance}
                      className="mt-6 rounded-xl bg-emerald-500 px-8 py-3.5 text-lg font-bold text-ink transition-ui hover:bg-emerald-400"
                    >
                      {games.some((g) => !g.result) ? "Play next week" : "Open season report"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`pre-${featured}-${seed}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="tnum text-6xl font-black tracking-tight text-fog">– : –</p>
                    <button
                      onClick={kickoff}
                      className="mt-6 rounded-xl bg-emerald-500 px-10 py-3.5 text-lg font-bold text-ink transition-ui hover:bg-emerald-400"
                    >
                      Kick off
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-line">
        {games
          .filter((g) => g.result)
          .map((g) => {
            const r = g.result!;
            const upset = (r.won && g.winProb < 0.35) || (!r.won && g.winProb > 0.65);
            return (
              <div
                key={`${seed}-${g.stage ?? "reg"}-${g.week}`}
                className="flex items-center gap-4 border-b border-line/60 py-3"
              >
                <span className="w-14 shrink-0 text-xs font-semibold text-fog">
                  {g.stage ? STAGE_SHORT[g.stage] : `Wk ${g.week}`}
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
                    {g.stage ? STAGE_LABEL[g.stage] : g.opponent.conference}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {upset && (
                    <span className="text-[11px] font-semibold text-amber-400">
                      Upset
                    </span>
                  )}
                  <span
                    className={`tnum text-lg font-black ${
                      r.won ? "text-up" : "text-down"
                    }`}
                  >
                    {r.won ? "W" : "L"} {r.scoreFor}–{r.scoreAgainst}
                  </span>
                </div>
              </div>
            );
          })}
        {played === 0 && (
          <p className="py-8 text-sm text-fog">
            No games played yet. Kick off week 1 above.
          </p>
        )}
      </div>

      {/* season report */}
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-16 border-t border-line pt-8"
        >
          <p className="text-xs font-semibold text-fog">Season report</p>
          {outcome && (
            <p
              className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${
                outcome === "National champions" || outcome === "Money Bowl champions"
                  ? "text-amber-400"
                  : "text-paper"
              }`}
            >
              {outcome}
            </p>
          )}
          <p className="tnum mt-3 text-6xl font-black tracking-tight sm:text-7xl">
            {summary.wins}–{summary.losses}
          </p>
          <p className="mt-3 max-w-xl text-sm text-fog">
            Final projected rank #{rank} · this roster projected {projWins.toFixed(1)} wins.
            {vsProj > 0.05
              ? ` Beat it by ${vsProj.toFixed(1)} — the build outplayed the money.`
              : vsProj < -0.05
                ? ` Missed it by ${Math.abs(vsProj).toFixed(1)} — bad luck, or a soft build.`
                : ` Right on the number. The money never lies.`}
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-2 gap-px bg-edge">
            {summary.bestWin && (
              <div className="bg-ink py-5 pr-5">
                <p className="text-[11px] font-semibold text-up">Best win</p>
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
                <p className="text-[11px] font-semibold text-down">Worst loss</p>
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
            games={games}
            program={program}
            alloc={alloc}
            budgetM={budgetM}
            seed={seed}
            userR={userR}
          />

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={copySummary}
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              {copied ? "Copied" : "Copy season summary"}
            </button>
            <button
              onClick={newSeason}
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              New season
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
        <summary className="font-semibold text-paper">How season mode works</summary>
        <div className="mt-3 max-w-2xl space-y-2 leading-relaxed">
          <p>
            You play all 12 regular-season games one week at a time. Your projected
            rank compares your projected final wins (actual + expected from
            remaining games) against every other program&rsquo;s modeled expected wins —
            win and you climb, lose and you fall.
          </p>
          <p>
            Your slate is fixed — the same exam for every GM at your program.
            Beat your projected wins; that&rsquo;s the job. The money doesn&rsquo;t buy a
            playoff roster at a blue-blood, so an 8–4 season with a bowl trophy
            is a triumph, not a consolation.
          </p>
          <p>
            Finish in the projected top {PLAYOFF_CUT} and you&rsquo;re in the playoff:
            seeds 5–12 play a quarterfinal, seeds 1–4 get a bye to the semifinal,
            then the national championship. Everyone else plays the Money Bowl
            against a peer.
          </p>
          <p>
            Same simulation math as quick sim — every dollar buys talent with
            diminishing returns, opponents are rated from their estimated budgets,
            and ties go to overtime.
          </p>
        </div>
      </details>
    </div>
  );
}
