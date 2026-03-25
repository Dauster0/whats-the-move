/**
 * Orchestrates weather + Ticketmaster + Google Places + OpenAI + Unsplash
 * for POST /concierge-recommendations.
 */

import OpenAI from "openai";
import { matchNearbyPlace, resolveConciergeSuggestionImages } from "./concierge-images.js";
import { enrichConciergeMovieSuggestions } from "./movie-enrichment.js";
import { SYSTEM_PROMPT } from "./concierge-prompt.js";
import { filterAndSortByScore, haversineMiles } from "./concierge-scoring.js";

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
  const p = priceRanges[0];
  const cur = p.currency || "USD";
  const sym = cur === "USD" ? "$" : `${cur} `;
  const min = p.min != null ? Number(p.min) : null;
  const max = p.max != null ? Number(p.max) : null;
  if (min != null && max != null && min !== max) return `${sym}${Math.round(min)}–${Math.round(max)}`;
  if (min != null) return `From ${sym}${Math.round(min)}`;
  if (max != null) return `Up to ${sym}${Math.round(max)}`;
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

/** Only events occurring on the user's local calendar day (no multi-day venue teases). */
function filterTicketmasterToLocalToday(records, nowIso, timeZone) {
  const today = ymdInTimeZone(nowIso, timeZone);
  return (records || []).filter((e) => {
    const ld = String(e.localDate || "").trim();
    if (ld && /^\d{4}-\d{2}-\d{2}$/.test(ld)) return ld === today;
    if (e.startIso) return ymdInTimeZone(e.startIso, timeZone) === today;
    return false;
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

async function fetchTicketmasterNearby(lat, lng) {
  if (!TM_KEY || TM_KEY.includes("your_")) return [];
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TM_KEY);
    url.searchParams.set("latlong", `${lat},${lng}`);
    url.searchParams.set("radius", "25");
    url.searchParams.set("unit", "miles");
    url.searchParams.set("size", "40");
    url.searchParams.set("sort", "date,asc");
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const data = await r.json();
    const raw = data?._embedded?.events ?? [];
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    const out = [];
    for (const e of raw) {
      const start = getEventStartMs(e);
      if (start == null || start < now - 10 * 60 * 1000 || start > week) continue;
      const v = e?._embedded?.venues?.[0];
      const name = String(e?.name ?? "").trim();
      if (!name || /cancel(?:l)?ed|postponed/i.test(name)) continue;
      out.push({
        id: String(e?.id ?? ""),
        name,
        venue: v?.name ?? "",
        startIso: e?.dates?.start?.dateTime || null,
        localDate: e?.dates?.start?.localDate ?? "",
        localTime: e?.dates?.start?.localTime ?? "",
        url: e?.url ?? "",
        segment: e?.classifications?.[0]?.segment?.name ?? "",
        genre: e?.classifications?.[0]?.genre?.name ?? "",
        priceLabel: formatTmPriceRanges(e?.priceRanges),
        images: Array.isArray(e?.images) ? e.images : [],
        attractions: (e?._embedded?.attractions ?? []).map((a) => ({
          name: a?.name ?? "",
          images: Array.isArray(a?.images) ? a.images : [],
        })),
      });
      if (out.length >= 28) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchPlacesNearbyDigest(lat, lng) {
  if (
    !GOOGLE_KEY ||
    GOOGLE_KEY === "your_key_here" ||
    GOOGLE_KEY === "your_google_key_here"
  ) {
    return [];
  }
  /** Omit performing_arts_theater — concert venues must come only from Ticketmaster with a real event id. */
  const includedTypes = [
    "restaurant",
    "cafe",
    "coffee_shop",
    "bar",
    "night_club",
    "movie_theater",
    "park",
    "bakery",
    "museum",
    "bowling_alley",
    "amusement_center",
    "art_gallery",
    "tourist_attraction",
  ];
  const body = {
    includedTypes,
    maxResultCount: 20,
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 6500,
      },
    },
  };
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask":
          "places.name,places.displayName,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.regularOpeningHours,places.formattedAddress,places.types,places.id,places.websiteUri,places.photos",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const places = data.places ?? [];
    return places.slice(0, 30).map((p) => {
      const openNow =
        p.currentOpeningHours?.openNow ?? p.regularOpeningHours?.openNow ?? undefined;
      const plat = typeof p.location?.latitude === "number" ? p.location.latitude : null;
      const plng = typeof p.location?.longitude === "number" ? p.location.longitude : null;
      return {
        name: p.displayName?.text ?? "",
        resourceName: typeof p.name === "string" ? p.name : "",
        lat: plat,
        lng: plng,
        rating: typeof p.rating === "number" ? p.rating : null,
        reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        address: p.formattedAddress ?? "",
        openNow: openNow === true ? true : openNow === false ? false : null,
        nextCloseTime: p.currentOpeningHours?.nextCloseTime ?? null,
        types: (p.types ?? []).slice(0, 6),
        id: p.id ?? p.name ?? "",
        websiteUri: p.websiteUri ?? "",
        photos: (p.photos ?? []).map((ph) => ({
          name: ph.name ?? "",
          widthPx: ph.widthPx ?? null,
          heightPx: ph.heightPx ?? null,
        })),
      };
    });
  } catch {
    return [];
  }
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

function filterExcludedKeys(suggestions, excludeKeys) {
  const ex = new Set((excludeKeys || []).map((x) => String(x)));
  if (ex.size === 0) return suggestions;
  return suggestions.filter((s) => !ex.has(buildSuggestionKey(s)));
}

function filterSafetyMacArthur(suggestions, hour24) {
  return suggestions.filter((s) => {
    const blob = `${s.title} ${s.mapQuery}`.toLowerCase();
    if (!blob.includes("macarthur park")) return true;
    if (hour24 >= 20 || hour24 < 6) return false;
    return true;
  });
}

function filterClosedVenuePlaces(suggestions, nearbyPlaces) {
  const out = [];
  for (const s of suggestions) {
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
    if (place && place.openNow === false) continue;
    out.push(s);
  }
  return out;
}

function attachPlaceResourceNames(suggestions, nearbyPlaces) {
  return suggestions.map((s) => {
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (place?.resourceName) {
      return { ...s, googlePlaceResourceName: String(place.resourceName).trim() };
    }
    return s;
  });
}

/** Ban model copy that hedges about whether a show exists. */
const TM_HEDGE_RE =
  /even if|no show|might not be|may not be|in case (something|a show)|just in case|whether or not|if there'?s (no|a) show|check out .* for live|generic live music|something might be on|last-?minute|their calendar|worth a visit|soak in|catch a show at|ambient|calendar for/i;

function formatTicketmasterStartLine(e) {
  if (e.startIso) {
    try {
      const d = new Date(e.startIso);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      }
    } catch {
      /* */
    }
  }
  if (e.localDate) {
    const t = e.localTime ? ` ${e.localTime}` : "";
    return `${e.localDate}${t}`.trim();
  }
  return "";
}

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
function mergeCanonicalTicketmasterCopy(suggestions, records, areaLabel) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return suggestions.map((s) => {
    const id = String(s.ticketEventId || "").trim();
    if (!id || !byId.has(id)) return s;
    const e = byId.get(id);
    const venue = String(e.venue || s.venueName || "").trim();
    const show = String(e.name || "").trim();
    const title = venue ? `${show} at ${venue}`.slice(0, 120) : show.slice(0, 120);
    const when = formatTicketmasterStartLine(e);
    const genre = String(e.genre || "").trim();
    const seg = String(e.segment || "").trim();
    const genreBit = genre && seg && genre !== seg ? `${genre}, ${seg}` : genre || seg;
    const priceBit = String(e.priceLabel || "").trim();
    const descParts = [
      show + (genreBit ? `. ${genreBit}.` : "."),
      when ? ` ${when}.` : "",
      venue ? ` ${venue}.` : "",
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
      startTime: when || s.startTime,
      category: "event",
      cost: String(costLine || s.cost || "").slice(0, 48),
    };
  });
}

function attachPlaceMeta(suggestions, nearbyPlaces, nowIso) {
  const now = new Date(nowIso).getTime();
  return suggestions.map((s) => {
    const place = matchNearbyPlace(s, nearbyPlaces);
    if (!place) {
      return { ...s, placeOpenNow: null, closesSoon: false };
    }
    let closesSoon = false;
    if (place.nextCloseTime) {
      const t = new Date(place.nextCloseTime).getTime();
      if (!Number.isNaN(t) && t > now && (t - now) / 60000 <= 45) closesSoon = true;
    }
    let distanceText = String(s.distanceText || "").trim();
    if (!distanceText && typeof place.distanceMiles === "number") {
      const mi = Math.round(place.distanceMiles * 10) / 10;
      distanceText = `~${mi} mi`;
    }
    return {
      ...s,
      placeOpenNow: place.openNow != null ? place.openNow : null,
      closesSoon,
      ...(distanceText ? { distanceText } : {}),
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
    under18: "17",
    "18-24": "21",
    "25-34": "29",
    "35-44": "39",
    "45+": "48",
    prefer_not: "22",
  };
  return m[ageRange] ?? "22";
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
  lat,
  lng,
  userContextLine,
}) {
  const tempC = weather?.tempC;
  const tempF = typeof tempC === "number" ? Math.round((tempC * 9) / 5 + 32) : null;
  const weatherLine =
    tempF != null ? `${tempF}°F ${weather?.summary || "clear"}` : String(weather?.summary || "clear");

  const energyOut = energy === "medium" ? "mid" : energy;
  const timeBudgetLabel =
    timeBudget === "30min" ? "~30 min" : timeBudget === "mid" ? "1–3 hours" : "Flexible / all day";

  const nearby_places = (nearbyPlacesAnnotated || [])
    .slice()
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, 42)
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

  const nearby_events = (ticketmasterEvents || []).map((e) => ({
    event_id: e.id,
    name: e.name,
    venue: e.venue,
    start: e.startIso || `${e.localDate} ${e.localTime || ""}`.trim(),
    url: e.url,
    price: e.priceLabel || "",
    genre: e.genre,
  }));

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
    recent_moves: recentSuggestions,
    nearby_events,
    nearby_places,
    local_hour: hour,
    late_night: lateNight,
    distance_guidance: lateNight
      ? "After 10pm: strongly prefer venues within ~1 mile unless a ticketed show justifies farther."
      : "Prefer picks within ~2 miles; say why if farther.",
    wildcard_prompt,
  };

  if (swipeSignals && typeof swipeSignals === "object") {
    base.swipe_signals = swipeSignals;
  }
  if (userContextLine && String(userContextLine).trim()) {
    base.user_context_line = String(userContextLine).trim().slice(0, 800);
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

function normalizeSuggestions(raw) {
  if (!raw || typeof raw !== "object") return [];
  const arr = raw.suggestions;
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const title = String(s.title || "").trim();
    const description = String(s.description || "").trim();
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

    const row = {
      title: title.slice(0, 120),
      description: description.slice(0, 400),
      category: String(s.category || "experience").slice(0, 32),
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
    ["under18", "18-24", "25-34", "35-44", "45+", "prefer_not"].includes(body.ageRange)
      ? body.ageRange
      : "prefer_not";
  const userAge =
    typeof body.userAge === "string" && body.userAge.trim()
      ? body.userAge.trim().slice(0, 8)
      : approximateAgeLabel(ageRange);

  const swipeSignals =
    body.swipeSignals && typeof body.swipeSignals === "object" ? body.swipeSignals : null;

  const wall = wallPartsFromIso(nowIso, timeZone);

  const [weather, ticketmasterRecordsRaw, nearbyPlacesRaw] = await Promise.all([
    fetchWeatherSummary(lat, lng),
    fetchTicketmasterNearby(lat, lng),
    fetchPlacesNearbyDigest(lat, lng),
  ]);
  const nearbyPlaces = annotatePlacesWithDistance(nearbyPlacesRaw, lat, lng);
  const ticketmasterRecords = filterTicketmasterToLocalToday(ticketmasterRecordsRaw, nowIso, timeZone);

  const ticketmasterEvents = ticketmasterRecords.map(
    ({ id, name, venue, startIso, localDate, localTime, url, segment, genre, priceLabel }) => ({
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
      requiredCardTitle: `${name} at ${venue}`.slice(0, 120),
    })
  );

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
    swipeSignals,
    lat,
    lng,
    userContextLine,
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
  suggestions = filterExcludedKeys(suggestions, excludeSuggestionKeys);
  suggestions = filterSafetyMacArthur(suggestions, wall.hour24);
  const beforeClose = suggestions.slice();
  suggestions = filterClosedVenuePlaces(suggestions, nearbyPlaces);
  if (suggestions.length < 2) suggestions = beforeClose;

  suggestions = enforceTicketmasterGrounding(suggestions, ticketmasterRecords);
  suggestions = mergeCanonicalTicketmasterCopy(suggestions, ticketmasterRecords, areaLabel);
  if (suggestions.length === 0) {
    throw new Error("No valid suggestions after grounding ticketed events");
  }

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
