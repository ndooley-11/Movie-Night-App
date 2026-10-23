import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleTitles, chooseTitle, fanTitles } from '../src/lib/picking.js';
import { withReview, withProgress, episodeGap, nextEpisode, caughtUpWithReleased, allFinishedTogether } from '../src/lib/personalMedia.js';

const metadata = { complete: true, episodes: [
  { season: 0, episode: 1, airDate: '2020-01-01' },
  { season: 1, episode: 1, airDate: '2020-01-01' },
  { season: 1, episode: 2, airDate: '2020-01-02' },
  { season: 2, episode: 1, airDate: '2020-01-03' },
  { season: 2, episode: 2, airDate: '2099-01-01' },
] };

test('picker combines content, genre, watched and veto filters', () => {
  const list = [{ id: 'a', genreNames: ['Action'] }, { id: 'b', mediaType: 'tv', genreNames: ['Action'] }, { id: 'c', watched: true, genreNames: ['Action'] }, { id: 'd', genreNames: ['Drama'] }];
  assert.deepEqual(eligibleTitles(list, { contentType: 'movies', genres: ['Action'] }).map(m => m.id), ['a']);
  assert.equal(eligibleTitles(list, { genres: ['Action'], vetoed: ['a'], contentType: 'movies' }).length, 0);
  assert.equal(eligibleTitles(list, { unwatchedOnly: false }).length, 4);
  assert.equal(chooseTitle([], () => 0), null);
  assert.equal(chooseTitle(list, () => .999).id, 'd');
});
test('fan supports one candidate, no artwork, and many titles without changing selection pool', () => {
  const list = Array.from({ length: 100 }, (_, id) => ({ id }));
  assert.equal(fanTitles(list).length, 5);
  assert.equal(fanTitles(list)[4].id, 99);
  assert.deepEqual(fanTitles([list[0]]), [list[0]]);
  assert.equal(list.length, 100);
});
test('review writes and deletes only the selected stable slot, preserving ratings and old data', () => {
  const initial = { id: 'legacy', ratings: { Nico: 4 }, reviews: { p1: { text: 'Partner', spoiler: true } } };
  const result = withReview(initial, 0, { text: '  Lovely film  ', spoiler: false }, 10);
  assert.equal(result.reviews.p0.text, 'Lovely film');
  assert.equal(result.reviews.p1.text, 'Partner');
  assert.equal(result.ratings.Nico, 4);
  assert.equal(initial.reviews.p0, undefined);
  assert.equal(withReview(result, 0, null).reviews.p1.text, 'Partner');
  assert.throws(() => withReview(initial, -1, { text: 'Invalid' }));
  assert.throws(() => withReview(initial, 0, { text: ' '.repeat(10) }));
  assert.throws(() => withReview(initial, 0, { text: 'x'.repeat(5001) }));
});
test('progress updates preserve partner, notes and watched flag; corrections and Not started work', () => {
  const show = { mediaType: 'tv', watched: false, reviews: { p0: { text: 'Great' } }, showProgress: { p1: { season: 2, episode: 1 } } };
  const next = withProgress(show, 0, { season: 1, episode: 2 }, 1);
  assert.deepEqual(next.showProgress.p1, show.showProgress.p1);
  assert.equal(next.watched, false);
  assert.equal(next.reviews.p0.text, 'Great');
  assert.equal(withProgress(next, 0, null).showProgress.p0, null);
  assert.throws(() => withProgress(show, 0, { season: 1, episode: 0 }));
  assert.throws(() => withProgress({ mediaType: 'movie' }, 0, null));
});
test('episode gaps cross season boundaries and exclude specials', () => {
  assert.equal(episodeGap({ season: 1, episode: 2 }, { season: 2, episode: 1 }, metadata), 1);
  assert.equal(episodeGap(null, { season: 2, episode: 1 }, metadata), 3);
  assert.equal(episodeGap({ season: 2, episode: 1 }, { season: 1, episode: 2 }, metadata), -1);
  assert.equal(episodeGap({ season: 0, episode: 1 }, null, metadata), null);
  assert.equal(episodeGap({ season: 8, episode: 1 }, null, metadata), null);
  assert.equal(episodeGap(null, null, { ...metadata, complete: false }), null);
});
test('next episode never skips unreleased episodes, unknown dates, or incomplete metadata', () => {
  assert.equal(nextEpisode({ season: 1, episode: 2 }, metadata, '2026-10-23').season, 2);
  assert.equal(nextEpisode({ season: 2, episode: 1 }, metadata, '2026-10-23'), null);
  assert.equal(nextEpisode(null, metadata, '2026-10-23').episode, 1);
  assert.equal(nextEpisode(null, { ...metadata, complete: false }), null);
  assert.equal(nextEpisode(null, { complete: true, episodes: [{ season: 1, episode: 1, airDate: null }] }), null);
  assert.equal(caughtUpWithReleased({ season: 2, episode: 1 }, metadata, '2026-10-23'), true);
  assert.equal(caughtUpWithReleased({ season: 1, episode: 2 }, metadata, '2026-10-23'), false);
});

test('independent review and progress edits survive serialized room snapshots and name changes', () => {
  let movie = { id: 'show', mediaType: 'tv', ratings: { 'Old name': 5 }, watched: false };
  movie = withReview(movie, 0, { text: 'First viewer', spoiler: false }, 1);
  movie = withReview(JSON.parse(JSON.stringify(movie)), 1, { text: 'Second viewer', spoiler: true }, 2);
  movie = withProgress(movie, 0, { season: 1, episode: 2 }, 3);
  movie = withProgress(JSON.parse(JSON.stringify(movie)), 1, { season: 2, episode: 1 }, 4);
  assert.equal(movie.reviews.p0.text, 'First viewer');
  assert.equal(movie.reviews.p1.spoiler, true);
  assert.equal(movie.showProgress.p0.episode, 2);
  assert.equal(movie.showProgress.p1.season, 2);
  assert.equal(movie.ratings['Old name'], 5);
});

test('a previous-season completion does not complete a newly resumed show for both viewers', () => {
  const show = { showProgress: { p0: { season: 2, episode: 4, completed: true }, p1: { season: 1, episode: 10, completed: true } } };
  assert.equal(allFinishedTogether(show), false);
  show.showProgress.p1 = { season: 2, episode: 4, completed: true };
  assert.equal(allFinishedTogether(show), true);
  assert.equal(allFinishedTogether({}), false);
});
