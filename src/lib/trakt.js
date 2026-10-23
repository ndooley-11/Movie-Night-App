// Optional free secondary trending signal. Requires a free Trakt.tv app
// (Client ID only, no OAuth) — https://trakt.tv/oauth/applications.
// Returns an empty list on any failure so it's always safe to call.
const PATH = { movie: "movies", tv: "shows" };

export async function fetchTraktTrendingTmdbIds(mediaType, clientId) {
  if (!clientId) return [];
  try {
    const res = await fetch(`https://api.trakt.tv/${PATH[mediaType]}/trending?limit=20`, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
      },
    });
    if (!res.ok) return [];
    const d = await res.json();
    return (d || [])
      .map((entry) => entry[mediaType]?.ids?.tmdb)
      .filter((id) => typeof id === "number");
  } catch (e) {
    return [];
  }
}
