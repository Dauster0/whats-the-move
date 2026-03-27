/**
 * Orchestrates weather + Ticketmaster + Google Places + OpenAI + Unsplash
 * for POST /concierge-recommendations.
 */

import OpenAI from "openai";
import { matchNearbyPlace, resolveConciergeSuggestionImages } from "./concierge-images.js";
import { enrichConciergeMovieSuggestions } from "./movie-enrichment.js";
import { fetchPlacesWideNet } from "./places-wide-net.js";
import { SYSTEM_PROMPT } from "./concierge-prompt.js";
import { filterAndSortByScore, haversineMiles } from "./concierge-scoring.js";
import { formatHumanGoingOutTime } from "./human-event-time.js";
import { ALL_INTEREST_LABEL_PAIRS } from "./interest-labels.js";

const TM_KEY = process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
const GOOGLE_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

function getUnsplashKey() {
  for (const raw of [process.env.UNSPLASH_ACCESS_KEY, process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY]) {
    const t = String(raw ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (t && !t.toLowerCase().startsWith("your_") && t.length > 8) return t;
  }
  return "";
}

async function fetchWeatherSummary(lat, lng) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m`;
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { summary: "unknown", tempC: null, code: null };
    const d = await r.json();
    const t = d?.current?.temperature_2m;
    const code = d?.current?.weather_code;
    let summary = "clear";
    if (typeof code === "number") {
      if (code >= 51 && code <= 99) summary = "wet";
      else if (code >= 45 && code <= 48) summary = "gray";
    }
    return { summary, tempC: typeof t === "number" ? t : null, code };
  } catch {
    return { summary: "unknown", tempC: null, code: null };
  }
}

function formatTmPriceRanges(priceRanges) {
  if (!Array.isArray(priceRanges) || priceRanges.length === 0) return "";
  let bestMin = null;
  let currency = "USD";
  for (const p of priceRanges) {
    const min = p.min != null ? Number(p.min) : null;
    if (min == null || Number.isNaN(min)) continue;
    if (bestMin == null || min < bestMin) {
      bestMin = min;
      currency = p.currency || "USD";
    }
  }
  if (bestMin != null) {
    const sym = currency === "USD" ? "$" : `${currency} `;
    return `From ${sym}${Math.round(bestMin)}`;
  }
  const p0 = priceRanges[0];
  const max = p0?.max != null ? Number(p0.max) : null;
  const cur = p0?.currency || "USD";
  const sym = cur === "USD" ? "$" : `${cur} `;
  if (max != null && !Number.isNaN(max)) return `Up to ${sym}${Math.round(max)}`;
  return "";
}

function ymdInTimeZone(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function dayDiffYmd(a, b) {
  const [ya, ma, da] = String(a)
    .split("-")
    .map((x) => Number(x));
  const [yb, mb, db] = String(b)
    .split("-")
    .map((x) => Number(x));
  if (!ya || !yb) return NaN;
  const ua = Date.UTC(ya, ma - 1, da);
  const ub = Date.UTC(yb, mb - 1, db);
  return Math.round((ub - ua) / 86400000);
}

function calendarYmdInTz(ms, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

/** Weekday name for a calendar YYYY-MM-DD in the user's IANA timezone. */
function weekdayLongForYmdInTz(ymd, tz) {
  const [y, mo, d] = String(ymd)
    .split("-")
    .map((x) => parseInt(x, 10));
  if (!y || !mo || !d) return "";
  const base = Date.UTC(y, mo - 1, d, 12, 0, 0);
  for (let delta = -14; delta <= 14; delta++) {
    const ms = base + delta * 3600000;
    if (calendarYmdInTz(ms, tz) === ymd) {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "long" }).format(
        new Date(ms)
      );
    }
  }
  return "";
}

function computeEventWhenLabel(e, nowIso, timeZone) {
  const today = ymdInTimeZone(nowIso, timeZone);
  const eventDay =
    String(e.localDate || "").trim() ||
    (e.startIso ? ymdInTimeZone(e.startIso, timeZone) : "");
  if (!eventDay || !/^\d{4}-\d{2}-\d{2}$/.test(eventDay)) return "";
  const diff = dayDiffYmd(today, eventDay);
  if (diff === 0) return "Tonight";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 6) {
    const w = weekdayLongForYmdInTz(eventDay, timeZone);
    return w ? `This ${w}` : "";
  }
  if (diff > 6) return eventDay;
  return "";
}

/** Events from now through the next `days` calendar days (inclusive window). */
function filterTicketmasterUpcomingWindow(records, nowMs, maxDaysAhead = 5) {
  const end = nowMs + maxDaysAhead * 86400000;
  return (records || []).filter((e) => {
    const start = tmRecordStartMs(e);
    return start != null && start >= nowMs - 15 * 60 * 1000 && start <= end;
  });
}

function filterHungerPreference(suggestions, pref) {
  const p = String(pref || "any").toLowerCase();
  if (p === "any" || !p) return suggestions;
  return suggestions.filter((s) => {
    const cat = String(s.category || "").toLowerCase();
    const isEat = cat === "eat";
    if (p === "hungry") return isEat;
    if (p === "not_hungry") return !isEat;
    return true;
  });
}

function getEventStartMs(event) {
  const dt = event?.dates?.start?.dateTime;
  if (dt) {
    const x = new Date(dt).getTime();
    if (!Number.isNaN(x)) return x;
  }
  const ld = event?.dates?.start?.localDate;
  const lt = event?.dates?.start?.localTime;
  if (!ld) return null;
  const timePart = lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized = timePart.length === 5 ? `${timePart}:00` : timePart;
  const x = new Date(`${ld}T${normalized}`).getTime();
  return Number.isNaN(x) ? null : x;
}

/** Start time for flattened TM rows from fetchTicketmasterNearby (or raw API event). */
function tmRecordStartMs(rec) {
  if (rec?.dates?.start) return getEventStartMs(rec);
  if (rec?.startIso) {
    const x = new Date(rec.startIso).getTime();
    if (!Number.isNaN(x)) return x;
  }
  const ld = rec?.localDate;
  const lt = rec?.localTime;
  if (!ld) return null;
  const timePart = lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized = timePart.length === 5 ? `${timePart}:00` : timePart;
  const x = new Date(`${ld}T${normalized}`).getTime();
  return Number.isNaN(x) ? null : x;
}

/** Official Discovery segment ids (verified via classifications API). */
const TM_SEGMENT = {
  music: "KZFzniwnSyZfZ7v7nJ",
  sports: "KZFzniwnSyZfZ7v7nE",
  artsTheatre: "KZFzniwnSyZfZ7v7na",
  miscellaneous: "KZFzniwnSyZfZ7v7n1",
};

/**
 * Five parallel Discovery calls — Music, Sports, Arts, Comedy (arts + keyword), Family (misc segment).
 * TM has no "Family" segment; Miscellaneous catches fairs, exhibits, and other family-friendly listings.
 */
const TM_PARALLEL_QUERIES = [
  { segmentId: TM_SEGMENT.music },
  { segmentId: TM_SEGMENT.sports },
  { segmentId: TM_SEGMENT.artsTheatre },
  { segmentId: TM_SEGMENT.artsTheatre, keyword: "comedy" },
  { segmentId: TM_SEGMENT.miscellaneous },
];

function isTmDiscoveryEventCancelledOrBad(e) {
  const name = String(e?.name ?? "");
  if (/cancel(?:l)?ed|postponed/i.test(name)) return true;
  const code = String(e?.dates?.status?.code ?? "").toLowerCase();
  if (code === "cancelled" || code === "canceled") return true;
  return false;
}

function parseTmAgeRestriction(ar) {
  if (!ar || typeof ar !== "object") return null;
  const restricted = typeof ar.restrictedAge === "number" ? ar.restrictedAge : null;
  if (restricted != null) {
    if (restricted >= 21) return "21+";
    if (restricted >= 18) return "18+";
    return "all ages";
  }
  if (ar.legalAgeEnforced === true) return "21+";
  return null;
}

function mapTmDiscoveryEventToRecord(e) {
  const v = e?._embedded?.venues?.[0];
  const name = String(e?.name ?? "").trim();
  if (!name || isTmDiscoveryEventCancelledOrBad(e)) return null;
  const id = String(e?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name,
    venue: v?.name ?? "",
    startIso: e?.dates?.start?.dateTime || null,
    localDate: e?.dates?.start?.localDate ?? "",
    localTime: e?.dates?.start?.localTime ?? "",
    url: e?.url ?? "",
    segment: e?.classifications?.[0]?.segment?.name ?? "",
    genre: e?.classifications?.[0]?.genre?.name ?? "",
    priceLabel: formatTmPriceRanges(e?.priceRanges),
    ageRestriction: parseTmAgeRestriction(e?.ageRestrictions),
    images: Array.isArray(e?.images) ? e.images : [],
    attractions: (e?._embedded?.attractions ?? []).map((a) => ({
      name: a?.name ?? "",
      images: Array.isArray(a?.images) ? a.images : [],
    })),
  };
}

async function fetchTicketmasterDiscoverySegment(lat, lng, startIso, endIso, { segmentId, keyword, size }) {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", TM_KEY);
  url.searchParams.set("latlong", `${lat},${lng}`);
  url.searchParams.set("radius", "25");
  url.searchParams.set("unit", "miles");
  url.searchParams.set("size", String(size));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("startDateTime", startIso);
  url.searchParams.set("endDateTime", endIso);
  if (segmentId) url.searchParams.set("segmentId", segmentId);
  if (keyword) url.searchParams.set("keyword", keyword);
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  if (!r.ok) return [];
  const data = await r.json();
  return data?._embedded?.events ?? [];
}

async function fetchTicketmasterNearby(lat, lng, nowIso) {
  if (!TM_KEY || TM_KEY.includes("your_")) return [];
  try {
    const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
    const startIso = new Date(nowMs - 15 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const endIso = new Date(nowMs + 5 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const horizon = nowMs + 6 * 86400000;
    const perQuerySize = 12;

    const batches = await Promise.all(
      TM_PARALLEL_QUERIES.map((q) =>
        fetchTicketmasterDiscoverySegment(lat, lng, startIso, endIso, {
          segmentId: q.segmentId,
          keyword: q.keyword,
          size: perQuerySize,
        }).catch(() => [])
      )
    );

    const byId = new Map();
    for (const rawEvents of batches) {
      for (const e of rawEvents) {
        if (isTmDiscoveryEventCancelledOrBad(e)) continue;
        const start = getEventStartMs(e);
        if (start == null || start < nowMs - 15 * 60 * 1000 || start > horizon) continue;
        const row = mapTmDiscoveryEventToRecord(e);
        if (!row || byId.has(row.id)) continue;
        byId.set(row.id, row);
      }
    }

    const merged = [...byId.values()].sort(
      (a, b) => (tmRecordStartMs(a) ?? 0) - (tmRecordStartMs(b) ?? 0)
    );
    return merged.slice(0, 80);
  } catch {
    return [];
  }
}

async function fetchTicketmasterInDateRange(lat, lng, startIso, endIso) {
  if (!TM_KEY || TM_KEY.includes("your_")) return [];
  try {
    const perQuerySize = 20;
    const batches = await Promise.all(
      TM_PARALLEL_QUERIES.map((q) =>
        fetchTicketmasterDiscoverySegment(lat, lng, startIso, endIso, {
          segmentId: q.segmentId,
          keyword: q.keyword,
          size: perQuerySize,
        }).catch(() => [])
      )
    );
    const byId = new Map();
    for (const rawEvents of batches) {
      for (const e of rawEvents) {
        if (isTmDiscoveryEventCancelledOrBad(e)) continue;
        const row = mapTmDiscoveryEventToRecord(e);
        if (!row || byId.has(row.id)) continue;
        byId.set(row.id, row);
      }
    }
    return [...byId.values()].sort(
      (a, b) => (tmRecordStartMs(a) ?? 0) - (tmRecordStartMs(b) ?? 0)
    );
  } catch {
    return [];
  }
}

function ymdAddDays(ymd, deltaDays, tz) {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return "";
  const ms = Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0);
  return calendarYmdInTz(ms, tz);
}

function thisWeekendYmdSet(nowIso, tz) {
  const todayYmd = ymdInTimeZone(nowIso, tz);
  const wd = weekdayLongForYmdInTz(todayYmd, tz);
  let friYmd = "";
  if (wd === "Saturday") friYmd = ymdAddDays(todayYmd, -1, tz);
  else if (wd === "Sunday") friYmd = ymdAddDays(todayYmd, -2, tz);
  else if (wd === "Friday") friYmd = todayYmd;
  else {
    for (let d = 1; d <= 6; d++) {
      const y = ymdAddDays(todayYmd, d, tz);
      if (weekdayLongForYmdInTz(y, tz) === "Friday") {
        friYmd = y;
        break;
      }
    }
  }
  if (!friYmd) return new Set();
  return new Set([friYmd, ymdAddDays(friYmd, 1, tz), ymdAddDays(friYmd, 2, tz)]);
}

function filterAheadTmRecords(records, mode, nowIso, timeZone, pickedDateYmd) {
  const nowMs = new Date(nowIso).getTime();
  const todayYmd = ymdInTimeZone(nowIso, timeZone);
  if (mode === "tonight") {
    return (records || []).filter((r) => {
      const start = tmRecordStartMs(r);
      if (start == null || start <= nowMs + 5 * 60 * 1000) return false;
      const ymd =
        String(r.localDate || "").trim() ||
        (r.startIso ? ymdInTimeZone(r.startIso, timeZone) : "");
      return ymd === todayYmd;
    });
  }
  if (mode === "weekend") {
    const set = thisWeekendYmdSet(nowIso, timeZone);
    return (records || []).filter((r) => {
      const ymd =
        String(r.localDate || "").trim() ||
        (r.startIso ? ymdInTimeZone(r.startIso, timeZone) : "");
      return set.has(ymd);
    });
  }
  if (mode === "date") {
    const pick = String(pickedDateYmd || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pick)) return [];
    return (records || []).filter((r) => {
      const ymd =
        String(r.localDate || "").trim() ||
        (r.startIso ? ymdInTimeZone(r.startIso, timeZone) : "");
      return ymd === pick;
    });
  }
  if (mode === "further") {
    const limit = nowMs + 90 * 86400000;
    return (records || []).filter((r) => {
      const start = tmRecordStartMs(r);
      if (start == null) return false;
      return start > nowMs + 36 * 3600000 && start <= limit;
    });
  }
  return records || [];
}

function buildSuggestionKey(s) {
  const tid = String(s.ticketEventId || "").trim();
  if (tid) return `e:${tid}`;
  const gr = String(s.googlePlaceResourceName || "").trim();
  if (gr) return `p:${gr}`;
  const t = String(s.title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const mq = String(s.mapQuery || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `t:${t}|${mq}`;
}

function buildInterestEnrichment(userInterests) {
  const selected = new Set((userInterests || []).map((x) => String(x).toLowerCase().trim()));
  const positive = (userInterests || []).map((x) => String(x));
  const not_interested_in = ALL_INTEREST_LABEL_PAIRS.filter(([k]) => !selected.has(String(k).toLowerCase())).map(
    ([, label]) => label
  );
  return { positive_interests: positive, not_interested_in };
}

function interestSetHasMuseums(interests) {
  return (interests || []).some((i) => String(i).toLowerCase().trim() === "museums");
}

function filterPlacesByInterestPolicy(places, interests) {
  if (interestSetHasMuseums(interests)) return places;
  return (places || []).filter((p) => {
    const types = p.types || [];
    return !types.includes("museum") && !types.includes("art_gallery");
  });
}

function getTimeOfDayBucket(hour24) {
  if (hour24 >= 2 && hour24 < 6) return "late_night";
  if (hour24 >= 6 && hour24 < 11) return "morning";
  if (hour24 >= 11 && hour24 < 17) return "afternoon";
  if (hour24 >= 17 && hour24 < 21) return "evening";
  return "night";
}

const MEAL_TIMING_RULES_FOR_MODEL = `MEAL & TIME HARD RULES (local time in JSON):
- Never suggest breakfast after 11am (unless explicitly all-day breakfast).
- Never suggest lunch before 11am or after 3pm as a "lunch" primary pick.
- Never suggest dinner before 5pm — at 2pm do not pitch a dinner spot; use lunch, cafe, park, walk, matinee, etc.
- Never suggest "late-night" food before 9pm (e.g. BCD Tofu House is late-night Korean — do not suggest before 8pm).
- Morning 6–11: coffee, breakfast, farmers markets, early walks, bookstores.
- Afternoon 11–5: lunch, parks, beaches, neighborhoods, matinee shows, cafes — NOT dinner-as-default.
- Evening 5–9: dinner, happy hour, early shows, sunset spots.
- Night 9–2: late-night food, bars, concerts, comedy, night walks, 24h spots.
- Late night 2–6: only 24-hour diners, safe gas-station coffee, night drives — very limited.`;

function suggestionLooksMuseumLike(s, place) {
  const types = place?.types || [];
  if (types.includes("museum") || types.includes("art_gallery")) return true;
  const b = `${s.title} ${s.mapQuery} ${s.sourcePlaceName}`.toLowerCase();
  return (
    /\bmuseum\b/.test(b) ||
    /\bthe broad\b/.test(b) ||
    /\bgetty (center|villa)\b/.test(b) ||
    /\blacma\b/.test(b) ||
    /\bmoca\b/.test(b)
  );
}

function eventRecordMatchesUserInterests(record, interestSet) {
  if (!record) return false;
  const g = `${record.genre || ""} ${record.segment || ""}`.toLowerCase();
  if (/music|concert|indie|rock|dj|band|festival/.test(g)) {
    if (
      interestSet.has("live-music") ||
      interestSet.has("concerts") ||
      interestSet.has("nightlife")
    )
      return true;
  }
  if (/comedy|stand[\s-]?up/.test(g)) {
    if (interestSet.has("comedy") || interestSet.has("improv")) return true;
  }
  if (/theater|theatre|performance|broadway/.test(g)) {
    if (interestSet.has("theater") || interestSet.has("live-music")) return true;
  }
  return false;
}

function filterMuseumInterestPolicy(suggestions, interests, records, nearbyPlaces) {
  const set = new Set((interests || []).map((x) => String(x).toLowerCase().trim()));
  const allowMuseums = set.has("museums");
  const byId = new Map(records.map((r) => [r.id, r]));
  return suggestions.filter((s) => {
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (!suggestionLooksMuseumLike(s, place)) return true;
    if (allowMuseums) return true;
    const tid = String(s.ticketEventId || "").trim();
    if (tid && byId.has(tid) && eventRecordMatchesUserInterests(byId.get(tid), set)) return true;
    return false;
  });
}

function filterMealAndLateNightHeuristics(suggestions, hour24) {
  return suggestions.filter((s) => {
    const b = `${s.title} ${s.description} ${s.mapQuery} ${s.sourcePlaceName}`.toLowerCase();
    const cat = String(s.category || "").toLowerCase();

    if (/bcd\s*tofu/.test(b) && hour24 < 20) return false;
    if (/sun\s*nong\s*dan/.test(b) && hour24 < 21) return false;

    if (hour24 >= 2 && hour24 < 6) {
      const allow =
        Boolean(String(s.ticketEventId || "").trim()) ||
        /\b(24[\s-]?hour|24hr|diner|denny'?s?|ihop|waffle|gas station|night drive)\b/i.test(b);
      if (!allow) return false;
    }

    if (hour24 > 11 && /\b(breakfast)\b/.test(b) && !/\b(all[-\s]?day|24)\b/.test(b)) return false;
    if (hour24 > 15 && /\b(brunch)\b/.test(b) && !/\b(all[-\s]?day)\b/.test(b)) return false;
    if (hour24 < 11 && /\b(lunch)\b/.test(b) && !/\b(all[-\s]?day)\b/.test(b)) return false;

    if (hour24 >= 11 && hour24 < 17 && cat === "eat") {
      if (/\bdinner\b/.test(b) && !/\b(lunch|brunch|afternoon|open for lunch|lunch and)\b/.test(b)) {
        return false;
      }
    }
    if (hour24 < 21 && hour24 >= 5 && cat === "eat") {
      if (/\blate[-\s]?night\b/.test(b)) return false;
    }

    return true;
  });
}

function filterExcludedKeys(suggestions, excludeKeys) {
  const ex = new Set((excludeKeys || []).map((x) => String(x)));
  if (ex.size === 0) return suggestions;
  const nameParts = [];
  for (const k of ex) {
    const ks = String(k);
    if (ks.startsWith("n:")) nameParts.push(ks.slice(2).toLowerCase().trim());
  }
  return suggestions.filter((s) => {
    if (ex.has(buildSuggestionKey(s))) return false;
    const blob = `${s.title} ${s.mapQuery} ${s.sourcePlaceName}`.toLowerCase();
    for (const np of nameParts) {
      if (np.length >= 4 && blob.includes(np)) return false;
    }
    return true;
  });
}

function filterSafetyMacArthur(suggestions, hour24) {
  return suggestions.filter((s) => {
    const blob = `${s.title} ${s.mapQuery}`.toLowerCase();
    if (!blob.includes("macarthur park")) return true;
    if (hour24 >= 20 || hour24 < 6) return false;
    return true;
  });
}

function filterClosedVenuePlaces(suggestions, nearbyPlaces, planningAhead = false) {
  const out = [];
  for (const s of suggestions) {
    if (String(s.sourceType || "").toLowerCase() === "gpt_knowledge") {
      out.push(s);
      continue;
    }
    if (String(s.ticketEventId || "").trim()) {
      out.push(s);
      continue;
    }
    if (String(s.ticketUrl || "").trim()) {
      out.push(s);
      continue;
    }
    const cat = String(s.category || "").toLowerCase();
    const isPlaceKind = /eat|walk|social|chill/.test(cat);
    if (!isPlaceKind) {
      out.push(s);
      continue;
    }
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (!planningAhead && place && place.openNow === false) continue;
    out.push(s);
  }
  return out;
}

/**
 * Main deck hard rule: events must be actionable RIGHT NOW.
 *
 * - Reject if it started more than 60 minutes ago (already over or nearly over).
 * - Reject if it starts more than 90 minutes from now (belongs in Coming Up tab).
 *
 * Non-TM suggestions (places, GPT knowledge) are never rejected here.
 */
function filterEventsByTimeWindow(suggestions, ticketmasterRecords, nowMs) {
  const byId = new Map(ticketmasterRecords.map((r) => [r.id, r]));
  const MAX_AHEAD_MS = 90 * 60 * 1000;  // 90 min
  const MAX_PAST_MS  = 60 * 60 * 1000;  // 60 min
  return suggestions.filter((s) => {
    const eventId = String(s.ticketEventId || "").trim();
    if (!eventId) return true; // not a TM event — place or GPT, pass through
    const rec = byId.get(eventId);
    if (!rec) return true; // no record to check — pass through conservatively
    const evMs = tmRecordStartMs(rec);
    if (evMs == null || Number.isNaN(evMs)) return true; // no timestamp — pass through
    const diff = evMs - nowMs; // positive = future, negative = past
    if (diff > MAX_AHEAD_MS) {
      console.log("[deck filter] Rejected — too far out:", s.title, s.startTime, `(starts in ${Math.round(diff / 60000)} min)`);
      return false;
    }
    if (diff < -MAX_PAST_MS) {
      console.log("[deck filter] Rejected — already over:", s.title, s.startTime, `(started ${Math.round(-diff / 60000)} min ago)`);
      return false;
    }
    return true;
  });
}

function attachPlaceResourceNames(suggestions, nearbyPlaces) {
  return suggestions.map((s) => {
    if (String(s.sourceType || "").toLowerCase() === "gpt_knowledge") return s;
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (place?.resourceName) {
      return { ...s, googlePlaceResourceName: String(place.resourceName).trim() };
    }
    return s;
  });
}

const TM_HEDGE_RE =
  /even if|no show|might not be|may not be|in case (something|a show)|just in case|whether or not|if there'?s (no|a) show|check out .* for live|generic live music|something might be on|last-?minute|their calendar|worth a visit|soak in|catch a show at|ambient|calendar for/i;


/**
 * Concert / ticketed-show cards must map to a real Ticketmaster row.
 * Drops invalid ids, hedging copy, and "venue only" concert teases without an event.
 */
function enforceTicketmasterGrounding(suggestions, records) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const ids = new Set(records.map((r) => r.id));

  return suggestions
    .map((s) => {
      let id = String(s.ticketEventId || "").trim();
      if (id && !ids.has(id)) return null;

      const cat = String(s.category || "").toLowerCase();
      const blob = `${s.title}\n${s.description}`.toLowerCase();
      if (TM_HEDGE_RE.test(blob)) return null;

      const looksTicketed =
        cat === "event" ||
        /\b(at the|@)\s+(wiltern|greek|bowl|forum|fonda|roxy|novo|troubadour|observatory|sofi|crypto)/i.test(blob) ||
        /\b(live music|concert|tour|show tonight|tickets?)\b/i.test(blob);

      if (looksTicketed && (!id || !byId.has(id))) return null;

      return s;
    })
    .filter(Boolean);
}

/**
 * Deterministic title/body for TM-backed rows so venue marketing copy cannot leak through.
 */
function mergeCanonicalTicketmasterCopy(suggestions, records, areaLabel, nowMs, timeZone) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return suggestions.map((s) => {
    const id = String(s.ticketEventId || "").trim();
    if (!id || !byId.has(id)) return s;
    const e = byId.get(id);
    const venue = String(e.venue || s.venueName || "").trim();
    const show = String(e.name || "").trim();
    const title = venue ? `${show} at ${venue}`.slice(0, 120) : show.slice(0, 120);
    const evMs = tmRecordStartMs(e);
    const humanStart =
      timeZone && evMs != null && !Number.isNaN(nowMs)
        ? formatHumanGoingOutTime(nowMs, evMs, timeZone)
        : "";
    const priceBit = String(e.priceLabel || "").trim();
    // Prefer GPT's description if it's more than just the event name repeated back
    const gptDesc = String(s.description || "").trim();
    const gptDescIsUseful = gptDesc.length > 40 && !gptDesc.toLowerCase().startsWith(show.toLowerCase().slice(0, 20).toLowerCase());
    const descParts = gptDescIsUseful
      ? [gptDesc, priceBit ? ` Tickets from ${priceBit}.` : ""]
      : [
          // Title has the show name; startTime tag has the time — don't repeat either here.
          venue ? `${venue}.` : "",
          priceBit ? ` Tickets from ${priceBit}.` : "",
        ];
    const description = descParts.join("").replace(/\s+/g, " ").trim().slice(0, 400);
    const url = String(e.url || s.ticketUrl || "").trim();
    const costLine =
      priceBit && !String(s.cost || "").trim()
        ? priceBit.toLowerCase().includes("free")
          ? "Free"
          : `From ${priceBit.replace(/^from\s+/i, "")}`
        : s.cost;
    return {
      ...s,
      title,
      description,
      venueName: venue,
      ticketUrl: url,
      ticketEventId: id,
      mapQuery: venue ? `${venue} ${areaLabel}`.slice(0, 200) : s.mapQuery,
      startTime: String(humanStart || when || s.startTime || "").trim().slice(0, 80),
      category: "event",
      cost: String(costLine || s.cost || "").slice(0, 48),
      ...(e.ageRestriction ? { ageRestriction: e.ageRestriction } : {}),
    };
  });
}

function attachPlaceMeta(suggestions, nearbyPlaces, nowIso) {
  const now = new Date(nowIso).getTime();
  return suggestions.map((s) => {
    if (String(s.sourceType || "").toLowerCase() === "gpt_knowledge") {
      return {
        ...s,
        placeOpenNow: null,
        closesSoon: false,
      };
    }
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (!place) {
      return { ...s, placeOpenNow: null, closesSoon: false };
    }
    let closesSoon = false;
    let openUntil = null;
    if (place.nextCloseTime) {
      const t = new Date(place.nextCloseTime).getTime();
      if (!Number.isNaN(t) && t > now) {
        if ((t - now) / 60000 <= 45) closesSoon = true;
        const d = new Date(place.nextCloseTime);
        const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
        openUntil = `Open until ${timeStr}`;
      }
    }
    let distanceText = String(s.distanceText || "").trim();
    if (!distanceText && typeof place.distanceMiles === "number") {
      const mi = Math.round(place.distanceMiles * 10) / 10;
      distanceText = `~${mi} mi`;
    }
    // Infer age restriction from Google place types if GPT/TM didn't already set one
    let ageRestriction = s.ageRestriction ?? null;
    if (!ageRestriction) {
      const types = Array.isArray(place.types) ? place.types : [];
      if (types.includes("night_club") || types.includes("casino")) {
        ageRestriction = "21+";
      }
    }
    return {
      ...s,
      placeOpenNow: place.openNow != null ? place.openNow : null,
      closesSoon,
      ...(openUntil ? { openUntil } : {}),
      ...(distanceText ? { distanceText } : {}),
      ...(ageRestriction ? { ageRestriction } : {}),
    };
  });
}

function annotatePlacesWithDistance(places, userLat, userLng) {
  return (places || []).map((p) => {
    let distanceMiles = null;
    if (p.lat != null && p.lng != null && userLat != null && userLng != null) {
      distanceMiles = haversineMiles(userLat, userLng, p.lat, p.lng);
    }
    return { ...p, distanceMiles };
  });
}

function formatLocalClock(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatLocalWeekday(iso, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "long" }).format(
      new Date(iso)
    );
  } catch {
    return "";
  }
}

function approximateAgeLabel(ageRange) {
  const m = {
    under18: "16",
    "18-21": "19",
    "18-24": "22",
    "25-34": "29",
    "35-44": "39",
    "45+": "48",
    prefer_not: "25",
  };
  return m[ageRange] ?? "25";
}

function buildGptUserPayload({
  nowIso,
  timeZone,
  wall,
  areaLabel,
  energy,
  timeBudget,
  interests,
  recentSuggestions,
  weather,
  ticketmasterEvents,
  nearbyPlacesAnnotated,
  userAge,
  swipeSignals,
  transportMode,
  lat,
  lng,
  userContextLine,
  deckCategoryFocus,
  decayRecentNames,
  savedMoveTitles,
  planningAhead,
}) {
  const interestPayload = buildInterestEnrichment(interests);
  const timeBucket = getTimeOfDayBucket(wall.hour24);
  const tempC = weather?.tempC;
  const tempF = typeof tempC === "number" ? Math.round((tempC * 9) / 5 + 32) : null;
  const weatherLine =
    tempF != null ? `${tempF}°F ${weather?.summary || "clear"}` : String(weather?.summary || "clear");

  const energyOut = energy === "medium" ? "mid" : energy;
  const timeBudgetLabel =
    timeBudget === "30min" ? "~30 min" : timeBudget === "mid" ? "1–3 hours" : "Flexible / all day";

  const nearby_places = (nearbyPlacesAnnotated || [])
    .slice(0, 25)
    .map((p) => ({
      name: p.name,
      distance_miles:
        typeof p.distanceMiles === "number" ? Math.round(p.distanceMiles * 10) / 10 : null,
      open_now: p.openNow,
      address: p.address,
      rating: p.rating,
      types: p.types,
      place_id: p.resourceName,
      next_close_time: p.nextCloseTime ?? null,
    }));

  const nearby_events = (ticketmasterEvents || []).map((e) => {
    let startLocal = "";
    if (e.startIso) {
      try {
        startLocal = new Date(e.startIso).toLocaleString("en-US", {
          timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } catch { /* fall through */ }
    }
    if (!startLocal && e.localDate) {
      startLocal = `${e.localDate}${e.localTime ? " " + e.localTime : ""}`.trim();
    }
    return {
      event_id: e.id,
      name: e.name,
      venue: e.venue,
      start: startLocal,
      when_label: e.whenLabel || "",
      url: e.url,
      price: e.priceLabel || "",
      genre: e.genre,
    };
  });

  const hour = wall.hour24;
  const lateNight = hour >= 22 || hour < 6;

  const wildcard_prompt = `What is happening in ${areaLabel} tonight or this week that most people don't know about? Consider: seasonal natural events, astronomy events, free outdoor screenings, pop-up markets, residencies at small venues, cultural festivals, neighborhood events, anything time-limited or rare. Be specific and only use real rows from nearby_places or nearby_events.`;

  const base = {
    time: formatLocalClock(nowIso, timeZone),
    day: formatLocalWeekday(nowIso, timeZone),
    location: areaLabel,
    lat,
    lng,
    energy: energyOut,
    available_time: timeBudgetLabel,
    weather: weatherLine,
    user_age: userAge,
    interests,
    positive_interests: interestPayload.positive_interests,
    not_interested_in: interestPayload.not_interested_in,
    recent_moves: recentSuggestions,
    nearby_events,
    nearby_places,
    local_hour: hour,
    time_of_day_bucket: timeBucket,
    it_is_currently: `It is currently ${formatLocalClock(nowIso, timeZone)} on ${formatLocalWeekday(nowIso, timeZone)}. Every suggestion must make sense for this exact moment.`,
    meal_timing_rules: MEAL_TIMING_RULES_FOR_MODEL,
    late_night: lateNight,
    transport_mode: transportMode || "driving",
    distance_guidance: lateNight
      ? "After 10pm: strongly prefer venues within ~1 mile unless a ticketed show justifies farther."
      : transportMode === "walking"
        ? "User is on foot — strongly prefer places within ~1 mile."
        : transportMode === "cycling"
          ? "User is cycling — prefer places within ~3 miles."
          : transportMode === "transit"
            ? "User is on transit — up to ~5 miles is fine; mention transit-friendliness when relevant."
            : "Prefer picks within ~5 miles; say why if farther.",
    ...(swipeSignals?.skip_reasons
      ? { skip_reasons: swipeSignals.skip_reasons }
      : {}),
    wildcard_prompt,
  };

  if (swipeSignals && typeof swipeSignals === "object") {
    base.swipe_signals = swipeSignals;
  }
  if (userContextLine && String(userContextLine).trim()) {
    base.user_context_line = String(userContextLine).trim().slice(0, 800);
  }
  const focus = String(deckCategoryFocus || "").trim();
  if (focus) {
    base.deck_category_focus = focus;
  }

  const decay = Array.isArray(decayRecentNames)
    ? decayRecentNames.map((x) => String(x).trim()).filter(Boolean).slice(0, 48)
    : [];
  if (decay.length > 0) {
    base.decay_recent_venues = decay;
  }

  const savedArr = Array.isArray(savedMoveTitles)
    ? savedMoveTitles.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    : [];
  if (savedArr.length > 0) {
    base.saved_moves = savedArr;
  }

  if (planningAhead && planningAhead.label) {
    base.planning_ahead = {
      mode: planningAhead.mode,
      window_label: planningAhead.label,
      instructions: planningAhead.instruction,
    };
    base.it_is_currently = `PLANNING AHEAD (${planningAhead.label}): ${planningAhead.instruction} Use only real rows from nearby_events and nearby_places. Venues do not need to be open at the current clock. Add a short date_badge on every suggestion (e.g. "Tonight 8PM", "This Sat", "Apr 12", "Jun 7") matching the target time.`;
    base.meal_timing_rules = `Future window — pick meal types that fit the event or typical hours for that daypart; do not apply "no dinner at 2pm" rules from the current clock.`;
  }

  return base;
}

function wallPartsFromIso(iso, tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "long",
      hour: "numeric",
      hour12: false,
      day: "numeric",
      month: "long",
    });
    const parts = fmt.formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      weekdayLong: get("weekday"),
      monthLong: get("month"),
      dayNum: get("day"),
      hour24: parseInt(get("hour"), 10) || 12,
    };
  } catch {
    return { weekdayLong: "", monthLong: "", dayNum: "", hour24: 12 };
  }
}

function normalizeAgeRestriction(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "21+" || s === "21") return "21+";
  if (s === "18+" || s === "18") return "18+";
  if (s === "all ages" || s === "all_ages" || s === "allages") return "all ages";
  return null;
}

function normalizeSuggestions(raw) {
  if (!raw || typeof raw !== "object") return [];
  const arr = raw.suggestions;
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const title = String(s.title || "").trim();
    // Strip GPT-hallucinated closing times — real hours come from Google Places via openUntil
    const description = String(s.description || "")
      .replace(/,?\s*open until \d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, "")
      .replace(/,?\s*open(?:s)? until \d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, "")
      .replace(/,?\s*closes? at \d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, "")
      .replace(/,?\s*open(?:s)? (?:daily|today) until \d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, "")
      .trim();
    if (!title || !description) continue;
    const eventId = String(s.eventId || s.ticketEventId || "").trim();
    const placeId = String(s.placeId || "").trim();
    const deckRole = String(s.deck_role || s.deckRole || "").trim();
    const cost = String(s.cost || "").trim();
    const whyRaw = s.whyNow;
    const whyNow =
      whyRaw === null || whyRaw === undefined
        ? ""
        : String(whyRaw === false ? "" : whyRaw).trim();

    const sourceTypeRaw = String(s.sourceType || s.source_type || "places_or_events")
      .trim()
      .toLowerCase();
    const sourceType =
      sourceTypeRaw === "gpt_knowledge" ? "gpt_knowledge" : "places_or_events";
    const row = {
      title: title.slice(0, 120),
      description: description.slice(0, 400),
      category: String(s.category || "experience").slice(0, 32),
      sourceType,
      deckRole: deckRole.slice(0, 24),
      flavorTag: String(s.flavorTag || "").slice(0, 32),
      timeRequired: String(s.timeRequired || "").slice(0, 32),
      energyLevel: String(s.energyLevel || "medium").replace(/^mid$/i, "medium").slice(0, 16),
      address: String(s.address || "").slice(0, 200),
      startTime: String(s.startTime || "").slice(0, 80),
      venueName: String(s.venueName || "").slice(0, 120),
      mapQuery: String(s.mapQuery || title).slice(0, 200),
      unsplashQuery: String(s.unsplashQuery || "").slice(0, 160),
      whyNow: whyNow.slice(0, 200),
      ticketUrl: String(s.ticketUrl || "").slice(0, 500),
      ticketEventId: eventId.slice(0, 64),
      sourcePlaceName: String(s.sourcePlaceName || "").slice(0, 120),
      cost: cost.slice(0, 48),
      isTimeSensitive: Boolean(s.isTimeSensitive),
      distanceText: String(s.distanceText || "").slice(0, 120),
      dateBadge: String(s.dateBadge || s.date_badge || "").trim().slice(0, 40),
      ageRestriction: normalizeAgeRestriction(s.ageRestriction),
    };
    if (placeId && placeId.startsWith("places/")) {
      row.googlePlaceResourceName = placeId.slice(0, 256);
    }
    out.push(row);
    if (out.length >= 5) break;
  }
  return out;
}

export async function runConciergeRecommendations(body) {
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : body.lon != null ? Number(body.lon) : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("lat and lng required");
  }

  const timeZone = typeof body.timeZone === "string" ? body.timeZone : "UTC";
  const nowIsoRaw = typeof body.nowIso === "string" ? body.nowIso.trim() : "";
  const nowIso = nowIsoRaw ? nowIsoRaw : new Date().toISOString();
  const energy = ["low", "medium", "high"].includes(body.energy) ? body.energy : "medium";
  const timeBudget = ["30min", "mid", "allday"].includes(body.timeBudget) ? body.timeBudget : "mid";
  const areaLabel = String(body.areaLabel || body.area || "near you").slice(0, 80);
  const interests = Array.isArray(body.interests) ? body.interests.map((x) => String(x)).slice(0, 24) : [];
  const deckCategoryFocus =
    typeof body.deckCategoryFocus === "string"
      ? body.deckCategoryFocus
      : typeof body.deck_category_focus === "string"
        ? body.deck_category_focus
        : "";
  console.log("🎯 User interests loaded:", interests);
  const recentSuggestions = Array.isArray(body.recentSuggestions)
    ? body.recentSuggestions.map((x) => String(x)).slice(0, 20)
    : [];
  const excludeSuggestionKeys = Array.isArray(body.excludeSuggestionKeys)
    ? body.excludeSuggestionKeys.map((x) => String(x)).slice(0, 200)
    : [];
  const userContextLine = String(body.userContextLine || "").slice(0, 800);
  const hungerPreference = ["any", "hungry", "not_hungry"].includes(body.hungerPreference)
    ? body.hungerPreference
    : "any";

  const ageRange =
    typeof body.ageRange === "string" &&
    ["under18", "18-21", "18-24", "25-34", "35-44", "45+", "prefer_not"].includes(body.ageRange)
      ? body.ageRange
      : "prefer_not";
  const userAge =
    typeof body.userAge === "string" && body.userAge.trim()
      ? body.userAge.trim().slice(0, 8)
      : approximateAgeLabel(ageRange);

  const transportMode = ["walking", "cycling", "transit", "driving"].includes(body.transportMode)
    ? body.transportMode
    : "driving";

  const swipeSignals =
    body.swipeSignals && typeof body.swipeSignals === "object" ? body.swipeSignals : null;

  const conciergeTier =
    String(body.conciergeTier || body.concierge_tier || "").toLowerCase() === "plus" ||
    body.plus === true
      ? "plus"
      : "free";

  const wall = wallPartsFromIso(nowIso, timeZone);

  if (interests.length === 0) {
    throw new Error(
      "Add at least one interest (menu → Interests) so we can personalize your deck."
    );
  }

  const nowMs = new Date(nowIso).getTime();
  const [weather, ticketmasterRecordsRaw, nearbyPlacesRaw] = await Promise.all([
    fetchWeatherSummary(lat, lng),
    fetchTicketmasterNearby(lat, lng, nowIso),
    fetchPlacesWideNet(lat, lng, GOOGLE_KEY, interests),
  ]);
  let nearbyPlaces = annotatePlacesWithDistance(nearbyPlacesRaw, lat, lng);
  nearbyPlaces = filterPlacesByInterestPolicy(nearbyPlaces, interests);
  let ticketmasterRecords = filterTicketmasterUpcomingWindow(ticketmasterRecordsRaw, nowMs, 2)
    .slice()
    .sort((a, b) => (tmRecordStartMs(a) ?? 0) - (tmRecordStartMs(b) ?? 0));
  const tmCap = conciergeTier === "plus" ? 20 : 8;
  ticketmasterRecords = ticketmasterRecords.slice(0, tmCap);
  ticketmasterRecords = ticketmasterRecords.map((r) => ({
    ...r,
    whenLabel: computeEventWhenLabel(r, nowIso, timeZone),
  }));
  // Main deck is "right now" — only show events happening tonight (same calendar day).
  ticketmasterRecords = ticketmasterRecords.filter((r) => r.whenLabel === "Tonight");

  const ticketmasterEvents = ticketmasterRecords.map(
    ({
      id,
      name,
      venue,
      startIso,
      localDate,
      localTime,
      url,
      segment,
      genre,
      priceLabel,
      whenLabel,
    }) => ({
      id,
      name,
      venue,
      startIso,
      localDate,
      localTime,
      url,
      segment,
      genre,
      priceLabel,
      whenLabel,
      requiredCardTitle: `${name} at ${venue}`.slice(0, 120),
    })
  );

  const decayRecentNames = Array.isArray(body.decayRecentNames)
    ? body.decayRecentNames.map((x) => String(x)).filter(Boolean)
    : [];

  const swipeSignalsForModel =
    swipeSignals && typeof swipeSignals === "object" ? swipeSignals : null;

  const savedMoveTitles = Array.isArray(body.savedMoveTitles)
    ? body.savedMoveTitles.map((x) => String(x)).filter(Boolean).slice(0, 20)
    : [];

  const gptUserPayload = buildGptUserPayload({
    nowIso,
    timeZone,
    wall,
    areaLabel,
    energy,
    timeBudget,
    interests,
    recentSuggestions,
    weather,
    ticketmasterEvents,
    nearbyPlacesAnnotated: nearbyPlaces,
    userAge,
    swipeSignals: swipeSignalsForModel,
    transportMode,
    lat,
    lng,
    userContextLine,
    deckCategoryFocus,
    decayRecentNames,
    savedMoveTitles,
    planningAhead: null,
  });

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey || openaiKey.includes("your")) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.CONCIERGE_MODEL || "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.75,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `USER MESSAGE (inject all context as JSON):\n${JSON.stringify(gptUserPayload)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty model response");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model returned non-JSON");
  }

  let suggestions = normalizeSuggestions(parsed);
  if (suggestions.length === 0) {
    throw new Error("No valid suggestions in model output");
  }

  suggestions = attachPlaceResourceNames(suggestions, nearbyPlaces);
  const beforeExclude = suggestions.slice();
  suggestions = filterExcludedKeys(suggestions, excludeSuggestionKeys);
  if (suggestions.length === 0) suggestions = beforeExclude; // exclude list wiped everything — show fresh anyway
  suggestions = filterSafetyMacArthur(suggestions, wall.hour24);
  const beforeClose = suggestions.slice();
  suggestions = filterClosedVenuePlaces(suggestions, nearbyPlaces);
  if (suggestions.length < 2) suggestions = beforeClose;

  const beforeGrounding = suggestions.slice();
  suggestions = enforceTicketmasterGrounding(suggestions, ticketmasterRecords);
  if (suggestions.length === 0) suggestions = beforeGrounding;
  suggestions = mergeCanonicalTicketmasterCopy(
    suggestions,
    ticketmasterRecords,
    areaLabel,
    new Date(nowIso).getTime(),
    timeZone
  );
  if (suggestions.length === 0) suggestions = beforeGrounding;

  // Hard time-window gate — after TM copy merged so ticketEventId is set
  suggestions = filterEventsByTimeWindow(suggestions, ticketmasterRecords, nowMs);

  const beforeInterestMeal = suggestions.slice();
  suggestions = filterMuseumInterestPolicy(suggestions, interests, ticketmasterRecords, nearbyPlaces);
  if (suggestions.length < 2) suggestions = beforeInterestMeal;

  const beforeMeal = suggestions.slice();
  suggestions = filterMealAndLateNightHeuristics(suggestions, wall.hour24);
  if (suggestions.length < 2) suggestions = beforeMeal;

  suggestions = filterAndSortByScore(suggestions, {
    hour24: wall.hour24,
    userLat: lat,
    userLng: lng,
    nearbyPlaces,
  });

  const preHunger = suggestions.slice();
  suggestions = filterHungerPreference(suggestions, hungerPreference);
  if (suggestions.length === 0) suggestions = preHunger;

  const unsplashKey = getUnsplashKey();
  const seedBase = `${nowIso}-${lat.toFixed(2)}-${lng.toFixed(2)}`;
  suggestions = await resolveConciergeSuggestionImages({
    suggestions,
    ticketmasterRecords,
    nearbyPlaces,
    unsplashKey,
    seedBase,
    googleApiKey: GOOGLE_KEY && !String(GOOGLE_KEY).includes("your") ? GOOGLE_KEY : "",
  });

  suggestions = await enrichConciergeMovieSuggestions(suggestions, {
    lat,
    lng,
    timeZone,
    nowIso,
    areaLabel,
    energy,
    userContextLine,
    nearbyPlaces,
  });

  suggestions = attachPlaceMeta(suggestions, nearbyPlaces, nowIso);

  return {
    suggestions,
    meta: {
      weather,
      eventCount: ticketmasterEvents.length,
      placeCount: nearbyPlaces.length,
      model,
    },
  };
}

export async function runConciergeAheadRecommendations(body) {
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : body.lon != null ? Number(body.lon) : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("lat and lng required");
  }

  const timeZone = typeof body.timeZone === "string" ? body.timeZone : "UTC";
  const nowIsoRaw = typeof body.nowIso === "string" ? body.nowIso.trim() : "";
  const nowIso = nowIsoRaw || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const mode = String(body.aheadWindow || body.ahead_window || "").toLowerCase();
  const validAhead = ["tonight", "weekend", "date", "further"];
  if (!validAhead.includes(mode)) {
    throw new Error("aheadWindow must be tonight | weekend | date | further");
  }
  const pickedDateYmd = String(body.pickedDateYmd || body.picked_date_ymd || "").trim();
  if (mode === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(pickedDateYmd)) {
    throw new Error("pickedDateYmd (YYYY-MM-DD) required for date window");
  }

  const energy = ["low", "medium", "high"].includes(body.energy) ? body.energy : "medium";
  const timeBudget = ["30min", "mid", "allday"].includes(body.timeBudget) ? body.timeBudget : "mid";
  const areaLabel = String(body.areaLabel || body.area || "near you").slice(0, 80);
  const interests = Array.isArray(body.interests) ? body.interests.map((x) => String(x)).slice(0, 24) : [];
  if (interests.length === 0) {
    throw new Error(
      "Add at least one interest (menu → Interests) so we can personalize your deck."
    );
  }

  const recentSuggestions = Array.isArray(body.recentSuggestions)
    ? body.recentSuggestions.map((x) => String(x)).slice(0, 20)
    : [];
  const excludeSuggestionKeys = Array.isArray(body.excludeSuggestionKeys)
    ? body.excludeSuggestionKeys.map((x) => String(x)).slice(0, 200)
    : [];
  const userContextLine = String(body.userContextLine || "").slice(0, 800);
  const hungerPreference = ["any", "hungry", "not_hungry"].includes(body.hungerPreference)
    ? body.hungerPreference
    : "any";
  const ageRange =
    typeof body.ageRange === "string" &&
    ["under18", "18-21", "18-24", "25-34", "35-44", "45+", "prefer_not"].includes(body.ageRange)
      ? body.ageRange
      : "prefer_not";
  const userAge =
    typeof body.userAge === "string" && body.userAge.trim()
      ? body.userAge.trim().slice(0, 8)
      : approximateAgeLabel(ageRange);
  const swipeSignals =
    body.swipeSignals && typeof body.swipeSignals === "object" ? body.swipeSignals : null;
  const conciergeTier =
    String(body.conciergeTier || body.concierge_tier || "").toLowerCase() === "plus" ||
    body.plus === true
      ? "plus"
      : "free";
  const decayRecentNames = Array.isArray(body.decayRecentNames)
    ? body.decayRecentNames.map((x) => String(x)).filter(Boolean)
    : [];
  const swipeSignalsForAhead =
    swipeSignals && typeof swipeSignals === "object" ? swipeSignals : null;
  const savedMoveTitles = Array.isArray(body.savedMoveTitles)
    ? body.savedMoveTitles.map((x) => String(x)).filter(Boolean).slice(0, 20)
    : [];
  const wall = wallPartsFromIso(nowIso, timeZone);

  const tmApiStartIso = new Date(nowMs - 15 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const endMs =
    mode === "further"
      ? nowMs + 90 * 86400000
      : mode === "date"
        ? nowMs + 120 * 86400000
        : nowMs + 21 * 86400000;
  const tmApiEndIso = new Date(endMs).toISOString().replace(/\.\d{3}Z$/, "Z");

  const [weather, allTm, nearbyPlacesRaw] = await Promise.all([
    fetchWeatherSummary(lat, lng),
    fetchTicketmasterInDateRange(lat, lng, tmApiStartIso, tmApiEndIso),
    fetchPlacesWideNet(lat, lng, GOOGLE_KEY, interests, { relaxOpenNow: true }),
  ]);

  let nearbyPlaces = annotatePlacesWithDistance(nearbyPlacesRaw, lat, lng);
  nearbyPlaces = filterPlacesByInterestPolicy(nearbyPlaces, interests);

  let ticketmasterRecords = filterAheadTmRecords(allTm, mode, nowIso, timeZone, pickedDateYmd);
  if (ticketmasterRecords.length < 4) {
    const fallback = filterTicketmasterUpcomingWindow(allTm, nowMs, mode === "tonight" ? 2 : 14);
    if (fallback.length > ticketmasterRecords.length) ticketmasterRecords = fallback;
  }
  const tmAheadCap = conciergeTier === "plus" ? 40 : 12;
  ticketmasterRecords = ticketmasterRecords
    .slice()
    .sort((a, b) => (tmRecordStartMs(a) ?? 0) - (tmRecordStartMs(b) ?? 0))
    .slice(0, tmAheadCap);
  ticketmasterRecords = ticketmasterRecords.map((r) => ({
    ...r,
    whenLabel: computeEventWhenLabel(r, nowIso, timeZone),
  }));

  const ticketmasterEvents = ticketmasterRecords.map(
    ({
      id,
      name,
      venue,
      startIso: sIso,
      localDate,
      localTime,
      url,
      segment,
      genre,
      priceLabel,
      whenLabel,
    }) => ({
      id,
      name,
      venue,
      startIso: sIso,
      localDate,
      localTime,
      url,
      segment,
      genre,
      priceLabel,
      whenLabel,
      requiredCardTitle: `${name} at ${venue}`.slice(0, 120),
    })
  );

  const labelMap = {
    tonight: "Tonight",
    weekend: "This weekend (Fri–Sun)",
    date: `Pick a date (${pickedDateYmd})`,
    further: "Next 1–90 days",
  };
  const instrMap = {
    tonight:
      "Only things still happening later today (local) that have not started yet — shows, games, late doors.",
    weekend:
      "Fri–Sun: ticketed events, markets, outdoor hangs, recurring weekend rituals. Ground in data when possible.",
    date: `Anchor every pick to ${pickedDateYmd} in the user's timezone.`,
    further:
      "1–90 days out: tours, festivals, sports, headline shows. Prefer real Ticketmaster rows from nearby_events.",
  };

  const planningAhead = {
    mode,
    label: labelMap[mode],
    instruction: instrMap[mode],
  };

  const gptUserPayload = buildGptUserPayload({
    nowIso,
    timeZone,
    wall,
    areaLabel,
    energy,
    timeBudget,
    interests,
    recentSuggestions,
    weather,
    ticketmasterEvents,
    nearbyPlacesAnnotated: nearbyPlaces,
    userAge,
    swipeSignals: swipeSignalsForAhead,
    lat,
    lng,
    userContextLine,
    deckCategoryFocus: "",
    decayRecentNames,
    savedMoveTitles,
    planningAhead,
  });

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey || openaiKey.includes("your")) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.CONCIERGE_MODEL || "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.75,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `USER MESSAGE (inject all context as JSON):\n${JSON.stringify(gptUserPayload)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty model response");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model returned non-JSON");
  }

  let suggestions = normalizeSuggestions(parsed);
  if (suggestions.length === 0) {
    throw new Error("No valid suggestions in model output");
  }

  suggestions = attachPlaceResourceNames(suggestions, nearbyPlaces);
  const beforeExclude = suggestions.slice();
  suggestions = filterExcludedKeys(suggestions, excludeSuggestionKeys);
  if (suggestions.length === 0) suggestions = beforeExclude; // exclude list wiped everything — show fresh anyway
  suggestions = filterSafetyMacArthur(suggestions, wall.hour24);
  const beforeClose = suggestions.slice();
  suggestions = filterClosedVenuePlaces(suggestions, nearbyPlaces, true);
  if (suggestions.length < 2) suggestions = beforeClose;

  const beforeGrounding = suggestions.slice();
  suggestions = enforceTicketmasterGrounding(suggestions, ticketmasterRecords);
  if (suggestions.length === 0) suggestions = beforeGrounding;
  suggestions = mergeCanonicalTicketmasterCopy(
    suggestions,
    ticketmasterRecords,
    areaLabel,
    new Date(nowIso).getTime(),
    timeZone
  );
  if (suggestions.length === 0) suggestions = beforeGrounding;

  const beforeInterestMeal = suggestions.slice();
  suggestions = filterMuseumInterestPolicy(suggestions, interests, ticketmasterRecords, nearbyPlaces);
  if (suggestions.length < 2) suggestions = beforeInterestMeal;

  suggestions = filterAndSortByScore(suggestions, {
    hour24: wall.hour24,
    userLat: lat,
    userLng: lng,
    nearbyPlaces,
  });

  const preHunger = suggestions.slice();
  suggestions = filterHungerPreference(suggestions, hungerPreference);
  if (suggestions.length === 0) suggestions = preHunger;

  const unsplashKey = getUnsplashKey();
  const seedBase = `${nowIso}-ahead-${mode}-${lat.toFixed(2)}-${lng.toFixed(2)}`;
  suggestions = await resolveConciergeSuggestionImages({
    suggestions,
    ticketmasterRecords,
    nearbyPlaces,
    unsplashKey,
    seedBase,
    googleApiKey: GOOGLE_KEY && !String(GOOGLE_KEY).includes("your") ? GOOGLE_KEY : "",
  });

  suggestions = await enrichConciergeMovieSuggestions(suggestions, {
    lat,
    lng,
    timeZone,
    nowIso,
    areaLabel,
    energy,
    userContextLine,
    nearbyPlaces,
  });

  suggestions = attachPlaceMeta(suggestions, nearbyPlaces, nowIso);

  suggestions = suggestions.map((s) => {
    if (String(s.dateBadge || "").trim()) return s;
    const id = String(s.ticketEventId || "").trim();
    if (!id) return s;
    const rec = ticketmasterRecords.find((r) => r.id === id);
    const badge =
      rec?.whenLabel ||
      (rec?.localDate ? String(rec.localDate).slice(5).replace("-", "/") : "");
    if (!badge) return s;
    return { ...s, dateBadge: badge };
  });

  return {
    suggestions,
    meta: {
      weather,
      eventCount: ticketmasterEvents.length,
      placeCount: nearbyPlaces.length,
      model,
      aheadWindow: mode,
    },
  };
}
