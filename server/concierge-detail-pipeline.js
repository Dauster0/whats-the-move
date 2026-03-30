/**
 * Concierge detail: quick (TM / Places / Unsplash / weather) + narrative (GPT).
 * POST /concierge-detail/quick | /concierge-detail/narrative | /concierge-detail (full)
 */

import OpenAI from "openai";
import { fetchUnsplashEditorial } from "./editorial-photos.js";
import { googlePlacePhotoMediaUrl, pickTicketmasterCardImage } from "./concierge-images.js";
import { buildResaleSearchUrls } from "./resale-links.js";
import { fetchTmdbMovieById } from "./movie-enrichment.js";
import {
  formatHumanGoingOutTime,
  startMsFromTicketmasterDates,
} from "./human-event-time.js";

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

async function fetchWeather(lat, lng) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m`;
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { summary: "unknown", tempC: null };
    const d = await r.json();
    const t = d?.current?.temperature_2m;
    return { summary: "ok", tempC: typeof t === "number" ? t : null };
  } catch {
    return { summary: "unknown", tempC: null };
  }
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDriveEstimate(miles) {
  if (miles == null || Number.isNaN(miles)) return null;
  const mins = Math.max(3, Math.round(miles * 2.8));
  return `~${mins} min drive`;
}

/** Lowest listed price across Ticketmaster priceRanges → "From $X". */
function formatPriceRangeFromTm(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return null;
  let bestMin = null;
  let currency = "USD";
  for (const p of prices) {
    const min = p.min != null ? Number(p.min) : null;
    if (min == null || Number.isNaN(min)) continue;
    if (bestMin == null || min < bestMin) {
      bestMin = min;
      currency = p.currency || "USD";
    }
  }
  if (bestMin != null) {
    if (bestMin <= 0) return "Free";
    const sym = currency === "USD" ? "$" : `${currency} `;
    return `From ${sym}${Math.round(bestMin)}`;
  }
  const p0 = prices[0];
  const max = p0?.max != null ? Number(p0.max) : null;
  const cur = p0?.currency || "USD";
  const sym = cur === "USD" ? "$" : `${cur} `;
  if (max != null && !Number.isNaN(max)) return `Up to ${sym}${Math.round(max)}`;
  return null;
}

function priceLevelToLabel(level) {
  if (!level || typeof level !== "string") return null;
  const map = {
    PRICE_LEVEL_FREE: { label: "Free", free: true },
    PRICE_LEVEL_INEXPENSIVE: { label: "Usually under $15", free: false },
    PRICE_LEVEL_MODERATE: { label: "$15–$35 per person", free: false },
    PRICE_LEVEL_EXPENSIVE: { label: "$35–$60 per person", free: false },
    PRICE_LEVEL_VERY_EXPENSIVE: { label: "$60+ per person", free: false },
  };
  return map[level] || null;
}

async function fetchTicketmasterEventDetail(id) {
  if (!TM_KEY || TM_KEY.includes("your_") || !id) return null;
  try {
    const url = `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(id)}.json?apikey=${TM_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const e = await r.json();
    const venue = e?._embedded?.venues?.[0];
    const vloc = venue?.location;
    const lat = vloc?.latitude != null ? Number(vloc.latitude) : null;
    const lng = vloc?.longitude != null ? Number(vloc.longitude) : null;
    const record = {
      id: e.id,
      name: e.name,
      url: e.url,
      images: e.images || [],
      attractions: (e._embedded?.attractions || []).map((a) => ({
        name: a?.name,
        images: a?.images || [],
      })),
      dates: e.dates,
      priceRanges: e.priceRanges || [],
    };
    const hero = pickTicketmasterCardImage(record);
    const extraImages = [];
    for (const img of e.images || []) {
      if (img?.url && String(img.width || 0) >= 640 && !img.fallback) extraImages.push(img.url);
    }
    const uniq = [...new Set([hero, ...extraImages].filter(Boolean))].slice(0, 8);
    return {
      name: e.name,
      url: e.url,
      infoLine: e.info ? String(e.info) : "",
      pleaseNote: e.pleaseNote ? String(e.pleaseNote) : "",
      dates: e.dates,
      priceRanges: e.priceRanges,
      priceLabel: formatPriceRangeFromTm(e.priceRanges),
      venueName: venue?.name || "",
      venueAddress: [venue?.address?.line1, venue?.city?.name, venue?.state?.stateCode]
        .filter(Boolean)
        .join(", "),
      venueLat: lat,
      venueLng: lng,
      heroImages: uniq.length ? uniq : hero ? [hero] : [],
    };
  } catch {
    return null;
  }
}

async function placesSearchFirstResource(textQuery, lat, lng) {
  if (!GOOGLE_KEY || GOOGLE_KEY.includes("your")) return null;
  const body = { textQuery: String(textQuery || "").slice(0, 200) };
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } };
  }
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.name,places.displayName,places.id",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.places?.[0];
    return typeof p?.name === "string" ? p.name : null;
  } catch {
    return null;
  }
}

async function fetchPlaceDetail(resourceName) {
  if (!GOOGLE_KEY || GOOGLE_KEY.includes("your") || !resourceName) return null;
  const url = `https://places.googleapis.com/v1/${encodeURIComponent(resourceName)}`;
  const mask = [
    "displayName",
    "formattedAddress",
    "location",
    "rating",
    "userRatingCount",
    "priceLevel",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
    "googleMapsUri",
    "editorialSummary",
    "regularOpeningHours",
    "currentOpeningHours",
    "photos",
    "types",
    "parkingOptions",
  ].join(",");
  try {
    const r = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": mask,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function buildPlacePhotoUrls(detail, apiKey, max = 8) {
  const photos = detail?.photos || [];
  const out = [];
  for (const ph of photos) {
    const n = ph?.name;
    if (!n) continue;
    const u = googlePlacePhotoMediaUrl(n, apiKey, 1920);
    if (u) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

function openingSummary(detail) {
  const cur = detail?.currentOpeningHours;
  const reg = detail?.regularOpeningHours;
  const openNow = cur?.openNow ?? reg?.openNow;
  const wd = cur?.weekdayDescriptions || reg?.weekdayDescriptions;
  const lines = Array.isArray(wd) ? wd.slice(0, 3).join(" · ") : "";
  return { openNow: openNow === true ? true : openNow === false ? false : null, lines };
}

export function detectKind(suggestion) {
  const k = String(suggestion.kind || "").toLowerCase();
  if (k === "movie" || String(suggestion.tmdbId || "").trim()) return "movie";
  const t = String(suggestion.ticketEventId || "").trim();
  if (t || String(suggestion.ticketUrl || "").trim()) return "event";
  const cat = String(suggestion.category || "").toLowerCase();
  if (/event|concert|show|comedy|sports|theater|theatre/.test(cat)) return "event";
  if (/eat|restaurant|bar|cafe|coffee|bakery|food|night/.test(cat)) return "place";
  if (suggestion.googlePlaceResourceName) return "place";
  return "experience";
}

function buildPlaceMeta(placeRaw) {
  if (!placeRaw) return null;
  return {
    displayName: placeRaw.displayName?.text || "",
    formattedAddress: placeRaw.formattedAddress || "",
    rating: typeof placeRaw.rating === "number" ? placeRaw.rating : null,
    userRatingCount: typeof placeRaw.userRatingCount === "number" ? placeRaw.userRatingCount : null,
    priceLevel: placeRaw.priceLevel || null,
    phone: placeRaw.nationalPhoneNumber || placeRaw.internationalPhoneNumber || "",
    websiteUri: placeRaw.websiteUri || "",
    googleMapsUri: placeRaw.googleMapsUri || "",
    editorialSummary:
      typeof placeRaw.editorialSummary?.text === "string"
        ? placeRaw.editorialSummary.text
        : String(placeRaw.editorialSummary || ""),
    types: placeRaw.types || [],
    parkingNote: placeRaw.parkingOptions ? JSON.stringify(placeRaw.parkingOptions).slice(0, 200) : "",
    location: placeRaw.location,
    opening: openingSummary(placeRaw),
  };
}

async function runGptNarrative({ kind, suggestion, tmDetail, placeMeta, weather, distanceMiles }) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const defaultNarrative = {
    paragraphFriend: String(suggestion.description || "").trim(),
    paragraphWhyNow: "",
    paragraphOrderThis: "",
    parkingHint: placeMeta?.parkingNote || "",
    wildBestTime: "",
    wildSpot: "",
    wildBring: "",
    spendGuess: "",
  };
  if (!openaiKey || openaiKey.includes("your")) return defaultNarrative;

  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.CONCIERGE_MODEL || "gpt-4o";
  const payload = {
    kind,
    suggestion,
    ticketmaster: tmDetail,
    place: placeMeta,
    weather,
    distanceMiles,
  };
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.65,
      messages: [
        {
          role: "system",
          content: `You write concise, specific copy for a night-out app. No marketing filler. Return ONLY JSON:
{"paragraphFriend":"what it feels like (2-4 sentences)","paragraphWhyNow":"why tonight matters or empty","paragraphOrderThis":"what to order/do or empty","parkingHint":"short parking tip or empty","wildBestTime":"","wildSpot":"","wildBring":"","spendGuess":"if price unknown, one line like $25-40/person or empty"}`,
        },
        {
          role: "user",
          content: JSON.stringify(payload).slice(0, 12000),
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices?.[0]?.message?.content;
    if (text) {
      const j = JSON.parse(text);
      return { ...defaultNarrative, ...j };
    }
  } catch {
    /* */
  }
  return defaultNarrative;
}

function buildCostBlock({
  kind,
  suggestion,
  tmDetail,
  priceFromPlace,
  narrative,
}) {
  const ticketUrl = tmDetail?.url || String(suggestion.ticketUrl || "").trim();
  const eventPriceFromTm =
    kind === "event"
      ? tmDetail?.priceLabel || formatPriceRangeFromTm(tmDetail?.priceRanges)
      : null;
  if (kind === "event" && eventPriceFromTm) {
    const free = eventPriceFromTm === "Free";
    return {
      label: eventPriceFromTm,
      free,
      ticketUrl,
      fromTicketmaster: true,
    };
  }
  if (kind === "event" && ticketUrl) {
    return { label: "Check prices", free: false, ticketUrl, fromTicketmaster: true };
  }
  if (priceFromPlace?.free) {
    return { label: priceFromPlace.label, free: true, ticketUrl: "" };
  }
  if (priceFromPlace?.label) {
    return { label: priceFromPlace.label, free: false, ticketUrl: "" };
  }
  if (narrative?.spendGuess) {
    return { label: String(narrative.spendGuess), free: false, ticketUrl: "" };
  }
  return { label: "Varies", free: false, ticketUrl: suggestion.ticketUrl || "" };
}

function buildPrimaryCta({ kind, cost, suggestion }) {
  const ticketUrl = String(cost.ticketUrl || suggestion.ticketUrl || "").trim();
  if ((kind === "event" || kind === "movie") && ticketUrl) {
    if (cost.free) {
      return { label: "Free — get tickets", url: ticketUrl, action: "tickets" };
    }
    const priceBit =
      cost.label &&
      cost.label !== "Check prices" &&
      cost.label !== "Varies" &&
      String(cost.label).trim()
        ? cost.label
        : "";
    return {
      label: priceBit ? `Buy tickets — ${priceBit}` : "Buy tickets",
      url: ticketUrl,
      action: "tickets",
    };
  }
  if (cost.free && kind === "experience") {
    return { label: "I'm going — get directions", url: "", action: "maps" };
  }
  return { label: "Get directions", url: "", action: "maps" };
}

/**
 * Fast path: TM / Places / Unsplash / weather — no GPT. Renders hero + logistics + cost (no spend guess from GPT).
 */
export async function runConciergeDetailQuick(body) {
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("lat and lng required");
  }
  const timeZone = typeof body.timeZone === "string" && body.timeZone.trim() ? body.timeZone.trim() : "UTC";
  const nowMs = body.nowIso ? new Date(String(body.nowIso)).getTime() : Date.now();
  const suggestion = body.suggestion && typeof body.suggestion === "object" ? body.suggestion : {};
  const mapQuery = String(suggestion.mapQuery || suggestion.title || "").trim();
  const kind = detectKind(suggestion);
  const unsplashKey = getUnsplashKey();

  const tmId = String(suggestion.ticketEventId || "").trim();
  let placeResource = String(suggestion.googlePlaceResourceName || "").trim();

  if (!placeResource && kind !== "event" && mapQuery) {
    placeResource = (await placesSearchFirstResource(mapQuery, lat, lng)) || "";
  }

  const [weather, tmDetail, placeRaw] = await Promise.all([
    fetchWeather(lat, lng),
    tmId ? fetchTicketmasterEventDetail(tmId) : Promise.resolve(null),
    placeResource && kind !== "event" ? fetchPlaceDetail(placeResource) : Promise.resolve(null),
  ]);

  let heroUrls = [];
  if (suggestion.photoUrl) heroUrls.push(suggestion.photoUrl);
  if (tmDetail?.heroImages?.length) {
    heroUrls = [...new Set([...tmDetail.heroImages, ...heroUrls])].slice(0, 8);
  }
  if (placeRaw && GOOGLE_KEY) {
    const purls = buildPlacePhotoUrls(placeRaw, GOOGLE_KEY, 6);
    heroUrls = [...new Set([...purls, ...heroUrls])].slice(0, 8);
  }

  if (kind === "event" && tmDetail?.venueName && GOOGLE_KEY && !GOOGLE_KEY.includes("your")) {
    const res = await placesSearchFirstResource(
      `${tmDetail.venueName} ${tmDetail.venueAddress || ""}`.slice(0, 200),
      lat,
      lng
    );
    if (res) {
      const pd = await fetchPlaceDetail(res);
      if (pd) {
        const extra = buildPlacePhotoUrls(pd, GOOGLE_KEY, 4);
        heroUrls = [...new Set([...heroUrls, ...extra])].slice(0, 8);
      }
    }
  }

  const vibeQueries = [
    String(suggestion.unsplashQuery || "").trim(),
    `${suggestion.category || ""} atmosphere night`,
    mapQuery ? `${mapQuery.split(",")[0]} interior vibe` : "",
  ].filter(Boolean);

  if (unsplashKey && heroUrls.length < 4) {
    try {
      const { urls } = await fetchUnsplashEditorial(unsplashKey, vibeQueries, {
        maxImages: Math.max(0, 6 - heroUrls.length),
        seed: `detail-${mapQuery}-${lat.toFixed(2)}`,
        minPhotoWidth: 800,
      });
      for (const u of urls) {
        if (!heroUrls.includes(u)) heroUrls.push(u);
        if (heroUrls.length >= 6) break;
      }
    } catch {
      /* */
    }
  }

  const tmdbId = String(suggestion.tmdbId || "").trim();
  let movieBackdrop = String(suggestion.movieBackdropUrl || "").trim();
  if (!movieBackdrop && tmdbId) {
    const m = await fetchTmdbMovieById(tmdbId);
    if (m?.backdropUrl) movieBackdrop = m.backdropUrl;
  }
  if (movieBackdrop) {
    heroUrls = [movieBackdrop, ...heroUrls.filter((u) => u !== movieBackdrop)].slice(0, 8);
  }

  const placeMeta = buildPlaceMeta(placeRaw);

  let distanceMiles = null;
  let driveEta = null;
  if (placeMeta?.location?.latitude != null && placeMeta?.location?.longitude != null) {
    distanceMiles = haversineMiles(lat, lng, placeMeta.location.latitude, placeMeta.location.longitude);
    driveEta = formatDriveEstimate(distanceMiles);
  } else if (tmDetail?.venueLat != null && tmDetail?.venueLng != null) {
    distanceMiles = haversineMiles(lat, lng, tmDetail.venueLat, tmDetail.venueLng);
    driveEta = formatDriveEstimate(distanceMiles);
  }

  const priceFromPlace = placeMeta?.priceLevel ? priceLevelToLabel(placeMeta.priceLevel) : null;

  const placeholderNarrative = {
    paragraphFriend: String(suggestion.description || "").trim(),
    paragraphWhyNow: "",
    paragraphOrderThis: "",
    parkingHint: placeMeta?.parkingNote || "",
    wildBestTime: "",
    wildSpot: "",
    wildBring: "",
    spendGuess: "",
  };

  const cost = buildCostBlock({
    kind,
    suggestion,
    tmDetail,
    priceFromPlace,
    narrative: placeholderNarrative,
  });

  let timeLine = String(suggestion.startTime || "").trim();
  if (kind === "event" && tmDetail?.dates) {
    const evMs = startMsFromTicketmasterDates(tmDetail.dates);
    if (evMs != null && !Number.isNaN(evMs)) {
      const human = formatHumanGoingOutTime(nowMs, evMs, timeZone);
      if (human) timeLine = human;
    }
  }

  const logistics = {
    address: placeMeta?.formattedAddress || tmDetail?.venueAddress || suggestion.address || "",
    mapQuery,
    timeLine,
    duration: suggestion.timeRequired || "",
    distanceText:
      distanceMiles != null ? `${distanceMiles.toFixed(distanceMiles < 10 ? 1 : 0)} mi away` : "",
    driveTimeText: driveEta,
    parking: placeholderNarrative.parkingHint || placeMeta?.parkingNote || "",
    weatherLine:
      weather.tempC != null
        ? `${Math.round((weather.tempC * 9) / 5 + 32)}°F nearby · check before you go`
        : "",
    openNow: placeMeta?.opening?.openNow ?? null,
    hoursLine: placeMeta?.opening?.lines || "",
  };

  const primaryCta = buildPrimaryCta({ kind, cost, suggestion });

  const dateHint =
    tmDetail?.dates?.start?.localDate ||
    tmDetail?.dates?.start?.dateTime?.slice(0, 10) ||
    "";
  const isTicketed =
    kind === "event" || Boolean(String(suggestion.ticketUrl || "").trim() || tmDetail?.url);
  const resale = kind !== "movie" && isTicketed
    ? buildResaleSearchUrls({
        eventName: tmDetail?.name || suggestion.title,
        venueName: tmDetail?.venueName || suggestion.venueName,
        city: (tmDetail?.venueAddress || "").split(",").slice(-2).join(",").trim(),
        dateHint,
      })
    : null;

  const quickSnapshot = {
    kind,
    weather,
    distanceMiles,
    tmSlim: tmDetail
      ? {
          name: tmDetail.name,
          url: tmDetail.url,
          priceLabel: tmDetail.priceLabel,
          priceRanges: tmDetail.priceRanges,
          venueName: tmDetail.venueName,
          venueAddress: tmDetail.venueAddress,
          dates: tmDetail.dates,
        }
      : null,
    placeSlim: placeMeta,
  };

  return {
    phase: "quick",
    kind,
    title: suggestion.title || tmDetail?.name || mapQuery,
    venueName: suggestion.venueName || tmDetail?.venueName || "",
    category: suggestion.category || "",
    energyLevel: suggestion.energyLevel || "",
    timeRequired: suggestion.timeRequired || "",
    whyNow: suggestion.whyNow || "",
    whyNowBadge: suggestion.whyNow ? "Tonight / timely" : "",
    rating:
      placeMeta?.rating != null
        ? { value: placeMeta.rating, count: placeMeta.userRatingCount }
        : null,
    heroImageUrls: heroUrls.filter(Boolean),
    cost,
    narrative: placeholderNarrative,
    narrativePending: true,
    logistics,
    ticketmaster: tmDetail
      ? {
          url: tmDetail.url,
          priceLabel: tmDetail.priceLabel,
          priceRanges: tmDetail.priceRanges,
          venueName: tmDetail.venueName,
        }
      : null,
    place: placeMeta
      ? {
          phone: placeMeta.phone,
          websiteUri: placeMeta.websiteUri,
          googleMapsUri: placeMeta.googleMapsUri,
        }
      : null,
    primaryCta,
    resale,
    resaleUrl: resale?.stubhub,
    weather,
    quickSnapshot,
    meta: { model: process.env.CONCIERGE_MODEL || "gpt-4o" },
  };
}

/**
 * GPT-only narrative; pass quickSnapshot from /concierge-detail/quick.
 */
export async function runConciergeDetailNarrative(body) {
  const suggestion = body.suggestion && typeof body.suggestion === "object" ? body.suggestion : {};
  const qs = body.quickSnapshot && typeof body.quickSnapshot === "object" ? body.quickSnapshot : {};
  const kind = qs.kind || detectKind(suggestion);
  const tmDetail = qs.tmSlim || null;
  const placeMeta = qs.placeSlim || null;
  const weather = qs.weather || { summary: "unknown", tempC: null };
  const distanceMiles = qs.distanceMiles ?? null;

  const narrative = await runGptNarrative({
    kind,
    suggestion,
    tmDetail,
    placeMeta,
    weather,
    distanceMiles,
  });

  const priceFromPlace = placeMeta?.priceLevel ? priceLevelToLabel(placeMeta.priceLevel) : null;
  const cost = buildCostBlock({
    kind,
    suggestion,
    tmDetail,
    priceFromPlace,
    narrative,
  });

  const logisticsPatch = {
    parking: narrative.parkingHint || placeMeta?.parkingNote || "",
  };

  return {
    phase: "narrative",
    narrative,
    cost,
    logisticsPatch,
    primaryCta: buildPrimaryCta({ kind, cost, suggestion }),
  };
}

/** Full detail in one request (quick + narrative). */
export async function runConciergeDetail(body) {
  const quick = await runConciergeDetailQuick(body);
  const nar = await runConciergeDetailNarrative({
    suggestion: body.suggestion,
    quickSnapshot: quick.quickSnapshot,
  });
  return {
    ...quick,
    narrative: nar.narrative,
    narrativePending: false,
    cost: nar.cost,
    primaryCta: nar.primaryCta,
    logistics: {
      ...quick.logistics,
      parking: nar.logisticsPatch?.parking || quick.logistics.parking,
    },
  };
}
