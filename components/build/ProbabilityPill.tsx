const palette = {
  high: "border-emerald-400 bg-emerald-950 text-emerald-400",
  medium: "border-amber-400 bg-amber-950 text-amber-400",
  low: "border-red-400 bg-red-950 text-red-400",
} as const;

export default function ProbabilityPill({ probability, precision = 0 }: { probability: number; precision?: 0 | 1 }) {
  const tone = probability >= 0.6 ? "high" : probability >= 0.4 ? "medium" : "low";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold leading-5 tabular-nums ${palette[tone]}`}>
      {(probability * 100).toFixed(precision)}%
    </span>
  );
}
import type { GameplanResolution } from "@/lib/gameplan";
import { gameplanOdds } from "@/lib/gameplan-display";


export function GameplanOdds({ neutral, plan, label, compact = false }: {
  neutral: number; plan: Pick<GameplanResolution, "adjustedWinProb" | "netEdge"> | null;
  label: string; compact?: boolean;
}) {
  const odds = gameplanOdds(neutral, plan);
  const tone = odds.deltaPoints > 0 ? "text-status-success" : odds.deltaPoints < 0 ? "text-status-loss" : "text-fog";
  if (compact) return <p className="mt-1 text-xs leading-relaxed text-fog">{plan ? odds.summary : `Neutral win odds: ${odds.neutralLabel}. Weekly calls not recorded.`}</p>;
  return (
    <div aria-label="Win odds" className="mt-4 rounded-xl bg-ink p-4" aria-live="polite" aria-atomic="true">
      <p className="text-xs font-semibold text-fog">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs text-fog">Neutral <ProbabilityPill probability={neutral} precision={1} /></span>
        {plan && <><span aria-hidden="true" className="text-fog">→</span><span className="text-xs text-fog">With calls <ProbabilityPill probability={plan.adjustedWinProb} precision={1} /></span></>}
      </div>
      <p className={`mt-2 text-sm font-semibold ${tone}`}>{plan ? odds.change : "Choose both tendencies to preview their effect."}</p>
      {plan && <p className="mt-1 text-xs text-fog">Matchup modifier: {odds.modifier}. Applied odds above include any probability bounds.</p>}
    </div>
  );
}
