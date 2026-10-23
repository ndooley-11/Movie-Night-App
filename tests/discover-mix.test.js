import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMixer, refillPools, drawCards, isDrained, feedUnavailable, calendar, MIX, BAG_SIZE, RECENT_YEAR_CAP } from '../src/lib/discoverFeed.js';

// A fake TMDB built from a seeded catalogue, so delivered cards can be checked
// exactly. It honours the discover query params the feed sends and pages 20
// results at a time, like the real API.
const NOW = new Date('2026-10-23T12:00:00Z').getTime();
const CAL = calendar(new Date(NOW));
const GENRES = {
  movie: { 28: 'Action', 18: 'Drama', 35: 'Comedy', 99: 'Documentary' },
  tv: { 10759: 'Action & Adventure', 18: 'Drama', 35: 'Comedy', 10764: 'Reality' },
};

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function buildCatalogue(seed = 7) {
  const r = rng(seed);
  const between = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (list) => list[Math.floor(r() * list.length)];
  const cat = { movie: [], tv: [] };
  let id = 1;
  const add = (mt, { year, date, votes, rating, poster = true, genres, lang }) => {
    const d = date ?? (year ? `${year}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}` : '');
    const item = {
      id: id++, [mt === 'movie' ? 'title' : 'name']: `${mt} ${id}`,
      [mt === 'movie' ? 'release_date' : 'first_air_date']: d,
      vote_count: votes, vote_average: rating, poster_path: poster ? `/p${id}.jpg` : null,
      genre_ids: genres ?? [pick(Object.keys(GENRES[mt]).filter((g) => g !== '10764').map(Number))],
      original_language: lang ?? (r() < 0.75 ? 'en' : pick(['fr', 'ko', 'ja', 'es'])),
      popularity: r() * 100,
    };
    cat[mt].push(item);
    return item;
  };
  for (const mt of ['movie', 'tv']) {
    const tv = mt === 'tv';
    for (let i = 0; i < 240; i++) add(mt, { year: between(1960, 2022), votes: tv ? between(1000, 20000) : between(5000, 30000), rating: 7.4 + r() * 1.5 + (tv ? 0.6 : 0) });
    for (let i = 0; i < 320; i++) add(mt, { year: between(1990, 2022), votes: tv ? between(80, 1000) : between(300, 4000), rating: (tv ? 7.2 : 6.5) + r() * 1.2 });
    for (let i = 0; i < 480; i++) add(mt, { year: between(1970, 2022), votes: tv ? between(15, 200) : between(30, 800), rating: (tv ? 6.0 : 5.5) + r() * 2 });
    for (let i = 0; i < 120; i++) {
      const days = between(5, 360);
      const d = new Date(NOW - days * 864e5).toISOString().slice(0, 10);
      add(mt, { date: d, votes: tv ? between(20, 900) : between(50, 3000), rating: 5 + r() * 3 });
    }
    // Junk that must never be dealt: unreleased, undated, no artwork.
    for (let i = 0; i < 30; i++) add(mt, { date: `2027-0${between(1, 9)}-10`, votes: 9000, rating: 8 });
    for (let i = 0; i < 30; i++) add(mt, { date: '', votes: 9000, rating: 8 });
    for (let i = 0; i < 30; i++) add(mt, { year: between(1980, 2015), votes: 9000, rating: 8, poster: false });
  }
  // Live trending: mostly new titles plus a few established ones that overlap
  // the other categories (the deduplication case).
  const trending = { movie: [], tv: [] };
  for (const mt of ['movie', 'tv']) {
    const recent = cat[mt].filter((x) => (x.release_date || x.first_air_date) >= CAL.recentFrom && (x.release_date || x.first_air_date) <= CAL.today);
    const older = cat[mt].filter((x) => x.vote_count >= (mt === 'tv' ? 1000 : 5000) && x.poster_path && (x.release_date || x.first_air_date) && (x.release_date || x.first_air_date) < '2020');
    trending[mt] = [...recent.slice(0, 90), ...older.slice(0, 30)];
  }
  return { cat, trending };
}

function fakeSource(data, { failing = () => false, calls } = {}) {
  return {
    async discoverPage(mt, _key, p) {
      calls?.push({ mt, ...p });
      if (failing()) throw Object.assign(new Error('TMDB request failed (503)'), { status: 503 });
      const date = mt === 'movie' ? 'release_date' : 'first_air_date';
      const dkey = mt === 'movie' ? 'primary_release_date' : 'first_air_date';
      let list = data.cat[mt].filter((x) =>
        x.vote_count >= (p['vote_count.gte'] ?? 0) && x.vote_count <= (p['vote_count.lte'] ?? Infinity) &&
        x.vote_average >= (p['vote_average.gte'] ?? 0) &&
        (!p[`${dkey}.gte`] || (x[date] && x[date] >= p[`${dkey}.gte`])) &&
        (!p[`${dkey}.lte`] || (x[date] && x[date] <= p[`${dkey}.lte`])) &&
        (!p.with_original_language || x.original_language === p.with_original_language) &&
        (!p.with_genres || x.genre_ids.includes(Number(p.with_genres))) &&
        (!p.without_genres || !x.genre_ids.some((g) => String(p.without_genres).split(',').includes(String(g)))));
      if (String(p.sort_by).startsWith('vote_average')) list = list.sort((a, b) => b.vote_average - a.vote_average);
      else list = list.sort((a, b) => b.popularity - a.popularity);
      const totalPages = Math.min(Math.ceil(list.length / 20), 500);
      return { results: list.slice((p.page - 1) * 20, p.page * 20), totalPages };
    },
    async trendingPage(mt, _key, window, page) {
      if (failing()) throw Object.assign(new Error('TMDB request failed (429)'), { status: 429 });
      const list = window === 'day' ? data.trending[mt].slice(0, 60) : data.trending[mt].slice(30);
      return { results: list.slice((page - 1) * 20, page * 20), totalPages: Math.ceil(list.length / 20) };
    },
    fetchDetails: async () => null,
    traktIds: async () => [],
  };
}

// Drives the mixer the way DiscoverTab does: refill, draw, repeat.
async function deal(mixer, opts, count, { chunk = count, rounds = 400 } = {}) {
  const out = [];
  const random = opts.random;
  for (let i = 0; i < rounds && out.length < count && !isDrained(mixer, opts.mediaTypes); i++) {
    await refillPools(mixer, opts);
    out.push(...drawCards(mixer, Math.min(chunk, count - out.length), opts.isExcluded, opts.mediaTypes, { now: opts.now, random }));
  }
  return out;
}

function setup({ mediaTypes = ['movie'], seed = 11, data = buildCatalogue(), exclude = new Set(), ...rest } = {}) {
  const opts = {
    apiKey: 'test', mediaTypes, language: 'any', genreFilter: null, genreMap: GENRES,
    isExcluded: (k) => exclude.has(k), now: NOW, random: rng(seed), source: fakeSource(data, rest), ...rest.opts,
  };
  return { mixer: createMixer(), opts, data };
}

const key = (c) => `${c.mediaType}:${c.tmdbId}`;
const bags = (cards) => Array.from({ length: Math.ceil(cards.length / BAG_SIZE) }, (_, i) => cards.slice(i * BAG_SIZE, (i + 1) * BAG_SIZE));
const tally = (list, f) => list.reduce((m, c) => ((m[f(c)] = (m[f(c)] || 0) + 1), m), {});

test('every 20 delivered cards hit 5/6/4/3/2 exactly when stock exists', async () => {
  const { mixer, opts } = setup();
  const cards = await deal(mixer, opts, 100);
  assert.equal(cards.length, 100);
  for (const bag of bags(cards)) {
    assert.deepEqual(tally(bag, (c) => c.bucket), MIX);
    assert.ok(bag.every((c) => c.bucket === c.slot), 'no fallbacks needed with ample stock');
  }
});

test('cards are interleaved, never the same category twice in a row', async () => {
  const { mixer, opts } = setup({ seed: 3 });
  const cards = await deal(mixer, opts, 80);
  cards.forEach((c, i) => { if (i) assert.notEqual(c.slot, cards[i - 1].slot, `repeat at ${i}`); });
});

test('quota accounting carries across refills: small draws still make exact bags', async () => {
  const { mixer, opts } = setup({ seed: 5 });
  const cards = await deal(mixer, opts, 60, { chunk: 3 });
  assert.equal(cards.length, 60);
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, (c) => c.bucket), MIX);
  const finished = mixer.history.filter((b) => b.delivered === BAG_SIZE);
  assert.ok(finished.length >= 2 && finished.every((b) => b.fallbacks.length === 0));
});

test('no title repeats across categories, refills and media types', async () => {
  const { mixer, opts, data } = setup({ mediaTypes: ['movie', 'tv'], seed: 9 });
  // Same TMDB id in both catalogues: movie:N and tv:N are different titles.
  const shared = data.cat.tv.find((x) => x.vote_count > 2000);
  data.cat.movie.push({ ...data.cat.movie[0], id: shared.id, title: 'Shared id movie' });
  const cards = await deal(mixer, opts, 200, { chunk: 7 });
  assert.equal(new Set(cards.map(key)).size, cards.length);
  // A trending title that is also a favourite is dealt at most once in total.
  const trendingOlder = new Set(data.trending.movie.filter((x) => x.release_date < '2020').map((x) => `movie:${x.id}`));
  const seen = cards.filter((c) => trendingOlder.has(key(c)));
  assert.equal(new Set(seen.map(key)).size, seen.length);
});

test('trending cards come only from live trending; wild cards are low-visibility and never new', async () => {
  const { mixer, opts, data } = setup({ seed: 13 });
  const cards = await deal(mixer, opts, 100);
  const trendingIds = new Set(data.trending.movie.map((x) => x.id));
  for (const c of cards.filter((c) => c.bucket === 'trending')) assert.ok(trendingIds.has(c.tmdbId));
  const wild = cards.filter((c) => c.slot === 'wild');
  assert.equal(wild.length, 15);
  for (const c of wild) {
    assert.ok(['wild', 'gems', 'favourites'].includes(c.bucket), 'wild slot never filled by trending/recent');
    if (c.bucket === 'wild') {
      assert.ok(c.voteCount >= 30 && c.voteCount <= 800, `votes ${c.voteCount}`);
      assert.ok(Number(c.year) >= 1970 && Number(c.year) <= CAL.establishedYear);
    }
  }
  // Wild cards spread across eras rather than one page of one decade.
  assert.ok(new Set(wild.map((c) => Math.floor(Number(c.year) / 10))).size >= 3);
});

test('favourites, gems and recent respect their rules; nothing unreleased, undated or posterless', async () => {
  const { mixer, opts } = setup({ seed: 17 });
  const cards = await deal(mixer, opts, 120);
  for (const c of cards) {
    assert.ok(c.poster);
    assert.match(c.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.releaseDate <= CAL.today, `future date ${c.releaseDate}`);
    if (c.bucket === 'favourites') assert.ok(c.voteCount >= 5000 && Number(c.year) <= CAL.establishedYear);
    if (c.bucket === 'gems') assert.ok(c.voteCount >= 300 && c.voteCount <= 4000 && c.voteAverage >= 6.5 && Number(c.year) >= 1990 && Number(c.year) <= CAL.establishedYear);
    if (c.bucket === 'recent') assert.ok(c.releaseDate >= CAL.recentFrom && c.voteCount >= 50);
  }
});

test(`at most ${RECENT_YEAR_CAP} of every 20 cards are from the last three calendar years`, async () => {
  const { mixer, opts } = setup({ seed: 19, mediaTypes: ['movie', 'tv'] });
  const cards = await deal(mixer, opts, 200);
  for (const bag of bags(cards)) assert.ok(bag.filter((c) => Number(c.year) >= CAL.recentYearFrom).length <= RECENT_YEAR_CAP);
});

test('a reached year cap sends trending/recent slots to older titles, and records why', async () => {
  const { mixer, opts } = setup({ seed: 23 });
  await deal(mixer, opts, 1);
  mixer.bagStats.recentYear = RECENT_YEAR_CAP;
  mixer.bag = ['recent', 'trending', ...mixer.bag.filter((b) => b !== 'recent' && b !== 'trending')];
  const cards = drawCards(mixer, 2, opts.isExcluded, opts.mediaTypes, { now: NOW, random: opts.random });
  assert.equal(cards.length, 2);
  for (const c of cards) assert.ok(Number(c.year) < CAL.recentYearFrom, `got ${c.year} from ${c.bucket}`);
  assert.deepEqual(mixer.bagStats.fallbacks.map((f) => f.reason), ['yearCap', 'yearCap'].slice(0, mixer.bagStats.fallbacks.length));
  assert.ok(mixer.bagStats.fallbacks.length >= 1);
});

test('excluded titles (saved, liked, seen, passed) are never dealt; passed ones can return when allowed', async () => {
  const data = buildCatalogue();
  const passed = new Set(data.trending.movie.slice(0, 40).map((x) => `movie:${x.id}`));
  const a = setup({ data, exclude: passed, seed: 29 });
  const hidden = await deal(a.mixer, a.opts, 60);
  assert.equal(hidden.filter((c) => passed.has(key(c))).length, 0);
  // "Show passed" on: passes are no longer in the excluded set.
  const b = setup({ data, seed: 29 });
  const shown = await deal(b.mixer, b.opts, 60);
  assert.ok(shown.some((c) => passed.has(key(c))));
});

test('exclusion is media-aware: movie:N does not hide tv:N', async () => {
  const data = buildCatalogue();
  const tvIds = data.cat.tv.map((x) => x.id);
  data.cat.movie.forEach((m, i) => { m.id = tvIds[i % tvIds.length]; });
  data.trending.movie = data.cat.movie.filter((x) => x.release_date >= CAL.recentFrom && x.release_date <= CAL.today).slice(0, 90);
  const exclude = new Set(data.cat.tv.map((x) => `movie:${x.id}`));
  const { mixer, opts } = setup({ data, exclude, mediaTypes: ['tv'], seed: 31 });
  const cards = await deal(mixer, opts, 40);
  assert.equal(cards.length, 40);
  assert.ok(cards.every((c) => c.mediaType === 'tv'));
});

test('Both mode deals roughly half movies, half shows', async () => {
  const { mixer, opts } = setup({ mediaTypes: ['movie', 'tv'], seed: 37 });
  const cards = await deal(mixer, opts, 100);
  const movies = cards.filter((c) => c.mediaType === 'movie').length;
  assert.ok(movies >= 40 && movies <= 60, `${movies} movies of 100`);
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, (c) => c.slot), MIX);
});

test('Shows only deals TV with TV-specific thresholds and no reality/talk filler in wild cards', async () => {
  const { mixer, opts } = setup({ mediaTypes: ['tv'], seed: 41 });
  const cards = await deal(mixer, opts, 60);
  assert.equal(cards.length, 60);
  assert.ok(cards.every((c) => c.mediaType === 'tv'));
  for (const c of cards.filter((c) => c.bucket === 'wild')) {
    assert.ok(c.voteCount >= 15 && c.voteCount <= 200);
    assert.ok(!c.genreIds.includes(10764));
  }
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, (c) => c.bucket), MIX);
});

test('language and genre filters hold on every card, including trending', async () => {
  const a = setup({ seed: 43, opts: { language: 'non-en' } });
  const nonEn = await deal(a.mixer, a.opts, 40);
  assert.ok(nonEn.length > 0 && nonEn.every((c) => c.originalLanguage !== 'en'));
  const b = setup({ seed: 47, opts: { language: 'en' } });
  const en = await deal(b.mixer, b.opts, 40);
  assert.ok(en.length === 40 && en.every((c) => c.originalLanguage === 'en'));
  // "Action" only exists as a movie genre: Both mode falls back to movies.
  const c = setup({ seed: 53, mediaTypes: ['movie', 'tv'], opts: { genreFilter: 'Action' } });
  const action = await deal(c.mixer, c.opts, 40);
  assert.ok(action.length > 0 && action.every((x) => x.mediaType === 'movie' && x.genreNames.includes('Action')));
});

test('Non-English keeps exact quotas when many rotated languages come back empty', async () => {
  // The fake catalogue only has fr/ko/ja/es; every other language is empty.
  const { mixer, opts } = setup({ seed: 79, mediaTypes: ['movie', 'tv'], opts: { language: 'non-en' } });
  const cards = await deal(mixer, opts, 60);
  assert.equal(cards.length, 60);
  assert.ok(cards.every((c) => c.originalLanguage !== 'en'));
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, (c) => c.bucket), MIX);
});

test('an exhausted category falls back per policy, with the substitution recorded', async () => {
  const data = buildCatalogue();
  // No recent releases at all (but trending stays live).
  data.cat.movie = data.cat.movie.filter((x) => !(x.release_date >= CAL.recentFrom));
  const { mixer, opts } = setup({ data, seed: 59 });
  const cards = await deal(mixer, opts, 60);
  assert.equal(cards.length, 60);
  const fromRecentSlots = cards.filter((c) => c.slot === 'recent');
  assert.equal(fromRecentSlots.length, 6);
  assert.ok(fromRecentSlots.every((c) => ['gems', 'favourites', 'wild'].includes(c.bucket)), 'older substitutes for new releases');
  const all = [...mixer.history, mixer.bagStats].flatMap((b) => b.fallbacks);
  assert.ok(all.filter((f) => f.slot === 'recent' && f.reason === 'exhausted').length >= 6);
  // The other categories keep their exact quotas.
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, (c) => c.slot), MIX);
});

test('wild cards are never replaced by trending or new releases, even when wild stock runs out', async () => {
  const data = buildCatalogue();
  data.cat.movie = data.cat.movie.filter((x) => !(x.vote_count >= 30 && x.vote_count < 300));
  const { mixer, opts } = setup({ data, seed: 61 });
  const cards = await deal(mixer, opts, 60);
  for (const c of cards.filter((c) => c.slot === 'wild')) assert.ok(['wild', 'gems', 'favourites'].includes(c.bucket));
});

test('very narrow filters end in a drained feed instead of loading forever', async () => {
  const data = buildCatalogue();
  const { mixer, opts } = setup({ data, seed: 67, opts: { genreFilter: 'Documentary', language: 'non-en' } });
  const cards = await deal(mixer, opts, 1000);
  assert.ok(cards.length < 1000);
  assert.ok(isDrained(mixer, opts.mediaTypes), 'feed reports it is out of stock');
  assert.equal(new Set(cards.map(key)).size, cards.length);
});

test('a TMDB outage backs off, reports unavailable, and recovers', async () => {
  let down = true;
  const calls = [];
  const { mixer, opts } = setup({ seed: 71, failing: () => down, calls });
  await refillPools(mixer, opts);
  assert.deepEqual(drawCards(mixer, 10, opts.isExcluded, opts.mediaTypes, { now: NOW }), []);
  assert.ok(feedUnavailable(mixer, opts.mediaTypes, NOW));
  assert.ok(!isDrained(mixer, opts.mediaTypes), 'an outage is not the same as running out');
  // While backing off, no further requests are made.
  const before = calls.length;
  await refillPools(mixer, { ...opts, now: NOW + 500 });
  assert.equal(calls.length, before);
  down = false;
  const later = { ...opts, now: NOW + 60_000 };
  const cards = await deal(mixer, later, 20);
  assert.equal(cards.length, 20);
});

test('request volume stays bounded while dealing a long session', async () => {
  const calls = [];
  const { mixer, opts } = setup({ seed: 73, calls, mediaTypes: ['movie', 'tv'] });
  const cards = await deal(mixer, opts, 200, { chunk: 10 });
  assert.equal(cards.length, 200);
  assert.ok(calls.length < 120, `${calls.length} discover requests for 200 cards`);
  assert.ok(calls.every((p) => p.page >= 1 && p.page <= 500));
});

test('repeated request failures do not consume pages before recovery', async () => {
  let down = true;
  const { mixer, opts, data } = setup({ seed: 83, failing: () => down });
  for (const elapsed of [0, 60_000, 120_000]) {
    await refillPools(mixer, { ...opts, now: NOW + elapsed });
    assert.equal(mixer.state.trending.movie.page, 1, 'failed trending pages must be retried');
    assert.equal(mixer.state.recent.movie.subs[''].page, 1, 'failed recent pages must be retried');
    assert.equal(mixer.state.favourites.movie.subs[''].used.size, 0, 'failed random pages are still available');
  }
  down = false;
  const cards = await deal(mixer, { ...opts, now: NOW + 180_000 }, 40);
  assert.equal(cards.length, 40);
  for (const bag of bags(cards)) assert.deepEqual(tally(bag, c => c.bucket), MIX);
  const firstTrendingPage = new Set(data.trending.movie.slice(0, 20).map(m => m.id));
  assert.ok(cards.some(c => c.bucket === 'trending' && firstTrendingPage.has(c.tmdbId)), 'the first live page survives an outage');
});

test('TV discovery never requests movie-only title sorting', async () => {
  const supported = new Set(['popularity.asc', 'popularity.desc', 'vote_average.asc', 'vote_average.desc', 'first_air_date.asc', 'first_air_date.desc']);
  for (let seed = 1; seed <= 12; seed++) {
    const calls = [];
    const { mixer, opts } = setup({ seed, mediaTypes: ['tv'], calls });
    await deal(mixer, opts, 20);
    assert.ok(calls.every(call => supported.has(call.sort_by)), 'all TV sort values must match the TV endpoint');
  }
});
