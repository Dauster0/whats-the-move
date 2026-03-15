/**
 * Free place discovery using OpenStreetMap Overpass API.
 * No API key required. Returns real nearby places based on lat/lng.
 */

export type OverpassPlaceCategory =
  | "cafe"
  | "restaurant"
  | "park"
  | "bar"
  | "museum"
  | "bookstore"
  | "bakery"
  | "ice_cream"
  | "cinema"
  | "theatre"
  | "nightclub"
  | "gallery";

export type OverpassPlaceResult = {
  id: string;
  name: string;
  category: OverpassPlaceCategory;
  address: string;
  mapQuery: string;
  distanceText: string;
  distanceMeters: number;
  priceText: "$" | "$$" | "$$$";
  lat?: number;
  lng?: number;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function metersToMilesText(meters: number): string {
  if (meters < 0) return "Nearby";
  const miles = meters / 1609.34;
  if (miles < 0.1) return "0.1 mi away";
  if (miles < 1) return `${miles.toFixed(1)} mi away`;
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

function getOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
  categories: OverpassPlaceCategory[]
): string {
  const radius = Math.min(radiusMeters, 5000);
  const categoryToTags: Record<
    OverpassPlaceCategory,
    Array<[string, string] | [string, string, string]>
  > = {
    cafe: [["amenity", "cafe"], ["amenity", "coffee_shop"]],
    restaurant: [["amenity", "restaurant"], ["amenity", "fast_food"]],
    park: [["leisure", "park"], ["leisure", "garden"]],
    bar: [["amenity", "bar"], ["amenity", "pub"]],
    museum: [["tourism", "museum"]],
    bookstore: [["shop", "books"]],
    bakery: [["shop", "bakery"], ["amenity", "bakery"]],
    ice_cream: [["amenity", "ice_cream"]],
    cinema: [["amenity", "cinema"]],
    theatre: [["amenity", "theatre"], ["amenity", "arts_centre"]],
    nightclub: [["amenity", "nightclub"]],
    gallery: [["tourism", "gallery"], ["amenity", "arts_centre"]],
  };

  const parts: string[] = [];
  for (const cat of categories) {
    const tags = categoryToTags[cat] || [];
    for (const tag of tags) {
      const [k, v] = tag;
      parts.push(
        `nwr(around:${radius},${lat},${lng})["${k}"="${v}"];`
      );
    }
  }

  return `
[out:json][timeout:15];
(
  ${parts.join("\n  ")}
);
out center;
`;
}

function elementToPlace(
  el: any,
  category: OverpassPlaceCategory,
  userLat: number,
  userLng: number
): OverpassPlaceResult | null {
  const name = el.tags?.name || el.tags?.brand || el.tags?.operator;
  if (!name || name.length < 2) return null;
  const n = name.toLowerCase();
  if (n.includes("unnamed") || n === "place" || n === "unknown") return null;

  let lat: number, lng: number;
  if (el.type === "node") {
    lat = el.lat;
    lng = el.lon;
  } else if (el.center) {
    lat = el.center.lat;
    lng = el.center.lon;
  } else if (el.lat && el.lon) {
    lat = el.lat;
    lng = el.lon;
  } else {
    return null;
  }

  const distanceMeters = haversineMeters(userLat, userLng, lat, lng);
  const street = el.tags?.["addr:street"] || "";
  const housenumber = el.tags?.["addr:housenumber"] || "";
  const city = el.tags?.["addr:city"] || el.tags?.["addr:town"] || "";
  const address = [housenumber, street].filter(Boolean).join(" ") || city || "";

  return {
    id: `overpass-${el.type}-${el.id}`,
    name,
    category,
    address: address.trim() || "Nearby",
    mapQuery: name,
    distanceText: metersToMilesText(distanceMeters),
    distanceMeters,
    priceText: "$$",
    lat,
    lng,
  };
}

export async function searchOverpassPlaces(params: {
  lat: number;
  lng: number;
  categories: OverpassPlaceCategory[];
  radiusMeters?: number;
  maxPerCategory?: number;
}): Promise<OverpassPlaceResult[]> {
  const {
    lat,
    lng,
    categories,
    radiusMeters = 5000,
    maxPerCategory = 3,
  } = params;

  const query = getOverpassQuery(lat, lng, radiusMeters, categories);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const elements = data.elements || [];

    const byCategory: Record<string, OverpassPlaceResult[]> = {};
    for (const cat of categories) {
      byCategory[cat] = [];
    }

    for (const el of elements) {
      let matchedCategory: OverpassPlaceCategory | null = null;
      for (const cat of categories) {
        const tagPairs: Array<[string, string]> =
          cat === "cafe"
            ? [
                ["amenity", "cafe"],
                ["amenity", "coffee_shop"],
              ]
            : cat === "restaurant"
            ? [
                ["amenity", "restaurant"],
                ["amenity", "fast_food"],
              ]
            : cat === "park"
            ? [
                ["leisure", "park"],
                ["leisure", "garden"],
              ]
            : cat === "bar"
            ? [
                ["amenity", "bar"],
                ["amenity", "pub"],
              ]
            : cat === "museum"
            ? [["tourism", "museum"]]
            : cat === "bookstore"
            ? [["shop", "books"]]
            : cat === "bakery"
            ? [
                ["shop", "bakery"],
                ["amenity", "bakery"],
              ]
            : cat === "ice_cream"
            ? [["amenity", "ice_cream"]]
            : cat === "cinema"
            ? [["amenity", "cinema"]]
            : cat === "theatre"
            ? [
                ["amenity", "theatre"],
                ["amenity", "arts_centre"],
              ]
            : cat === "nightclub"
            ? [["amenity", "nightclub"]]
            : cat === "gallery"
            ? [
                ["tourism", "gallery"],
                ["amenity", "arts_centre"],
              ]
            : [];

        for (const [k, v] of tagPairs) {
          if (el.tags?.[k] === v) {
            matchedCategory = cat;
            break;
          }
        }
        if (matchedCategory) break;
      }

      if (matchedCategory) {
        const place = elementToPlace(el, matchedCategory, lat, lng);
        if (place && byCategory[matchedCategory].length < maxPerCategory) {
          byCategory[matchedCategory].push(place);
        }
      }
    }

    const out: OverpassPlaceResult[] = [];
    for (const cat of categories) {
      const list = byCategory[cat] || [];
      list.sort(
        (a, b) =>
          parseFloat(a.distanceText) - parseFloat(b.distanceText)
      );
      out.push(...list.slice(0, maxPerCategory));
    }

    out.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return out;
  } catch (err) {
    console.log("Overpass API error:", err);
    return [];
  }
}
