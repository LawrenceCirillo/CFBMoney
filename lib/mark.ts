/** Build-time rasterized team mark, keyed by our slug. */
export function logoSrc(slug: string): string {
  return `/marks/${slug}.webp`;
}

/** A fixed light disc keeps dark school marks readable in both themes. */
export function markDisc(_hex: string): string {
  return "#f5f1e9";
}
