export const INSTALL_GUIDE_KEY = 'mn-home-screen-guide-v1';

export function createInstallGuidePreference(getStorage) {
  let dismissedThisVisit = false;
  return {
    wasDismissed() {
      if (dismissedThisVisit) return true;
      try { return getStorage()?.getItem(INSTALL_GUIDE_KEY) === 'dismissed'; } catch { return false; }
    },
    dismiss() {
      dismissedThisVisit = true;
      try { getStorage()?.setItem(INSTALL_GUIDE_KEY, 'dismissed'); } catch { /* Keep working in memory. */ }
    },
  };
}

// The illustrated controls match iPhone Safari; other browsers must not receive
// instructions for a menu they don't have.
export function supportsInstallGuide({ userAgent = '', standalone = false, displayModeStandalone = false } = {}) {
  return !standalone && !displayModeStandalone
    && /\((?:iPhone|iPod)(?:;| touch;)/.test(userAgent) && /Safari\//.test(userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\//.test(userAgent);
}

export const INSTALL_SCENES = [
  'Tap the three lines at the bottom of Safari, beside the address bar.',
  'Tap Share.',
  'Tap View More in the bottom-right corner.',
  'Tap Add to Home Screen.',
  'Leave Open as Web App on, then tap Add.',
  'Movie Night is ready on your Home Screen.',
];
export const INSTALL_SCENE_MS = 2000;
export const INSTALL_START_MS = 500;
export const INSTALL_END_HOLD_MS = 3000;

export function installSceneDelay(scene) {
  if (scene === INSTALL_SCENES.length - 1) return INSTALL_END_HOLD_MS;
  return INSTALL_SCENE_MS;
}
