import { AICandidate, getCuratedExperiences } from "./curated-experiences";
import {
  searchEventsForVenue,
  searchLiveEvents,
} from "./live-event-search";
import { searchMovieShowtimesForVenue } from "./movie-showtimes";
import {
  OverpassPlaceCategory,
  searchOverpassPlaces,
} from "./overpass-place-search";
import { searchNearbyGenericPlaces } from "./live-place-search";
import { isNightlifeTime } from "./time-of-day";

type TimeRange = "1–15 min" | "10–30 min" | "30–60 min" | "1 hr+";

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

  return area;
}

function clampToTimeRange(candidate: AICandidate, timeRange: TimeRange) {
  if (timeRange === "1–15 min") return candidate.durationMinutes <= 20;
  if (timeRange === "10–30 min") return candidate.durationMinutes <= 35;
  if (timeRange === "30–60 min")
    return candidate.durationMinutes >= 25 && candidate.durationMinutes <= 75;
  return candidate.durationMinutes >= 60;
}

function placeToCandidate(place: any, timeRange: TimeRange): AICandidate | null {
  const category = place.category as string;

  let exactTitle = "";
  let subtitle = "";
  let durationMinutes = 45;
  let score = 6;

  if (category === "comedy") {
    exactTitle = `${place.name} — live comedy, check their lineup for tonight's acts`;
    subtitle = "A fun, named venue with a clear plan";
    durationMinutes = 110;
    score = 10;
  } else if (category === "live_music") {
    exactTitle = `${place.name} — live music venue, check their schedule`;
    subtitle = "A named venue that feels worth leaving for";
    durationMinutes = 110;
    score = 10;
  } else if (category === "bowling") {
    exactTitle = `${place.name} — lanes, arcade, and a casual night out`;
    subtitle = "A specific activity with built-in structure";
    durationMinutes = 90;
    score = 9;
  } else if (category === "movie_theater") {
    exactTitle = `${place.name} — check showtimes for what's playing`;
    subtitle = "A structured night plan with a clear destination";
    durationMinutes = 120;
    score = 9;
  } else if (category === "scenic") {
    exactTitle =
      timeRange === "1 hr+"
        ? `Visit ${place.name} for sunset`
        : `Visit ${place.name}`;
    subtitle = "A scenic destination with a real payoff";
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 9;
  } else if (category === "market") {
    exactTitle = `${place.name} — food, vendors, and people-watching`;
    subtitle = "A destination with energy built in";
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 8;
  } else if (category === "gallery") {
    exactTitle = `${place.name} — art exhibitions and local artists`;
    subtitle = "Rotating shows and installations";
    durationMinutes = 60;
    score = 7;
  } else if (category === "bookstore") {
    exactTitle = `${place.name} — independent books, cozy browsing`;
    subtitle = "A calm destination with an actual place attached";
    durationMinutes = timeRange === "10–30 min" ? 30 : 60;
    score = 7;
  } else if (category === "coffee") {
    exactTitle = `${place.name} — specialty coffee, cozy seating, good for working or catching up`;
    subtitle = "Worth leaving for";
    durationMinutes = 25;
    score = 6;
  } else if (category === "dessert") {
    exactTitle = `${place.name} — fresh pastries, ice cream, and sweet treats`;
    subtitle = "Specific, easy, and better than scrolling";
    durationMinutes = 25;
    score = 6;
  } else if (category === "park") {
    exactTitle =
      timeRange === "1 hr+"
        ? `${place.name} — green space, trails, and outdoor paths`
        : `${place.name} — walking paths and green space`;
    subtitle = "A named outdoor reset";
    durationMinutes = timeRange === "1 hr+" ? 60 : timeRange === "10–30 min" ? 20 : 45;
    score = timeRange === "1 hr+" ? 7 : 5;
  } else if (category === "restaurant") {
    exactTitle = `${place.name} — casual dining, good for groups and date nights`;
    subtitle = "A real meal plan instead of drifting";
    durationMinutes = timeRange === "1 hr+" ? 90 : 45;
    score = 7;
  } else if (category === "museum") {
    exactTitle = `${place.name} — rotating exhibits and collections worth a visit`;
    subtitle = "A real destination with built-in structure";
    durationMinutes = 90;
    score = 7;
  } else if (category === "arcade") {
    exactTitle = `${place.name} — arcade games and a playful night out`;
    subtitle = "A playful outing with a specific destination";
    durationMinutes = 90;
    score = 8;
  } else if (category === "nightclub") {
    exactTitle = `${place.name} — DJs, dance floor, and a night out`;
    subtitle = "Worth leaving for";
    durationMinutes = 180;
    score = 10;
  } else if (category === "cafe") {
    exactTitle = `${place.name} — specialty coffee, cozy seating, good for working or catching up`;
    subtitle = "Worth leaving for";
    durationMinutes = 25;
    score = 7;
  } else if (category === "bakery" || category === "ice_cream") {
    exactTitle = category === "bakery"
      ? `${place.name} — fresh pastries, bread, and desserts`
      : `${place.name} — handmade ice cream and sweet treats`;
    subtitle = "Specific destination, low effort";
    durationMinutes = 25;
    score = 6;
  } else if (category === "bar") {
    exactTitle = `${place.name} — craft cocktails and late-night vibe`;
    subtitle = "Worth leaving for";
    durationMinutes = 60;
    score = 8;
  } else if (category === "cinema") {
    exactTitle = `${place.name} — check showtimes for what's playing`;
    subtitle = "Grab a movie and snacks";
    durationMinutes = 120;
    score = 9;
  } else if (category === "theatre" || category === "theater") {
    exactTitle = `${place.name} — comedy, music, or variety, check their lineup`;
    subtitle = "Check their schedule for tonight's show";
    durationMinutes = 120;
    score = 9;
  } else {
    return null;
  }

  const normalizedCategory = category === "theatre" ? "theater" : category;
  return {
    id: `place-${place.id}`,
    kind: "place",
    category: normalizedCategory,
    exactTitle,
    sourceName: place.name,
    subtitle,
    reasonHints: ["named place", "specific destination"],
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


function eventToCandidate(event: any): AICandidate | null {
  const venue = event.venueName || "this venue";
  const eventName = event.name || "the event";
  const time = event.startTimeText ? ` at ${event.startTimeText}` : "";
  const isGeneric = /tonight.s (set|show|acts?)|live (event|music|comedy)/i.test(eventName);
  const exactTitle = isGeneric
    ? `${venue} — ${eventName}${time}, check their lineup`
    : `${venue} — ${eventName}${time}`;

  return {
    id: `event-${event.id}`,
    kind: "event",
    category: event.category || "event",
    exactTitle,
    sourceName: venue,
    subtitle: "A real event happening soon",
    reasonHints: ["timed event", "named venue"],
    durationMinutes: 120,
    address: event.address || "",
    mapQuery: event.mapQuery || venue,
    actionType: event.url ? "tickets" : "maps",
    externalUrl: event.url || "",
    distanceText: event.distanceText || "Nearby",
    priceText: event.priceText || "$$",
    startsAtText: event.startTimeText || "",
    score: 10,
  };
}

export async function getAIGrounding(params: {
  area: string;
  lat?: number;
  lng?: number;
  mood: string;
  timeRange: string;
}) {
  const { area, lat, lng, timeRange } = params;
  const range = timeRange as TimeRange;
  const normalizedArea = normalizeAreaForCurated(area);
  const nightlifeOk = isNightlifeTime();

  const curated = getCuratedExperiences(normalizedArea)
    .filter((c) => clampToTimeRange(c, range))
    .filter((c) => {
      if (!nightlifeOk) {
        if (c.category === "nightclub" || c.category === "bar") return false;
        const t = (c.exactTitle ?? "").toLowerCase();
        if (t.includes("clubbing") || t.includes("craft cocktails") || t.includes("grab a drink")) return false;
      }
      return true;
    });

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
      .map((p) => placeToCandidate(p, range))
      .filter(Boolean) as AICandidate[];

    for (const c of overpassCandidates) {
      const needsEnrichment =
        (c.category === "theatre" || c.category === "theater" || c.category === "cinema") &&
        (c.exactTitle.includes("see what's") || c.exactTitle.includes("for a show") || c.exactTitle.includes("for a movie"));
      if (needsEnrichment) {
        let enriched = false;
        const event = await searchEventsForVenue({
          venueName: c.sourceName,
          area: normalizedArea,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
        });
        if (event && event.name && event.name !== "Live event") {
          c.exactTitle = event.startTimeText
            ? `Go to ${c.sourceName} for ${event.name} at ${event.startTimeText}`
            : `Go to ${c.sourceName} for ${event.name}`;
          c.externalUrl = event.url || c.externalUrl;
          c.subtitle = event.startTimeText
            ? `${event.name} — ${event.startTimeText}`
            : c.subtitle;
          enriched = true;
        }
        if (!enriched && (c.category === "cinema" || c.category === "theatre" || c.category === "theater") && lat != null && lng != null) {
          const movie = await searchMovieShowtimesForVenue({
            venueName: c.sourceName,
            area: normalizedArea,
            lat,
            lng,
          });
          if (movie && movie.movieName) {
            c.exactTitle = movie.startTimeText
              ? `${c.sourceName} — ${movie.movieName} at ${movie.startTimeText}`
              : `${c.sourceName} — ${movie.movieName}`;
            c.externalUrl = movie.url || c.externalUrl;
            c.subtitle = movie.startTimeText
              ? `${movie.movieName} — ${movie.startTimeText}`
              : c.subtitle;
          }
        }
      }
    }
    console.log("AI GROUNDING Overpass places:", overpassPlaces.length, "-> candidates:", overpassCandidates.length);
  }

  const placeCategories =
    range === "1 hr+"
      ? nightlifeOk
        ? ["comedy", "live_music", "nightclub", "movie_theater", "scenic", "market", "gallery", "restaurant", "bowling", "museum", "arcade"]
        : ["comedy", "movie_theater", "scenic", "market", "gallery", "restaurant", "bowling", "museum", "arcade"]
      : range === "30–60 min"
      ? ["bookstore", "gallery", "market", "scenic", "restaurant", "park", "dessert"]
      : range === "1–15 min"
      ? ["coffee", "park", "dessert"]
      : ["coffee", "dessert", "bookstore", "park", "market"];

  const eventCategories =
    range === "1 hr+"
      ? ["comedy", "live_music", "theater"]
      : range === "30–60 min"
      ? ["comedy", "live_music"]
      : [];

  const nearbyPlacesRaw = await searchNearbyGenericPlaces({
    area: normalizedArea,
    categories: placeCategories as any,
    maxPerCategory: 2,
    lat,
    lng,
  });

  const nearbyEventsRaw =
    eventCategories.length > 0
      ? await searchLiveEvents({
          area: normalizedArea,
          lat,
          lng,
          categories: eventCategories as any,
          size: 3,
        })
      : [];

  const placeCandidates = nearbyPlacesRaw
    .map((place) => placeToCandidate(place, range))
    .filter(Boolean) as AICandidate[];

  for (const c of placeCandidates) {
    const needsEnrichment =
      (c.category === "theatre" || c.category === "theater" || c.category === "cinema") &&
      (c.exactTitle.includes("see what's") || c.exactTitle.includes("for a show") || c.exactTitle.includes("for a movie"));
    if (needsEnrichment) {
      let enriched = false;
      const event = await searchEventsForVenue({
        venueName: c.sourceName,
        area: normalizedArea,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
      });
      if (event && event.name && event.name !== "Live event") {
        c.exactTitle = event.startTimeText
          ? `Go to ${c.sourceName} for ${event.name} at ${event.startTimeText}`
          : `Go to ${c.sourceName} for ${event.name}`;
        c.externalUrl = event.url || c.externalUrl;
        c.subtitle = event.startTimeText
          ? `${event.name} — ${event.startTimeText}`
          : c.subtitle;
        enriched = true;
      }
      if (!enriched && (c.category === "cinema" || c.category === "theatre" || c.category === "theater") && lat != null && lng != null) {
        const movie = await searchMovieShowtimesForVenue({
          venueName: c.sourceName,
          area: normalizedArea,
          lat,
          lng,
        });
        if (movie && movie.movieName) {
          c.exactTitle = movie.startTimeText
            ? `${c.sourceName} — ${movie.movieName} at ${movie.startTimeText}`
            : `${c.sourceName} — ${movie.movieName}`;
          c.externalUrl = movie.url || c.externalUrl;
          c.subtitle = movie.startTimeText
            ? `${movie.movieName} — ${movie.startTimeText}`
            : c.subtitle;
        }
      }
    }
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

  // Don't show theatre/cinema venues without specific show names—no "see what's on"
  candidates = candidates.filter((c) => {
    const isTheatreCinema = ["theatre", "theater", "cinema"].includes(c.category);
    const hasGenericTitle = c.exactTitle?.includes("see what's on") || c.exactTitle?.includes("see what's playing");
    if (isTheatreCinema && hasGenericTitle) return false;
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
    ];
    if (nightlifeOk) {
      allowedCategories.push("bar", "nightclub");
    }
    candidates = candidates
      .filter((c) => c.durationMinutes >= 60)
      .filter((c) => allowedCategories.includes(c.category));
  }

  if (candidates.length === 0) {
    const fallbackCurated = getCuratedExperiences("Los Angeles").filter((c) =>
      clampToTimeRange(c, range)
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
      ];
      if (nightlifeOk) fallbackCats.push("nightclub");
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

  candidates = candidates.sort((a, b) => b.score - a.score).slice(0, 18);
  function shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  candidates = shuffle(candidates).slice(0, 12);

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