import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsInstallGuide, createInstallGuidePreference, INSTALL_SCENES, INSTALL_SCENE_MS } from '../src/lib/installGuide.js';

const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
test('Safari instructions appear only for an iPhone browser with the illustrated controls', () => {
  assert.equal(supportsInstallGuide({ userAgent: safari }), true);
  for (const userAgent of [
    safari.replace('iPhone;', 'iPad;'), safari.replace('iPhone;', 'Macintosh;'),
    safari.replace('Version/26.0', 'CriOS/140.0'), safari.replace('Version/26.0', 'FxiOS/140.0'),
    safari.replace('Version/26.0', 'EdgiOS/140.0'), safari + ' [FBAN/FBIOS]', safari + ' Instagram',
    'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', '',
  ]) assert.equal(supportsInstallGuide({ userAgent }), false, userAgent);
});
test('installed Home Screen apps never receive the installation prompt', () => {
  assert.equal(supportsInstallGuide({ userAgent: safari, standalone: true }), false);
  assert.equal(supportsInstallGuide({ userAgent: safari, displayModeStandalone: true }), false);
});
test('the recording includes View More before adding the app and ends after eleven seconds', () => {
  assert.match(INSTALL_SCENES[2], /View More/);
  assert.match(INSTALL_SCENES[3], /Add to Home Screen/);
  assert.match(INSTALL_SCENES[4], /Open as Web App/);
  assert.equal((INSTALL_SCENES.length - 1) * INSTALL_SCENE_MS, 11000);
});
test('dismissing the welcome survives a refresh and leaves room data alone', () => {
  const values = new Map([['mn-room', 'movie-room'], ['mn-me:movie-room', '1']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = createInstallGuidePreference(() => storage);
  assert.equal(first.wasDismissed(), false);
  first.dismiss();
  assert.equal(createInstallGuidePreference(() => storage).wasDismissed(), true);
  assert.equal(values.get('mn-room'), 'movie-room');
  assert.equal(values.get('mn-me:movie-room'), '1');
});
test('blocked storage never prevents dismissing the guide for the current visit', () => {
  const preference = createInstallGuidePreference(() => { throw new Error('Storage blocked'); });
  assert.equal(preference.wasDismissed(), false);
  assert.doesNotThrow(() => preference.dismiss());
  assert.equal(preference.wasDismissed(), true);
});
