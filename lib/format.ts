export function formatBudgetRange(
  min: number | null,
  max: number | null,
  mid?: number | null,
): string {
  if (min != null && max != null) {
    return `$${min.toFixed(1)}M–$${max.toFixed(1)}M`;
  }
  if (mid != null) {
    return `~$${mid.toFixed(1)}M`;
  }
  return "—";
}

export function formatBudgetMid(mid: number): string {
  return `$${mid.toFixed(1)}M`;
}

export function formatMillions(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(digits)}M`;
}

export function formatRecord(wins: number | null, losses: number | null): string {
  if (wins == null || losses == null) return "—";
  return `${wins}-${losses}`;
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export function formatRank(rank: number | null | undefined): string {
  if (rank == null) return "—";
  return `#${Math.round(rank)}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}
