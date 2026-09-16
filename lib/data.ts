import type { Meta, Team } from "@/lib/types";
import teamsJson from "@/data/teams.json";
import metaJson from "@/data/meta.json";

const teams = teamsJson as Team[];
const meta = metaJson as Meta;

export function getTeams(): Team[] {
  return teams;
}

export function getMeta(): Meta {
  return meta;
}

export function getTeamBySlug(slug: string): Team | undefined {
  return teams.find((t) => t.slug === slug);
}

export function getAllTeamSlugs(): string[] {
  return teams.map((t) => t.slug);
}
