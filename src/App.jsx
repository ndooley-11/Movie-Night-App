import { useState, useEffect, useRef, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, ROOM_ID } from "./firebase.js";
import { Film, Search, Plus, Shuffle, Star, Heart, X, Check, Settings, Trash2, RefreshCw, Ticket, Users, ThumbsDown, Eye, Award, PlayCircle, Flame } from "lucide-react";

const SERVICES = ["Netflix", "Hulu", "Max", "Disney+", "Prime Video", "Apple TV+", "Paramount+", "Peacock"];
const REGIONS = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"]];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const DEFAULT_SETTINGS = { names: ["Player 1", "Player 2"], apiKey: "", region: "US", services: { "Player 1": [], "Player 2": [] } };

const roomRef = doc(db, "movienight", ROOM_ID);

function useRoom() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [movies, setMovies] = useState([]);
  const [swipes, setSwipes] = useState({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      roomRef,
      (snap) => {
        const data = snap.data() || {};
        setSettings(data.settings || DEFAULT_SETTINGS);
        setMovies(data.movies || []);
        setSwipes(data.swipes || {});
        setReady(true);
      },
      (err) => setError(err.message)
    );
    return () => unsub();
  }, []);

  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    await setDoc(roomRef, { settings: next }, { merge: true });
  }, []);

  const saveMovies = useCallback(async (next) => {
    setMovies(next);
    await setDoc(roomRef, { movies: next }, { merge: true });
  }, []);

  const setSwipe = useCallback(async (name, tmdbId, value) => {
    await updateDoc(roomRef, { [`swipes.${name}.${tmdbId}`]: value });
  }, []);

  return { settings, movies, swipes, saveSettings, saveMovies, setSwipe, ready, error };
}

function usePersonal(key, fallback) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  });
  const save = useCallback((next) => {
    setVal(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {}
  }, [key]);
  return [val, save];
}

const posterUrl = (p) => p ? `https://image.tmdb.org/t/p/w342${p}` : null;
const backdropUrl = (p) => p ? `https://image.tmdb.org/t/p/w780${p}` : null;

async function tmdb(path, apiKey) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${apiKey}`);
  if (!res.ok) throw new Error("TMDB request failed (" + res.status + ")");
  return res.json();
}

function Stars({ value, onChange, size = 16 }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className="star-btn" onClick={() => onChange(n === value ? 0 : n)} aria-label={`Rate ${n}`}>
          <Star size={size} fill={value >= n ? "var(--gold)" : "none"} color={value >= n ? "var(--gold)" : "var(--muted-2)"} />
        </button>
      ))}
    </div>
  );
}

function Notches() {
  return (<><span className="notch notch-l" /><span className="notch notch-r" /></>);
}

export default function App() {
  const { settings, movies, swipes, saveSettings, saveMovies, setSwipe, ready, error } = useRoom();
  const [meIdx, saveMeIdx] = usePersonal("mn-me", 0);
  const [tab, setTab] = useState("suggest");
  const [genreMap, setGenreMap] = useState({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ title: "", year: "", genre: "" });
  const [toast, setToast] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const debounceRef = useRef(null);
  const addingRef = useRef(new Set());

  const me = settings.names[meIdx] || "Player 1";
  const partner = settings.names[1 - meIdx] || "Player 2";

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    if (!settings.apiKey) return;
    tmdb("/genre/movie/list", settings.apiKey).then((d) => {
      const m = {};
      (d.genres || []).forEach((g) => { m[g.id] = g.name; });
      setGenreMap(m);
    }).catch(() => {});
  }, [settings.apiKey]);

  useEffect(() => {
    if (!settings.apiKey || query.trim().length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await tmdb(`/search/movie?query=${encodeURIComponent(query)}`, settings.apiKey);
        setResults((d.results || []).slice(0, 6));
      } catch (e) { setResults([]); }
      setSearching(false);
    }, 400);
  }, [query, settings.apiKey]);

  async function fetchProviders(tmdbId) {
    if (!settings.apiKey) return { flatrate: [], rent: [], buy: [], free: [] };
    try {
      const d = await tmdb(`/movie/${tmdbId}/watch/providers`, settings.apiKey);
      const r = (d.results || {})[settings.region] || {};
      return {
        flatrate: (r.flatrate || []).map((p) => p.provider_name),
        rent: (r.rent || []).map((p) => p.provider_name),
        buy: (r.buy || []).map((p) => p.provider_name),
        free: (r.free || r.ads || []).map((p) => p.provider_name),
      };
    } catch (e) { return { flatrate: [], rent: [], buy: [], free: [] }; }
  }

  async function addFromTmdb(r) {
    const providers = await fetchProviders(r.id);
    const genreNames = (r.genre_ids || []).map((id) => genreMap[id]).filter(Boolean);
    const movie = {
      id: uid(), tmdbId: r.id, title: r.title, year: (r.release_date || "").slice(0, 4),
      poster: posterUrl(r.poster_path), genreNames, addedBy: me, addedAt: Date.now(),
      watched: false, watchedAt: null, ratings: {}, hype: {}, providers,
    };
    await saveMovies([movie, ...movies]);
    setQuery(""); setResults([]);
    showToast(`Added "${r.title}"`);
  }

  async function addManual() {
    if (!manual.title.trim()) return;
    const movie = {
      id: uid(), tmdbId: null, title: manual.title.trim(), year: manual.year.trim(),
      poster: null, genreNames: manual.genre ? [manual.genre.trim()] : [], addedBy: me,
      addedAt: Date.now(), watched: false, watchedAt: null, ratings: {}, hype: {},
      providers: { flatrate: [], rent: [], buy: [], free: [] },
    };
    await saveMovies([movie, ...movies]);
    setManual({ title: "", year: "", genre: "" });
    setManualMode(false);
    showToast(`Added "${movie.title}"`);
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

  useEffect(() => {
    if (!settings.apiKey || !ready) return;
    const mySwipes = swipes[me] || {};
    const partnerSwipes = swipes[partner] || {};
    const pending = Object.entries(mySwipes).filter(
      ([id, val]) => val === "like" && partnerSwipes[id] === "like" && !movies.some((m) => String(m.tmdbId) === id) && !addingRef.current.has(id)
    );
    if (pending.length === 0) return;
    (async () => {
      for (const [id] of pending) {
        addingRef.current.add(id);
        try {
          const d = await tmdb(`/movie/${id}`, settings.apiKey);
          const providers = await fetchProviders(id);
          const movie = {
            id: uid(), tmdbId: d.id, title: d.title, year: (d.release_date || "").slice(0, 4),
            poster: posterUrl(d.poster_path), genreNames: (d.genres || []).map((g) => g.name),
            addedBy: `${settings.names[0]} + ${settings.names[1]}`, addedAt: Date.now(),
            watched: false, watchedAt: null, ratings: {}, hype: {}, providers,
          };
          if (!movies.some((m) => String(m.tmdbId) === id)) {
            await saveMovies([movie, ...movies]);
            showToast(`It's a match! Added "${d.title}"`);
          }
        } catch (e) {}
      }
    })();
  }, [swipes, movies, me, partner, settings.apiKey, ready]);

  const allGenres = Array.from(new Set(movies.flatMap((m) => m.genreNames || []))).sort();
  const myServices = settings.services[me] || [];
  const partnerServices = settings.services[partner] || [];
  const householdServices = Array.from(new Set([...myServices, ...partnerServices]));

  function haveIt(m) {
    return (m.providers?.flatrate || []).some((s) => householdServices.includes(s)) ||
      (m.providers?.free || []).some((s) => householdServices.includes(s));
  }

  if (error) {
    return <div className="app boot"><Ticket size={28} /><p>Couldn't connect: {error}</p><p className="hint">Check your Firebase config and Firestore rules.</p><Style /></div>;
  }
  if (!ready) {
    return <div className="app boot"><Ticket size={28} /><p>Setting the scene…</p><Style /></div>;
  }

  return (
    <div className="app">
      <Style />
      <header className="marquee">
        <div className="bulbs">{Array.from({ length: 14 }).map((_, i) => <span key={i} className="bulb" style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
        <h1><Film size={22} /> MOVIE NIGHT</h1>
        <button className="identity" onClick={() => saveMeIdx(1 - meIdx)}>
          <Users size={14} /> You're <b>{me}</b> · tap to switch
        </button>
      </header>

      {!settings.apiKey && tab !== "settings" && (
        <div className="banner" onClick={() => setTab("settings")}>
          Add a free TMDB API key in Settings to search titles, discover new ones, and see streaming availability.
        </div>
      )}

      <main className="content">
        {tab === "suggest" && (
          <SuggestTab {...{ settings, query, setQuery, results, searching, addFromTmdb, manualMode, setManualMode, manual, setManual, addManual, movies, me, householdServices, haveIt, toggleHype, markWatched, removeMovie }} />
        )}
        {tab === "discover" && (
          <DiscoverTab settings={settings} genreMap={genreMap} movies={movies} me={me} partner={partner} swipes={swipes} setSwipe={setSwipe} showToast={showToast} />
        )}
        {tab === "pick" && (
          <PickTab movies={movies} me={me} partner={partner} allGenres={allGenres} haveIt={haveIt} markWatched={markWatched} />
        )}
        {tab === "watched" && (
          <WatchedTab movies={movies} me={me} partner={partner} setRating={setRating} markWatched={markWatched} />
        )}
        {tab === "stats" && <StatsTab movies={movies} names={settings.names} />}
        {tab === "settings" && (
          <SettingsTab settings={settings} saveSettings={saveSettings} me={me} showToast={showToast} />
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

      {toast && <div className="toast">{toast}</div>}

      <nav className="tabbar">
        <TabBtn icon={<Plus size={17} />} label="Suggest" active={tab === "suggest"} onClick={() => setTab("suggest")} />
        <TabBtn icon={<Flame size={17} />} label="Discover" active={tab === "discover"} onClick={() => setTab("discover")} />
        <TabBtn icon={<Shuffle size={17} />} label="Pick" active={tab === "pick"} onClick={() => setTab("pick")} />
        <TabBtn icon={<Eye size={17} />} label="Watched" active={tab === "watched"} onClick={() => setTab("watched")} />
        <TabBtn icon={<Award size={17} />} label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
        <TabBtn icon={<Settings size={17} />} label="Setup" active={tab === "settings"} onClick={() => setTab("settings")} />
      </nav>
    </div>
  );
}

function TabBtn({ icon, label, active, onClick }) {
  return (<button className={"tab" + (active ? " active" : "")} onClick={onClick}>{icon}<span>{label}</span></button>);
}

function SuggestTab(props) {
  const { settings, query, setQuery, results, searching, addFromTmdb, manualMode, setManualMode, manual, setManual, addManual, movies, me, householdServices, haveIt, toggleHype, markWatched, removeMovie } = props;
  const list = movies.filter((m) => !m.watched);
  return (
    <div>
      <div className="search-row">
        <Search size={16} className="search-icon" />
        <input className="input search-input" placeholder={settings.apiKey ? "Search a movie title…" : "Add a TMDB key in Settings to search"} value={query} onChange={(e) => setQuery(e.target.value)} disabled={!settings.apiKey} />
      </div>
      {searching && <p className="hint">Searching…</p>}
      {results.length > 0 && (
        <div className="results">
          {results.map((r) => (
            <button key={r.id} className="result-row" onClick={() => addFromTmdb(r)}>
              {r.poster_path ? <img src={posterUrl(r.poster_path)} alt="" /> : <div className="poster-fallback"><Film size={14} /></div>}
              <div><div className="result-title">{r.title}</div><div className="result-year">{(r.release_date || "").slice(0, 4)}</div></div>
              <Plus size={16} />
            </button>
          ))}
        </div>
      )}
      <button className="link-btn" onClick={() => setManualMode(!manualMode)}>
        {manualMode ? "Cancel manual add" : "Can't find it? Add manually"}
      </button>
      {manualMode && (
        <div className="manual-form">
          <input className="input" placeholder="Title" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="Year" value={manual.year} onChange={(e) => setManual({ ...manual, year: e.target.value })} />
            <input className="input" placeholder="Genre" value={manual.genre} onChange={(e) => setManual({ ...manual, genre: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={addManual}>Add to list</button>
        </div>
      )}

      <h2 className="section-title">On the list ({list.length})</h2>
      {list.length === 0 && <div className="empty-state">No suggestions yet. Search above, or try Discover to swipe through new ideas.</div>}
      <div className="list">
        {list.map((m) => (
          <MovieCard key={m.id} m={m} me={me} householdServices={householdServices} haveIt={haveIt(m)} toggleHype={toggleHype} markWatched={markWatched} removeMovie={removeMovie} />
        ))}
      </div>
    </div>
  );
}

function MovieCard({ m, me, haveIt, toggleHype, markWatched, removeMovie }) {
  const hypeCount = Object.values(m.hype || {}).filter(Boolean).length;
  return (
    <div className="ticket">
      <Notches />
      <div className="ticket-poster">{m.poster ? <img src={m.poster} alt="" /> : <div className="poster-fallback"><Film size={20} /></div>}</div>
      <div className="ticket-body">
        <div className="ticket-title">{m.title} {m.year && <span className="ticket-year">'{String(m.year).slice(-2)}</span>}</div>
        <div className="tag-row">{(m.genreNames || []).slice(0, 3).map((g) => <span key={g} className="genre-tag">{g}</span>)}</div>
        <div className="meta-row">Added by {m.addedBy}</div>
        <div className="provider-row">
          {m.providers?.flatrate?.length > 0 ? (
            <span className={"badge " + (haveIt ? "badge-have" : "badge-nohave")}>{haveIt ? <Check size={12} /> : <X size={12} />} {m.providers.flatrate.slice(0, 2).join(", ")}</span>
          ) : m.providers?.rent?.length > 0 ? (
            <span className="badge badge-rent">Rent/buy only</span>
          ) : (
            <span className="badge badge-unknown">No streaming data</span>
          )}
        </div>
      </div>
      <div className="ticket-actions">
        <button className="icon-btn" onClick={() => toggleHype(m.id)} aria-label="Hype">
          <Heart size={16} fill={m.hype?.[me] ? "var(--red)" : "none"} color={m.hype?.[me] ? "var(--red)" : "var(--muted)"} />
          {hypeCount > 0 && <span className="hype-count">{hypeCount}</span>}
        </button>
        <button className="icon-btn" onClick={() => markWatched(m.id, true)} aria-label="Mark watched"><PlayCircle size={16} /></button>
        <button className="icon-btn" onClick={() => removeMovie(m.id)} aria-label="Remove"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function DiscoverTab({ settings, genreMap, movies, me, partner, swipes, setSwipe, showToast }) {
  const [mode, setMode] = useState("discover");
  const [genreFilter, setGenreFilter] = useState(null);
  const [queue, setQueue] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [theirQueue, setTheirQueue] = useState([]);
  const [theirLoading, setTheirLoading] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null);
  const startX = useRef(0);
  const fetchedRef = useRef(new Set());

  const mySwipes = swipes[me] || {};
  const partnerSwipes = swipes[partner] || {};
  const knownIds = new Set([
    ...movies.map((m) => String(m.tmdbId)),
    ...Object.keys(mySwipes),
  ]);

  const partnerPendingIds = Object.entries(partnerSwipes)
    .filter(([id, v]) => v === "like" && !mySwipes[id] && !movies.some((m) => String(m.tmdbId) === id))
    .map(([id]) => id);

  const loadMore = useCallback(async (resetPage) => {
    if (!settings.apiKey || loading) return;
    setLoading(true);
    try {
      const p = resetPage ? 1 : page;
      const genreParam = genreFilter ? `&with_genres=${genreFilter}` : "";
      const d = await tmdb(`/discover/movie?sort_by=popularity.desc&include_adult=false&page=${p}${genreParam}`, settings.apiKey);
      const fresh = (d.results || []).filter((r) => !knownIds.has(String(r.id)));
      setQueue((q) => resetPage ? fresh : [...q, ...fresh]);
      setPage(p + 1);
    } catch (e) {}
    setLoading(false);
  }, [settings.apiKey, page, genreFilter, loading]);

  useEffect(() => {
    setQueue([]);
    setPage(1);
    if (mode === "discover") loadMore(true);
  }, [genreFilter, settings.apiKey, mode]);

  useEffect(() => {
    if (mode === "discover" && queue.length <= 2 && !loading && settings.apiKey) loadMore(false);
  }, [queue.length, mode]);

  useEffect(() => {
    if (!settings.apiKey) return;
    const toFetch = partnerPendingIds.filter((id) => !fetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      setTheirLoading(true);
      const fetched = [];
      for (const id of toFetch) {
        fetchedRef.current.add(id);
        try {
          const d = await tmdb(`/movie/${id}`, settings.apiKey);
          fetched.push({ id: d.id, title: d.title, poster_path: d.poster_path, overview: d.overview, release_date: d.release_date, genre_ids: (d.genres || []).map((g) => g.id) });
        } catch (e) {}
      }
      if (!cancelled) setTheirQueue((q) => [...q, ...fetched]);
      setTheirLoading(false);
    })();
    return () => { cancelled = true; };
  }, [swipes, movies, settings.apiKey]);

  useEffect(() => {
    setTheirQueue((q) => q.filter((m) => partnerPendingIds.includes(String(m.id))));
  }, [swipes, movies]);

  const activeQueue = mode === "discover" ? queue : theirQueue;
  const activeLoading = mode === "discover" ? loading : theirLoading;

  function commitSwipe(liked) {
    const current = activeQueue[0];
    if (!current) return;
    setExiting(liked ? "right" : "left");
    setSwipe(me, current.id, liked ? "like" : "pass");
    setTimeout(() => {
      if (mode === "discover") setQueue((q) => q.slice(1));
      else setTheirQueue((q) => q.slice(1));
      setExiting(null);
      setDragX(0);
    }, 220);
  }

  function onPointerDown(e) {
    startX.current = e.clientX;
    setDragging(true);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 90) commitSwipe(true);
    else if (dragX < -90) commitSwipe(false);
    else setDragX(0);
  }

  const genreOptions = Object.entries(genreMap);
  const current = activeQueue[0];
  const next = activeQueue[1];

  return (
    <div>
      <h2 className="section-title">Discover</h2>
      <div className="mode-row">
        <button className={"mode-btn" + (mode === "discover" ? " active" : "")} onClick={() => setMode("discover")}>New for you</button>
        <button className={"mode-btn" + (mode === "theirs" ? " active" : "")} onClick={() => setMode("theirs")}>
          {partner} liked{partnerPendingIds.length > 0 && <span className="mode-badge">{partnerPendingIds.length}</span>}
        </button>
      </div>

      {mode === "discover" && (
        <div className="chip-row">
          <button className={"chip" + (genreFilter === null ? " active" : "")} onClick={() => setGenreFilter(null)}>All</button>
          {genreOptions.slice(0, 10).map(([id, name]) => (
            <button key={id} className={"chip" + (genreFilter === id ? " active" : "")} onClick={() => setGenreFilter(id)}>{name}</button>
          ))}
        </div>
      )}

      {!settings.apiKey && <div className="empty-state" style={{ marginTop: 14 }}>Add a TMDB key in Settings to start discovering.</div>}

      {settings.apiKey && (
        <div className="swipe-stack">
          {!current && !activeLoading && mode === "discover" && (
            <div className="empty-state">You're all caught up — check back later for more picks, or try a different genre.</div>
          )}
          {!current && !activeLoading && mode === "theirs" && (
            <div className="empty-state">Nothing waiting on you right now — {partner} hasn't liked anything you haven't already seen.</div>
          )}
          {!current && activeLoading && <p className="hint" style={{ textAlign: "center" }}>Loading movies…</p>}

          {next && (
            <div className="swipe-card behind">
              {next.poster_path ? <img src={backdropUrl(next.poster_path) || posterUrl(next.poster_path)} alt="" /> : <div className="poster-fallback big" />}
            </div>
          )}

          {current && (
            <div
              className={"swipe-card" + (exiting ? " exit-" + exiting : "")}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`, opacity: dragging ? 1 - Math.min(Math.abs(dragX) / 400, 0.3) : 1 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <Notches />
              {current.poster_path ? <img src={posterUrl(current.poster_path)} alt="" className="swipe-poster" /> : <div className="poster-fallback big"><Film size={28} /></div>}
              <div className="swipe-info">
                <div className="reveal-title">{current.title} {current.release_date && <span className="ticket-year">'{current.release_date.slice(2, 4)}</span>}</div>
                <div className="tag-row" style={{ justifyContent: "center" }}>
                  {(current.genre_ids || []).slice(0, 3).map((gid) => genreMap[gid] && <span key={gid} className="genre-tag">{genreMap[gid]}</span>)}
                </div>
                {current.overview && <p className="swipe-overview">{current.overview.length > 130 ? current.overview.slice(0, 130) + "…" : current.overview}</p>}
              </div>
              {mode === "theirs" && <div className="swipe-stamp their-pick">{partner}'S PICK</div>}
              {dragX > 40 && <div className="swipe-stamp like">LIKE</div>}
              {dragX < -40 && <div className="swipe-stamp pass">PASS</div>}
            </div>
          )}

          {current && (
            <div className="swipe-actions">
              <button className="swipe-btn swipe-btn-pass" onClick={() => commitSwipe(false)} aria-label="Pass"><X size={22} /></button>
              <button className="swipe-btn swipe-btn-like" onClick={() => commitSwipe(true)} aria-label="Like"><Heart size={22} /></button>
            </div>
          )}
          <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>
            {mode === "discover" ? "Swipe or tap — when you both like the same one, it's added automatically." : `These are movies ${partner} already liked. Like one back and it goes straight to your list.`}
          </p>
        </div>
      )}
    </div>
  );
}

function PickTab({ movies, me, partner, allGenres, haveIt, markWatched }) {
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [unwatchedOnly, setUnwatchedOnly] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState(null);
  const [result, setResult] = useState(null);
  const [vetoed, setVetoed] = useState([]);
  const [vetoUsed, setVetoUsed] = useState({});
  const intervalRef = useRef(null);

  const pool = movies.filter((m) => {
    if (unwatchedOnly && m.watched) return false;
    if (selectedGenres.length && !selectedGenres.some((g) => (m.genreNames || []).includes(g))) return false;
    if (vetoed.includes(m.id)) return false;
    return true;
  });

  function toggleGenre(g) { setSelectedGenres((s) => s.includes(g) ? s.filter((x) => x !== g) : [...s, g]); }

  function spin() {
    if (pool.length === 0) return;
    setResult(null);
    setSpinning(true);
    let count = 0;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setDisplay(pool[Math.floor(Math.random() * pool.length)]);
      count++;
      if (count > 14) {
        clearInterval(intervalRef.current);
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        setDisplay(chosen);
        setResult(chosen);
        setSpinning(false);
      }
    }, 90);
  }

  function newSession() { setVetoed([]); setVetoUsed({}); setResult(null); setDisplay(null); }

  function veto(name) {
    if (vetoUsed[name] || !result) return;
    setVetoUsed((v) => ({ ...v, [name]: true }));
    setVetoed((v) => [...v, result.id]);
    setTimeout(spin, 100);
  }

  return (
    <div>
      <h2 className="section-title">Filter by mood</h2>
      <div className="chip-row">
        {allGenres.length === 0 && <p className="hint">Add some movies with genres first.</p>}
        {allGenres.map((g) => (<button key={g} className={"chip" + (selectedGenres.includes(g) ? " active" : "")} onClick={() => toggleGenre(g)}>{g}</button>))}
      </div>
      <div className="toggle-row">
        <label className="toggle"><input type="checkbox" checked={unwatchedOnly} onChange={(e) => setUnwatchedOnly(e.target.checked)} /> Unwatched only</label>
      </div>
      <p className="hint">{pool.length} movie{pool.length !== 1 ? "s" : ""} in the running</p>

      <button className="btn btn-primary spin-btn" onClick={() => { newSession(); spin(); }} disabled={pool.length === 0 || spinning}>
        <Shuffle size={16} /> {spinning ? "Rolling…" : "Pick for us"}
      </button>

      {display && (
        <div className={"reveal-ticket" + (spinning ? " spinning" : "")}>
          <Notches />
          {display.poster ? <img src={display.poster} alt="" className="reveal-poster" /> : <div className="poster-fallback big"><Film size={28} /></div>}
          <div className="reveal-title">{display.title}</div>
          <div className="tag-row" style={{ justifyContent: "center" }}>{(display.genreNames || []).slice(0, 3).map((g) => <span key={g} className="genre-tag">{g}</span>)}</div>
          {!spinning && result && (
            <>
              <div className="veto-row">
                <button className="btn btn-outline" disabled={vetoUsed[me]} onClick={() => veto(me)}><ThumbsDown size={14} /> {me} veto</button>
                <button className="btn btn-outline" disabled={vetoUsed[partner]} onClick={() => veto(partner)}><ThumbsDown size={14} /> {partner} veto</button>
              </div>
              <button className="btn btn-primary" onClick={() => markWatched(result.id, true)}>Watch this now</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WatchedTab({ movies, me, partner, setRating, markWatched }) {
  const list = movies.filter((m) => m.watched).sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  return (
    <div>
      <h2 className="section-title">Watched ({list.length})</h2>
      {list.length === 0 && <div className="empty-state">Nothing watched yet — pick a movie and enjoy the show.</div>}
      <div className="list">
        {list.map((m) => (
          <div key={m.id} className="ticket watched-ticket">
            <Notches />
            <div className="ticket-poster">{m.poster ? <img src={m.poster} alt="" /> : <div className="poster-fallback"><Film size={20} /></div>}</div>
            <div className="ticket-body">
              <div className="ticket-title">{m.title} {m.year && <span className="ticket-year">'{String(m.year).slice(-2)}</span>}</div>
              <div className="meta-row">{m.watchedAt ? new Date(m.watchedAt).toLocaleDateString() : ""}</div>
              <div className="rate-line"><span>{me}</span><Stars value={m.ratings?.[me] || 0} onChange={(v) => setRating(m.id, v)} size={13} /></div>
              <div className="rate-line"><span>{partner}</span><Stars value={m.ratings?.[partner] || 0} onChange={() => {}} size={13} /></div>
            </div>
            <div className="ticket-actions">
              <button className="icon-btn" onClick={() => markWatched(m.id, false)} aria-label="Move back to list"><RefreshCw size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ movies, names }) {
  const watched = movies.filter((m) => m.watched);
  const allRatings = watched.flatMap((m) => Object.values(m.ratings || {})).filter(Boolean);
  const avg = allRatings.length ? (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1) : "—";
  const counts = {};
  movies.forEach((m) => { counts[m.addedBy] = (counts[m.addedBy] || 0) + 1; });
  const genreCounts = {};
  movies.forEach((m) => (m.genreNames || []).forEach((g) => { genreCounts[g] = (genreCounts[g] || 0) + 1; }));
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
  const mostHyped = [...movies].filter((m) => !m.watched).sort((a, b) => Object.values(b.hype || {}).filter(Boolean).length - Object.values(a.hype || {}).filter(Boolean).length)[0];
  const topRated = [...watched].sort((a, b) => {
    const ra = Object.values(a.ratings || {}); const rb = Object.values(b.ratings || {});
    const aa = ra.length ? ra.reduce((x, y) => x + y, 0) / ra.length : 0;
    const bb = rb.length ? rb.reduce((x, y) => x + y, 0) / rb.length : 0;
    return bb - aa;
  })[0];

  return (
    <div>
      <h2 className="section-title">The numbers</h2>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-num">{movies.length}</div><div className="stat-label">Suggested</div></div>
        <div className="stat-card"><div className="stat-num">{watched.length}</div><div className="stat-label">Watched</div></div>
        <div className="stat-card"><div className="stat-num">{avg}</div><div className="stat-label">Avg rating</div></div>
        <div className="stat-card"><div className="stat-num">{topGenre ? topGenre[0] : "—"}</div><div className="stat-label">Top genre</div></div>
      </div>
      {names.map((n) => (<div key={n} className="meta-row" style={{ marginTop: 6 }}>{n} has suggested {counts[n] || 0} movie{(counts[n] || 0) !== 1 ? "s" : ""}</div>))}
      {mostHyped && Object.values(mostHyped.hype || {}).some(Boolean) && (
        <div className="highlight-box"><Heart size={14} color="var(--red)" /> Most hyped pick still unwatched: <b>{mostHyped.title}</b></div>
      )}
      {topRated && allRatings.length > 0 && (
        <div className="highlight-box"><Award size={14} color="var(--gold)" /> Highest rated so far: <b>{topRated.title}</b></div>
      )}
    </div>
  );
}

function SettingsTab({ settings, saveSettings, me, showToast }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  function update(patch) { setLocal({ ...local, ...patch }); }
  async function save() { await saveSettings(local); showToast("Settings saved"); }

  function toggleService(name, svc) {
    const list = local.services[name] || [];
    const next = list.includes(svc) ? list.filter((s) => s !== svc) : [...list, svc];
    update({ services: { ...local.services, [name]: next } });
  }

  return (
    <div>
      <h2 className="section-title">Who's playing</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" value={local.names[0]} onChange={(e) => update({ names: [e.target.value, local.names[1]] })} />
        <input className="input" value={local.names[1]} onChange={(e) => update({ names: [local.names[0], e.target.value] })} />
      </div>

      <h2 className="section-title">TMDB API key</h2>
      <p className="hint">Free at themoviedb.org → Settings → API. Enables search, discover, and streaming lookup for everyone using this app.</p>
      <input className="input" type="password" placeholder="Paste your TMDB API key" value={local.apiKey} onChange={(e) => update({ apiKey: e.target.value })} />

      <h2 className="section-title">Region</h2>
      <select className="input" value={local.region} onChange={(e) => update({ region: e.target.value })}>
        {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>

      <h2 className="section-title">{me}'s streaming services</h2>
      <div className="chip-row">
        {SERVICES.map((s) => (<button key={s} className={"chip" + ((local.services[me] || []).includes(s) ? " active" : "")} onClick={() => toggleService(me, s)}>{s}</button>))}
      </div>

      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={save}>Save settings</button>

      <div className="install-tip">
        <b>Add to your home screen:</b> open the share menu in your browser and choose "Add to Home Screen" (iPhone) or "Install app" (Android) to use this like a native app.
      </div>
    </div>
  );
}

function RateModal({ movie, me, onRate, onClose }) {
  const [val, setVal] = useState(movie?.ratings?.[me] || 0);
  if (!movie) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <Notches />
        <div className="ticket-title" style={{ textAlign: "center" }}>{movie.title}</div>
        <p className="hint" style={{ textAlign: "center" }}>How was it, {me}?</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <Stars value={val} onChange={(v) => { setVal(v); onRate(v); }} size={26} />
        </div>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
      :root {
        --bg:#12141c; --surface:#1a1e29; --surface2:#232a3c; --border:#2e3446;
        --gold:#e8a33d; --red:#d6462f; --green:#4caf7d; --cream:#f4efe6;
        --muted:#8b91a3; --muted-2:#4d5266;
      }
      * { box-sizing: border-box; }
      body { margin:0; }
      .app { font-family:'Inter',system-ui,sans-serif; background:var(--bg); color:var(--cream);
        min-height:100vh; max-width:480px; margin:0 auto; padding-bottom:78px; position:relative; }
      .app.boot { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; min-height:100vh; color:var(--gold); text-align:center; padding:20px; }
      .marquee { background:var(--surface); padding:18px 16px 14px; text-align:center; border-bottom:2px solid var(--gold); position:relative; }
      .bulbs { display:flex; justify-content:center; gap:6px; margin-bottom:8px; }
      .bulb { width:5px; height:5px; border-radius:50%; background:var(--gold); animation:blink 1.6s infinite; }
      @keyframes blink { 0%,100%{opacity:0.25;} 50%{opacity:1;} }
      .marquee h1 { font-family:'Bebas Neue',Impact,sans-serif; letter-spacing:3px; font-size:26px; margin:0;
        display:flex; align-items:center; justify-content:center; gap:8px; color:var(--gold); }
      .identity { margin-top:8px; background:none; border:1px solid var(--border); color:var(--muted); border-radius:20px;
        padding:5px 12px; font-size:12px; display:inline-flex; align-items:center; gap:6px; }
      .identity b { color:var(--cream); }
      .banner { background:var(--surface2); color:var(--gold); font-size:12.5px; padding:10px 16px; text-align:center; cursor:pointer; }
      .content { padding:16px; }
      .section-title { font-family:'Bebas Neue',Impact,sans-serif; letter-spacing:1.5px; font-size:17px; color:var(--gold); margin:22px 0 10px; }
      .hint { color:var(--muted); font-size:12.5px; margin:4px 0; }
      .empty-state { color:var(--muted); font-size:13px; padding:24px 12px; text-align:center; border:1px dashed var(--border); border-radius:12px; }
      .search-row { position:relative; margin-top:6px; }
      .search-icon { position:absolute; left:12px; top:12px; color:var(--muted); }
      .input, select.input { width:100%; box-sizing:border-box; background:var(--surface2); border:1px solid var(--border); color:var(--cream);
        border-radius:10px; padding:10px 12px; font-size:14px; margin-top:6px; }
      .search-input { padding-left:34px; }
      .results { margin-top:8px; display:flex; flex-direction:column; gap:6px; }
      .result-row { display:flex; align-items:center; gap:10px; background:var(--surface2); border:1px solid var(--border); border-radius:10px;
        padding:6px 10px; text-align:left; width:100%; }
      .result-row img { width:32px; height:48px; object-fit:cover; border-radius:4px; }
      .result-title { font-size:13.5px; font-weight:600; }
      .result-year { font-size:11.5px; color:var(--muted); }
      .link-btn { background:none; border:none; color:var(--gold); font-size:12.5px; margin-top:10px; padding:0; text-decoration:underline; }
      .manual-form { display:flex; flex-direction:column; gap:8px; margin-top:10px; background:var(--surface2); padding:12px; border-radius:10px; }
      .list { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
      .ticket { position:relative; background:var(--surface); border:1px solid var(--border); border-radius:14px; display:flex; gap:10px; padding:10px; overflow:hidden; }
      .notch { position:absolute; width:14px; height:14px; background:var(--bg); border-radius:50%; top:50%; transform:translateY(-50%); }
      .notch-l { left:-7px; } .notch-r { right:-7px; }
      .ticket-poster img, .ticket-poster .poster-fallback { width:52px; height:78px; object-fit:cover; border-radius:6px; }
      .poster-fallback { background:var(--surface2); display:flex; align-items:center; justify-content:center; color:var(--muted); }
      .poster-fallback.big { width:100%; height:100%; border-radius:14px; }
      .ticket-body { flex:1; min-width:0; }
      .ticket-title { font-size:15px; font-weight:600; line-height:1.25; }
      .ticket-year { color:var(--muted); font-weight:400; font-size:12.5px; }
      .tag-row { display:flex; flex-wrap:wrap; gap:4px; margin:4px 0; }
      .genre-tag { font-size:10.5px; background:var(--surface2); color:var(--muted); padding:2px 7px; border-radius:8px; }
      .meta-row { font-size:11.5px; color:var(--muted); }
      .provider-row { margin-top:5px; }
      .badge { font-size:11px; padding:3px 8px; border-radius:8px; display:inline-flex; align-items:center; gap:4px; }
      .badge-have { background:rgba(76,175,125,0.15); color:var(--green); }
      .badge-nohave { background:rgba(214,70,47,0.15); color:#e08a76; }
      .badge-rent { background:var(--surface2); color:var(--gold); }
      .badge-unknown { background:var(--surface2); color:var(--muted); }
      .ticket-actions { display:flex; flex-direction:column; gap:6px; justify-content:center; }
      .icon-btn { background:none; border:none; color:var(--muted); position:relative; padding:4px; }
      .hype-count { position:absolute; top:-4px; right:-6px; background:var(--red); color:white; font-size:9px; border-radius:8px; padding:0 4px; }
      .chip-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
      .chip { background:var(--surface2); border:1px solid var(--border); color:var(--muted); border-radius:16px; padding:6px 12px; font-size:12.5px; }
      .chip.active { background:var(--gold); border-color:var(--gold); color:#2b1d05; font-weight:600; }
      .toggle-row { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
      .toggle { font-size:13px; color:var(--muted); display:flex; align-items:center; gap:8px; }
      .btn { font-family:inherit; border-radius:10px; padding:11px 16px; font-size:14px; font-weight:600; border:1px solid var(--border);
        background:var(--surface2); color:var(--cream); display:inline-flex; align-items:center; justify-content:center; gap:6px; width:100%; cursor:pointer; }
      .btn-primary { background:var(--gold); border-color:var(--gold); color:#2b1d05; }
      .btn-outline { background:none; color:var(--cream); flex:1; }
      .spin-btn { margin-top:14px; }
      .reveal-ticket { position:relative; margin-top:18px; background:var(--surface); border:1px solid var(--gold); border-radius:16px; padding:20px; text-align:center; }
      .reveal-ticket.spinning { opacity:0.85; }
      .reveal-poster { width:110px; height:160px; object-fit:cover; border-radius:8px; margin:0 auto 10px; }
      .reveal-title { font-family:'Bebas Neue',Impact,sans-serif; font-size:22px; letter-spacing:1px; color:var(--gold); margin-bottom:4px; }
      .veto-row { display:flex; gap:8px; margin:14px 0 8px; }
      .star-btn { background:none; border:none; padding:0; line-height:0; cursor:pointer; }
      .rate-line { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--muted); margin-top:3px; }
      .stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .stat-card { background:var(--surface2); border-radius:12px; padding:14px; text-align:center; }
      .stat-num { font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:500; color:var(--gold); }
      .stat-label { font-size:11.5px; color:var(--muted); margin-top:2px; }
      .highlight-box { margin-top:14px; background:var(--surface2); border-left:3px solid var(--gold); border-radius:8px; padding:10px 12px; font-size:13px; display:flex; align-items:center; gap:8px; }
      .install-tip { margin-top:26px; font-size:12px; color:var(--muted); background:var(--surface2); padding:12px; border-radius:10px; }
      .toast { position:fixed; bottom:88px; left:50%; transform:translateX(-50%); background:var(--gold); color:#2b1d05;
        padding:9px 18px; border-radius:20px; font-size:13px; font-weight:600; white-space:nowrap; z-index:20; max-width:90%; text-align:center; }
      .tabbar { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; max-width:480px; display:flex; background:var(--surface); border-top:1px solid var(--border); padding:6px 4px; }
      .tab { flex:1; background:none; border:none; color:var(--muted); display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px 0; font-size:10px; cursor:pointer; }
      .tab.active { color:var(--gold); }
      .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; padding:24px; z-index:30; }
      .modal { position:relative; background:var(--surface); border:1px solid var(--gold); border-radius:14px; padding:20px; width:100%; max-width:280px; }
      .swipe-stack { position:relative; margin-top:16px; height:440px; display:flex; flex-direction:column; align-items:center; }
      .swipe-card { position:absolute; top:0; width:100%; max-width:280px; height:360px; background:var(--surface); border:1px solid var(--border);
        border-radius:16px; overflow:hidden; touch-action:none; cursor:grab; transition:transform 0.2s, opacity 0.2s; display:flex; flex-direction:column; }
      .swipe-card.behind { opacity:0.5; transform:scale(0.96) translateY(6px); z-index:0; }
      .swipe-card:not(.behind) { z-index:1; }
      .swipe-card.exit-right { transform:translateX(500px) rotate(20deg) !important; opacity:0; }
      .swipe-card.exit-left { transform:translateX(-500px) rotate(-20deg) !important; opacity:0; }
      .swipe-poster { width:100%; height:230px; object-fit:cover; }
      .swipe-info { padding:10px 12px; text-align:center; flex:1; overflow:hidden; }
      .swipe-overview { font-size:11.5px; color:var(--muted); margin-top:6px; line-height:1.4; }
      .swipe-stamp { position:absolute; top:16px; font-family:'Bebas Neue',Impact,sans-serif; font-size:22px; letter-spacing:2px;
        padding:4px 12px; border-radius:6px; border:3px solid; transform:rotate(-12deg); }
      .swipe-stamp.like { right:16px; color:var(--green); border-color:var(--green); }
      .swipe-stamp.pass { left:16px; color:var(--red); border-color:var(--red); transform:rotate(12deg); }
      .swipe-stamp.their-pick { top:auto; bottom:14px; left:50%; transform:translateX(-50%); font-size:11px; letter-spacing:1px;
        padding:3px 10px; color:var(--gold); border-color:var(--gold); border-width:2px; }
      .mode-row { display:flex; gap:8px; margin-top:6px; }
      .mode-btn { flex:1; background:var(--surface2); border:1px solid var(--border); color:var(--muted); border-radius:10px;
        padding:9px 10px; font-size:12.5px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; }
      .mode-btn.active { background:var(--gold); border-color:var(--gold); color:#2b1d05; }
      .mode-badge { background:var(--red); color:white; font-size:10px; border-radius:8px; padding:1px 6px; }
      .swipe-actions { position:relative; margin-top:370px; display:flex; gap:24px; z-index:2; }
      .swipe-btn { width:52px; height:52px; border-radius:50%; border:1px solid var(--border); background:var(--surface2); display:flex; align-items:center; justify-content:center; cursor:pointer; }
      .swipe-btn-pass { color:var(--red); }
      .swipe-btn-like { color:var(--green); }
    `}</style>
  );
}
