/**
 * Editorial imagery for the app — curated Unsplash searches by vibe/category.
 * We intentionally do NOT use Google Places business photos (storefronts, user uploads,
 * old promo posters) for hero/detail imagery.
 */

const UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos";

// ─── In-memory query cache ────────────────────────────────────────────────────
// Resets on server restart. Prevents burning the 50 req/hr free-tier limit.
const _queryCache = new Map(); // query → { photos: RawPhoto[], ts: number }
const CACHE_TTL_MS = 55 * 60 * 1000; // 55 min (slightly under the 1-hr Unsplash window)

function _cacheGet(query) {
  const entry = _queryCache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _queryCache.delete(query); return null; }
  return entry.photos;
}

function _cacheSet(query, photos) {
  _queryCache.set(query, { photos, ts: Date.now() });
}

// ─── Category fallback images ─────────────────────────────────────────────────
// Used when Unsplash returns 403 (rate limit). Direct CDN URLs — no API call needed.
const CATEGORY_FALLBACKS = {
  food:        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=2400&q=90&fm=jpg&fit=max&auto=format",
  restaurant:  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=2400&q=90&fm=jpg&fit=max&auto=format",
  cafe:        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=2400&q=90&fm=jpg&fit=max&auto=format",
  coffee:      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=2400&q=90&fm=jpg&fit=max&auto=format",
  event:       "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=2400&q=90&fm=jpg&fit=max&auto=format",
  live_music:  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=2400&q=90&fm=jpg&fit=max&auto=format",
  concert:     "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=2400&q=90&fm=jpg&fit=max&auto=format",
  music:       "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=2400&q=90&fm=jpg&fit=max&auto=format",
  comedy:      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=2400&q=90&fm=jpg&fit=max&auto=format",
  sports:      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=2400&q=90&fm=jpg&fit=max&auto=format",
  stadium:     "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=2400&q=90&fm=jpg&fit=max&auto=format",
  bar:         "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=2400&q=90&fm=jpg&fit=max&auto=format",
  nightlife:   "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=2400&q=90&fm=jpg&fit=max&auto=format",
  nightclub:   "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=2400&q=90&fm=jpg&fit=max&auto=format",
  theater:     "https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=2400&q=90&fm=jpg&fit=max&auto=format",
  theatre:     "https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=2400&q=90&fm=jpg&fit=max&auto=format",
  cinema:      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=2400&q=90&fm=jpg&fit=max&auto=format",
  movie:       "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=2400&q=90&fm=jpg&fit=max&auto=format",
  experience:  "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=2400&q=90&fm=jpg&fit=max&auto=format",
  outdoors:    "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=2400&q=90&fm=jpg&fit=max&auto=format",
  park:        "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=2400&q=90&fm=jpg&fit=max&auto=format",
  default:     "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=2400&q=90&fm=jpg&fit=max&auto=format",
};

function getCategoryFallbackUrl(category) {
  const c = String(category || "").toLowerCase().replace(/[^a-z_]/g, "_");
  return (
    CATEGORY_FALLBACKS[c] ||
    Object.entries(CATEGORY_FALLBACKS).find(([k]) => c.includes(k))?.[1] ||
    CATEGORY_FALLBACKS.default
  );
}

function hashStringToSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — deterministic per refresh string (client or server). */
function mulberry32(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates — `rng()` defaults to Math.random. */
function shuffleInPlace(arr, rng = Math.random) {
  const rand = typeof rng === "function" ? rng : () => rng;
  const a = arr;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * USC / campus cinemas (e.g. Norris) were getting generic "LA" or Hollywood landmark shots
 * (El Capitan, Walk of Fame) because Unsplash ties "Los Angeles theater" to Hollywood.
 */
/** Grand Central Market etc. are tourist_attractions — Unsplash "LA scenic" hits beach skylines. */
function isLandmarkIndoorFoodHall(name) {
  const n = String(name || "").toLowerCase();
  return (
    /\bgrand central market\b/.test(n) ||
    /\banaheim packing (house|district)\b/.test(n) ||
    /\bmercado la paloma\b/.test(n)
  );
}

/**
 * Stadiums and arenas (any US city) — structural names only, no team-specific labels.
 * Avoid distant skyline / trail overlook hero shots.
 */
function isStadiumOrSportsVenue(name) {
  const n = String(name || "").toLowerCase();
  return (
    /\b(stadium|ballpark|arena|coliseum|speedway|racetrack|dome)\b/.test(n) ||
    /\b(sports complex|events center|event center)\b/.test(n) ||
    /\b(nfl|mlb|nba|mls|nhl|wnba|nwsl)\b.*\b(game|stadium|arena|field)\b/.test(n)
  );
}

/**
 * Symphony / classical venues — generic patterns only (works nationwide, not one city’s landmarks).
 */
function isSymphonyOrMajorConcertVenue(name) {
  const n = String(name || "").toLowerCase();
  return (
    /\b(concert hall|symphony hall|orchestra hall|philharmonic)\b/.test(n) ||
    /\b(music hall|performance hall|recital hall|symphony center)\b/.test(n) ||
    /\b(performing arts center|performing arts hall)\b/.test(n) ||
    /\bopera house\b/.test(n) ||
    /\b(amphitheatre|amphitheater)\b/.test(n)
  );
}

function isCampusOrUniversityTheater(name, address) {
  const n = String(name || "").toLowerCase();
  const a = String(address || "").toLowerCase();
  return (
    /\b(norris|usc|s\.c\.a\.|school of cinematic)\b/i.test(n) ||
    /\b(ucla|caltech)\b.*\b(cinema|theater|theatre)\b/i.test(n) ||
    /\b(university|campus)\b.*\b(cinema|theater|theatre)\b/i.test(n) ||
    /\b(university park|90089|34th st|exposition blvd|vermont ave)\b/i.test(a) ||
    /\b(los angeles).{0,40}\b90089\b/i.test(a)
  );
}

/**
 * Drop Unsplash results whose alt text clearly mismatches the venue type (wrong scene).
 */
export function getEditorialAltRejectSubstrings({ sourceName = "", mapQuery = "", address = "", title = "" }) {
  const blob = `${sourceName} ${mapQuery} ${address} ${title}`.toLowerCase();
  if (/\b(beach|pier|boardwalk|ocean|coast|bay|cove|shore|waterfront|pacific)\b/.test(blob)) {
    return ["rainforest", "tropical forest", "jungle", "mangrove", "amazon", "canopy", "lush forest"];
  }
  if (isSymphonyOrMajorConcertVenue(blob)) {
    return [
      "comedy club",
      "stand up",
      "standup",
      "open mic",
      "improv",
    ];
  }
  if (isStadiumOrSportsVenue(blob)) {
    return [
      "hiking trail",
      "hiking ",
      "nature trail",
      "silhouette",
      "sitting on rock",
      "national park",
    ];
  }
  if (
    /\b(bowling alley|bowling)\b/.test(blob) ||
    (/\blanes\b/i.test(blob) && /\d/.test(blob))
  ) {
    return ["scoreboard", "score board", "digital display", "lcd", "monitor"];
  }
  if (/\bgrand central market\b/.test(blob)) {
    return [
      "long beach",
      "huntington beach",
      "laguna beach",
      "newport beach",
      "santa monica pier",
      "malibu",
      "venice beach",
      "villa riviera",
    ];
  }
  if (!isCampusOrUniversityTheater(`${sourceName} ${mapQuery}`, address)) return [];
  return [
    "jimmy kimmel",
    "el capitan",
    "walk of fame",
    "hollywood boulevard",
    "tcl chinese",
    "chinese theatre",
    "dolby theatre",
    "hollywood walk",
    "dolby theater",
  ];
}

/**
 * Build search phrases that favor atmosphere, interiors, and professional photography —
 * not venue names (which pull random Google-adjacent junk).
 */
export function buildEditorialSearchQueries({
  category = "",
  sourceName = "",
  mapQuery = "",
  area = "",
  address = "",
}) {
  const cat = (category || "").toLowerCase();
  const name = `${sourceName} ${mapQuery}`.toLowerCase();
  const campusTheater = isCampusOrUniversityTheater(name, address);

  const priority = [];
  const out = [];
  const regional = [];

  const push = (s) => {
    const t = String(s).trim();
    if (t.length > 4 && !out.includes(t)) out.push(t);
  };
  const pushPriority = (s) => {
    const t = String(s).trim();
    if (t.length > 4 && !priority.includes(t)) priority.push(t);
  };
  const pushRegional = (s) => {
    const t = String(s).trim();
    if (t.length > 4 && !regional.includes(t)) regional.push(t);
  };

  if (campusTheater) {
    pushPriority("university lecture hall auditorium interior academic warm light");
    pushPriority("college campus theater interior empty seats");
    pushPriority("film school screening room interior minimal aesthetic");
  }

  if (isLandmarkIndoorFoodHall(name)) {
    pushPriority("indoor food hall vendors neon signs crowded lunch aesthetic");
    pushPriority("urban food market interior string lights bar stools");
    pushPriority("busy downtown food hall interior vendors lunch crowd");
  }

  if (isSymphonyOrMajorConcertVenue(name)) {
    pushPriority("symphony orchestra concert hall interior golden hall architecture audience");
    pushPriority("classical music performance hall dramatic lighting chandelier elegant");
    pushPriority("orchestra concert stage strings audience elegant venue");
  }

  if (
    cat.includes("sports") ||
    isStadiumOrSportsVenue(name) ||
    /\b(game|match|championship|playoff)\b/.test(name)
  ) {
    pushPriority("baseball stadium game day crowd cheering field green grass lights");
    pushPriority("sports stadium packed crowd night game atmosphere energy");
    pushPriority("professional baseball diamond infield stadium lights dramatic sky");
    pushPriority("american football stadium fans cheering field lights evening");
    pushPriority("soccer stadium match night crowd field lights atmosphere");
  }

  if (cat.includes("comedy") || name.includes("improv") || name.includes("comedy")) {
    push("stand up comedy club stage spotlight audience intimate atmosphere");
    push("comedy show microphone theater lights audience");
  }
  if (cat.includes("live_music") || cat.includes("live_performance") || name.includes("concert")) {
    push("live music concert stage lights crowd atmosphere");
    push("music venue stage lights audience night");
  }
  if (cat.includes("cinema") || name.includes("cinema") || (name.includes("movie") && name.includes("theater"))) {
    push("movie theater interior cinema seats atmospheric dark");
    push("cinema auditorium widescreen dramatic lighting");
  }
  if (cat.includes("museum") || name.includes("museum")) {
    push("modern art museum gallery exhibition natural light architecture");
    push("museum visitors contemporary art spacious interior");
  }
  if (cat === "theater" || cat === "theatre" || name.includes("theatre") || name.includes("playhouse")) {
    push("theater stage curtains dramatic lighting audience elegant");
    push("performing arts theater interior chandelier");
  }
  if (cat.includes("nightclub") || cat === "bar") {
    push("karaoke bar neon lights microphone friends night energy");
    push("nightclub dance floor lights crowd DJ party atmosphere");
    push("cocktail bar interior mood lighting evening luxury");
    push("speakeasy bar ambient lighting craft drinks");
  }
  if (cat.includes("restaurant") || cat === "cafe" || cat === "coffee" || cat.includes("bakery")) {
    push("fine dining restaurant interior warm lighting aesthetic");
    push("cafe brunch natural light coffee aesthetic cozy");
  }
  // Beach / coastal — must come before generic park/scenic to avoid jungle results
  if (/\b(beach|pier|boardwalk|ocean|coast|bay|cove|shore|waterfront|pacific)\b/.test(name)) {
    pushPriority("california beach pacific ocean waves sunset golden hour sand");
    pushPriority("beach boardwalk summer people walking sand warm light");
    pushPriority("santa monica venice beach california ocean pier");
  } else if (cat === "park" || cat.includes("scenic") || cat.includes("trail")) {
    push("golden hour park landscape trees peaceful path");
    push("scenic overlook sunset nature hiking");
  }
  if (cat.includes("bookstore")) {
    push("cozy bookstore wooden shelves reading warm light aesthetic");
  }
  if (cat.includes("arcade") || cat.includes("bowling")) {
    push("neon arcade games retro aesthetic colorful");
    push("bowling alley lanes retro atmosphere");
  }
  if (cat.includes("market")) {
    push("indoor food market vendors colorful string lights hall");
    push("farmers market food stalls colorful fresh outdoor");
  }
  if (cat.includes("gallery") || cat.includes("ice_cream")) {
    push("art gallery white walls exhibition contemporary");
    push("dessert ice cream aesthetic pastel");
  }

  const a = (area || "").toLowerCase();
  if (a.length > 2) {
    pushRegional("american city downtown skyline golden hour urban evening");
  }

  if (out.length === 0) {
    push("night out city lights friends evening atmosphere");
    push("urban exploration discovery travel aesthetic");
  }

  /** Stock city shots last — they often resolve to Hollywood landmarks unrelated to the venue. */
  const merged = [...priority, ...out, ...regional];
  return merged.slice(0, 8);
}

/**
 * Pick highest-resolution results, dedupe by photo id.
 */
export async function fetchUnsplashEditorial(
  apiKey,
  queries,
  { maxImages = 8, rejectAltSubstrings = [], seed, minPhotoWidth = 0, fallbackCategory = "" } = {}
) {
  if (!apiKey || String(apiKey).includes("your_")) {
    return { urls: [], attributions: [] };
  }

  const rng =
    seed != null && String(seed).length > 0
      ? mulberry32(hashStringToSeed(String(seed)))
      : mulberry32((Math.random() * 0xffffffff) >>> 0);

  const rejectors =
    Array.isArray(rejectAltSubstrings) && rejectAltSubstrings.length > 0
      ? rejectAltSubstrings.map((s) => String(s).toLowerCase())
      : [];

  const seen = new Set();
  const urls = [];
  const attributions = [];
  let rateLimited = false;

  for (const query of queries) {
    if (urls.length >= maxImages) break;
    try {
      // Check cache before hitting the API
      let rawPhotos = _cacheGet(query);
      if (rawPhotos) {
        console.log("[unsplash] cache hit:", query.slice(0, 50));
      } else {
        const u =
          `${UNSPLASH_SEARCH}?` +
          new URLSearchParams({
            query,
            per_page: "20",
            page: String(1 + Math.floor(rng() * 5)),
            orientation: "landscape",
            content_filter: "high",
            order_by: rng() < 0.35 ? "latest" : "relevant",
          });
        const r = await fetch(u, {
          headers: { Authorization: `Client-ID ${apiKey}` },
        });
        if (r.status === 403) {
          rateLimited = true;
          console.warn("[unsplash] rate limited (403) — will use category fallback");
          break;
        }
        if (!r.ok) {
          let body = "";
          try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
          console.warn("[unsplash] search failed", r.status, query.slice(0, 40), body || "(no body)");
          continue;
        }
        const data = await r.json();
        rawPhotos = data.results ?? [];
        _cacheSet(query, rawPhotos);
      }

      const sorted = [...rawPhotos].sort((a, b) => {
        const aw = (a.width || 0) * (a.height || 0);
        const bw = (b.width || 0) * (b.height || 0);
        return bw - aw;
      });
      const pool = sorted.slice(0, Math.min(18, sorted.length));
      shuffleInPlace(pool, rng);

      for (const p of pool) {
        if (urls.length >= maxImages) break;
        if (minPhotoWidth > 0 && (Number(p.width) || 0) < minPhotoWidth) continue;
        if (!p?.id || seen.has(p.id)) continue;
        if (rejectors.length > 0) {
          const blob = `${p.alt_description || ""} ${p.description || ""}`.toLowerCase();
          if (rejectors.some((sub) => sub && blob.includes(sub))) continue;
        }
        seen.add(p.id);
        const base = p.urls?.raw || p.urls?.full || p.urls?.regular;
        if (!base) continue;
        const clean = base.split("?")[0];
        urls.push(`${clean}?w=2400&q=90&fm=jpg&fit=max&auto=format`);
        attributions.push({
          name: p.user?.name || "Photographer",
          profileUrl: p.user?.links?.html || "https://unsplash.com",
        });
      }
    } catch {
      /* try next query */
    }
  }

  // Rate limited with no images — use hardcoded category fallback
  if (rateLimited && urls.length === 0) {
    const fallback = getCategoryFallbackUrl(fallbackCategory);
    console.log("[unsplash] using category fallback:", fallbackCategory, "→", fallback.slice(0, 60));
    return {
      urls: [fallback],
      attributions: [{ name: "Unsplash", profileUrl: "https://unsplash.com" }],
    };
  }

  return { urls, attributions };
}
