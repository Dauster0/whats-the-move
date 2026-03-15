export type MoveCategory = "micro" | "short" | "social";

export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  category: MoveCategory;
  durationMinutes: number;
  interests: string[];
  vibes?: ("solo" | "social" | "date" | "group")[];
  placeName: string;
  neighborhood: string;
  distanceText: string;
  priceText: "$" | "$$" | "$$$";
  reservationNeeded: boolean;
  reservationNote?: string;
  address?: string;
  whyThisFits?: string;
  tags?: string[];
  mapQuery?: string;
};

type AreaPlaceMap = Record<string, PlaceSuggestion[]>;

const COMMON_PLACES: PlaceSuggestion[] = [
  {
    id: "museum-generic",
    title: "Go to a museum or gallery nearby",
    subtitle: "Quiet cultural reset",
    category: "short",
    durationMinutes: 90,
    interests: ["museums", "solo-recharge", "exploring"],
    vibes: ["solo", "date"],
    placeName: "A nearby museum",
    neighborhood: "Near you",
    distanceText: "20–35 min away",
    priceText: "$$",
    reservationNeeded: false,
    address: "Pick one nearby",
    whyThisFits: "Feels like a real outing, not filler.",
    tags: ["indoor", "afternoon"],
    mapQuery: "museum near me",
  },
  {
    id: "arcade-generic",
    title: "Go to an arcade or arcade bar",
    subtitle: "Actually fun anti-scroll move",
    category: "short",
    durationMinutes: 75,
    interests: ["arcades", "nightlife", "cheap-hangouts"],
    vibes: ["social", "date", "group"],
    placeName: "A nearby arcade",
    neighborhood: "Near you",
    distanceText: "20–30 min away",
    priceText: "$$",
    reservationNeeded: false,
    address: "Pick one nearby",
    whyThisFits: "High novelty and easy to say yes to.",
    tags: ["indoor", "evening"],
    mapQuery: "arcade near me",
  },
  {
    id: "coffee-work-generic",
    title: "Work from a really good coffee shop for an hour",
    subtitle: "Intentional coffee reset",
    category: "short",
    durationMinutes: 60,
    interests: ["coffee", "solo-recharge", "bookstores"],
    vibes: ["solo"],
    placeName: "A good nearby cafe",
    neighborhood: "Near you",
    distanceText: "5–15 min away",
    priceText: "$$",
    reservationNeeded: false,
    address: "Use a nearby coffee shop",
    whyThisFits: "Easy solo reset with a destination.",
    tags: ["indoor", "afternoon"],
    mapQuery: "best coffee shop near me",
  },
];

const AREA_PLACES: AreaPlaceMap = {
  "echo park": [
    {
      id: "echo-park-lake",
      title: "Go sit by Echo Park Lake",
      subtitle: "Low-cost outdoor reset",
      category: "short",
      durationMinutes: 45,
      interests: ["walking", "exploring", "solo-recharge", "cheap-hangouts"],
      vibes: ["solo", "social", "date"],
      placeName: "Echo Park Lake",
      neighborhood: "Echo Park",
      distanceText: "5–10 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "751 Echo Park Ave, Los Angeles, CA",
      whyThisFits: "Simple, nearby, and actually pleasant.",
      tags: ["outdoor", "afternoon", "evening"],
      mapQuery: "Echo Park Lake Los Angeles",
    },
    {
      id: "stories-books-echo",
      title: "Go browse Stories Books & Cafe",
      subtitle: "Bookstore + coffee combo",
      category: "short",
      durationMinutes: 45,
      interests: ["bookstores", "coffee", "solo-recharge"],
      vibes: ["solo", "date"],
      placeName: "Stories Books & Cafe",
      neighborhood: "Echo Park",
      distanceText: "5–12 min away",
      priceText: "$$",
      reservationNeeded: false,
      address: "1716 W Sunset Blvd, Los Angeles, CA",
      whyThisFits: "Specific, cozy, and easy to say yes to.",
      tags: ["indoor", "afternoon"],
      mapQuery: "Stories Books and Cafe Los Angeles",
    },
    {
      id: "semi-tropic",
      title: "Go hang at Semi-Tropic",
      subtitle: "Coffee or evening hang spot",
      category: "short",
      durationMinutes: 60,
      interests: ["coffee", "nightlife", "cheap-hangouts"],
      vibes: ["solo", "social", "date"],
      placeName: "Semi-Tropic",
      neighborhood: "Echo Park",
      distanceText: "5–15 min away",
      priceText: "$$",
      reservationNeeded: false,
      address: "1412 Glendale Blvd, Los Angeles, CA",
      whyThisFits: "Can work as a day reset or easy night plan.",
      tags: ["indoor", "evening", "afternoon"],
      mapQuery: "Semi-Tropic Los Angeles",
    },
  ],
  "silver lake": [
    {
      id: "sunset-junction",
      title: "Walk around Sunset Junction",
      subtitle: "Neighborhood wander with actual energy",
      category: "short",
      durationMinutes: 45,
      interests: ["exploring", "walking", "coffee"],
      vibes: ["solo", "social", "date"],
      placeName: "Sunset Junction",
      neighborhood: "Silver Lake",
      distanceText: "5–15 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "Sunset Blvd & Santa Monica Blvd area",
      whyThisFits: "Specific wandering is better than vague wandering.",
      tags: ["outdoor", "afternoon", "evening"],
      mapQuery: "Sunset Junction Los Angeles",
    },
    {
      id: "silverlake-reservoir",
      title: "Go walk the Silver Lake Reservoir",
      subtitle: "Classic walk reset",
      category: "short",
      durationMinutes: 45,
      interests: ["walking", "solo-recharge", "cheap-hangouts"],
      vibes: ["solo", "social"],
      placeName: "Silver Lake Reservoir",
      neighborhood: "Silver Lake",
      distanceText: "5–15 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "Silver Lake Blvd, Los Angeles, CA",
      whyThisFits: "Very low friction with a clear destination.",
      tags: ["outdoor", "afternoon"],
      mapQuery: "Silver Lake Reservoir Los Angeles",
    },
    {
      id: "lamill-coffee",
      title: "Go sit at La Mill Coffee",
      subtitle: "Intentional coffee outing",
      category: "short",
      durationMinutes: 60,
      interests: ["coffee", "solo-recharge"],
      vibes: ["solo", "date"],
      placeName: "La Mill Coffee",
      neighborhood: "Silver Lake",
      distanceText: "5–15 min away",
      priceText: "$$",
      reservationNeeded: false,
      address: "1636 Silver Lake Blvd, Los Angeles, CA",
      whyThisFits: "Specific coffee destination beats generic caffeine runs.",
      tags: ["indoor", "afternoon"],
      mapQuery: "La Mill Coffee Los Angeles",
    },
  ],
  "los feliz": [
    {
      id: "griffith-observatory",
      title: "Go to Griffith Observatory before sunset",
      subtitle: "Classic scenic reset",
      category: "short",
      durationMinutes: 90,
      interests: ["exploring", "solo-recharge", "rooftops", "cheap-hangouts"],
      vibes: ["solo", "social", "date"],
      placeName: "Griffith Observatory",
      neighborhood: "Los Feliz",
      distanceText: "15–25 min away",
      priceText: "$",
      reservationNeeded: false,
      reservationNote: "Parking can be harder than entry.",
      address: "2800 E Observatory Rd, Los Angeles, CA",
      whyThisFits: "A real change of scene with high payoff.",
      tags: ["outdoor", "evening"],
      mapQuery: "Griffith Observatory Los Angeles",
    },
    {
      id: "vista-theater",
      title: "Go catch a movie at Vista Theater",
      subtitle: "Specific movie night idea",
      category: "short",
      durationMinutes: 120,
      interests: ["movies", "nightlife", "date ideas"],
      vibes: ["solo", "date", "social"],
      placeName: "Vista Theater",
      neighborhood: "Los Feliz",
      distanceText: "10–20 min away",
      priceText: "$$",
      reservationNeeded: true,
      reservationNote: "Buy tickets ahead if it’s a popular showtime.",
      address: "4473 Sunset Dr, Los Angeles, CA",
      whyThisFits: "More exciting than just 'watch a movie.'",
      tags: ["indoor", "evening"],
      mapQuery: "Vista Theater Los Angeles",
    },
    {
      id: "skylight-books",
      title: "Browse Skylight Books",
      subtitle: "Quiet specific bookstore move",
      category: "short",
      durationMinutes: 45,
      interests: ["bookstores", "solo-recharge", "coffee"],
      vibes: ["solo", "date"],
      placeName: "Skylight Books",
      neighborhood: "Los Feliz",
      distanceText: "10–20 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "1818 N Vermont Ave, Los Angeles, CA",
      whyThisFits: "A real place with atmosphere, not just 'go read somewhere.'",
      tags: ["indoor", "afternoon"],
      mapQuery: "Skylight Books Los Angeles",
    },
  ],
  "downtown": [
    {
      id: "last-bookstore",
      title: "Spend time at The Last Bookstore",
      subtitle: "Bookstore wander reset",
      category: "short",
      durationMinutes: 60,
      interests: ["bookstores", "exploring", "solo-recharge"],
      vibes: ["solo", "date"],
      placeName: "The Last Bookstore",
      neighborhood: "Downtown LA",
      distanceText: "5–15 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "453 S Spring St, Los Angeles, CA",
      whyThisFits: "Specific solo recharge idea with actual atmosphere.",
      tags: ["indoor", "afternoon"],
      mapQuery: "The Last Bookstore Los Angeles",
    },
    {
      id: "grand-central-market",
      title: "Go eat at Grand Central Market",
      subtitle: "Specific food reset",
      category: "short",
      durationMinutes: 45,
      interests: ["cheap-hangouts", "exploring", "social"],
      vibes: ["solo", "social", "date"],
      placeName: "Grand Central Market",
      neighborhood: "Downtown LA",
      distanceText: "5–15 min away",
      priceText: "$$",
      reservationNeeded: false,
      address: "317 S Broadway, Los Angeles, CA",
      whyThisFits: "Easy decision because the destination is already chosen.",
      tags: ["indoor", "afternoon", "evening"],
      mapQuery: "Grand Central Market Los Angeles",
    },
    {
      id: "the-broad",
      title: "Go to The Broad",
      subtitle: "Specific museum outing",
      category: "short",
      durationMinutes: 90,
      interests: ["museums", "exploring", "solo-recharge"],
      vibes: ["solo", "date", "social"],
      placeName: "The Broad",
      neighborhood: "Downtown LA",
      distanceText: "5–15 min away",
      priceText: "$",
      reservationNeeded: true,
      reservationNote: "Timed entry can matter depending on the day.",
      address: "221 S Grand Ave, Los Angeles, CA",
      whyThisFits: "High-quality specific outing with low decision friction.",
      tags: ["indoor", "afternoon"],
      mapQuery: "The Broad Los Angeles",
    },
  ],
  "hollywood": [
    {
      id: "comedy-store",
      title: "Check out The Comedy Store",
      subtitle: "Classic late-night comedy idea",
      category: "short",
      durationMinutes: 90,
      interests: ["comedy", "nightlife"],
      vibes: ["solo", "social", "date"],
      placeName: "The Comedy Store",
      neighborhood: "West Hollywood",
      distanceText: "15–25 min away",
      priceText: "$$",
      reservationNeeded: true,
      reservationNote: "Popular nights usually need advance tickets.",
      address: "8433 Sunset Blvd, West Hollywood, CA",
      whyThisFits: "A real destination beats vague 'go out' energy.",
      tags: ["indoor", "evening"],
      mapQuery: "The Comedy Store West Hollywood",
    },
    {
      id: "amoeba",
      title: "Browse Amoeba Music",
      subtitle: "Specific fun wander",
      category: "short",
      durationMinutes: 45,
      interests: ["live-music", "exploring", "solo-recharge"],
      vibes: ["solo", "date", "social"],
      placeName: "Amoeba Music",
      neighborhood: "Hollywood",
      distanceText: "10–20 min away",
      priceText: "$",
      reservationNeeded: false,
      address: "6200 Hollywood Blvd, Los Angeles, CA",
      whyThisFits: "Interesting enough to replace mindless screen time.",
      tags: ["indoor", "afternoon", "evening"],
      mapQuery: "Amoeba Music Hollywood",
    },
  ],
  "koreatown": [
    {
      id: "shatto-39",
      title: "Go bowl at Shatto 39 Lanes",
      subtitle: "Low-pressure fun hangout",
      category: "short",
      durationMinutes: 75,
      interests: ["bowling", "cheap-hangouts", "sports"],
      vibes: ["social", "group", "date"],
      placeName: "Shatto 39 Lanes",
      neighborhood: "Koreatown",
      distanceText: "10–20 min away",
      priceText: "$$",
      reservationNeeded: false,
      reservationNote: "Usually fine without one unless it’s a busy night.",
      address: "3255 W 4th St, Los Angeles, CA",
      whyThisFits: "Easy social plan with a clear activity.",
      tags: ["indoor", "evening"],
      mapQuery: "Shatto 39 Lanes Los Angeles",
    },
  ],
  "westlake": [
    {
      id: "dynasty-typewriter",
      title: "Go to Dynasty Typewriter",
      subtitle: "Comedy / creative show night",
      category: "short",
      durationMinutes: 90,
      interests: ["comedy", "nightlife", "cheap-hangouts"],
      vibes: ["solo", "social", "date"],
      placeName: "Dynasty Typewriter",
      neighborhood: "Westlake",
      distanceText: "10–20 min away",
      priceText: "$$",
      reservationNeeded: true,
      reservationNote: "Usually worth booking ahead for shows.",
      address: "2511 Wilshire Blvd, Los Angeles, CA",
      whyThisFits: "Specific, memorable, and way more fun than a random scroll.",
      tags: ["indoor", "evening"],
      mapQuery: "Dynasty Typewriter Los Angeles",
    },
  ],
};

function normalizePlace(place: string) {
  return place.toLowerCase().trim();
}

function getMatchingAreaKeys(place: string) {
  const normalized = normalizePlace(place);

  const keys = Object.keys(AREA_PLACES);
  const directMatches = keys.filter(
    (key) => normalized.includes(key) || key.includes(normalized)
  );

  if (directMatches.length > 0) return directMatches;

  if (
    normalized.includes("los angeles") ||
    normalized.includes("la") ||
    normalized.includes("vernon")
  ) {
    return ["echo park", "silver lake", "los feliz", "downtown", "hollywood", "koreatown"];
  }

  return [];
}

export function getStarterPlacesForArea(place: string) {
  const matchingKeys = getMatchingAreaKeys(place);

  const areaSpecific = matchingKeys.flatMap((key) => AREA_PLACES[key] ?? []);

  return [...areaSpecific, ...COMMON_PLACES];
}

export function getRankedPlacesForUser(params: {
  place: string;
  interests: string[];
  minMinutes: number;
  maxMinutes: number;
}) {
  const { place, interests, minMinutes, maxMinutes } = params;

  const allPlaces = getStarterPlacesForArea(place);
  const matchingKeys = getMatchingAreaKeys(place);

  const eligible = allPlaces.filter(
    (p) => p.durationMinutes >= minMinutes && p.durationMinutes <= maxMinutes
  );

  return eligible
    .map((p) => {
      let score = 0;

      for (const interest of interests) {
        if (p.interests.includes(interest)) score += 4;
      }

      if (matchingKeys.includes(p.neighborhood.toLowerCase())) score += 5;
      if (p.neighborhood === "Near you") score += 2;

      if (p.priceText === "$" && interests.includes("cheap-hangouts")) score += 2;
      if (p.interests.includes("solo-recharge")) score += 1;

      return { ...p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...rest }) => rest);
}

export function getAllEditableStarterAreas() {
  return Object.keys(AREA_PLACES);
}