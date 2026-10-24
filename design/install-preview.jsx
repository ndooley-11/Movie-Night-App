// Local UI fixture: no Firebase connection or real room writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RoomGate from '../src/components/RoomGate.jsx';
import InstallGuide from '../src/components/InstallGuide.jsx';
import { supportsInstallGuide } from '../src/lib/installGuide.js';
import '../src/styles.css';
// Fixture-only media emulation for a browser without a motion-preference tool.
if (new URLSearchParams(location.search).get('reduced') === '1') {
  const nativeMatch = window.matchMedia.bind(window);
  window.matchMedia = query => query === '(prefers-reduced-motion: reduce)'
    ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
    : nativeMatch(query);
}
const forcePreview = !supportsInstallGuide({ userAgent: navigator.userAgent, standalone: navigator.standalone, displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches });
function Preview() {
  const [open, setOpen] = useState(true);
  return <><div inert={forcePreview && open ? '' : undefined}><RoomGate onJoin={() => {}} onCreate={() => {}} /></div>{forcePreview && (open ? <InstallGuide onClose={() => setOpen(false)} /> : <button className="link-btn" style={{ position: 'fixed', bottom: 12, left: 12 }} onClick={() => setOpen(true)}>Replay installation preview</button>)}</>;
}
const root = createRoot(document.getElementById('root'));
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
