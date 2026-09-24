const palette = {
  high: "border-emerald-400 bg-emerald-950 text-emerald-400",
  medium: "border-amber-400 bg-amber-950 text-amber-400",
  low: "border-red-400 bg-red-950 text-red-400",
} as const;

export default function ProbabilityPill({ probability }: { probability: number }) {
  const tone = probability >= 0.6 ? "high" : probability >= 0.4 ? "medium" : "low";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold leading-5 tabular-nums ${palette[tone]}`}>
      {Math.round(probability * 100)}%
    </span>
  );
}
