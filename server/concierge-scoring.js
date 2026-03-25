/**
 * Score concierge suggestions 0–100. Below 60 = discard (with soft fallback in pipeline).
 */

const HEDGE_RE =
  /\b(check if|see if|might be|call ahead|verify|whether it|worth a visit just|their calendar|even if|no show)\b/i;

const BANNED_WORDS =
  /\b(perfect|wonderful|amazing|fantastic|cozy|gems?\b|hidden gem|unique|stunning)\b/i;

const CHAIN_RE =
  /\b(starbucks|mcdonald'?s?|subway\b|chipotle|dunkin|wendy'?s?|taco bell|burger king|kfc|panda express|domino'?s?|pizza hut)\b/i;

const MAJOR_OBVIOUS_LANDMARK =
  /\b(hollywood walk of fame|walk of fame|santa monica pier pier\b|rode[o] drive window shopping)\b/i;

function haversineMiles(lat1, lng1, lat2, lng2) {
  if (
    lat1 == null ||
    lng1 == null ||
    lat2 == null ||
    lng2 == null ||
    Number.isNaN(lat1) ||
    Number.isNaN(lng1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lng2)
  ) {
    return null;
  }
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchPlaceByName(s, places) {
  const sn = String(s.sourcePlaceName || "").trim().toLowerCase();
  const mq = String(s.mapQuery || "").trim().toLowerCase();
  const tit = String(s.title || "").trim().toLowerCase();
  for (const p of places || []) {
    const n = String(p.name || "").trim().toLowerCase();
    if (!n) continue;
    if (sn && n === sn) return p;
    if (tit.includes(n) || mq.includes(n) || n.includes(tit.slice(0, 24))) return p;
  }
  return null;
}

function specificityScore(s) {
  const t = String(s.title || "").trim();
  const hasPlace = String(s.sourcePlaceName || s.mapQuery || "").length > 3;
  const specificDish = /\b(get|order|try|the)\b/i.test(String(s.description || ""));
  if (t.length >= 12 && hasPlace && (specificDish || / at |@/.test(t))) return 25;
  if (t.length >= 8 && hasPlace) return 15;
  if (hasPlace) return 10;
  return 5;
}

function actionabilityScore(s, place, distanceMiles, hour24) {
  const desc = String(s.description || "");
  const hasHours =
    /\b(open until|open till|closes? at|\d{1,2}(?::\d{2})?\s*(am|pm)|tonight at)\b/i.test(desc);
  const hasOrder = /\b(order|get the|try the|sit at)\b/i.test(desc);
  if ((hasHours || hasOrder) && distanceMiles != null && distanceMiles <= 3) return 25;
  if (hasHours || hasOrder) return 18;
  if (place?.openNow === true && distanceMiles != null && distanceMiles <= 5) return 15;
  if (String(s.ticketEventId || "").trim()) return 25;
  return 8;
}

function verifiedScore(s, place) {
  if (String(s.sourceType || "").toLowerCase() === "gpt_knowledge") return 18;
  if (String(s.ticketEventId || "").trim()) return 25;
  if (place && place.openNow === true) return 25;
  if (place && place.openNow === false) return 0;
  if (place && place.openNow == null) return 10;
  return 8;
}

function discoveryScore(s, deckRole) {
  const desc = `${s.title} ${s.description}`.toLowerCase();
  if (CHAIN_RE.test(desc)) return 0;
  if (MAJOR_OBVIOUS_LANDMARK.test(desc)) return 5;
  if (String(deckRole || "").toLowerCase() === "wildcard") return 22;
  if (/residency|pop-?up|grunion|full moon|one night|last night|opening night/i.test(desc)) return 25;
  if (/\b(small venue|intimate|basement|side room|neighborhood)\b/i.test(desc)) return 20;
  return 12;
}

function outdoorLateNightRisk(s, hour24) {
  const cat = String(s.category || "").toLowerCase();
  if (hour24 < 22 && hour24 >= 6) return false;
  if (cat !== "walk") return false;
  const blob = `${s.title} ${s.description}`.toLowerCase();
  if (/\b(boardwalk|promenade|third street|busy|well-?lit|crowded)\b/i.test(blob)) return false;
  if (/\b(park|trail|plaza|empty|quiet)\b/i.test(blob)) return true;
  return false;
}

export function scoreConciergeSuggestion(s, ctx) {
  const {
    hour24 = 12,
    userLat,
    userLng,
    nearbyPlaces = [],
    excludeTitles = new Set(),
  } = ctx;

  const titleKey = String(s.title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (excludeTitles.has(titleKey)) {
    return { score: 0, disqualified: true, reasons: ["duplicate_title"] };
  }

  const blob = `${s.title} ${s.description}`.toLowerCase();
  if (HEDGE_RE.test(blob)) {
    return { score: 0, disqualified: true, reasons: ["hedge"] };
  }
  if (BANNED_WORDS.test(blob)) {
    return { score: 0, disqualified: true, reasons: ["banned_language"] };
  }
  if (/^if you're\b/mi.test(String(s.description || "").trim())) {
    return { score: 0, disqualified: true, reasons: ["if_youre"] };
  }
  if (outdoorLateNightRisk(s, hour24)) {
    return { score: 0, disqualified: true, reasons: ["outdoor_late_night"] };
  }

  const cost = String(s.cost || "").trim();
  if (/^varies$/i.test(cost) || /^tbd$/i.test(cost)) {
    return { score: 0, disqualified: true, reasons: ["bad_cost"] };
  }

  const place = matchPlaceByName(s, nearbyPlaces);
  let distanceMiles = place?.distanceMiles ?? null;
  if (distanceMiles == null && place?.lat != null && userLat != null) {
    distanceMiles = haversineMiles(userLat, userLng, place.lat, place.lng);
  }

  const maxPrimary = hour24 >= 22 || hour24 < 6 ? 1.25 : 3.5;
  const cat = String(s.category || "").toLowerCase();
  const isTm = Boolean(String(s.ticketEventId || "").trim());
  const isGptKnowledge = String(s.sourceType || "").toLowerCase() === "gpt_knowledge";
  if (
    !isTm &&
    !isGptKnowledge &&
    distanceMiles != null &&
    distanceMiles > maxPrimary + 0.01 &&
    !/show|concert|ticket/i.test(blob)
  ) {
    return { score: 0, disqualified: true, reasons: ["too_far"] };
  }

  const deckRole = s.deckRole || s.deck_role || "";

  const sp =
    specificityScore(s) +
    actionabilityScore(s, place, distanceMiles, hour24) +
    verifiedScore(s, place) +
    discoveryScore(s, deckRole);

  const reasons = [];
  if (sp < 60) reasons.push("below_threshold_components");

  return {
    score: Math.min(100, sp),
    disqualified: false,
    distanceMiles,
    reasons,
  };
}

export function filterAndSortByScore(suggestions, ctx, minScore = 60) {
  const scored = suggestions.map((s) => {
    const r = scoreConciergeSuggestion(s, ctx);
    return { s, ...r };
  });

  const ok = scored.filter((x) => !x.disqualified);
  ok.sort((a, b) => b.score - a.score);

  const first = ok.filter((x) => x.score >= minScore);
  const second = ok.filter((x) => x.score < minScore && x.score >= 45);
  const third = ok.filter((x) => x.score < 45);

  let out = [...first, ...second, ...third].map((x) => x.s);
  if (out.length < 3) {
    out = ok.map((x) => x.s);
  }
  if (out.length === 0) {
    out = suggestions.slice(0, 5);
  }
  return out.slice(0, 5);
}

export { haversineMiles, matchPlaceByName };
