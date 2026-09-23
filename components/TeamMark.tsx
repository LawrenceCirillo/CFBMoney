"use client";

import { useState } from "react";
import { logoSrc } from "@/lib/mark";

export type MarkSize = "sm" | "md" | "lg" | "xl";

function markPx(size: MarkSize): number {
  switch (size) {
    case "sm":
      return 24;
    case "md":
      return 32;
    case "lg":
      return 40;
    case "xl":
      return 56;
    default: {
      const _exhaustive: never = size;
      return _exhaustive;
    }
  }
}

export default function TeamMark({
  slug,
  name,
  abbr,
  size = "md",
}: {
  slug: string;
  name: string;
  abbr: string;
  color: string;
  size?: MarkSize;
}) {
  const [failed, setFailed] = useState(false);
  const px = markPx(size);
  const typeSize = size === "sm" ? "text-[8px]" : size === "xl" ? "text-xs" : "text-[9px]";

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: px, height: px }}
      title={name}
    >
      {failed ? (
        <span className={`${typeSize} font-black tracking-tight text-paper`}>{abbr}</span>
      ) : (
        // Pre-sized static WebP. A missing file falls back to the abbreviation.
        <img
          src={logoSrc(slug)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          className="team-mark-image h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
