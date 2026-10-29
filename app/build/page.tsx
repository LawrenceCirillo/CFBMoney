"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import BuildRoster from "@/components/build/BuildRoster";
import PickProgram from "@/components/build/PickProgram";
import Season from "@/components/build/Season";
import SeasonMode from "@/components/build/SeasonMode";
import { getTeam } from "@/lib/data";
import {
  ACTIVE_RUNS_KEY, BUILD_DRAFT_KEY, BUILD_SETUP_KEY, restoreBuildSetup, createRun, decodeBuildDraft, decodeBuildSession,
  emptySession, encodeBuildSession, readBuildStorage, writeBuildStorage,
  clearComparison, draftMatchesBaseline, prepareRematch, sameChallenge, startDraftRun, updateSessionRun,
  type ActiveRun, type BuildDraft, type BuildSession, type BuildSetup,
} from "@/lib/build-session";
import { allocationAction, describeAllocationChange, undoAllocation as restoreAllocation, type AllocationAction } from "@/lib/build-preview";
import { replaySeason, type ReplayMode } from "@/lib/season-replay";
import { preseasonExpectedWins } from "@/lib/season-mode";
import { tendencyLabel } from "@/lib/gameplan";
import {
  distributeAllocationToSlots,
  emptyAllocation,
  GAME_BUDGET_M,
  clampGameBudget,
  clampPlaysheetToBudget,
  allocationFromPlaysheet, POSITION_GROUPS,
  type Playsheet,
} from "@/lib/simulator";

type Step = "build" | "program" | "season";

const STEPS: { key: Step; label: string }[] = [
  { key: "program", label: "Program" },
  { key: "build", label: "Build" },
  { key: "season", label: "Season" },
];

export default function BuildPage() {
  return (
    <Suspense fallback={<div className="pt-10 text-sm text-fog">Loading the lab…</div>}>
      <BuildPageInner />
    </Suspense>
  );
}

function BuildPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const requestedProgram = searchParams.get("program");
  const [step, setStep] = useState<Step>("program");
  const [pos, setPos] = useState<Playsheet>(() =>
    distributeAllocationToSlots(emptyAllocation())
  );
  const [budgetM, setBudgetM] = useState(GAME_BUDGET_M);
  const [gravityOn, setGravityOn] = useState(true);
  const [programSlug, setProgramSlug] = useState(
    () => (requestedProgram && getTeam(requestedProgram) ? requestedProgram : "texas")
  );
  const [session, setSession] = useState<BuildSession>(emptySession);
  const sessionRef = useRef(session);
  const [storageError, setStorageError] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [setup, setSetup] = useState<BuildSetup | null>(null);
  const [undo, setUndo] = useState<AllocationAction | null>(null);
  const [allocationMessage, setAllocationMessage] = useState("");
  const focusStepHeading = useCallback((node: HTMLHeadingElement | null) => { node?.focus(); }, []);
  const restored = useRef(false);
  const appliedProgram = useRef(requestedProgram);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const storedDraft = readBuildStorage(() => window.localStorage, BUILD_DRAFT_KEY);
    const storedRuns = readBuildStorage(() => window.localStorage, ACTIVE_RUNS_KEY);
    const storedSetup = readBuildStorage(() => window.localStorage, BUILD_SETUP_KEY);
    const nextSetup = restoreBuildSetup(storedSetup.raw, () => Math.floor(Math.random() * 2 ** 31));
    const setupSaved = writeBuildStorage(() => window.localStorage, BUILD_SETUP_KEY, JSON.stringify(nextSetup));
    setSetup(nextSetup);
    setStorageError(!storedDraft.available || !storedRuns.available || !storedSetup.available || !setupSaved);
    const draft = decodeBuildDraft(storedDraft.raw);
    if (draft) {
      setPos(draft.pos);
      setBudgetM(draft.budgetM);
      setGravityOn(draft.gravityOn);
      if (!requestedProgram || !getTeam(requestedProgram)) setProgramSlug(draft.programSlug);
    }
    const decoded = decodeBuildSession(storedRuns.raw);
    let restoredSession = decoded.session;
    const effectiveDraft = draft ? { ...draft, programSlug: requestedProgram && getTeam(requestedProgram) ? requestedProgram : draft.programSlug } : null;
    if (restoredSession.rematch && (!effectiveDraft || !draftMatchesBaseline(restoredSession, effectiveDraft, nextSetup.seed))) {
      restoredSession = clearComparison(restoredSession);
      setRecoveryNotice("The saved comparison no longer matches this setup. Your original season is still available.");
    }
    sessionRef.current = restoredSession;
    setSession(restoredSession);
    if (decoded.status === "malformed") setRecoveryNotice("Saved season progress could not be read. Your editable roster is still available.");
    if (decoded.comparisonDiscarded) setRecoveryNotice("The previous comparison uses an unsupported or unreadable snapshot. Your current season is still available.");
    if ((decoded.status === "incompatible" || decoded.comparisonDiscarded || restoredSession !== decoded.session) && !writeBuildStorage(() => window.localStorage, ACTIVE_RUNS_KEY, encodeBuildSession(restoredSession))) setStorageError(true);
    const selected = restoredSession.runs[restoredSession.selectedMode];
    if (restoredSession.rematch) setStep("build");
    else if (selected && (!requestedProgram || !getTeam(requestedProgram) || requestedProgram === selected.input.programSlug)) setStep("season");
    else if (nextSetup.complete && (!requestedProgram || requestedProgram === draft?.programSlug)) setStep("build");
    setDraftReady(true);
  }, [requestedProgram]);

  useEffect(() => {
    if (appliedProgram.current === requestedProgram) return;
    appliedProgram.current = requestedProgram;
    if (requestedProgram && getTeam(requestedProgram)) {
      if (sessionRef.current.baseline && requestedProgram !== sessionRef.current.baseline.input.programSlug) invalidateComparison();
      setProgramSlug(requestedProgram);
      setStep("program");
    }
  }, [requestedProgram]);

  useEffect(() => {
    if (!draftReady) return;
    if (!writeBuildStorage(() => window.localStorage, BUILD_DRAFT_KEY, JSON.stringify({ pos, budgetM, gravityOn, programSlug } satisfies BuildDraft))) setStorageError(true);
  }, [draftReady, pos, budgetM, gravityOn, programSlug]);

  const commitAllocation = (nextPos: Playsheet, nextBudget: number, label: string) => {
    if (nextBudget === budgetM && JSON.stringify(nextPos) === JSON.stringify(pos)) return;
    const action = allocationAction({ pos, budgetM }, { pos: nextPos, budgetM: nextBudget }, label, { programSlug, gravityOn });
    setUndo(action);
    setAllocationMessage(describeAllocationChange(action).announcement);
    if (nextBudget !== budgetM) invalidateComparison();
    setPos(nextPos);
    setBudgetM(nextBudget);
  };
  const undoAllocation = () => {
    if (!undo) return;
    const restored = restoreAllocation(undo);
    if (restored.budgetM !== budgetM) invalidateComparison();
    setPos(restored.pos); setBudgetM(restored.budgetM); setUndo(null);
    setAllocationMessage(`Allocation restored. $${restored.budgetM}M book restored.`);
  };
  const changeBudget = (raw: number) => {
    const nextBudget = clampGameBudget(raw);
    commitAllocation(clampPlaysheetToBudget(pos, nextBudget), nextBudget, "Book changed");
  };
  const completeSetup = () => {
    const next = { ...setup!, complete: true };
    if (!writeBuildStorage(() => window.localStorage, BUILD_SETUP_KEY, JSON.stringify(next))) setStorageError(true);
    setSetup(next); setStep("build");
  };

  const mode = session.selectedMode;
  const activeRun = session.runs[mode];
  const exactDraft = Object.values(pos).reduce((sum, value) => sum + Math.round(value * 10), 0) === budgetM * 10;

  // Storage is written in the event transaction, before any reveal animation.
  const saveSession = (next: BuildSession) => {
    sessionRef.current = next;
    if (!writeBuildStorage(() => window.localStorage, ACTIVE_RUNS_KEY, encodeBuildSession(next))) setStorageError(true);
    setSession(next);
  };
  const invalidateComparison = () => {
    if (!sessionRef.current.baseline) return;
    saveSession(clearComparison(sessionRef.current));
    setRecoveryNotice("Challenge settings changed. This is a new challenge; the same-challenge comparison has been cleared.");
  };
  const updateRun = (next: ActiveRun) => {
    const current = sessionRef.current;
    const updated = updateSessionRun(current, next);
    if (updated !== current) saveSession(updated);
  };
  const startRun = (selectedMode: ReplayMode) => {
    if (!exactDraft || !setup) { setStep("build"); return; }
    const current = sessionRef.current;
    saveSession(startDraftRun(current, { pos, budgetM, gravityOn, programSlug }, selectedMode, crypto.randomUUID(), setup.seed));
    setStep("season");
  };
  const switchMode = (selectedMode: ReplayMode) => {
    if (selectedMode === mode) return;
    const hadComparison = !!sessionRef.current.baseline;
    const current = clearComparison(sessionRef.current);
    if (!current.runs[selectedMode]) {
      // A mode's first run uses the selected run's frozen roster, even after draft edits.
      const draft = activeRun ? { pos: activeRun.pos, ...activeRun.input } : { pos, budgetM, gravityOn, programSlug };
      const next = createRun(selectedMode, draft, crypto.randomUUID(), activeRun?.input.seed ?? setup!.seed);
      saveSession({ ...current, selectedMode, runs: { ...current.runs, [selectedMode]: next } });
    } else saveSession({ ...current, selectedMode });
    if (hadComparison) setRecoveryNotice("Mode changed. This is a new challenge; the same-challenge comparison has been cleared.");
  };
  const restartRun = () => {
    if (!activeRun) return;
    const candidate = Math.floor(Math.random() * 2 ** 31);
    const seed = candidate === activeRun.input.seed ? (candidate + 1) % 2 ** 31 : candidate;
    const next = createRun(mode, { pos: activeRun.pos, ...activeRun.input }, crypto.randomUUID(), seed);
    const nextSetup = { version: 1 as const, seed, complete: true };
    if (!writeBuildStorage(() => window.localStorage, BUILD_SETUP_KEY, JSON.stringify(nextSetup))) setStorageError(true);
    setSetup(nextSetup);
    saveSession({ ...clearComparison(sessionRef.current), runs: { ...sessionRef.current.runs, [mode]: next } });
    setRecoveryNotice(null);
  };
  const replayChallenge = () => {
    if (!activeRun) return;
    const next = prepareRematch(sessionRef.current, activeRun);
    const nextSetup = { version: 1 as const, seed: next.seed, complete: true };
    const draftSaved = writeBuildStorage(() => window.localStorage, BUILD_DRAFT_KEY, JSON.stringify(next.draft));
    const setupSaved = writeBuildStorage(() => window.localStorage, BUILD_SETUP_KEY, JSON.stringify(nextSetup));
    if (!draftSaved || !setupSaved) setStorageError(true);
    saveSession(next.session);
    setPos(next.draft.pos); setBudgetM(next.draft.budgetM); setGravityOn(next.draft.gravityOn); setProgramSlug(next.draft.programSlug);
    setSetup(nextSetup); setUndo(null); setRecoveryNotice(null); setStep("build");
    if (requestedProgram && requestedProgram !== next.draft.programSlug) {
      appliedProgram.current = next.draft.programSlug;
      router.replace(`/build?program=${next.draft.programSlug}`, { scroll: false });
    }
  };

  const comparison = useMemo(() => {
    const baseline = session.baseline;
    if (!baseline || !setup) return null;
    const draft = { pos, budgetM, gravityOn, programSlug };
    const input = step === "season" ? activeRun?.input : { ...baseline.input, alloc: allocationFromPlaysheet(pos), gameplan: [] };
    if (!input || (step === "season" ? activeRun?.id === baseline.id || !sameChallenge(baseline.input, input) : !draftMatchesBaseline(session, draft, setup.seed))) return null;
    const before = replaySeason(baseline.input, baseline.completedGames);
    const after = replaySeason(input, step === "season" ? activeRun!.completedGames : 0);
    const changedCalls = after.games.filter((game) => !game.stage && game.result && game.gameplan).flatMap((game) => {
      const prior = before.games.find((previous) => previous.week === game.week)?.gameplan;
      return prior && (prior.off !== game.gameplan!.off || prior.def !== game.gameplan!.def) ? [{ week: game.week, prior, next: game.gameplan! }] : [];
    });
    return { baseline, before, after, changedCalls };
  }, [session, setup, pos, budgetM, gravityOn, programSlug, step, activeRun]);

  if (!draftReady) return <div className="pt-10 text-sm text-fog">Loading your roster…</div>;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goSeason = () => {
    startRun(mode);
  };

  return (
    <div className={step === "build" ? "pb-80 pt-8 lg:pb-0" : step === "season" ? "pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:pt-8" : "pb-24 pt-10 sm:pt-16"}>
      {step !== "season" && <><p className="text-xs font-semibold text-fog">Build · 22-man playsheet</p>
      <p className="mt-1 text-sm text-fog">College football has a $55M salary cap. You&rsquo;re the GM.</p></>}
      <h1
        className={step === "season" ? "sr-only" : `font-black tracking-tight ${
          step !== "program" ? "mt-2 text-3xl sm:text-4xl" : "mt-3 text-4xl sm:text-6xl"
        }`}
      >
        {step === "season" ? "Play your season." : "Build a roster."}
        {step === "program" && (
          <>
            <br />
            Live the season.
          </>
        )}
      </h1>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{allocationMessage}</p>
      {storageError && <p role="status" className="mt-4 text-sm text-status-caution">Progress cannot be saved on this device. You can keep playing in this tab.</p>}
      {recoveryNotice && <p role="status" className="mt-4 text-sm text-status-caution">{recoveryNotice}</p>}
      {session.notices.map((notice) => <div key={notice.mode} className="mt-4 rounded-xl border border-line p-4">
        <p className="text-sm text-fog">{notice.reason}</p>
        <button className="mt-2 min-h-11 text-sm font-semibold text-paper" onClick={() => {
          setPos(notice.draft.pos); setBudgetM(notice.draft.budgetM); setGravityOn(notice.draft.gravityOn); setProgramSlug(notice.draft.programSlug); setStep("program");
        }}>Recover {notice.mode === "quick" ? "Quick sim" : "Season mode"} roster</button>
      </div>)}
      {activeRun && step !== "season" && <section aria-label="Active season" className="mt-4 rounded-xl border border-line p-4">
        <p className="text-sm text-fog">{getTeam(activeRun.input.programSlug)!.name} · {activeRun.completedGames} games played · {mode === "season" ? "Season mode" : "Quick sim"}</p>
        <p className="mt-1 text-sm text-fog">Current roster: {getTeam(programSlug)!.name} · ${budgetM}M book · ${Object.values(pos).reduce((sum, value) => sum + value, 0).toFixed(1)}M allocated.{!exactDraft && " Spend the exact book to start a new season."}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button className="min-h-11 text-sm font-semibold text-paper" onClick={() => {
            const { rematch: _rematch, ...rest } = sessionRef.current;
            saveSession(rest); setStep("season");
          }}>Resume season</button>
          <button disabled={!exactDraft} className="min-h-11 text-sm font-semibold text-paper disabled:opacity-45" onClick={() => startRun(mode)}>{session.rematch ? "Start rematch with current roster" : "Start new season with current roster"}</button>
        </div>
      </section>}

        <div className={`grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-2 ${step !== "program" ? "mt-5 mb-6" : "mt-8 mb-10"}`}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i < stepIndex && setStep(s.key)}
              aria-current={i === stepIndex ? "step" : undefined}
              disabled={i >= stepIndex}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full px-2 py-2 text-xs font-semibold whitespace-nowrap transition-ui sm:gap-2 sm:px-4 sm:text-sm ${
                i === stepIndex
                  ? "bg-panel text-paper"
                  : i < stepIndex
                    ? "text-paper hover:bg-panel"
                    : "text-fog"
              }`}
            >
              <span className="tnum">{i + 1}</span> {s.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
            }
          >
            <h2 ref={focusStepHeading} tabIndex={-1} className="mb-5 text-xl font-bold tracking-tight">
              {step === "program" ? "Program setup" : step === "build" ? "Allocate your roster" : "Play your season"}
            </h2>
            {comparison && <section aria-label="Same challenge comparison" className="mb-6 rounded-xl border border-line bg-panel/40 p-4 sm:p-5">
              <h3 className="text-base font-bold">{step === "season" ? "Same challenge, new run" : "Replay this challenge"}</h3>
              <p className="mt-1 text-sm text-fog">{comparison.before.program.name} · ${comparison.baseline.input.budgetM}M · {mode === "season" ? "Season mode" : "Quick sim"} · gravity {comparison.baseline.input.gravityOn ? "on" : "off"}.</p>
              <p className="mt-2 text-sm text-fog">Same program, book and regular-season schedule. Edit the roster and calls. Game draws can still differ.</p>
              <details className="mt-3 text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">Compare with previous season</summary>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div><dt className="text-xs text-fog">Neutral regular-season projection · previous → current</dt><dd className="mt-1 font-bold tabular-nums">{preseasonExpectedWins(comparison.before.games).toFixed(1)} → {preseasonExpectedWins(comparison.after.games).toFixed(1)} wins</dd></div>
                  <div><dt className="text-xs text-fog">Previous completed season · observed record</dt><dd className="mt-1 font-bold tabular-nums">{comparison.before.summary.wins}–{comparison.before.summary.losses}</dd></div>
                  {(["off", "def", "st"] as const).map((key) => <div key={key}><dt className="text-xs text-fog">{{ off: "Offense", def: "Defense", st: "Special teams" }[key]} rating · previous → current</dt><dd className="mt-1 tabular-nums">{comparison.before.ratings[key].toFixed(1)} → {comparison.after.ratings[key].toFixed(1)}</dd></div>)}
                </dl>
                <h4 className="mt-4 font-semibold">Allocation changes</h4>
                <ul className="mt-2 space-y-1 text-fog">
                  {POSITION_GROUPS.filter((group) => Math.abs(comparison.before.fullAlloc[group.key] - comparison.after.fullAlloc[group.key]) > 0.001).map((group) => <li key={group.key} className="tabular-nums">{group.label}: ${comparison.before.fullAlloc[group.key].toFixed(1)}M → ${comparison.after.fullAlloc[group.key].toFixed(1)}M</li>)}
                  {POSITION_GROUPS.every((group) => Math.abs(comparison.before.fullAlloc[group.key] - comparison.after.fullAlloc[group.key]) < 0.001) && <li>No allocation changes yet.</li>}
                </ul>
                {mode === "season" && <div className="mt-4"><h4 className="font-semibold">Weekly call changes</h4><p className="mt-1 text-fog">{comparison.changedCalls.length} changed across {comparison.after.games.filter((game) => !game.stage && game.result).length} replayed regular-season games. Postseason paths can differ.</p>
                  <ul className="mt-2 space-y-2 text-xs text-fog">{comparison.changedCalls.map(({ week, prior, next }) => <li key={week}>Week {week}: {tendencyLabel(prior.off)} / {tendencyLabel(prior.def)} → {tendencyLabel(next.off)} / {tendencyLabel(next.def)}</li>)}</ul>
                </div>}
                <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Previous season game log</summary><ol className="space-y-2 text-xs text-fog">{comparison.before.games.map((game) => <li key={game.week}>Week {game.week} · {game.isHome ? "vs" : "at"} {game.opponent.name} · {game.result!.won ? "W" : "L"} {game.result!.scoreFor}–{game.result!.scoreAgainst}{game.gameplan && mode === "season" ? ` · ${tendencyLabel(game.gameplan.off)} / ${tendencyLabel(game.gameplan.def)}` : ""}</li>)}</ol></details>
                {comparison.baseline.publish?.result && <a href={`/s/${comparison.baseline.publish.result.id}`} className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Open previous published recap</a>}
              </details>
            </section>}
            {step === "build" && (
              <BuildRoster
                pos={pos}
                seed={setup!.seed}
                setPos={(next, label) => commitAllocation(next, budgetM, label)}
                lastAction={undo}
                budgetM={budgetM}
                programSlug={programSlug}
                gravityOn={gravityOn}
                onEditSetup={() => setStep("program")}
                onUndo={undo ? undoAllocation : undefined}
                onNext={goSeason}
              />
            )}
            {step === "program" && (
              <PickProgram
                pos={pos}
                seed={setup!.seed}
                programSlug={programSlug}
                setProgramSlug={(slug) => { if (slug !== programSlug) invalidateComparison(); setProgramSlug(slug); }}
                budgetM={budgetM}
                setBudgetM={changeBudget}
                lastAction={undo}
                gravityOn={gravityOn}
                setGravityOn={(on) => { if (on !== gravityOn) invalidateComparison(); setGravityOn(on); }}
                onUndo={undo ? undoAllocation : undefined}
                onNext={completeSetup}
              />
            )}
            {step === "season" && (
              <div>
                <div className="mb-8 flex flex-wrap items-center gap-2">
                  {(
                    [
                      { key: "season", label: "Season mode" },
                      { key: "quick", label: "Quick sim" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => switchMode(m.key)}
                      aria-pressed={mode === m.key}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
                        mode === m.key
                          ? "bg-panel text-paper"
                          : "text-fog hover:bg-panel hover:text-paper"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {activeRun && (mode === "season" ? (
                  <SeasonMode
                    key={activeRun.id}
                    run={activeRun}
                    onRunChange={updateRun}
                    onNew={restartRun}
                    onReplay={replayChallenge}
                    onBack={() => setStep("build")}
                  />
                ) : (
                  <Season
                    key={activeRun.id}
                    run={activeRun}
                    onRunChange={updateRun}
                    onNew={restartRun}
                    onReplay={replayChallenge}
                    onBack={() => setStep("build")}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
    </div>
  );
}
