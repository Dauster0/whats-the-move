export type ConciergeEnergy = "low" | "medium" | "high";
export type ConciergeTimeBudget = "30min" | "mid" | "allday";

export type ConciergeImageLayout = "cover" | "poster";

export type ConciergeShowtimePill = {
  label: string;
  startIso?: string;
  bookingUrl?: string;
};

export type ConciergeSuggestion = {
  title: string;
  description: string;
  category: string;
  timeRequired: string;
  energyLevel: string;
  address: string;
  startTime: string;
  /** Venue only — paired with title for event-style cards */
  venueName: string;
  mapQuery: string;
  unsplashQuery: string;
  whyNow: string;
  ticketUrl: string;
  ticketEventId: string;
  sourcePlaceName: string;
  /** Food sub-type for variety (e.g. korean_bbq) — server */
  flavorTag?: string;
  /** food | event | experience | wildcard | budget — deck slot from server */
  deckRole?: string;
  /** places_or_events | gpt_knowledge — server */
  sourceType?: string;
  cost?: string;
  isTimeSensitive?: boolean;
  distanceText?: string;
  /** From Google Places when matched */
  placeOpenNow?: boolean | null;
  /** Closing within ~45 minutes — server */
  closesSoon?: boolean;
  /** "Open until 9:00 PM" — derived from Google Places nextCloseTime, never GPT */
  openUntil?: string;
  photoUrl: string | null;
  imageLayout?: ConciergeImageLayout;
  photoSource?: string | null;
  /** Google Places resource name when matched server-side */
  googlePlaceResourceName?: string;
  /** Server: movie | event | place | experience */
  kind?: string;
  movieTitle?: string;
  theaterSubtitle?: string;
  tmdbId?: string;
  tmdbRating?: number | null;
  runtimeMinutes?: number | null;
  movieGenres?: string[];
  movieBackdropUrl?: string;
  showtimes?: ConciergeShowtimePill[];
  fandangoFallbackUrl?: string;
  /** Coming Up tab / planning — short date label on card */
  dateBadge?: string;
  /** "21+" | "18+" | "all ages" | null — from TM, Google Places types, or GPT */
  ageRestriction?: "21+" | "18+" | "all ages" | null;
};


export type ConciergeResponse = {
  suggestions: ConciergeSuggestion[];
  meta: {
    weather: { summary: string; tempC: number | null; code: number | null };
    eventCount: number;
    placeCount: number;
    model: string;
  } | null;
  error?: string;
};
