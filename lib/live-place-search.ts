import { isGroceryOrErrandPlace } from "./place-filters";

export type GenericPlaceType =
  | "coffee"
  | "dessert"
  | "bookstore"
  | "museum"
  | "park"
  | "comedy"
  | "bowling"
  | "arcade"
  | "movie_theater"
  | "live_music"
  | "nightclub"
  | "bar"
  | "gallery"
  | "scenic"
  | "market"
  | "restaurant";

export type GenericPlaceResult = {
  id: string;
  name: string;
  category: GenericPlaceType;
  address: string;
  mapQuery: string;
  distanceText: string;
  priceText: "$" | "$$" | "$$$";
  reservationNeeded: boolean;
  reservationNote?: string;
  rating?: number;
  openNow?: boolean;
  /** e.g. "Open until 10:00 PM" or "Today 11:00 AM – 2:00 AM" from Google hours */
  hoursSummary?: string;
  whyItFits?: string;
  lat?: number;
  lng?: number;
};

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

/** Field mask for list/search: hours for “open until” copy (uses nextCloseTime when open). */
const PLACES_LIST_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours";

/**
 * Builds one line for UI from Google Places OpeningHours (new API).
 * Prefers `nextCloseTime` when the place is open; falls back to today's weekday line.
 */
export function openingHoursLineFromGooglePlace(place: {
  currentOpeningHours?: {
    openNow?: boolean;
    nextCloseTime?: string;
    nextOpenTime?: string;
    weekdayDescriptions?: string[];
  };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
}): string | undefined {
  const cur = place.currentOpeningHours;
  const reg = place.regularOpeningHours;

  if (cur?.nextCloseTime) {
    const d = new Date(cur.nextCloseTime);
    if (!Number.isNaN(d.getTime())) {
      const t = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `Open until ${t}`;
    }
  }

  if (cur?.openNow && !cur?.nextCloseTime) {
    const blob = [
      ...(cur.weekdayDescriptions ?? []),
      ...(reg?.weekdayDescriptions ?? []),
    ].join(" ");
    if (/24\s*hours?|always\s*open|open\s*24/i.test(blob)) {
      return "Open 24 hours";
    }
  }

  if (cur && cur.openNow === false && cur.nextOpenTime) {
    const d = new Date(cur.nextOpenTime);
    if (!Number.isNaN(d.getTime())) {
      const t = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `Closed · opens ${t}`;
    }
  }

  const lines = reg?.weekdayDescriptions ?? cur?.weekdayDescriptions;
  if (lines?.length) {
    return todayHoursFromWeekdayDescriptions(lines, new Date());
  }

  return undefined;
}

function todayHoursFromWeekdayDescriptions(
  lines: string[],
  now: Date
): string | undefined {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIdx = now.getDay();
  const full = days[dayIdx];
  const sh = short[dayIdx];
  const line = lines.find((l) => {
    const t = l.trim();
    return t.startsWith(full) || new RegExp(`^${sh}\\b`, "i").test(t);
  });
  if (!line && lines[dayIdx]) {
    return `Hours: ${lines[dayIdx]}`;
  }
  if (!line) return undefined;
  const afterColon = line.includes(":")
    ? line.replace(/^[^:]+:\s*/, "").trim()
    : line.trim();
  return `Today ${afterColon}`;
}

function metersToMilesText(meters?: number) {
  if (!meters || Number.isNaN(meters)) return "Nearby";
  const miles = meters / 1609.34;
  if (miles < 0.1) return "0.1 mi away";
  if (miles < 1) return `${miles.toFixed(1)} mi away`;
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2?: number,
  lon2?: number
) {
  if (
    lat2 == null ||
    lon2 == null ||
    Number.isNaN(lat2) ||
    Number.isNaN(lon2)
  ) {
    return undefined;
  }

  const toRad = (d: number) => (d * Math.PI) / 180;
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

function googleIncludedTypes(category: GenericPlaceType): string[] {
  switch (category) {
    case "coffee":
      return ["cafe", "coffee_shop"];
    case "dessert":
      return ["bakery", "dessert_shop", "ice_cream_shop"];
    case "bookstore":
      return ["book_store"];
    case "museum":
      return ["museum"];
    case "park":
      return ["park"];
    case "comedy":
      return ["performing_arts_theater"];
    case "bowling":
      return ["bowling_alley"];
    case "arcade":
      return ["amusement_center"];
    case "movie_theater":
      return ["movie_theater"];
    case "live_music":
      return ["live_music_venue"];
    case "nightclub":
      return ["night_club"];
    case "bar":
      return ["bar"];
    case "gallery":
      return ["art_gallery"];
    case "scenic":
      return ["tourist_attraction", "observation_deck"];
    case "market":
      /* shopping_mall often surfaces mall anchors (grocery) — prefer real markets */
      return ["market"];
    case "restaurant":
      return ["restaurant"];
    default:
      return ["restaurant"];
  }
}

function categoryQuery(category: GenericPlaceType, area: string, weeHours?: boolean) {
  switch (category) {
    case "coffee":
      return `best coffee shops in ${area}`;
    case "dessert":
      return `dessert places in ${area}`;
    case "bookstore":
      return `independent bookstores in ${area}`;
    case "museum":
      return `museums in ${area}`;
    case "park":
      return weeHours
        ? `beach parks waterfront walking paths in ${area}`
        : `parks in ${area}`;
    case "comedy":
      return `comedy clubs in ${area}`;
    case "bowling":
      return `bowling alleys in ${area}`;
    case "arcade":
      return `arcades in ${area}`;
    case "movie_theater":
      return `movie theaters in ${area}`;
    case "live_music":
      return `live music venues in ${area}`;
    case "nightclub":
      return weeHours
        ? `nightclubs dance clubs open late in ${area}`
        : `nightclubs in ${area}`;
    case "bar":
      return weeHours
        ? `karaoke bars pubs late night bars in ${area}`
        : `bars pubs in ${area}`;
    case "gallery":
      return `art galleries in ${area}`;
    case "scenic":
      return weeHours
        ? `beach pier ocean boardwalk night views in ${area}`
        : `sunset viewpoints in ${area}`;
    case "market":
      return `markets in ${area}`;
    case "restaurant":
      return `good casual restaurants in ${area}`;
    default:
      return `places in ${area}`;
  }
}

function mapPriceLevel(level?: string): "$" | "$$" | "$$$" {
  if (!level) return "$$";
  if (level === "PRICE_LEVEL_INEXPENSIVE" || level === "PRICE_LEVEL_FREE") return "$";
  if (
    level === "PRICE_LEVEL_MODERATE" ||
    level === "PRICE_LEVEL_UNSPECIFIED"
  ) {
    return "$$";
  }
  return "$$$";
}

function defaultReservationNeeded(category: GenericPlaceType) {
  return (
    category === "comedy" ||
    category === "live_music" ||
    category === "movie_theater" ||
    category === "nightclub" ||
    category === "bar"
  );
}

/**
 * Comedy search uses performing_arts_theater — that also returns symphonies, opera houses,
 * and concert halls. Those are not comedy clubs; label them live_music so copy, photos, and
 * Ticketmaster enrichment match.
 */
export function isLikelySymphonyOrConcertHallName(name: string): boolean {
  const n = String(name || "").toLowerCase();
  if (
    /\b(concert hall|symphony hall|orchestra hall|philharmonic)\b/.test(n) ||
    /\b(music hall|performance hall|recital hall|symphony center)\b/.test(n) ||
    /\b(performing arts center|performing arts hall)\b/.test(n) ||
    /\bopera house\b/.test(n) ||
    /\b(amphitheatre|amphitheater)\b/.test(n) ||
    (/\bopera\b/.test(n) && /\b(house|hall|theater|theatre|center|ballet)\b/.test(n))
  ) {
    return true;
  }
  return false;
}

/**
 * Google often tags famous food halls as tourist_attraction → our "scenic" search.
 * Fix category so copy + Unsplash queries match (indoor market, not beach sunset).
 */
export function normalizePlaceCategoryString(name: string, category: string): string {
  const n = String(name || "").toLowerCase();
  if (isLikelySymphonyOrConcertHallName(name)) {
    return "live_music";
  }
  if (
    /\bgrand central market\b/.test(n) ||
    /\banaheim packing (house|district)\b/.test(n) ||
    /\bmercado la paloma\b/.test(n)
  ) {
    return "market";
  }
  if (
    category === "scenic" &&
    /\b(market|mercado|food hall|public market|bazaar)\b/.test(n)
  ) {
    return "market";
  }
  return category;
}

export function normalizePlaceCategory(
  name: string,
  category: GenericPlaceType
): GenericPlaceType {
  return normalizePlaceCategoryString(name, category) as GenericPlaceType;
}

async function nearbySearch(params: {
  lat: number;
  lng: number;
  category: GenericPlaceType;
  maxResultCount?: number;
}) {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const body = {
    includedTypes: googleIncludedTypes(params.category),
    maxResultCount: params.maxResultCount ?? 4,
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: {
          latitude: params.lat,
          longitude: params.lng,
        },
        radius: 8000,
      },
    },
  };

  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY ?? "",
        "X-Goog-FieldMask": PLACES_LIST_FIELD_MASK,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

async function textSearch(params: {
  area: string;
  category: GenericPlaceType;
  maxResultCount?: number;
  weeHours?: boolean;
}) {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const body = {
    textQuery: categoryQuery(params.category, params.area, params.weeHours),
    maxResultCount: params.maxResultCount ?? 4,
  };

  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY ?? "",
        "X-Goog-FieldMask": PLACES_LIST_FIELD_MASK,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

function shufflePlaces<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function searchNearbyGenericPlaces(params: {
  area: string;
  categories: GenericPlaceType[];
  maxPerCategory?: number;
  lat?: number;
  lng?: number;
  /** After midnight ~5 AM: better text queries for late-night food, beach, bars */
  weeHours?: boolean;
}): Promise<GenericPlaceResult[]> {
  const { area, categories, maxPerCategory = 3, lat, lng, weeHours } = params;

  const all: GenericPlaceResult[] = [];

  /** Google returns popularity order — same top N every session. Pull a wider pool, shuffle, then slice. */
  const poolSize = Math.min(20, Math.max(maxPerCategory * 4, maxPerCategory + 6));

  for (const category of categories) {
    const rawPlaces =
      lat != null && lng != null
        ? await nearbySearch({
            lat,
            lng,
            category,
            maxResultCount: poolSize,
          })
        : await textSearch({
            area,
            category,
            maxResultCount: poolSize,
            weeHours,
          });

    const picked = shufflePlaces(rawPlaces).slice(0, maxPerCategory);

    for (const place of picked) {
      const pLat = place.location?.latitude;
      const pLng = place.location?.longitude;
      const distanceMeters =
        lat != null && lng != null
          ? haversineMeters(lat, lng, pLat, pLng)
          : undefined;

      const name = place.displayName?.text ?? "Nearby place";
      if (isGroceryOrErrandPlace(name, "", category)) continue;

      const resolvedCategory = normalizePlaceCategory(name, category);

      const openNow =
        place.currentOpeningHours?.openNow ??
        place.regularOpeningHours?.openNow;
      const hoursSummary = openingHoursLineFromGooglePlace(place);

      all.push({
        id: place.id ?? `${resolvedCategory}-${name}`,
        name,
        category: resolvedCategory,
        address: place.formattedAddress ?? area,
        mapQuery: name,
        distanceText: metersToMilesText(distanceMeters),
        priceText: mapPriceLevel(place.priceLevel),
        reservationNeeded: defaultReservationNeeded(category),
        reservationNote: defaultReservationNeeded(category)
          ? "Worth checking availability first."
          : undefined,
        rating: place.rating,
        openNow,
        hoursSummary,
        lat: pLat,
        lng: pLng,
      });
    }
  }

  return all;
}