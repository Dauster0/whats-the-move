export type LiveEventCategory =
  | "comedy"
  | "live_music"
  | "movie_event"
  | "sports_event"
  | "theater";

export type LiveEventResult = {
  id: string;
  name: string;
  category: LiveEventCategory;
  venueName: string;
  address: string;
  distanceText: string;
  startTimeText: string;
  dateText: string;
  priceText: "$" | "$$" | "$$$";
  url?: string;
  mapQuery: string;
  reservationNeeded: boolean;
  reservationNote?: string;
};

import {
  filterTicketmasterEventsForImmediateOuting,
  filterUpcomingTicketmasterEvents,
  getEventStartTimezone,
  pickBestTicketmasterEvent,
} from "./ticketmaster-pick";

const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;

function formatPrice(segmentName?: string): "$" | "$$" | "$$$" {
  if (!segmentName) return "$$";
  const lower = segmentName.toLowerCase();
  if (lower.includes("free")) return "$";
  if (lower.includes("vip") || lower.includes("premium")) return "$$$";
  return "$$";
}

function categoryToKeyword(category: LiveEventCategory) {
  switch (category) {
    case "comedy":
      return "comedy";
    case "live_music":
      return "concert";
    case "movie_event":
      return "movie";
    case "sports_event":
      return "sports";
    case "theater":
      return "theater";
    default:
      return "event";
  }
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

function formatDate(date?: string) {
  if (!date) return "Soon";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Soon";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatTime(date?: string, timeZone?: string) {
  if (!date) return "Later today";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Later today";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export async function searchLiveEvents(params: {
  area: string;
  lat?: number;
  lng?: number;
  categories: LiveEventCategory[];
  size?: number;
  /** Wall-clock "now" for same-day / not-past filtering (device time). */
  nowMs?: number;
}): Promise<LiveEventResult[]> {
  const { area, lat, lng, categories, size = 5, nowMs = Date.now() } = params;

  if (!TICKETMASTER_API_KEY) return [];

  const out: LiveEventResult[] = [];

  for (const category of categories) {
    const keyword = categoryToKeyword(category);

    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_API_KEY);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("size", String(size));
    url.searchParams.set("sort", "date,asc");

    if (lat != null && lng != null) {
      url.searchParams.set("latlong", `${lat},${lng}`);
      url.searchParams.set("radius", "20");
      url.searchParams.set("unit", "miles");
    } else {
      url.searchParams.set("city", area);
    }

    try {
      const res = await fetch(url.toString());
      if (!res.ok) continue;

      const data = await res.json();
      const raw = data?._embedded?.events ?? [];
      const events = filterTicketmasterEventsForImmediateOuting(
        filterUpcomingTicketmasterEvents(raw, nowMs),
        nowMs
      );

      for (const event of events) {
        const venue = event?._embedded?.venues?.[0];
        const venueLat = venue?.location?.latitude
          ? Number(venue.location.latitude)
          : undefined;
        const venueLng = venue?.location?.longitude
          ? Number(venue.location.longitude)
          : undefined;

        const distanceMeters =
          lat != null && lng != null
            ? haversineMeters(lat, lng, venueLat, venueLng)
            : undefined;

        out.push({
          id: event.id,
          name: event.name ?? "Live event",
          category,
          venueName: venue?.name ?? "Venue nearby",
          address:
            venue?.address?.line1 ||
            venue?.city?.name ||
            area ||
            "Nearby venue",
          distanceText: metersToMilesText(distanceMeters),
          startTimeText: formatTime(
            event?.dates?.start?.dateTime,
            getEventStartTimezone(event)
          ),
          dateText: formatDate(event?.dates?.start?.localDate),
          priceText: formatPrice(event?.classifications?.[0]?.segment?.name),
          url: event?.url,
          mapQuery: venue?.name ?? event.name ?? "Event venue",
          reservationNeeded: true,
          reservationNote: "Check tickets before you go.",
        });
      }
    } catch {
      // ignore this category and continue
    }
  }

  return out;
}

async function fetchEventsForKeyword(
  keyword: string,
  area?: string,
  lat?: number,
  lng?: number
): Promise<any[]> {
  if (!TICKETMASTER_API_KEY || !keyword || keyword.length < 2) return [];
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_API_KEY);
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

export async function searchEventsForVenue(params: {
  venueName: string;
  area?: string;
  lat?: number;
  lng?: number;
  /** Match performer/show name from card title (e.g. "Mo Amer" from "Brea Improv — Mo Amer at 7 PM"). */
  eventNameHint?: string;
  nowMs?: number;
}): Promise<LiveEventResult | null> {
  const { venueName, area, lat, lng, eventNameHint = "", nowMs = Date.now() } = params;
  if (!venueName || venueName.length < 3) return null;

  const vn = venueName.trim();

  const keywordsToTry = [
    vn,
    vn.replace(/\s+(Theater|Theatre|Cinema)\s*$/i, "").trim(),
    vn.split(/\s+/).slice(0, 3).join(" "),
    vn.split(/\s+/).slice(0, 2).join(" "),
  ].filter((k) => k.length >= 3);

  const seenKw = new Set<string>();
  const uniqueKeywords = keywordsToTry.filter((k) => {
    const key = k.toLowerCase();
    if (seenKw.has(key)) return false;
    seenKw.add(key);
    return true;
  });

  const allEvents: any[] = [];
  const seenIds = new Set<string>();
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

  const venue = best?._embedded?.venues?.[0];
  const venueLat = venue?.location?.latitude
    ? Number(venue.location.latitude)
    : undefined;
  const venueLng = venue?.location?.longitude
    ? Number(venue.location.longitude)
    : undefined;
  const distanceMeters =
    lat != null && lng != null
      ? haversineMeters(lat, lng, venueLat, venueLng)
      : undefined;
  const eventName = best.name ?? "Live event";
  if (!eventName || eventName === "Live event") return null;

  return {
    id: best.id,
    name: eventName,
    category: "theater",
    venueName: venue?.name ?? venueName,
    address:
      venue?.address?.line1 ||
      venue?.city?.name ||
      area ||
      "Nearby venue",
    distanceText: metersToMilesText(distanceMeters),
    startTimeText: formatTime(
      best?.dates?.start?.dateTime,
      getEventStartTimezone(best)
    ),
    dateText: formatDate(best?.dates?.start?.localDate),
    priceText: formatPrice(best?.classifications?.[0]?.segment?.name),
    url: best?.url,
    mapQuery: venue?.name ?? venueName,
    reservationNeeded: true,
    reservationNote: "Check tickets before you go.",
  };
}