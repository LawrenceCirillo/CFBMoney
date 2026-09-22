import { NextResponse } from "next/server";
import { SeasonPayloadSchema } from "@/lib/season-payload";
import { createSeason } from "@/db/seasons";
import { dbEnabled } from "@/db/client";
import { getTeam } from "@/lib/data";
import { DATA_FINGERPRINT } from "@/lib/season-replay";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = SeasonPayloadSchema.safeParse(body);
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
    const id = await createSeason(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("publish season failed:", e);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }
}
