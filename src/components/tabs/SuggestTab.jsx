import { useState, useEffect, useRef } from "react";
import { Search, Plus, Heart, CheckCircle2, Trash2, Check } from "lucide-react";
import { searchMedia, normalizeResult, mediaTypesForFilter } from "../../lib/api.js";
import { PosterThumb, MediaTypeTag, AccessBadge } from "../shared.jsx";

export default function SuggestTab({ settings, genreMap, movies, me, people, toggleHype, onMarkSeen, removeMovie, addItem, showToast, openDetails }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ title: "", year: "", genre: "", mediaType: "movie" });
  const debounceRef = useRef(null);

  const enabledTypes = mediaTypesForFilter(settings.contentType);
  const onList = (mediaType, id) => movies.some((m) => (m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(id));

  useEffect(() => {
    if (!settings.apiKey || query.trim().length < 2) { setResults([]); setSearching(false); return; }
    clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const lists = await Promise.all(enabledTypes.map((mt) => searchMedia(query, settings.apiKey, mt).then((rs) => rs.slice(0, 5).map((r) => ({ ...r, mediaType: mt })))));
        setResults(lists.flat().sort((a, b) => (b.popularity || 0) - (a.popularity || 0)));
      } catch (e) { setResults([]); }
      setSearching(false);
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, settings.apiKey, settings.contentType]);

  async function addFromTmdb(r) {
    const item = normalizeResult(r.mediaType, r, genreMap);
    await addItem(item);
    setQuery(""); setResults([]);
    showToast(`Added "${item.title}"`);
  }

  async function addManual() {
    if (!manual.title.trim()) return;
    await addItem({
      tmdbId: null, mediaType: manual.mediaType, title: manual.title.trim(), year: manual.year.trim(),
      poster: null, genreNames: manual.genre ? [manual.genre.trim()] : [], originalLanguage: "",
    });
    showToast(`Added "${manual.title.trim()}"`);
    setManual({ title: "", year: "", genre: "", mediaType: "movie" });
    setManualMode(false);
  }

  const list = movies.filter((m) => !m.watched);
  const showNoResults = !searching && query.trim().length >= 2 && results.length === 0 && settings.apiKey;

  return (
    <div>
      <label className="search-row">
        <span className="visually-hidden">Search for a movie or show</span>
        <Search size={17} className="search-icon" aria-hidden="true" />
        <input
          className="input search-input"
          type="search"
          placeholder={settings.apiKey ? "Search movies and shows" : "Add a TMDB key in Settings to search"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!settings.apiKey}
          autoComplete="off"
        />
      </label>
      {searching && <p className="hint">Searching…</p>}
      {showNoResults && <p className="hint">No matches. Check the spelling, or add it by hand below.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r) => {
            const added = onList(r.mediaType, r.id);
            return (
              <li key={`${r.mediaType}:${r.id}`}>
                <button className="result-row" onClick={() => addFromTmdb(r)} disabled={added}>
                  <PosterThumb poster={r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null} size="sm" />
                  <span className="result-text">
                    <span className="result-title">{r.title || r.name}</span>
                    <span className="result-year">{(r.release_date || r.first_air_date || "").slice(0, 4)} <MediaTypeTag mediaType={r.mediaType} /></span>
                  </span>
                  {added
                    ? <span className="result-added"><Check size={14} aria-hidden="true" /> On your list</span>
                    : <span className="result-add" aria-label={`Add ${r.title || r.name}`}><Plus size={18} aria-hidden="true" /></span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="link-btn" onClick={() => setManualMode(!manualMode)} aria-expanded={manualMode}>
        {manualMode ? "Cancel" : "Can't find it? Add it by hand"}
      </button>
      {manualMode && (
        <div className="manual-form">
          <div className="segmented small" role="group" aria-label="Type">
            <button className={manual.mediaType === "movie" ? "active" : ""} aria-pressed={manual.mediaType === "movie"} onClick={() => setManual({ ...manual, mediaType: "movie" })}>Movie</button>
            <button className={manual.mediaType === "tv" ? "active" : ""} aria-pressed={manual.mediaType === "tv"} onClick={() => setManual({ ...manual, mediaType: "tv" })}>Show</button>
          </div>
          <input className="input" aria-label="Title" placeholder="Title" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <div className="field-row">
            <input className="input" aria-label="Year" inputMode="numeric" placeholder="Year" value={manual.year} onChange={(e) => setManual({ ...manual, year: e.target.value })} />
            <input className="input" aria-label="Genre" placeholder="Genre" value={manual.genre} onChange={(e) => setManual({ ...manual, genre: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={addManual} disabled={!manual.title.trim()}>Add to list</button>
        </div>
      )}

      <h2 className="section-title">On the list <span className="section-count">{list.length}</span></h2>
      {list.length > 0 && (
        <p className="access-legend" aria-hidden="true">
          <span><i className="dot access-both" />Both of you</span>
          <span><i className="dot access-me" />One of you</span>
          <span><i className="dot access-neither" />Neither</span>
        </p>
      )}
      {list.length === 0 && <div className="empty-state">Nothing here yet. Search above, or swipe in Discover. When you both like the same title it lands here.</div>}
      <ul className="list">
        {list.map((m) => (
          <li key={m.id}>
            <MediaRow m={m} me={me} people={people} toggleHype={toggleHype} onMarkSeen={onMarkSeen} removeMovie={removeMovie} openDetails={openDetails} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MediaRow({ m, me, people, toggleHype, onMarkSeen, removeMovie, openDetails }) {
  const hypers = Object.entries(m.hype || {}).filter(([, v]) => v).map(([n]) => n);
  const iHyped = !!m.hype?.[me];
  return (
    <div className="media-row">
      <button className="media-row-main" onClick={() => openDetails(m)}>
        <PosterThumb poster={m.poster} />
        <span className="media-row-body">
          <span className="media-row-title">{m.title}</span>
          <span className="meta-row">{[m.year, (m.mediaType || "movie") === "tv" ? "Show" : "Movie", (m.genreNames || [])[0]].filter(Boolean).join(" · ")}</span>
          <span className="meta-row">Added by {m.addedBy}</span>
          <AccessBadge providers={m.providers} people={people} />
          <span className="visually-hidden">. Show details and where to watch.</span>
        </span>
      </button>
      <div className="media-row-actions">
        <button className={"icon-btn" + (iHyped ? " on" : "")} onClick={() => toggleHype(m.id)} aria-pressed={iHyped} aria-label={iHyped ? "Excited to watch (tap to undo)" : "Mark as excited to watch"} title={hypers.length ? `Excited: ${hypers.join(", ")}` : "Excited to watch"}>
          <Heart size={18} aria-hidden="true" fill={iHyped ? "currentColor" : "none"} />
          {hypers.length > 0 && <span className="count-badge">{hypers.length}</span>}
        </button>
        <button className="icon-btn" onClick={() => onMarkSeen(m.id)} aria-label={`Mark ${m.title} as watched`} title="Mark as watched">
          <CheckCircle2 size={18} aria-hidden="true" />
        </button>
        <button className="icon-btn" onClick={() => removeMovie(m.id)} aria-label={`Remove ${m.title}`} title="Remove">
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
