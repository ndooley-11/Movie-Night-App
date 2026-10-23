import { fetchRecent, fetchTopRated, fetchPopular, fetchTrending, normalizeResult, fetchDetails } from "./api.js";
import { fetchTraktTrendingTmdbIds } from "./trakt.js";

// Discover draws each card from one of four categories, 25% of the time each:
// recent releases, trending now, all-time best, and everything else. Each
// category keeps its own pool of unseen titles that refills independently,
// so a category with bigger pages (trending merges day + week lists) can't
// crowd out the others, and one running low never stalls the rest.
export const BUCKETS = ["recent", "trending", "top", "popular"];

const POOL_LOW_WATER = 12;
const MAX_PAGES = 500; // TMDB's own ceiling for paged lists
// "Recent" means the last 3 months; once that is used up it widens rather than
// leaving the category empty.
const RECENT_WINDOWS = [3, 6, 12];

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

const keyOf = (item) => `${item.mediaType}:${item.tmdbId}`;

export function createMixer() {
  return {
    pools: Object.fromEntries(BUCKETS.map((b) => [b, []])),
    pages: Object.fromEntries(BUCKETS.map((b) => [b, { movie: 1, tv: 1 }])),
    recentStage: { movie: 0, tv: 0 },
    done: Object.fromEntries(BUCKETS.map((b) => [b, new Set()])), // media types a category has run dry for
    bag: [],
    last: null,
    shown: new Set(), // every title drawn this session, so one in two categories never repeats
  };
}

async function trendingRaw(mediaType, apiKey, page, traktClientId, detailCache) {
  const [day, week] = await Promise.all([
    fetchTrending(mediaType, apiKey, { window: "day", page }),
    fetchTrending(mediaType, apiKey, { window: "week", page }),
  ]);
  let combined = [...day, ...week];
  // Trakt only has one trending list, so blend it in on the first page only.
  if (traktClientId && page === 1) {
    const traktIds = (await fetchTraktTrendingTmdbIds(mediaType, traktClientId)).slice(0, 8);
    const seen = new Set(combined.map((r) => r.id));
    const toFetch = traktIds.filter((id) => !seen.has(id) && !detailCache.has(`${mediaType}:${id}`));
    const fetched = await Promise.all(
      toFetch.map((id) => fetchDetails(mediaType, id, apiKey).then((d) => { detailCache.set(`${mediaType}:${id}`, d); return d; }).catch(() => null))
    );
    const cached = traktIds.filter((id) => !seen.has(id) && detailCache.has(`${mediaType}:${id}`)).map((id) => detailCache.get(`${mediaType}:${id}`));
    combined = [...combined, ...fetched.filter(Boolean), ...cached];
  }
  return combined;
}

const FETCHERS = {
  recent: (mt, o, mixer) => fetchRecent(mt, o.apiKey, { page: o.page, language: o.language, months: RECENT_WINDOWS[mixer.recentStage[mt]] }),
  trending: (mt, o) => trendingRaw(mt, o.apiKey, o.page, o.traktClientId, o.detailCache),
  top: (mt, o) => fetchTopRated(mt, o.apiKey, { page: o.page }),
  popular: (mt, o) => fetchPopular(mt, o.apiKey, { page: o.page, language: o.language }),
};

export function isBucketDone(mixer, bucket, mediaTypes) {
  return mediaTypes.every((mt) => mixer.done[bucket].has(mt));
}

async function refillBucket(mixer, bucket, opts, types) {
  const { genreMap, language, genreFilter, isExcluded } = opts;
  const lists = await Promise.all(types.map(async (mt) => {
    if (mixer.done[bucket].has(mt)) return [];
    const page = mixer.pages[bucket][mt];
    let raw;
    try {
      raw = await FETCHERS[bucket](mt, { ...opts, page }, mixer);
    } catch (e) {
      return []; // a failed request isn't the end of the list; try the same page next time
    }
    if (!raw.length || page >= MAX_PAGES) {
      if (bucket === "recent" && mixer.recentStage[mt] < RECENT_WINDOWS.length - 1) {
        mixer.recentStage[mt]++;
        mixer.pages.recent[mt] = 1;
      } else {
        mixer.done[bucket].add(mt);
      }
      if (!raw.length) return [];
    } else {
      mixer.pages[bucket][mt] = page + 1;
    }
    return raw.map((r) => ({ ...normalizeResult(mt, r, genreMap), bucket }));
  }));
  const inPool = new Set(mixer.pools[bucket].map(keyOf));
  const fresh = shuffle(lists.flat()).filter((item) => {
    const k = keyOf(item);
    if (inPool.has(k) || mixer.shown.has(k) || isExcluded(k)) return false;
    inPool.add(k);
    return passesLanguage(item, language) && (!genreFilter || (item.genreNames || []).includes(genreFilter));
  });
  mixer.pools[bucket].push(...fresh);
}

/**
 * Tops up any category running low, tracked per media type so movies and
 * shows both stay stocked. One page per category per call, in parallel.
 */
export async function refillPools(mixer, opts) {
  const lowWater = Math.ceil(POOL_LOW_WATER / opts.mediaTypes.length);
  const jobs = [];
  for (const b of BUCKETS) {
    const types = opts.mediaTypes.filter((mt) =>
      !mixer.done[b].has(mt) && mixer.pools[b].filter((it) => it.mediaType === mt).length < lowWater
    );
    if (types.length) jobs.push(refillBucket(mixer, b, opts, types));
  }
  await Promise.all(jobs);
}

// A shuffled bag holding each category twice: every 8 draws come out exactly
// 25% each, in an unpredictable order. A new bag never opens with the category
// that just played, so the same category never shows more than twice in a row.
function nextBucket(mixer, available) {
  for (let tries = 0; tries < 2; tries++) {
    if (mixer.bag.length === 0) {
      mixer.bag = shuffle([...BUCKETS, ...BUCKETS]);
      if (mixer.bag[0] === mixer.last) {
        const swap = mixer.bag.findIndex((b) => b !== mixer.last);
        [mixer.bag[0], mixer.bag[swap]] = [mixer.bag[swap], mixer.bag[0]];
      }
    }
    const i = mixer.bag.findIndex((b) => available.includes(b));
    if (i >= 0) return (mixer.last = mixer.bag.splice(i, 1)[0]);
    mixer.bag = [];
  }
  return (mixer.last = available[Math.floor(Math.random() * available.length)] || null);
}

// With movies and shows both on, alternate them the same way (a shuffled bag of
// one each), so "Both" means roughly half and half rather than whichever type
// happens to have more unseen titles.
function nextType(mixer, mediaTypes) {
  if (mediaTypes.length < 2) return null;
  if (!mixer.typeBag?.length) mixer.typeBag = shuffle(mediaTypes);
  return mixer.typeBag.shift();
}

/**
 * Draws up to `count` cards, picking each one's category (and movie/show)
 * from the bags. If the pick is empty but that list isn't finished, it stops
 * early so the caller can refill, rather than quietly handing the slot to
 * another category and skewing the 25% split. A category is only skipped once
 * it is genuinely used up.
 */
export function drawCards(mixer, count, isExcluded, mediaTypes) {
  const out = [];
  const typesLeft = (b) => mediaTypes.filter((mt) => !mixer.done[b].has(mt));
  while (out.length < count) {
    const candidates = BUCKETS.filter((b) => mixer.pools[b].length > 0 || typesLeft(b).length > 0);
    if (!candidates.length) break;
    const bucket = nextBucket(mixer, candidates);
    const pool = mixer.pools[bucket];
    for (let i = pool.length - 1; i >= 0; i--) {
      const k = keyOf(pool[i]);
      if (mixer.shown.has(k) || isExcluded(k)) pool.splice(i, 1);
    }
    const type = nextType(mixer, mediaTypes);
    let i = type ? pool.findIndex((it) => it.mediaType === type) : (pool.length ? 0 : -1);
    if (i < 0) {
      const canRefill = type ? !mixer.done[bucket].has(type) : typesLeft(bucket).length > 0;
      if (canRefill) {
        mixer.bag.unshift(bucket);
        if (type) mixer.typeBag.unshift(type);
        break;
      }
      i = pool.length ? 0 : -1; // that type is finished in this category: use the other
      if (i < 0) continue;
    }
    const [item] = pool.splice(i, 1);
    mixer.shown.add(keyOf(item));
    out.push(item);
  }
  return out;
}

export function isDrained(mixer, mediaTypes) {
  return BUCKETS.every((b) => isBucketDone(mixer, b, mediaTypes) && mixer.pools[b].length === 0);
}
