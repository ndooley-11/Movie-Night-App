import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { Popcorn, BatteryFull, ChevronLeft, ChevronRight, RotateCw, PanelsTopLeft, ListFilter, Sparkles, Languages, Share, Bookmark, BookOpen, Search, ZoomIn, Radio, Image, Send, MessageCircle, Copy, Glasses, ChevronDown, ChevronUp, Star, StickyNote, PlusSquare, X, Camera, CalendarDays, CloudSun, Settings, Music, Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { INSTALL_SCENES, INSTALL_SCENE_MS } from '../lib/installGuide.js';
import './install-guide.css';

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const AppIcon = () => <span className="ri-app-icon"><Popcorn /></span>;
const homeIcons = [Camera, CalendarDays, CloudSun, Settings, Image, Music, Clock, MessageCircle];

function IPhoneRecording({ scene, playing, slotRef }) {
  const [scale, setScale] = useState(.5);
  useEffect(() => {
    const slot = slotRef.current;
    function fit() {
      const r = slot.getBoundingClientRect();
      const next = Math.min(r.width / 393, r.height / 852, .65);
      if (next > 0) setScale(next);
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slotRef]);
  return <div className="ri-demo-window" style={{ width: 393 * scale, height: 852 * scale }} aria-hidden="true">
    <div className={'ri-demo-screen' + (playing ? ' ri-playing' : '') + (scene >= 2 ? ' ri-system-open' : '')} style={{ transform: `scale(${scale})` }}>
      <div className="ri-island" /><div className="ri-status"><span>9:41</span><BatteryFull /></div>
      <div className="ri-gate"><div className="ri-brand"><Popcorn />Movie Night</div><p>A shared watchlist for two.<br />Pick a room to get started.</p><div className="ri-gate-tabs"><span>Join a room</span><span>Start a room</span></div><div className="ri-field">Room code</div><div className="ri-input">e.g. movie-night</div><span className="ri-join">Join room<ChevronRight /></span></div>
      <div className="ri-toolbar"><span className="ri-nav-pair"><ChevronLeft /><ChevronRight /></span><div className="ri-address"><span className={'ri-target' + (scene === 0 ? ' ri-highlight' : '')}><ListFilter /></span><span>ndooley-11.github.io</span><RotateCw /></div><PanelsTopLeft /></div>
      <div className="ri-menu" hidden={scene !== 1}>
        {[[Sparkles, 'Ask Siri'], [Languages, 'Translate Website…'], [Share, 'Share'], [Bookmark, 'Add to Favorites'], [BookOpen, 'Add Bookmark to…'], [Search, 'Find on Page'], [ZoomIn, 'Page Zoom']].map(([Icon, label]) => <div key={label} className={'ri-menu-row' + (label === 'Share' ? ' ri-highlight' : '')}><Icon />{label}</div>)}
      </div>
      <div className={'ri-share' + (scene === 3 ? ' ri-expanded' : '')} hidden={scene !== 2 && scene !== 3}>
        <div className="ri-share-title"><AppIcon /><span>Movie Night<small>ndooley-11.github.io</small></span></div>
        <div className="ri-recipients">{['AJ', 'JM', 'SK', 'RL'].map(name => <span key={name}>{name}</span>)}</div>
        <div className="ri-services">{[Radio, Image, Send, MessageCircle].map((Icon, i) => <span key={i}><Icon /></span>)}</div>
        <div className="ri-shortcuts">
          <div className="ri-shortcut"><span><Copy /></span>Copy</div><div className="ri-shortcut"><span><Bookmark /></span>Add to<br />Favorites</div><div className="ri-shortcut"><span><Glasses /></span>Reading<br />List</div>
          <div className={'ri-shortcut ri-view-more' + (scene === 2 ? ' ri-highlight' : '')}><span>{scene === 3 ? <ChevronUp /> : <ChevronDown />}</span>{scene === 3 ? 'View Less' : 'View More'}</div>
        </div>
        <div className="ri-action-list" hidden={scene !== 3}>{[[BookOpen, 'Add Bookmark to…'], [Star, 'Add to Favorites'], [StickyNote, 'Add to Quick Note'], [Search, 'Find on Page'], [PlusSquare, 'Add to Home Screen']].map(([Icon, label]) => <div key={label} className={'ri-action-row' + (label === 'Add to Home Screen' ? ' ri-highlight' : '')}><Icon />{label}</div>)}</div>
      </div>
      <div className="ri-add" hidden={scene !== 4}><div className="ri-add-header"><span className="ri-x"><X /></span><span>Add to Home Screen</span><span className="ri-add-confirm ri-highlight">Add</span></div><div className="ri-name"><AppIcon /><span>Movie Night<small>ndooley-11.github.io</small></span></div><div className="ri-webapp"><span>Open as Web App</span><span className="ri-switch" /></div><p className="ri-add-note">An icon will be added to your Home Screen.</p>
        <div className="ri-keyboard">{['QWERTYUIOP', 'ASDFGHJKL', '⇧ZXCVBNM⌫'].map(letters => <div className="ri-key-row" key={letters}>{[...letters].map(letter => <div key={letter} className={'ri-key' + ('⇧⌫'.includes(letter) ? ' ri-key-wide' : '')}>{letter}</div>)}</div>)}<div className="ri-key-row"><div className="ri-key ri-key-wide">123</div><div className="ri-key ri-space">space</div><div className="ri-key ri-done">✓</div></div></div>
      </div>
      <div className="ri-home" hidden={scene !== 5}><div className="ri-home-grid">{homeIcons.map((Icon, i) => <span key={i}><Icon /></span>)}<div className="ri-home-app"><AppIcon /><span>Movie Night</span></div></div></div>
      <div className="ri-home-indicator" />
    </div>
  </div>;
}

export default function InstallGuide({ onClose }) {
  const [scene, setScene] = useState(0), [reduced, setReduced] = useState(reduceMotion);
  const [playing, setPlaying] = useState(() => !reduceMotion());
  const ref = useRef(null), slotRef = useRef(null), titleId = useId();
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    function change() { setReduced(media.matches); if (media.matches) setPlaying(false); }
    function visibility() { if (document.hidden) setPlaying(false); }
    media.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!playing || reduced || scene === INSTALL_SCENES.length - 1) return;
    const timer = setTimeout(() => { setScene(scene + 1); if (scene === INSTALL_SCENES.length - 2) setPlaying(false); }, INSTALL_SCENE_MS);
    return () => clearTimeout(timer);
  }, [scene, playing, reduced]);
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    const buttons = () => [...dialog.querySelectorAll('button')];
    buttons().at(-1)?.focus();
    function keydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = buttons(), first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    dialog.addEventListener('keydown', keydown);
    return () => {
      dialog.removeEventListener('keydown', keydown);
      const target = previous?.isConnected && previous !== document.body ? previous : document.getElementById('room-code');
      target?.focus({ preventScroll: true });
    };
  }, [onClose]);
  function toggle() {
    if (reduced) { setScene((scene + 1) % INSTALL_SCENES.length); return; }
    if (scene === INSTALL_SCENES.length - 1) { setScene(0); setPlaying(true); }
    else setPlaying(v => !v);
  }
  const label = reduced ? (scene === 5 ? 'Replay steps' : 'Next frame') : playing ? 'Pause animation' : scene === 5 ? 'Replay animation' : 'Play animation';
  const Icon = playing ? Pause : scene === 5 ? RotateCcw : Play;
  return createPortal(<div className="install-guide-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="install-guide" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>Movie Night.<br />On your Home Screen.</h2>
      <div className="install-demo-slot" ref={slotRef}><IPhoneRecording scene={scene} playing={playing && !reduced} slotRef={slotRef} /></div>
      <p className="visually-hidden" role="status">{INSTALL_SCENES[scene]}</p>
      <button className="install-playback" onClick={toggle}><Icon size={14} aria-hidden="true" />{label}</button>
      <button className="install-continue" onClick={onClose}>Continue</button>
    </section>
  </div>, document.body);
}
