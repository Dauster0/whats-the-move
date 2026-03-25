import type { ConciergeSuggestion } from "./concierge-types";

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable key for dedupe: events by TM id, places by Google resource name, else title+map. */
export function conciergeSuggestionKey(s: ConciergeSuggestion): string {
  const tid = String(s.ticketEventId || "").trim();
  if (tid) return `e:${tid}`;
  const gr = String(s.googlePlaceResourceName || "").trim();
  if (gr) return `p:${gr}`;
  return `t:${norm(s.title)}|${norm(s.mapQuery)}`;
}
