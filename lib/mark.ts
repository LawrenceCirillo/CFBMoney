/** Local ESPN dark mark, keyed by our slug. */
export function logoSrc(slug: string): string {
  return `/logos/${slug}.png`;
}

/**
 * ESPN 500-dark marks are full-color with black baked into the corners, not
 * white silhouettes. A school-color disc eats scarlet / cardinal / purple
 * fills (Ohio State, Nebraska, TCU). Always park them on ink so the mark
 * reads and the black padding disappears. True black, not the `ink` token —
 * that token flips to near-white in light mode.
 */
export function markDisc(_hex: string): string {
  return "#0a0a0c";
}
