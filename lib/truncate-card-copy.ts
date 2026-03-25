/** Deck card: max two sentences; full copy stays on detail. */
export function truncateToTwoSentences(text: string): string {
  const t = String(text || "").trim();
  if (!t) return t;
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 2) return t;
  return parts.slice(0, 2).join(" ");
}
