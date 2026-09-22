export interface TeamBudget {
  slug: string;
  name: string;
  abbr: string;
  conference: string;
  color: string;
  /** ESPN site-v2 team id; used only to cache dark logos. */
  espn_id: string;
  budget_low_m: number;
  budget_high_m: number;
  budget_mid_m: number;
  /** 2026 preseason AP Top 25 (Aug. 17). Null if unranked. */
  preseason_rank: number | null;
  /** Current AP Top 25. Null if unranked. The ballot week lives on `poll`. */
  ap_rank: number | null;
  spend_rank: number;
  /** spend_rank - ap_rank. Positive = ranked better than the book. Null if unranked. */
  value_gap: number | null;
  /** ESPN FPI rank of games already played. 1 is the hardest slate among FBS. */
  sos_played_rank: number;
  /** ESPN FPI rank of games still left. 1 is the hardest slate among FBS. */
  sos_remaining_rank: number;
}

export interface CfbPoll {
  name: string;
  week: number;
  as_of: string;
  note: string;
}

export interface CfbData {
  season: number;
  generated_at: string;
  source: { name: string; url: string; note: string };
  poll: CfbPoll;
  fpi: { name: string; as_of: string; note: string };
  totals: { teams: number; total_mid_m: number };
  teams: TeamBudget[];
}
