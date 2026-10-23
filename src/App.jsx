import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Flame, Shuffle, Eye, Award, Settings as SettingsIcon, Users, User } from "lucide-react";
import { useRoom, usePersonal, swipeKey } from "./hooks.js";
import { fetchGenreMap, fetchProviders, fetchDetails, normalizeResult } from "./lib/api.js";
import { normalizeRoomCode } from "./lib/room.js";
import { seenByOf } from "./lib/seen.js";
import { withReview, withProgress, allFinishedTogether } from './lib/personalMedia.js';
import { withSeenIt } from './lib/seenIt.js';
import { samePosition } from './lib/players.js';
import RoomGate from "./components/RoomGate.jsx";
import { TabBtn, Stars, Toast, BrandMark } from "./components/shared.jsx";
import { DetailsSheet } from "./components/MediaDetails.jsx";
import MatchCelebration from "./components/MatchCelebration.jsx";
import SuggestTab from "./components/tabs/SuggestTab.jsx";
import DiscoverTab from "./components/tabs/DiscoverTab.jsx";
import PickTab from "./components/tabs/PickTab.jsx";
import WatchedTab from "./components/tabs/WatchedTab.jsx";
import StatsTab from "./components/tabs/StatsTab.jsx";
import SettingsTab from "./components/tabs/SettingsTab.jsx";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// A match added by the partner's phone is celebrated here only if it is fresh;
// opening the app later shouldn't replay old matches.
const CELEBRATE_WINDOW_MS = 2 * 60 * 1000;

function loadCelebrated(room) {
  try { return new Set(JSON.parse(localStorage.getItem(`mn-celebrated:${room}`) || "[]")); } catch (e) { return new Set(); }
}
function saveCelebrated(room, set) {
  try { localStorage.setItem(`mn-celebrated:${room}`, JSON.stringify([...set].slice(-200))); } catch (e) { /* in-memory is fine */ }
}

export default function App() {
  const [roomCode, setRoomCode] = usePersonal("mn-room", null);
  const normalizedRoom = roomCode ? normalizeRoomCode(roomCode) : null;
  const [meIdx, saveMeIdx] = usePersonal(normalizedRoom ? `mn-me:${normalizedRoom}` : "mn-me:none", null);
  const [pendingNames, setPendingNames] = useState(null);

  const { settings, movies, swipes, tonight, saveSettings, saveMovies, setSwipe, chooseTonight, clearTonight, ready, error } = useRoom(normalizedRoom);
  const [showPassed, setShowPassed] = usePersonal("mn-show-passed", false);
  const [language, setLanguage] = usePersonal("mn-language", "any");
  const [tab, setTab] = useState("discover");
  const [genreMap, setGenreMap] = useState({ movie: {}, tv: {} });
  const [toast, setToast] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const [seenPrompt, setSeenPrompt] = useState(null);
  const [detailsItem, setDetailsItem] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const addingRef = useRef(new Set());
  const toastTimer = useRef(null);
  const moviesRef = useRef(movies);
  moviesRef.current = movies;
  const celebratedRef = useRef({ room: null, keys: new Set() });

  // Shows "You both picked this" at most once per match on this device, even
  // across refreshes and reconnects. From Discover it also gets the card's
  // position and face, plus the save of the like that completed the match.
  const celebrate = useCallback((key, item, { origin = null, saved = null } = {}) => {
    if (!normalizedRoom) return;
    if (celebratedRef.current.room !== normalizedRoom) {
      celebratedRef.current = { room: normalizedRoom, keys: loadCelebrated(normalizedRoom) };
    }
    const { keys } = celebratedRef.current;
    if (keys.has(key)) return;
    keys.add(key);
    saveCelebrated(normalizedRoom, keys);
    setCelebration({ key, title: item.title, poster: item.poster || null, origin, saved });
  }, [normalizedRoom]);

  const showToast = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);

  // The like didn't save (or never confirmed): forget we celebrated, so the
  // match can still be celebrated once it really lands in the shared list.
  const uncelebrate = useCallback((key, failed) => {
    celebratedRef.current.keys.delete(key);
    if (normalizedRoom) saveCelebrated(normalizedRoom, celebratedRef.current.keys);
    if (failed) showToast("Couldn't save that like. Check your connection and try again.");
  }, [normalizedRoom, showToast]);

  useEffect(() => {
    if (!pendingNames || !normalizedRoom) return;
    saveSettings({
      ...settings,
      names: pendingNames,
      services: { [pendingNames[0]]: [], [pendingNames[1]]: [] },
    });
    saveMeIdx(0); // the creator is always names[0]; bound to this render's room key
    setPendingNames(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNames, normalizedRoom]);

  useEffect(() => {
    if (!settings.apiKey) return;
    fetchGenreMap(settings.apiKey).then(setGenreMap).catch(() => {});
  }, [settings.apiKey]);

  function handleJoin(code) { setRoomCode(code); }
  function handleCreate(code, names) {
    setRoomCode(code);
    setPendingNames(names);
  }
  function handleLeaveRoom() { setRoomCode(null); setTab("discover"); }

  const names = settings.names;
  const me = names[meIdx] || names[0];
  const partner = names[1 - meIdx] || names[1];

  async function addItem(item) {
    const providers = item.tmdbId ? await fetchProviders(item.mediaType, item.tmdbId, settings.apiKey, settings.region) : { flatrate: [], rent: [], buy: [], free: [] };
    const movie = {
      id: uid(), tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title, year: item.year,
      poster: item.poster, genreNames: item.genreNames || [], originalLanguage: item.originalLanguage || "",
      overview: item.overview || "",
      addedBy: me, addedAt: Date.now(), watched: false, watchedAt: null, seenBy: {}, ratings: {}, hype: {}, providers,
    };
    await saveMovies(current => [movie, ...current]);
  }

  async function removeMovie(id) {
    const index = movies.findIndex((m) => m.id === id);
    const removed = movies[index];
    if (!removed) return;
    await saveMovies(current => current.filter((m) => m.id !== id));
    showToast(`Removed "${removed.title}"`, {
      label: "Undo",
      onClick: () => {
        saveMovies(current => {
          const latest = current.filter(m => m.id !== id);
          return [...latest.slice(0, index), removed, ...latest.slice(index)];
        }).catch(() => showToast('Could not undo. Please try again.'));
        setToast(null);
      },
    });
  }

  // "Seen it" from Discover: on to Watched as seen by this person only.
  async function saveSeenIt(item, { rating, text, spoiler }) {
    let providers;
    try { providers = await fetchProviders(item.mediaType, item.tmdbId, settings.apiKey, settings.region); }
    catch { /* availability is a nice-to-have; don't block saving */ }
    await saveMovies(current => withSeenIt(current, item, { me, meIdx, rating, text, spoiler, providers, id: uid() }));
    // No "View" button here: the toast sits over the swipe buttons, and a quick
    // "Want it" on the next card would land on it instead.
    showToast(`Saved "${item.title}" to Watched`);
  }

  async function toggleHype(id) {
    await saveMovies(current => current.map((m) => m.id === id ? { ...m, hype: { ...m.hype, [me]: !m.hype?.[me] } } : m));
  }

  // who: "both" | "me"
  async function markSeen(id, who) {
    const now = Date.now();
    await saveMovies(current => current.map((m) => {
      if (m.id !== id) return m;
      const seenBy = { ...seenByOf(m, names) };
      (who === "both" ? names : [me]).forEach((n) => { if (!seenBy[n]) seenBy[n] = now; });
      return { ...m, seenBy, watched: true, watchedAt: m.watchedAt || now };
    }));
    setSeenPrompt(null);
    setRateModal(id);
  }

  async function markUnseen(id) {
    await saveMovies(current => current.map((m) => m.id === id ? { ...m, seenBy: {}, watched: false, watchedAt: null, watchingTogether: false } : m));
    showToast("Moved back to your list");
  }

  async function setRating(id, val) {
    await saveMovies(current => current.map((m) => m.id === id ? { ...m, ratings: { ...m.ratings, [me]: val } } : m));
  }

  async function updatePersonalMovie(id, update) {
    await saveMovies(current => {
      if (!current.some(m => m.id === id)) throw new Error('This title was removed from the room.');
      return current.map(m => m.id === id ? update(m) : m);
    });
  }

  async function saveReview(id, review, options = {}) {
    await updatePersonalMovie(id, m => {
      if (options.onlyIfAbsent && m.reviews?.[`p${meIdx}`]) throw new Error('A newer review exists. Open it to make changes.');
      if (review && !seenByOf(m, names)[me]) throw new Error('Mark this title seen before writing a review.');
      return withReview(m, meIdx, review);
    });
  }

  async function startShow(id) {
    await updatePersonalMovie(id, m => {
      if (m.mediaType !== 'tv') throw new Error('Choose a show to track.');
      const own = m.showProgress?.[`p${meIdx}`];
      return { ...m, watchingTogether: true, watched: false, watchedAt: null,
        ...(own?.completed ? { showProgress: { ...m.showProgress, [`p${meIdx}`]: { ...own, completed: false } } } : {}) };
    });
    showToast('Show added to Watching together');
  }

  async function saveProgress(id, position, options = {}) {
    await updatePersonalMovie(id, m => {
      if ('expectedPosition' in options && !samePosition(m.showProgress?.[`p${meIdx}`], options.expectedPosition)) throw new Error('Your progress changed elsewhere. Refresh your position before undoing.');
      const next = withProgress(m, meIdx, position);
      const finished = allFinishedTogether(next, names.length);
      return { ...next, watchingTogether: true, watched: finished, watchedAt: finished ? m.watchedAt || Date.now() : null,
        ...(finished ? { seenBy: Object.fromEntries(names.map(n => [n, seenByOf(m, names)[n] || Date.now()])) } : {}) };
    });
  }

  // Watch for mutual likes across both players' swipe history and promote them
  // straight onto the shared list: the "it's a match" moment.
  useEffect(() => {
    if (!settings.apiKey || !ready || !me || !partner) return;
    const mySwipes = swipes[me] || {};
    const partnerSwipes = swipes[partner] || {};
    const pending = Object.entries(mySwipes).filter(([key, val]) => {
      if (val !== "like" || partnerSwipes[key] !== "like" || addingRef.current.has(key)) return false;
      const mediaType = key.startsWith("tv:") ? "tv" : "movie";
      const tmdbId = key.startsWith("tv:") ? key.slice(3) : key;
      return !movies.some((m) => (m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(tmdbId));
    });
    if (pending.length === 0) return;
    (async () => {
      for (const [key] of pending) {
        addingRef.current.add(key);
        const mediaType = key.startsWith("tv:") ? "tv" : "movie";
        const tmdbId = key.startsWith("tv:") ? key.slice(3) : key;
        try {
          const d = await fetchDetails(mediaType, tmdbId, settings.apiKey);
          const normalized = normalizeResult(mediaType, d, genreMap);
          const providers = await fetchProviders(mediaType, tmdbId, settings.apiKey, settings.region);
          const movie = {
            // Fixed id per title, so both phones writing the same match collapse to one entry
            id: `match-${key.replace(":", "-")}`,
            tmdbId: normalized.tmdbId, mediaType, title: normalized.title, year: normalized.year,
            poster: normalized.poster, genreNames: normalized.genreNames, originalLanguage: normalized.originalLanguage,
            overview: normalized.overview,
            addedBy: `${names[0]} + ${names[1]}`, addedAt: Date.now(),
            watched: false, watchedAt: null, seenBy: {}, ratings: {}, hype: {}, providers,
          };
          // Check the latest list, not the snapshot from before the network calls above.
          const latest = moviesRef.current;
          const already = latest.some((m) => m.id === movie.id || ((m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(tmdbId)));
          if (!already) await saveMovies(current => current.some(m => m.id === movie.id || ((m.mediaType || 'movie') === mediaType && String(m.tmdbId) === String(tmdbId))) ? current : [movie, ...current]);
        } catch (e) {
          addingRef.current.delete(key); // let the next swipe update retry it
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, movies, me, partner, settings.apiKey, ready]);

  // Your partner's phone (or this one) added a fresh match: celebrate it here too.
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    movies.forEach((m) => {
      if (!(m.addedBy || "").includes(" + ") || !m.addedAt || now - m.addedAt > CELEBRATE_WINDOW_MS) return;
      celebrate(swipeKey(m.mediaType || "movie", m.tmdbId), m);
    });
  }, [movies, ready, celebrate]);

  const allGenres = Array.from(new Set(movies.flatMap((m) => m.genreNames || []))).sort();
  const people = { me, partner, myServices: settings.services[me] || [], partnerServices: settings.services[partner] || [] };

  function copyRoomCode() {
    navigator.clipboard?.writeText(normalizedRoom).then(() => showToast("Room code copied")).catch(() => {});
  }

  if (!normalizedRoom) {
    return <RoomGate onJoin={handleJoin} onCreate={handleCreate} />;
  }

  if (error) {
    return <div className="app boot"><BrandMark size={32} /><p>Couldn't connect: {error}</p><p className="hint">Check your Firebase config and Firestore rules.</p></div>;
  }
  if (!ready) {
    return <div className="app boot"><BrandMark size={32} /><p>Setting the scene…</p></div>;
  }

  if (meIdx === null || meIdx === undefined) {
    return (
      <div className="app boot">
        <BrandMark size={32} />
        <p>Which one of you is this?</p>
        <div className="identity-choices">
          {names.map((name, i) => (
            <button key={name + i} className="btn btn-primary" onClick={() => saveMeIdx(i)}>{name}</button>
          ))}
        </div>
      </div>
    );
  }

  const seenPromptMovie = seenPrompt && movies.find((m) => m.id === seenPrompt);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand"><BrandMark size={24} /> Movie Night</h1>
        <div className="topbar-right">
          <button className="room-pill" onClick={copyRoomCode} aria-label={`Room code ${normalizedRoom}, tap to copy`}>{normalizedRoom}</button>
          <button className={"header-icon-btn" + (tab === "settings" ? " active" : "")} onClick={() => setTab("settings")} aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined}>
            <SettingsIcon size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!settings.apiKey && tab !== "settings" && (
        <button className="banner" onClick={() => setTab("settings")}>
          Add a free TMDB API key in Settings to search, discover, and see where to stream.
        </button>
      )}

      <main className={"content" + (tab === "discover" ? " content-fill" : tab === 'pick' ? ' content-pick' : "")}>
        {tab === "suggest" && (
          <SuggestTab settings={settings} genreMap={genreMap} movies={movies} me={me} people={people} toggleHype={toggleHype} onMarkSeen={setSeenPrompt} removeMovie={removeMovie} addItem={addItem} showToast={showToast} openDetails={setDetailsItem} />
        )}
        {tab === "discover" && (
          <DiscoverTab settings={settings} saveSettings={saveSettings} genreMap={genreMap} movies={movies} me={me} partner={partner} swipes={swipes} setSwipe={setSwipe} showPassed={showPassed} setShowPassed={setShowPassed} language={language} setLanguage={setLanguage} people={people} onMatch={(item, extra) => celebrate(swipeKey(item.mediaType, item.tmdbId), item, extra)} onSeenIt={saveSeenIt} />
        )}
        {tab === "pick" && (
          <PickTab movies={movies} me={me} partner={partner} allGenres={allGenres} contentType={settings.contentType} tonight={tonight} onChooseTonight={id => chooseTonight(id, meIdx)} onClearTonight={clearTonight} onFinishTonight={async id => { if (movies.find(m => m.id === id)?.mediaType === 'tv') await startShow(id); else await markSeen(id, 'both'); await clearTonight(id); }} openDetails={setDetailsItem} />
        )}
        {tab === "watched" && (
          <WatchedTab movies={movies} me={me} partner={partner} names={names} meIdx={meIdx} settings={settings} roomCode={normalizedRoom} saveReview={saveReview} saveProgress={saveProgress} startShow={startShow} setRating={setRating} markSeen={markSeen} markUnseen={markUnseen} openDetails={setDetailsItem} />
        )}
        {tab === "stats" && <StatsTab movies={movies} names={names} me={me} partner={partner} />}
        {tab === "settings" && (
          <SettingsTab settings={settings} saveSettings={saveSettings} me={me} showToast={showToast} roomCode={normalizedRoom} onLeaveRoom={handleLeaveRoom} meIdx={meIdx} saveMeIdx={saveMeIdx} />
        )}
      </main>

      {detailsItem && (
        <DetailsSheet item={detailsItem} settings={settings} people={people} onClose={() => setDetailsItem(null)} />
      )}

      {seenPromptMovie && (
        <div className="sheet-overlay" onClick={() => setSeenPrompt(null)}>
          <div className="sheet sheet-compact" role="dialog" aria-modal="true" aria-label="Who watched it?" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" aria-hidden="true" />
            <h2 className="sheet-title">Who watched “{seenPromptMovie.title}”?</h2>
            <div className="choice-list">
              <button className="choice" onClick={() => markSeen(seenPromptMovie.id, "both")} autoFocus>
                <Users size={18} aria-hidden="true" /><span><b>We've both seen it</b><span className="muted">Together or separately. Moves it to Watched for both of you</span></span>
              </button>
              <button className="choice" onClick={() => markSeen(seenPromptMovie.id, "me")}>
                <User size={18} aria-hidden="true" /><span><b>Just me</b><span className="muted">{partner} still hasn't seen it</span></span>
              </button>
            </div>
            <button className="btn btn-outline" onClick={() => setSeenPrompt(null)}>Cancel</button>
          </div>
        </div>
      )}

      {rateModal && (
        <RateModal
          movie={movies.find((m) => m.id === rateModal)}
          me={me}
          onRate={(v) => setRating(rateModal, v)}
          onClose={() => setRateModal(null)}
        />
      )}

      <Toast toast={toast} />

      {celebration && (
        <MatchCelebration key={celebration.key} match={celebration} names={names}
          onClose={() => setCelebration(c => (c?.key === celebration.key ? null : c))}
          onFailed={failed => uncelebrate(celebration.key, failed)} />
      )}

      <nav className="tabbar" aria-label="Main">
        <TabBtn icon={<Plus size={19} aria-hidden="true" />} label="Suggest" active={tab === "suggest"} onClick={() => setTab("suggest")} />
        <TabBtn icon={<Shuffle size={19} aria-hidden="true" />} label="Pick" active={tab === "pick"} onClick={() => setTab("pick")} />
        <button className={"tab tab-discover" + (tab === "discover" ? " active" : "")} onClick={() => setTab("discover")} aria-current={tab === "discover" ? "page" : undefined}>
          <span className="fab-circle"><Flame size={24} aria-hidden="true" /></span>
          <span>Discover</span>
        </button>
        <TabBtn icon={<Eye size={19} aria-hidden="true" />} label="Watched" active={tab === "watched"} onClick={() => setTab("watched")} />
        <TabBtn icon={<Award size={19} aria-hidden="true" />} label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
      </nav>
    </div>
  );
}

function RateModal({ movie, me, onRate, onClose }) {
  const [val, setVal] = useState(movie?.ratings?.[me] || 0);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!movie) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Rate ${movie.title}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{movie.title}</h2>
        <p className="hint" style={{ textAlign: "center" }}>How was it, {me}?</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <Stars value={val} onChange={(v) => { setVal(v); onRate(v); }} size={28} label="Your rating" />
        </div>
        <button className="btn btn-primary" onClick={onClose}>{val ? "Done" : "Skip for now"}</button>
      </div>
    </div>
  );
}
