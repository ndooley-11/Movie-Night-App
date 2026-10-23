import { fetchRecent, fetchTopRated, fetchPopular, fetchTrending, normalizeResult, fetchDetails } from "./api.js";
import { fetchTraktTrendingTmdbIds } from "./trakt.js";

// The Discover swipe queue is built from four roughly-equal buckets so the
// mix stays 25% recent / 25% trending / 25% all-time-best / 25% everything
// else, per media type the user has enabled (movies, shows, or both).
export function emptyPageState() {
  return {
    recent: { movie: 1, tv: 1 },
    top: { movie: 1, tv: 1 },
    popular: { movie: 1, tv: 1 },
    trending: { movie: 1, tv: 1 },
  };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function passesLanguage(item, language) {
  if (language === "en") return item.originalLanguage === "en";
  if (language === "non-en") return item.originalLanguage !== "en";
  return true;
}

async function trendingBucket(mediaType, apiKey, page, traktClientId, detailCache) {
  const [day, week] = await Promise.all([
    fetchTrending(mediaType, apiKey, { window: "day", page }),
    fetchTrending(mediaType, apiKey, { window: "week", page }),
  ]);
  let combined = [...day, ...week];

  if (traktClientId) {
    const traktIds = (await fetchTraktTrendingTmdbIds(mediaType, traktClientId)).slice(0, 8);
    const seen = new Set(combined.map((r) => r.id));
    const toFetch = traktIds.filter((id) => !seen.has(id) && !detailCache.has(`${mediaType}:${id}`));
    const fetched = await Promise.all(
      toFetch.map((id) => fetchDetails(mediaType, id, apiKey).then((d) => { detailCache.set(`${mediaType}:${id}`, d); return d; }).catch(() => null))
    );
    const cachedExtra = traktIds.filter((id) => detailCache.has(`${mediaType}:${id}`)).map((id) => detailCache.get(`${mediaType}:${id}`));
    combined = [...combined, ...fetched.filter(Boolean), ...cachedExtra];
  }
  return combined;
}

/**
 * Fetches one refill round across every enabled media type and returns a
 * freshly interleaved, deduped, filtered batch plus the advanced pageState.
 */
export async function fetchDiscoverBatch({ apiKey, traktClientId, mediaTypes, language, genreMap, pageState, excludeKeys, detailCache }) {
  const nextPageState = JSON.parse(JSON.stringify(pageState));
  const buckets = { recent: [], trending: [], top: [], popular: [] };

  for (const mt of mediaTypes) {
    const [recentRaw, topRaw, popularRaw, trendingRaw] = await Promise.all([
      fetchRecent(mt, apiKey, { page: pageState.recent[mt], language }).catch(() => []),
      fetchTopRated(mt, apiKey, { page: pageState.top[mt] }).catch(() => []),
      fetchPopular(mt, apiKey, { page: pageState.popular[mt], language }).catch(() => []),
      trendingBucket(mt, apiKey, pageState.trending[mt], traktClientId, detailCache).catch(() => []),
    ]);
    nextPageState.recent[mt]++;
    nextPageState.top[mt]++;
    nextPageState.popular[mt]++;
    nextPageState.trending[mt]++;

    buckets.recent.push(...recentRaw.map((r) => normalizeResult(mt, r, genreMap)));
    buckets.top.push(...topRaw.map((r) => normalizeResult(mt, r, genreMap)));
    buckets.popular.push(...popularRaw.map((r) => normalizeResult(mt, r, genreMap)));
    buckets.trending.push(...trendingRaw.map((r) => normalizeResult(mt, r, genreMap)));
  }

  const order = ["recent", "trending", "top", "popular"];
  const filteredShuffled = {};
  for (const key of order) {
    filteredShuffled[key] = shuffle(buckets[key].filter((item) => passesLanguage(item, language)));
  }

  const seen = new Set();
  const result = [];
  let cursors = { recent: 0, trending: 0, top: 0, popular: 0 };
  let addedSomething = true;
  while (addedSomething) {
    addedSomething = false;
    for (const key of order) {
      const list = filteredShuffled[key];
      const i = cursors[key];
      if (i >= list.length) continue;
      cursors[key]++;
      const item = list[i];
      const dedupeKey = `${item.mediaType}:${item.tmdbId}`;
      if (seen.has(dedupeKey) || excludeKeys.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(item);
      addedSomething = true;
    }
  }

  return { items: result, pageState: nextPageState };
}
