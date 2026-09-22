import { ImageResponse } from "next/og";
import { getSeason } from "@/db/seasons";
import { dbEnabled } from "@/db/client";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

/**
 * NOTE for future edits: satori (next/og) requires every <div> with more than
 * one child to set display:flex explicitly. To stay safe, every text node below
 * is a single template-literal expression — never raw text mixed with {expr}.
 */
function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0a0a0b",
          color: "#fff",
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 28, color: "#71717a" }}>
          {`CFB Money`}
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, marginTop: 24 }}>
          {`What does it cost to win college football?`}
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa", marginTop: 16 }}>
          {`Build a roster. Sim the season. Share the receipt.`}
        </div>
      </div>
    ),
    { ...size }
  );
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!dbEnabled()) return fallback();
  const s = await getSeason(id).catch(() => null);
  if (!s) return fallback();

  const gm = s.gmName ? ` · ${s.gmName}` : "";
  const over = s.wins - s.expectedWins;
  const line =
    over > 0.5
      ? `Overachieved by ${over.toFixed(1)} wins`
      : over < -0.5
        ? `Underachieved by ${Math.abs(over).toFixed(1)} wins`
        : `Right on expectation`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0a0a0b",
          color: "#fff",
          fontFamily: FONT,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: s.programColor,
          }}
        />
        <div style={{ fontSize: 28, color: "#71717a" }}>
          {`CFB Money · Simulated season`}
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 24 }}
        >
          <div style={{ fontSize: 150, fontWeight: 900, lineHeight: 1 }}>
            {`${s.wins}–${s.losses}`}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56, fontWeight: 800 }}>{s.programName}</div>
            <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 8 }}>
              {`$${s.budgetM}M roster${gm} · ${s.expectedWins.toFixed(1)} expected wins`}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 32, color: "#d4d4d8", marginTop: 32 }}>{line}</div>
        {s.bestWin ? (
          <div style={{ fontSize: 28, color: "#6ee7b7", marginTop: 12 }}>
            {`Best win: ${s.bestWin.opponent} ${s.bestWin.scoreFor}–${s.bestWin.scoreAgainst}`}
          </div>
        ) : null}
      </div>
    ),
    { ...size }
  );
}
