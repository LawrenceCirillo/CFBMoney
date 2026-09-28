// Match only after removing terminal generational suffixes. Do not guess nicknames.
export function withoutGenerationalSuffix(name) {
  let normalized = name.trim();
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(/[\s,]+(?:Jr\.?|Sr\.?|II\.?|III\.?|IV\.?)$/i, "").trim();
  } while (normalized !== previous);
  return normalized;
}

export function matchingRosterPlayers(roster, name) {
  const target = withoutGenerationalSuffix(name);
  return roster.filter((player) => withoutGenerationalSuffix(player.name) === target);
}
