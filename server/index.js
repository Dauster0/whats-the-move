import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import {
  buildEditorialSearchQueries,
  fetchUnsplashEditorial,
  getEditorialAltRejectSubstrings,
} from "./editorial-photos.js";
import {
  runConciergeAheadRecommendations,
  runConciergeRecommendations,
} from "./concierge-pipeline.js";
import {
  runConciergeDetail,
  runConciergeDetailQuick,
  runConciergeDetailNarrative,
} from "./concierge-detail-pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Prefer a real key — empty string or obvious placeholders must not block the other var. */
function isUnsplashPlaceholder(s) {
  const t = String(s || "").trim();
  const lower = t.toLowerCase();
  if (t.length < 8) return true;
  if (lower === "placeholder") return true;
  if (lower.startsWith("your_")) return true;
  if (["your_key_here", "your_unsplash_key", "add_your_key"].includes(lower)) return true;
  return false;
}

function getUnsplashKey() {
  const strip = (v) =>
    String(v ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
  for (const raw of [process.env.UNSPLASH_ACCESS_KEY, process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY]) {
    const t = strip(raw);
    if (t && !isUnsplashPlaceholder(t)) return t;
  }
  return "";
}

/** Safe length for /api-status?debug=1 (no secret bytes). */
function envSecretLen(v) {
  const t = String(v ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  return t.length;
}
// Prefer `npm start` (uses --import ./load-env.js so env loads before other imports).
// If you run `node index.js` directly, load env here too.
if (!process.env._DOTENV_LOADED_VIA_IMPORT) {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
  dotenv.config({ path: path.join(__dirname, ".env"), override: true });
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
});

const app = express();
app.use(cors());
app.use(express.json());

/** Bumped when photo sourcing changes — check Railway after deploy (must match this repo). */
const PHOTO_PIPELINE = "google-places-hero-v1";

/** Register first — load balancers & Railway need this to succeed before any heavy routes. */
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/** Fast response — avoids Railway timeout when root URL is opened (no slow outbound fetches). */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "whats-the-move",
    photoPipeline: PHOTO_PIPELINE,
    hint: "Use GET /api-status for key checks, GET /health for a quick ping",
  });
});

const FETCH_TIMEOUT_MS = 8000;
/** Shorter timeout for /place-details chain so the client always gets JSON within ~20s. */
const PLACES_DETAIL_FETCH_MS = 5000;

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithTimeoutMs(url, ms, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

app.get("/api-status", async (req, res) => {
  const openai = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your");
  const google = (process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim();
  const googleValid = google && !["your_key_here", "your_google_key_here"].includes(google);
  const ticketmaster = (process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY || "").trim();
  const showtimes = (process.env.INTERNATIONAL_SHOWTIMES_API_KEY || process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY || "").trim();
  const unsplash = getUnsplashKey();
  let openaiOk = false;
  let googleOk = false;
  let ticketmasterOk = false;
  let showtimesOk = false;
  /** Helps debug Railway vs local — safe to expose (no secrets). */
  let openaiDebug = null;
  let googleDebug = null;
  if (openai) {
    try {
      const r = await fetchWithTimeout("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      openaiOk = r.ok;
      if (!openaiOk) openaiDebug = { httpStatus: r.status };
    } catch (e) {
      openaiDebug = { error: String(e?.message || e) };
    }
  }
  if (googleValid) {
    try {
      const r = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=coffee&key=${google}`
      );
      const d = await r.json();
      googleOk = d.status !== "REQUEST_DENIED" && d.status !== "INVALID_REQUEST";
      if (!googleOk) {
        googleDebug = {
          statusFromGoogle: d.status,
          error_message: d.error_message || null,
        };
      }
    } catch (e) {
      googleDebug = { error: String(e?.message || e) };
    }
  }
  if (ticketmaster && !ticketmaster.includes("your_")) {
    try {
      const r = await fetchWithTimeout(
        `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${ticketmaster}&size=1`
      );
      ticketmasterOk = r.ok;
    } catch {}
  }
  if (showtimes && !showtimes.includes("your")) {
    try {
      const r = await fetchWithTimeout("https://api.internationalshowtimes.com/v4/cinemas", {
        headers: { "X-API-Key": showtimes },
      });
      showtimesOk = r.ok;
    } catch {}
  }
  const primaryLen = envSecretLen(process.env.UNSPLASH_ACCESS_KEY);
  const expoLen = envSecretLen(process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY);
  res.json({
    photoPipeline: PHOTO_PIPELINE,
    openai: openaiOk ? "OK" : "FAIL or missing",
    google: googleOk ? "OK" : "FAIL or missing",
    ticketmaster: ticketmaster ? (ticketmasterOk ? "OK" : "FAIL") : "not configured",
    showtimes: showtimes ? (showtimesOk ? "OK" : "FAIL") : "not configured",
    unsplash: unsplash.length > 0 ? "configured" : "not configured",
    /** Safe lengths only — if both are 0, the running process has no Unsplash vars (e.g. Railway needs UNSPLASH_ACCESS_KEY in the dashboard). */
    unsplashEnv: {
      UNSPLASH_ACCESS_KEY_chars: primaryLen,
      EXPO_PUBLIC_UNSPLASH_ACCESS_KEY_chars: expoLen,
      resolvedKey_chars: unsplash.length,
    },
    unsplashHint:
      unsplash.length > 0
        ? undefined
        : primaryLen === 0 && expoLen === 0
          ? "No Unsplash env vars in this process — add UNSPLASH_ACCESS_KEY (or EXPO_PUBLIC_UNSPLASH_ACCESS_KEY) to Railway/host env, or server/.env for local. Restart after saving."
          : "Keys found but treated as placeholders — fix values or use ?debug=1",
    ...(openaiDebug ? { openaiDetails: openaiDebug } : {}),
    ...(googleDebug ? { googleDetails: googleDebug } : {}),
    ...(req.query.debug === "1"
      ? {
          unsplashDebug: {
            dotenvSkippedBecauseImport: process.env._DOTENV_LOADED_VIA_IMPORT === "1",
            placeholderRejected: {
              primary: primaryLen > 0 ? isUnsplashPlaceholder(String(process.env.UNSPLASH_ACCESS_KEY || "").trim()) : null,
              expo: expoLen > 0 ? isUnsplashPlaceholder(String(process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY || "").trim()) : null,
            },
          },
        }
      : {}),
  });
});

/**
 * One real Unsplash Search request — verifies Access Key; usage should appear in Unsplash dashboard.
 * Use the **Access Key** (not Secret) in UNSPLASH_ACCESS_KEY / EXPO_PUBLIC_UNSPLASH_ACCESS_KEY.
 */
app.get("/unsplash-ping", async (req, res) => {
  const key = getUnsplashKey();
  if (!key) {
    return res.status(503).json({
      ok: false,
      error: "no_access_key_in_env",
      photoPipeline: PHOTO_PIPELINE,
      hint: "Set UNSPLASH_ACCESS_KEY to your Unsplash Access Key (Dashboard → Keys → Access Key).",
    });
  }
  try {
    const u =
      "https://api.unsplash.com/search/photos?" +
      new URLSearchParams({
        query: "coffee",
        per_page: "1",
        orientation: "landscape",
      });
    const r = await fetch(u, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    const data = await r.json().catch(() => ({}));
    const errMsg =
      data?.errors?.join?.("; ") ||
      (typeof data?.error === "string" ? data.error : null) ||
      null;
    return res.json({
      ok: r.ok,
      httpStatus: r.status,
      photoPipeline: PHOTO_PIPELINE,
      totalResults: typeof data.total === "number" ? data.total : null,
      firstPageCount: Array.isArray(data.results) ? data.results.length : 0,
      unsplashError: r.ok ? undefined : errMsg || "non-ok response",
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      photoPipeline: PHOTO_PIPELINE,
      error: String(e?.message || e),
    });
  }
});

app.post("/log", (req, res) => {
  try {
    const { type, message, name, screen, action, area, timestamp, ...rest } = req.body || {};
    const log = type === "error"
      ? `[ERROR] ${message} | screen=${screen || "?"} action=${action || "?"} area=${area || "?"}`
      : `[EVENT] ${name || "?"} | ${JSON.stringify(rest)}`;
    console.log(log, timestamp ? `@ ${timestamp}` : "");
    res.status(204).send();
  } catch (e) {
    res.status(204).send();
  }
});

app.get("/photo-test", async (req, res) => {
  const q = req.query.q || "The Smell Los Angeles";
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) return res.json({ error: "No API key" });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    const ref = data?.results?.[0]?.photos?.[0]?.photo_reference;
    if (!ref) return res.json({ error: "No photo", status: data?.status, results: data?.results?.length });
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${key}`;
    const imgRes = await fetch(photoUrl, { method: "HEAD", redirect: "follow" });
    res.json({ ok: true, photoUrl: imgRes.ok ? imgRes.url : photoUrl });
  } catch (e) {
    res.json({ error: e?.message });
  }
});

const openaiKey = process.env.OPENAI_API_KEY?.trim();
const client = openaiKey && !openaiKey.includes("your")
  ? new OpenAI({ apiKey: openaiKey })
  : null;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function metersToMilesText(meters) {
  if (!meters || meters < 0) return "Nearby";
  const miles = meters / 1609.34;
  if (miles < 0.1) return "0.1 mi away";
  if (miles < 1) return `${miles.toFixed(1)} mi away`;
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

async function fetchDriveDuration(originLat, originLng, destination) {
  if (!GOOGLE_PLACES_KEY || !destination || destination.length < 2) return null;
  if (originLat == null || originLng == null || Number.isNaN(originLat) || Number.isNaN(originLng)) return null;
  const origin = `${originLat},${originLng}`;
  const parseDuration = (text) => {
    if (!text) return null;
    return text.includes("min") || text.includes("hour") ? `${text} drive` : `${text} drive`;
  };
  try {
    const dmUrl =
      "https://maps.googleapis.com/maps/api/distancematrix/json" +
      `?origins=${encodeURIComponent(origin)}` +
      `&destinations=${encodeURIComponent(destination)}` +
      "&mode=driving" +
      `&key=${GOOGLE_PLACES_KEY}`;
    const r = await fetch(dmUrl);
    const data = await r.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status === "OK" && el.duration?.text) {
      return parseDuration(el.duration.text);
    }
    const dirUrl =
      "https://maps.googleapis.com/maps/api/directions/json" +
      `?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      "&mode=driving" +
      `&key=${GOOGLE_PLACES_KEY}`;
    const dirRes = await fetch(dirUrl);
    const dirData = await dirRes.json();
    const leg = dirData?.routes?.[0]?.legs?.[0];
    if (leg?.duration?.text) return parseDuration(leg.duration.text);
    return null;
  } catch (e) {
    console.error("Drive duration fetch error:", e?.message);
    return null;
  }
}

function needsDriveTimeEnrichment(distanceText) {
  if (!distanceText || typeof distanceText !== "string") return true;
  const lower = distanceText.toLowerCase().trim();
  if (lower.includes("min") && (lower.includes("away") || lower.includes("drive"))) return false; // already has drive time
  if (lower.includes("mi away") || lower.includes("km away") || lower.includes("miles")) return true; // replace distance with drive time
  return [
    "drive depending on traffic",
    "transit depending on where you are",
    "subway or walk depending on where you are",
    "transit or drive depending on where you are",
    "downtown la",
    "chinatown",
  ].includes(lower) || lower.length < 3;
}

function estimateDriveTimeFromDistance(distanceText) {
  if (!distanceText || typeof distanceText !== "string") return "~5 min drive";
  const lower = distanceText.toLowerCase().trim();
  const miMatch = lower.match(/(\d+\.?\d*)\s*mi\s*away/);
  if (miMatch) {
    const miles = parseFloat(miMatch[1]);
    const mins = Math.max(2, Math.round(miles * 3));
    return `~${mins} min drive`;
  }
  const kmMatch = lower.match(/(\d+\.?\d*)\s*km/);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    const mins = Math.max(2, Math.round((km / 1.6) * 3));
    return `~${mins} min drive`;
  }
  if (lower === "nearby" || lower.length < 3) return "~5 min drive";
  return "~10 min drive";
}

function getDriveDestination(c, areaStr) {
  if (c.lat != null && c.lng != null && !Number.isNaN(c.lat) && !Number.isNaN(c.lng)) {
    return `${c.lat},${c.lng}`;
  }
  const addr = (c.address || "").trim().toLowerCase();
  const generic = addr === "nearby" || addr.length < 5;
  const dest = generic
    ? (c.mapQuery || c.sourceName || c.address || "").trim()
    : (c.address || c.mapQuery || c.sourceName || "").trim();
  if (!dest || dest.length < 3) return null;
  return areaStr && !dest.toLowerCase().includes(areaStr.toLowerCase())
    ? `${dest}, ${areaStr}`
    : dest;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  if (lat2 == null || lon2 == null) return;

  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function overpassPlaceToCandidate(place, timeRange) {
  const cat = place.category;
  let exactTitle = "";
  let durationMinutes = 45;
  let score = 7;
  let category = cat;

  if (cat === "cafe") {
    exactTitle = `${place.name} — specialty coffee, cozy seating, good for working or catching up`;
    durationMinutes = timeRange === "1–15 min" ? 15 : 25;
    score = 7;
  } else if (cat === "restaurant") {
    exactTitle = `${place.name} — casual dining, good for groups and date nights`;
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 8;
  } else if (cat === "park") {
    exactTitle =
      timeRange === "1 hr+"
        ? `${place.name} — green space, trails, and outdoor paths`
        : `${place.name} — walking paths and green space`;
    durationMinutes = timeRange === "1 hr+" ? 60 : 30;
    score = 7;
  } else if (cat === "bar") {
    exactTitle = `${place.name} — craft cocktails and late-night vibe`;
    durationMinutes = 60;
    score = 8;
  } else if (cat === "museum") {
    exactTitle = `${place.name} — rotating exhibits and collections worth a visit`;
    durationMinutes = 90;
    score = 8;
  } else if (cat === "bookstore") {
    exactTitle = `${place.name} — independent books, cozy browsing`;
    durationMinutes = 45;
    score = 7;
  } else if (cat === "bakery" || cat === "ice_cream") {
    exactTitle = cat === "bakery"
      ? `${place.name} — fresh pastries, bread, and desserts`
      : `${place.name} — handmade ice cream and sweet treats`;
    durationMinutes = timeRange === "1–15 min" ? 15 : 25;
    score = 6;
  } else if (cat === "cinema") {
    exactTitle = `${place.name} — check what's playing`;
    durationMinutes = 120;
    score = 9;
  } else if (cat === "theatre") {
    exactTitle = `${place.name} — see what's on tonight`;
    durationMinutes = 120;
    score = 9;
    category = "theater";
  } else if (cat === "nightclub") {
    exactTitle = `${place.name} — DJs, dance floor, and a night out`;
    durationMinutes = 180;
    score = 10;
  } else if (cat === "gallery") {
    exactTitle = `${place.name} — art exhibitions and local artists`;
    durationMinutes = 60;
    score = 7;
  } else {
    return null;
  }

  const subtitleByCat = {
    cafe: "Coffee and seating; check hours before you go.",
    restaurant: "Sit-down dining—busy nights may need a reservation.",
    park: "Outdoor space—no ticket; bring water for longer walks.",
    museum: "Exhibits and galleries—buy tickets online if offered.",
    cinema: "Movie showtimes—buy tickets on the theater site.",
    theatre: "Live shows—check the venue calendar for tonight.",
    theater: "Live shows—check the venue calendar for tonight.",
    bar: "Drinks and bar food—21+; cover on busy nights.",
    nightclub: "Dancing and DJs—often late hours and a cover.",
    gallery: "Art on view—confirm free vs ticketed entry.",
  };
  const subtitle =
    subtitleByCat[cat] || "Named spot on the map—confirm hours before you leave.";

  return {
    id: place.id,
    kind: "place",
    category,
    exactTitle,
    sourceName: place.name,
    subtitle,
    reasonHints: ["nearby", "specific"],
    durationMinutes,
    address: place.address || "",
    mapQuery: place.mapQuery || place.name,
    actionType: "maps",
    externalUrl: "",
    distanceText: place.distanceText || "Nearby",
    priceText: place.priceText || "$$",
    score,
    lat: place.lat,
    lng: place.lng,
  };
}

async function fetchOverpassPlaces(lat, lng, timeRange, nightlifeOk = true) {
  const base1hr = ["restaurant", "cinema", "theatre", "museum", "park", "gallery"];
  if (nightlifeOk) base1hr.push("bar", "nightclub");
  const categories =
    timeRange === "1 hr+"
      ? base1hr
      : timeRange === "30–60 min"
      ? ["cafe", "restaurant", "park", "museum", "bookstore", "gallery", "bakery"]
      : timeRange === "1–15 min"
      ? ["cafe", "park", "bakery", "ice_cream"]
      : ["cafe", "restaurant", "park", "bookstore", "bakery", "ice_cream"];

  const tagPairs = [
    ["amenity", "cafe"],
    ["amenity", "coffee_shop"],
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["leisure", "park"],
    ["leisure", "garden"],
    ["amenity", "bar"],
    ["amenity", "pub"],
    ["tourism", "museum"],
    ["shop", "books"],
    ["shop", "bakery"],
    ["amenity", "bakery"],
    ["amenity", "ice_cream"],
    ["amenity", "cinema"],
    ["amenity", "theatre"],
    ["amenity", "arts_centre"],
    ["amenity", "nightclub"],
    ["tourism", "gallery"],
  ];

  const radius = 5000;
  const parts = tagPairs.map(([k, v]) => `nwr(around:${radius},${lat},${lng})["${k}"="${v}"];`);
  const query = `[out:json][timeout:15];(\n  ${parts.join("\n  ")}\n);\nout center;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      console.log("Overpass API error:", res.status);
      return [];
    }

    const data = await res.json();
    const elements = data.elements || [];
    const byCategory = {};

    const categoryFromTags = (tags) => {
      if (tags?.amenity === "cafe" || tags?.amenity === "coffee_shop") return "cafe";
      if (tags?.amenity === "restaurant" || tags?.amenity === "fast_food") return "restaurant";
      if (tags?.leisure === "park" || tags?.leisure === "garden") return "park";
      if (tags?.amenity === "bar" || tags?.amenity === "pub") return "bar";
      if (tags?.tourism === "museum") return "museum";
      if (tags?.shop === "books") return "bookstore";
      if (tags?.shop === "bakery" || tags?.amenity === "bakery") return "bakery";
      if (tags?.amenity === "ice_cream") return "ice_cream";
      if (tags?.amenity === "cinema") return "cinema";
      if (tags?.amenity === "theatre" || tags?.amenity === "arts_centre") return "theatre";
      if (tags?.amenity === "nightclub") return "nightclub";
      if (tags?.tourism === "gallery") return "gallery";
      return null;
    };

    for (const el of elements) {
      const name = el.tags?.name || el.tags?.brand || el.tags?.operator;
      if (!name || name.length < 2) continue;
      const n = name.toLowerCase();
      if (n.includes("unnamed") || n === "place" || n === "unknown") continue;

      const cat = categoryFromTags(el.tags);
      if (!cat || !categories.includes(cat)) continue;

      let plat, plng;
      if (el.type === "node") {
        plat = el.lat;
        plng = el.lon;
      } else if (el.center) {
        plat = el.center.lat;
        plng = el.center.lon;
      } else continue;

      const dist = haversineMeters(lat, lng, plat, plng);
      const street = el.tags?.["addr:street"] || "";
      const hn = el.tags?.["addr:housenumber"] || "";
      const city = el.tags?.["addr:city"] || el.tags?.["addr:town"] || "";
      const address = [hn, street].filter(Boolean).join(" ") || city || "Nearby";

      const place = {
        id: `overpass-${el.type}-${el.id}`,
        name,
        category: cat,
        address,
        mapQuery: name,
        distanceText: metersToMilesText(dist),
        distanceMeters: dist || 9999,
        priceText: "$$",
        lat: plat,
        lng: plng,
      };

      if (!byCategory[cat]) byCategory[cat] = [];
      if (byCategory[cat].length < 3) byCategory[cat].push(place);
    }

    const places = [];
    for (const cat of categories) {
      places.push(...(byCategory[cat] || []));
    }
    places.sort((a, b) => (a.distanceMeters || 9999) - (b.distanceMeters || 9999));

    return places.map((p) => overpassPlaceToCandidate(p, timeRange)).filter(Boolean);
  } catch (err) {
    console.error("Overpass fetch error:", err?.message || err);
    return [];
  }
}

const TICKETMASTER_KEY = process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;

async function fetchEventsForKeyword(keyword, area, lat, lng) {
  if (!TICKETMASTER_KEY || !keyword || keyword.length < 2) return [];
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_KEY);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("size", "50");
    url.searchParams.set("sort", "date,asc");
    if (lat != null && lng != null) {
      url.searchParams.set("latlong", `${lat},${lng}`);
      url.searchParams.set("radius", "30");
      url.searchParams.set("unit", "miles");
    } else if (area) {
      url.searchParams.set("city", area);
    }
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return data?._embedded?.events ?? [];
  } catch {
    return [];
  }
}

function venueNameMatchesEvent(venueName, eventVenue) {
  const v = (venueName || "").toLowerCase().replace(/\s+/g, " ");
  const e = (eventVenue || "").toLowerCase().replace(/\s+/g, " ");
  if (e.includes(v) || v.includes(e)) return true;
  const vWords = v.split(/\s+/).filter((w) => w.length > 2);
  const matchCount = vWords.filter((w) => e.includes(w)).length;
  return matchCount >= Math.min(2, vWords.length);
}

function getEventStartMs(event) {
  const dt = event?.dates?.start?.dateTime;
  if (dt) {
    const t = new Date(dt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const ld = event?.dates?.start?.localDate;
  const lt = event?.dates?.start?.localTime;
  if (!ld) return null;
  const timePart = lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized = timePart.length === 5 ? `${timePart}:00` : timePart;
  const t = new Date(`${ld}T${normalized}`).getTime();
  return Number.isNaN(t) ? null : t;
}

function sameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTicketmasterEventLikelyCancelled(event) {
  const name = String(event?.name ?? "");
  if (/\bcancel(?:l)?ed\b|\bpostponed\b|\boff\s*sale\b/i.test(name)) return true;
  const code = String(event?.dates?.status?.code ?? "").toLowerCase();
  if (code === "cancelled" || code === "canceled") return true;
  const note = String(event?.pleaseNote ?? "");
  if (note.length > 0 && note.length < 400 && /\bcancel(?:l)?ed\b/i.test(note)) return true;
  return false;
}

function filterTicketmasterEventsForImmediateOuting(events, nowMs = Date.now()) {
  const grace = 5 * 60 * 1000;
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

function filterUpcomingTicketmasterEvents(events, nowMs = Date.now(), opts = {}) {
  const maxDays = opts.maxDaysAhead ?? 10;
  const grace = opts.graceMs ?? 5 * 60 * 1000;
  const maxMs = nowMs + maxDays * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const start = getEventStartMs(e);
    if (start == null || Number.isNaN(start)) return false;
    if (start < nowMs - grace) return false;
    if (start > maxMs) return false;
    return true;
  });
}

function getEventStartTimezone(event) {
  const tz =
    event?.dates?.start?.timezone ||
    event?.dates?.timezone ||
    event?._embedded?.venues?.[0]?.timezone;
  return typeof tz === "string" && tz.length > 2 ? tz : undefined;
}

function formatEventTime(dateStr, timeZone) {
  if (!dateStr) return "Later today";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Later today";
  const o = { hour: "numeric", minute: "2-digit" };
  if (timeZone) o.timeZone = timeZone;
  return d.toLocaleTimeString("en-US", o);
}

function formatEventDate(localDate) {
  if (!localDate) return "";
  const parts = String(localDate).split("-");
  if (parts.length < 3) return "";
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dt = new Date(y, mo, day);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function extractEventNameHintFromTitle(exactTitle) {
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

function scoreEventAgainstHint(eventName, hint) {
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

function pickBestTicketmasterEvent(events, venueName, eventNameHint, nowMs = Date.now()) {
  const upcoming = filterTicketmasterEventsForImmediateOuting(
    filterUpcomingTicketmasterEvents(events, nowMs),
    nowMs
  );
  const matched = [];
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
    const getMs = (ev) => getEventStartMs(ev) ?? 0;
    const getLocalDayKey = (ev) =>
      ev?.dates?.start?.localDate || String(ev?.dates?.start?.dateTime || "").slice(0, 10);
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

async function searchEventsForVenue(venueName, area, lat, lng, eventNameHint = "", nowMs = Date.now()) {
  if (!venueName || venueName.length < 3) return null;
  const keywordsToTry = [
    venueName,
    venueName.replace(/\s+(Theater|Theatre|Cinema)\s*$/i, "").trim(),
    venueName.split(/\s+/).slice(0, 3).join(" "),
    venueName.split(/\s+/).slice(0, 2).join(" "),
  ].filter((k) => k.length >= 3);
  const seenKw = new Set();
  const uniqueKeywords = keywordsToTry.filter((k) => {
    const key = k.toLowerCase();
    if (seenKw.has(key)) return false;
    seenKw.add(key);
    return true;
  });

  const allEvents = [];
  const seenIds = new Set();
  for (const keyword of uniqueKeywords) {
    const events = await fetchEventsForKeyword(keyword, area, lat, lng);
    for (const ev of events) {
      const id = ev?.id;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      allEvents.push(ev);
    }
  }

  const best = pickBestTicketmasterEvent(allEvents, venueName, eventNameHint, nowMs);
  if (!best) return null;
  const eventName = best.name ?? "";
  if (!eventName || eventName === "Live event") return null;

  return {
    name: eventName,
    startTimeText: formatEventTime(best?.dates?.start?.dateTime, getEventStartTimezone(best)),
    dateText: formatEventDate(best?.dates?.start?.localDate),
    url: best?.url,
  };
}

const SHOWTIMES_KEY = process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY || process.env.INTERNATIONAL_SHOWTIMES_API_KEY;

async function searchMovieShowtimesForVenue(venueName, area, lat, lng) {
  if (!SHOWTIMES_KEY || !venueName || venueName.length < 3 || lat == null || lng == null) return null;
  try {
    const url = new URL("https://api.internationalshowtimes.com/v5/showtimes");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("distance", "25");
    url.searchParams.set("countries", "US");
    url.searchParams.set("per_page", "50");
    const res = await fetch(url.toString(), { headers: { "X-API-Key": SHOWTIMES_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    const showtimes = data?.showtimes ?? data?.data ?? [];
    if (!Array.isArray(showtimes) || showtimes.length === 0) return null;

    function normalize(s) {
      return (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
    }
    function cinemaMatches(vn, cn) {
      const v = normalize(vn);
      const c = normalize(cn);
      if (!v || !c) return false;
      if (c.includes(v) || v.includes(c)) return true;
      const vWords = v.split(/\s+/).filter((w) => w.length > 2);
      return vWords.filter((w) => c.includes(w)).length >= Math.min(2, vWords.length);
    }
    function fmtTime(d) {
      if (!d) return "Tonight";
      try {
        const dt = new Date(d);
        return Number.isNaN(dt.getTime()) ? "Tonight" : dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } catch { return "Tonight"; }
    }

    for (const st of showtimes) {
      const cinema = st.cinema ?? st.venue ?? {};
      const cinemaName = typeof cinema === "object" ? (cinema.name ?? cinema.title ?? "") : String(cinema);
      if (!cinemaMatches(venueName, cinemaName)) continue;
      const movie = st.movie ?? st.film ?? {};
      const movieName = typeof movie === "object" ? (movie.title ?? movie.name ?? "") : String(movie);
      if (!movieName || movieName.length < 2) continue;
      const startTime = st.start_at ?? st.start_time ?? st.datetime ?? "";
      return { movieName, startTimeText: fmtTime(startTime), url: st.booking_url ?? st.url ?? cinema.website };
    }
    return null;
  } catch {
    return null;
  }
}

function venueNeedsTicketmasterEnrich(c) {
  const cat = (c.category || "").toLowerCase();
  const t = c.exactTitle || "";
  const s = c.sourceName || "";
  const ticketed = ["theater", "theatre", "cinema", "comedy", "live_music", "movie_theater"];
  if (ticketed.includes(cat)) return true;
  if (/\b(improv|comedy club)\b/i.test(s)) return true;
  return (
    t.includes("see what's") ||
    t.includes("for a show") ||
    t.includes("for a movie") ||
    /\b at \d/.test(t) ||
    /\b(improv|comedy club|theater|theatre|cinema)\b/i.test(s)
  );
}

async function enrichTheatreCinemaCandidates(candidates, area, lat, lng, nowMs = Date.now()) {
  const out = [...candidates];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (!venueNeedsTicketmasterEnrich(c)) continue;
    let enriched = false;
    const hint = extractEventNameHintFromTitle(c.exactTitle || "");
    const event = await searchEventsForVenue(c.sourceName, area, lat, lng, hint, nowMs);
    if (event && event.name) {
      const timeLine =
        event.dateText && event.startTimeText
          ? `${event.name} — ${event.dateText} · ${event.startTimeText}`
          : event.startTimeText
            ? `${event.name} — ${event.startTimeText}`
            : event.name;
      out[i] = {
        ...c,
        exactTitle: event.startTimeText
          ? `${event.name} at ${c.sourceName} — ${event.startTimeText}`
          : `${event.name} tonight at ${c.sourceName}`,
        subtitle: timeLine,
        dateText: event.dateText || "",
        externalUrl: event.url || c.externalUrl,
      };
      enriched = true;
    }
    if (!enriched && lat != null && lng != null) {
      const cat = (c.category || "").toLowerCase();
      if (["cinema", "theatre", "theater", "movie_theater"].includes(cat)) {
        const movie = await searchMovieShowtimesForVenue(c.sourceName, area, lat, lng);
        if (movie && movie.movieName) {
          out[i] = {
            ...c,
            exactTitle: movie.startTimeText
              ? `${movie.movieName} at ${c.sourceName} — ${movie.startTimeText}`
              : `${movie.movieName} tonight at ${c.sourceName}`,
            subtitle: movie.startTimeText ? `${movie.movieName} — ${movie.startTimeText}` : c.subtitle,
            externalUrl: movie.url || c.externalUrl,
          };
        }
      }
    }
  }
  return out;
}

function nowFromPayload(currentTime) {
  if (!currentTime) return new Date();
  const d = new Date(currentTime);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** IANA zone from the phone (e.g. America/Los_Angeles). Used so server matches local wall clock. */
function safeTimeZone(tz) {
  if (tz == null || typeof tz !== "string") return null;
  const s = tz.trim();
  if (s.length < 2 || s.length > 80) return null;
  if (!/^[\w/+-]+$/.test(s)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s });
    return s;
  } catch {
    return null;
  }
}

function getWallParts(isoString, timeZone) {
  const d = new Date(isoString || Date.now());
  if (Number.isNaN(d.getTime())) {
    return { weekdayLong: "Sunday", weekdayIndex: 0, hour: 12, minute: 0 };
  }
  const tz = safeTimeZone(timeZone) || "UTC";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const weekdayLong = get("weekday") || "Sunday";
    const hour = parseInt(String(get("hour") || "0"), 10);
    const minute = parseInt(String(get("minute") || "0"), 10);
    const dayMap = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const weekdayIndex = dayMap[weekdayLong] ?? 0;
    return { weekdayLong, hour, minute, weekdayIndex };
  } catch {
    return { weekdayLong: "Sunday", weekdayIndex: 0, hour: 12, minute: 0 };
  }
}

function isNightlifeTime(isoString, timeZone) {
  const { hour } = getWallParts(isoString, timeZone);
  return hour >= 18 || hour < 3;
}

function getTimeContext(isoString, timeZone) {
  const { weekdayLong, hour, minute } = getWallParts(isoString, timeZone);
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  const time = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
  return `${weekdayLong} ${time}`;
}

function isLateNightOutHoursFromPayload(isoString, timeZone) {
  const { hour } = getWallParts(isoString, timeZone);
  return hour >= 21 || hour < 3;
}

function isGroceryOrErrandName(sourceName, exactTitle) {
  const s = `${sourceName || ""} ${exactTitle || ""}`.toLowerCase();
  return /\b(trader\s*joe|whole\s*foods|safeway|ralphs|vons|pavilions|albertsons|kroger|publix|aldi|lidl|costco|99\s*ranch|hmart|h\s*mart|sprouts|gelson|smart\s*&\s*final|food\s*4\s*less|super\s*market|supermarket|grocery\s*outlet|grocery\s*store)\b/i.test(
    s
  );
}

function isLateNightInappropriateVenue(sourceName, exactTitle, category) {
  const s = `${sourceName || ""} ${exactTitle || ""}`;
  if (
    /\b(chuck\s*e\.?\s*cheese|peter\s*piper\s*pizza|sky\s*zone|urban\s*air|launch\s*trampoline|bounce\s*u|kids\s*fun|children'?s\s*museum)\b/i.test(
      s
    )
  ) {
    return true;
  }
  const c = (category || "").toLowerCase();
  if (c === "arcade" && /\b(chuck|pizza|play|kids|family|children)\b/i.test(s)) return true;
  return false;
}

function hardFilterCandidates(payload) {
  const timeRange = payload.timeRange;
  const raw = Array.isArray(payload.candidates) ? payload.candidates : [];
  let filtered = raw.filter(
    (c) => c && c.exactTitle && c.sourceName && c.kind && c.durationMinutes
  );

  filtered = filtered.filter((c) => {
    if (isGroceryOrErrandName(c.sourceName, c.exactTitle)) return false;
    if (
      isLateNightOutHoursFromPayload(payload.currentTime, payload.timeZone) &&
      isLateNightInappropriateVenue(c.sourceName, c.exactTitle, c.category)
    ) {
      return false;
    }
    return true;
  });

  const hunger = payload.hunger || "any";
  const foodCats = new Set([
    "restaurant",
    "cafe",
    "coffee",
    "bakery",
    "ice_cream",
    "dessert",
    "market",
  ]);
  if (hunger === "not_hungry") {
    filtered = filtered.filter((c) => !foodCats.has((c.category || "").toLowerCase()));
  }

  if (timeRange === "1 hr+") {
    filtered = filtered
      .filter((c) => c.durationMinutes >= 60)
      .filter((c) =>
        [
          "comedy",
          "live_music",
          "movie_theater",
          "scenic",
          "trail",
          "market",
          "bowling",
          "arcade",
          "museum",
          "theater",
          "live_performance",
          "nightclub",
          "park",
          "restaurant",
          "bar",
          "gallery",
        ].includes(c.category)
      )
      .filter((c) => !c.exactTitle.toLowerCase().includes("find "))
      .filter((c) => !c.exactTitle.toLowerCase().includes("go see a movie tonight"))
      .filter((c) => !c.exactTitle.toLowerCase().includes("go see a movie that starts tonight"));
  }

  // Always filter out theatre/cinema without specific shows
  filtered = filtered.filter((c) => {
    const isTheatreCinema = ["theatre", "theater", "cinema"].includes(c.category);
    const hasGeneric = (c.exactTitle || "").includes("see what's on") || (c.exactTitle || "").includes("see what's playing");
    return !(isTheatreCinema && hasGeneric);
  });

  // Filter unnamed
  filtered = filtered.filter((c) => {
    const t = (c.exactTitle || "").toLowerCase();
    const s = (c.sourceName || "").toLowerCase();
    return !t.includes("unnamed") && !s.includes("unnamed");
  });

  // No bars or nightlife at noon
  if (!isNightlifeTime(payload.currentTime, payload.timeZone)) {
    filtered = filtered.filter((c) => {
      if (c.category === "nightclub" || c.category === "bar") return false;
      const t = (c.exactTitle || "").toLowerCase();
      if (t.includes("clubbing") || t.includes("go clubbing")) return false;
      if (t.includes("craft cocktails") || t.includes("grab a drink")) return false;
      return true;
    });
  }

  if (timeRange === "30–60 min") {
    filtered = filtered.filter(
      (c) => c.durationMinutes >= 25 && c.durationMinutes <= 75
    );
  }

  if (timeRange === "1–15 min") {
    filtered = filtered.filter((c) => c.durationMinutes <= 25);
  }

  if (timeRange === "10–30 min") {
    filtered = filtered.filter((c) => c.durationMinutes <= 35);
  }

  return filtered.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
}

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

function normalizePlaceName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayNameText(displayName) {
  if (!displayName) return "";
  if (typeof displayName === "string") return displayName;
  return displayName.text || displayName.name || "";
}

/** Reject unrelated Places hits (e.g. wrong venue photo). */
function placeDisplayNameMatchesQuery(displayName, q, sourceName) {
  const d = normalizePlaceName(displayNameText(displayName));
  if (!d || d.length < 3) return false;
  const targets = [q, sourceName].filter((t) => t && String(t).length >= 2);
  for (const t of targets) {
    const tn = normalizePlaceName(t);
    if (!tn) continue;
    if (d.includes(tn) || tn.includes(d)) return true;
    const dWords = new Set(d.split(/\s+/).filter((w) => w.length > 2));
    const tnWords = tn.split(/\s+/).filter((w) => w.length > 2);
    const hits = tnWords.filter((w) => dWords.has(w)).length;
    if (hits >= Math.min(2, Math.max(1, tnWords.length))) return true;
  }
  // Strong word overlap (e.g. "Huntington Beach Central Library Theater" vs Google's shorter name)
  const dLong = new Set(d.split(/\s+/).filter((w) => w.length > 3));
  for (const t of targets) {
    const tnLong = normalizePlaceName(String(t))
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const sharedLong = tnLong.filter((w) => dLong.has(w)).length;
    if (sharedLong >= 2) return true;
  }
  return false;
}

/** City / region words that alone should not justify a fuzzy match (wrong-venue photos). */
const GEO_WORDS_SKIP = new Set([
  "beach",
  "city",
  "angeles",
  "county",
  "state",
  "north",
  "south",
  "east",
  "west",
  "downtown",
  "international",
  "national",
  "grand",
  "central",
  "westminster",
  "regional",
]);

/**
 * City / neighborhood tokens that appear in street addresses — matching ONLY these
 * caused "Brea Improv" → Secret Karate (address contained "Brea").
 */
const WEAK_LOCATION_TOKENS = new Set([
  "brea",
  "pasadena",
  "torrance",
  "fullerton",
  "anaheim",
  "irvine",
  "huntington",
  "newport",
  "laguna",
  "riverside",
  "orange",
  "cypress",
  "placentia",
  "burbank",
  "glendale",
  "santa",
  "monica",
  "hollywood",
  "westminster",
  "garden",
  "grove",
  "beach",
]);

/** If the venue name includes one of these, the Places result must include it too (e.g. Brea Improv vs karate). */
const VENUE_TYPE_MARKERS = [
  "improv",
  "comedy",
  "theater",
  "theatre",
  "museum",
  "cinema",
  "stadium",
  "arena",
  "aquarium",
  "observatory",
  "gallery",
  "bookstore",
  "brewery",
  "nightclub",
  "karaoke",
  "bowling",
  "arcade",
  "pier",
  "zoo",
  "opera",
  "symphony",
  "amphitheatre",
  "amphitheater",
  "surfing",
  "market",
];

/**
 * Block fuzzy matches that only share a city or generic word (e.g. "Brea" + karate school).
 * If sourceName contains a venue-type marker, Google displayName must contain that marker.
 */
function passesDistinctiveTokenGate(displayName, matchName, q) {
  const d = normalizePlaceName(displayNameText(displayName));
  if (!d || d.length < 3) return false;
  const focus = normalizePlaceName(matchName);
  if (!focus) return false;

  for (const marker of VENUE_TYPE_MARKERS) {
    if (focus.includes(marker) && !d.includes(marker)) return false;
  }

  const words = focus.split(/\s+/).filter((w) => w.length >= 4);
  for (const w of words) {
    if (GEO_WORDS_SKIP.has(w)) continue;
    if (w.length >= 5 && d.includes(w)) return true;
  }
  for (const marker of VENUE_TYPE_MARKERS) {
    if (focus.includes(marker) && d.includes(marker)) return true;
  }

  const substantive = words.filter((w) => !GEO_WORDS_SKIP.has(w) && w.length >= 4);
  const hits = substantive.filter((w) => d.includes(w)).length;
  if (hits >= 2) return true;

  const only = substantive[0];
  if (only && only.length >= 6 && d.includes(only)) return true;

  return false;
}

/** 0–1 fuzzy score for ranking search results when strict name match fails. */
function scorePlaceNameMatch(displayName, matchName, q) {
  const d = normalizePlaceName(displayNameText(displayName));
  if (!d || d.length < 3) return 0;
  const targets = [matchName, q].filter((t) => t && String(t).length >= 2);
  let best = 0;
  for (const t of targets) {
    const tn = normalizePlaceName(String(t));
    if (!tn) continue;
    if (d.includes(tn) || tn.includes(d)) return 1;
    const dWords = new Set(d.split(/\s+/).filter((w) => w.length > 2));
    const tnWords = tn.split(/\s+/).filter((w) => w.length > 2);
    if (!tnWords.length) continue;
    const hits = tnWords.filter((w) => dWords.has(w)).length;
    const ratio = hits / Math.max(tnWords.length, 1);
    if (ratio > best) best = ratio;
    const dLong = new Set(d.split(/\s+/).filter((w) => w.length > 3));
    const tnLong = tn.split(/\s+/).filter((w) => w.length > 3);
    const sharedLong = tnLong.filter((w) => dLong.has(w)).length;
    if (sharedLong >= 2) best = Math.max(best, 0.85);
  }
  return best;
}

/**
 * Prefer strict name matches; otherwise rank by fuzzy score (fixes "no photos" when
 * Google uses a slightly different title than our map query).
 */
function selectPlaceCandidatesFromSearch(places, matchName, q) {
  if (!places || places.length === 0) return [];
  const strict = places.filter((p) =>
    placeDisplayNameMatchesQuery(p.displayName, matchName, q)
  );
  if (strict.length > 0) return strict;
  const scored = places
    .map((p) => ({
      place: p,
      score: scorePlaceNameMatch(p.displayName, matchName, q),
    }))
    .sort((a, b) => b.score - a.score);
  const gated = scored.filter(
    (s) =>
      s.score >= 0.28 && passesDistinctiveTokenGate(s.place.displayName, matchName, q)
  );
  const pool = gated.length > 0 ? gated : [];
  const best = pool[0];
  if (!best) return [];
  if (best.score >= 0.4) {
    return pool.filter((s) => s.score >= 0.3).slice(0, 4).map((s) => s.place);
  }
  if (best.score >= 0.32) return [best.place];
  return [];
}

function buildPlaceDetailSearchQueries({ q, area, category, address, sourceName, hasCoords, hasAddress }) {
  const baseName = sourceName && sourceName.length >= 2 ? sourceName : q;
  const hint = categoryToSearchHint(category);
  const variants = [];
  const push = (s) => {
    const t = String(s || "")
      .trim()
      .replace(/\s+/g, " ");
    if (t.length >= 2 && !variants.includes(t)) variants.push(t);
  };

  let searchQuery =
    area && typeof area === "string" && area.length > 1 ? `${q} ${area}`.trim() : q;
  if (hint) searchQuery = `${hint} ${q} ${area}`.trim();
  else if (area && area.length > 1) searchQuery = `${q} ${area}`.trim();
  if (address && String(address).length > 2) searchQuery = `${searchQuery} ${address}`.trim();

  let textQueryForPlaces = searchQuery;
  if (hasAddress || hasCoords) {
    const parts = [baseName];
    if (address && String(address).length > 2) parts.push(address);
    else if (area && String(area).length > 1) parts.push(area);
    textQueryForPlaces = parts.join(" ").trim().replace(/\s+/g, " ");
  }
  const placesQuery = hasAddress || hasCoords ? textQueryForPlaces : searchQuery;

  push(placesQuery);
  if (placesQuery !== searchQuery) push(searchQuery);

  const partsName = [baseName];
  if (address && String(address).length > 2) partsName.push(address);
  else if (area && area.length > 1) partsName.push(area);
  push(partsName.join(" ").trim());

  if (area && area.length > 1) push(`${baseName} ${area}`.trim());
  if (address && String(address).length > 2) push(`${baseName} ${address}`.trim());
  if (hint && area && area.length > 1) push(`${baseName} ${area}`.trim());

  push(baseName);

  return variants;
}

async function placesSearchTextNew(textQuery, lat, lng) {
  const hasCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const body = { textQuery: textQuery };
  if (hasCoords) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 50000,
      },
    };
  }
  try {
    const searchRes = await fetchWithTimeoutMs(
      "https://places.googleapis.com/v1/places:searchText",
      PLACES_DETAIL_FETCH_MS,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
          "X-Goog-FieldMask": "places.name,places.id,places.displayName",
        },
        body: JSON.stringify(body),
      }
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    return searchData.places ?? [];
  } catch (e) {
    console.error("placesSearchTextNew:", String(textQuery).slice(0, 48), e?.message || e);
    return [];
  }
}

/** Google Places metadata only — photos come from editorial Unsplash, not business uploads. */
async function fetchNewApiPlaceDetailPayload(placeResourceName) {
  const detailUrl = `https://places.googleapis.com/v1/${encodeURIComponent(placeResourceName)}`;
  let detailRes;
  try {
    detailRes = await fetchWithTimeoutMs(detailUrl, PLACES_DETAIL_FETCH_MS, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask":
          "rating,userRatingCount,displayName,editorialSummary,formattedAddress,websiteUri,nationalPhoneNumber,googleMapsUri",
      },
    });
  } catch (e) {
    console.error("fetchNewApiPlaceDetailPayload GET:", e?.message || e);
    return null;
  }
  if (!detailRes.ok) return null;
  const details = await detailRes.json();
  const summaryText =
    (typeof details.editorialSummary === "string"
      ? details.editorialSummary
      : details.editorialSummary?.text) || null;
  const displayName =
    details.displayName?.text || details.displayName || null;
  return {
    rating: typeof details.rating === "number" ? details.rating : null,
    userRatingCount:
      typeof details.userRatingCount === "number" ? details.userRatingCount : null,
    summary: typeof summaryText === "string" ? summaryText : null,
    displayName,
    formattedAddress: details.formattedAddress || null,
    websiteUri: typeof details.websiteUri === "string" ? details.websiteUri : null,
    nationalPhoneNumber:
      typeof details.nationalPhoneNumber === "string" ? details.nationalPhoneNumber : null,
    googleMapsUri: typeof details.googleMapsUri === "string" ? details.googleMapsUri : null,
  };
}

function placeDetailMetaScore(p) {
  if (!p) return 0;
  let s = 0;
  if (p.summary) s += 2;
  if (p.rating != null) s += 1;
  if (p.userRatingCount) s += 0.5;
  if (p.websiteUri) s += 0.35;
  if (p.nationalPhoneNumber) s += 0.25;
  return s;
}

/** Legacy Places API fallback — metadata only (photos are editorial Unsplash). */
async function fetchLegacyPlaceDetailsBundle(query, matchName, q, lat, lng) {
  try {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_KEY}`;
    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      url += `&location=${Number(lat)},${Number(lng)}&radius=50000`;
    }
    const searchRes = await fetchWithTimeoutMs(url, PLACES_DETAIL_FETCH_MS);
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    if (data?.status === "REQUEST_DENIED" || data?.status === "OVER_QUERY_LIMIT") {
      console.error("Legacy place-details:", data?.status, data?.error_message);
      return null;
    }
    const results = data?.results ?? [];
    if (!results.length) return null;

    const strict = results.filter((r) =>
      placeDisplayNameMatchesQuery({ text: r.name }, matchName, q)
    );
    let ordered = strict;
    if (!ordered.length) {
      const scored = results
        .map((r) => ({ r, score: scorePlaceNameMatch({ text: r.name }, matchName, q) }))
        .sort((a, b) => b.score - a.score);
      const gated = scored.filter(
        (s) =>
          s.score >= 0.28 && passesDistinctiveTokenGate({ text: s.r.name }, matchName, q)
      );
      if (gated.length > 0) {
        ordered = gated.filter((s) => s.score >= 0.3).slice(0, 4).map((s) => s.r);
      } else {
        return null;
      }
    }

    let best = null;
    for (const r of ordered) {
      const placeId = r.place_id;
      if (!placeId) continue;
      const detUrl =
        `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${encodeURIComponent(placeId)}&` +
        `fields=name,rating,user_ratings_total,editorial_summary,formatted_address,website,formatted_phone_number,url&` +
        `key=${GOOGLE_PLACES_KEY}`;
      const detRes = await fetchWithTimeoutMs(detUrl, PLACES_DETAIL_FETCH_MS);
      if (!detRes.ok) continue;
      const det = await detRes.json();
      const res = det.result;
      if (!res) continue;
      const ed = res.editorial_summary;
      const summary =
        typeof ed === "string"
          ? ed
          : ed && typeof ed === "object"
            ? ed.overview || ed.text || null
            : null;
      if (res.rating == null && !summary) continue;
      const candidate = {
        rating: typeof res.rating === "number" ? res.rating : null,
        userRatingCount:
          typeof res.user_ratings_total === "number" ? res.user_ratings_total : null,
        summary: typeof summary === "string" ? summary : null,
        displayName: res.name || null,
        formattedAddress: res.formatted_address || null,
        websiteUri: typeof res.website === "string" ? res.website : null,
        nationalPhoneNumber:
          typeof res.formatted_phone_number === "string" ? res.formatted_phone_number : null,
        googleMapsUri: typeof res.url === "string" ? res.url : null,
      };
      if (!best || placeDetailMetaScore(candidate) > placeDetailMetaScore(best)) best = candidate;
      if (candidate.summary && candidate.rating != null) break;
    }
    return best;
  } catch (e) {
    console.error("fetchLegacyPlaceDetailsBundle:", e?.message);
    return null;
  }
}

function categoryToSearchHint(category) {
  const hints = {
    nightclub: "nightclub",
    bar: "bar",
    restaurant: "restaurant",
    cafe: "cafe",
    coffee: "cafe",
    park: "park",
    museum: "museum",
    bookstore: "bookstore",
    gallery: "art gallery",
    cinema: "cinema",
    theater: "theater",
    theatre: "theater",
    market: "market",
    bakery: "bakery",
    ice_cream: "ice cream",
    scenic: "viewpoint",
    trail: "hiking trail",
    comedy: "comedy club",
    live_music: "live music venue",
    live_performance: "live music venue",
    arcade: "arcade",
    bowling: "bowling alley",
  };
  return hints[(category || "").toLowerCase()] || "";
}

/**
 * Real venue photo from Google Places (New) when lat/lng + name match — avoids generic Unsplash
 * (wrong Chinatown gate for a Korean spot, scoreboard crops for bowling, etc.).
 */
async function tryGoogleHeroPhotoForList(mapQuery, sourceName, lat, lng) {
  if (
    !GOOGLE_PLACES_KEY ||
    GOOGLE_PLACES_KEY === "your_key_here" ||
    GOOGLE_PLACES_KEY === "your_google_key_here"
  ) {
    return null;
  }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const q = String(sourceName || mapQuery || "").trim();
  if (q.length < 2) return null;

  const body = {
    textQuery: q,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 40000,
      },
    },
  };

  try {
    const searchRes = await fetchWithTimeoutMs(
      "https://places.googleapis.com/v1/places:searchText",
      PLACES_DETAIL_FETCH_MS,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
          "X-Goog-FieldMask": "places.displayName,places.photos,places.formattedAddress",
        },
        body: JSON.stringify(body),
      }
    );
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const places = data.places ?? [];
    const withPhotos = places.filter((p) => p.photos && p.photos.length > 0);
    if (!withPhotos.length) return null;

    const strict = withPhotos.filter((p) =>
      placeDisplayNameMatchesQuery(p.displayName, mapQuery, sourceName)
    );
    let pool = strict.length > 0 ? strict : [];
    if (pool.length === 0) {
      const qn = normalizePlaceName(q);
      for (const p of withPhotos) {
        const dn = normalizePlaceName(displayNameText(p.displayName));
        if (qn.length >= 4 && (dn.includes(qn) || (qn.length >= 6 && qn.includes(dn)))) {
          pool.push(p);
        }
      }
    }
    if (pool.length === 0) return null;

    pool.sort((a, b) => (b.photos?.length ?? 0) - (a.photos?.length ?? 0));
    const best = pool[0];
    const photoName = best?.photos?.[0]?.name;
    if (!photoName || typeof photoName !== "string") return null;

    const mediaUrl = new URL(`${photoName}/media`, "https://places.googleapis.com/v1/");
    mediaUrl.searchParams.set("maxWidthPx", "1600");
    mediaUrl.searchParams.set("skipHttpRedirect", "true");

    const mediaRes = await fetchWithTimeoutMs(mediaUrl.toString(), PLACES_DETAIL_FETCH_MS, {
      headers: { "X-Goog-Api-Key": GOOGLE_PLACES_KEY },
    });
    if (!mediaRes.ok) return null;
    const mediaJson = await mediaRes.json().catch(() => null);
    const photoUri = mediaJson?.photoUri ? String(mediaJson.photoUri) : null;
    if (!photoUri || !photoUri.startsWith("http")) return null;
    return {
      photoUrl: photoUri,
      photoAttribution: {
        name: "Google Maps",
        profileUrl: "https://www.google.com/maps",
      },
    };
  } catch (e) {
    console.warn("tryGoogleHeroPhotoForList:", e?.message || e);
    return null;
  }
}

/** List/card hero — Google Places photo when possible, else editorial Unsplash. */
app.get("/place-photo", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query.q;
  const area = req.query.area || "";
  const category = req.query.category || "";
  const sourceName = typeof req.query.sourceName === "string" ? req.query.sourceName : "";
  const mapQuery = typeof q === "string" ? q : "";
  const address = typeof req.query.address === "string" ? req.query.address : "";
  const latQ = req.query.lat;
  const lngQ = req.query.lng;
  const lat = latQ != null && latQ !== "" ? Number(latQ) : null;
  const lng = lngQ != null && lngQ !== "" ? Number(lngQ) : null;
  const refresh =
    typeof req.query.refresh === "string" && req.query.refresh.length > 0
      ? req.query.refresh
      : `${Date.now()}-${Math.random()}`;

  if (!mapQuery || mapQuery.length < 2) {
    return res.json({ photoPipeline: PHOTO_PIPELINE, photoUrl: null, photoAttribution: null });
  }

  const googleHero = await tryGoogleHeroPhotoForList(mapQuery, sourceName, lat, lng);
  if (googleHero?.photoUrl) {
    return res.json({
      photoPipeline: PHOTO_PIPELINE,
      photoUrl: googleHero.photoUrl,
      photoAttribution: googleHero.photoAttribution,
    });
  }

  const key = getUnsplashKey();
  if (!key || key.includes("your_")) {
    console.log("place-photo: set UNSPLASH_ACCESS_KEY for editorial images");
    return res.json({ photoPipeline: PHOTO_PIPELINE, photoUrl: null, photoAttribution: null });
  }

  try {
    const queries = buildEditorialSearchQueries({
      category,
      sourceName,
      mapQuery,
      area,
      address,
    });
    const rejectAlt = getEditorialAltRejectSubstrings({ sourceName, mapQuery, address });
    const { urls, attributions } = await fetchUnsplashEditorial(key, queries.slice(0, 8), {
      maxImages: 1,
      rejectAltSubstrings: rejectAlt,
      seed: `${refresh}::${mapQuery.slice(0, 80)}`,
    });
    const photoUrl = urls[0] ?? null;
    const photoAttribution = attributions[0] ?? null;
    if (photoUrl) console.log("place-photo: editorial OK for", mapQuery.slice(0, 40));
    return res.json({ photoPipeline: PHOTO_PIPELINE, photoUrl, photoAttribution });
  } catch (err) {
    console.error("place-photo error:", err?.message);
    return res.json({ photoPipeline: PHOTO_PIPELINE, photoUrl: null, photoAttribution: null });
  }
});

/**
 * Rich place data for detail screen: multiple photos + Google rating + short summary.
 */
app.get("/place-details", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query.q;
  const area = req.query.area || "";
  const category = req.query.category || "";
  const sourceName = typeof req.query.sourceName === "string" ? req.query.sourceName : "";
  const latQ = req.query.lat;
  const lngQ = req.query.lng;
  const lat = latQ != null && latQ !== "" ? Number(latQ) : null;
  const lng = lngQ != null && lngQ !== "" ? Number(lngQ) : null;
  const hasCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const address = req.query.address || "";
  const hasAddress = address && String(address).length > 2;
  const matchName = sourceName || q;

  const emptyPayload = {
    photoPipeline: PHOTO_PIPELINE,
    photoUrls: [],
    photoAttributions: [],
    rating: null,
    userRatingCount: null,
    summary: null,
    displayName: null,
    formattedAddress: null,
    websiteUri: null,
    phoneNumber: null,
    googleMapsUri: null,
  };

  if (!q || typeof q !== "string" || q.length < 2) return res.json(emptyPayload);

  const refresh =
    typeof req.query.refresh === "string" && req.query.refresh.length > 0
      ? req.query.refresh
      : `${Date.now()}-${Math.random()}`;

  const unsplashKey = getUnsplashKey();
  const editorialPromise =
    unsplashKey && !unsplashKey.includes("your_")
      ? fetchUnsplashEditorial(
          unsplashKey,
          buildEditorialSearchQueries({
            category,
            sourceName,
            mapQuery: q,
            area,
            address,
          }),
          {
            maxImages: 8,
            rejectAltSubstrings: getEditorialAltRejectSubstrings({
              sourceName,
              mapQuery: q,
              address,
            }),
            seed: `${refresh}::${q.slice(0, 80)}`,
          }
        )
      : Promise.resolve({ urls: [], attributions: [] });

  const googleOk =
    GOOGLE_PLACES_KEY &&
    GOOGLE_PLACES_KEY !== "your_key_here" &&
    GOOGLE_PLACES_KEY !== "your_google_key_here";

  let finished = false;
  let slowTimer;
  const end = (payload) => {
    if (finished) return;
    finished = true;
    if (slowTimer) clearTimeout(slowTimer);
    return res.json(payload);
  };
  slowTimer = setTimeout(async () => {
    console.warn("place-details: exceeded 22s — returning partial JSON");
    const editorial = await editorialPromise;
    end({
      ...emptyPayload,
      photoUrls: editorial.urls,
      photoAttributions: editorial.attributions,
    });
  }, 22000);

  try {
    if (!googleOk) {
      const editorial = await editorialPromise;
      return end({
        ...emptyPayload,
        photoUrls: editorial.urls,
        photoAttributions: editorial.attributions,
      });
    }

    const queryVariants = buildPlaceDetailSearchQueries({
      q,
      area,
      category,
      address,
      sourceName,
      hasCoords,
      hasAddress,
    }).slice(0, 4);

    const triedNames = new Set();
    let best = null;
    /** Hard stop so curl -m 20 and phones always get a body (sequential Places calls add up fast). */
    const deadline = Date.now() + 19000;

    outerNew: for (const textQuery of queryVariants) {
      if (Date.now() > deadline) break;
      const places = await placesSearchTextNew(textQuery, lat, lng);
      const candidates = selectPlaceCandidatesFromSearch(places, matchName, q).slice(0, 3);
      for (const place of candidates) {
        if (Date.now() > deadline) break outerNew;
        if (!place?.name || triedNames.has(place.name)) continue;
        triedNames.add(place.name);
        const payload = await fetchNewApiPlaceDetailPayload(place.name);
        if (!payload) continue;
        if (!best) best = payload;
        else if (placeDetailMetaScore(payload) > placeDetailMetaScore(best)) best = payload;
        if (payload.summary && payload.rating != null) {
          best = payload;
          break outerNew;
        }
      }
      if (best?.summary && best?.rating != null) break;
    }

    if (!best) {
      outerLeg: for (const textQuery of queryVariants) {
        if (Date.now() > deadline) break;
        const leg = await fetchLegacyPlaceDetailsBundle(textQuery, matchName, q, lat, lng);
        if (!leg) continue;
        if (!best || placeDetailMetaScore(leg) > placeDetailMetaScore(best)) best = leg;
        if (leg.summary && leg.rating != null) break outerLeg;
      }
    }

    const editorial = await editorialPromise;
    return end({
      photoPipeline: PHOTO_PIPELINE,
      photoUrls: editorial.urls,
      photoAttributions: editorial.attributions,
      rating: best?.rating ?? null,
      userRatingCount: best?.userRatingCount ?? null,
      summary: best?.summary ?? null,
      displayName: best?.displayName ?? null,
      formattedAddress: best?.formattedAddress ?? null,
      websiteUri: best?.websiteUri ?? null,
      phoneNumber: best?.nationalPhoneNumber ?? null,
      googleMapsUri: best?.googleMapsUri ?? null,
    });
  } catch (err) {
    console.error("place-details error:", err?.message);
    try {
      const editorial = await editorialPromise;
      return end({
        ...emptyPayload,
        photoUrls: editorial.urls,
        photoAttributions: editorial.attributions,
      });
    } catch {
      return end(emptyPayload);
    }
  }
});

const OBVIOUS_SPOTS = [
  "Griffith Observatory", "Grand Central Market", "The Last Bookstore",
  "The Comedy Store", "Level8", "Exchange LA", "Cafe Tondo",
  "Code Red", "Chinatown", "Santa Monica Pier", "Venice Beach"
];

async function getAIExpandedPlaces(
  area,
  timeRange,
  mood,
  currentTime,
  hunger = "any",
  userContext = "",
  timeZone = "",
  refresh = ""
) {
  if (!client || !process.env.OPENAI_API_KEY) return [];
  try {
    const timeCtx = getTimeContext(currentTime, timeZone);
    const { weekdayLong: todayName } = getWallParts(currentTime, timeZone);
    const nightOk = isNightlifeTime(currentTime, timeZone);
    const foodHint =
      hunger === "hungry"
        ? " Lean toward restaurants, cafes, dessert spots, and food experiences people actually get excited about. "
        : hunger === "not_hungry"
          ? " Skip food only spots. Lean on entertainment, museums, parks, theaters, walks, and nightlife that is not mainly about eating. "
          : "";
    const timeInstruction = nightOk
      ? ""
      : ` It is ${timeCtx} and still daytime. Skip bars, nightclubs, clubs, raves, cocktails, and drinking. Lean on cafes, restaurants, parks, museums, markets, and bookstores instead.`;
    const lateOut = isLateNightOutHoursFromPayload(currentTime, timeZone);
    const lateInstruction = lateOut
      ? " After 9 PM skip family kid venues and trampoline parks. Lean on late food, bars, live music, comedy, theaters, night walks, and dessert. "
      : "";
    const systemPrompt =
      "You sound like a warm friend who loves this city. You dig up plans people can do tonight, not the same ten TripAdvisor defaults. " +
      "Skip vague hangouts. Mix recurring weeknight scenes with one-off events. Think weekly salsa or bachata nights, improv jams, open mics, themed exhibits, small theater, underground comedy, late museum nights, street food rows, record store listening parties, trivia, jazz rooms, dance studios. " +
      "Avoid leaning on Griffith Observatory, Santa Monica Pier, Venice Boardwalk, The Grove, Grand Central Market, or other ultra obvious LA wallpaper unless the moment truly fits. Prefer specific lesser-known rooms and recurring nights. " +
      "Name real venues when you know them. When you are not sure of hours, say check Instagram or the venue site tonight. " +
      "Never send people grocery shopping as a night out. Skip Trader Joe runs and that kind of errand. " +
      "The user is about to leave the house. At least twelve of the ideas must be something they could realistically start within the next sixty to ninety minutes at this local time, or a late-night venue that is typically open now. " +
      "Do not suggest tomorrow afternoon only plans. Museums and offices that are clearly closed at night are a bad fit unless you note a special after-hours event tonight. " +
      lateInstruction +
      "Shape each line like you are texting a friend. Lead with what is happening, then where, then when if you know it. " +
      timeInstruction + " " +
      "Return JSON only. Shape places as { places: [{ name, title, subtitle, category, reason, durationMinutes, address, mapQuery, kind }] }. " +
      "kind is venue or activity. Use venue when it is a named business. Use activity for creative non-place moves like a late boardwalk walk, neighborhood taco crawl, or stargazing patch. For activity, mapQuery is still a Maps search string and address may be empty. " +
      "Include at least five picks that are clearly tied to today being a specific weekday (for example Monday open mic, Tuesday trivia, Wednesday salsa). Mention the weekday in title or subtitle. " +
      "Include at least four niche or underground style picks that are not the first result on Google. " +
      "Include at least three kind activity rows that are not a single business name. " +
      "Pick categories from comedy, live_music, cinema, museum, special_event, outdoor_event, market, theater, bar, restaurant, park, scenic, sports_event. " +
      "title is the hook. subtitle adds one helpful detail. mapQuery is what someone would type in Maps. " +
      "Never use unnamed. At most one or two bar picks unless the vibe is nightlife. Add times or season when you know them." +
      " Writing rules. Do not use semicolons. Do not use long dashes. Do not use en dashes. Short sentences. Sound human and inviting." +
      foodHint;
    const moodHint = mood && mood.length > 0
      ? ` Mood is ${mood}. ${mood === "calm" ? "Favor nature, galleries, quiet events, stargazing." : mood === "energetic" ? "Favor concerts, sports, nightlife, festivals." : "Mix events and places."}`
      : "";
    const ctx =
      userContext && String(userContext).trim().length > 0
        ? ` Reader context (respect budget, energy, introversion, age): ${String(userContext).trim()} `
        : " ";
    const vary =
      refresh && String(refresh).length > 0
        ? ` This is request id ${String(refresh).slice(0, 24)}. Pick different specific venues and neighborhoods than a generic list. Surprise them. `
        : "";
    const userContent = `Area: ${area}. Today is ${todayName}. Time window: ${timeRange}. Right now: ${timeCtx}.${moodHint}${ctx}` +
      vary +
      `They want to move in the next hour. Give 18 to 22 ideas. At least 12 must be startable tonight within about 90 minutes (doors open, show starts soon, food still serving, or an outdoor walk or beach you can do immediately). ` +
      `At least half should be happening tonight or be a classic weeknight recurring night that fits ${todayName}. ` +
      `At least 8 should be clearly something happening or a weekly room night, not just dinner. ` +
      `Each subtitle is one clear sentence about what to do, when, tickets, or how to double check. Skip vague hype. ` +
      `Spread across neighborhoods from East LA to the Westside to the Valley. Think small rooms, dance nights, comedy jams, oddball museums, live sessions.`;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.12,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });
    const text = response.choices?.[0]?.message?.content;
    if (!text) return [];
    const parsed = JSON.parse(text);
    const places = parsed.places ?? parsed.suggestions ?? [];
    return Array.isArray(places) ? places : [];
  } catch (err) {
    console.error("AI expand error:", err?.message);
    return [];
  }
}

app.post("/expand-moves", async (req, res) => {
  try {
    const { area, timeRange, mood, currentTime, hunger, userContext, timeZone, refresh } =
      req.body;
    const place = area || req.body.place || "Los Angeles";
    const tz = typeof timeZone === "string" ? timeZone : "";
    const refreshId =
      typeof refresh === "string" && refresh.length > 0
        ? refresh
        : typeof refresh === "number"
          ? String(refresh)
          : `${Date.now()}-${Math.random()}`;
    const expanded = await getAIExpandedPlaces(
      place,
      timeRange || "1 hr+",
      mood || "fun",
      currentTime,
      hunger || "any",
      typeof userContext === "string" ? userContext : "",
      tz,
      refreshId
    );
    const nightOk = isNightlifeTime(currentTime, tz);
    const wall = nowFromPayload(currentTime);
    const filtered = expanded.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const title = (p.title || p.name || "").toLowerCase();
      if (name.includes("unnamed") || title.includes("unnamed")) return false;
      if (isGroceryOrErrandName(p.name, p.title)) return false;
      if (
        isLateNightOutHoursFromPayload(currentTime, tz) &&
        isLateNightInappropriateVenue(p.name, p.title, p.category)
      ) {
        return false;
      }
      if (!nightOk) {
        const cat = (p.category || "").toLowerCase();
        if (cat === "nightclub" || cat === "bar") return false;
        if (title.includes("clubbing") || title.includes("rave")) return false;
        if (title.includes("craft cocktails") || title.includes("grab a drink")) return false;
      }
      return true;
    });
    const moves = filtered.map((p) => {
      const isActivity =
        String(p.kind || "").toLowerCase() === "activity" ||
        String(p.kind || "").toLowerCase() === "idea";
      return {
        title: p.title || `Go to ${p.name}`,
        subtitle: p.subtitle || "A specific place worth checking out",
        reason: p.reason || "Suggested for your area.",
        durationMinutes: p.durationMinutes ?? 90,
        kind: isActivity ? "generic" : "place",
        actionType: "maps",
        sourceName: p.name || p.title || "",
        address: p.address || "",
        mapQuery: p.mapQuery || p.name || p.title || "",
        externalUrl: "",
        distanceText: "",
        priceText: "$$",
        category: p.category || "other",
      };
    });
    res.json({ moves });
  } catch (err) {
    console.error("Expand error:", err);
    res.json({ moves: [] });
  }
});

app.post("/debug-location", (req, res) => {
  const p = req.body;
  res.json({
    received: {
      lat: p.lat,
      lon: p.lon,
      place: p.place,
      hasLat: p.lat != null,
      hasLon: p.lon != null,
    },
  });
});

app.post("/enrich-drive-times", async (req, res) => {
  try {
    const { candidates, lat, lng, area } = req.body;
    const originLat = lat != null ? Number(lat) : null;
    const originLng = (lng != null ? Number(lng) : req.body.lon != null ? Number(req.body.lon) : null);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.json({ candidates });
    }
    if (originLat == null || originLng == null || Number.isNaN(originLat) || Number.isNaN(originLng)) {
      return res.json({ candidates });
    }
    const areaStr = area || "";
    const enriched = await Promise.all(
      candidates.map(async (c) => {
        if (!needsDriveTimeEnrichment(c.distanceText)) return c;
        const destination = getDriveDestination(c, areaStr);
        if (!destination) return c;
        const driveTime = await fetchDriveDuration(originLat, originLng, destination);
        return { ...c, distanceText: driveTime || estimateDriveTimeFromDistance(c.distanceText) };
      })
    );
    res.json({ candidates: enriched });
  } catch (err) {
    console.error("Enrich drive times error:", err?.message);
    res.json({ candidates: req.body.candidates || [] });
  }
});

app.post("/generate-moves", async (req, res) => {
  try {
    const payload = req.body;
    const lat =
      payload.lat != null ? Number(payload.lat) :
      payload.latitude != null ? Number(payload.latitude) : null;
    const lng =
      payload.lon != null ? Number(payload.lon) :
      payload.lng != null ? Number(payload.lng) :
      payload.longitude != null ? Number(payload.longitude) : null;
    const timeRange = payload.timeRange || "1 hr+";

    console.log("REQUEST RECEIVED - lat:", lat, "lng:", lng, "place:", payload.place);

    let candidates;
    if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      const wall = nowFromPayload(payload.currentTime);
      const nightOk = isNightlifeTime(payload.currentTime, payload.timeZone);
      console.log("Fetching Overpass for", lat, lng, "nightlifeOk:", nightOk);
      const overpassCandidates = await fetchOverpassPlaces(lat, lng, timeRange, nightOk);
      console.log("Overpass raw count:", overpassCandidates.length);
      candidates = hardFilterCandidates({ ...payload, candidates: overpassCandidates });
      console.log("After filter:", candidates.length, candidates.map((c) => c.exactTitle));

      candidates = await enrichTheatreCinemaCandidates(
        candidates,
        payload.place || payload.location || "Los Angeles",
        lat,
        lng,
        wall.getTime()
      );
      candidates = candidates.filter((c) => {
        if (isGroceryOrErrandName(c.sourceName, c.exactTitle)) return false;
        if (
          isLateNightOutHoursFromPayload(payload.currentTime, payload.timeZone) &&
          isLateNightInappropriateVenue(c.sourceName, c.exactTitle, c.category)
        ) {
          return false;
        }
        return true;
      });

      // Don't show theatre/cinema without specific show names
      candidates = candidates.filter((c) => {
        const isTheatreCinema = ["theatre", "theater", "cinema"].includes(c.category);
        const hasGeneric = (c.exactTitle || "").includes("see what's on") || (c.exactTitle || "").includes("see what's playing");
        return !(isTheatreCinema && hasGeneric);
      });

      // No clubbing at noon
      if (!nightOk) {
        candidates = candidates.filter((c) => {
          if (c.category === "nightclub" || c.category === "bar") return false;
          const t = (c.exactTitle || "").toLowerCase();
          if (t.includes("clubbing") || t.includes("go clubbing")) return false;
          if (t.includes("craft cocktails") || t.includes("grab a drink")) return false;
          return true;
        });
      }

      if (candidates.length > 0) {
        const locationStr = payload.location || payload.place || "";
        const toEnrich = candidates.slice(0, 6);
        const enriched = await Promise.all(
          toEnrich.map(async (c) => {
            const dist = c.distanceText || "";
            if (!needsDriveTimeEnrichment(dist)) return c;
            const destination = getDriveDestination(c, locationStr);
            if (!destination) return c;
            const driveTime = await fetchDriveDuration(lat, lng, destination);
            return { ...c, distanceText: driveTime || estimateDriveTimeFromDistance(dist) };
          })
        );
        const directMoves = enriched.map((c) => ({
          title: c.exactTitle,
          subtitle: c.subtitle || "A real place near you",
          reason: `About ${c.distanceText}. Specific and doable.`,
          durationMinutes: c.durationMinutes,
          kind: c.kind,
          actionType: c.actionType,
          sourceName: c.sourceName,
          address: c.address,
          mapQuery: c.mapQuery,
          externalUrl: c.externalUrl || "",
          distanceText: c.distanceText || "",
          priceText: c.priceText || "$$",
          category: c.category,
        }));
        console.log("Returning direct Overpass moves:", directMoves.length);
        return res.json({ moves: directMoves });
      }
    }

    candidates = hardFilterCandidates(payload);
    console.log("Candidates (client/fallback):", candidates.length);

    if (candidates.length > 0 && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      const locationStr = payload.location || payload.place || "";
      candidates = await Promise.all(
        candidates.map(async (c) => {
          if (!needsDriveTimeEnrichment(c.distanceText)) return c;
          const destination = getDriveDestination(c, locationStr);
          if (!destination) return c;
          const driveTime = await fetchDriveDuration(lat, lng, destination);
          return { ...c, distanceText: driveTime || estimateDriveTimeFromDistance(c.distanceText) };
        })
      );
    }

    const location = payload.location || payload.place || "near you";

    const FALLBACK_MOVES = [
      {
        title: "The Comedy Store on Sunset has a show tonight",
        subtitle: "Iconic Hollywood comedy club—check their lineup for tonight's acts",
        reason: "One of the best comedy venues in the world. Worth leaving the couch for.",
        durationMinutes: 120,
        kind: "place",
        actionType: "tickets",
        sourceName: "The Comedy Store",
        address: "8433 Sunset Blvd, West Hollywood, CA",
        mapQuery: "The Comedy Store",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$$",
        category: "comedy",
      },
      {
        title: "Go clubbing at Level8",
        subtitle: "Downtown LA rooftop club with skyline views",
        reason: "Specific venue, specific plan. Better than scrolling.",
        durationMinutes: 180,
        kind: "place",
        actionType: "maps",
        sourceName: "Level8",
        address: "888 S Olive St, Los Angeles, CA",
        mapQuery: "Level8 Los Angeles",
        externalUrl: "",
        distanceText: "Downtown LA",
        priceText: "$$",
        category: "nightclub",
      },
      {
        title: "Visit Griffith Observatory for sunset",
        subtitle: "Iconic LA destination with a real payoff",
        reason: "Best in the evening. Specific and memorable.",
        durationMinutes: 90,
        kind: "place",
        actionType: "maps",
        sourceName: "Griffith Observatory",
        address: "2800 E Observatory Rd, Los Angeles, CA",
        mapQuery: "Griffith Observatory",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$",
        category: "scenic",
      },
    ];

    if (candidates.length === 0) {
      const timeRange = payload.timeRange || "1 hr+";
      let filtered =
        timeRange === "1 hr+"
          ? FALLBACK_MOVES.filter((m) => m.durationMinutes >= 60)
          : FALLBACK_MOVES;
      if (!isNightlifeTime(payload.currentTime, payload.timeZone)) {
        filtered = filtered.filter((m) => !m.title.toLowerCase().includes("clubbing"));
      }
      if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        const enriched = await Promise.all(
          filtered.map(async (m) => {
            if (!needsDriveTimeEnrichment(m.distanceText)) return m;
            const destination = getDriveDestination(m, payload.place || payload.location || "");
            if (!destination) return m;
            const driveTime = await fetchDriveDuration(lat, lng, destination);
            return { ...m, distanceText: driveTime || estimateDriveTimeFromDistance(m.distanceText) };
          })
        );
        filtered = enriched;
      }
      return res.json({
        moves: filtered.length > 0 ? filtered : [FALLBACK_MOVES[0]],
      });
    }

    const systemPrompt =
      "You help someone pick a real night instead of scrolling. Only use the candidates in the message. Do not invent new venues or trails or backup ideas. " +
      "Every title must repeat the candidate exactTitle word for word. " +
      "Skip vague titles like go to a museum or find a sunset spot. " +
      "When the list has events, ticketed shows, or seasonal stuff, lean that way. Comedy, live music, theater, and sports count. " +
      "For longer time windows, pick plans that feel worth getting dressed for. " +
      "subtitle is one short sentence about what you actually do, plus anything practical like hours, tickets, waits, dress code. " +
      "Skip filler like fun named venue, clear plan, worth leaving for, good vibes. " +
      "reason is one warm sentence on why this fits right now. " +
      "Return 3 to 6 suggestions. If the list has any event style picks, include at least one. " +
      "Sound like a close friend who gets your taste. " +
      "Do not use semicolons. Do not use em dashes or en dashes. Use short friendly sentences. " +
      "Return JSON with a suggestions array. Each item needs candidateId, title, subtitle, reason, durationMinutes, kind, actionType, sourceName, address, mapQuery, externalUrl.";

    const userContent = JSON.stringify({
      timeRange: payload.timeRange,
      mood: payload.mood || payload.intent,
      location,
      candidates,
    });

    if (!client) {
      console.error("OpenAI client not configured - missing OPENAI_API_KEY");
      return res.json({ moves: FALLBACK_MOVES.slice(0, 3) });
    }

    let parsed;
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) throw new Error("No response content");
      parsed = JSON.parse(text);
    } catch (apiError) {
      console.error("OpenAI API error:", apiError?.message || apiError);
      return res.json({ moves: FALLBACK_MOVES.slice(0, 3) });
    }

    const moves = (parsed.suggestions || []).map((s) => {
      const candidate = candidates.find((c) => c.id === s.candidateId);
      if (!candidate) {
        return {
          ...s,
          distanceText: "",
          priceText: "",
        };
      }

      return {
        ...s,
        title: candidate.exactTitle,
        subtitle: candidate.dateText
          ? (candidate.subtitle || s.subtitle)
          : s.subtitle,
        durationMinutes: candidate.durationMinutes,
        kind: candidate.kind,
        actionType: candidate.actionType,
        sourceName: candidate.sourceName,
        address: candidate.address,
        mapQuery: candidate.mapQuery,
        externalUrl: candidate.externalUrl,
        distanceText: candidate.distanceText ?? "",
        priceText: candidate.priceText ?? "$$",
        category: candidate.category,
        dateText: candidate.dateText || "",
        hoursSummary: candidate.hoursSummary || "",
      };
    });

    console.log("FINAL MOVES:", JSON.stringify(moves, null, 2));
    res.json({ moves });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.json({
      moves: [
        {
          candidateId: "",
          title: "The Comedy Store on Sunset has a show tonight",
          subtitle: "Iconic Hollywood comedy club—check their lineup for tonight's acts",
          reason: "One of the best comedy venues in the world. Worth leaving the couch for.",
          durationMinutes: 120,
          kind: "place",
          actionType: "tickets",
          sourceName: "The Comedy Store",
          address: "8433 Sunset Blvd, West Hollywood, CA",
          mapQuery: "The Comedy Store",
          externalUrl: "",
          distanceText: "Drive depending on traffic",
          priceText: "$$",
        },
        {
          candidateId: "",
          title: "Go clubbing at Level8",
          subtitle: "Downtown LA rooftop club with skyline views",
          reason: "Specific venue, specific plan. Better than scrolling.",
          durationMinutes: 180,
          kind: "place",
          actionType: "maps",
          sourceName: "Level8",
          address: "888 S Olive St, Los Angeles, CA",
          mapQuery: "Level8 Los Angeles",
          externalUrl: "",
          distanceText: "Downtown LA",
          priceText: "$$",
        },
      ],
    });
  }
});

/** GPT-4o orchestration: Ticketmaster + Places + weather → ranked cards + Unsplash heroes */
app.post("/concierge-recommendations", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const out = await runConciergeRecommendations(req.body || {});
    res.json(out);
  } catch (err) {
    console.error("concierge-recommendations:", err?.message || err);
    res.status(422).json({
      error: String(err?.message || err),
      suggestions: [],
      meta: null,
    });
  }
});

app.post("/concierge-ahead", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const out = await runConciergeAheadRecommendations(req.body || {});
    res.json(out);
  } catch (err) {
    console.error("concierge-ahead:", err?.message || err);
    res.status(422).json({
      error: String(err?.message || err),
      suggestions: [],
      meta: null,
    });
  }
});

app.post("/concierge-detail", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const out = await runConciergeDetail(req.body || {});
    res.json(out);
  } catch (err) {
    console.error("concierge-detail:", err?.message || err);
    res.status(422).json({
      error: String(err?.message || err),
      detail: null,
    });
  }
});

app.post("/concierge-detail/quick", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const out = await runConciergeDetailQuick(req.body || {});
    res.json(out);
  } catch (err) {
    console.error("concierge-detail/quick:", err?.message || err);
    res.status(422).json({
      error: String(err?.message || err),
      detail: null,
    });
  }
});

app.post("/concierge-detail/narrative", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const out = await runConciergeDetailNarrative(req.body || {});
    res.json(out);
  } catch (err) {
    console.error("concierge-detail/narrative:", err?.message || err);
    res.status(422).json({
      error: String(err?.message || err),
      detail: null,
    });
  }
});

const PORT = process.env.PORT || 3001;
/** Bind IPv6 `::` so `curl http://localhost:PORT` (often ::1) hits this server. `0.0.0.0` is IPv4-only and another process can own ::1:PORT — same port, wrong app → "Cannot GET /place-details". */
const LISTEN_HOST = process.env.LISTEN_HOST || "::";
app.listen(PORT, LISTEN_HOST, () => {
  const base = `http://localhost:${PORT}`;
  console.log("AI move server listening on", PORT, `(bind ${LISTEN_HOST})`);
  console.log(
    "Try:",
    `${base}/health`,
    `${base}/api-status`,
    `${base}/unsplash-ping`,
    `${base}/photo-test`,
    `${base}/place-details?q=test&sourceName=test`
  );
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your"));
  const hasGoogle = !!(process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY);
  const googleValid = hasGoogle && !["your_key_here", "your_google_key_here"].includes(
    (process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim()
  );
  const us = getUnsplashKey();
  console.log("API keys:", {
    OpenAI: hasOpenAI ? "OK" : "MISSING or placeholder - add OPENAI_API_KEY to server/.env",
    "Google Places": googleValid ? "OK" : "MISSING or placeholder - add GOOGLE_PLACES_API_KEY to server/.env",
    Unsplash: us.length ? `OK (${us.length} chars)` : "MISSING — add UNSPLASH_ACCESS_KEY to server/.env",
  });
});