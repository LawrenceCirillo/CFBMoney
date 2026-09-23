/** Build-time rasterized team mark, keyed by our slug. */
export function logoSrc(slug: string): string {
  return `/marks/${slug}.webp`;
}

/** White backing for compact marks in the scatterplot. */
export function markDisc(_hex: string): string {
  return "#ffffff";
}
