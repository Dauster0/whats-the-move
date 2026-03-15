import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  const openai = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your");
  const google = (process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim();
  const googleValid = google && !["your_key_here", "your_google_key_here"].includes(google);
  const ticketmaster = (process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY || "").trim();
  const showtimes = (process.env.INTERNATIONAL_SHOWTIMES_API_KEY || process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY || "").trim();
  const unsplash = (process.env.UNSPLASH_ACCESS_KEY || process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY || "").trim();
  let openaiOk = false, googleOk = false, ticketmasterOk = false, showtimesOk = false;
  if (openai) { try { const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }); openaiOk = r.ok; } catch {} }
  if (googleValid) { try { const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=test&key=${google}`); const d = await r.json(); googleOk = d.status !== "REQUEST_DENIED" && d.status !== "INVALID_REQUEST"; } catch {} }
  if (ticketmaster && !ticketmaster.includes("your_")) { try { const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${ticketmaster}&size=1`); ticketmasterOk = r.ok; } catch {} }
  if (showtimes && !showtimes.includes("your")) { try { const r = await fetch("https://api.internationalshowtimes.com/v4/cinemas", { headers: { "X-API-Key": showtimes } }); showtimesOk = r.ok; } catch {} }
  res.json({ openai: openaiOk ? "OK" : "FAIL or missing", google: googleOk ? "OK" : "FAIL or missing", ticketmaster: ticketmaster ? (ticketmasterOk ? "OK" : "FAIL") : "not configured", showtimes: showtimes ? (showtimesOk ? "OK" : "FAIL") : "not configured", unsplash: unsplash && !unsplash.includes("your") ? "configured" : "not configured" });
});

app.get("/api-status", async (req, res) => {
  const openai = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your");
  const google = (process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim();
  const googleValid = google && !["your_key_here", "your_google_key_here"].includes(google);
  const ticketmaster = (process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY || "").trim();
  const showtimes = (process.env.INTERNATIONAL_SHOWTIMES_API_KEY || process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY || "").trim();
  const unsplash = (process.env.UNSPLASH_ACCESS_KEY || process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY || "").trim();
  let openaiOk = false, googleOk = false, ticketmasterOk = false, showtimesOk = false;
  if (openai) { try { const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }); openaiOk = r.ok; } catch {} }
  if (googleValid) { try { const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=test&key=${google}`); const d = await r.json(); googleOk = d.status !== "REQUEST_DENIED" && d.status !== "INVALID_REQUEST"; } catch {} }
  if (ticketmaster && !ticketmaster.includes("your_")) { try { const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${ticketmaster}&size=1`); ticketmasterOk = r.ok; } catch {} }
  if (showtimes && !showtimes.includes("your")) { try { const r = await fetch("https://api.internationalshowtimes.com/v4/cinemas", { headers: { "X-API-Key": showtimes } }); showtimesOk = r.ok; } catch {} }
  res.json({ openai: openaiOk ? "OK" : "FAIL or missing", google: googleOk ? "OK" : "FAIL or missing", ticketmaster: ticketmaster ? (ticketmasterOk ? "OK" : "FAIL") : "not configured", showtimes: showtimes ? (showtimesOk ? "OK" : "FAIL") : "not configured", unsplash: unsplash && !unsplash.includes("your") ? "configured" : "not configured" });
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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  return {
    id: place.id,
    kind: "place",
    category,
    exactTitle,
    sourceName: place.name,
    subtitle: "A real place near you",
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
  if (!TICKETMASTER_KEY || !keyword || keyword.length < 2) return null;
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_KEY);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("size", "5");
    url.searchParams.set("sort", "date,asc");
    if (lat != null && lng != null) {
      url.searchParams.set("latlong", `${lat},${lng}`);
      url.searchParams.set("radius", "30");
      url.searchParams.set("unit", "miles");
    } else if (area) {
      url.searchParams.set("city", area);
    }
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const events = data?._embedded?.events ?? [];
    return events[0] ?? null;
  } catch {
    return null;
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

function formatEventTime(dateStr) {
  if (!dateStr) return "Later today";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Later today";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function searchEventsForVenue(venueName, area, lat, lng) {
  if (!venueName || venueName.length < 3) return null;
  const keywordsToTry = [
    venueName,
    venueName.replace(/\s+(Theater|Theatre|Cinema)\s*$/i, "").trim(),
    venueName.split(/\s+/).slice(0, 3).join(" "),
    venueName.split(/\s+/).slice(0, 2).join(" "),
  ].filter((k) => k.length >= 3);
  const seen = new Set();
  const uniqueKeywords = keywordsToTry.filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const keyword of uniqueKeywords) {
    const event = await fetchEventsForKeyword(keyword, area, lat, lng);
    if (!event) continue;
    const eventVenue = event?._embedded?.venues?.[0]?.name ?? "";
    if (venueNameMatchesEvent(venueName, eventVenue)) {
      const eventName = event.name ?? "";
      if (!eventName || eventName === "Live event") continue;
      const venue = event?._embedded?.venues?.[0];
      return {
        name: eventName,
        startTimeText: formatEventTime(event?.dates?.start?.dateTime),
        url: event?.url,
      };
    }
  }
  return null;
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

async function enrichTheatreCinemaCandidates(candidates, area, lat, lng) {
  const out = [...candidates];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const isTheatreOrCinema = (c.category === "theater" || c.category === "theatre" || c.category === "cinema") &&
      (c.exactTitle?.includes("see what's") || c.exactTitle?.includes("for a show") || c.exactTitle?.includes("for a movie"));
    if (!isTheatreOrCinema) continue;
    let enriched = false;
    const event = await searchEventsForVenue(c.sourceName, area, lat, lng);
    if (event && event.name) {
      out[i] = {
        ...c,
        exactTitle: event.startTimeText
          ? `${c.sourceName} — ${event.name} at ${event.startTimeText}`
          : `${c.sourceName} — ${event.name}`,
        subtitle: event.startTimeText ? `${event.name} — ${event.startTimeText}` : c.subtitle,
        externalUrl: event.url || c.externalUrl,
      };
      enriched = true;
    }
    if (!enriched && lat != null && lng != null) {
      const movie = await searchMovieShowtimesForVenue(c.sourceName, area, lat, lng);
      if (movie && movie.movieName) {
        out[i] = {
          ...c,
          exactTitle: movie.startTimeText
            ? `${c.sourceName} — ${movie.movieName} at ${movie.startTimeText}`
            : `${c.sourceName} — ${movie.movieName}`,
          subtitle: movie.startTimeText ? `${movie.movieName} — ${movie.startTimeText}` : c.subtitle,
          externalUrl: movie.url || c.externalUrl,
        };
      }
    }
  }
  return out;
}

function hardFilterCandidates(payload) {
  const timeRange = payload.timeRange;
  const raw = Array.isArray(payload.candidates) ? payload.candidates : [];

  let filtered = raw.filter(
    (c) => c && c.exactTitle && c.sourceName && c.kind && c.durationMinutes
  );

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
  if (!isNightlifeTime(payload.currentTime)) {
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
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

function pickBestPhoto(photos) {
  if (!photos || photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => {
    const areaA = (a.widthPx || a.width || 0) * (a.heightPx || a.height || 0);
    const areaB = (b.widthPx || b.width || 0) * (b.heightPx || b.height || 0);
    return areaB - areaA;
  });
  return sorted[0];
}

async function fetchPhotoUnsplash(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY || process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;
  if (!key || key.includes("your_")) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
    if (!r.ok) return null;
    const data = await r.json();
    const results = data?.results ?? [];
    const best = results.find((p) => p.urls?.regular) || results[0];
    const imgUrl = best?.urls?.regular || best?.urls?.small;
    return imgUrl ? `${imgUrl}?w=1200&q=80` : null;
  } catch {
    return null;
  }
}

async function fetchPhotoLegacyApi(query) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_KEY}`;
    const searchRes = await fetch(url);
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    if (data?.status === "REQUEST_DENIED" || data?.status === "OVER_QUERY_LIMIT") {
      console.error("Places legacy error:", data?.status, data?.error_message);
      return null;
    }
    const results = data?.results ?? [];
    const first = results[0];
    const photos = first?.photos ?? [];
    const best = pickBestPhoto(photos);
    const photoRef = best?.photo_reference || photos[0]?.photo_reference;
    if (!photoRef) return null;
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${GOOGLE_PLACES_KEY}`;
    const imgRes = await fetch(photoUrl, { method: "HEAD", redirect: "follow" });
    return imgRes.ok ? imgRes.url : photoUrl;
  } catch (e) {
    console.error("Legacy photo fetch error:", e?.message);
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

app.get("/place-photo", async (req, res) => {
  const q = req.query.q;
  const area = req.query.area || "";
  const category = req.query.category || "";
  let searchQuery = area && typeof area === "string" && area.length > 1
    ? `${q} ${area}`.trim()
    : q;
  const hint = categoryToSearchHint(category);
  if (hint) {
    searchQuery = `${hint} ${q} ${area}`.trim();
  } else if (area) {
    searchQuery = `${q} ${area}`.trim();
  }
  console.log("Place photo request:", searchQuery);
  if (!q || typeof q !== "string" || q.length < 2) {
    return res.json({ photoUrl: null });
  }
  if (!GOOGLE_PLACES_KEY || GOOGLE_PLACES_KEY === "your_key_here" || GOOGLE_PLACES_KEY === "your_google_key_here") {
    console.log("Place photo: no valid API key");
    return res.json({ photoUrl: null });
  }
  let photoUrl = null;
  try {
    photoUrl = await fetchPhotoUnsplash(searchQuery);
    if (!photoUrl) {
      const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
        },
        body: JSON.stringify({ textQuery: searchQuery }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const places = searchData.places ?? [];
        const first = places[0];
        const photos = first?.photos ?? [];
        const best = pickBestPhoto(photos);
        const photoName = best?.name || photos[0]?.name;
        if (photoName) {
          const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${GOOGLE_PLACES_KEY}&skipHttpRedirect=true`;
          const mediaRes = await fetch(mediaUrl);
          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            photoUrl = mediaData.photoUri ?? null;
          }
        }
      } else {
        const errBody = await searchRes.text();
        console.error("Places API (New) error:", searchRes.status, errBody.slice(0, 200));
      }
      if (!photoUrl) {
        photoUrl = await fetchPhotoLegacyApi(searchQuery);
      }
    }
    if (photoUrl) {
      console.log("Place photo OK:", searchQuery);
    } else {
      console.log("Place photo: no result for", searchQuery);
    }
  } catch (err) {
    console.error("Place photo error:", err?.message);
    if (!photoUrl) photoUrl = await fetchPhotoLegacyApi(searchQuery);
  }
  res.json({ photoUrl });
});

function isNightlifeTime(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const hour = d.getHours();
  return hour >= 18 || hour < 3; // 6pm–3am
}

function getTimeContext(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = days[d.getDay()];
  const h = d.getHours();
  const m = d.getMinutes();
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  return `${day} ${time}`;
}

const OBVIOUS_SPOTS = [
  "Griffith Observatory", "Grand Central Market", "The Last Bookstore",
  "The Comedy Store", "Level8", "Exchange LA", "Cafe Tondo",
  "Code Red", "Chinatown", "Santa Monica Pier", "Venice Beach"
];

async function getAIExpandedPlaces(area, timeRange, mood, currentTime) {
  if (!client || !process.env.OPENAI_API_KEY) return [];
  try {
    const timeCtx = getTimeContext(currentTime);
    const nightOk = isNightlifeTime(currentTime);
    const timeInstruction = nightOk
      ? ""
      : `CRITICAL: It is ${timeCtx}—daytime. Do NOT suggest bars, nightclubs, clubs, raves, cocktails, or drinking. Suggest cafes, restaurants, parks, museums, markets, bookstores, etc.`;
    const systemPrompt =
      "You suggest ENTICING moves—what's actually happening, not generic 'go here for a drink'. " +
      "Format: '[Venue] has [specific thing] at [time]' or '[Venue] — [concrete, descriptive reason to go]'. " +
      "Examples: 'Cafe Tondo has a free DJ at 10 pm tonight', 'The Edison has live jazz on Saturdays', " +
      "'Grand Central Market has 40+ vendors—dinner and people-watching', 'Republique — French-inspired brunch and pastries'. " +
      "NEVER use generic phrases like 'solid dinner spot', 'good vibes', 'worth leaving for'. Be SPECIFIC: cuisine type, ambiance, " +
      "what makes it unique (rooftop views, live music, trivia night, secret garden, etc.). Real names only. " +
      timeInstruction + " " +
      "Return valid JSON: { places: [{ name, title, subtitle, category, reason, durationMinutes, address, mapQuery }] }. " +
      "title: the enticing line (venue + specific descriptor). subtitle: extra detail. mapQuery: venue name for Maps. " +
      "Never 'unnamed'. Vary—max 1–2 bars. Include times when you know them.";
    const moodHint = mood && mood.length > 0
      ? ` Vibe: ${mood}—prefer ${mood === "calm" ? "cafes, parks, bookstores, galleries" : mood === "energetic" ? "live music, bars, nightlife, markets" : "a mix"}.`
      : "";
    const userContent = `Area: ${area}. Time: ${timeRange}. Current: ${timeCtx}.${moodHint} ` +
      `Suggest 15–18 places with ENTICING titles—what's on tonight, what makes each worth leaving for. Specific events, not generic activities. ` +
      `Vary your picks each time—include hidden gems, different neighborhoods, and a mix of well-known and lesser-known spots.`;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
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
    const { area, timeRange, mood, currentTime } = req.body;
    const place = area || req.body.place || "Los Angeles";
    const expanded = await getAIExpandedPlaces(place, timeRange || "1 hr+", mood || "fun", currentTime);
    const nightOk = isNightlifeTime(currentTime);
    const filtered = expanded.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const title = (p.title || p.name || "").toLowerCase();
      if (name.includes("unnamed") || title.includes("unnamed")) return false;
      if (!nightOk) {
        const cat = (p.category || "").toLowerCase();
        if (cat === "nightclub" || cat === "bar") return false;
        if (title.includes("clubbing") || title.includes("rave")) return false;
        if (title.includes("craft cocktails") || title.includes("grab a drink")) return false;
      }
      return true;
    });
    const moves = filtered.map((p) => ({
      title: p.title || `Go to ${p.name}`,
      subtitle: p.subtitle || "A specific place worth checking out",
      reason: p.reason || "Suggested for your area.",
      durationMinutes: p.durationMinutes ?? 90,
      kind: "place",
      actionType: "maps",
      sourceName: p.name || "",
      address: p.address || "",
      mapQuery: p.mapQuery || p.name || "",
      externalUrl: "",
      distanceText: "",
      priceText: "$$",
      category: p.category || "other",
    }));
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
      const nightOk = isNightlifeTime(payload.currentTime);
      console.log("Fetching Overpass for", lat, lng, "nightlifeOk:", nightOk);
      const overpassCandidates = await fetchOverpassPlaces(lat, lng, timeRange, nightOk);
      console.log("Overpass raw count:", overpassCandidates.length);
      candidates = hardFilterCandidates({ ...payload, candidates: overpassCandidates });
      console.log("After filter:", candidates.length, candidates.map((c) => c.exactTitle));

      candidates = await enrichTheatreCinemaCandidates(
        candidates,
        payload.place || payload.location || "Los Angeles",
        lat,
        lng
      );

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
      if (!isNightlifeTime(payload.currentTime)) {
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
      "You generate high-quality real-world alternatives to passive scrolling. " +
      "Choose from the provided candidates only. " +
      "Do not invent venues, places, trails, events, or generic backup ideas. " +
      "Every suggestion title must use the candidate exactTitle verbatim. " +
      "Never output vague titles like 'go to a museum', 'go see a movie tonight', 'find a sunset spot', or 'go for a walk'. " +
      "For 1 hr+ requests, only pick things genuinely worth leaving for. " +
      "Return 3 to 6 suggestions. " +
      "Write like a smart, tasteful friend. " +
      "Return valid JSON with a 'suggestions' array. Each suggestion must have: candidateId, title (use exactTitle from candidate), subtitle, reason, durationMinutes, kind, actionType, sourceName, address, mapQuery, externalUrl.";

    const userContent = JSON.stringify({
      timeRange: payload.timeRange,
      mood: payload.mood || payload.intent,
      location,
      candidates,
    });

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("AI move server running on port", PORT);
  console.log("API status: http://localhost:3001/ or http://localhost:3001/api-status");
  console.log("Photo test: http://localhost:3001/photo-test");
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your"));
  const hasGoogle = !!(process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY);
  const googleValid = hasGoogle && !["your_key_here", "your_google_key_here"].includes(
    (process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "").trim()
  );
  console.log("API keys:", {
    OpenAI: hasOpenAI ? "OK" : "MISSING or placeholder - add OPENAI_API_KEY to server/.env",
    "Google Places": googleValid ? "OK" : "MISSING or placeholder - add GOOGLE_PLACES_API_KEY to server/.env",
  });
});