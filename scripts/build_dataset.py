#!/usr/bin/env python3
"""Build static JSON for CFB MONEY from uploads/cfb-moneyball-portal.csv."""

from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "uploads" / "cfb-moneyball-portal.csv"
OUT_TEAMS = ROOT / "data" / "teams.json"
OUT_META = ROOT / "data" / "meta.json"

# Primary moneyball model (see uploads/moneyball-methodology.md)
INTERCEPT = 3.2659
SLOPE = 0.1528


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace(".", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_float(val: str | None) -> float | None:
    if val is None or val == "":
        return None
    try:
        f = float(val)
        if math.isnan(f):
            return None
        return f
    except ValueError:
        return None


def parse_int(val: str | None) -> int | None:
    f = parse_float(val)
    if f is None:
        return None
    return int(f)


def parse_bool(val: str | None) -> bool:
    if not val:
        return False
    return val.strip().lower() in ("true", "1", "yes")


def kn_finance_block(row: dict) -> dict | None:
    has_mfrs = parse_bool(row.get("kn_has_mfrs"))
    if not has_mfrs:
        return None
    total_rev = parse_float(row.get("kn_total_rev_m"))
    if total_rev is None:
        return None
    return {
        "institution": row.get("kn_institution") or None,
        "url": row.get("kn_url") or None,
        "fy": parse_int(row.get("kn_fy")),
        "totalRevM": total_rev,
        "totalExpM": parse_float(row.get("kn_total_exp_m")),
        "ticketSalesM": parse_float(row.get("kn_ticket_sales_m")),
        "donationsM": parse_float(row.get("kn_donations_m")),
        "mediaConferenceM": parse_float(row.get("kn_media_conference_m")),
        "footballSpendingM": parse_float(row.get("kn_football_spending_m")),
        "coachesCompM": parse_float(row.get("kn_coaches_comp_m")),
        "nilRevShareLine44M": parse_float(row.get("kn_nil_rev_share_line44_m")),
        "recruitingExpM": parse_float(row.get("kn_recruiting_exp_m")),
        "rosterAsPctOfFootballSpend": parse_float(row.get("kn_roster_as_pct_of_football_spend")),
        "rosterAsPctOfTotalRev": parse_float(row.get("kn_roster_as_pct_of_total_rev")),
    }


def portal_block(row: dict, year: str) -> dict | None:
    transfers = parse_int(row.get(f"portal_{year}_transfers_in"))
    if transfers is None and parse_float(row.get(f"portal_{year}_avg_rating")) is None:
        return None
    return {
        "transfersIn": transfers,
        "avgRating": parse_float(row.get(f"portal_{year}_avg_rating")),
        "starPoints": parse_float(row.get(f"portal_{year}_star_points")),
        "stars4": parse_int(row.get(f"portal_{year}_stars_4")),
        "stars5": parse_int(row.get(f"portal_{year}_stars_5")),
        "rankInP4": parse_int(row.get(f"portal_{year}_rank_in_p4")),
    }


def team_record(row: dict) -> dict:
    name = row["team"].strip()
    budget_mid = parse_float(row["budget_mid_m"])
    if budget_mid is None:
        raise ValueError(f"Missing budget_mid_m for {name}")

    budget_min = parse_float(row["budget_min_m"])
    budget_max = parse_float(row["budget_max_m"])
    wins_2025 = parse_int(row["wins_2025"])
    losses_2025 = parse_int(row["losses_2025"])

    expected = INTERCEPT + SLOPE * budget_mid
    if wins_2025 is not None:
        wae = wins_2025 - expected
        dpw_2025 = budget_mid / wins_2025 if wins_2025 > 0 else None
    else:
        wae = None
        dpw_2025 = None

    wins_2026 = parse_int(row["wins_2026"])
    dpw_2026 = (
        budget_mid / wins_2026 if wins_2026 is not None and wins_2026 > 0 else None
    )

    kn = kn_finance_block(row)

    return {
        "slug": slugify(name),
        "name": name,
        "conference": row.get("conference", "").strip(),
        "budgetMin": budget_min,
        "budgetMax": budget_max,
        "budgetMid": budget_mid,
        "record2025": {
            "wins": wins_2025,
            "losses": losses_2025,
            "confWins": parse_int(row.get("conf_wins_2025")),
            "confLosses": parse_int(row.get("conf_losses_2025")),
        },
        "record2026": {
            "wins": wins_2026,
            "losses": parse_int(row["losses_2026"]),
        },
        "moneyball": {
            "expectedWins2025": round(expected, 3),
            "winsAboveExpected2025": round(wae, 3) if wae is not None else None,
            "dollarsPerWin2025MidM": round(dpw_2025, 4) if dpw_2025 is not None else None,
            "dollarsPerWin2026MidM": round(dpw_2026, 4) if dpw_2026 is not None else None,
        },
        "recruiting": {
            "rank2025": parse_int(row.get("recruit_rank_2025")),
            "points2025": parse_float(row.get("recruit_points_2025")),
            "rankAvg2022_2025": parse_float(row.get("recruit_rank_avg_2022_2025")),
            "pointsAvg2022_2025": parse_float(row.get("recruit_points_avg_2022_2025")),
        },
        "ratings": {
            "spPlus2025": parse_float(row.get("sp_rating_2025")),
            "spRank2025": parse_int(row.get("sp_rank_2025")),
            "spPlus2026": parse_float(row.get("sp_rating_2026")),
            "spRank2026": parse_int(row.get("sp_rank_2026")),
            "fpi2025": parse_float(row.get("fpi_2025")),
            "fpiRank2025": parse_int(row.get("fpi_rank_2025")),
            "fpi2026": parse_float(row.get("fpi_2026")),
            "fpiRank2026": parse_int(row.get("fpi_rank_2026")),
        },
        "portal": {
            "2025": portal_block(row, "2025"),
            "2026": portal_block(row, "2026"),
        },
        "knightNewhouse": kn,
        "cfbdTeam": row.get("cfbd_team") or name,
        "notes": row.get("notes") or None,
    }


def main() -> None:
    if not CSV_PATH.is_file():
        raise SystemExit(f"Missing CSV: {CSV_PATH}")

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    teams = [team_record(r) for r in rows]
    teams.sort(key=lambda t: (-(t["budgetMid"] or 0), t["name"]))

    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "teamCount": len(teams),
        "seasonLabel": "2025 wins vs 2026 roster budgets (Athletic NIL estimates)",
        "moneyballModel": {
            "formula": f"wins ≈ {INTERCEPT} + {SLOPE} × budget_mid_m",
            "intercept": INTERCEPT,
            "slope": SLOPE,
            "description": "OLS linear fit across 68 Power 4 + Notre Dame teams",
        },
        "sources": [
            {
                "name": "The Athletic",
                "description": "2026 NIL roster budget ranges and midpoints (Sept 16, 2026)",
            },
            {
                "name": "CollegeFootballData (CFBD)",
                "description": "Recruiting composites, SP+, FPI, portal transfer aggregates",
            },
            {
                "name": "Knight-Newhouse College Sports Database",
                "description": "NCAA MFRS athletic finances where published (public institutions)",
            },
            {
                "name": "Football Database",
                "description": "2025 and early 2026 W-L records",
            },
        ],
        "caveats": [
            "Budgets reflect 2026 roster assembly cost; paired with 2025 win totals.",
            "2026 W-L and $/win are early-season snapshots only.",
            "Knight-Newhouse MFRS not published for many private schools and Pitt.",
        ],
    }

    OUT_TEAMS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TEAMS.write_text(json.dumps(teams, indent=2) + "\n", encoding="utf-8")
    OUT_META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(teams)} teams → {OUT_TEAMS}")
    print(f"Wrote meta → {OUT_META}")


if __name__ == "__main__":
    main()
