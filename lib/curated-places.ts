export type MoveCategory = "micro" | "short" | "social";

export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  category: MoveCategory;
  durationMinutes: number;
  interests: string[];
  vibes: ("solo" | "social" | "date" | "group")[];
  neighborhoods: string[];
  weatherFit?: ("sunny" | "rain" | "any")[];
  timeFit?: ("morning" | "midday" | "afternoon" | "evening" | "night")[];
  priceText: "$" | "$$" | "$$$";
  reservationNeeded: boolean;
  reservationNote?: string;
  address: string;
  mapQuery: string;
  whyThisFits: string;
  tags?: string[];
  distanceTextByArea?: Record<string, string>;
};

import { PERSONAL_PLACES } from "./personal-places";

function normalize(text: string) {
  return text.toLowerCase().trim();
}

export const CURATED_PLACES: PlaceSuggestion[] = [
  {
    id: "village-target-walk",
    title: "Walk through USC Village and grab something small",
    subtitle: "Easy reset without overthinking it",
    category: "short",
    durationMinutes: 20,
    interests: ["walking", "cheap-hangouts", "solo-recharge", "exploring"],
    vibes: ["solo", "social"],
    neighborhoods: ["usc", "university park", "vernon", "los angeles"],
    weatherFit: ["sunny", "any"],
    timeFit: ["morning", "midday", "afternoon", "evening"],
    priceText: "$",
    reservationNeeded: false,
    address: "USC Village, Los Angeles, CA",
    mapQuery: "USC Village Los Angeles",
    whyThisFits: "Very low friction. You already know where it is.",
    tags: ["outdoor", "easy"],
    distanceTextByArea: {
      usc: "5–10 min away",
      "university park": "5–10 min away",
      vernon: "10–15 min away",
      "los angeles": "15–25 min away",
    },
  },
  {
    id: "natural-history-museum",
    title: "Go to the Natural History Museum",
    subtitle: "A real outing without needing a big plan",
    category: "short",
    durationMinutes: 90,
    interests: ["museums", "exploring", "solo-recharge"],
    vibes: ["solo", "date", "social"],
    neighborhoods: ["usc", "university park", "vernon", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["midday", "afternoon"],
    priceText: "$$",
    reservationNeeded: false,
    address: "900 Exposition Blvd, Los Angeles, CA",
    mapQuery: "Natural History Museum Los Angeles",
    whyThisFits: "Specific destination, high reward, still easy from campus.",
    tags: ["indoor", "explore"],
    distanceTextByArea: {
      usc: "10–15 min away",
      "university park": "10–15 min away",
      vernon: "15–20 min away",
      "los angeles": "20–30 min away",
    },
  },
  {
    id: "california-science-center",
    title: "Go to the California Science Center",
    subtitle: "Low-friction museum-style outing",
    category: "short",
    durationMinutes: 75,
    interests: ["museums", "exploring", "cheap-hangouts"],
    vibes: ["solo", "social"],
    neighborhoods: ["usc", "university park", "vernon", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["midday", "afternoon"],
    priceText: "$",
    reservationNeeded: false,
    address: "700 Exposition Park Dr, Los Angeles, CA",
    mapQuery: "California Science Center Los Angeles",
    whyThisFits: "Close, specific, and feels like a real change of scene.",
    tags: ["indoor", "explore"],
    distanceTextByArea: {
      usc: "10–15 min away",
      "university park": "10–15 min away",
      vernon: "15–20 min away",
      "los angeles": "20–30 min away",
    },
  },
  {
    id: "alamo-drafthouse-dtla",
    title: "Go see a movie at Alamo Drafthouse",
    subtitle: "Specific movie plan, not vague 'watch something'",
    category: "short",
    durationMinutes: 120,
    interests: ["movies", "nightlife", "solo-recharge"],
    vibes: ["solo", "date", "social"],
    neighborhoods: ["downtown", "usc", "los angeles", "vernon"],
    weatherFit: ["any"],
    timeFit: ["afternoon", "evening", "night"],
    priceText: "$$",
    reservationNeeded: true,
    reservationNote: "Buying ahead is safer for popular showtimes.",
    address: "700 W 7th St, Los Angeles, CA",
    mapQuery: "Alamo Drafthouse Downtown Los Angeles",
    whyThisFits: "A concrete plan beats indecision.",
    tags: ["indoor", "evening"],
    distanceTextByArea: {
      usc: "15–25 min away",
      "university park": "15–25 min away",
      vernon: "15–25 min away",
      downtown: "5–15 min away",
      "los angeles": "15–25 min away",
    },
  },
  {
    id: "grand-central-market",
    title: "Go eat at Grand Central Market",
    subtitle: "Specific food plan with lots of options",
    category: "short",
    durationMinutes: 45,
    interests: ["cheap-hangouts", "exploring", "social"],
    vibes: ["solo", "social", "date", "group"],
    neighborhoods: ["downtown", "usc", "los angeles", "vernon"],
    weatherFit: ["any"],
    timeFit: ["midday", "afternoon", "evening"],
    priceText: "$$",
    reservationNeeded: false,
    address: "317 S Broadway, Los Angeles, CA",
    mapQuery: "Grand Central Market Los Angeles",
    whyThisFits: "Easy because the destination is already chosen.",
    tags: ["indoor", "explore"],
    distanceTextByArea: {
      usc: "15–25 min away",
      "university park": "15–25 min away",
      vernon: "15–25 min away",
      downtown: "5–10 min away",
      "los angeles": "15–25 min away",
    },
  },
  {
    id: "the-broad",
    title: "Go to The Broad",
    subtitle: "Specific museum outing",
    category: "short",
    durationMinutes: 90,
    interests: ["museums", "exploring", "solo-recharge"],
    vibes: ["solo", "date", "social"],
    neighborhoods: ["downtown", "usc", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["midday", "afternoon"],
    priceText: "$",
    reservationNeeded: true,
    reservationNote: "Timed entry can matter depending on the day.",
    address: "221 S Grand Ave, Los Angeles, CA",
    mapQuery: "The Broad Los Angeles",
    whyThisFits: "High-quality outing with low decision friction.",
    tags: ["indoor", "explore"],
    distanceTextByArea: {
      usc: "15–25 min away",
      downtown: "5–10 min away",
      "los angeles": "15–25 min away",
    },
  },
  {
    id: "stories-books",
    title: "Browse Stories Books & Cafe",
    subtitle: "Bookstore and coffee in one stop",
    category: "short",
    durationMinutes: 50,
    interests: ["bookstores", "coffee", "solo-recharge"],
    vibes: ["solo", "date"],
    neighborhoods: ["echo park", "silver lake", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["midday", "afternoon"],
    priceText: "$$",
    reservationNeeded: false,
    address: "1716 W Sunset Blvd, Los Angeles, CA",
    mapQuery: "Stories Books and Cafe Los Angeles",
    whyThisFits: "Specific, cozy, and easy to say yes to.",
    tags: ["indoor", "calm"],
    distanceTextByArea: {
      "echo park": "5–10 min away",
      "silver lake": "10–15 min away",
      usc: "20–30 min away",
      "los angeles": "20–30 min away",
    },
  },
  {
    id: "silverlake-reservoir",
    title: "Walk the Silver Lake Reservoir",
    subtitle: "Classic walk reset with a real destination",
    category: "short",
    durationMinutes: 45,
    interests: ["walking", "solo-recharge", "cheap-hangouts"],
    vibes: ["solo", "social"],
    neighborhoods: ["silver lake", "echo park", "los feliz", "los angeles"],
    weatherFit: ["sunny", "any"],
    timeFit: ["morning", "afternoon", "evening"],
    priceText: "$",
    reservationNeeded: false,
    address: "Silver Lake Reservoir, Los Angeles, CA",
    mapQuery: "Silver Lake Reservoir Los Angeles",
    whyThisFits: "Very low friction with a clear route.",
    tags: ["outdoor", "calm"],
    distanceTextByArea: {
      "silver lake": "5–10 min away",
      "echo park": "10–15 min away",
      "los feliz": "10–15 min away",
      usc: "25–35 min away",
    },
  },
  {
    id: "dynasty-typewriter",
    title: "Go to Dynasty Typewriter",
    subtitle: "Comedy / creative show night",
    category: "short",
    durationMinutes: 90,
    interests: ["comedy", "nightlife", "cheap-hangouts"],
    vibes: ["solo", "social", "date"],
    neighborhoods: ["westlake", "usc", "los angeles", "downtown"],
    weatherFit: ["any"],
    timeFit: ["evening", "night"],
    priceText: "$$",
    reservationNeeded: true,
    reservationNote: "Usually worth booking ahead for shows.",
    address: "2511 Wilshire Blvd, Los Angeles, CA",
    mapQuery: "Dynasty Typewriter Los Angeles",
    whyThisFits: "Specific, memorable, and much more fun than random scrolling.",
    tags: ["indoor", "evening"],
    distanceTextByArea: {
      usc: "15–25 min away",
      downtown: "10–15 min away",
      westlake: "5–10 min away",
      "los angeles": "15–25 min away",
    },
  },
  {
    id: "comedy-store",
    title: "Check out The Comedy Store",
    subtitle: "Classic late-night comedy idea",
    category: "short",
    durationMinutes: 90,
    interests: ["comedy", "nightlife"],
    vibes: ["solo", "social", "date"],
    neighborhoods: ["hollywood", "west hollywood", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["evening", "night"],
    priceText: "$$",
    reservationNeeded: true,
    reservationNote: "Popular nights usually need advance tickets.",
    address: "8433 Sunset Blvd, West Hollywood, CA",
    mapQuery: "The Comedy Store West Hollywood",
    whyThisFits: "A real destination beats vague 'go out' energy.",
    tags: ["indoor", "evening"],
    distanceTextByArea: {
      hollywood: "10–20 min away",
      "west hollywood": "5–10 min away",
      usc: "25–40 min away",
      "los angeles": "25–40 min away",
    },
  },
  {
    id: "shatto-39",
    title: "Go bowl at Shatto 39 Lanes",
    subtitle: "Low-pressure fun hangout",
    category: "short",
    durationMinutes: 75,
    interests: ["bowling", "cheap-hangouts", "sports"],
    vibes: ["social", "group", "date"],
    neighborhoods: ["koreatown", "usc", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["afternoon", "evening", "night"],
    priceText: "$$",
    reservationNeeded: false,
    reservationNote: "Usually fine without one unless it’s a busy night.",
    address: "3255 W 4th St, Los Angeles, CA",
    mapQuery: "Shatto 39 Lanes Los Angeles",
    whyThisFits: "Easy social plan with a clear activity.",
    tags: ["indoor", "evening"],
    distanceTextByArea: {
      koreatown: "5–10 min away",
      usc: "15–20 min away",
      "los angeles": "15–20 min away",
    },
  },
  {
    id: "griffith-observatory",
    title: "Go to Griffith Observatory before sunset",
    subtitle: "Classic scenic reset",
    category: "short",
    durationMinutes: 90,
    interests: ["exploring", "solo-recharge", "rooftops", "cheap-hangouts"],
    vibes: ["solo", "social", "date"],
    neighborhoods: ["los feliz", "hollywood", "silver lake", "los angeles"],
    weatherFit: ["sunny", "any"],
    timeFit: ["afternoon", "evening"],
    priceText: "$",
    reservationNeeded: false,
    reservationNote: "Parking can be harder than entry.",
    address: "2800 E Observatory Rd, Los Angeles, CA",
    mapQuery: "Griffith Observatory Los Angeles",
    whyThisFits: "High payoff when you want a real change of scene.",
    tags: ["outdoor", "explore"],
    distanceTextByArea: {
      "los feliz": "10–15 min away",
      hollywood: "15–20 min away",
      "silver lake": "15–20 min away",
      usc: "30–40 min away",
    },
  },
  {
    id: "venice-beach",
    title: "Go to Venice Beach for a reset",
    subtitle: "Worth it when you want a real scene change",
    category: "short",
    durationMinutes: 120,
    interests: ["beach", "walking", "exploring", "solo-recharge"],
    vibes: ["solo", "social", "date"],
    neighborhoods: ["venice", "santa monica", "los angeles", "usc"],
    weatherFit: ["sunny"],
    timeFit: ["afternoon", "evening"],
    priceText: "$",
    reservationNeeded: false,
    address: "Venice Beach, Los Angeles, CA",
    mapQuery: "Venice Beach Los Angeles",
    whyThisFits: "High-reward option for the 1 hr+ window.",
    tags: ["outdoor", "explore"],
    distanceTextByArea: {
      venice: "5–10 min away",
      "santa monica": "10–15 min away",
      usc: "30–50 min away",
      "los angeles": "30–50 min away",
    },
  },
  {
    id: "amoeba-music",
    title: "Browse Amoeba Music",
    subtitle: "A fun wander that still feels intentional",
    category: "short",
    durationMinutes: 50,
    interests: ["live-music", "exploring", "solo-recharge"],
    vibes: ["solo", "date", "social"],
    neighborhoods: ["hollywood", "los angeles"],
    weatherFit: ["any"],
    timeFit: ["afternoon", "evening"],
    priceText: "$",
    reservationNeeded: false,
    address: "6200 Hollywood Blvd, Los Angeles, CA",
    mapQuery: "Amoeba Music Hollywood",
    whyThisFits: "Interesting enough to replace passive scrolling.",
    tags: ["indoor", "explore"],
    distanceTextByArea: {
      hollywood: "5–10 min away",
      usc: "30–40 min away",
      "los angeles": "20–35 min away",
    },
  },
];

export function getAreaAliases(place: string) {
  const p = normalize(place);
  const aliases = new Set<string>();

  if (p.includes("usc") || p.includes("university park")) {
    aliases.add("usc");
    aliases.add("university park");
  }

  if (p.includes("vernon")) aliases.add("vernon");
  if (p.includes("downtown")) aliases.add("downtown");
  if (p.includes("echo park")) aliases.add("echo park");
  if (p.includes("silver lake")) aliases.add("silver lake");
  if (p.includes("los feliz")) aliases.add("los feliz");
  if (p.includes("hollywood")) aliases.add("hollywood");
  if (p.includes("west hollywood")) aliases.add("west hollywood");
  if (p.includes("koreatown")) aliases.add("koreatown");
  if (p.includes("venice")) aliases.add("venice");
  if (p.includes("santa monica")) aliases.add("santa monica");
  if (p.includes("westlake")) aliases.add("westlake");

  aliases.add("los angeles");

  return Array.from(aliases);
}

export function getDistanceTextForPlace(place: PlaceSuggestion, currentArea: string) {
  const aliases = getAreaAliases(currentArea);

  for (const alias of aliases) {
    const found = place.distanceTextByArea?.[alias];
    if (found) return found;
  }

  return "Nearby";
}

export function getRankedCuratedPlaces(params: {
  area: string;
  interests: string[];
  minMinutes: number;
  maxMinutes: number;
  weather: "sunny" | "rain" | "fog" | "snow";
  timeOfDay: "morning" | "midday" | "afternoon" | "evening" | "night";
}) {
  const { area, interests, minMinutes, maxMinutes, weather, timeOfDay } = params;
  const areaAliases = getAreaAliases(area);

  let eligible = [...PERSONAL_PLACES, ...CURATED_PLACES].filter(
    (place) => place.durationMinutes >= minMinutes && place.durationMinutes <= maxMinutes
  );

  if (minMinutes >= 30 && eligible.length === 0) {
    eligible = [...PERSONAL_PLACES, ...CURATED_PLACES].filter(
      (place) => place.durationMinutes >= 30
    );
  }

  return eligible
    .map((place) => {
      let score = 0;

      for (const interest of interests) {
        if (place.interests.includes(interest)) score += 5;
      }

      for (const alias of areaAliases) {
        if (place.neighborhoods.includes(alias)) score += 4;
      }

      if (place.weatherFit?.includes("any")) score += 1;
      if (weather === "rain") {
        if (place.weatherFit?.includes("rain")) score += 3;
        if (place.tags?.includes("outdoor")) score -= 4;
      } else {
        if (place.tags?.includes("outdoor")) score += 2;
      }

      if (place.timeFit?.includes(timeOfDay)) score += 3;

      if (interests.includes("cheap-hangouts") && place.priceText === "$") score += 2;
      if (interests.includes("solo-recharge") && place.vibes.includes("solo")) score += 2;

      if (place.tags?.includes("favorite")) score += 6;

      score += Math.random() * 0.35;

      return {
        ...place,
        distanceText: getDistanceTextForPlace(place, area),
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}