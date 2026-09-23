"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import TeamMark from "@/components/TeamMark";

export interface BarDatum {
  slug: string;
  name: string;
  abbr: string;
  /** School color for the spend bar. */
  color: string;
  /** Bar fill. Defaults to school color. */
  barColor?: string;
  /** 0..1 fraction of the longest bar */
  frac: number;
  /** Value represented by the selected metric. */
  value: string;
  sub?: string;
  record: string;
  apRank: number | null;
  conference: string;
  budget: string;
}

/** Animated, re-sortable bar list. Rows glide to their new positions on metric switch. */
const FIRST_SCREEN = 8;
const GRID = "md:grid-cols-[1.75rem_minmax(8rem,1.3fr)_3.5rem_3.75rem_5.5rem_minmax(7rem,2fr)_7rem_1rem]";

export default function TeamBars({ data, metricLabel }: { data: BarDatum[]; metricLabel: string }) {
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
      <div className={`hidden items-end gap-x-2 border-b border-line px-2 pb-2 text-xs font-medium text-fog md:grid lg:gap-x-3 ${GRID}`}>
        <span>#</span>
        <span>Team</span>
        <span className="relative -left-1 whitespace-nowrap">Record</span>
        <span className="whitespace-nowrap">AP Rank</span>
        <span className="whitespace-nowrap">Conference</span>
        <span><span className="sr-only">Selected metric</span></span>
        <span className="whitespace-nowrap">Est. 2026 Budget</span>
        <span><span className="sr-only">Team page</span></span>
      </div>

      {data.map((d, i) => {
        const delay = reduceMotion || !arrival.current || i >= FIRST_SCREEN ? 0 : i * 0.05;
        const showMetricValue = d.value !== d.budget;
        return (
          <motion.div key={d.slug} layout={!reduceMotion} transition={spring}>
            <Link
              href={`/team/${d.slug}`}
              className={`group -mx-2 grid grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 gap-y-2 rounded px-2 py-3 transition-colors hover:bg-panel/70 md:mx-0 md:gap-y-0 md:py-2.5 lg:gap-x-3 ${GRID}`}
              aria-label={`${i + 1}. ${d.name}, ${d.record} record, ${d.apRank == null ? "unranked" : `AP number ${d.apRank}`}, ${d.conference}, ${showMetricValue ? `${metricLabel} ${d.value}, ` : ""}estimated 2026 budget ${d.budget}. View team page.`}
            >
              <span className="tnum row-span-3 self-start pt-1 text-lg font-medium text-fog md:row-auto md:self-center md:pt-0">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 md:col-auto md:row-auto">
                <TeamMark slug={d.slug} name={d.name} abbr={d.abbr} color={d.color} size="md" />
                <span className="truncate text-sm font-semibold lg:text-base group-hover:underline" title={d.name}>
                  {d.name}
                </span>
              </span>

              <span className="col-span-3 col-start-2 row-start-2 flex min-w-0 items-center gap-3 text-sm text-fog md:contents">
                <span className="tnum shrink-0"><span className="md:hidden">Record </span>{d.record}</span>
                <span className="tnum shrink-0"><span className="md:hidden">AP </span>{d.apRank == null ? "—" : `#${d.apRank}`}</span>
                <span className="min-w-0 truncate" title={d.conference}>{d.conference}</span>
              </span>

              <span className="col-span-3 col-start-2 row-start-3 min-w-0 md:col-auto md:row-auto">
                <span className="flex items-center gap-2">
                  <span className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-panel">
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: d.barColor ?? d.color }}
                      initial={reduceMotion ? false : { width: "0%" }}
                      animate={{ width: `${Math.max(2.5, d.frac * 100)}%` }}
                      transition={{ ...barSpring, delay }}
                    />
                  </span>
                  {showMetricValue && <span className="tnum shrink-0 text-xs font-semibold">{d.value}</span>}
                </span>
                {showMetricValue && d.sub && (
                  <span className="mt-1 block truncate text-[11px] text-fog" title={d.sub}>{d.sub}</span>
                )}
              </span>

              <span className="tnum col-start-3 row-start-1 whitespace-nowrap text-xs font-medium md:col-auto md:row-auto md:text-sm">
                {d.budget}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="col-start-4 row-start-1 h-4 w-4 text-fog md:col-auto md:row-auto"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
