export type AICandidate = {
  id: string;
  kind: "place" | "event";
  category: string;
  exactTitle: string;
  sourceName: string;
  subtitle: string;
  reasonHints: string[];
  durationMinutes: number;
  address: string;
  mapQuery: string;
  actionType: "maps" | "tickets" | "none";
  externalUrl: string;
  distanceText: string;
  priceText: "$" | "$$" | "$$$";
  startsAtText?: string;
  score: number;
  lat?: number;
  lng?: number;
};

function normalize(text: string) {
  return text.toLowerCase();
}

export function getCuratedExperiences(area: string): AICandidate[] {
  const a = normalize(area);

  if (
  a.includes("los angeles") ||
  a.includes("hollywood") ||
  a.includes("west hollywood") ||
  a.includes("santa monica") ||
  a.includes("pasadena") ||
  a.includes("los feliz") ||
  a.includes("silver lake") ||
  a.includes("university park") ||
  a.includes("north university park") ||
  a.includes("usc") ||
  a.includes("downtown la") ||
  a.includes("dtla")
) {
    return [
      {
        id: "la-griffith-sunset",
        kind: "place",
        category: "scenic",
        exactTitle: "Visit Griffith Observatory for sunset",
        sourceName: "Griffith Observatory",
        subtitle: "A scenic evening plan that actually feels worth leaving for",
        reasonHints: [
          "iconic LA destination",
          "best in the evening",
          "specific and memorable",
        ],
        durationMinutes: 90,
        address: "2800 E Observatory Rd, Los Angeles, CA",
        mapQuery: "Griffith Observatory",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$",
        score: 10,
      },
      {
        id: "la-comedy-store",
        kind: "place",
        category: "comedy",
        exactTitle: "The Comedy Store on Sunset has a show tonight",
        sourceName: "The Comedy Store",
        subtitle: "Iconic Hollywood comedy club—check their lineup for tonight's acts",
        reasonHints: [
          "high-energy",
          "great for 1 hr+",
          "more compelling than a generic outing",
        ],
        durationMinutes: 120,
        address: "8433 Sunset Blvd, West Hollywood, CA",
        mapQuery: "The Comedy Store",
        actionType: "tickets",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$$",
        score: 10,
      },
      {
        id: "la-level8",
        kind: "place",
        category: "nightclub",
        exactTitle: "Level8 has rooftop views and DJs tonight",
        sourceName: "Level8",
        subtitle: "Downtown LA rooftop club with skyline views",
        reasonHints: [
          "nightlife",
          "specific venue",
          "great for going out",
        ],
        durationMinutes: 180,
        address: "888 S Olive St, Los Angeles, CA",
        mapQuery: "Level8 Los Angeles",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Downtown LA",
        priceText: "$$",
        score: 10,
      },
      {
        id: "la-exchange",
        kind: "place",
        category: "nightclub",
        exactTitle: "Exchange LA — historic stock exchange turned club with DJs tonight",
        sourceName: "Exchange LA",
        subtitle: "Historic stock exchange turned nightclub in the Financial District",
        reasonHints: [
          "iconic LA nightlife",
          "specific destination",
          "unique venue",
        ],
        durationMinutes: 180,
        address: "618 S Spring St, Los Angeles, CA",
        mapQuery: "Exchange LA",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Downtown LA",
        priceText: "$$",
        score: 9,
      },
      {
        id: "la-escondido-trail",
        kind: "place",
        category: "trail",
        exactTitle: "Do the Escondido Falls Trail this afternoon",
        sourceName: "Escondido Falls Trail",
        subtitle: "A real outdoor outing with a destination",
        reasonHints: [
          "named trail",
          "worth the drive",
          "good long-block activity",
        ],
        durationMinutes: 150,
        address: "Escondido Falls Trailhead, Malibu, CA",
        mapQuery: "Escondido Falls Trailhead",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$",
        score: 10,
      },
      {
        id: "la-largo",
        kind: "place",
        category: "live_performance",
        exactTitle: "Largo at the Coronet — intimate comedy and music venue, check their lineup",
        sourceName: "Largo at the Coronet",
        subtitle: "Iconic LA venue for comedy, music, and variety shows",
        reasonHints: [
          "live performance",
          "feels intentional",
          "strong 1 hr+ move",
        ],
        durationMinutes: 120,
        address: "366 N La Cienega Blvd, Los Angeles, CA",
        mapQuery: "Largo at the Coronet",
        actionType: "tickets",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$$",
        score: 9,
      },
      {
        id: "la-grand-central-market",
        kind: "place",
        category: "market",
        exactTitle: "Grand Central Market has 40+ vendors—dinner and people-watching",
        sourceName: "Grand Central Market",
        subtitle: "A destination with built-in energy",
        reasonHints: [
          "food plus movement",
          "specific destination",
          "works well for a longer block",
        ],
        durationMinutes: 90,
        address: "317 S Broadway, Los Angeles, CA",
        mapQuery: "Grand Central Market",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$$",
        score: 9,
      },
      {
        id: "la-last-bookstore",
        kind: "place",
        category: "bookstore",
        exactTitle: "The Last Bookstore — two floors of used and new books, labyrinth, art",
        sourceName: "The Last Bookstore",
        subtitle: "Downtown LA landmark with labyrinth and art installations",
        reasonHints: [
          "named destination",
          "works solo",
          "specific and visually interesting",
        ],
        durationMinutes: 75,
        address: "453 S Spring St, Los Angeles, CA",
        mapQuery: "The Last Bookstore",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Drive depending on traffic",
        priceText: "$",
        score: 8,
      },
      {
        id: "la-codered",
        kind: "place",
        category: "nightclub",
        exactTitle: "Code Red LA — hard techno and psytrance raves downtown",
        sourceName: "Code Red LA",
        subtitle: "Check @codered.la for lineup and tickets",
        reasonHints: [
          "LA rave scene",
          "hard techno & psy",
          "downtown venues",
        ],
        durationMinutes: 180,
        address: "Downtown Los Angeles, CA",
        mapQuery: "Code Red LA Los Angeles",
        actionType: "maps",
        externalUrl: "https://linktr.ee/CodeRedLA",
        distanceText: "Downtown LA",
        priceText: "$$",
        score: 9,
      },
      {
        id: "la-cafe-tondo",
        kind: "place",
        category: "cafe",
        exactTitle: "Cafe Tondo has bolero nights and live jazz—check their schedule",
        sourceName: "Cafe Tondo",
        subtitle: "Mexico City–inspired café and wine bar in Chinatown",
        reasonHints: [
          "coffee by day, bar by night",
          "live music & bolero nights",
          "Chinatown gem",
        ],
        durationMinutes: 90,
        address: "1135 N Alameda St, Los Angeles, CA",
        mapQuery: "Cafe Tondo Chinatown Los Angeles",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Chinatown",
        priceText: "$$",
        score: 9,
      },
      {
        id: "la-chinatown-marketplace",
        kind: "place",
        category: "market",
        exactTitle: "Chinatown Central Plaza — shops, food, and walking around",
        sourceName: "Chinatown LA",
        subtitle: "Shops, food, and the Central Plaza",
        reasonHints: [
          "walking + eating",
          "unique neighborhood",
          "specific destination",
        ],
        durationMinutes: 90,
        address: "Chinatown Central Plaza, Los Angeles, CA",
        mapQuery: "Chinatown Los Angeles",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Chinatown",
        priceText: "$$",
        score: 8,
      },
    ];
  }

  if (a.includes("new york") || a.includes("brooklyn") || a.includes("manhattan")) {
    return [
      {
        id: "nyc-comedy-cellar",
        kind: "place",
        category: "comedy",
        exactTitle: "Comedy Cellar in the Village has a show tonight",
        sourceName: "Comedy Cellar",
        subtitle: "A specific night plan with real payoff",
        reasonHints: ["iconic comedy venue", "great evening move"],
        durationMinutes: 120,
        address: "117 MacDougal St, New York, NY",
        mapQuery: "Comedy Cellar",
        actionType: "tickets",
        externalUrl: "",
        distanceText: "Subway or walk depending on where you are",
        priceText: "$$",
        score: 10,
      },
      {
        id: "nyc-brooklyn-bridge",
        kind: "place",
        category: "scenic",
        exactTitle: "Walk the Brooklyn Bridge around sunset",
        sourceName: "Brooklyn Bridge",
        subtitle: "A scenic move that feels like a real plan",
        reasonHints: ["iconic", "specific", "great evening payoff"],
        durationMinutes: 90,
        address: "Brooklyn Bridge, New York, NY",
        mapQuery: "Brooklyn Bridge",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Transit depending on where you are",
        priceText: "$",
        score: 9,
      },
    ];
  }

  if (a.includes("san francisco") || a.includes("sf")) {
    return [
      {
        id: "sf-lands-end",
        kind: "place",
        category: "trail",
        exactTitle: "Do the Lands End Trail this afternoon",
        sourceName: "Lands End Trail",
        subtitle: "A scenic outdoor outing with a real destination",
        reasonHints: ["named trail", "specific", "worth the time"],
        durationMinutes: 120,
        address: "Lands End Trail, San Francisco, CA",
        mapQuery: "Lands End Trail",
        actionType: "maps",
        externalUrl: "",
        distanceText: "Transit or drive depending on where you are",
        priceText: "$",
        score: 10,
      },
    ];
  }

  return [];
}