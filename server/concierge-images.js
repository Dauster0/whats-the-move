/**
 * Concierge card imagery: Ticketmaster promo art, venue og:image, Unsplash vibe,
 * Google Places photo (last resort). See concierge-pipeline for orchestration.
 */

import { fetchUnsplashEditorial } from "./editorial-photos.js";
import { isImageTopRegionPredominantlyWhite } from "./image-brightness.js";

const MIN_PIXEL_WIDTH = 800;

function normalizeTicketUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    x.hash = "";
    const keys = [...x.searchParams.keys()];
    for (const k of keys) {
      if (/^utm_/i.test(k) || k === "referrer") x.searchParams.delete(k);
    }
    let out = x.href;
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out.toLowerCase();
  } catch {
    return String(u || "")
      .trim()
      .toLowerCase();
  }
}

function koreanBbqUnsplashQuery(s) {
  const ft = String(s.flavorTag || "").toLowerCase();
  if (ft.includes("korean") || ft === "korean_bbq") {
    return "korean bbq galbi short ribs grill smoke close up";
  }
  return "";
}

function normalizeRatio(r) {
  return String(r || "")
    .replace(/×/g, "x")
    .replace(/:/g, "_");
}

function isSkippableTmImage(img) {
  if (!img || !img.url) return true;
  if (img.fallback === true) return true;
  const w = Number(img.width) || 0;
  const h = Number(img.height) || 0;
  if (w > 0 && w < MIN_PIXEL_WIDTH) return true;
  const u = String(img.url).toLowerCase();
  if (/\blogo\b|favicon|\/icon\.|badge|avatar|1x1|pixel\.gif/.test(u)) return true;
  const r = normalizeRatio(img.ratio);
  if ((r === "1_1" || r === "1x1") && w > 0 && w < 1200) return true;
  if (h > 0 && w > 0) {
    const aspect = w / h;
    if (aspect < 1.15 && aspect > 0.85 && w < 1100) return true;
  }
  return false;
}

/**
 * Prefer attraction promo art, then event images. Card = 16_9 first; widen to 3_2, 4_3.
 */
export function pickTicketmasterCardImage(record) {
  if (!record) return null;
  const ratioOrder = ["16_9", "16x9", "3_2", "3x2", "4_3", "4x3"];

  function pickFromList(images) {
    const list = Array.isArray(images) ? images : [];
    for (const want of ratioOrder) {
      const candidates = list.filter((img) => {
        if (isSkippableTmImage(img)) return false;
        const r = normalizeRatio(img.ratio);
        return r === want || r === want.replace("x", "_");
      });
      candidates.sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
      if (candidates.length) return String(candidates[0].url);
    }
    const any = list
      .filter((img) => !isSkippableTmImage(img) && (Number(img.width) || 0) >= MIN_PIXEL_WIDTH)
      .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
    return any.length ? String(any[0].url) : null;
  }

  for (const a of record.attractions || []) {
    const u = pickFromList(a.images);
    if (u) return u;
  }
  return pickFromList(record.images);
}

export function buildTicketmasterLookup(records) {
  const byId = new Map();
  const byUrl = new Map();
  for (const e of records || []) {
    if (e?.id) byId.set(String(e.id), e);
    if (e?.url) byUrl.set(normalizeTicketUrl(e.url), e);
  }
  return { byId, byUrl };
}

export function resolveTicketmasterRecord(suggestion, lookup) {
  if (!lookup) return null;
  const id = suggestion.ticketEventId ? String(suggestion.ticketEventId).trim() : "";
  if (id && lookup.byId.has(id)) return lookup.byId.get(id);
  const u = suggestion.ticketUrl ? String(suggestion.ticketUrl).trim() : "";
  if (u && lookup.byUrl.has(normalizeTicketUrl(u))) return lookup.byUrl.get(normalizeTicketUrl(u));
  return null;
}

function looksLikeBadOgUrl(href) {
  const low = href.toLowerCase();
  if (!/^https?:\/\//.test(low)) return true;
  if (/favicon|apple-touch|sprite\.png|logo\.svg|wixstatic.*\.svg/.test(low)) return true;
  if (/\/logo[s/]|[/_-]logo[._-]|wordmark|brand[_-]mark|site[_-]icon|header[_-]icon|social[_-]share|og-default|placeholder|badge|avatar/.test(low))
    return true;
  if (/\/\d{2,3}x\d{2,3}[/_-]|_[0-9]{2,3}x[0-9]{2,3}[._-]/.test(low)) return true;
  const wParam = low.match(/[\?&]w(?:idth)?=(\d+)/i);
  if (wParam && Number(wParam[1]) > 0 && Number(wParam[1]) < 500) return true;
  const hParam = low.match(/[\?&]h(?:eight)?=(\d+)/i);
  if (hParam && Number(hParam[1]) > 0 && Number(hParam[1]) < 400) return true;
  return false;
}

async function ogImagePassesSizeProbe(imageUrl) {
  try {
    const r = await fetch(imageUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsTheMove/1.0)" },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return true;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.startsWith("image/")) return false;
    const len = r.headers.get("content-length");
    if (len != null && Number(len) > 0 && Number(len) < 14000) return false;
    return true;
  } catch {
    return true;
  }
}

export async function fetchOgImageUrl(websiteUrl) {
  const raw = String(websiteUrl || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const r = await fetch(raw, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WhatsTheMove/1.0; +https://whats-the-move.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const re =
      /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i;
    const m = html.match(re);
    let img = (m && (m[1] || m[2]) ? m[1] || m[2] : "").trim();
    if (!img) return null;
    if (img.startsWith("//")) img = `https:${img}`;
    const abs = new URL(img, raw).href;
    if (looksLikeBadOgUrl(abs)) return null;
    if (!(await ogImagePassesSizeProbe(abs))) return null;
    return abs;
  } catch {
    return null;
  }
}

export function googlePlacePhotoMediaUrl(photoResourceName, apiKey, maxWidthPx = 1920) {
  if (!photoResourceName || !apiKey) return null;
  const name = String(photoResourceName).replace(/^\/+/, "");
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;
}

function isBadPlacePhotoMeta(p) {
  const w = Number(p.widthPx || p.width || 0);
  const h = Number(p.heightPx || p.height || 0);
  if (w > 0 && w < MIN_PIXEL_WIDTH) return true;
  if (h > 0 && w > 0 && h > w * 1.05) return true;
  if (w > 0 && h > 0) {
    const ar = w / h;
    if (ar < 1.15 && ar > 0.85 && w < 1100) return true;
  }
  return false;
}

function pickPlacePhotoNames(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const sorted = [...photos].sort((a, b) => {
    const aw = Number(a.widthPx || a.width || 0);
    const bw = Number(b.widthPx || b.width || 0);
    return bw - aw;
  });
  const names = [];
  for (const p of sorted) {
    const n = p.name || p.googleMapsUri;
    if (!n || typeof n !== "string") continue;
    if (isBadPlacePhotoMeta(p)) continue;
    names.push(n);
    if (names.length >= 2) break;
  }
  if (names.length === 0 && sorted[0]?.name && !isBadPlacePhotoMeta(sorted[0])) names.push(sorted[0].name);
  return names;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isTicketedEventSuggestion(s) {
  return Boolean(
    (s.ticketUrl && String(s.ticketUrl).trim()) || (s.ticketEventId && String(s.ticketEventId).trim())
  );
}

export function matchNearbyPlace(suggestion, nearbyPlaces) {
  const explicit = suggestion.sourcePlaceName ? String(suggestion.sourcePlaceName).trim() : "";
  if (explicit && nearbyPlaces?.length) {
    const hit = nearbyPlaces.find((p) => p.name === explicit);
    if (hit) return hit;
    const ex = normalizeName(explicit);
    const fuzzy = nearbyPlaces.find((p) => normalizeName(p.name) === ex);
    if (fuzzy) return fuzzy;
  }
  const mq = normalizeName(suggestion.mapQuery || suggestion.title || "");
  if (!mq || !nearbyPlaces?.length) return null;
  const firstChunk = mq.split(/[,|·]/)[0]?.trim() || mq;
  let best = null;
  let bestLen = 0;
  for (const p of nearbyPlaces) {
    const pn = normalizeName(p.name);
    if (!pn) continue;
    if (mq.includes(pn) || pn.includes(firstChunk)) {
      if (pn.length > bestLen) {
        bestLen = pn.length;
        best = p;
      }
    }
  }
  return best;
}

async function resolveImageForSuggestion(suggestion, i, { lookup, nearbyPlaces, unsplashKey, seedBase, googleApiKey }) {
  const s = { ...suggestion };
  let photoUrl = null;
  let imageLayout = "cover";
  let photoSource = null;

  const isGptKnowledge = String(s.sourceType || "").toLowerCase() === "gpt_knowledge";
  if (isGptKnowledge && unsplashKey) {
    const rawQ = String(s.unsplashQuery || "").trim();
    const nameBlob = `${s.title || ""} ${rawQ}`.toLowerCase();
    // Beach/coastal places: override vague GPT queries that pull tropical/jungle images
    const q = /\b(beach|pier|boardwalk|ocean|coast|bay|cove|shore|waterfront|pacific)\b/.test(nameBlob)
      ? "california beach pacific ocean waves sunset golden hour sand people"
      : rawQ;
    const fallbacks = [q || `${s.title} los angeles neighborhood atmosphere`, "city afternoon street life warm light"];
    try {
      const { urls } = await fetchUnsplashEditorial(unsplashKey, fallbacks.filter(Boolean), {
        maxImages: 1,
        seed: `${seedBase}-${i}-gk`,
        minPhotoWidth: MIN_PIXEL_WIDTH,
      });
      if (urls[0]) {
        photoUrl = urls[0];
        photoSource = "unsplash";
        imageLayout = "cover";
      }
    } catch {
      /* keep null */
    }
    s.photoUrl = photoUrl;
    s.imageLayout = imageLayout;
    s.photoSource = photoSource;
    return s;
  }

  const tmRecord = resolveTicketmasterRecord(s, lookup);
  const ticketed = isTicketedEventSuggestion(s);
  const place = !ticketed ? matchNearbyPlace(s, nearbyPlaces) : null;

  if (tmRecord) {
    const tmUrl = pickTicketmasterCardImage(tmRecord);
    if (tmUrl) {
      photoUrl = tmUrl;
      imageLayout = "poster";
      photoSource = "ticketmaster";
    }
  }

  if (!photoUrl && ticketed && unsplashKey) {
    const q = String(s.unsplashQuery || "").trim();
    const fallbacks = [q || `${s.title} live show atmosphere`, "concert stage lights crowd night energy"];
    try {
      const { urls } = await fetchUnsplashEditorial(unsplashKey, fallbacks.filter(Boolean), {
        maxImages: 1,
        seed: `${seedBase}-${i}-t`,
        minPhotoWidth: MIN_PIXEL_WIDTH,
      });
      if (urls[0]) {
        photoUrl = urls[0];
        photoSource = "unsplash";
        imageLayout = "cover";
      }
    } catch {
      /* keep null */
    }
  }

  if (!photoUrl && !ticketed) {
    const fallbacks = [
      String(s.unsplashQuery || "").trim() || `${s.category || "night out"} mood atmosphere`,
      "friends evening out warm cinematic light",
    ];
    if (place?.websiteUri) {
      const og = await fetchOgImageUrl(place.websiteUri);
      if (og && !(await isImageTopRegionPredominantlyWhite(og))) {
        photoUrl = og;
        photoSource = "website";
      }
    }
    if (!photoUrl && unsplashKey) {
      const kq = koreanBbqUnsplashQuery(s);
      const fb = [kq, ...fallbacks].filter(Boolean);
      try {
        const { urls } = await fetchUnsplashEditorial(unsplashKey, fb, {
          maxImages: 1,
          seed: `${seedBase}-${i}-p`,
          minPhotoWidth: MIN_PIXEL_WIDTH,
        });
        if (urls[0]) {
          photoUrl = urls[0];
          photoSource = "unsplash";
        }
      } catch {
        /* keep null */
      }
    }
    if (!photoUrl && place && googleApiKey) {
      const names = pickPlacePhotoNames(place.photos);
      for (const pname of names) {
        const u = googlePlacePhotoMediaUrl(pname, googleApiKey, 1920);
        if (!u) continue;
        if (await isImageTopRegionPredominantlyWhite(u)) continue;
        photoUrl = u;
        photoSource = "google_places";
        break;
      }
    }
  }

  s.photoUrl = photoUrl;
  s.imageLayout = imageLayout;
  s.photoSource = photoSource;
  if (place?.resourceName) {
    s.googlePlaceResourceName = String(place.resourceName).trim();
  }
  return s;
}

export async function resolveConciergeSuggestionImages({
  suggestions,
  ticketmasterRecords,
  nearbyPlaces,
  unsplashKey,
  seedBase,
  googleApiKey,
}) {
  const lookup = buildTicketmasterLookup(ticketmasterRecords);
  const ctx = { lookup, nearbyPlaces, unsplashKey, seedBase, googleApiKey };
  return Promise.all(suggestions.map((s, i) => resolveImageForSuggestion(s, i, ctx)));
}
