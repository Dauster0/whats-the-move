/**
 * Wide Google Places (New) searchNearby: interest-mapped types, parallel batches, 8km radius.
 */

const RADIUS_METERS = 8000;
const MAX_FOR_GPT = 25;
const MIN_RATING_STRICT = 4.0;
const MIN_RATING_RELAXED = 3.5;

/** Interest keys match app USER_INTEREST_CHIPS. Values are Table A place types. */
const INTEREST_TO_TYPES = {
  walking: ["park", "tourist_attraction"],
  hikes: ["park", "gym"],
  coffee: ["cafe", "coffee_shop"],
  dessert: ["bakery", "ice_cream_shop"],
  exploring: ["tourist_attraction", "shopping_mall", "park", "stadium"],
  bookstores: ["book_store"],
  museums: ["museum", "art_gallery"],
  movies: ["movie_theater"],
  theater: ["movie_theater", "tourist_attraction"],
  "live-music": ["night_club", "bar", "restaurant"],
  concerts: ["night_club", "bar", "stadium", "amusement_center"],
  comedy: ["night_club", "bar", "movie_theater"],
  improv: ["night_club", "bar"],
  karaoke: ["night_club", "bar"],
  dancing: ["night_club", "bar"],
  trivia: ["bar", "restaurant", "night_club"],
  nightlife: ["bar", "night_club", "restaurant"],
  sports: ["stadium", "gym", "park"],
  bowling: ["bowling_alley"],
  arcade: ["amusement_center", "bowling_alley"],
  "farmers-markets": ["supermarket", "shopping_mall", "tourist_attraction"],
  rooftops: ["bar", "night_club", "restaurant"],
  "working out": ["gym", "park", "stadium"],
  beach: ["park", "tourist_attraction"],
  journaling: ["cafe", "coffee_shop", "park", "library"],
  reading: ["book_store", "cafe", "coffee_shop", "library", "park"],
  "calling friends": ["cafe", "bar", "restaurant", "park"],
  "solo-recharge": ["cafe", "park", "spa", "library"],
  "cheap-hangouts": ["park", "cafe", "coffee_shop", "bar"],
  pickleball: ["gym", "park", "stadium"],
  tennis: ["gym", "park", "stadium"],
  basketball: ["gym", "park", "stadium"],
  soccer: ["stadium", "gym", "park"],
  football: ["stadium", "gym"],
  baseball: ["stadium", "park"],
  volleyball: ["gym", "park"],
  swimming: ["gym", "park", "tourist_attraction"],
  "rock-climbing": ["gym", "amusement_center"],
  bouldering: ["gym", "amusement_center"],
  surfing: ["park", "tourist_attraction"],
  skating: ["amusement_center", "park"],
  skateboarding: ["park", "amusement_center"],
  cycling: ["park", "gym", "tourist_attraction"],
  running: ["park", "gym", "tourist_attraction"],
  yoga: ["gym", "spa"],
  pilates: ["gym", "spa"],
  "martial-arts": ["gym", "amusement_center"],
  karate: ["gym", "amusement_center"],
  boxing: ["gym", "amusement_center"],
  bjj: ["gym", "amusement_center"],
  crossfit: ["gym"],
  golf: ["park", "tourist_attraction"],
  frisbee: ["park", "tourist_attraction"],
  "paddle-boarding": ["park", "tourist_attraction"],
  brunch: ["restaurant", "cafe", "coffee_shop"],
  sushi: ["restaurant", "meal_takeaway"],
  tacos: ["restaurant", "meal_takeaway"],
  ramen: ["restaurant", "meal_takeaway"],
  bbq: ["restaurant", "meal_takeaway"],
  pizza: ["restaurant", "meal_takeaway"],
  "wine-bars": ["bar", "restaurant"],
  "craft-beer": ["bar", "restaurant"],
  "cocktail-bars": ["bar", "night_club"],
  speakeasies: ["bar", "night_club"],
  "food-trucks": ["meal_takeaway", "restaurant"],
  "night-markets": ["shopping_mall", "tourist_attraction", "supermarket"],
  "cooking-classes": ["restaurant", "meal_takeaway"],
  "tasting-menus": ["restaurant"],
  "art-galleries": ["art_gallery", "museum"],
  "street-art": ["tourist_attraction", "art_gallery"],
  photography: ["art_gallery", "tourist_attraction"],
  "film-festivals": ["movie_theater", "tourist_attraction"],
  "indie-films": ["movie_theater"],
  "poetry-slams": ["night_club", "bar"],
  "open-mics": ["night_club", "bar"],
  "spoken-word": ["night_club", "bar"],
  "cultural-festivals": ["tourist_attraction", "shopping_mall"],
  opera: ["movie_theater", "tourist_attraction"],
  ballet: ["movie_theater", "tourist_attraction"],
  "contemporary-dance": ["night_club", "movie_theater"],
  "game-nights": ["amusement_center", "bar", "cafe"],
  "escape-rooms": ["amusement_center", "tourist_attraction"],
  "axe-throwing": ["amusement_center", "bowling_alley"],
  "mini-golf": ["amusement_center", "park"],
  "go-karts": ["amusement_center"],
  "laser-tag": ["amusement_center"],
  "paint-and-sip": ["art_gallery", "bar"],
  "pottery-classes": ["art_gallery", "shopping_mall"],
  "dance-classes": ["gym", "night_club"],
  "salsa-nights": ["night_club", "bar"],
  "speed-dating": ["bar", "night_club"],
  "bar-crawls": ["bar", "night_club"],
  "rooftop-parties": ["bar", "night_club"],
  "hiking-outdoors": ["park", "tourist_attraction"],
  "beach-volleyball": ["park", "tourist_attraction"],
  "tide-pools": ["park", "tourist_attraction"],
  camping: ["park", "tourist_attraction"],
  stargazing: ["park", "tourist_attraction"],
  "sunrise-spots": ["park", "tourist_attraction"],
  "sunset-spots": ["park", "tourist_attraction"],
  "nature-walks": ["park", "tourist_attraction"],
  "dog-parks": ["park"],
  "botanical-gardens": ["park", "tourist_attraction"],
  kayaking: ["park", "tourist_attraction"],
  snorkeling: ["aquarium", "tourist_attraction"],
  "cafes-to-work": ["cafe", "coffee_shop", "library"],
  "journaling-spots": ["cafe", "coffee_shop", "park", "library"],
  "scenic-drives": ["tourist_attraction", "park"],
  "people-watching": ["park", "cafe", "shopping_mall"],
  "thrift-shopping": ["shopping_mall", "tourist_attraction"],
  "vintage-markets": ["shopping_mall", "tourist_attraction"],
  "record-stores": ["shopping_mall", "book_store"],
  "puzzle-cafes": ["cafe", "coffee_shop"],
  "board-game-cafes": ["cafe", "coffee_shop", "amusement_center"],
  spas: ["spa"],
  "sound-baths": ["spa", "gym"],
  "language-exchange": ["cafe", "bar", "restaurant"],
  "coding-meetups": ["cafe", "coffee_shop"],
  "networking-events": ["bar", "restaurant", "night_club"],
  "lectures-talks": ["museum", "library", "tourist_attraction"],
  "trivia-pub-quiz": ["bar", "restaurant", "night_club"],
  "science-events": ["museum", "tourist_attraction"],
  "astronomy-nights": ["museum", "park", "tourist_attraction"],
};

const BASELINE_TYPES = [
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "park",
  "bakery",
  "tourist_attraction",
];

/** Known-valid Table A types only (invalid types dropped per batch). */
const ALLOWED_TYPES = new Set([
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "night_club",
  "bakery",
  "meal_takeaway",
  "ice_cream_shop",
  "book_store",
  "library",
  "movie_theater",
  "museum",
  "art_gallery",
  "park",
  "gym",
  "bowling_alley",
  "amusement_center",
  "tourist_attraction",
  "shopping_mall",
  "stadium",
  "spa",
  "supermarket",
  "aquarium",
  "casino",
]);

function collectTypesForInterests(interests) {
  const set = new Set(BASELINE_TYPES);
  const list = Array.isArray(interests) ? interests : [];
  for (const raw of list) {
    const k = String(raw || "").trim().toLowerCase();
    const mapped = INTEREST_TO_TYPES[k];
    if (mapped) {
      for (const t of mapped) {
        if (ALLOWED_TYPES.has(t)) set.add(t);
      }
    }
  }
  return [...set].filter((t) => ALLOWED_TYPES.has(t));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapPlaceDoc(p) {
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
    types: (p.types ?? []).slice(0, 8),
    id: p.id ?? p.name ?? "",
    websiteUri: p.websiteUri ?? "",
    photos: (p.photos ?? []).map((ph) => ({
      name: ph.name ?? "",
      widthPx: ph.widthPx ?? null,
      heightPx: ph.heightPx ?? null,
    })),
  };
}

async function searchNearbyOne(googleKey, lat, lng, includedTypes) {
  const body = {
    includedTypes,
    maxResultCount: 20,
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: RADIUS_METERS,
      },
    },
  };
  const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-FieldMask":
        "places.name,places.displayName,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.regularOpeningHours,places.formattedAddress,places.types,places.id,places.websiteUri,places.photos",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(14000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.warn(
      "[places] searchNearby batch failed",
      r.status,
      includedTypes.slice(0, 4).join(","),
      errText.slice(0, 120)
    );
    return [];
  }
  const data = await r.json();
  const places = data.places ?? [];
  return places.map(mapPlaceDoc);
}

/**
 * Parallel nearby searches by type batches; dedupe; filter open + rating; top N for model.
 * @param {{ relaxOpenNow?: boolean }} [options] — when true, skip open-now gating (future planning).
 */
export async function fetchPlacesWideNet(lat, lng, googleKey, interests, options = {}) {
  const relaxOpenNow = options.relaxOpenNow === true;
  if (
    !googleKey ||
    googleKey === "your_key_here" ||
    googleKey === "your_google_key_here" ||
    googleKey.includes("your_")
  ) {
    return [];
  }

  let types = collectTypesForInterests(interests);
  if (types.length === 0) types = [...BASELINE_TYPES].filter((t) => ALLOWED_TYPES.has(t));

  const batches = chunk(types, 12);
  console.log("[places] searchNearby request", {
    endpoint: "https://places.googleapis.com/v1/places:searchNearby",
    lat,
    lng,
    radius_meters: RADIUS_METERS,
    rankPreference: "POPULARITY",
    maxResultCount: 20,
    type_batches: batches,
    interests_received: interests,
  });

  const results = await Promise.all(
    batches.map((includedTypes) => searchNearbyOne(googleKey, lat, lng, includedTypes))
  );

  const byId = new Map();
  for (const batch of results) {
    for (const p of batch) {
      const key = p.resourceName || p.id || p.name;
      if (!key) continue;
      if (!byId.has(key)) byId.set(key, p);
    }
  }
  let merged = [...byId.values()];

  console.log(`[places] raw results — ${merged.length} unique places before filtering`);
  for (const p of merged) {
    console.log(`  ${p.name} | rating=${p.rating ?? "?"} | openNow=${p.openNow} | types=${(p.types ?? []).join(",")} | ${p.address}`);
  }

  const openOk = (p) => p.openNow === true;
  const rated = (p, min) => p.rating == null || p.rating >= min;

  let filtered;
  if (relaxOpenNow) {
    filtered = merged.filter((p) => rated(p, MIN_RATING_STRICT));
    if (filtered.length < 12) {
      filtered = merged.filter((p) => rated(p, MIN_RATING_RELAXED));
    }
    if (filtered.length < 8) {
      filtered = merged;
    }
  } else {
    filtered = merged.filter((p) => openOk(p) && rated(p, MIN_RATING_STRICT));
    if (filtered.length < 12) {
      filtered = merged.filter((p) => (p.openNow === true || p.openNow == null) && rated(p, MIN_RATING_STRICT));
    }
    if (filtered.length < 12) {
      filtered = merged.filter((p) => (p.openNow === true || p.openNow == null) && rated(p, MIN_RATING_RELAXED));
    }
    if (filtered.length < 8) {
      filtered = merged.filter((p) => rated(p, MIN_RATING_RELAXED));
    }
    if (filtered.length === 0) {
      filtered = merged;
    }
  }

  filtered.sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    const va = ra * Math.log(1 + (a.reviews || 0));
    const vb = rb * Math.log(1 + (b.reviews || 0));
    return vb - va;
  });

  return filtered.slice(0, MAX_FOR_GPT);
}

export { collectTypesForInterests, RADIUS_METERS };
