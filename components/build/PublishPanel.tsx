"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishAttempt } from "@/lib/build-session";
import type { TeamBudget } from "@/lib/types";
import {
  type Allocation,
  type ScheduledGame,
} from "@/lib/simulator";
import { SeasonPayloadSchema, type SeasonPayload } from "@/lib/season-payload";
import { DATA_FINGERPRINT, SIM_VERSION, type ReplayMode } from "@/lib/season-replay";
import type { GameplanPick } from "@/lib/gameplan";
import { GRAVITY_VERSION } from "@/lib/gravity";

interface Props {
  mode: ReplayMode;
  games: ScheduledGame[];
  program: TeamBudget;
  alloc: Allocation;
  budgetM: number;
  gravityOn: boolean;
  seed: number;
  gameplan?: GameplanPick[];
  autoGameplan?: boolean;
  attempt: PublishAttempt | null;
  onAttemptChange: (attempt: PublishAttempt) => void;
}

/**
 * Publish-to-leaderboard panel, shared by Quick sim and Season mode.
 * Builds the payload from the finished season, validates it client-side,
 * then POSTs to /api/seasons.
 */
export default function PublishPanel({ mode, games, program, alloc, budgetM, gravityOn, seed, gameplan = [], autoGameplan = true, attempt, onAttemptChange }: Props) {
  const [gmName, setGmName] = useState(attempt?.payload.gmName ?? "");
  const [publishState, setPublishState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const shareUrl = attempt?.result ? `/s/${attempt.result.id}` : null;
  const [linkCopied, setLinkCopied] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const publish = async () => {
    if (publishState === "saving" || attempt?.result) return;
    setPublishError(null);

    if (games.some((g) => !g.result)) {
      setPublishError("Finish the season before publishing.");
      setPublishState("error");
      return;
    }

    const payload: SeasonPayload = attempt?.payload ?? {
      gmName: gmName.trim() || undefined,
      mode,
      simVersion: SIM_VERSION,
      dataFingerprint: DATA_FINGERPRINT,
      programSlug: program.slug,
      budgetM,
      alloc,
      seed,
      gameplan,
      autoGameplan,
      gravityOn,
      gravityVersion: GRAVITY_VERSION,
    };

    const valid = SeasonPayloadSchema.safeParse(payload);
    if (!valid.success) {
      setPublishError("This season didn't validate — try re-simming.");
      setPublishState("error");
      return;
    }

    const publishAttempt = attempt ?? { key: crypto.randomUUID(), payload: valid.data };
    // Persist the UUID and exact payload before the request can reach the server.
    if (!attempt) onAttemptChange(publishAttempt);

    setPublishState("saving");
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": publishAttempt.key },
        body: JSON.stringify(publishAttempt.payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = res.status === 429
          ? "Too many publish attempts. Wait a minute, then try again."
          : res.status === 413
            ? "This season is too large to publish. Reload and try again."
            : res.status === 409
              ? "This season uses older data. Reload the page and simulate again."
              : body?.error || `Publish failed (${res.status})`;
        throw new Error(message);
      }
      if (typeof body?.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.id)) throw new Error("Publish returned an invalid link. Try again.");
      onAttemptChange({ ...publishAttempt, result: { id: body.id } });
      setPublishState("done");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed.");
      setPublishState("error");
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
      setLinkCopied(true);
      copyTimer.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="text-xs font-semibold text-fog">
        Share this season
      </p>
      {shareUrl ? (
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
              disabled={!!attempt}
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
            <p className="mt-2 text-sm text-status-loss">{publishError}</p>
          )}
        </div>
      )}
    </div>
  );
}
