export type LivePlaceInfo = {
  isOpenNow?: boolean;
  rating?: number;
  hoursSummary?: string;
  bookingUrl?: string;
  bookingRequired?: boolean;
  externalNote?: string;
};

export async function getLivePlaceInfo(
  mapQuery: string
): Promise<LivePlaceInfo | null> {
  try {
    // Future upgrade:
    // replace this with Google Places / Yelp / Foursquare / Ticketmaster data.
    // For now we return null so the app still works with curated data only.
    void mapQuery;
    return null;
  } catch {
    return null;
  }
}