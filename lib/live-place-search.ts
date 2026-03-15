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
  whyItFits?: string;
  lat?: number;
  lng?: number;
};

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

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
    case "gallery":
      return ["art_gallery"];
    case "scenic":
      return ["tourist_attraction", "observation_deck"];
    case "market":
      return ["market", "shopping_mall"];
    case "restaurant":
      return ["restaurant"];
    default:
      return ["restaurant"];
  }
}

function categoryQuery(category: GenericPlaceType, area: string) {
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
      return `parks in ${area}`;
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
      return `nightclubs in ${area}`;
    case "gallery":
      return `art galleries in ${area}`;
    case "scenic":
      return `sunset viewpoints in ${area}`;
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
    category === "nightclub"
  );
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
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours.openNow,places.priceLevel",
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
}) {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const body = {
    textQuery: categoryQuery(params.category, params.area),
    maxResultCount: params.maxResultCount ?? 4,
  };

  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY ?? "",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours.openNow,places.priceLevel",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

export async function searchNearbyGenericPlaces(params: {
  area: string;
  categories: GenericPlaceType[];
  maxPerCategory?: number;
  lat?: number;
  lng?: number;
}): Promise<GenericPlaceResult[]> {
  const { area, categories, maxPerCategory = 3, lat, lng } = params;

  const all: GenericPlaceResult[] = [];

  for (const category of categories) {
    const rawPlaces =
      lat != null && lng != null
        ? await nearbySearch({
            lat,
            lng,
            category,
            maxResultCount: maxPerCategory,
          })
        : await textSearch({
            area,
            category,
            maxResultCount: maxPerCategory,
          });

    for (const place of rawPlaces) {
      const pLat = place.location?.latitude;
      const pLng = place.location?.longitude;
      const distanceMeters =
        lat != null && lng != null
          ? haversineMeters(lat, lng, pLat, pLng)
          : undefined;

      const name = place.displayName?.text ?? "Nearby place";

      all.push({
        id: place.id ?? `${category}-${name}`,
        name,
        category,
        address: place.formattedAddress ?? area,
        mapQuery: name,
        distanceText: metersToMilesText(distanceMeters),
        priceText: mapPriceLevel(place.priceLevel),
        reservationNeeded: defaultReservationNeeded(category),
        reservationNote: defaultReservationNeeded(category)
          ? "Worth checking availability first."
          : undefined,
        rating: place.rating,
        openNow: place.regularOpeningHours?.openNow,
        lat: pLat,
        lng: pLng,
      });
    }
  }

  return all;
}