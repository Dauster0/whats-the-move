import { UserPreferences } from "../store/move-context";
import {
  LiveEventCategory,
  LiveEventResult,
  searchLiveEvents,
} from "./live-event-search";
import {
  isEventDependentVenueCategory,
  verifySameDayLiveListingForPlace,
} from "./event-venue-gate";
import {
  GenericPlaceResult,
  GenericPlaceType,
  searchNearbyGenericPlaces,
} from "./live-place-search";
import { isWeeHours } from "./time-of-day";

export type MoveCategory = "micro" | "short" | "social";

export type SuggestionIntent =
  | "quick_reset"
  | "outdoor_walk"
  | "food_break"
  | "local_explore"
  | "solo_adventure"
  | "social_ping"
  | "active_movement"
  | "creative_break"
  | "experience";

export type SuggestionContext = {
  minMinutes: number;
  maxMinutes: number;
  weather: "sunny" | "rain" | "fog" | "snow";
  timeOfDay: "morning" | "midday" | "afternoon" | "evening" | "night";
  area: string;
  preferences: UserPreferences;
  lat?: number;
  lng?: number;
};

export type EngineSuggestion =
  | {
      id: string;
      type: "generic";
      title: string;
      subtitle?: string;
      reason: string;
      category: MoveCategory;
      durationMinutes: number;
      tags?: string[];
      score?: number;
    }
  | {
      id: string;
      type: "place";
      title: string;
      subtitle: string;
      reason: string;
      category: MoveCategory;
      durationMinutes: number;
      tags?: string[];
      score?: number;
      placeCategory: string;
      address: string;
      mapQuery: string;
      distanceText: string;
      priceText: "$" | "$$" | "$$$";
      reservationNeeded: boolean;
      reservationNote?: string;
      rating?: number;
      openNow?: boolean;
      externalUrl?: string;
      dateText?: string;
      startTimeText?: string;
      hoursSummary?: string;
    };

function randomJitter() {
  return Math.random() * 0.35;
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeInterest(interest: string) {
  return interest.replace(/-/g, " ").toLowerCase();
}

export function getTimeOfDay(): "morning" | "midday" | "afternoon" | "evening" | "night" {
  const h = new Date().getHours();
  if (h < 10) return "morning";
  if (h < 13) return "midday";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export function choosePrimaryIntents(
  context: SuggestionContext
): SuggestionIntent[] {
  const { minMinutes, maxMinutes, preferences, weather, timeOfDay } = context;
  const intents: SuggestionIntent[] = [];

  if (maxMinutes <= 5) intents.push("quick_reset");

  if (minMinutes <= 15 && preferences.socialMode !== "solo") {
    intents.push("social_ping");
  }

  if (maxMinutes >= 10 && preferences.placeMode !== "indoors" && weather !== "rain") {
    intents.push("outdoor_walk");
  }

  if (
    maxMinutes >= 15 &&
    preferences.interests.includes("hikes") &&
    preferences.placeMode !== "indoors"
  ) {
    intents.push("outdoor_walk", "active_movement");
  }

  if (
    maxMinutes >= 15 &&
    (preferences.interests.includes("coffee") ||
      preferences.interests.includes("dessert") ||
      preferences.interests.includes("cheap-hangouts"))
  ) {
    intents.push("food_break");
  }

  if (
    maxMinutes >= 20 &&
    (preferences.interests.includes("exploring") ||
      preferences.interests.includes("bookstores") ||
      preferences.interests.includes("museums"))
  ) {
    intents.push("local_explore");
  }

  if (maxMinutes >= 30 && preferences.socialMode !== "social") {
    intents.push("solo_adventure");
  }

  if (
    preferences.interests.includes("working out") ||
    preferences.interests.includes("sports")
  ) {
    intents.push("active_movement");
  }

  if (
    preferences.interests.includes("journaling") ||
    preferences.interests.includes("reading")
  ) {
    intents.push("creative_break");
  }

  if (maxMinutes >= 45) intents.push("experience");

  if (
    maxMinutes >= 35 &&
    (preferences.interests.includes("live-music") ||
      preferences.interests.includes("concerts") ||
      preferences.interests.includes("improv") ||
      preferences.interests.includes("karaoke") ||
      preferences.interests.includes("dancing") ||
      preferences.interests.includes("trivia") ||
      preferences.interests.includes("theater"))
  ) {
    intents.push("experience");
  }

  if (intents.length === 0) {
    if (maxMinutes <= 10) intents.push("quick_reset");
    else if (maxMinutes <= 30) intents.push("food_break", "outdoor_walk");
    else intents.push("local_explore", "experience");
  }

  let result = [...intents];
  if (timeOfDay === "night") {
    const filtered = result.filter((x) => x !== "active_movement");
    result = filtered.length > 0 ? filtered : result;
  }

  result = uniq(result);

  const battery = preferences.socialBattery ?? "ambivert";
  if (battery === "introvert" && maxMinutes < 35) {
    result = result.filter((x) => x !== "social_ping");
  }
  if (
    battery === "extrovert" &&
    preferences.socialMode !== "solo" &&
    maxMinutes >= 12 &&
    !result.includes("social_ping")
  ) {
    result.push("social_ping");
  }

  return uniq(result);
}

function buildInstantMoves(context: SuggestionContext): EngineSuggestion[] {
  const { preferences, timeOfDay } = context;

  const moves: EngineSuggestion[] = [
    {
      id: "micro-step-out",
      type: "generic",
      title: "Step outside for 10 minutes. No destination.",
      subtitle: "Low effort, real air",
      reason: "A small real-world break that still feels like a move.",
      category: "micro",
      durationMinutes: 10,
      tags: ["outdoor", "calm"],
    },
    {
      id: "micro-view-drive",
      type: "generic",
      title: "Drive somewhere with a good view and just sit there",
      subtitle: "A tiny outing",
      reason: "Changes your state without a big plan.",
      category: "micro",
      durationMinutes: 20,
      tags: ["outdoor", "calm"],
    },
    {
      id: "micro-late-diner",
      type: "generic",
      title: "Find a late-night diner open near you and get coffee",
      subtitle: "Real place, low stakes",
      reason: "Something small that still pulls you into the world.",
      category: "micro",
      durationMinutes: 25,
      tags: ["food", "night"],
    },
    {
      id: "micro-call-pending",
      type: "generic",
      title: "Call someone you've been meaning to call",
      subtitle: "A real human connection",
      reason: "Low effort and more grounding than another five minutes online.",
      category: "micro",
      durationMinutes: 10,
      tags: ["social"],
    },
  ];

  if (preferences.interests.includes("journaling")) {
    moves.push({
      id: "micro-bookmark-place",
      type: "generic",
      title: "Save a place you want to go this weekend",
      subtitle: "A tiny real-world plan",
      reason: "Turns a vague idea into something you can actually do.",
      category: "micro",
      durationMinutes: 3,
      tags: ["creative", "outdoor"],
    });
  }

  if (preferences.interests.includes("working out")) {
    moves.push({
      id: "micro-squats",
      type: "generic",
      title: "Do 10 slow bodyweight squats",
      subtitle: "Tiny movement break",
      reason: "Changes your state fast with almost no setup.",
      category: "micro",
      durationMinutes: 2,
      tags: ["energy", "health"],
    });
  }

  if (preferences.interests.includes("reading")) {
    moves.push({
      id: "micro-read-page",
      type: "generic",
      title: "Read one page of a book",
      subtitle: "A tiny real-world reset",
      reason: "A low-friction switch away from passive content.",
      category: "micro",
      durationMinutes: 3,
      tags: ["calm", "indoor"],
    });
  }

  if (timeOfDay === "night") {
    moves.push({
      id: "micro-night-walk",
      type: "generic",
      title: "Walk around the block once — no headphones",
      subtitle: "A quiet night move",
      reason: "Real world, low pressure, still feels like a move.",
      category: "micro",
      durationMinutes: 10,
      tags: ["calm", "night", "outdoor"],
    });
  }

  return moves;
}

function buildSocialMoves(context: SuggestionContext): EngineSuggestion[] {
  const { preferences, maxMinutes } = context;

  const moves: EngineSuggestion[] = [
    {
      id: "social-text",
      type: "generic",
      title: "Text someone you actually like talking to",
      subtitle: "A low-friction social move",
      reason: "More grounding than passive scrolling.",
      category: "social",
      durationMinutes: 5,
      tags: ["social"],
    },
    {
      id: "social-voice-note",
      type: "generic",
      title: "Send a voice note instead of a text",
      subtitle: "More human, still easy",
      reason: "A little more real than typing into the void.",
      category: "social",
      durationMinutes: 3,
      tags: ["social"],
    },
  ];

  if (preferences.interests.includes("calling friends") && maxMinutes >= 10) {
    moves.push({
      id: "social-call",
      type: "generic",
      title: "Call someone you haven’t talked to in a while",
      subtitle: "A better kind of interruption",
      reason: "High emotional payoff for relatively low effort.",
      category: "social",
      durationMinutes: 15,
      tags: ["social", "calm"],
    });
  }

  if (preferences.socialMode !== "solo" && maxMinutes >= 15) {
    moves.push({
      id: "social-plan",
      type: "generic",
      title: "Invite someone out for something easy tonight",
      subtitle: "A concrete social nudge",
      reason: "Specific enough to actually become a plan.",
      category: "social",
      durationMinutes: 5,
      tags: ["social"],
    });
  }

  return moves;
}

function mapIntentToPlaceCategories(
  intent: SuggestionIntent,
  preferences: UserPreferences,
  weather: SuggestionContext["weather"],
  timeOfDay: SuggestionContext["timeOfDay"]
): GenericPlaceType[] {
  const categories: GenericPlaceType[] = [];

  switch (intent) {
    case "food_break":
      categories.push("coffee", "dessert", "restaurant", "market");
      break;
    case "local_explore":
      categories.push("bookstore", "gallery", "market", "scenic", "museum");
      break;
    case "solo_adventure":
      categories.push("museum", "movie_theater", "gallery", "bookstore", "park");
      break;
    case "experience":
      categories.push(
        "comedy",
        "bowling",
        "arcade",
        "movie_theater",
        "live_music",
        "museum",
        "gallery",
        "market",
        "scenic",
        "restaurant"
      );
      break;
    case "outdoor_walk":
      categories.push(weather === "rain" ? "bookstore" : "park", "scenic");
      break;
    case "active_movement":
      categories.push("park", "bowling");
      break;
    case "creative_break":
      categories.push("bookstore", "gallery", "coffee");
      break;
    default:
      break;
  }

  if (preferences.interests.includes("coffee")) categories.push("coffee");
  if (preferences.interests.includes("dessert")) categories.push("dessert");
  if (preferences.interests.includes("bookstores")) categories.push("bookstore");
  if (preferences.interests.includes("museums")) categories.push("museum");
  if (preferences.interests.includes("movies")) categories.push("movie_theater");
  if (preferences.interests.includes("comedy")) categories.push("comedy");
  if (preferences.interests.includes("nightlife")) categories.push("live_music", "comedy");
  if (preferences.interests.includes("beach")) categories.push("scenic");
  if (preferences.interests.includes("exploring")) categories.push("market", "gallery", "scenic");
  if (preferences.interests.includes("sports")) categories.push("bowling");
  if (preferences.interests.includes("cheap-hangouts")) categories.push("park", "market", "coffee");
  if (preferences.interests.includes("hikes")) categories.push("park", "scenic");
  if (preferences.interests.includes("live-music")) categories.push("live_music", "bar");
  if (preferences.interests.includes("concerts")) categories.push("live_music", "bar", "nightclub");
  if (preferences.interests.includes("improv")) categories.push("comedy");
  if (preferences.interests.includes("karaoke")) categories.push("bar", "nightclub");
  if (preferences.interests.includes("dancing")) categories.push("nightclub", "live_music");
  if (preferences.interests.includes("trivia")) categories.push("bar", "restaurant");
  if (preferences.interests.includes("theater")) categories.push("movie_theater", "comedy", "live_music");
  if (preferences.interests.includes("farmers-markets")) categories.push("market");
  if (preferences.interests.includes("rooftops")) categories.push("bar", "restaurant", "scenic");
  if (preferences.interests.includes("bowling")) categories.push("bowling");
  if (preferences.interests.includes("arcade")) categories.push("arcade");

  if (timeOfDay === "night") {
    categories.push(
      "movie_theater",
      "comedy",
      "live_music",
      "dessert",
      "bar",
      "nightclub",
      "restaurant",
      "scenic"
    );
  }

  return uniq(categories);
}

function pickLiveEventCategories(context: SuggestionContext): LiveEventCategory[] {
  const categories: LiveEventCategory[] = [];

  if (context.maxMinutes >= 60) {
    categories.push("comedy", "live_music", "theater");
  } else if (context.maxMinutes >= 45) {
    categories.push("comedy", "live_music");
  }

  if (context.preferences.interests.includes("comedy")) categories.push("comedy");
  if (context.preferences.interests.includes("improv")) categories.push("comedy");
  if (context.preferences.interests.includes("nightlife")) categories.push("live_music");
  if (context.preferences.interests.includes("live-music")) categories.push("live_music");
  if (context.preferences.interests.includes("concerts")) categories.push("live_music", "sports_event");
  if (context.preferences.interests.includes("movies")) categories.push("movie_event");
  if (context.preferences.interests.includes("sports")) categories.push("sports_event");
  if (context.preferences.interests.includes("theater")) categories.push("theater");

  return uniq(categories);
}

function formatPlaceSuggestion(
  place: GenericPlaceResult,
  context: SuggestionContext
): EngineSuggestion {
  const why =
    place.whyItFits ||
    `Feels doable in about ${context.maxMinutes} minutes and beats another night of scrolling.`;

  const subtitleMap: Record<GenericPlaceType, string> = {
    coffee: "Easy reset with good coffee",
    dessert: "A sweet excuse to actually leave",
    bookstore: "Slow wander with real books in your hands",
    museum: "A real outing without a big plan",
    park: "Low effort outdoor reset",
    comedy: "Live comedy when the lineup lands on your card",
    bowling: "Structured fun that still feels easy",
    arcade: "Feels different from another night on your phone",
    movie_theater: "Big screen night out",
    live_music: "Live music nearby",
    gallery: "Small creative outing",
    scenic: "Worth going for the vibe alone",
    market: "Walkable spot with real energy",
    restaurant: "Sit down meal instead of drifting",
    bar: "Drinks, karaoke, or a real bar stool night out",
    nightclub: "Loud music and a crowd worth dressing for",
  };

  let duration = 45;

  switch (place.category) {
    case "coffee":
    case "dessert":
      duration = 25;
      break;
    case "park":
    case "bookstore":
      duration = 35;
      break;
    case "market":
    case "gallery":
    case "scenic":
      duration = 60;
      break;
    case "museum":
    case "restaurant":
    case "bowling":
    case "arcade":
      duration = 75;
      break;
    case "movie_theater":
    case "live_music":
    case "comedy":
      duration = 90;
      break;
    case "bar":
    case "nightclub":
      duration = 90;
      break;
    default:
      duration = 60;
  }

  const baseSub = subtitleMap[place.category];
  const hoursSummary =
    typeof place.hoursSummary === "string" && place.hoursSummary.trim().length > 0
      ? place.hoursSummary.trim()
      : undefined;

  return {
    id: place.id,
    type: "place",
    title: `Go to ${place.name}`,
    subtitle: baseSub,
    reason: why,
    category: "short",
    durationMinutes: duration,
    placeCategory: place.category,
    address: place.address,
    mapQuery: place.mapQuery,
    distanceText: place.distanceText,
    priceText: place.priceText,
    reservationNeeded: place.reservationNeeded,
    reservationNote: place.reservationNote,
    rating: place.rating,
    openNow: place.openNow,
    hoursSummary,
    tags: [
      place.category === "park" || place.category === "scenic" ? "outdoor" : "indoor",
      duration >= 60 ? "experience" : "quick outing",
      place.category === "scenic" ? "sunset" : "destination",
    ],
  };
}

function formatEventSuggestion(event: LiveEventResult): EngineSuggestion {
  const v = event.venueName || "the venue";
  const n = event.name || "Show";
  const headline =
    event.startTimeText && String(event.startTimeText).trim().length > 0
      ? `${n} at ${v}, ${event.startTimeText}`
      : `${n} tonight at ${v}`;
  const subtitle =
    event.dateText && event.startTimeText
      ? `${n}, ${event.dateText}, ${event.startTimeText}`
      : event.startTimeText
        ? `${n}, ${event.startTimeText}`
        : `${n}, ticketed night out`;

  return {
    id: `event-${event.id}`,
    type: "place",
    title: headline,
    subtitle,
    reason: `Real show at a real venue. ${event.dateText ? `${event.dateText}. ` : ""}${event.startTimeText ? `${event.startTimeText}.` : "Tonight."}`,
    category: "short",
    durationMinutes: 90,
    placeCategory: event.category,
    address: event.address,
    mapQuery: event.mapQuery,
    distanceText: event.distanceText,
    priceText: event.priceText,
    reservationNeeded: event.reservationNeeded,
    reservationNote: event.reservationNote,
    externalUrl: event.url,
    dateText: event.dateText,
    startTimeText: event.startTimeText,
    tags: [
      "experience",
      "timed-event",
      "destination",
      event.category === "comedy"
        ? "comedy"
        : event.category === "live_music"
          ? "live-music"
          : event.category === "theater"
            ? "theater"
            : event.category === "sports_event"
              ? "sports"
              : "night-out",
    ],
  };
}

function buildScenicQueries(context: SuggestionContext): GenericPlaceType[] {
  const out: GenericPlaceType[] = ["scenic"];

  if (context.weather !== "rain" && context.timeOfDay === "evening") {
    out.push("park");
  }

  if (context.preferences.interests.includes("exploring")) {
    out.push("market", "gallery");
  }

  if (context.preferences.interests.includes("beach")) {
    out.push("scenic");
  }

  return uniq(out);
}

function buildExperienceOnlyGenericFallbacks(
  context: SuggestionContext
): EngineSuggestion[] {
  const areaText = context.area === "near you" ? "your area" : context.area;

  return [
    {
      id: "experience-fallback-sunset",
      type: "generic",
      title: `Find the best sunset spot in ${areaText}`,
      subtitle: "A real evening destination",
      reason: "High payoff, specific enough to feel like a plan, and worth going out for.",
      category: "short",
      durationMinutes: 75,
      tags: ["experience", "outdoor", "sunset"],
      score: 8,
    },
    {
      id: "experience-fallback-trail",
      type: "generic",
      title: `Do a named trail or scenic walk in ${areaText}`,
      subtitle: "A proper outdoor outing",
      reason: "Much better fit for a long block of time than a generic filler move.",
      category: "short",
      durationMinutes: 90,
      tags: ["experience", "outdoor", "trail"],
      score: 8,
    },
    {
      id: "experience-fallback-movie",
      type: "generic",
      title: "Go see a movie that starts tonight",
      subtitle: "An easy structured plan",
      reason: "Clear start time, clear destination, and actually worth leaving for.",
      category: "short",
      durationMinutes: 120,
      tags: ["experience", "indoor", "timed-event"],
      score: 7,
    },
    {
      id: "experience-fallback-market",
      type: "generic",
      title: `Go to a destination market or neighborhood in ${areaText}`,
      subtitle: "Dinner plus walking around",
      reason: "Open-ended but still specific enough to feel like a real outing.",
      category: "short",
      durationMinutes: 90,
      tags: ["experience", "destination"],
      score: 7,
    },
  ];
}

async function buildExperienceEngine(
  context: SuggestionContext
): Promise<EngineSuggestion[]> {
  const liveEventCategories = pickLiveEventCategories(context);

  const liveEvents =
    liveEventCategories.length > 0
      ? await searchLiveEvents({
          area: context.area,
          lat: context.lat,
          lng: context.lng,
          categories: liveEventCategories,
          size: 4,
          nowMs: Date.now(),
        })
      : [];

  const eventSuggestions = liveEvents.map((e) => formatEventSuggestion(e));

  const scenicCategories = buildScenicQueries(context);

  const scenicPlaces = await searchNearbyGenericPlaces({
    area: context.area,
    categories: scenicCategories,
    maxPerCategory: 3,
    lat: context.lat,
    lng: context.lng,
  });

  const scenicSuggestions = scenicPlaces.map((p) => {
    const suggestion = formatPlaceSuggestion(p, context);

    if (p.category === "scenic") {
      return {
        ...suggestion,
        title:
          context.timeOfDay === "evening"
            ? `Visit ${p.name} for sunset`
            : `Visit ${p.name}`,
        subtitle:
          context.timeOfDay === "evening"
            ? "A scenic evening destination"
            : "A scenic destination worth going to",
        durationMinutes: 75,
        tags: [...(suggestion.tags ?? []), "sunset", "experience"],
        score: (suggestion.score ?? 0) + 4,
      } satisfies EngineSuggestion;
    }

    if (p.category === "park") {
      return {
        ...suggestion,
        title: `Do a scenic walk at ${p.name}`,
        subtitle: "A real outdoor outing",
        durationMinutes: 75,
        tags: [...(suggestion.tags ?? []), "trail", "experience"],
        score: (suggestion.score ?? 0) + 2,
      } satisfies EngineSuggestion;
    }

    return {
      ...suggestion,
      durationMinutes: Math.max(suggestion.durationMinutes, 60),
      tags: [...(suggestion.tags ?? []), "experience"],
      score: (suggestion.score ?? 0) + 1,
    } satisfies EngineSuggestion;
  });

  const fallbacks = buildExperienceOnlyGenericFallbacks(context);

  return [...eventSuggestions, ...scenicSuggestions, ...fallbacks]
    .filter((item) => item.durationMinutes >= 60)
    .map((item) => ({
      ...item,
      score: (item.score ?? 0) + scoreByPreferences(item, context) + randomJitter(),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function scoreByPreferences(
  suggestion: EngineSuggestion,
  context: SuggestionContext
) {
  const { preferences, weather, timeOfDay } = context;
  let score = 0;
  const title = suggestion.title.toLowerCase();
  const tags = suggestion.tags ?? [];

  if (preferences.socialMode === "solo" && suggestion.category !== "social") score += 2;
  if (preferences.socialMode === "social" && suggestion.category === "social") score += 3;

  if (preferences.placeMode === "indoors" && tags.includes("indoor")) score += 2;
  if (preferences.placeMode === "outdoors" && tags.includes("outdoor")) score += 2;

  if (
    preferences.energyMode === "low" &&
    (title.includes("coffee") || title.includes("book") || tags.includes("calm"))
  ) {
    score += 2;
  }

  if (
    preferences.energyMode === "high" &&
    (title.includes("bowling") ||
      title.includes("arcade") ||
      title.includes("walk") ||
      title.includes("live") ||
      tags.includes("trail"))
  ) {
    score += 2;
  }

  if (preferences.budget === "free" && suggestion.type === "place" && suggestion.priceText === "$") {
    score += 3;
  }

  if (
    preferences.budget === "cheap" &&
    suggestion.type === "place" &&
    (suggestion.priceText === "$" || suggestion.priceText === "$$")
  ) {
    score += 2;
  }

  if (preferences.preferredTimes.includes(timeOfDay)) score += 2;

  for (const interest of preferences.interests) {
    const normalized = normalizeInterest(interest);
    if (title.includes(normalized)) score += 3;
  }

  if (weather === "rain" && tags.includes("outdoor")) score -= 5;
  if (weather !== "rain" && tags.includes("outdoor")) score += 1;

  if (suggestion.type === "place" && suggestion.openNow === true) score += 2;
  if (suggestion.type === "place" && suggestion.rating && suggestion.rating >= 4.4) score += 2;

  if (tags.includes("experience")) score += 2;
  if (tags.includes("timed-event")) score += 3;
  if (tags.includes("destination")) score += 2;
  if (timeOfDay === "evening" && tags.includes("sunset")) score += 4;
  if (tags.includes("trail") && weather !== "rain") score += 2;

  return score;
}

export async function buildEngineSuggestions(
  context: SuggestionContext
): Promise<EngineSuggestion[]> {
  if (context.minMinutes >= 60) {
    const experiences = await buildExperienceEngine(context);

    if (experiences.length > 0) {
      return experiences;
    }

    return buildExperienceOnlyGenericFallbacks(context)
      .map((item) => ({
        ...item,
        score: (item.score ?? 0) + scoreByPreferences(item, context) + randomJitter(),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const intents = choosePrimaryIntents(context);
  const instant = buildInstantMoves(context);
  const social = buildSocialMoves(context);

  const placeCategories = uniq(
    intents.flatMap((intent) =>
      mapIntentToPlaceCategories(
        intent,
        context.preferences,
        context.weather,
        context.timeOfDay
      )
    )
  );

  const placeResults = await searchNearbyGenericPlaces({
    area: context.area,
    categories: placeCategories,
    maxPerCategory: isWeeHours() ? 3 : 2,
    lat: context.lat,
    lng: context.lng,
    weeHours: isWeeHours(),
  });

  const listingNowMs = Date.now();
  const placeResultsWithListings: GenericPlaceResult[] = [];
  for (const p of placeResults) {
    if (!isEventDependentVenueCategory(p.category)) {
      placeResultsWithListings.push(p);
      continue;
    }
    if (
      await verifySameDayLiveListingForPlace(p, {
        area: context.area,
        lat: context.lat,
        lng: context.lng,
        nowMs: listingNowMs,
      })
    ) {
      placeResultsWithListings.push(p);
    }
  }

  const placeSuggestions = placeResultsWithListings.map((p) =>
    formatPlaceSuggestion(p, context)
  );

  const liveEventCategories =
    context.maxMinutes >= 45 ? pickLiveEventCategories(context) : [];

  const liveEvents =
    liveEventCategories.length > 0
      ? await searchLiveEvents({
          area: context.area,
          lat: context.lat,
          lng: context.lng,
          categories: liveEventCategories,
          size: 3,
          nowMs: Date.now(),
        })
      : [];

  const eventSuggestions = liveEvents.map((e) => formatEventSuggestion(e));

  const allCandidates = [...instant, ...social, ...placeSuggestions, ...eventSuggestions];

  let filtered = allCandidates.filter(
    (item) =>
      item.durationMinutes >= context.minMinutes &&
      item.durationMinutes <= context.maxMinutes
  );

  if (filtered.length === 0 && context.minMinutes >= 45) {
    filtered = allCandidates.filter((item) => item.durationMinutes >= 30);
  }

  if (filtered.length === 0 && context.minMinutes >= 15 && context.maxMinutes <= 30) {
    filtered = allCandidates.filter(
      (item) => item.durationMinutes >= 10 && item.durationMinutes <= 40
    );
  }

  if (filtered.length === 0) {
    filtered = allCandidates.filter((item) => item.durationMinutes >= 10);
  }

  const ranked = filtered
    .map((item) => ({
      ...item,
      score: (item.score ?? 0) + scoreByPreferences(item, context) + randomJitter(),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return ranked;
}