"use client";

import { useState } from "react";
import type { TeamBudget } from "@/lib/types";
import {
  type Allocation,
  type ScheduledGame,
} from "@/lib/simulator";
import { SeasonPayloadSchema, type SeasonPayload } from "@/lib/season-payload";
import { DATA_FINGERPRINT, SIM_VERSION, type ReplayMode } from "@/lib/season-replay";

interface Props {
  mode: ReplayMode;
  games: ScheduledGame[];
  program: TeamBudget;
  alloc: Allocation;
  budgetM: number;
  seed: number;
}

/**
 * Publish-to-leaderboard panel, shared by Quick sim and Season mode.
 * Builds the payload from the finished season, validates it client-side,
 * then POSTs to /api/seasons.
 */
export default function PublishPanel({ mode, games, program, alloc, budgetM, seed }: Props) {
  const [gmName, setGmName] = useState("");
  const [publishState, setPublishState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const publish = async () => {
    if (publishState === "saving" || publishState === "done") return;
    setPublishError(null);

    if (games.some((g) => !g.result)) {
      setPublishError("Finish the season before publishing.");
      setPublishState("error");
      return;
    }

    const payload: SeasonPayload = {
      gmName: gmName.trim() || undefined,
      mode,
      simVersion: SIM_VERSION,
      dataFingerprint: DATA_FINGERPRINT,
      programSlug: program.slug,
      budgetM,
      alloc,
      seed,
    };

    const valid = SeasonPayloadSchema.safeParse(payload);
    if (!valid.success) {
      setPublishError("This season didn't validate — try re-simming.");
      setPublishState("error");
      return;
    }

    setPublishState("saving");
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid.data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(res.status === 409 ? "This season uses older data. Reload the page and simulate again." : body?.error || `Publish failed (${res.status})`);
      setShareUrl(`${window.location.origin}/s/${body.id}`);
      setPublishState("done");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed.");
      setPublishState("error");
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="text-xs font-semibold text-fog">
        Share this season
      </p>
      {publishState === "done" && shareUrl ? (
        <div>
          <p className="mt-3 text-sm text-fog">
            Published to the leaderboard. Send this link anywhere.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate text-sm text-paper"
              title={shareUrl}
            >
              {shareUrl}
            </code>
            <button
              onClick={copyLink}
              className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              {linkCopied ? "Copied" : "Copy link"}
            </button>
            <a
              href={shareUrl}
              className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-paper transition-ui hover:border-fog"
            >
              Open recap
            </a>
          </div>
        </div>
      ) : (
        <div>
          <p className="mt-3 text-sm text-fog">
            Publish the full game log to the leaderboard and get a shareable recap
            page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="gm-name" className="sr-only">
              GM name (optional)
            </label>
            <input
              id="gm-name"
              value={gmName}
              onChange={(e) => setGmName(e.target.value.slice(0, 24))}
              placeholder="GM name (optional)"
              autoComplete="nickname"
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2.5 text-sm text-paper placeholder:text-fog focus:border-paper focus:outline-none"
            />
            <button
              onClick={publish}
              disabled={publishState === "saving"}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink transition-ui hover:bg-emerald-400 disabled:opacity-60"
            >
              {publishState === "saving" ? "Publishing…" : "Publish season"}
            </button>
          </div>
          {publishState === "error" && publishError && (
            <p className="mt-2 text-sm text-down">{publishError}</p>
          )}
        </div>
      )}
    </div>
  );
}
