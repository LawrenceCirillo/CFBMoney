export type TeamRecord = {
  wins: number | null;
  losses: number | null;
  confWins?: number | null;
  confLosses?: number | null;
};

export type PortalYear = {
  transfersIn: number | null;
  avgRating: number | null;
  starPoints: number | null;
  stars4: number | null;
  stars5: number | null;
  rankInP4: number | null;
};

export type KnightNewhouse = {
  institution: string | null;
  url: string | null;
  fy: number | null;
  totalRevM: number | null;
  totalExpM: number | null;
  ticketSalesM: number | null;
  donationsM: number | null;
  mediaConferenceM: number | null;
  footballSpendingM: number | null;
  coachesCompM: number | null;
  nilRevShareLine44M: number | null;
  recruitingExpM: number | null;
  rosterAsPctOfFootballSpend: number | null;
  rosterAsPctOfTotalRev: number | null;
};

export type Team = {
  slug: string;
  name: string;
  conference: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetMid: number;
  record2025: TeamRecord;
  record2026: TeamRecord;
  moneyball: {
    expectedWins2025: number;
    winsAboveExpected2025: number | null;
    dollarsPerWin2025MidM: number | null;
    dollarsPerWin2026MidM: number | null;
  };
  recruiting: {
    rank2025: number | null;
    points2025: number | null;
    rankAvg2022_2025: number | null;
    pointsAvg2022_2025: number | null;
  };
  ratings: {
    spPlus2025: number | null;
    spRank2025: number | null;
    spPlus2026: number | null;
    spRank2026: number | null;
    fpi2025: number | null;
    fpiRank2025: number | null;
    fpi2026: number | null;
    fpiRank2026: number | null;
  };
  portal: {
    "2025": PortalYear | null;
    "2026": PortalYear | null;
  };
  knightNewhouse: KnightNewhouse | null;
  cfbdTeam: string;
  notes: string | null;
};

export type Meta = {
  generatedAt: string;
  teamCount: number;
  seasonLabel: string;
  moneyballModel: {
    formula: string;
    intercept: number;
    slope: number;
    description: string;
  };
  sources: { name: string; description: string }[];
  caveats: string[];
};
