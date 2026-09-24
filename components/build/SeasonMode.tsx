"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { data } from "@/lib/data";
import type { TeamBudget } from "@/lib/types";
import {
  archetype,
  groupRanks,
  ratingsFromAllocation,
  summarizeSeason,
  type Allocation,
  type Ratings,
  type ScheduledGame,
} from "@/lib/simulator";
import { expectedWins as modeledExpectedWins, fieldRatings } from "@/lib/moneyball";
import {
  PLAYOFF_CUT,
  postseasonOutcome,
  preseasonExpectedWins,
  projectedRank,
  storylineFor,
  type PostseasonStage,
} from "@/lib/season-mode";
import { DATA_FINGERPRINT, SIM_VERSION, replaySeason, type ReplayInput } from "@/lib/season-replay";
import { GRAVITY_VERSION } from "@/lib/gravity";
import { fmtMoney1 } from "@/lib/format";
import PublishPanel from "./PublishPanel";
import PlayoffPath from "./PlayoffPath";
import TeamMark from "@/components/TeamMark";
import ProbabilityPill from "./ProbabilityPill";
import { useSeasonTicker } from "@/components/SeasonTickerContext";
import {
  DEFENSIVE_OPTIONS, OFFENSIVE_OPTIONS, defTagLabel, gameplanNarration,
  gameplanRecord, neutralPick, offTagLabel, resolveGameplan,
  tendencyLabel, type DefensiveTendency, type GameplanPick, type OffensiveTendency,
} from "@/lib/gameplan";

interface Props {
  alloc: Allocation;
  budgetM: number;
  gravityOn: boolean;
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
  return projectedRank(projection(games.filter((g) => !g.stage || !!g.result)), fieldProj);
}

function edgeText(edge: number): string {
  return edge > 0 ? `your edge (+${edge}%)` : edge < 0 ? `uphill (−${Math.abs(edge)}%)` : "neutral (0%)";
}

function edgeColor(edge: number): string {
  return edge > 0 ? "text-status-success" : edge < 0 ? "text-status-loss" : "text-fog";
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

export default function SeasonMode({ alloc, budgetM, gravityOn, program, onBack }: Props) {
  const { setSeason: setTickerSeason } = useSeasonTicker();
  const userR = useMemo(() => ratingsFromAllocation(alloc, { programSlug: program.slug, gravityOn }), [alloc, program.slug, gravityOn]);
  const field = useMemo(() => fieldRatings(), []);
  const fieldProj = useMemo(
    () =>
      data.teams
        .filter((t) => t.slug !== program.slug)
        .map((t) => modeledExpectedWins(t.budget_mid_m, field)),
    [program.slug, field]
  );

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [gameplan, setGameplan] = useState<GameplanPick[]>([]);
  const [autoGameplan, setAutoGameplan] = useState(false);
  const [offPick, setOffPick] = useState<OffensiveTendency | null>(null);
  const [defPick, setDefPick] = useState<DefensiveTendency | null>(null);
  const input: ReplayInput = { mode: "season", simVersion: SIM_VERSION, dataFingerprint: DATA_FINGERPRINT, seed, programSlug: program.slug, budgetM, alloc, gameplan, autoGameplan, gravityOn, gravityVersion: GRAVITY_VERSION };
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [games, setGames] = useState<ScheduledGame[]>(() => replaySeason(input, 0).games);
  const [rankHistory, setRankHistory] = useState<number[]>(() => [
    rankOf(replaySeason(input, 0).games, fieldProj),
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

  useEffect(() => {
    setTickerSeason({
      programSlug: program.slug,
      programAbbr: program.abbr,
      featured,
      done,
      games: games.map((game) => ({
        week: game.week,
        stage: game.stage,
        opponentSlug: game.opponent.slug,
        opponentAbbr: game.opponent.abbr,
        isHome: game.isHome,
        scoreFor: game.result?.scoreFor,
        scoreAgainst: game.result?.scoreAgainst,
        won: game.result?.won,
      })),
    });
  }, [games, featured, done, program.slug, program.abbr, setTickerSeason]);

  useEffect(() => () => setTickerSeason(null), [setTickerSeason]);

  const rank = rankHistory[rankHistory.length - 1];
  const prevRank = rankHistory.length > 1 ? rankHistory[rankHistory.length - 2] : null;
  const rankDelta = prevRank != null ? prevRank - rank : 0; // positive = climbed

  const outcome = done ? postseasonOutcome(games) : null;
  const dna = useMemo(() => groupRanks(alloc, data.teams), [alloc]);
  const tags = useMemo(() => archetype(alloc), [alloc]);
  const qbDna = dna.find((d) => d.key === "QB")!;
  const coachingRecord = gameplanRecord(games.filter((game) => game.result).map((game) => ({
    won: game.result!.won, winProb: game.winProb, gameplan: game.gameplan,
  })));

  const newSeason = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    const s = Math.floor(Math.random() * 2 ** 31);
    setSeed(s);
    const g = replaySeason({ ...input, seed: s, gameplan: [], autoGameplan: false }, 0).games;
    setGames(g);
    setRankHistory([rankOf(g, fieldProj)]);
    setFeatured(0);
    setRevealing(false);
    setCopied(false);
    setGameplan([]);
    setAutoGameplan(false);
    setOffPick(null);
    setDefPick(null);
  };

  /** Simulate the featured game with a short beat, then schedule what's next. */
  const kickoff = () => {
    if (revealing || done) return;
    const g = games[featured];
    if (!g || g.result) return;
    if (!autoGameplan && (!offPick || !defPick)) return;
    const pick = autoGameplan ? neutralPick(g.week) : { week: g.week, off: offPick!, def: defPick! };
    const nextCalls = [...gameplan, pick];
    const nextInput = { ...input, gameplan: nextCalls };
    setGameplan(nextCalls);
    setRevealing(true);
    revealTimer.current = setTimeout(() => {
      const next = replaySeason(nextInput, played + 1).games;
      const snapshot = rankOf(next, fieldProj);
      setGames(next);
      setRankHistory((h) => [...h, snapshot]);
      setRevealing(false);
    }, 450);
  };

  const advance = () => {
    const i = games.findIndex((g) => !g.result);
    setFeatured(i === -1 ? games.length - 1 : i);
    setOffPick(null);
    setDefPick(null);
  };

  /** Skip the theater: simulate every remaining game instantly. */
  const simToEnd = () => {
    if (revealing || !autoGameplan) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    const next = replaySeason(input).games;
    setGames(next);
    setGameplan(next.map((game) => ({ week: game.week, off: game.gameplan!.off, def: game.gameplan!.def })));
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
      coachingRecord.map((row) => `${row.label}: ${row.wins}-${row.losses} (${row.aboveExpected >= 0 ? "+" : ""}${row.aboveExpected.toFixed(1)} vs expected)`).join("\n") + "\n" +
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
  const shownOff = autoGameplan ? "balanced" : offPick ?? "balanced";
  const shownDef = autoGameplan ? "base" : defPick ?? "base";
  const previewPlan = fg && !fg.result
    ? resolveGameplan({ week: fg.week, off: shownOff, def: shownDef }, fg.opponent.slug, fg.winProb)
    : null;
  const prevGame = featured > 0 ? games[featured - 1] : null;
  const story = fg && !fg.result ? storylineFor(fg, prevGame, previewPlan) : null;
  const fgUpset =
    fg?.result && ((fg.result.won && fg.winProb < 0.35) || (!fg.result.won && fg.winProb > 0.65));

  const statusCard = !done ? (
    postseasonStarted ? (
      { label: "Postseason", value: "Live", cls: "text-status-caution" }
    ) : rank <= PLAYOFF_CUT ? (
      { label: "Playoff field", value: "In", cls: "text-status-success" }
    ) : rank <= 25 ? (
      { label: "Cut line", value: `#${PLAYOFF_CUT}`, cls: "text-status-caution" }
    ) : (
      { label: "Cut line", value: `#${PLAYOFF_CUT}`, cls: "text-fog" }
    )
  ) : outcome ? (
    { label: "Postseason", value: outcome, cls: "text-status-caution" }
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
        <div className="flex flex-wrap gap-2">
          {!done && (
            <button
              onClick={simToEnd}
              disabled={!autoGameplan || revealing}
              title={!autoGameplan ? "Turn on Auto gameplan to sim the remaining weeks" : undefined}
              className="scroll-mt-20 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-paper transition-ui hover:border-fog disabled:cursor-not-allowed disabled:opacity-45"
            >
              Sim to end
            </button>
          )}
          <button
            onClick={newSeason}
            className="scroll-mt-20 rounded-full border border-line px-5 py-2.5 text-sm text-fog transition-ui hover:border-fog hover:text-paper"
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
                  rankDelta > 0 ? "text-status-success" : "text-status-loss"
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

      <PlayoffPath games={games} program={program} />

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
              <div className="mt-2"><ProbabilityPill probability={previewPlan?.adjustedWinProb ?? fg.gameplan?.adjustedWinProb ?? fg.winProb} /></div>
            </div>
          </div>

          {previewPlan && (
            <section className="mt-8 rounded-2xl border border-line bg-panel/40 p-4 sm:p-6" aria-label={`Week ${fg.week} gameplan`}>
              <p className="text-xs font-semibold text-fog">
                They run: <span className="text-paper">{offTagLabel(previewPlan.oppOffTag)} / {defTagLabel(previewPlan.oppDefTag)}</span>
              </p>
              <p className="mt-2 text-sm text-fog">Expectation assumes a neutral gameplan. Out-coach it.</p>
              <p className="mt-1 text-xs text-fog">Your defensive base is 4-2-5; the call below adjusts it for this matchup.</p>
              <div className="mt-5">
                <p className="mb-2 text-sm font-bold text-paper">Offensive tendency</p>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Offensive tendency">
                  {OFFENSIVE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" aria-pressed={autoGameplan ? option.value === "balanced" : offPick === option.value}
                      disabled={autoGameplan || revealing} onClick={() => setOffPick(option.value)}
                      className={`min-h-20 rounded-xl px-2 py-3 text-xs font-bold leading-tight transition-ui sm:min-h-14 sm:text-sm ${shownOff === option.value && (autoGameplan || offPick) ? "bg-paper text-ink" : "bg-ink text-paper hover:bg-line"} disabled:cursor-not-allowed disabled:opacity-65`}>
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className={`mt-2 text-xs font-semibold ${edgeColor(previewPlan.offEdge)}`} aria-live="polite">
                  {tendencyLabel(shownOff)} vs their {defTagLabel(previewPlan.oppDefTag)} front — {edgeText(previewPlan.offEdge)}
                </p>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-sm font-bold text-paper">Defensive tendency</p>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Defensive tendency">
                  {DEFENSIVE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" aria-pressed={autoGameplan ? option.value === "base" : defPick === option.value}
                      disabled={autoGameplan || revealing} onClick={() => setDefPick(option.value)}
                      className={`min-h-20 rounded-xl px-2 py-3 text-xs font-bold leading-tight transition-ui sm:min-h-14 sm:text-sm ${shownDef === option.value && (autoGameplan || defPick) ? "bg-paper text-ink" : "bg-ink text-paper hover:bg-line"} disabled:cursor-not-allowed disabled:opacity-65`}>
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className={`mt-2 text-xs font-semibold ${edgeColor(previewPlan.defEdge)}`} aria-live="polite">
                  {tendencyLabel(shownDef)} vs their {offTagLabel(previewPlan.oppOffTag)} — {edgeText(previewPlan.defEdge)}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <label className="flex min-h-14 cursor-pointer items-center gap-3 text-sm font-semibold text-paper">
                  <input type="checkbox" checked={autoGameplan} disabled={revealing}
                    onChange={(event) => setAutoGameplan(event.target.checked)} className="h-5 w-5 accent-emerald-500" />
                  Auto gameplan for the rest of the season
                </label>
                <p className={`text-sm font-bold ${edgeColor(previewPlan.netEdge)}`} aria-live="polite">
                  Net edge: {previewPlan.netEdge > 0 ? "+" : ""}{previewPlan.netEdge}%
                </p>
              </div>
            </section>
          )}

          <div className="mt-8 grid items-end gap-10 sm:grid-cols-2">
            <div>{ratingBars(userR, fg.oppRatings)}</div>
            <div>
              <AnimatePresence mode="wait" initial={false}>
                {fg.result ? (
                  <motion.div
                    key={`final-${featured}-${seed}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {fgUpset && (
                      <p className="text-xs font-semibold text-status-caution">Upset</p>
                    )}
                    <p
                      className={`tnum mt-2 text-6xl font-black tracking-tight sm:text-7xl ${
                        fg.result.won ? "text-status-success" : "text-status-loss"
                      }`}
                    >
                      {fg.result.won ? "W" : "L"} {fg.result.scoreFor}–{fg.result.scoreAgainst}
                    </p>
                    {fg.gameplan && (
                      <p className="mt-3 max-w-sm text-sm text-fog">{gameplanNarration(fg.gameplan, fg.result.won, fg.opponent.name, fg.winProb)}</p>
                    )}
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
                      disabled={revealing || (!autoGameplan && (!offPick || !defPick))}
                      className="mt-6 rounded-xl bg-emerald-500 px-10 py-3.5 text-lg font-bold text-ink transition-ui hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {revealing ? "Simulating…" : "Kick off"}
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
                  {g.gameplan && (
                    <p className="mt-1 text-xs text-fog">
                      {tendencyLabel(g.gameplan.off)} · {tendencyLabel(g.gameplan.def)} · {g.gameplan.netEdge > 0 ? "+" : ""}{g.gameplan.netEdge}% edge
                    </p>
                  )}
                  {g.gameplan && (
                    <p className="mt-1 text-xs text-fog">{gameplanNarration(g.gameplan, r.won, g.opponent.name, g.winProb)}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
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
          <p className="mt-1 text-xs font-semibold text-fog">Gravity {gravityOn ? "on" : "off · Pure parity"} · v{SIM_VERSION}</p>
          {outcome && (
            <p
              className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${
                outcome === "National champions" || outcome === "Money Bowl champions"
                  ? "text-status-caution"
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
            Final projected rank #{rank} · {regWins} regular-season wins against a pregame
            projection of {projWins.toFixed(1)}.
            {vsProj > 0.05
              ? ` This run finished ${vsProj.toFixed(1)} wins above that projection.`
              : vsProj < -0.05
                ? ` This run finished ${Math.abs(vsProj).toFixed(1)} wins below that projection.`
                : ` This run finished close to that projection.`}
            {" "}The roster sets the odds; schedule and game draws still matter.
          </p>

          <section className="mt-8" aria-label="Gameplan record">
            <h3 className="text-lg font-black text-paper">Gameplan record</h3>
            {coachingRecord.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {coachingRecord.map((row) => (
                  <p key={row.label} className="rounded-xl bg-panel px-4 py-3 text-sm text-paper">
                    When you called {row.label}: <strong className="tabular-nums">{row.wins}–{row.losses}</strong>{" "}
                    <span className="tabular-nums text-fog">({row.aboveExpected >= 0 ? "+" : ""}{row.aboveExpected.toFixed(1)} vs expected)</span>
                  </p>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-fog">Neutral calls all season.</p>}
          </section>

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
            mode="season"
            games={games}
            program={program}
            alloc={alloc}
            budgetM={budgetM}
            gravityOn={gravityOn}
            seed={seed}
            gameplan={gameplan}
            autoGameplan={autoGameplan}
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
