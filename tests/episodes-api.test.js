import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchShowEpisodes } from '../src/lib/api.js';

test('episode metadata includes specials, exposes no synopsis, and records partial-season failures', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(input).pathname;
    if (path === '/3/tv/1') return { ok: true, json: async () => ({ status: 'Returning Series', seasons: [{ season_number: 0, episode_count: 1 }, { season_number: 1, episode_count: 2 }, { season_number: 2, episode_count: 1 }] }) };
    if (path.endsWith('/season/2')) return { ok: false, status: 503 };
    const n = path.endsWith('/season/0') ? 0 : 1;
    return { ok: true, json: async () => ({ season_number: n, episodes: Array.from({ length: n ? 2 : 1 }, (_, i) => ({ episode_number: i + 1, name: 'Episode', air_date: '2026-01-01', overview: 'Do not expose spoilers' })) }) };
  };
  try {
    const result = await fetchShowEpisodes(1, 'local-test');
    assert.equal(result.complete, false);
    assert.equal(result.episodes.length, 3);
    assert.equal(result.episodes[0].season, 0);
    assert.ok(result.episodes.every(e => !('overview' in e)));
  } finally { globalThis.fetch = original; }
});
