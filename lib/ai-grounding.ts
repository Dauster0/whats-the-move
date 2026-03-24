import { AICandidate, getCuratedExperiences } from "./curated-experiences";
import {
  extractEventNameHintFromTitle,
  isTicketmasterEventLikelyCancelled,
} from "./ticketmaster-pick";
import type { LiveEventResult } from "./live-event-search";
import {
  searchEventsForVenue,
  searchLiveEvents,
} from "./live-event-search";
import type { MovieShowtimeResult } from "./movie-showtimes";
import { searchMovieShowtimesForVenue } from "./movie-showtimes";
import {
  OverpassPlaceCategory,
  searchOverpassPlaces,
} from "./overpass-place-search";
import {
  normalizePlaceCategoryString,
  searchNearbyGenericPlaces,
} from "./live-place-search";
import {
  isLateNightOutHours,
  isNightlifeTime,
  isWeeHours,
} from "./time-of-day";
import {
  candidateMatchesHunger,
  hungerSortScore,
  type HungerPreference,
} from "./food-preference";
import { isEventDependentVenueCategory } from "./event-venue-gate";
import {
  isGroceryOrErrandPlace,
  isLateNightInappropriateVenue,
} from "./place-filters";
import type { UserPreferences } from "../store/move-context";
import { isCandidateProbablyClosedNow } from "./candidate-hours";
import { scoreCandidateForPreferences } from "./user-context-grounding";

type TimeRange = "1–15 min" | "10–30 min" | "30–60 min" | "1 hr+";

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ticketed venues: always try Ticketmaster + movie showtimes so titles look like
 * "[Artist] at [Venue] — 8:00 PM" instead of "check showtimes…".
 */
function venueNeedsTicketmasterEnrichment(
  category: string,
  exactTitle: string,
  sourceName: string
): boolean {
  const c = category.toLowerCase();
  const t = exactTitle || "";
  const s = sourceName || "";
  const ticketedVenueTypes = [
    "theatre",
    "theater",
    "cinema",
    "comedy",
    "live_music",
    "movie_theater",
  ];
  if (ticketedVenueTypes.includes(c)) return true;
  if (/\b(improv|comedy club)\b/i.test(s)) return true;
  return (
    t.includes("see what's") ||
    t.includes("for a show") ||
    t.includes("for a movie") ||
    /\b at \d/.test(t) ||
    /\b(improv|comedy club|theater|theatre|cinema)\b/i.test(s)
  );
}

/** Headline + subtitle after Ticketmaster (or similar) enrichment. */
function formatEnrichedEventHeadline(
  venueName: string,
  eventName: string,
  startTimeText?: string,
  dateText?: string
): { exactTitle: string; subtitle: string } {
  const v = venueName.trim();
  const e = eventName.trim();
  const subtitle =
    dateText && startTimeText
      ? `${e}, ${dateText}, ${startTimeText}`
      : startTimeText
        ? `${e}, ${startTimeText}`
        : e;
  const exactTitle =
    startTimeText && String(startTimeText).trim().length > 0
      ? `${e} at ${v}, ${startTimeText.trim()}`
      : `${e} tonight at ${v}`;
  return { exactTitle, subtitle };
}

function applyTicketmasterEnrichmentToCandidate(
  c: AICandidate,
  event: LiveEventResult
): boolean {
  const eventName = event.name?.trim() || "";
  if (!eventName || eventName === "Live event") return false;
  const { exactTitle, subtitle } = formatEnrichedEventHeadline(
    c.sourceName || "",
    eventName,
    event.startTimeText,
    event.dateText
  );
  c.exactTitle = exactTitle;
  c.subtitle = subtitle;
  c.externalUrl = event.url || c.externalUrl;
  c.dateText = event.dateText || "";
  c.startsAtText = event.startTimeText || "";
  if (event.url) c.actionType = "tickets";
  c.hasLiveListing = true;
  c.reasonHints = [
    event.url
      ? `${eventName} at ${c.sourceName}. Tap Get tickets below to lock seats in one step.`
      : `${eventName} at ${c.sourceName}. Lock the time and you are set.`,
  ];
  return true;
}

function applyMovieShowtimeToCandidate(
  c: AICandidate,
  movie: MovieShowtimeResult
): void {
  const v = (c.sourceName || "").trim();
  const m = movie.movieName.trim();
  if (!m) return;
  const sub =
    movie.dateText && movie.startTimeText
      ? `${m}, ${movie.dateText}, ${movie.startTimeText}`
      : movie.startTimeText
        ? `${m}, ${movie.startTimeText}`
        : m;
  c.exactTitle = movie.startTimeText
    ? `${m} at ${v}, ${movie.startTimeText}`
    : `${m} tonight at ${v}`;
  c.subtitle = sub;
  c.externalUrl = movie.url || c.externalUrl;
  if (movie.url) c.actionType = "tickets";
  c.hasLiveListing = true;
  c.reasonHints = [
    `${m} at ${v}. A real showtime beats scrolling trailers.`,
  ];
}

/** Ticketmaster + movie showtimes for a place row (mutates candidate when a listing is found). */
async function tryEnrichTicketedVenueCandidate(
  c: AICandidate,
  normalizedArea: string,
  lat: number | undefined,
  lng: number | undefined,
  nowMs: number
): Promise<void> {
  const needsEnrichment = venueNeedsTicketmasterEnrichment(
    c.category || "",
    c.exactTitle || "",
    c.sourceName || ""
  );
  if (!needsEnrichment) return;
  let enriched = false;
  const event = await searchEventsForVenue({
    venueName: c.sourceName,
    area: normalizedArea,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    eventNameHint: extractEventNameHintFromTitle(c.exactTitle || ""),
    nowMs,
  });
  if (event && applyTicketmasterEnrichmentToCandidate(c, event)) {
    enriched = true;
  }
  if (
    !enriched &&
    (c.category === "cinema" ||
      c.category === "theatre" ||
      c.category === "theater" ||
      c.category === "movie_theater") &&
    lat != null &&
    lng != null
  ) {
    const movie = await searchMovieShowtimesForVenue({
      venueName: c.sourceName,
      area: normalizedArea,
      lat,
      lng,
    });
    if (movie && movie.movieName) {
      applyMovieShowtimeToCandidate(c, movie);
    }
  }
}

/** Drop ticketed venues that still have placeholder copy (enrichment found nothing). */
function isGenericTicketedVenueCopy(c: AICandidate): boolean {
  const cat = (c.category || "").toLowerCase();
  if (
    !["movie_theater", "cinema", "theatre", "theater", "live_music", "comedy"].includes(
      cat
    )
  ) {
    return false;
  }
  const title = (c.exactTitle ?? "").toLowerCase();
  const genericSnippets = [
    "check showtimes for what",
    "check their schedule",
    "confirm showtimes",
    "pick a showtime in the app",
    "pick a showtime online",
    "live music venue, check",
    "live comedy, check their lineup",
    ", check showtimes",
    "check their lineup for tonight",
    "peek their lineup",
    "book or peek",
    "before you roll up",
    "their site",
    "on their site",
  ];
  return genericSnippets.some((p) => title.includes(p));
}

function uniqById(items: AICandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeAreaForCurated(area: string) {
  const a = area.toLowerCase();

  if (
    a.includes("university park") ||
    a.includes("north university park") ||
    a.includes("usc") ||
    a.includes("downtown la") ||
    a.includes("dtla") ||
    a.includes("los feliz") ||
    a.includes("silver lake") ||
    a.includes("west hollywood") ||
    a.includes("hollywood") ||
    a.includes("santa monica") ||
    a.includes("pasadena") ||
    a.includes("los angeles") ||
    a.includes("california")
  ) {
    return "Los Angeles";
  }

  if (
    a.includes("brooklyn") ||
    a.includes("manhattan") ||
    a.includes("queens") ||
    a.includes("new york")
  ) {
    return "New York";
  }

  if (a.includes("sf") || a.includes("san francisco")) {
    return "San Francisco";
  }

  if (
    a.includes("huntington beach") ||
    a.includes("orange county") ||
    a.includes("newport beach") ||
    a.includes("costa mesa") ||
    a.includes("irvine") ||
    a.includes("laguna beach") ||
    a.includes("dana point") ||
    a.includes("san clemente") ||
    a.includes("fullerton") ||
    a.includes("anaheim") ||
    a.includes("garden grove") ||
    a.includes("huntington beach")
  ) {
    return "Orange County";
  }

  return area;
}

/** Shown as Why go on the detail screen. Full sentences, friendly tone. */
function whyGoForCategory(
  category: string,
  distanceText: string
): string {
  const dist =
    distanceText && distanceText !== "Nearby"
      ? `About ${distanceText} from you. `
      : "";
  const lines: Record<string, string> = {
    comedy: `${dist}Stand up hits different in the room. When we match a bill, your card shows who and when.`,
    live_music: `${dist}Hearing it live beats a playlist. When we find listings, your card shows who is on and when.`,
    bowling: `${dist}Lanes and games give the night structure without overplanning.`,
    movie_theater: `${dist}You pick a showtime and the plan basically plans itself.`,
    scenic: `${dist}You get a real view and a real reason to be outside.`,
    market: `${dist}Food stalls and crowds make it feel like an outing, not an errand.`,
    gallery: `${dist}New work on the walls. Quick culture hit with a clear stop time.`,
    bookstore: `${dist}Browse something physical. Often calmer than a bar when you want out of the house.`,
    coffee: `${dist}A change of scene for coffee or laptop time.`,
    dessert: `${dist}Small treat when you want out but not a whole night.`,
    park: `${dist}Walk, sit, or loop a trail. No cover, just go.`,
    restaurant: `${dist}Sit down together beats another group chat about delivery.`,
    museum: `${dist}Indoor exhibits with a natural end time. Culture without a vague hang out.`,
    arcade: `${dist}Games and tickets give you we are doing something energy.`,
    nightclub: `${dist}If you want loud music and a crowd, this is your lane.`,
    cafe: `${dist}Coffee shop reset. Great for dates or solo work outside the house.`,
    bakery: `${dist}Fresh pastries or bread. Fast and specific.`,
    ice_cream: `${dist}Ice cream run. Simple win on a warm night.`,
    bar: `${dist}Drinks somewhere with a name and a vibe. Not your kitchen.`,
    cinema: `${dist}Same as streaming except you are out of the house together.`,
    theater: `${dist}Live show with a start time. Tickets turn maybe into a real plan.`,
    movie_event: `${dist}Ticketed show. Walk in for doors and you are done deciding.`,
    special_event: `${dist}Something real is on the calendar. Date, tide, or sky. Worth planning around.`,
    outdoor_event: `${dist}Outdoors with a reason to go beyond take a walk.`,
  };
  return (
    lines[category] ??
    `${dist}Named venue with hours and a front door. Easier to say yes than a vague idea.`
  );
}

function clampToTimeRange(
  candidate: AICandidate,
  timeRange: TimeRange,
  weeHours?: boolean
) {
  if (timeRange === "1–15 min") return candidate.durationMinutes <= 20;
  if (timeRange === "10–30 min") return candidate.durationMinutes <= 35;
  if (timeRange === "30–60 min")
    return candidate.durationMinutes >= 25 && candidate.durationMinutes <= 75;
  if (timeRange === "1 hr+")
    return weeHours ? candidate.durationMinutes >= 25 : candidate.durationMinutes >= 60;
  return candidate.durationMinutes >= 60;
}

function placeToCandidate(
  place: any,
  timeRange: TimeRange,
  opts?: { weeHours?: boolean }
): AICandidate | null {
  const weeHours = opts?.weeHours === true;
  const category = normalizePlaceCategoryString(
    String(place.name || ""),
    String(place.category || "")
  );

  let exactTitle = "";
  let subtitle = "";
  let durationMinutes = 45;
  let score = 6;

  if (category === "comedy") {
    exactTitle = `${place.name}, comedy tonight`;
    subtitle =
      "Sets and openers change often. When we match a show, the headline and time update here.";
    durationMinutes = 110;
    score = 10;
  } else if (category === "live_music") {
    exactTitle = `${place.name}, live show`;
    subtitle =
      "Touring acts, orchestra nights, or residencies. When we find tickets, the bill and time land on this card.";
    durationMinutes = 110;
    score = 10;
  } else if (category === "bowling") {
    exactTitle = `${place.name}, lanes, arcade, casual night out`;
    subtitle = "Reserve a lane or walk in. Weekends get busy.";
    durationMinutes = 90;
    score = 9;
  } else if (category === "movie_theater") {
    exactTitle = `${place.name}, movie night`;
    subtitle = "When we match a showtime, it shows up here so you are not hunting listings.";
    durationMinutes = 120;
    score = 9;
  } else if (category === "scenic") {
    if (weeHours) {
      exactTitle = `${place.name}, late night ocean air`;
      subtitle =
        "Beach, pier, or overlook. No ticket. Bring a layer and check the breeze.";
      durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    } else {
      exactTitle =
        timeRange === "1 hr+"
          ? `Visit ${place.name} for sunset`
          : `Visit ${place.name}`;
      subtitle = "Outdoor views. Bring a layer if it is breezy after dark.";
      durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    }
    score = 9;
  } else if (category === "market") {
    exactTitle = `${place.name}, food, vendors, people watching`;
    subtitle = "Vendors and hours shift. Peek day of before you head over.";
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 8;
  } else if (category === "gallery") {
    exactTitle = `${place.name}, art and local artists`;
    subtitle = "Free or ticketed entry. Check hours. Often quiet Mon and Tue.";
    durationMinutes = 60;
    score = 7;
  } else if (category === "bookstore") {
    exactTitle = `${place.name}, indie books and cozy browsing`;
    subtitle = "Browse or buy. Lots host readings. Peek their events page.";
    durationMinutes = timeRange === "10–30 min" ? 30 : 60;
    score = 7;
  } else if (category === "coffee") {
    exactTitle = weeHours
      ? `${place.name}, coffee or open late cafe`
      : `${place.name}, specialty coffee and seating`;
    subtitle = weeHours
      ? "Twenty four hour or late drive thru when you need caffeine now."
      : "Espresso and seating. Peak hours can get loud.";
    durationMinutes = 25;
    score = 6;
  } else if (category === "dessert") {
    exactTitle = weeHours
      ? `${place.name}, late night sweet stop`
      : `${place.name}, pastries, ice cream, sweet stuff`;
    subtitle = weeHours
      ? "Donuts, ice cream, or drive thru sugar when everything else is closed."
      : "Quick stop. Lines on weekend nights are normal.";
    durationMinutes = 25;
    score = 6;
  } else if (category === "park") {
    if (weeHours) {
      exactTitle = `${place.name}, walk it out by the water`;
      subtitle = "Waterfront path or big open space. Free and easy at weird hours.";
    } else {
      exactTitle =
        timeRange === "1 hr+"
          ? `${place.name}, green space, trails, paths`
          : `${place.name}, walking paths and green space`;
      subtitle = "Walking paths and open space. No ticket.";
    }
    durationMinutes = timeRange === "1 hr+" ? 60 : timeRange === "10–30 min" ? 20 : 45;
    score = timeRange === "1 hr+" ? 7 : 5;
  } else if (category === "restaurant") {
    exactTitle = weeHours
      ? `${place.name}, burgers, diners, or open late`
      : `${place.name}, casual dining, groups, date nights`;
    subtitle = weeHours
      ? "Fast food, drive thru, or diners that still serve after midnight."
      : "Sit down meal. Reserve on busy nights or expect a wait.";
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 7;
  } else if (category === "museum") {
    exactTitle = `${place.name}, rotating exhibits worth a visit`;
    subtitle = "Timed entry is common. Hours and tickets usually show in Maps below.";
    durationMinutes = 90;
    score = 7;
  } else if (category === "arcade") {
    exactTitle = `${place.name}, arcade games, playful night out`;
    subtitle = "Games and tickets or credits. Expect kids before nine at lots of spots.";
    durationMinutes = 90;
    score = 8;
  } else if (category === "nightclub") {
    exactTitle = weeHours
      ? `${place.name}, dance floor still bumping`
      : `${place.name}, DJs, dance floor, night out`;
    subtitle = weeHours
      ? "Warehouse, club, or late room. Check cover, door time, and ID."
      : "Cover and dress codes are common. Peak energy is usually after ten.";
    durationMinutes = 180;
    score = 10;
  } else if (category === "cafe") {
    exactTitle = `${place.name}, coffee, seating, work or catch ups`;
    subtitle = "Coffee and light food. Laptops work at lots of spots.";
    durationMinutes = 25;
    score = 7;
  } else if (category === "bakery" || category === "ice_cream") {
    exactTitle = category === "bakery"
      ? `${place.name}, fresh pastries, bread, desserts`
      : `${place.name}, handmade ice cream and treats`;
    subtitle = "Grab and go. Closing can be early evening.";
    durationMinutes = 25;
    score = 6;
  } else if (category === "bar") {
    exactTitle = weeHours
      ? `${place.name}, karaoke, pool, last call`
      : `${place.name}, cocktails, late night vibe`;
    subtitle = weeHours
      ? "Pub, karaoke room, or sports bar. Twenty one plus. Confirm hours in Maps."
      : "Bar seating. Twenty one plus. Busiest Thu through Sat.";
    durationMinutes = 60;
    score = 8;
  } else if (category === "cinema") {
    exactTitle = `${place.name}, movie night`;
    subtitle = "Showtimes appear here when we can match them. Concessions inside.";
    durationMinutes = 120;
    score = 9;
  } else if (category === "theatre" || category === "theater") {
    exactTitle = `${place.name}, live performance`;
    subtitle =
      "Plays, dance, or variety. When we match a show, you get the title and time on this card.";
    durationMinutes = 120;
    score = 9;
  } else {
    return null;
  }

  const hoursSummary =
    typeof place.hoursSummary === "string" && place.hoursSummary.trim().length > 0
      ? place.hoursSummary.trim()
      : undefined;

  const normalizedCategory = category === "theatre" ? "theater" : category;
  return {
    id: `place-${place.id}`,
    kind: "place",
    category: normalizedCategory,
    exactTitle,
    sourceName: place.name,
    subtitle,
    hoursSummary,
    reasonHints: [
      whyGoForCategory(normalizedCategory, place.distanceText || "Nearby"),
    ],
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
    openNow: typeof place.openNow === "boolean" ? place.openNow : undefined,
  };
}


function eventToCandidate(event: any): AICandidate | null {
  const rawName = String(event?.name ?? "");
  if (isTicketmasterEventLikelyCancelled({ name: rawName })) return null;

  const venue = event.venueName || "this venue";
  const eventName = event.name || "the event";
  const { exactTitle, subtitle: sub } = formatEnrichedEventHeadline(
    venue,
    eventName,
    event.startTimeText,
    event.dateText
  );

  return {
    id: `event-${event.id}`,
    kind: "event",
    category: event.category || "event",
    exactTitle,
    sourceName: venue,
    subtitle: sub,
    reasonHints: [
      `${eventName} at ${venue}. You get doors and a showtime in one plan.`,
    ],
    durationMinutes: 120,
    address: event.address || "",
    mapQuery: event.mapQuery || venue,
    actionType: event.url ? "tickets" : "maps",
    externalUrl: event.url || "",
    distanceText: event.distanceText || "Nearby",
    priceText: event.priceText || "$$",
    startsAtText: event.startTimeText || "",
    dateText: event.dateText || "",
    hasLiveListing: true,
    score: 10,
  };
}

export async function getAIGrounding(params: {
  area: string;
  lat?: number;
  lng?: number;
  mood: string;
  timeRange: string;
  /** ISO time from the device — used for late-night / nightlife rules. */
  currentTime?: string;
  /** Prefer food vs avoid food venues. */
  hunger?: HungerPreference;
  /** On-device profile — soft-weights curated & discovered candidates like expand-moves. */
  preferences?: UserPreferences;
}) {
  const {
    area,
    lat,
    lng,
    timeRange,
    currentTime: currentTimeIso,
    hunger = "any",
    preferences,
  } = params;
  const range = timeRange as TimeRange;
  const normalizedArea = normalizeAreaForCurated(area);
  const now = currentTimeIso ? new Date(currentTimeIso) : new Date();
  const wallClock = Number.isNaN(now.getTime()) ? new Date() : now;
  const nowMs = wallClock.getTime();
  const nightlifeOk = isNightlifeTime(wallClock);
  const lateNight = isLateNightOutHours(wallClock);
  /** ~midnight–6 AM — prioritize bars, late food, beach, clubs over museums. */
  const weeHours = isWeeHours(wallClock);

  const curated = shuffleArray(
    getCuratedExperiences(normalizedArea)
      .filter((c) => clampToTimeRange(c, range, weeHours))
      .filter((c) => {
        if (!nightlifeOk) {
          if (c.category === "nightclub" || c.category === "bar") return false;
          const t = (c.exactTitle ?? "").toLowerCase();
          if (t.includes("clubbing") || t.includes("craft cocktails") || t.includes("grab a drink")) return false;
        }
        return true;
      })
  ).slice(0, 6);

  for (const c of curated) {
    await tryEnrichTicketedVenueCandidate(c, normalizedArea, lat, lng, nowMs);
  }

  const overpassCategories: OverpassPlaceCategory[] =
    range === "1 hr+"
      ? nightlifeOk
        ? ["restaurant", "bar", "nightclub", "cinema", "theatre", "museum", "park", "gallery"]
        : ["restaurant", "cinema", "theatre", "museum", "park", "gallery"]
      : range === "30–60 min"
      ? ["cafe", "restaurant", "park", "museum", "bookstore", "gallery", "bakery"]
      : range === "1–15 min"
      ? ["cafe", "park", "bakery", "ice_cream"]
      : ["cafe", "restaurant", "park", "bookstore", "bakery", "ice_cream"];

  let overpassCandidates: AICandidate[] = [];
  if (lat != null && lng != null) {
    const overpassPlaces = await searchOverpassPlaces({
      lat,
      lng,
      categories: overpassCategories,
      radiusMeters: 5000,
      maxPerCategory: 3,
    });
    overpassCandidates = overpassPlaces
      .map((p) => placeToCandidate(p, range, { weeHours }))
      .filter(Boolean) as AICandidate[];

    for (const c of overpassCandidates) {
      await tryEnrichTicketedVenueCandidate(c, normalizedArea, lat, lng, nowMs);
    }
    console.log("AI GROUNDING Overpass places:", overpassPlaces.length, "-> candidates:", overpassCandidates.length);
  }

  const placeCategories =
    range === "1 hr+"
      ? weeHours && nightlifeOk
        ? [
            "bar",
            "restaurant",
            "nightclub",
            "scenic",
            "dessert",
            "coffee",
            "park",
            "live_music",
            "movie_theater",
            "market",
            "comedy",
          ]
        : nightlifeOk
        ? [
            "comedy",
            "live_music",
            "nightclub",
            "movie_theater",
            "scenic",
            "market",
            "gallery",
            "restaurant",
            "bowling",
            "museum",
            "arcade",
          ]
        : [
            "comedy",
            "movie_theater",
            "scenic",
            "market",
            "gallery",
            "restaurant",
            "bowling",
            "museum",
            "arcade",
          ]
      : range === "30–60 min"
      ? weeHours && nightlifeOk
        ? ["restaurant", "bar", "dessert", "scenic", "park", "nightclub", "bookstore"]
        : ["bookstore", "gallery", "market", "scenic", "restaurant", "park", "dessert"]
      : range === "1–15 min"
      ? ["coffee", "park", "dessert"]
      : ["coffee", "dessert", "bookstore", "park", "market"];

  const eventCategories =
    range === "1 hr+"
      ? ["comedy", "live_music", "theater", "sports_event"]
      : range === "30–60 min"
      ? ["comedy", "live_music"]
      : [];

  const nearbyPlacesRaw = await searchNearbyGenericPlaces({
    area: normalizedArea,
    categories: placeCategories as any,
    maxPerCategory:
      weeHours && nightlifeOk && range === "1 hr+" ? 3 : 2,
    lat,
    lng,
    weeHours: weeHours && nightlifeOk,
  });

  const nearbyEventsRaw =
    eventCategories.length > 0
      ? await searchLiveEvents({
          area: normalizedArea,
          lat,
          lng,
          categories: eventCategories as any,
          size: 5,
          nowMs,
        })
      : [];

  const placeCandidates = nearbyPlacesRaw
    .map((place) => placeToCandidate(place, range, { weeHours }))
    .filter(Boolean) as AICandidate[];

  for (const c of placeCandidates) {
    await tryEnrichTicketedVenueCandidate(c, normalizedArea, lat, lng, nowMs);
  }

  const eventCandidates = nearbyEventsRaw
    .map((event) => eventToCandidate(event))
    .filter(Boolean) as AICandidate[];

  let candidates = uniqById([
    ...overpassCandidates,
    ...eventCandidates,
    ...placeCandidates,
    ...curated,
  ]);

  candidates = candidates.filter((c) => {
    if (!isEventDependentVenueCategory(c.category)) return true;
    return c.hasLiveListing === true;
  });

  candidates = candidates.filter((c) => {
    if (isGroceryOrErrandPlace(c.sourceName ?? "", c.exactTitle, c.category)) {
      return false;
    }
    if (lateNight && isLateNightInappropriateVenue(c.sourceName ?? "", c.exactTitle, c.category)) {
      return false;
    }
    if (isGenericTicketedVenueCopy(c)) return false;
    return true;
  });

  // Don't show theatre/cinema venues without specific show names—no "see what's on"
  candidates = candidates.filter((c) => {
    const isScreenVenue = ["theatre", "theater", "cinema", "movie_theater"].includes(
      c.category
    );
    const hasGenericTitle =
      c.exactTitle?.includes("see what's on") ||
      c.exactTitle?.includes("see what's playing");
    if (isScreenVenue && hasGenericTitle) return false;
    return true;
  });

  // Filter out bad/generic suggestions
  candidates = candidates.filter((c) => {
    const t = (c.exactTitle ?? "").toLowerCase();
    const s = (c.sourceName ?? "").toLowerCase();
    if (t.includes("unnamed") || s.includes("unnamed")) return false;
    if (t.includes("unnamed place")) return false;
    return true;
  });

  // Drop Google-backed venues that report closed now (hours come from Places list search).
  candidates = candidates.filter((c) => {
    if (c.kind === "event") return true;
    if (c.hasLiveListing) return true;
    return !isCandidateProbablyClosedNow(c);
  });

  // No bars or nightlife at noon—filter when it's daytime
  if (!nightlifeOk) {
    candidates = candidates.filter((c) => {
      if (c.category === "nightclub" || c.category === "bar") return false;
      const t = (c.exactTitle ?? "").toLowerCase();
      if (t.includes("clubbing") || t.includes("go clubbing")) return false;
      if (t.includes("craft cocktails") || t.includes("grab a drink")) return false;
      return true;
    });
  }

  if (hunger !== "any") {
    candidates = candidates.filter((c) => candidateMatchesHunger(c.category, hunger));
  }

  if (range === "1 hr+") {
    const allowedCategories = [
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
      "park",
      "restaurant",
      "gallery",
      "special_event",
      "outdoor_event",
      "event",
      "sports_event",
    ];
    if (nightlifeOk) {
      allowedCategories.push("bar", "nightclub");
    }
    if (weeHours && nightlifeOk) {
      allowedCategories.push("dessert", "coffee");
    }
    const minDur =
      weeHours && nightlifeOk ? 25 : 60;
    candidates = candidates
      .filter((c) => c.durationMinutes >= minDur)
      .filter((c) => allowedCategories.includes(c.category));
  }

  if (candidates.length === 0) {
    const fallbackCurated = getCuratedExperiences("Los Angeles").filter((c) =>
      clampToTimeRange(c, range, weeHours)
    );
    if (range === "1 hr+") {
      const fallbackCats = [
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
        "special_event",
        "outdoor_event",
        "event",
      ];
      if (nightlifeOk) fallbackCats.push("nightclub", "bar");
      if (weeHours && nightlifeOk) {
        fallbackCats.push("restaurant", "scenic", "dessert", "coffee", "live_music");
      }
      candidates = fallbackCurated.filter(
        (c) =>
          c.durationMinutes >= 60 &&
          fallbackCats.includes(c.category)
      );
    } else {
      candidates = fallbackCurated;
    }
    candidates = candidates.slice(0, 12);
    console.log("AI GROUNDING: Using LA fallback, candidates:", candidates.length);
  }

  if (range === "1–15 min") {
    candidates = candidates.filter((c) => c.durationMinutes <= 20);
  }

  if (range === "10–30 min") {
    candidates = candidates.filter((c) => c.durationMinutes <= 35);
  }

  if (range === "30–60 min") {
    candidates = candidates.filter(
      (c) => c.durationMinutes >= 25 && c.durationMinutes <= 75
    );
  }

  function rightNowTier(c: AICandidate): number {
    if (c.openNow === true) return 4;
    if (c.kind === "event") return 3;
    const cat = (c.category || "").toLowerCase();
    if (["park", "scenic", "trail", "outdoor_event"].includes(cat)) return 2;
    return 0;
  }

  function weeHoursMoveBoost(category: string | undefined, openNow?: boolean): number {
    const c = (category || "").toLowerCase();
    let boost = 0;
    if (
      ["bar", "nightclub", "restaurant", "scenic", "dessert", "park", "coffee"].includes(
        c
      )
    ) {
      boost += 45;
    }
    if (["live_music", "movie_theater", "market", "comedy"].includes(c)) boost += 12;
    if (["museum", "gallery", "bowling", "arcade"].includes(c)) boost -= 30;
    if (openNow) boost += 55;
    return boost;
  }

  candidates = candidates
    .sort((a, b) => {
      const rn = rightNowTier(b) - rightNowTier(a);
      if (rn !== 0) return rn;
      const on =
        (b.openNow === true ? 1 : 0) - (a.openNow === true ? 1 : 0);
      if (on !== 0) return on;
      const pref =
        scoreCandidateForPreferences(b, preferences) -
        scoreCandidateForPreferences(a, preferences);
      if (pref !== 0) return pref;
      const h = hungerSortScore(b.category, hunger) - hungerSortScore(a.category, hunger);
      if (h !== 0) return h;
      if (weeHours && nightlifeOk) {
        const w =
          weeHoursMoveBoost(b.category, b.openNow) -
          weeHoursMoveBoost(a.category, a.openNow);
        if (w !== 0) return w;
      }
      /** Prefer real dated events (Ticketmaster, etc.) over generic venue rows. */
      const ev =
        (b.kind === "event" ? 3 : 0) - (a.kind === "event" ? 3 : 0);
      if (ev !== 0) return ev;
      return b.score - a.score;
    })
    .slice(0, 18);
  function shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  // Keep ranking (open now first). Light shuffle only among same right-now tier for variety.
  const top = candidates.slice(0, 16);
  const tierOf = (c: AICandidate) => rightNowTier(c) * 10 + (c.openNow === true ? 1 : 0);
  const byTier = new Map<number, AICandidate[]>();
  for (const c of top) {
    const t = tierOf(c);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(c);
  }
  const tiers = Array.from(byTier.keys()).sort((a, b) => b - a);
  const mixed: AICandidate[] = [];
  for (const t of tiers) {
    mixed.push(...shuffle(byTier.get(t)!));
  }
  candidates = mixed.slice(0, 12);

  console.log("AI GROUNDING AREA:", area, "->", normalizedArea);
  console.log(
    "AI GROUNDING CANDIDATES:",
    candidates.map((c) => ({
      title: c.exactTitle,
      category: c.category,
      duration: c.durationMinutes,
      score: c.score,
    }))
  );

  return { candidates };
}