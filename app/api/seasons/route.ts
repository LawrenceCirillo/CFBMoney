import { NextResponse } from "next/server";
import { SeasonPayloadSchema } from "@/lib/season-payload";
import { createSeason } from "@/db/seasons";
import { dbEnabled } from "@/db/client";

/**
 * Publish a completed season to the leaderboard.
 * Body: SeasonPayload (validated). Returns { id } — the share id for /s/[id].
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

  try {
    const id = await createSeason(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("publish season failed:", e);
    return NextResponse.json({ error: "Could not save the season." }, { status: 500 });
  }
}
