import type { GameplanResolution } from "./gameplan";

export function winOdds(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

/** Read the stored/applied probability, never reconstruct the engine's bounds. */
export function gameplanOdds(neutral: number, plan: Pick<GameplanResolution, "adjustedWinProb" | "netEdge"> | null) {
  const adjusted = plan?.adjustedWinProb ?? neutral;
  const deltaPoints = 100 * (adjusted - neutral);
  const magnitude = Math.abs(deltaPoints);
  const direction = deltaPoints > 0 ? "increase" : "decrease";
  const change = deltaPoints === 0 ? "No change in win odds"
    : magnitude.toFixed(1) === "0.0" ? `Less than 0.1 percentage point ${direction}`
      : `${magnitude.toFixed(1)} percentage point${magnitude.toFixed(1) === "1.0" ? "" : "s"} ${direction}`;
  const modifier = plan ? `${plan.netEdge > 0 ? "+" : plan.netEdge < 0 ? "−" : ""}${Math.abs(plan.netEdge)} points` : null;
  const neutralLabel = winOdds(neutral);
  const adjustedLabel = winOdds(adjusted);
  return { neutralLabel, adjustedLabel, deltaPoints, change, modifier,
    summary: `Neutral ${neutralLabel} → with calls ${adjustedLabel}. ${change}.${modifier ? ` Matchup modifier: ${modifier}.` : ""}` };
}
