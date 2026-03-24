/**
 * Pick the best Ticketmaster event for a venue: match card title hint (performer),
 * then prefer latest showtime when multiple listings exist.
 * Past events and far-future listings are filtered out before matching.
 */

/** Keep listings relevant for "going out soon" — not months away. */
export const DEFAULT_MAX_DAYS_AHEAD = 10;
/** Small grace so events "starting now" aren't dropped due to clock skew. */
const PAST_GRACE_MS = 5 * 60 * 1000;

/** Start instant for sorting/filtering (prefers ISO dateTime from API). */
export function getEventStartMs(event: any): number | null {
  const dt = event?.dates?.start?.dateTime;
  if (dt) {
    const t = new Date(dt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const ld = event?.dates?.start?.localDate;
  const lt = event?.dates?.start?.localTime;
  if (!ld) return null;
  const timePart =
    lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized =
    timePart.length === 5 ? `${timePart}:00` : timePart;
  const iso = `${ld}T${normalized}`;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Same local calendar day (device / browser timezone when running on client). */
export function sameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Ticketmaster / Discovery often still lists cancelled shows — drop them. */
export function isTicketmasterEventLikelyCancelled(event: any): boolean {
  const name = String(event?.name ?? "");
  if (/\bcancel(?:l)?ed\b|\bpostponed\b|\boff\s*sale\b/i.test(name)) {
    return true;
  }
  const code = String(event?.dates?.status?.code ?? "").toLowerCase();
  if (code === "cancelled" || code === "canceled") return true;
  const note = String(event?.pleaseNote ?? "");
  if (note.length > 0 && note.length < 400 && /\bcancel(?:l)?ed\b/i.test(note)) {
    return true;
  }
  return false;
}

/**
 * "What's the move right now" — not yesterday's 3pm show, not tomorrow's concert.
 * Keeps events that still have a start time in the future (with grace) AND on the same
 * local calendar day as `nowMs`.
 */
export function filterTicketmasterEventsForImmediateOuting(
  events: any[],
  nowMs: number = Date.now()
): any[] {
  const grace = PAST_GRACE_MS;
  const now = new Date(nowMs);
  return events.filter((e) => {
    if (isTicketmasterEventLikelyCancelled(e)) return false;
    const start = getEventStartMs(e);
    if (start == null || Number.isNaN(start)) return false;
    if (start < nowMs - grace) return false;
    if (!sameLocalCalendarDay(new Date(start), now)) return false;
    return true;
  });
}

/** Drop ended events and optional cap on how far ahead we show. */
export function filterUpcomingTicketmasterEvents(
  events: any[],
  nowMs: number = Date.now(),
  opts?: { maxDaysAhead?: number; graceMs?: number }
): any[] {
  const maxDays = opts?.maxDaysAhead ?? DEFAULT_MAX_DAYS_AHEAD;
  const grace = opts?.graceMs ?? PAST_GRACE_MS;
  const maxMs = nowMs + maxDays * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const start = getEventStartMs(e);
    if (start == null || Number.isNaN(start)) return false;
    if (start < nowMs - grace) return false;
    if (start > maxMs) return false;
    return true;
  });
}

export function getEventStartTimezone(event: any): string | undefined {
  const tz =
    event?.dates?.start?.timezone ||
    event?.dates?.timezone ||
    event?._embedded?.venues?.[0]?.timezone;
  return typeof tz === "string" && tz.length > 2 ? tz : undefined;
}

export function extractEventNameHintFromTitle(exactTitle: string): string {
  if (!exactTitle || typeof exactTitle !== "string") return "";
  const t = exactTitle.trim();
  const m1 = t.match(/[—–\-]\s*(.+?)\s+at\s+\d/i);
  if (m1) return m1[1].trim().replace(/\s+at\s*$/i, "").trim();
  const m2 = t.match(/\bfor\s+(.+?)\s+at\s+\d/i);
  if (m2) return m2[1].trim();
  const m3 = t.match(/Go to .+? for (.+?) at \d/i);
  if (m3) return m3[1].trim();
  return "";
}

export function venueNameMatchesEvent(venueName: string, eventVenue: string): boolean {
  const v = venueName.toLowerCase().replace(/\s+/g, " ");
  const e = (eventVenue || "").toLowerCase().replace(/\s+/g, " ");
  if (e.includes(v) || v.includes(e)) return true;
  const vWords = v.split(/\s+/).filter((w) => w.length > 2);
  const matchCount = vWords.filter((w) => e.includes(w)).length;
  return matchCount >= Math.min(2, vWords.length);
}

export function scoreEventAgainstHint(eventName: string, hint: string): number {
  if (!hint || !String(hint).trim()) return 0;
  const h = hint.toLowerCase().trim();
  const e = (eventName || "").toLowerCase();
  if (!e) return 0;
  if (e.includes(h) || h.includes(e)) return 1000;
  const hWords = h.split(/\s+/).filter((w) => w.length > 2);
  let s = 0;
  for (const w of hWords) {
    if (e.includes(w)) s += 100;
  }
  return s;
}

export function pickBestTicketmasterEvent(
  events: any[],
  venueName: string,
  eventNameHint: string,
  nowMs: number = Date.now()
): any | null {
  const upcoming = filterTicketmasterEventsForImmediateOuting(
    filterUpcomingTicketmasterEvents(events, nowMs),
    nowMs
  );
  const matched: any[] = [];
  for (const event of upcoming) {
    const eventVenue = event?._embedded?.venues?.[0]?.name ?? "";
    if (!venueNameMatchesEvent(venueName, eventVenue)) continue;
    const name = event?.name ?? "";
    if (!name || name === "Live event") continue;
    matched.push(event);
  }
  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0];

  const hint = (eventNameHint || "").trim();
  if (hint) {
    const scored = matched.map((e) => ({
      e,
      s: scoreEventAgainstHint(e.name, hint),
    }));
    const maxS = Math.max(...scored.map((x) => x.s));
    const top = scored.filter((x) => x.s === maxS);
    const pool = maxS > 0 ? top : scored;
    const getMs = (ev: any) => getEventStartMs(ev) ?? 0;
    const getLocalDayKey = (ev: any) =>
      ev?.dates?.start?.localDate ||
      String(ev?.dates?.start?.dateTime || "").slice(0, 10);
    // Prefer the nearest show *date*, then latest time that same night (e.g. 9:30 vs 7:00).
    pool.sort((a, b) => getMs(a.e) - getMs(b.e));
    const firstDay = getLocalDayKey(pool[0].e);
    const sameNight = pool.filter((x) => getLocalDayKey(x.e) === firstDay);
    sameNight.sort((a, b) => getMs(b.e) - getMs(a.e));
    return sameNight[0].e;
  }

  matched.sort((a, b) => {
    const ta = getEventStartMs(a) ?? 0;
    const tb = getEventStartMs(b) ?? 0;
    return ta - tb;
  });
  return matched[0];
}
