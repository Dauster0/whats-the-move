import type { AICandidate } from "./curated-experiences";

/**
 * True when Google hours say the business is closed right now.
 * Unknown (no hours) → false so we still show parks, outdoor ideas, and curated rows.
 */
export function isCandidateProbablyClosedNow(c: AICandidate): boolean {
  if (c.openNow === true) return false;
  if (c.openNow === false) return true;

  const h = (c.hoursSummary || "").trim();
  if (!h) return false;
  if (/^closed\b/i.test(h)) return true;
  if (/\bclosed\b.*\bopens\b/i.test(h)) return true;
  if (/\bclosed\s*·\s*opens\b/i.test(h)) return true;
  return false;
}
