"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import TeamMark from "@/components/TeamMark";

export interface BarDatum {
  slug: string;
  name: string;
  abbr: string;
  /** School color (bars). Marks sit on ink so ESPN dark logos stay readable. */
  color: string;
  /** Bar fill. Defaults to school color. */
  barColor?: string;
  /** 0..1 fraction of the longest bar */
  frac: number;
  value: string;
  sub?: string;
  /** This week's result, e.g. "W 30–6". */
  result?: string;
  won?: boolean | null;
}

/** Animated, re-sortable bar list. Rows glide to their new positions on metric switch. */
const FIRST_SCREEN = 8;

export default function TeamBars({ data }: { data: BarDatum[] }) {
  const reduceMotion = useReducedMotion();
  const arrival = useRef(true);
  useEffect(() => {
    arrival.current = false;
  }, []);
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 34 };
  const barSpring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 240, damping: 30 };
  return (
    <div>
      {data.map((d, i) => {
        const delay = reduceMotion || !arrival.current || i >= FIRST_SCREEN ? 0 : i * 0.05;
        const resultTone =
          d.won === true ? "text-up" : d.won === false ? "text-down" : "text-fog";
        return (
        <motion.div
          key={d.slug}
          layout={!reduceMotion}
          transition={spring}
        >
          <Link
            href={`/team/${d.slug}`}
            className="group -mx-2 grid grid-cols-[4.75rem_1fr] items-center gap-3 rounded px-2 py-1.5 hover:bg-panel/70"
          >
            <span className="flex items-center gap-2">
              <span className="tnum w-6 text-right text-xs text-fog">
                {String(i + 1).padStart(2, "0")}
              </span>
              <TeamMark slug={d.slug} name={d.name} abbr={d.abbr} color={d.color} size="sm" />
            </span>
            <span className="min-w-0 border-b border-line/60 pb-1.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold group-hover:underline" title={d.name}>
                    {d.name}
                  </span>
                  {d.result ? (
                    <span className={`tnum shrink-0 text-xs font-semibold ${resultTone}`}>{d.result}</span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-sm text-fog">{d.value}</span>
              </span>
              <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-panel">
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: d.barColor ?? d.color }}
                  initial={reduceMotion ? false : { width: "0%" }}
                  animate={{ width: `${Math.max(2.5, d.frac * 100)}%` }}
                  transition={{ ...barSpring, delay }}
                />
              </span>
              {d.sub && <span className="mt-1 block text-xs text-fog">{d.sub}</span>}
            </span>
          </Link>
        </motion.div>
        );
      })}
    </div>
  );
}
