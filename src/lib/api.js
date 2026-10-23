export const posterUrl = (p) => (p ? `https://image.tmdb.org/t/p/w342${p}` : null);
export const backdropUrl = (p) => (p ? `https://image.tmdb.org/t/p/w780${p}` : null);

async function tmdb(path, apiKey) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${apiKey}`);
  if (!res.ok) throw Object.assign(new Error("TMDB request failed (" + res.status + ")"), { status: res.status });
  return res.json();
}

// The two media types share almost every TMDB endpoint shape, just with
// different field names (title/name, release_date/first_air_date). Centralizing
// that here means every other call site can just say "movie" or "tv".
const FIELDS = {
  movie: { titleField: "title", dateField: "release_date", searchPath: "/search/movie", genrePath: "/genre/movie/list", detailsPath: (id) => `/movie/${id}`, providersPath: (id) => `/movie/${id}/watch/providers`, discoverPath: "/discover/movie", topRatedPath: "/movie/top_rated", trendingPath: (w) => `/trending/movie/${w}` },
  tv: { titleField: "name", dateField: "first_air_date", searchPath: "/search/tv", genrePath: "/genre/tv/list", detailsPath: (id) => `/tv/${id}`, providersPath: (id) => `/tv/${id}/watch/providers`, discoverPath: "/discover/tv", topRatedPath: "/tv/top_rated", trendingPath: (w) => `/trending/tv/${w}` },
};

export const MEDIA_TYPES = ["movie", "tv"];

export function mediaTypesForFilter(contentType) {
  if (contentType === "movies") return ["movie"];
  if (contentType === "shows") return ["tv"];
  return ["movie", "tv"];
}

export function titleOf(mediaType, raw) {
  return raw[FIELDS[mediaType].titleField] || raw.title || raw.name || "";
}

export function yearOf(mediaType, raw) {
  return (raw[FIELDS[mediaType].dateField] || "").slice(0, 4);
}

export function normalizeResult(mediaType, raw, genreMap) {
  const genreNames = (raw.genre_ids || raw.genres?.map((g) => g.id) || [])
    .map((id) => genreMap?.[mediaType]?.[id])
    .filter(Boolean);
  return {
    tmdbId: raw.id,
    mediaType,
    title: titleOf(mediaType, raw),
    year: yearOf(mediaType, raw),
    poster: posterUrl(raw.poster_path),
    backdrop: backdropUrl(raw.backdrop_path),
    overview: raw.overview || "",
    genreNames,
    genreIds: raw.genre_ids || [],
    originalLanguage: raw.original_language || "",
    voteAverage: raw.vote_average || 0,
    voteCount: raw.vote_count || 0,
    releaseDate: raw[FIELDS[mediaType].dateField] || "",
  };
}

export async function fetchGenreMap(apiKey) {
  const map = { movie: {}, tv: {} };
  for (const mt of MEDIA_TYPES) {
    try {
      const d = await tmdb(FIELDS[mt].genrePath, apiKey);
      (d.genres || []).forEach((g) => { map[mt][g.id] = g.name; });
    } catch (e) { /* genre names are cosmetic, fine to leave empty */ }
  }
  return map;
}

export async function searchMedia(query, apiKey, mediaType) {
  const d = await tmdb(`${FIELDS[mediaType].searchPath}?query=${encodeURIComponent(query)}`, apiKey);
  return (d.results || []).filter((r) => r.poster_path || r.overview);
}

export async function fetchDetails(mediaType, id, apiKey) {
  return tmdb(FIELDS[mediaType].detailsPath(id), apiKey);
}

export async function fetchProviders(mediaType, id, apiKey, region) {
  if (!apiKey) return { flatrate: [], rent: [], buy: [], free: [] };
  try {
    const d = await tmdb(FIELDS[mediaType].providersPath(id), apiKey);
    const r = (d.results || {})[region] || {};
    return {
      flatrate: (r.flatrate || []).map((p) => p.provider_name),
      rent: (r.rent || []).map((p) => p.provider_name),
      buy: (r.buy || []).map((p) => p.provider_name),
      free: (r.free || r.ads || []).map((p) => p.provider_name),
    };
  } catch (e) { return { flatrate: [], rent: [], buy: [], free: [] }; }
}

/** One page of /discover with the given query params; also returns TMDB's page count. */
export async function discoverPage(mediaType, apiKey, params) {
  const query = new URLSearchParams({ include_adult: "false", include_video: "false", ...params }).toString();
  const d = await tmdb(`${FIELDS[mediaType].discoverPath}?${query}`, apiKey);
  return { results: d.results || [], totalPages: Math.min(d.total_pages || 0, 500) };
}

/** One page of TMDB's live day or week trending list. */
export async function trendingPage(mediaType, apiKey, window, page = 1) {
  const d = await tmdb(`${FIELDS[mediaType].trendingPath(window)}?page=${page}`, apiKey);
  return { results: d.results || [], totalPages: Math.min(d.total_pages || 0, 500) };
}

function pickTrailer(videos) {
  const yt = (videos?.results || []).filter((v) => v.site === "YouTube");
  const best =
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt.find((v) => v.type === "Teaser");
  return best ? `https://www.youtube.com/watch?v=${best.key}` : null;
}

export async function fetchFullDetails(mediaType, id, apiKey, region) {
  const d = await tmdb(`${FIELDS[mediaType].detailsPath(id)}?append_to_response=credits,videos,external_ids,watch/providers`, apiKey);
  const title = titleOf(mediaType, d);
  const year = yearOf(mediaType, d);
  const crew = d.credits?.crew || [];
  const people = mediaType === "movie"
    ? crew.filter((c) => c.job === "Director").map((c) => c.name)
    : (d.created_by || []).map((c) => c.name);
  const runtime = mediaType === "movie" ? d.runtime : d.episode_run_time?.[0];
  const providers = d["watch/providers"]?.results?.[region] || {};
  return {
    tmdbId: d.id,
    mediaType,
    title,
    year,
    poster: posterUrl(d.poster_path),
    tagline: d.tagline || "",
    overview: d.overview || "",
    genres: (d.genres || []).map((g) => g.name),
    runtime: runtime || null,
    seasons: mediaType === "tv" ? d.number_of_seasons || null : null,
    peopleLabel: mediaType === "movie" ? "Directed by" : "Created by",
    people: Array.from(new Set(people)).slice(0, 3),
    cast: (d.credits?.cast || []).slice(0, 6).map((c) => ({
      name: c.name,
      character: c.character || "",
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    })),
    tmdbRating: d.vote_count > 0 ? Math.round(d.vote_average * 10) / 10 : null,
    tmdbVotes: d.vote_count || 0,
    imdbId: d.external_ids?.imdb_id || d.imdb_id || null,
    trailerUrl: pickTrailer(d.videos) || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${year} trailer`)}`,
    hasOfficialTrailer: !!pickTrailer(d.videos),
    streaming: (providers.flatrate || []).map((p) => p.provider_name),
    watch: watchOptions(providers),
  };
}

function watchOptions(r) {
  const entry = (p) => ({ name: p.provider_name, logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null });
  return {
    link: r.link || null,
    flatrate: (r.flatrate || []).map(entry),
    free: [...(r.free || []), ...(r.ads || [])].map(entry),
    rent: [...(r.rent || []), ...(r.buy || [])].map(entry),
  };
}

export async function fetchGenreList(mediaType, apiKey) {
  const d = await tmdb(FIELDS[mediaType].genrePath, apiKey);
  return d.genres || [];
}

// Do not persist episode synopses or expose future episode names in the UI.
export async function fetchShowEpisodes(id, apiKey) {
  const show = await tmdb(`/tv/${id}`, apiKey);
  const seasons = (show.seasons || []).filter(s => s.episode_count > 0);
  const episodes = [];
  let complete = true;
  // Bound parallel requests for shows with a long run.
  for (let i = 0; i < seasons.length; i += 6) {
    const batch = await Promise.allSettled(seasons.slice(i, i + 6).map(s => tmdb(`/tv/${id}/season/${s.season_number}`, apiKey)));
    batch.forEach((result, offset) => {
      if (result.status !== 'fulfilled') { if (seasons[i + offset].season_number > 0) complete = false; return; }
      const season = result.value;
      if (season.season_number > 0 && (season.episodes || []).length !== seasons[i + offset].episode_count) complete = false;
      episodes.push(...(season.episodes || []).map(e => ({ season: season.season_number, episode: e.episode_number, name: e.name || '', airDate: e.air_date || null })));
    });
  }
  return { episodes, complete, status: show.status, seasons: seasons.map(s => ({ number: s.season_number, count: s.episode_count })) };
}
