import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceFor, streamingAccess, providerAccess, groupProviders } from '../src/lib/streaming.js';
import { ratingAt, stepRating, starFill, ratingText } from '../src/lib/rating.js';
import { withSeenIt } from '../src/lib/seenIt.js';

test('TMDB provider names map to the services people pick in Settings', () => {
  const cases = {
    'Netflix': 'Netflix', 'Netflix Standard with Ads': 'Netflix', 'Disney Plus': 'Disney+',
    'Amazon Prime Video': 'Prime Video', 'Amazon Prime Video with Ads': 'Prime Video', 'HBO Max': 'Max',
    'Max': 'Max', 'HBO Max Amazon Channel': 'Max', 'Paramount Plus Premium': 'Paramount+',
    'Paramount+ Amazon Channel': 'Paramount+', 'Apple TV Plus': 'Apple TV+', 'Peacock Premium': 'Peacock', 'Hulu': 'Hulu',
  };
  for (const [tmdb, ours] of Object.entries(cases)) assert.equal(serviceFor(tmdb), ours, tmdb);
  for (const other of ['Amazon Video', 'Apple TV Store', 'Starz Amazon Channel', 'MGM Plus', 'Tubi TV', 'Maxdome']) assert.equal(serviceFor(other), null, other);
});

test('access level reflects who can stream it: both, one of you, or neither', () => {
  const me = ['Netflix', 'Max'], partner = ['Netflix', 'Disney+'];
  assert.equal(streamingAccess({ flatrate: ['Netflix Standard with Ads'] }, me, partner).level, 'both');
  assert.deepEqual(streamingAccess({ flatrate: ['HBO Max'] }, me, partner), { level: 'me', via: ['Max'], flatrate: ['HBO Max'], free: [], rent: [] });
  assert.equal(streamingAccess({ flatrate: ['Disney Plus'] }, me, partner).level, 'partner');
  assert.equal(streamingAccess({ flatrate: ['HBO Max', 'Disney Plus'] }, me, partner).level, 'both', 'different services each still means both can watch');
  assert.equal(streamingAccess({ flatrate: ['Starz'] }, me, partner).level, 'neither');
  assert.deepEqual(streamingAccess({ flatrate: ['Philo', 'Starz Amazon Channel', 'Starz'] }, me, partner).via, ['Philo', 'Starz'], 'neither names the services cleanly');
  assert.equal(streamingAccess({ flatrate: [], rent: ['Amazon Video'] }, me, partner).rentOnly, true);
  assert.equal(streamingAccess({ free: ['Tubi TV'] }, [], []).level, 'both', 'free with ads is open to everyone');
  assert.equal(streamingAccess(undefined, me, partner).level, 'unknown');
  assert.equal(providerAccess('Paramount Plus Premium', ['Paramount+'], []), 'me');
  assert.equal(providerAccess('Starz', me, partner), 'neither');
});

test('Where to watch collapses tiers and storefront add-ons into one row per service', () => {
  const rows = groupProviders(['Starz', 'Starz Amazon Channel', 'Starz Apple TV channel', 'Starz Roku Premium Channel',
    'Paramount Plus Essential', 'Paramount Plus Premium', 'Paramount+ Amazon Channel', 'Netflix', 'Netflix Standard with Ads', 'Philo']);
  assert.deepEqual(rows.map(r => r.name), ['Starz', 'Paramount+', 'Netflix', 'Philo']);
  assert.equal(groupProviders([{ name: 'HBO Max', logo: 'x.png' }])[0].logo, 'x.png');
});

test('half-star ratings: left half of a star is a half, keyboard steps by halves', () => {
  assert.equal(ratingAt(1, 200), 0.5);
  assert.equal(ratingAt(30, 200), 1);
  assert.equal(ratingAt(50, 200), 1.5);
  assert.equal(ratingAt(199, 200), 5);
  assert.equal(ratingAt(-20, 200), 0.5);
  assert.equal(ratingAt(500, 200), 5);
  assert.equal(stepRating(3, 0.5), 3.5);
  assert.equal(stepRating(0.5, -0.5), 0);
  assert.equal(stepRating(5, 0.5), 5);
  assert.deepEqual([1, 2, 3, 4, 5].map(n => starFill(3.5, n)), [1, 1, 1, 0.5, 0]);
  assert.equal(ratingText(3.5), '3.5 of 5 stars');
  assert.equal(ratingText(0), 'Not rated');
});

test('Seen it adds the title as watched by one person with a rating and note', () => {
  const item = { tmdbId: 7, mediaType: 'movie', title: 'Heat', year: '1995' };
  const out = withSeenIt([{ id: 'x', tmdbId: 1 }], item, { me: 'Nico', meIdx: 0, rating: 4.5, text: ' Great ', id: 'new', now: 5 });
  assert.equal(out.length, 2);
  const added = out[0];
  assert.deepEqual(added.seenBy, { Nico: 5 });
  assert.equal(added.watched, true);
  assert.equal(added.ratings.Nico, 4.5);
  assert.equal(added.reviews.p0.text, 'Great');
  assert.equal(added.reviews.p1, undefined);
  assert.equal(added.addedBy, 'Nico');
});

test('Seen it updates an existing entry instead of duplicating it, and keeps the partner\'s data', () => {
  const existing = { id: 'e', tmdbId: 7, mediaType: 'movie', seenBy: { Syd: 1 }, watched: true, watchedAt: 1, ratings: { Syd: 3 }, reviews: { p1: { text: 'ok' } } };
  const out = withSeenIt([existing], { tmdbId: 7, mediaType: 'movie' }, { me: 'Nico', meIdx: 0, rating: 2, now: 9 });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].seenBy, { Syd: 1, Nico: 9 });
  assert.deepEqual(out[0].ratings, { Syd: 3, Nico: 2 });
  assert.equal(out[0].watchedAt, 1);
  assert.equal(out[0].reviews.p1.text, 'ok');
  assert.throws(() => withSeenIt([], { tmdbId: 1 }, { me: 'Nico', meIdx: 0, rating: 3.3 }));
  assert.equal(withSeenIt([], { tmdbId: 1 }, { me: 'Nico', meIdx: 0 })[0].ratings.Nico, undefined, 'no rating is fine');
});
