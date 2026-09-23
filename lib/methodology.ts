import type { CfbData } from "./types";
import { fmtPollDate } from "./format";

type SourceSnapshot = Pick<CfbData, "season" | "source" | "poll" | "fpi">;

/** Labels come from the committed source snapshot, so a reviewed refresh updates the page. */
export function methodologySourceLabels(snapshot: SourceSnapshot) {
  return {
    budgets: snapshot.source.note,
    poll: `Week ${snapshot.poll.week} · ${fmtPollDate(snapshot.poll.as_of)}, ${snapshot.season}`,
    fpi: `${fmtPollDate(snapshot.fpi.as_of)}, ${snapshot.season}`,
  };
}
