import { getTeams } from "@/lib/data";
import { formatBudgetMid, formatSigned } from "@/lib/format";

export function KpiStrip() {
  const teams = getTeams();
  const totalMid = teams.reduce((s, t) => s + t.budgetMid, 0);
  const highest = [...teams].sort((a, b) => b.budgetMid - a.budgetMid)[0];
  const accTeams = teams.filter((t) => t.conference === "ACC");
  const accMids = accTeams.map((t) => t.budgetMid).sort((a, b) => a - b);
  const accMedian =
    accMids.length % 2 === 0
      ? (accMids[accMids.length / 2 - 1] + accMids[accMids.length / 2]) / 2
      : accMids[Math.floor(accMids.length / 2)];
  const secMedian = (() => {
    const mids = teams.filter((t) => t.conference === "SEC").map((t) => t.budgetMid).sort((a, b) => a - b);
    const i = Math.floor(mids.length / 2);
    return mids.length % 2 ? mids[i] : (mids[i - 1] + mids[i]) / 2;
  })();
  const multiplier = accMedian > 0 ? secMedian / accMedian : null;
  const bestWae = [...teams]
    .filter((t) => t.moneyball.winsAboveExpected2025 != null)
    .sort(
      (a, b) =>
        (b.moneyball.winsAboveExpected2025 ?? 0) - (a.moneyball.winsAboveExpected2025 ?? 0),
    )[0];

  const cards = [
    {
      label: "Total P4+ND roster spend (mid)",
      value: `$${(totalMid / 1000).toFixed(2)}B`,
      sub: `${teams.length} teams · midpoints summed`,
    },
    {
      label: "Highest roster (mid)",
      value: formatBudgetMid(highest.budgetMid),
      sub: highest.name,
    },
    {
      label: "ACC median (mid)",
      value: formatBudgetMid(accMedian),
      sub: "Conference benchmark",
    },
    {
      label: "SEC vs ACC median",
      value: multiplier != null ? `${multiplier.toFixed(1)}×` : "—",
      sub: "Spend multiplier",
    },
    {
      label: "Biggest overperformance",
      value: formatSigned(bestWae?.moneyball.winsAboveExpected2025),
      sub: bestWae ? `${bestWae.name} · WAE 2025` : "",
    },
  ];

  return (
    <section className="border-y border-stone bg-stone/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-stone sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="bg-white px-4 py-5 sm:px-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate">
              {card.label}
            </p>
            <p className="mt-1 font-mono text-xl font-medium text-obsidian sm:text-2xl">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-slate">{card.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
