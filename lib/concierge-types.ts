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
  /** From Google Places when matched */
  placeOpenNow?: boolean | null;
  /** Closing within ~45 minutes — server */
  closesSoon?: boolean;
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
