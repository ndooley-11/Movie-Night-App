import { discoverPage, trendingPage, normalizeResult, fetchDetails } from "./api.js";
import { fetchTraktTrendingTmdbIds } from "./trakt.js";

// ---------------------------------------------------------------------------
// Discover mix, per 20 cards (supersedes the earlier 4 x 25% split):
//   Trending now 5 · All-time favourites 6 · Under the radar 4 ·
//   Obscure wild cards 3 · Recent releases 2
// Slots come from a shuffled quota bag rather than a per-card dice roll, so
// every 20 delivered cards hit the targets exactly when stock allows. The bag
// persists across refills. Wild-card slots are random, lower-visibility
// exploration and are never filled with trending or new releases.
// ---------------------------------------------------------------------------
export const MIX = { trending: 5, favourites: 6, gems: 4, wild: 3, recent: 2 };
export const BUCKETS = Object.keys(MIX);
export const BAG_SIZE = 20;
// At most 7 of every 20 cards from this calendar year or the previous two.
export const RECENT_YEAR_CAP = 7;

// Fallback policy. Only used when a category is genuinely exhausted, temporarily
// unavailable (backing off after errors), or a slot would break the year cap.
// Every substitution is recorded in the bag's stats; quotas and the year cap
// are not guaranteed for an undersupplied pool.
export const FALLBACK = {
  trending: ["recent", "gems", "favourites"],
  favourites: ["gems", "wild"],
  gems: ["favourites", "wild"],
  wild: ["gems", "favourites"],      // never trending or new releases
  recent: ["gems", "favourites", "wild"], // older substitutes for new releases
};

const TV_NON_SCRIPTED = [10763, 10764, 10766, 10767]; // news, reality, soap, talk
const TV_KIDS = 10762;
// Vote counts for TV run far lower than for films, so each type has its own floors.
const RULES = {
  movie: {
    favourites: { votes: [5000, null], rating: 7.4 },
    gems: { votes: [300, 4000], rating: 6.5, fromYear: 1990 },
    wild: { votes: [30, 800], rating: 5.5, fromYear: 1970, runtime: 70 },
    recent: { votes: [50, null] },
  },
  tv: {
    favourites: { votes: [1000, null], rating: 8.0, exclude: TV_NON_SCRIPTED },
    gems: { votes: [80, 1000], rating: 7.2, fromYear: 1990, exclude: TV_NON_SCRIPTED },
    wild: { votes: [15, 200], rating: 6.0, fromYear: 1970, runtime: 20, exclude: [...TV_NON_SCRIPTED, TV_KIDS] },
    recent: { votes: [20, null], exclude: TV_NON_SCRIPTED },
  },
};
// TMDB can't query "not English", so non-English discovery rotates through
// specific languages instead of discarding mostly-English pages.
const NON_EN = ["fr", "es", "ko", "ja", "it", "de", "hi", "zh", "pt", "sv", "da", "no", "tr", "th", "fa", "pl", "nl", "ru", "id", "tl", "ar", "he", "cn", "ta", "te", "ml"];
const WILD_SORTS = ["popularity.desc", "popularity.asc", "vote_average.desc", "vote_average.asc", "DATE.desc", "DATE.asc", "original_title.asc", "original_title.desc"];

const POOL_LOW = { trending: 8, favourites: 8, gems: 6, wild: 2, recent: 4 };
// Only a few titles are kept from each random wild-card window, so consecutive
// wild cards come from different eras rather than one page of one decade.
const WILD_TAKE = 2;
const PAGE_CAP = { trending: 20, recent: 30, favourites: 30, gems: 100 };
const BARREN_LIMIT = { trending: 4, favourites: 4, gems: 5, wild: 6, recent: 4 };
const TRENDING_TTL_MS = 30 * 60 * 1000;
const DIVERSITY_WINDOW = 8;

const keyOf = (item) => `${item.mediaType}:${item.tmdbId}`;
const pickRandom = (list, random) => list[Math.floor(random() * list.length)];

function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Date boundaries, worked out from the current date rather than hardcoded years. */
export function calendar(now = new Date()) {
  const y = now.getFullYear();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const yearAgo = new Date(now);
  yearAgo.setFullYear(y - 1);
  return { today: iso(now), recentFrom: iso(yearAgo), recentYearFrom: y - 2, establishedYear: y - 3, establishedTo: `${y - 3}-12-31` };
}

export const isRecentYear = (item, cal) => Number(item.year) >= cal.recentYearFrom;

function passesLanguage(item, language) {
  if (language === "en") return item.originalLanguage === "en";
  if (language === "non-en") return item.originalLanguage !== "en";
  return true;
}

/**
 * Whether a title belongs in a category. Applied on arrival even though the
 * TMDB query already asked for the same thing, so a loosely matched result
 * can never be misclassified (a trending title is only ever from trending).
 */
export function eligibleFor(item, bucket, ctx) {
  if (!item.poster || !/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate || "")) return false; // no artwork / unverified date
  if (item.releaseDate > ctx.cal.today) return false; // not released yet
  if (!passesLanguage(item, ctx.language)) return false;
  if (ctx.genreFilter && !(item.genreNames || []).includes(ctx.genreFilter)) return false;
  if (bucket === "trending") return true;
  const r = RULES[item.mediaType]?.[bucket];
  if (!r) return false;
  if (r.exclude && (item.genreIds || []).some((g) => r.exclude.includes(g))) return false;
  if (item.voteCount < r.votes[0] || (r.votes[1] != null && item.voteCount > r.votes[1])) return false;
  if (r.rating && item.voteAverage < r.rating) return false;
  if (bucket === "recent") return item.releaseDate >= ctx.cal.recentFrom;
  const year = Number(item.year);
  return year <= ctx.cal.establishedYear && (!r.fromYear || year >= r.fromYear);
}

function genreIdFor(genreMap, mediaType, name) {
  const hit = Object.entries(genreMap?.[mediaType] || {}).find(([, n]) => n === name);
  return hit ? hit[0] : null;
}

function discoverParams(bucket, mt, ctx, random) {
  const r = RULES[mt][bucket];
  const date = mt === "movie" ? "primary_release_date" : "first_air_date";
  const p = { "vote_count.gte": r.votes[0] };
  if (r.votes[1] != null) p["vote_count.lte"] = r.votes[1];
  if (r.rating) p["vote_average.gte"] = r.rating;
  if (r.runtime) p["with_runtime.gte"] = r.runtime;
  if (r.exclude) p.without_genres = r.exclude.join(",");
  if (bucket === "recent") {
    Object.assign(p, { [`${date}.gte`]: ctx.cal.recentFrom, [`${date}.lte`]: ctx.cal.today, sort_by: "popularity.desc" });
  } else if (bucket === "wild") {
    // A random decade-long window and a random ordering each time, so the
    // wild cards wander across eras instead of repeating page one.
    const span = Math.max(1, ctx.cal.establishedYear - r.fromYear - 8);
    const start = r.fromYear + Math.floor(random() * span);
    const sorts = mt === "tv" ? WILD_SORTS.filter((sort) => !sort.startsWith("original_title")) : WILD_SORTS; // TV has no title sort
    Object.assign(p, { [`${date}.gte`]: `${start}-01-01`, [`${date}.lte`]: `${Math.min(start + 9, ctx.cal.establishedYear)}-12-31`, sort_by: pickRandom(sorts, random).replace("DATE", date) });
  } else {
    Object.assign(p, { [`${date}.lte`]: ctx.cal.establishedTo, sort_by: bucket === "favourites" ? "vote_average.desc" : "popularity.desc" });
    if (r.fromYear) p[`${date}.gte`] = `${r.fromYear}-01-01`;
  }
  return p;
}

function newState() {
  return { page: 1, subs: {}, totals: {}, barren: 0, failures: 0, backoffUntil: 0, done: false, fetchedAt: 0 };
}

export function createMixer() {
  return {
    pools: Object.fromEntries(BUCKETS.map((b) => [b, []])),
    state: Object.fromEntries(BUCKETS.map((b) => [b, { movie: newState(), tv: newState() }])),
    bag: [],
    lastSlot: null,
    typeBag: [],
    shown: new Set(), // every title delivered this session, across all categories
    recentPicks: [],
    bagStats: null,
    history: [],
    lastError: null,
  };
}

const unavailable = (st, now) => st.done || st.backoffUntil > now;

// ---- fetching ---------------------------------------------------------------

const DEFAULT_SOURCE = { discoverPage, trendingPage, fetchDetails, traktIds: fetchTraktTrendingTmdbIds };

async function fetchBucketPage(bucket, mt, st, opts, ctx, random) {
  const src = { ...DEFAULT_SOURCE, ...opts.source };
  if (bucket === "trending") {
    if (st.page > PAGE_CAP.trending) { st.done = true; return []; }
    const page = st.page;
    const [day, week] = await Promise.all([src.trendingPage(mt, opts.apiKey, "day", page), src.trendingPage(mt, opts.apiKey, "week", page)]);
    st.page = page + 1;
    let raw = [...day.results, ...week.results];
    if (!raw.length) st.done = true;
    // Trakt's (optional) trending list is genuine trending too: blend in page one.
    if (page === 1 && opts.traktClientId) {
      const ids = (await src.traktIds(mt, opts.traktClientId).catch(() => [])).slice(0, 8);
      const have = new Set(raw.map((r) => r.id));
      const extra = await Promise.all(ids.filter((id) => !have.has(id)).map(async (id) => {
        const key = `${mt}:${id}`;
        if (opts.detailCache?.has(key)) return opts.detailCache.get(key);
        const d = await src.fetchDetails(mt, id, opts.apiKey).catch(() => null);
        if (d) opts.detailCache?.set(key, d);
        return d;
      }));
      raw = [...raw, ...extra.filter(Boolean)];
    }
    return raw;
  }

  const params = discoverParams(bucket, mt, ctx, random);
  const genreId = ctx.genreFilter ? genreIdFor(opts.genreMap, mt, ctx.genreFilter) : null;
  if (ctx.genreFilter && !genreId) { st.done = true; return []; } // that genre doesn't exist for this media type
  if (genreId) params.with_genres = genreId;

  // Paging is tracked per original language. For non-English that means a
  // category is only out of stock once every language in the rotation is.
  const langs = ctx.language === "non-en" ? NON_EN : [ctx.language === "en" ? "en" : ""];
  const open = langs.filter((l) => !st.subs[l]?.done);
  if (!open.length) { st.done = true; return []; }
  const lang = pickRandom(open, random);
  const sub = (st.subs[lang] ??= { page: 1, totalPages: null, used: new Set(), done: false });
  if (lang) params.with_original_language = lang;

  if (bucket === "recent") {
    const res = await src.discoverPage(mt, opts.apiKey, { ...params, page: sub.page });
    sub.page++;
    sub.totalPages = res.totalPages;
    if (!res.results.length || sub.page > Math.min(res.totalPages, PAGE_CAP.recent)) sub.done = true;
    return res.results;
  }

  if (bucket === "wild") {
    const windowKey = `${params.with_original_language || ""}|${Object.values(params).join("|")}`;
    const known = st.totals[windowKey];
    let res = await src.discoverPage(mt, opts.apiKey, { ...params, page: 1 + Math.floor(random() * Math.min(known || 3, 500)) });
    st.totals[windowKey] = res.totalPages;
    // Guessed past the end of a small window: one bounded retry inside it.
    if (!res.results.length && res.totalPages > 0) res = await src.discoverPage(mt, opts.apiKey, { ...params, page: 1 + Math.floor(random() * res.totalPages) });
    return res.results;
  }

  // favourites / gems: random unused pages, so sessions don't all open on page one
  const cap = Math.min(sub.totalPages ?? 3, PAGE_CAP[bucket]);
  const free = Array.from({ length: cap }, (_, i) => i + 1).filter((p) => !sub.used.has(p));
  if (!free.length) { sub.done = true; return []; }
  let page = pickRandom(free, random);
  let res = await src.discoverPage(mt, opts.apiKey, { ...params, page });
  sub.used.add(page);
  sub.totalPages = res.totalPages;
  if (!res.results.length && res.totalPages > 0 && page > res.totalPages) {
    page = 1 + Math.floor(random() * res.totalPages);
    res = await src.discoverPage(mt, opts.apiKey, { ...params, page });
    sub.used.add(page);
  }
  const left = Array.from({ length: Math.min(res.totalPages, PAGE_CAP[bucket]) }, (_, i) => i + 1).some((p) => !sub.used.has(p));
  if (!left) sub.done = true;
  return res.results;
}

async function refillBucket(mixer, bucket, mt, opts, ctx, random, now) {
  const st = mixer.state[bucket][mt];
  if (bucket === "trending" && st.fetchedAt && now - st.fetchedAt > TRENDING_TTL_MS) {
    // Trending changes through the day: start again from the live first page.
    Object.assign(st, newState());
  }
  try {
    const raw = await fetchBucketPage(bucket, mt, st, opts, ctx, random);
    st.failures = 0;
    st.backoffUntil = 0;
    st.fetchedAt = now;
    const pool = mixer.pools[bucket];
    const pooled = new Set(pool.map(keyOf));
    const fresh = shuffle(raw.map((r) => ({ ...normalizeResult(mt, r, opts.genreMap), mediaType: mt })), random).filter((item) => {
      const k = keyOf(item);
      if (pooled.has(k) || mixer.shown.has(k) || opts.isExcluded(k) || !eligibleFor(item, bucket, ctx)) return false;
      pooled.add(k);
      return true;
    });
    pool.push(...(bucket === "wild" ? fresh.slice(0, WILD_TAKE) : fresh));
    st.barren = fresh.length ? 0 : st.barren + 1;
    if (st.barren >= BARREN_LIMIT[bucket] * (ctx.language === "non-en" && bucket !== "trending" ? 3 : 1)) st.done = true;
  } catch (e) {
    // Back off rather than hammering TMDB; the deck uses what it has meanwhile.
    st.failures++;
    st.backoffUntil = now + Math.min(30000, 1500 * 2 ** (st.failures - 1));
    mixer.lastError = { at: now, status: e.status || null };
  }
}

/**
 * Tops up any category running low, per media type, one page each, in
 * parallel. Categories that are exhausted or backing off are skipped.
 */
export async function refillPools(mixer, opts) {
  const now = opts.now ?? Date.now();
  const random = opts.random ?? Math.random;
  const ctx = { cal: calendar(new Date(now)), language: opts.language, genreFilter: opts.genreFilter };
  const jobs = [];
  for (const b of BUCKETS) {
    const low = Math.ceil(POOL_LOW[b] / opts.mediaTypes.length);
    for (const mt of opts.mediaTypes) {
      const st = mixer.state[b][mt];
      if (unavailable(st, now)) continue;
      if (mixer.pools[b].filter((it) => it.mediaType === mt && !mixer.shown.has(keyOf(it))).length >= low) continue;
      jobs.push(refillBucket(mixer, b, mt, opts, ctx, random, now));
    }
  }
  await Promise.all(jobs);
}

// ---- drawing ----------------------------------------------------------------

function startBag(mixer, random) {
  if (mixer.bagStats) mixer.history = [...mixer.history, mixer.bagStats].slice(-50);
  const slots = BUCKETS.flatMap((b) => Array(MIX[b]).fill(b));
  let bag = null;
  // Interleave: no category twice in a row, including across bag boundaries.
  for (let attempt = 0; attempt < 300 && !bag; attempt++) {
    const s = shuffle(slots, random);
    if (s[0] !== mixer.lastSlot && s.every((b, i) => i === 0 || b !== s[i - 1])) bag = s;
  }
  mixer.bag = bag || shuffle(slots, random);
  mixer.bagStats = { slots: {}, sources: {}, recentYear: 0, fallbacks: [], capExceeded: 0, skipped: [], delivered: 0 };
}

function nextType(mixer, mediaTypes, random) {
  if (mediaTypes.length < 2) return mediaTypes[0];
  if (!mixer.typeBag.length) mixer.typeBag = shuffle(mediaTypes, random);
  return mixer.typeBag.shift();
}

// Among the next few candidates, prefer a different decade and lead genre from
// the last few cards, so eras and genres vary where the pool allows it.
function chooseVaried(cands, recent) {
  let best = 0, bestScore = Infinity;
  cands.slice(0, DIVERSITY_WINDOW).forEach((c, i) => {
    const decade = Math.floor(Number(c.year) / 10);
    let score = 0;
    for (const r of recent) {
      if (Math.floor(Number(r.year) / 10) === decade) score++;
      if (c.genreNames?.[0] && r.genreNames?.includes(c.genreNames[0])) score++;
    }
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return cands[best];
}

function take(mixer, bucket, mt, isExcluded, cal, olderOnly) {
  const pool = mixer.pools[bucket];
  for (let i = pool.length - 1; i >= 0; i--) {
    const k = keyOf(pool[i]);
    if (mixer.shown.has(k) || isExcluded(k)) pool.splice(i, 1);
  }
  const cands = pool.filter((it) => it.mediaType === mt && (!olderOnly || !isRecentYear(it, cal)));
  if (!cands.length) return null;
  const item = chooseVaried(cands, mixer.recentPicks);
  pool.splice(pool.indexOf(item), 1);
  return item;
}

const canRefill = (mixer, bucket, mt, now) => !unavailable(mixer.state[bucket][mt], now);
const anyLeft = (mixer, bucket, mediaTypes) => mixer.pools[bucket].some((it) => mediaTypes.includes(it.mediaType)) || mediaTypes.some((mt) => !mixer.state[bucket][mt].done);

/**
 * Draws up to `count` cards. Each card's category comes from the quota bag and
 * its media type alternates in Both mode. When a category just needs a refill
 * it stops early (the caller refills and draws again) rather than giving the
 * slot away; it only substitutes, with accounting, when a category is truly
 * exhausted or unavailable, or to respect the recent-year cap.
 */
export function drawCards(mixer, count, isExcluded, mediaTypes, { now = Date.now(), random = Math.random } = {}) {
  const cal = calendar(new Date(now));
  const out = [];
  while (out.length < count) {
    if (!mixer.bag.length) startBag(mixer, random);
    const slot = mixer.bag[0];
    const stats = mixer.bagStats;
    const capReached = stats.recentYear >= RECENT_YEAR_CAP;
    const type = nextType(mixer, mediaTypes, random);
    const types = [type, ...mediaTypes.filter((t) => t !== type)];
    const putBack = () => { if (mediaTypes.length > 1) mixer.typeBag.unshift(type); };

    let item = null, source = slot, reason = null, waitForRefill = false;
    // 1. The slot's own category, preferring this card's media type.
    for (const t of types) {
      item = take(mixer, slot, t, isExcluded, cal, capReached);
      if (item) break;
      const ownOnlyRecent = capReached && (slot === "trending" || slot === "recent");
      if (!ownOnlyRecent && canRefill(mixer, slot, t, now)) { waitForRefill = true; break; }
    }
    if (!item && waitForRefill) { putBack(); break; }

    // 2. Substitute from the fallback order, older titles if the cap is reached.
    if (!item) {
      reason = capReached && (slot === "trending" || slot === "recent") ? "yearCap" : mediaTypes.some((t) => mixer.state[slot][t].done) ? "exhausted" : "unavailable";
      for (const fb of FALLBACK[slot]) {
        if (capReached && fb === "recent") continue; // can never supply an older title
        for (const t of types) {
          item = take(mixer, fb, t, isExcluded, cal, capReached);
          if (item) { source = fb; break; }
        }
        if (item) break;
        if (types.some((t) => canRefill(mixer, fb, t, now))) { waitForRefill = true; break; }
      }
      if (!item && waitForRefill) { putBack(); break; }
    }

    // 3. Nothing older anywhere: keep the deck usable, but record it.
    if (!item && capReached) {
      for (const b of [slot, ...FALLBACK[slot]]) {
        for (const t of types) { item = take(mixer, b, t, isExcluded, cal, false); if (item) { source = b; break; } }
        if (item) break;
      }
      if (item) stats.capExceeded++;
    }

    if (!item) {
      // Still recoverable (errors backing off)? Wait. Truly exhausted? Skip the slot.
      const recoverable = [slot, ...FALLBACK[slot]].some((b) => mediaTypes.some((t) => !mixer.state[b][t].done));
      if (recoverable) { putBack(); break; }
      mixer.bag.shift();
      stats.skipped.push(slot);
      if (!BUCKETS.some((b) => anyLeft(mixer, b, mediaTypes))) break;
      continue;
    }

    mixer.bag.shift();
    mixer.lastSlot = slot;
    stats.slots[slot] = (stats.slots[slot] || 0) + 1;
    stats.sources[source] = (stats.sources[source] || 0) + 1;
    stats.delivered++;
    if (isRecentYear(item, cal)) stats.recentYear++;
    if (source !== slot) stats.fallbacks.push({ slot, source, reason });
    mixer.shown.add(keyOf(item));
    mixer.recentPicks = [item, ...mixer.recentPicks].slice(0, 3);
    out.push({ ...item, bucket: source, slot });
  }
  return out;
}

export function isDrained(mixer, mediaTypes) {
  return BUCKETS.every((b) => mediaTypes.every((t) => mixer.state[b][t].done) && !mixer.pools[b].some((it) => mediaTypes.includes(it.mediaType) && !mixer.shown.has(keyOf(it))));
}

/** True while TMDB requests are failing and backing off (for an honest empty state). */
export function feedUnavailable(mixer, mediaTypes, now = Date.now()) {
  return BUCKETS.some((b) => mediaTypes.some((t) => mixer.state[b][t].failures > 0 && !mixer.state[b][t].done)) && mixer.lastError && now - mixer.lastError.at < 60000;
}
