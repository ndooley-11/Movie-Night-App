export const posterUrl = (p) => (p ? `https://image.tmdb.org/t/p/w342${p}` : null);
export const backdropUrl = (p) => (p ? `https://image.tmdb.org/t/p/w780${p}` : null);

async function tmdb(path, apiKey) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${apiKey}`);
  if (!res.ok) throw new Error("TMDB request failed (" + res.status + ")");
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

function monthsAgoISO(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const langParam = (language) => (language === "en" ? "&with_original_language=en" : "");

export async function fetchRecent(mediaType, apiKey, { page = 1, language = "any" } = {}) {
  const dateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
  const d = await tmdb(
    `${FIELDS[mediaType].discoverPath}?sort_by=popularity.desc&vote_count.gte=5&${dateField}.gte=${monthsAgoISO(3)}&page=${page}${langParam(language)}`,
    apiKey
  );
  return d.results || [];
}

export async function fetchTopRated(mediaType, apiKey, { page = 1 } = {}) {
  const d = await tmdb(`${FIELDS[mediaType].topRatedPath}?page=${page}`, apiKey);
  return d.results || [];
}

export async function fetchPopular(mediaType, apiKey, { page = 1, language = "any" } = {}) {
  const d = await tmdb(`${FIELDS[mediaType].discoverPath}?sort_by=popularity.desc&page=${page}${langParam(language)}`, apiKey);
  return d.results || [];
}

export async function fetchTrending(mediaType, apiKey, { window = "day", page = 1 } = {}) {
  const d = await tmdb(`${FIELDS[mediaType].trendingPath(window)}?page=${page}`, apiKey);
  return d.results || [];
}

export async function fetchGenreList(mediaType, apiKey) {
  const d = await tmdb(FIELDS[mediaType].genrePath, apiKey);
  return d.genres || [];
}
