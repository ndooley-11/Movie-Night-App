// Optional: OMDb (free key at omdbapi.com/apikey.aspx) is the free source for
// Rotten Tomatoes and IMDb scores. Returns null on any failure so callers can
// fall back to TMDB's own rating.
const cache = new Map();
const settled = new Map();

export function getCachedOmdb(imdbId) {
  return settled.get(imdbId) ?? null;
}

export function fetchOmdbRatings(imdbId, apiKey) {
  if (!imdbId || !apiKey) return Promise.resolve(null);
  if (cache.has(imdbId)) return cache.get(imdbId);
  const p = fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || d.Response === "False") return null;
      const rt = (d.Ratings || []).find((x) => x.Source === "Rotten Tomatoes");
      return {
        rottenTomatoes: rt ? rt.Value : null,
        imdb: d.imdbRating && d.imdbRating !== "N/A" ? d.imdbRating : null,
      };
    })
    .catch(() => null)
    .then((r) => { settled.set(imdbId, r); return r; });
  cache.set(imdbId, p);
  return p;
}

export function rottenTomatoesSearchUrl(title) {
  return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`;
}
