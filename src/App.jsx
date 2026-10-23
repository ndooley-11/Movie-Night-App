import { useState, useEffect, useRef, useCallback } from "react";
import { Clapperboard, Plus, Flame, Shuffle, Eye, Award, Settings as SettingsIcon, Users, User } from "lucide-react";
import { useRoom, usePersonal } from "./hooks.js";
import { fetchGenreMap, fetchProviders, fetchDetails, normalizeResult } from "./lib/api.js";
import { normalizeRoomCode } from "./lib/room.js";
import { seenByOf } from "./lib/seen.js";
import RoomGate from "./components/RoomGate.jsx";
import { TabBtn, Stars, Toast } from "./components/shared.jsx";
import { DetailsSheet } from "./components/MediaDetails.jsx";
import SuggestTab from "./components/tabs/SuggestTab.jsx";
import DiscoverTab from "./components/tabs/DiscoverTab.jsx";
import PickTab from "./components/tabs/PickTab.jsx";
import WatchedTab from "./components/tabs/WatchedTab.jsx";
import StatsTab from "./components/tabs/StatsTab.jsx";
import SettingsTab from "./components/tabs/SettingsTab.jsx";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export default function App() {
  const [roomCode, setRoomCode] = usePersonal("mn-room", null);
  const normalizedRoom = roomCode ? normalizeRoomCode(roomCode) : null;
  const [meIdx, saveMeIdx] = usePersonal(normalizedRoom ? `mn-me:${normalizedRoom}` : "mn-me:none", null);
  const [pendingNames, setPendingNames] = useState(null);

  const { settings, movies, swipes, saveSettings, saveMovies, setSwipe, ready, error } = useRoom(normalizedRoom);
  const [showPassed, setShowPassed] = usePersonal("mn-show-passed", false);
  const [language, setLanguage] = usePersonal("mn-language", "any");
  const [tab, setTab] = useState("discover");
  const [genreMap, setGenreMap] = useState({ movie: {}, tv: {} });
  const [toast, setToast] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const [seenPrompt, setSeenPrompt] = useState(null);
  const [detailsItem, setDetailsItem] = useState(null);
  const addingRef = useRef(new Set());
  const toastTimer = useRef(null);
  const moviesRef = useRef(movies);
  moviesRef.current = movies;

  const showToast = useCallback((message, action) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);

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
    await saveMovies([movie, ...movies]);
  }

  async function removeMovie(id) {
    const index = movies.findIndex((m) => m.id === id);
    const removed = movies[index];
    if (!removed) return;
    await saveMovies(movies.filter((m) => m.id !== id));
    showToast(`Removed "${removed.title}"`, {
      label: "Undo",
      onClick: () => {
        const latest = moviesRef.current.filter((m) => m.id !== id);
        saveMovies([...latest.slice(0, index), removed, ...latest.slice(index)]);
        setToast(null);
      },
    });
  }

  async function toggleHype(id) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, hype: { ...m.hype, [me]: !m.hype?.[me] } } : m));
  }

  // who: "both" | "me"
  async function markSeen(id, who) {
    const now = Date.now();
    await saveMovies(movies.map((m) => {
      if (m.id !== id) return m;
      const seenBy = { ...seenByOf(m, names) };
      (who === "both" ? names : [me]).forEach((n) => { if (!seenBy[n]) seenBy[n] = now; });
      return { ...m, seenBy, watched: true, watchedAt: m.watchedAt || now };
    }));
    setSeenPrompt(null);
    setRateModal(id);
  }

  async function markUnseen(id) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, seenBy: {}, watched: false, watchedAt: null } : m));
    showToast("Moved back to your list");
  }

  async function setRating(id, val) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, ratings: { ...m.ratings, [me]: val } } : m));
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
            id: uid(), tmdbId: normalized.tmdbId, mediaType, title: normalized.title, year: normalized.year,
            poster: normalized.poster, genreNames: normalized.genreNames, originalLanguage: normalized.originalLanguage,
            overview: normalized.overview,
            addedBy: `${names[0]} + ${names[1]}`, addedAt: Date.now(),
            watched: false, watchedAt: null, seenBy: {}, ratings: {}, hype: {}, providers,
          };
          if (!movies.some((m) => (m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(tmdbId))) {
            await saveMovies([movie, ...movies]);
            showToast(`It's a match! "${normalized.title}" is on your list`);
          }
        } catch (e) { /* if TMDB hiccups we'll just retry on the next swipe update */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, movies, me, partner, settings.apiKey, ready]);

  const allGenres = Array.from(new Set(movies.flatMap((m) => m.genreNames || []))).sort();
  const householdServices = Array.from(new Set([...(settings.services[me] || []), ...(settings.services[partner] || [])]));

  function haveIt(m) {
    return (m.providers?.flatrate || []).some((s) => householdServices.includes(s)) ||
      (m.providers?.free || []).some((s) => householdServices.includes(s));
  }

  function copyRoomCode() {
    navigator.clipboard?.writeText(normalizedRoom).then(() => showToast("Room code copied")).catch(() => {});
  }

  if (!normalizedRoom) {
    return <RoomGate onJoin={handleJoin} onCreate={handleCreate} />;
  }

  if (error) {
    return <div className="app boot"><Clapperboard size={28} /><p>Couldn't connect: {error}</p><p className="hint">Check your Firebase config and Firestore rules.</p></div>;
  }
  if (!ready) {
    return <div className="app boot"><Clapperboard size={28} /><p>Setting the scene…</p></div>;
  }

  if (meIdx === null || meIdx === undefined) {
    return (
      <div className="app boot">
        <Clapperboard size={28} />
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
        <h1 className="brand"><Clapperboard size={20} aria-hidden="true" /> Movie Night</h1>
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

      <main className={"content" + (tab === "discover" ? " content-fill" : "")}>
        {tab === "suggest" && (
          <SuggestTab settings={settings} genreMap={genreMap} movies={movies} me={me} haveIt={haveIt} toggleHype={toggleHype} onMarkSeen={setSeenPrompt} removeMovie={removeMovie} addItem={addItem} showToast={showToast} openDetails={setDetailsItem} />
        )}
        {tab === "discover" && (
          <DiscoverTab settings={settings} saveSettings={saveSettings} genreMap={genreMap} movies={movies} me={me} partner={partner} swipes={swipes} setSwipe={setSwipe} showPassed={showPassed} setShowPassed={setShowPassed} language={language} setLanguage={setLanguage} householdServices={householdServices} />
        )}
        {tab === "pick" && (
          <PickTab movies={movies} me={me} partner={partner} allGenres={allGenres} contentType={settings.contentType} onWatchNow={(id) => markSeen(id, "both")} openDetails={setDetailsItem} />
        )}
        {tab === "watched" && (
          <WatchedTab movies={movies} me={me} partner={partner} names={names} setRating={setRating} markSeen={markSeen} markUnseen={markUnseen} openDetails={setDetailsItem} />
        )}
        {tab === "stats" && <StatsTab movies={movies} names={names} me={me} partner={partner} />}
        {tab === "settings" && (
          <SettingsTab settings={settings} saveSettings={saveSettings} me={me} showToast={showToast} roomCode={normalizedRoom} onLeaveRoom={handleLeaveRoom} meIdx={meIdx} saveMeIdx={saveMeIdx} />
        )}
      </main>

      {detailsItem && (
        <DetailsSheet item={detailsItem} settings={settings} householdServices={householdServices} onClose={() => setDetailsItem(null)} />
      )}

      {seenPromptMovie && (
        <div className="sheet-overlay" onClick={() => setSeenPrompt(null)}>
          <div className="sheet sheet-compact" role="dialog" aria-modal="true" aria-label="Who watched it?" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" aria-hidden="true" />
            <h2 className="sheet-title">Who watched “{seenPromptMovie.title}”?</h2>
            <div className="choice-list">
              <button className="choice" onClick={() => markSeen(seenPromptMovie.id, "both")} autoFocus>
                <Users size={18} aria-hidden="true" /><span><b>We watched it together</b><span className="muted">Moves it to Watched for both of you</span></span>
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

      <nav className="tabbar" aria-label="Main">
        <TabBtn icon={<Plus size={19} aria-hidden="true" />} label="Suggest" active={tab === "suggest"} onClick={() => setTab("suggest")} />
        <TabBtn icon={<Shuffle size={19} aria-hidden="true" />} label="Pick" active={tab === "pick"} onClick={() => setTab("pick")} />
        <div className="tabbar-spacer" />
        <TabBtn icon={<Eye size={19} aria-hidden="true" />} label="Watched" active={tab === "watched"} onClick={() => setTab("watched")} />
        <TabBtn icon={<Award size={19} aria-hidden="true" />} label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
        <button className={"fab-discover" + (tab === "discover" ? " active" : "")} onClick={() => setTab("discover")} aria-label="Discover" aria-current={tab === "discover" ? "page" : undefined}>
          <Flame size={24} aria-hidden="true" />
        </button>
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
