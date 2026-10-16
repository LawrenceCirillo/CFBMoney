"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import BuildRoster from "@/components/build/BuildRoster";
import PickProgram from "@/components/build/PickProgram";
import Season from "@/components/build/Season";
import SeasonMode from "@/components/build/SeasonMode";
import { getTeam } from "@/lib/data";
import {
  ACTIVE_RUNS_KEY, BUILD_DRAFT_KEY, BUILD_SETUP_KEY, restoreBuildSetup, createRun, decodeBuildDraft, decodeBuildSession,
  emptySession, encodeBuildSession, readBuildStorage, writeBuildStorage,
  type ActiveRun, type BuildDraft, type BuildSession, type BuildSetup,
} from "@/lib/build-session";
import { allocationAction, describeAllocationChange, undoAllocation as restoreAllocation, type AllocationAction } from "@/lib/build-preview";
import type { ReplayMode } from "@/lib/season-replay";
import {
  distributeAllocationToSlots,
  emptyAllocation,
  GAME_BUDGET_M,
  clampGameBudget,
  clampPlaysheetToBudget,
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
    sessionRef.current = decoded.session;
    setSession(decoded.session);
    if (decoded.status === "malformed") setRecoveryNotice("Saved season progress could not be read. Your editable roster is still available.");
    if (decoded.status === "incompatible" && !writeBuildStorage(() => window.localStorage, ACTIVE_RUNS_KEY, encodeBuildSession(decoded.session))) setStorageError(true);
    const selected = decoded.session.runs[decoded.session.selectedMode];
    if (selected && (!requestedProgram || !getTeam(requestedProgram) || requestedProgram === selected.input.programSlug)) setStep("season");
    else if (nextSetup.complete && (!requestedProgram || requestedProgram === draft?.programSlug)) setStep("build");
    setDraftReady(true);
  }, [requestedProgram]);

  useEffect(() => {
    if (appliedProgram.current === requestedProgram) return;
    appliedProgram.current = requestedProgram;
    if (requestedProgram && getTeam(requestedProgram)) {
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
    setPos(nextPos);
    setBudgetM(nextBudget);
  };
  const undoAllocation = () => {
    if (!undo) return;
    const restored = restoreAllocation(undo);
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
  const updateRun = (next: ActiveRun) => {
    const current = sessionRef.current;
    if (current.runs[next.input.mode]?.id !== next.id) return;
    saveSession({ ...current, runs: { ...current.runs, [next.input.mode]: next } });
  };
  const startRun = (selectedMode: ReplayMode) => {
    if (!exactDraft || !setup) { setStep("build"); return; }
    const next = createRun(selectedMode, { pos, budgetM, gravityOn, programSlug }, crypto.randomUUID(), setup.seed);
    const current = sessionRef.current;
    saveSession({ ...current, selectedMode, runs: { ...current.runs, [selectedMode]: next } });
    setStep("season");
  };
  const switchMode = (selectedMode: ReplayMode) => {
    if (!sessionRef.current.runs[selectedMode]) {
      // A mode's first run uses the selected run's frozen roster, even after draft edits.
      const draft = activeRun ? { pos: activeRun.pos, ...activeRun.input } : { pos, budgetM, gravityOn, programSlug };
      const next = createRun(selectedMode, draft, crypto.randomUUID(), activeRun?.input.seed ?? setup!.seed);
      saveSession({ ...sessionRef.current, selectedMode, runs: { ...sessionRef.current.runs, [selectedMode]: next } });
    } else saveSession({ ...sessionRef.current, selectedMode });
  };
  const restartRun = () => {
    if (!activeRun) return;
    const next = createRun(mode, { pos: activeRun.pos, ...activeRun.input }, crypto.randomUUID(), Math.floor(Math.random() * 2 ** 31));
    saveSession({ ...sessionRef.current, runs: { ...sessionRef.current.runs, [mode]: next } });
  };

  if (!draftReady) return <div className="pt-10 text-sm text-fog">Loading your roster…</div>;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goSeason = () => {
    startRun(mode);
  };

  return (
    <div className={step === "build" ? "pb-80 pt-8 lg:pb-0" : "pb-24 pt-10 sm:pt-16"}>
      <p className="text-xs font-semibold text-fog">Build · 22-man playsheet</p>
      <p className="mt-1 text-sm text-fog">College football has a $55M salary cap. You&rsquo;re the GM.</p>
      <h1
        className={`font-black tracking-tight ${
          step === "build" ? "mt-2 text-3xl sm:text-4xl" : "mt-3 text-4xl sm:text-6xl"
        }`}
      >
        Build a roster.
        {step !== "build" && (
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
      {activeRun && <section aria-label="Active season" className="mt-4 rounded-xl border border-line p-4">
        <p className="text-sm text-fog">{getTeam(activeRun.input.programSlug)!.name} · {activeRun.completedGames} games played · {mode === "season" ? "Season mode" : "Quick sim"}</p>
        <p className="mt-1 text-sm text-fog">Current roster: {getTeam(programSlug)!.name} · ${budgetM}M book · ${Object.values(pos).reduce((sum, value) => sum + value, 0).toFixed(1)}M allocated.{!exactDraft && " Spend the exact book to start a new season."}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button className="min-h-11 text-sm font-semibold text-paper" onClick={() => setStep("season")}>Resume season</button>
          <button disabled={!exactDraft} className="min-h-11 text-sm font-semibold text-paper disabled:opacity-45" onClick={() => startRun(mode)}>Start new season with current roster</button>
        </div>
      </section>}

        <div className={`grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-2 ${step === "build" ? "mt-5 mb-6" : "mt-8 mb-10"}`}>
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
                setProgramSlug={setProgramSlug}
                budgetM={budgetM}
                setBudgetM={changeBudget}
                lastAction={undo}
                gravityOn={gravityOn}
                setGravityOn={setGravityOn}
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
                    onBack={() => setStep("build")}
                  />
                ) : (
                  <Season
                    key={activeRun.id}
                    run={activeRun}
                    onRunChange={updateRun}
                    onNew={restartRun}
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
