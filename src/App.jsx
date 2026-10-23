import { useState, useEffect, useRef, useCallback } from "react";
import { Clapperboard, Plus, Flame, Shuffle, Eye, Award, Settings as SettingsIcon } from "lucide-react";
import { useRoom, usePersonal } from "./hooks.js";
import { fetchGenreMap, fetchProviders, fetchDetails, normalizeResult, mediaTypesForFilter } from "./lib/api.js";
import { normalizeRoomCode } from "./lib/room.js";
import RoomGate from "./components/RoomGate.jsx";
import { TabBtn, Stars, Toast } from "./components/shared.jsx";
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
  const [tab, setTab] = useState("suggest");
  const [genreMap, setGenreMap] = useState({ movie: {}, tv: {} });
  const [toast, setToast] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const addingRef = useRef(new Set());

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    if (!pendingNames || !normalizedRoom) return;
    saveSettings({
      ...settings,
      names: pendingNames,
      services: { [pendingNames[0]]: [], [pendingNames[1]]: [] },
    });
    saveMeIdx(0); // the creator is always names[0] — bound to this render's room key, unlike the stale closure in handleCreate
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
  function handleLeaveRoom() { setRoomCode(null); }

  const me = settings.names[meIdx] || settings.names[0];
  const partner = settings.names[1 - meIdx] || settings.names[1];

  async function addItem(item) {
    const providers = item.tmdbId ? await fetchProviders(item.mediaType, item.tmdbId, settings.apiKey, settings.region) : { flatrate: [], rent: [], buy: [], free: [] };
    const movie = {
      id: uid(), tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title, year: item.year,
      poster: item.poster, genreNames: item.genreNames || [], originalLanguage: item.originalLanguage || "",
      addedBy: me, addedAt: Date.now(), watched: false, watchedAt: null, ratings: {}, hype: {}, providers,
    };
    await saveMovies([movie, ...movies]);
  }

  async function removeMovie(id) { await saveMovies(movies.filter((m) => m.id !== id)); }

  async function toggleHype(id) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, hype: { ...m.hype, [me]: !m.hype[me] } } : m));
  }

  async function markWatched(id, watched) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, watched, watchedAt: watched ? Date.now() : null } : m));
    if (watched) setRateModal(id);
  }

  async function setRating(id, val) {
    await saveMovies(movies.map((m) => m.id === id ? { ...m, ratings: { ...m.ratings, [me]: val } } : m));
  }

  // Watch for mutual likes across both players' swipe history and promote them
  // straight onto the shared list — the "it's a match" moment.
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
            addedBy: `${settings.names[0]} + ${settings.names[1]}`, addedAt: Date.now(),
            watched: false, watchedAt: null, ratings: {}, hype: {}, providers,
          };
          if (!movies.some((m) => (m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(tmdbId))) {
            await saveMovies([movie, ...movies]);
            showToast(`It's a match! Added "${normalized.title}"`);
          }
        } catch (e) { /* if TMDB hiccups we'll just retry on the next swipe update */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, movies, me, partner, settings.apiKey, ready]);

  const allGenres = Array.from(new Set(movies.flatMap((m) => m.genreNames || []))).sort();
  const myServices = settings.services[me] || [];
  const partnerServices = settings.services[partner] || [];
  const householdServices = Array.from(new Set([...myServices, ...partnerServices]));

  function haveIt(m) {
    return (m.providers?.flatrate || []).some((s) => householdServices.includes(s)) ||
      (m.providers?.free || []).some((s) => householdServices.includes(s));
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
          {settings.names.map((name, i) => (
            <button key={name + i} className="btn btn-primary" onClick={() => saveMeIdx(i)}>{name}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><Clapperboard size={20} /> Movie Night</div>
        <div className="room-pill">{normalizedRoom}</div>
      </header>

      {!settings.apiKey && tab !== "settings" && (
        <div className="banner" onClick={() => setTab("settings")}>
          Add a free TMDB API key in Settings to search titles, discover new ones, and see streaming availability.
        </div>
      )}

      <main className="content">
        {tab === "suggest" && (
          <SuggestTab settings={settings} genreMap={genreMap} movies={movies} me={me} householdServices={householdServices} haveIt={haveIt} toggleHype={toggleHype} markWatched={markWatched} removeMovie={removeMovie} addItem={addItem} showToast={showToast} />
        )}
        {tab === "discover" && (
          <DiscoverTab settings={settings} genreMap={genreMap} movies={movies} me={me} partner={partner} swipes={swipes} setSwipe={setSwipe} showToast={showToast} showPassed={showPassed} setShowPassed={setShowPassed} />
        )}
        {tab === "pick" && (
          <PickTab movies={movies} me={me} partner={partner} allGenres={allGenres} contentType={settings.contentType} markWatched={markWatched} />
        )}
        {tab === "watched" && (
          <WatchedTab movies={movies} me={me} partner={partner} setRating={setRating} markWatched={markWatched} />
        )}
        {tab === "stats" && <StatsTab movies={movies} names={settings.names} />}
        {tab === "settings" && (
          <SettingsTab settings={settings} saveSettings={saveSettings} me={me} showToast={showToast} roomCode={normalizedRoom} onLeaveRoom={handleLeaveRoom} meIdx={meIdx} saveMeIdx={saveMeIdx} />
        )}
      </main>

      {rateModal && (
        <RateModal
          movie={movies.find((m) => m.id === rateModal)}
          me={me}
          onRate={(v) => setRating(rateModal, v)}
          onClose={() => setRateModal(null)}
        />
      )}

      <Toast message={toast} />

      <nav className="tabbar">
        <TabBtn icon={<Plus size={17} />} label="Suggest" active={tab === "suggest"} onClick={() => setTab("suggest")} />
        <TabBtn icon={<Flame size={17} />} label="Discover" active={tab === "discover"} onClick={() => setTab("discover")} />
        <TabBtn icon={<Shuffle size={17} />} label="Pick" active={tab === "pick"} onClick={() => setTab("pick")} />
        <TabBtn icon={<Eye size={17} />} label="Watched" active={tab === "watched"} onClick={() => setTab("watched")} />
        <TabBtn icon={<Award size={17} />} label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
        <TabBtn icon={<SettingsIcon size={17} />} label="Setup" active={tab === "settings"} onClick={() => setTab("settings")} />
      </nav>
    </div>
  );
}

function RateModal({ movie, me, onRate, onClose }) {
  const [val, setVal] = useState(movie?.ratings?.[me] || 0);
  if (!movie) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-row-title" style={{ textAlign: "center" }}>{movie.title}</div>
        <p className="hint" style={{ textAlign: "center" }}>How was it, {me}?</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <Stars value={val} onChange={(v) => { setVal(v); onRate(v); }} size={26} />
        </div>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
