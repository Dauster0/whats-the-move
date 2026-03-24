import { searchEventsForVenue } from "./live-event-search";
import { searchMovieShowtimesForVenue } from "./movie-showtimes";

/**
 * Venues where going only makes sense with a specific same-day show or screening.
 * (Not parks, markets, museums, nightlife as a vibe, etc.)
 */
export function isEventDependentVenueCategory(category: string): boolean {
  const c = String(category || "").toLowerCase();
  return [
    "comedy",
    "live_music",
    "theater",
    "theatre",
    "cinema",
    "movie_theater",
    "live_performance",
  ].includes(c);
}

/**
 * True if we can match a same-day Ticketmaster event for this venue, or a movie showtime
 * for screen venues. Used outside ai-grounding (e.g. suggestion engine) to avoid showing
 * empty "check the lineup" cards.
 */
export async function verifySameDayLiveListingForPlace(
  place: { name: string; category: string },
  ctx: { area: string; lat?: number; lng?: number; nowMs: number }
): Promise<boolean> {
  const cat = String(place.category || "").toLowerCase();
  if (!isEventDependentVenueCategory(cat)) return true;

  const event = await searchEventsForVenue({
    venueName: place.name,
    area: ctx.area,
    lat: ctx.lat,
    lng: ctx.lng,
    nowMs: ctx.nowMs,
  });
  if (event && event.name && event.name !== "Live event") {
    return true;
  }

  if (
    ["cinema", "theatre", "theater", "movie_theater"].includes(cat) &&
    ctx.lat != null &&
    ctx.lng != null
  ) {
    const movie = await searchMovieShowtimesForVenue({
      venueName: place.name,
      area: ctx.area,
      lat: ctx.lat,
      lng: ctx.lng,
    });
    if (movie?.movieName) return true;
  }

  return false;
}
