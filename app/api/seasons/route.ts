import { NextResponse } from "next/server";
import { SeasonPayloadSchema } from "@/lib/season-payload";
import { createSeason } from "@/db/seasons";
import { dbEnabled } from "@/db/client";
import { getTeam } from "@/lib/data";
import { DATA_FINGERPRINT } from "@/lib/season-replay";
import { replaySeason } from "@/lib/season-replay";

const MAX_BODY_BYTES = 16 * 1024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readBoundedJson(req: Request): Promise<{ body?: unknown; status?: number }> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { status: 413 };
  if (!req.body) return { status: 400 };

  const reader = req.body.getReader();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: 413 };
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
    return { body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))) };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Publish a completed season to the leaderboard.
 * Body: canonical replay inputs only. Returns { id } — the share id for /s/[id].
 */
export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: "The leaderboard database is not connected yet." },
      { status: 503 }
    );
  }

  const input = await readBoundedJson(req);
  if (input.status === 413) {
    return NextResponse.json({ error: "Season payload exceeds 16 KiB." }, { status: 413 });
  }
  if (input.status === 400) {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const publishKey = req.headers.get("idempotency-key");
  if (!publishKey || !UUID_V4.test(publishKey)) {
    return NextResponse.json({ error: "Reload the page before publishing this season." }, { status: 400 });
  }

  const parsed = SeasonPayloadSchema.safeParse(input.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid season payload.", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  if (!getTeam(parsed.data.programSlug)) {
    return NextResponse.json({ error: "Unknown program." }, { status: 422 });
  }
  if (parsed.data.dataFingerprint !== DATA_FINGERPRINT) {
    return NextResponse.json(
      { error: "Season data changed. Reload the page and simulate again." },
      { status: 409 }
    );
  }

  try {
    const replay = replaySeason(parsed.data);
    const calls = replay.games.map((game) => ({ week: game.week, off: game.gameplan!.off, def: game.gameplan!.def }));
    if (!replay.complete || (parsed.data.mode === "season" &&
      JSON.stringify(calls) !== JSON.stringify(parsed.data.gameplan))) {
      return NextResponse.json({ error: "Gameplan does not cover the completed season." }, { status: 422 });
    }
  } catch {
    return NextResponse.json({ error: "Season replay could not verify the gameplan." }, { status: 422 });
  }

  try {
    const id = await createSeason(parsed.data, publishKey.toLowerCase());
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("publish season failed:", e);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }
}
