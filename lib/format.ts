/** $42.3M */
export function fmtM(millions: number): string {
  return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
}

/** $49–54M */
export function fmtRange(low: number, high: number): string {
  return `${fmtM(low)}–${fmtM(high)}`;
}

/** +17 / −17 / ±0 */
export function fmtGap(gap: number): string {
  if (gap === 0) return "±0";
  const sign = gap > 0 ? "+" : "−";
  return `${sign}${Math.abs(gap)}`;
}

export function fmtTotal(millions: number): string {
  return `$${(millions / 1000).toFixed(2)}B`;
}

/** $4.5M — always one decimal, for slider readouts */
export function fmtMoney1(millions: number): string {
  return `$${millions.toFixed(1)}M`;
}

/** $4.17M — two decimals, for $/win readouts */
export function fmtMoney2(millions: number): string {
  if (!isFinite(millions)) return "—";
  return `$${millions.toFixed(2)}M`;
}

export function fmtPollRank(rank: number | null | undefined): string {
  return rank != null ? `#${rank}` : "Unranked";
}

/** 2026-09-20 → Sept. 20 */
export function fmtPollDate(iso: string): string {
  const parts = iso.split("-").map(Number);
  const month = parts[1];
  const day = parts[2];
  const months = [
    "Jan.",
    "Feb.",
    "March",
    "April",
    "May",
    "June",
    "July",
    "Aug.",
    "Sept.",
    "Oct.",
    "Nov.",
    "Dec.",
  ];
  const label = months[month - 1];
  if (!label || !day) return iso;
  return `${label} ${day}`;
}

/** 1st / 2nd / 3rd / 4th … */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
