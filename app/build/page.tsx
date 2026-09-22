"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import BuildRoster from "@/components/build/BuildRoster";
import PickProgram from "@/components/build/PickProgram";
import Season from "@/components/build/Season";
import SeasonMode from "@/components/build/SeasonMode";
import { getTeam } from "@/lib/data";
import { emptyAllocation, GAME_BUDGET_M, type Allocation } from "@/lib/simulator";

type Step = "build" | "program" | "season";

const STEPS: { key: Step; label: string }[] = [
  { key: "build", label: "Build" },
  { key: "program", label: "Program" },
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
  const [step, setStep] = useState<Step>("build");
  const [alloc, setAlloc] = useState<Allocation>(() => emptyAllocation());
  const [budgetM, setBudgetM] = useState(GAME_BUDGET_M);
  const [programSlug, setProgramSlug] = useState(
    () => (requestedProgram && getTeam(requestedProgram) ? requestedProgram : "texas")
  );
  const [seasonId, setSeasonId] = useState(0);
  const [mode, setMode] = useState<"season" | "quick">("season");
  const program = getTeam(programSlug)!;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goSeason = () => {
    setSeasonId((id) => id + 1);
    setStep("season");
  };

  return (
    <div className={step === "build" ? "pb-32 pt-8 lg:pb-0" : "pb-24 pt-10 sm:pt-16"}>
      <p className="text-xs font-semibold text-fog">Build · 22-man playsheet</p>
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

        <div className={`flex flex-wrap items-center gap-2 ${step === "build" ? "mt-5 mb-6" : "mt-8 mb-10"}`}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i < stepIndex && setStep(s.key)}
              disabled={i >= stepIndex}
              className={`flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-ui ${
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
            {step === "build" && (
              <BuildRoster
                alloc={alloc}
                setAlloc={setAlloc}
                budgetM={budgetM}
                setBudgetM={setBudgetM}
                onNext={() => setStep("program")}
              />
            )}
            {step === "program" && (
              <PickProgram
                programSlug={programSlug}
                setProgramSlug={setProgramSlug}
                budgetM={budgetM}
                onBack={() => setStep("build")}
                onNext={goSeason}
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
                      onClick={() => setMode(m.key)}
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
                {mode === "season" ? (
                  <SeasonMode
                    key={`season-${seasonId}`}
                    alloc={alloc}
                    budgetM={budgetM}
                    program={program}
                    onBack={() => setStep("build")}
                  />
                ) : (
                  <Season
                    key={`quick-${seasonId}`}
                    alloc={alloc}
                    budgetM={budgetM}
                    program={program}
                    onBack={() => setStep("build")}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
    </div>
  );
}
