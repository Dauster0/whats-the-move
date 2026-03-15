/**
 * Movie showtimes via International Showtimes API.
 * Use for cinema venues when Ticketmaster doesn't have theater events.
 * Sign up: https://www.internationalshowtimes.com/
 */

const API_KEY =
  process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY ||
  process.env.INTERNATIONAL_SHOWTIMES_API_KEY;

const BASE = "https://api.internationalshowtimes.com/v5";

export type MovieShowtimeResult = {
  movieName: string;
  startTimeText: string;
  dateText: string;
  url?: string;
  cinemaName?: string;
};

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function cinemaNameMatches(venueName: string, apiCinemaName: string): boolean {
  const v = normalize(venueName);
  const c = normalize(apiCinemaName);
  if (!v || !c) return false;
  if (c.includes(v) || v.includes(c)) return true;
  const vWords = v.split(/\s+/).filter((w) => w.length > 2);
  const matchCount = vWords.filter((w) => c.includes(w)).length;
  return matchCount >= Math.min(2, vWords.length);
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "Tonight";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "Tonight";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "Tonight";
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) {
      return "Today";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Find a specific movie + showtime for a cinema venue.
 * Uses location-based search and matches cinema by name.
 */
export async function searchMovieShowtimesForVenue(params: {
  venueName: string;
  area?: string;
  lat?: number;
  lng?: number;
}): Promise<MovieShowtimeResult | null> {
  const { venueName, lat, lng } = params;
  if (!API_KEY || !venueName || venueName.length < 3) return null;
  if (lat == null || lng == null) return null;

  try {
    const url = new URL(`${BASE}/showtimes`);
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("distance", "25");
    url.searchParams.set("countries", "US");
    url.searchParams.set("per_page", "50");

    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": API_KEY },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const showtimes = data?.showtimes ?? data?.data ?? [];
    if (!Array.isArray(showtimes) || showtimes.length === 0) return null;

    for (const st of showtimes) {
      const cinema = st.cinema ?? st.venue ?? {};
      const cinemaName =
        typeof cinema === "object"
          ? cinema.name ?? cinema.title ?? ""
          : String(cinema);
      if (!cinemaNameMatches(venueName, cinemaName)) continue;

      const movie = st.movie ?? st.film ?? {};
      const movieName =
        typeof movie === "object"
          ? movie.title ?? movie.name ?? ""
          : String(movie);
      if (!movieName || movieName.length < 2) continue;

      const startTime = st.start_at ?? st.start_time ?? st.datetime ?? "";
      return {
        movieName,
        startTimeText: formatTime(startTime),
        dateText: formatDate(startTime),
        url: st.booking_url ?? st.url ?? cinema.website,
        cinemaName,
      };
    }
    return null;
  } catch {
    return null;
  }
}
