/**
 * TMDB posters/metadata + International Showtimes for concierge movie cards.
 * Env: TMDB_API_KEY (or EXPO_PUBLIC_TMDB_API_KEY), INTERNATIONAL_SHOWTIMES_API_KEY.
 */

import OpenAI from "openai";

function getTmdbKey() {
  const k = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY || "";
  const t = String(k).trim().replace(/^["']|["']$/g, "");
  return t && !t.toLowerCase().startsWith("your_") ? t : "";
}

function getShowtimesKey() {
  const k =
    process.env.INTERNATIONAL_SHOWTIMES_API_KEY ||
    process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY ||
    "";
  const t = String(k).trim();
  return t && !t.includes("your_") ? t : "";
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function cinemaMatches(venueName, cinemaName) {
  const v = normalizeName(venueName);
  const c = normalizeName(cinemaName);
  if (!v || !c) return false;
  if (c.includes(v) || v.includes(c)) return true;
  const vWords = v.split(/\s+/).filter((w) => w.length > 2);
  const matchCount = vWords.filter((w) => c.includes(w)).length;
  return matchCount >= Math.min(2, vWords.length);
}

function placeMatchesSuggestion(sourcePlaceName, place) {
  const a = normalizeName(sourcePlaceName);
  const b = normalizeName(place?.name || "");
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aw = a.split(/\s+/).filter((w) => w.length > 3);
  return aw.length >= 2 && aw.filter((w) => b.includes(w)).length >= 2;
}

function isMovieTheaterPlace(place) {
  const types = place?.types || [];
  return Array.isArray(types) && types.some((t) => t === "movie_theater" || t === "cinema");
}

async function fetchShowtimesNearby(lat, lng) {
  const key = getShowtimesKey();
  if (!key) return [];
  try {
    const url = new URL("https://api.internationalshowtimes.com/v5/showtimes");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("distance", "30");
    url.searchParams.set("countries", "US");
    url.searchParams.set("per_page", "120");
    const r = await fetch(url.toString(), {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(14000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data?.showtimes ?? data?.data ?? [];
  } catch {
    return [];
  }
}

function groupShowtimesForCinema(rawShowtimes, cinemaName) {
  const map = new Map();
  for (const st of rawShowtimes) {
    const cinema = st.cinema ?? st.venue ?? {};
    const cn = typeof cinema === "object" ? cinema.name ?? cinema.title ?? "" : String(cinema);
    if (!cinemaMatches(cinemaName, cn)) continue;
    const movie = st.movie ?? st.film ?? {};
    const movieTitle =
      typeof movie === "object" ? movie.title ?? movie.name ?? "" : String(movie);
    if (!movieTitle || movieTitle.length < 2) continue;
    const start = st.start_at ?? st.start_time ?? st.datetime ?? "";
    const bookingUrl = st.booking_url ?? st.url ?? (typeof cinema === "object" ? cinema.website : "") ?? "";
    if (!map.has(movieTitle)) map.set(movieTitle, []);
    map.get(movieTitle).push({ startIso: start, bookingUrl: String(bookingUrl || "") });
  }
  return [...map.entries()].map(([movieTitle, slots]) => ({
    movieTitle,
    slots: slots.filter((x) => x.startIso),
  }));
}

function formatTimeLocal(iso, timeZone) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      timeZone: timeZone || undefined,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isSameLocalDay(iso, nowIso, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date(iso)) === fmt.format(new Date(nowIso));
  } catch {
    return true;
  }
}

async function tmdbSearchMovie(title) {
  const key = getTmdbKey();
  if (!key || !title) return null;
  try {
    const u = new URL("https://api.themoviedb.org/3/search/movie");
    u.searchParams.set("api_key", key);
    u.searchParams.set("query", String(title).slice(0, 120));
    u.searchParams.set("include_adult", "false");
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json();
    const r0 = data?.results?.[0];
    if (!r0?.id) return null;
    return fetchTmdbMovieById(String(r0.id));
  } catch {
    return null;
  }
}

export async function fetchTmdbMovieById(id) {
  const key = getTmdbKey();
  if (!key || !id) return null;
  try {
    const u = new URL(`https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}`);
    u.searchParams.set("api_key", key);
    u.searchParams.append("append_to_response", "credits");
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const m = await r.json();
    const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null;
    const backdrop = m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null;
    const genres = Array.isArray(m.genres) ? m.genres.map((g) => g.name).filter(Boolean) : [];
    return {
      id: String(m.id),
      title: m.title || m.original_title || "",
      overview: String(m.overview || "").slice(0, 1200),
      posterUrl: poster,
      backdropUrl: backdrop,
      voteAverage: typeof m.vote_average === "number" ? m.vote_average : null,
      runtime: typeof m.runtime === "number" ? m.runtime : null,
      genres,
      releaseDate: m.release_date || "",
    };
  } catch {
    return null;
  }
}

async function pickMovieWithGpt(candidates, { areaLabel, energy, userContextLine, timeZone, nowIso }) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey || openaiKey.includes("your")) return null;
  const client = new OpenAI({ apiKey: openaiKey });
  const model = process.env.CONCIERGE_MODEL || "gpt-4o-mini";
  const slim = candidates.slice(0, 8).map((c) => ({
    movieTitle: c.movieTitle,
    showtimeCount: c.slots.length,
  }));
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: `Pick exactly ONE movie title from the candidate list (copy movieTitle verbatim). Write a 1–2 sentence pitch about THAT film only—specific, no generic filler. For whyNow: ONLY if there is a genuine time-sensitive reason (opening week, final days in theaters, tonight-only format, last showtimes). If nothing specific, use empty string for whyNow. Return JSON only:
{"movieTitle":"string","pitch":"string","whyNow":"string"}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            areaLabel,
            energy,
            userContextLine,
            localTimeContext: { timeZone, nowIso },
            candidates: slim,
          }).slice(0, 8000),
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackPick(candidates) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => b.slots.length - a.slots.length);
  return sorted[0];
}

function buildShowtimePills(slots, timeZone, nowIso) {
  const tonight = slots.filter((s) => isSameLocalDay(s.startIso, nowIso, timeZone));
  const use = tonight.length ? tonight : slots;
  const out = [];
  for (const s of use.slice(0, 8)) {
    const label = formatTimeLocal(s.startIso, timeZone);
    if (!label) continue;
    out.push({
      label,
      startIso: s.startIso,
      bookingUrl: s.bookingUrl || "",
    });
  }
  return out;
}

function fandangoSearchUrl(movieTitle, theaterHint) {
  const q = `${movieTitle} ${theaterHint} tickets`.trim();
  return `https://www.fandango.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Enrich suggestions that reference a movie theater with real titles, showtimes, TMDB art.
 */
export async function enrichConciergeMovieSuggestions(suggestions, ctx) {
  const lat = ctx.lat;
  const lng = ctx.lng;
  const timeZone = ctx.timeZone || "UTC";
  const nowIso = ctx.nowIso || new Date().toISOString();
  const areaLabel = String(ctx.areaLabel || "");
  const energy = ctx.energy || "medium";
  const userContextLine = String(ctx.userContextLine || "");
  const nearbyPlaces = Array.isArray(ctx.nearbyPlaces) ? ctx.nearbyPlaces : [];

  if (lat == null || lng == null) return suggestions;

  const rawShowtimes = await fetchShowtimesNearby(lat, lng);
  const out = [];

  for (const s of suggestions) {
    const place =
      nearbyPlaces.find((p) => placeMatchesSuggestion(s.sourcePlaceName, p)) ||
      nearbyPlaces.find((p) => placeMatchesSuggestion(s.mapQuery, p));
    const theaterOk = Boolean(place && isMovieTheaterPlace(place));
    const looksMovie =
      theaterOk ||
      /\bmovie\b|cinema|imax|theater|theatre|regal|amc|alamo|landmark/i.test(
        `${s.title} ${s.description} ${s.sourcePlaceName}`
      );

    if (!theaterOk && !looksMovie) {
      out.push(s);
      continue;
    }
    if (!theaterOk && looksMovie && !String(s.sourcePlaceName || "").trim()) {
      out.push(s);
      continue;
    }

    const cinemaName = String(
      theaterOk ? place.name : s.sourcePlaceName || s.venueName || ""
    ).trim();
    if (!cinemaName) {
      out.push(s);
      continue;
    }

    const grouped = groupShowtimesForCinema(rawShowtimes, cinemaName);
    if (!grouped.length) {
      const u = fandangoSearchUrl(s.title, cinemaName);
      out.push({
        ...s,
        kind: "movie",
        theaterSubtitle: `Tonight at ${cinemaName}`,
        ticketUrl: s.ticketUrl || u,
        fandangoFallbackUrl: u,
      });
      continue;
    }

    const gptPick = await pickMovieWithGpt(grouped, {
      areaLabel,
      energy,
      userContextLine,
      timeZone,
      nowIso,
    });
    let chosen =
      gptPick?.movieTitle && typeof gptPick.movieTitle === "string"
        ? grouped.find((g) => g.movieTitle === gptPick.movieTitle)
        : null;
    if (!chosen) chosen = fallbackPick(grouped);
    if (!chosen) {
      out.push(s);
      continue;
    }

    const pitch = String(gptPick?.pitch || "").trim();
    const whyNow = String(gptPick?.whyNow || "").trim();
    const tmdb = await tmdbSearchMovie(chosen.movieTitle);
    const pills = buildShowtimePills(chosen.slots, timeZone, nowIso);
    const poster = tmdb?.posterUrl || s.photoUrl;
    const description =
      pitch ||
      (tmdb?.overview ? String(tmdb.overview).slice(0, 280) : s.description);

    out.push({
      ...s,
      kind: "movie",
      title: chosen.movieTitle,
      movieTitle: chosen.movieTitle,
      venueName: cinemaName,
      theaterSubtitle: `Tonight at ${cinemaName}`,
      description,
      whyNow: whyNow || "",
      photoUrl: poster || s.photoUrl,
      imageLayout: "poster",
      photoSource: tmdb?.posterUrl ? "tmdb" : s.photoSource,
      tmdbId: tmdb?.id || "",
      tmdbRating: tmdb?.voteAverage ?? null,
      runtimeMinutes: tmdb?.runtime ?? null,
      movieGenres: tmdb?.genres?.length ? tmdb.genres.slice(0, 4) : [],
      movieBackdropUrl: tmdb?.backdropUrl || "",
      showtimes: pills,
      mapQuery: `${cinemaName} ${areaLabel}`.trim() || s.mapQuery,
      unsplashQuery: s.unsplashQuery || "movie theater neon lobby night",
      ticketUrl: pills[0]?.bookingUrl || s.ticketUrl || fandangoSearchUrl(chosen.movieTitle, cinemaName),
      fandangoFallbackUrl: fandangoSearchUrl(chosen.movieTitle, cinemaName),
    });
  }

  return out;
}
