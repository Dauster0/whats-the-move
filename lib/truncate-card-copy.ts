/**
 * Intelligent event title truncation for cards and detail screen.
 *
 * Multi-artist bills (comma-separated): show headliner + " + more".
 * Long single titles (> 50 chars): truncate at a word boundary.
 * Short titles: returned unchanged.
 */
export function truncateEventTitle(title: string): string {
  const t = String(title || "").trim();
  if (!t || t.length <= 50) return t;

  // Multi-artist bill: take the first artist name before the first comma
  const commaIdx = t.indexOf(",");
  if (commaIdx > 0) {
    const headliner = t.slice(0, commaIdx).trim();
    if (headliner.length >= 3) return `${headliner} + more`;
  }

  // Long single title: cut at last word boundary before char 48
  const cut = t.slice(0, 48).replace(/\s+\S*$/, "").trimEnd();
  return `${cut}...`;
}

/** Deck card: max two sentences; full copy stays on detail. */
export function truncateToTwoSentences(text: string): string {
  const t = String(text || "").trim();
  if (!t) return t;
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 2) return t;
  return parts.slice(0, 2).join(" ");
}
