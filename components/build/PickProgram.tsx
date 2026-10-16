"use client";

import { useMemo, useRef, useState } from "react";
import { data, getTeam } from "@/lib/data";
import { fmtMoney1, fmtPollRank } from "@/lib/format";
import { bookStanding } from "@/lib/spend-rank";
import TeamMark from "@/components/TeamMark";
import ProgramSelect from "@/components/ProgramSelect";
import { AllocationFeedback } from "./BuildRoster";
import { allocationAction, buildPreview, describeAllocationChange, type AllocationAction, type AllocationSnapshot } from "@/lib/build-preview";
import { clampGameBudget, clampPlaysheetToBudget, GAME_BUDGET_MIN_M, GAME_BUDGET_MAX_M, type Playsheet } from "@/lib/simulator";
import { gravityTags } from "@/lib/gravity";

interface Props {
  pos: Playsheet;
  lastAction: AllocationAction | null;
  seed: number;
  programSlug: string;
  setProgramSlug: (s: string) => void;
  budgetM: number;
  gravityOn: boolean;
  setGravityOn: (on: boolean) => void;
  setBudgetM: (n: number) => void;
  onUndo?: () => void;
  onNext: () => void;
}

export default function PickProgram({ pos: committedPos, seed, lastAction, programSlug, setProgramSlug, budgetM: committedBudget, gravityOn, setGravityOn, setBudgetM: commitBudget, onUndo, onNext }: Props) {
  const [proposal, setProposal] = useState<AllocationSnapshot | null>(null);
  const gesture = useRef<{ before: AllocationSnapshot; latest: AllocationSnapshot } | null>(null);
  const pos = proposal?.pos ?? committedPos;
  const budgetM = proposal?.budgetM ?? committedBudget;
  const changeBudget = (value: number) => {
    const budget = clampGameBudget(value);
    if (gesture.current) {
      const next = { budgetM: budget, pos: clampPlaysheetToBudget(gesture.current.before.pos, budget) };
      gesture.current.latest = next; setProposal(next);
    } else commitBudget(budget);
  };
  const finishGesture = () => {
    const pending = gesture.current;
    gesture.current = null; setProposal(null);
    if (pending) commitBudget(pending.latest.budgetM);
  };
  const action = proposal ? allocationAction({ pos: committedPos, budgetM: committedBudget }, proposal, "Proposed book", { programSlug, gravityOn }) : lastAction;
  const preview = useMemo(() => buildPreview({ pos, budgetM, gravityOn, programSlug }, seed), [pos, budgetM, gravityOn, programSlug, seed]);
  const program = getTeam(programSlug)!;
  const gravity = gravityTags(program.slug);
  const standing = useMemo(() => bookStanding(budgetM, data.teams), [budgetM]);

  const stats = [
    { label: "Your book", value: `#${standing.rank}`, sub: `of ${standing.of}` },
    { label: "Their spend", value: `#${program.spend_rank}`, sub: "nationally" },
    { label: `AP week ${data.poll.week}`, value: fmtPollRank(program.ap_rank), sub: "current ballot" },
  ] as const;

  return (
    <div>
      <p className="text-xs font-semibold text-fog">Step 1 · Program</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
        Whose season are you playing?
      </h2>
      <p className="mt-3 max-w-xl text-pretty text-sm text-fog">
        Your {fmtMoney1(budgetM)} roster takes over this program: its conference sets your
        schedule, its colors dress your season. Opponents are rated from their
        real estimated budgets.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <TeamMark
          slug={program.slug}
          name={program.name}
          abbr={program.abbr}
          color={program.color}
          size="xl"
        />
        <div>
          <p className="text-xs font-semibold text-fog">
            {program.conference} · {program.abbr}
          </p>
          <p className="text-4xl font-black tracking-tight sm:text-5xl">
            {program.name}
          </p>
        </div>
      </div>

      <div className="mt-8 max-w-xl [&_.program-select-input]:text-base sm:[&_.program-select-input]:text-sm">
        <ProgramSelect label="Program" value={programSlug} onChange={setProgramSlug} />
      </div>
      <fieldset className="mt-6 max-w-xl rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-bold text-paper">Your NIL book</legend>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => changeBudget(budgetM - 1)} disabled={budgetM <= GAME_BUDGET_MIN_M} aria-label="Decrease roster budget" className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-40">−</button>
          <span className="tnum flex-1 text-center text-4xl font-black">{fmtMoney1(budgetM)}</span>
          <button type="button" onClick={() => changeBudget(budgetM + 1)} disabled={budgetM >= GAME_BUDGET_MAX_M} aria-label="Increase roster budget" className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-40">+</button>
        </div>
        <input type="range" min={GAME_BUDGET_MIN_M} max={GAME_BUDGET_MAX_M} step={1} value={budgetM} onPointerDown={(e) => { const before = { pos: committedPos, budgetM: committedBudget }; gesture.current = { before, latest: before }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerUp={finishGesture} onLostPointerCapture={finishGesture} onBlur={finishGesture}
          onPointerCancel={() => { gesture.current = null; setProposal(null); }}
          onChange={(e) => changeBudget(Number(e.target.value))} aria-label="Roster budget in millions" className="mt-3 w-full" />
        <p className="mt-2 text-sm text-fog">A smaller book fits your current allocation to that book. A larger book leaves money to allocate. Program and gravity changes preserve your amounts.</p>
        {onUndo && <button type="button" onClick={onUndo} className="mt-2 min-h-11 font-semibold text-paper">Undo last allocation</button>}
      </fieldset>

      <div className="mt-6 grid max-w-4xl gap-4 lg:grid-cols-2 lg:items-start">
      <fieldset className="min-w-0 rounded-xl border border-edge bg-panel/40 p-4">
        <legend className="px-1 text-sm font-bold text-paper">Program gravity</legend>
        <p className="mb-3 text-sm text-fog">The program can make your dollars work harder in its strongest position groups.</p>
        <div className="flex flex-wrap gap-2">
          {([true, false] as const).map((on) => (
            <button key={String(on)} type="button" onClick={() => setGravityOn(on)}
              aria-pressed={gravityOn === on}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-ui ${gravityOn === on ? "border-paper bg-panel text-paper" : "border-edge bg-ink text-fog hover:text-paper"}`}>
              {on ? "On" : "Off · Pure parity"}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-fog">
          {gravity.length ? gravity.map((tag) => `${tag.group} +${Math.round(tag.gravity * 100)}%`).join(" · ") : "No tagged position groups for this program."}
        </p>
      </fieldset>

      <section aria-label="Modeled schedule" data-setup-seed={seed} className="min-w-0 rounded-xl border border-line p-4">
        <h3 className="text-xl font-black">Your modeled schedule</h3>
        <p className="mt-2 text-sm text-fog">12 opponents · {preview.homeGames} at home · {fmtMoney1(preview.averageOpponentBudgetM)} average opponent estimated budget.</p>
        <p className="mt-2 text-sm text-fog">Fixed for this program and challenge. This is the game&rsquo;s modeled slate, separate from the real ESPN schedule.</p>
        <p className="mt-3 font-semibold text-paper">{preview.expectedWins === null ? "Allocate the exact book to see neutral expected wins." : `${preview.expectedWins.toFixed(1)} / 12 neutral expected wins with your current roster`}</p>
        <p className="mt-1 text-xs text-fog">Neutral weekly gameplans; includes your selected gravity setting.</p>
        <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-paper">View all 12 opponents and venues</summary>
        <ol className="mt-2 grid gap-x-6">
          {preview.games.map((game) => <li key={game.week} data-preview-week={game.week} data-opponent={game.opponent.slug} data-home={game.isHome} className="flex min-w-0 items-center justify-between gap-2 border-t border-line py-2 text-sm">
            <span className="min-w-0"><span className="tnum text-fog">{game.week} · {game.isHome ? "vs" : "at"}</span> {game.opponent.name}</span>
            <span className="tnum shrink-0 text-fog">{fmtMoney1(game.opponent.budget_mid_m)}</span>
          </li>)}
        </ol>
        </details>
      </section>
      </div>

      <div className="max-w-3xl"><AllocationFeedback change={action ? describeAllocationChange(action) : null} proposed={proposal !== null} /></div>
      <div className="mt-8 grid max-w-3xl grid-cols-3 gap-px bg-edge">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 bg-ink px-2 py-5 sm:px-5">
            <p className="text-[11px] font-semibold text-fog">{s.label}</p>
            <p className="tnum mt-2 text-2xl font-black tracking-tight sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-sm text-fog">{s.sub}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-fog">
        Your modeled {fmtMoney1(budgetM)} book compared with estimated real program budgets: #{standing.rank} of {standing.of}
        {standing.tiedWith.length > 0
          ? ` — tied with ${standing.tiedWith.map((t) => t.name).join(" and ")}`
          : ` — closest to ${standing.nearest.name}`}
        . Taking over {program.name} leaves opponent budgets unchanged.
      </p>

      <div className="mt-10">
        <button onClick={onNext} className="rounded-xl bg-emerald-500 px-8 py-3.5 text-lg font-bold text-ink transition-ui hover:bg-emerald-400">Continue</button>
      </div>
    </div>
  );
}
