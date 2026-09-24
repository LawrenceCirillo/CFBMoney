"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export interface SeasonTickerGame {
  week: number;
  stage?: string;
  opponentSlug: string;
  opponentAbbr: string;
  isHome: boolean;
  scoreFor?: number;
  scoreAgainst?: number;
  won?: boolean;
}

export interface SeasonTickerState {
  programSlug: string;
  programAbbr: string;
  games: SeasonTickerGame[];
  featured: number;
  done: boolean;
}

const SeasonTickerContext = createContext<{
  season: SeasonTickerState | null;
  setSeason: Dispatch<SetStateAction<SeasonTickerState | null>>;
} | null>(null);

export function SeasonTickerProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<SeasonTickerState | null>(null);
  return <SeasonTickerContext.Provider value={{ season, setSeason }}>{children}</SeasonTickerContext.Provider>;
}

export function useSeasonTicker() {
  const context = useContext(SeasonTickerContext);
  if (!context) throw new Error("Season ticker must be inside SeasonTickerProvider");
  return context;
}
