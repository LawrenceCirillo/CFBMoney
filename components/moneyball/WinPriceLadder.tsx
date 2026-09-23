import type { WinPrice } from "@/lib/moneyball";
import { fmtMoney1 } from "@/lib/format";
import { ordinal } from "@/lib/format";

/**
 * The price tag on each win. Linear scale on purpose — the 12th bar
 * towering over the rest is the entire point.
 */
export default function WinPriceLadder({ prices }: { prices: WinPrice[] }) {
  const max = Math.max(...prices.map((p) => p.priceM));
  return (
    <div>
      {prices.map((p) => (
        <div key={p.win} className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 border-b border-line/60 py-2.5">
          <span className="text-xs font-semibold text-fog">
            {ordinal(p.win)} win
          </span>
          <div className="h-6 bg-panel">
            <div
              className={`h-full ${p.win >= 11 ? "bg-down" : p.win >= 9 ? "bg-amber-400/80" : "bg-paper"}`}
              style={{ width: `${(p.priceM / max) * 100}%` }}
              title={`${fmtMoney1(p.priceM)} marginal`}
            />
          </div>
          <span className={`tnum w-20 text-right text-sm font-extrabold ${p.win >= 11 ? "text-status-loss" : ""}`}>
            {fmtMoney1(p.priceM)}
          </span>
        </div>
      ))}
      <p className="mt-3 text-xs text-fog">
        Marginal modeled cost to go from one expected win to the next, against an
        average field. The 12th win costs more than most entire rosters.
      </p>
    </div>
  );
}
