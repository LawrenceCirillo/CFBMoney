"use client";

import { useMemo } from "react";
import { data, getTeam } from "@/lib/data";
import { fmtMoney1, fmtPollRank } from "@/lib/format";
import { bookStanding } from "@/lib/spend-rank";
import TeamMark from "@/components/TeamMark";

interface Props {
  programSlug: string;
  setProgramSlug: (s: string) => void;
  budgetM: number;
  onBack: () => void;
  onNext: () => void;
}

export default function PickProgram({ programSlug, setProgramSlug, budgetM, onBack, onNext }: Props) {
  const program = getTeam(programSlug)!;
  const standing = useMemo(() => bookStanding(budgetM, data.teams), [budgetM]);

  const conferences = useMemo(() => {
    const map = new Map<string, typeof data.teams>();
    for (const t of [...data.teams].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!map.has(t.conference)) map.set(t.conference, []);
      map.get(t.conference)!.push(t);
    }
    return [...map.entries()];
  }, []);

  const stats = [
    { label: "Your book", value: `#${standing.rank}`, sub: `of ${standing.of}` },
    { label: "Their spend", value: `#${program.spend_rank}`, sub: "nationally" },
    { label: `AP week ${data.poll.week}`, value: fmtPollRank(program.ap_rank), sub: "current ballot" },
  ] as const;

  return (
    <div>
      <p className="text-xs font-semibold text-fog">Step 2 · Program</p>
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

      <label htmlFor="program-select" className="mt-8 block text-xs font-semibold text-fog">
        Program
      </label>
      <select
        id="program-select"
        value={programSlug}
        onChange={(e) => setProgramSlug(e.target.value)}
        className="mt-2 w-full max-w-xl rounded-lg border border-line bg-panel px-3 py-2.5 text-sm text-paper outline-none focus:border-paper"
      >
        {conferences.map(([conf, teams]) => (
          <optgroup key={conf} label={conf}>
            {teams.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} — {fmtMoney1(t.budget_mid_m)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="mt-8 grid max-w-3xl grid-cols-3 gap-px bg-edge">
        {stats.map((s) => (
          <div key={s.label} className="bg-ink px-5 py-6">
            <p className="text-[11px] font-semibold text-fog">{s.label}</p>
            <p className="tnum mt-2 text-3xl font-black tracking-tight">{s.value}</p>
            <p className="mt-1 text-sm text-fog">{s.sub}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-2xl text-sm text-fog">
        Twelve games — conference opponents, your rivalry, a tiered non-conference
        slate. Seven at home. Your {fmtMoney1(budgetM)} roster against their real
        books: at the blue-bloods, you&rsquo;re the underdog. Taking over{" "}
        {program.name} does not change their payroll.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-fog">
        Your {fmtMoney1(budgetM)} book sits #{standing.rank} of {standing.of}
        {standing.tiedWith.length > 0
          ? ` — tied with ${standing.tiedWith.map((t) => t.name).join(" and ")}`
          : ` — closest to ${standing.nearest.name}`}
        . {program.name} spends #{program.spend_rank}.
      </p>

      <div className="mt-10 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-full border border-line px-6 py-3 font-semibold text-paper transition-ui hover:border-fog"
        >
          Back to roster
        </button>
        <button
          onClick={onNext}
          className="rounded-xl bg-emerald-500 px-8 py-3.5 text-lg font-bold text-ink transition-ui hover:bg-emerald-400"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
