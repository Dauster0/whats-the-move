export type ConciergeEnergy = "low" | "medium" | "high";
export type ConciergeTimeBudget = "30min" | "mid" | "allday";

export type ConciergeImageLayout = "cover" | "poster";

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
  photoUrl: string | null;
  imageLayout?: ConciergeImageLayout;
  photoSource?: string | null;
  /** Google Places resource name when matched server-side */
  googlePlaceResourceName?: string;
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
