/**
 * Orchestrates weather + Ticketmaster + Google Places + OpenAI + Unsplash
 * for POST /concierge-recommendations.
 */

import OpenAI from "openai";
import { matchNearbyPlace, resolveConciergeSuggestionImages } from "./concierge-images.js";
import { enrichConciergeMovieSuggestions } from "./movie-enrichment.js";
import { SYSTEM_PROMPT } from "./concierge-prompt.js";

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
  const includedTypes = [
    "restaurant",
    "cafe",
    "coffee_shop",
    "bar",
    "night_club",
    "performing_arts_theater",
    "movie_theater",
    "park",
    "bakery",
    "museum",
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
          "places.name,places.displayName,places.rating,places.userRatingCount,places.currentOpeningHours,places.regularOpeningHours,places.formattedAddress,places.types,places.id,places.websiteUri,places.photos",
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
      return {
        name: p.displayName?.text ?? "",
        resourceName: typeof p.name === "string" ? p.name : "",
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

function applyVarietyCaps(suggestions) {
  let eat = 0;
  let walk = 0;
  const eatSub = new Set();
  const out = [];
  for (const s of suggestions) {
    const cat = String(s.category || "").toLowerCase();
    const isEat = cat === "eat";
    const isWalk = cat === "walk";
    const ft = String(s.flavorTag || "")
      .trim()
      .toLowerCase();
    if (isEat && eat >= 2) continue;
    if (isWalk && walk >= 1) continue;
    if (isEat && ft) {
      if (eatSub.has(ft)) continue;
      eatSub.add(ft);
    }
    if (isEat) eat += 1;
    if (isWalk) walk += 1;
    out.push(s);
  }
  const hasEventOrExperience = out.some((x) => {
    const c = String(x.category || "").toLowerCase();
    return c === "event" || c === "experience";
  });
  if (!hasEventOrExperience && suggestions.length >= 3) return suggestions;
  return out.length >= 3 ? out : suggestions;
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
    return {
      ...s,
      placeOpenNow: place.openNow != null ? place.openNow : null,
      closesSoon,
    };
  });
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
    out.push({
      title: title.slice(0, 120),
      description: description.slice(0, 400),
      category: String(s.category || "experience").slice(0, 32),
      flavorTag: String(s.flavorTag || "").slice(0, 32),
      timeRequired: String(s.timeRequired || "").slice(0, 32),
      energyLevel: String(s.energyLevel || "medium").slice(0, 16),
      address: String(s.address || "").slice(0, 200),
      startTime: String(s.startTime || "").slice(0, 80),
      venueName: String(s.venueName || "").slice(0, 120),
      mapQuery: String(s.mapQuery || title).slice(0, 200),
      unsplashQuery: String(s.unsplashQuery || "").slice(0, 160),
      whyNow: String(s.whyNow || "").slice(0, 200),
      ticketUrl: String(s.ticketUrl || "").slice(0, 500),
      ticketEventId: String(s.ticketEventId || "").slice(0, 64),
      sourcePlaceName: String(s.sourcePlaceName || "").slice(0, 120),
    });
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

  const wall = wallPartsFromIso(nowIso, timeZone);

  const [weather, ticketmasterRecords, nearbyPlaces] = await Promise.all([
    fetchWeatherSummary(lat, lng),
    fetchTicketmasterNearby(lat, lng),
    fetchPlacesNearbyDigest(lat, lng),
  ]);

  const ticketmasterEvents = ticketmasterRecords.map(
    ({ id, name, venue, startIso, localDate, localTime, url, segment, genre }) => ({
      id,
      name,
      venue,
      startIso,
      localDate,
      localTime,
      url,
      segment,
      genre,
    })
  );

  const userPayload = {
    nowIso,
    timeZone,
    localContext: wall,
    energy,
    timeBudget,
    timeBudgetHints: {
      "30min": "Under ~45 minutes total; very close; minimal planning.",
      mid: "Roughly 1–3 hours; can include a sit-down or a show.",
      allday: "Half day or full day OK.",
    },
    areaLabel,
    interests,
    recentSuggestionsToAvoid: recentSuggestions,
    userContextLine,
    weather,
    ticketmasterEvents,
    nearbyPlaces: nearbyPlaces.map(({ name, rating, reviews, address, openNow, types }) => ({
      name,
      rating,
      reviews,
      address,
      openNow,
      types,
    })),
  };

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
        content: `Context JSON (use real names from ticketmasterEvents and nearbyPlaces):\n${JSON.stringify(userPayload)}`,
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
