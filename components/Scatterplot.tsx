import type { TeamBudget } from "@/lib/types";
import { data } from "@/lib/data";
import { logoSrc, markDisc } from "@/lib/mark";

/** Spend (x) vs. the current AP rank (y, inverted). */
export default function Scatterplot({ teams }: { teams: TeamBudget[] }) {
  const W = 880;
  const H = 560;
  const m = { t: 46, r: 34, b: 56, l: 56 };

  const xs = teams.map((t) => t.budget_mid_m);
  const x0 = Math.floor(Math.min(...xs)) - 2;
  const x1 = Math.ceil(Math.max(...xs)) + 2;
  const yTop = 0;
  const yBottom = 26;

  const X = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (r: number) => m.t + ((r - yTop) / (yBottom - yTop)) * (H - m.t - m.b);

  const xTicks: number[] = [];
  for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) xTicks.push(v);
  const yTicks = [25, 20, 15, 10, 5];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Roster spend vs. AP rank through Week ${data.poll.week}`}>
      {/* grid */}
      {xTicks.map((v) => (
        <g key={v}>
          <line x1={X(v)} y1={m.t} x2={X(v)} y2={H - m.b} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={X(v)} y={H - m.b + 22} textAnchor="middle" fontSize={12} fill="var(--chart-text)" className="tnum">
            ${v}M
          </text>
        </g>
      ))}
      {yTicks.map((r) => (
        <g key={r}>
          <line x1={m.l} y1={Y(r)} x2={W - m.r} y2={Y(r)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={m.l - 12} y={Y(r) + 4} textAnchor="end" fontSize={12} fill="var(--chart-text)" className="tnum">
            #{r}
          </text>
        </g>
      ))}

      {/* axis titles */}
      <text x={(m.l + W - m.r) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--chart-text)">
        Roster budget →
      </text>
      <text
        x={16}
        y={(m.t + H - m.b) / 2}
        textAnchor="middle"
        fontSize={12}
        fill="var(--chart-text)"
        transform={`rotate(-90 16 ${(m.t + H - m.b) / 2})`}
      >
        ↑ Better rank
      </text>

      {/* teams */}
      {teams.map((t) => {
        const cx = X(t.budget_mid_m);
        const cy = Y(t.ap_rank!);
        const r = 14;
        return (
          <a key={t.slug} href={`/team/${t.slug}`}>
            <title>{`${t.name} — ${t.budget_low_m}–${t.budget_high_m}M, AP #${t.ap_rank} through week ${data.poll.week}`}</title>
            <circle cx={cx} cy={cy} r={r} fill={markDisc(t.color)} />
            <image
              href={logoSrc(t.slug)}
              x={cx - 11}
              y={cy - 11}
              width={22}
              height={22}
              preserveAspectRatio="xMidYMid meet"
            />
          </a>
        );
      })}
    </svg>
  );
}
