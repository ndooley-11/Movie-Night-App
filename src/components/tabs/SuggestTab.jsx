import { useState, useEffect, useRef } from "react";
import { Search, Plus, Heart, PlayCircle, Trash2, Film } from "lucide-react";
import { searchMedia, normalizeResult } from "../../lib/api.js";
import { mediaTypesForFilter } from "../../lib/api.js";
import { PosterThumb, MediaTypeTag, AvailabilityBadge } from "../shared.jsx";

export default function SuggestTab({ settings, genreMap, movies, me, householdServices, haveIt, toggleHype, markWatched, removeMovie, addItem, showToast }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ title: "", year: "", genre: "", mediaType: "movie" });
  const debounceRef = useRef(null);

  const enabledTypes = mediaTypesForFilter(settings.contentType);

  useEffect(() => {
    if (!settings.apiKey || query.trim().length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const lists = await Promise.all(enabledTypes.map((mt) => searchMedia(query, settings.apiKey, mt).then((rs) => rs.slice(0, 5).map((r) => ({ ...r, mediaType: mt })))));
        setResults(lists.flat());
      } catch (e) { setResults([]); }
      setSearching(false);
    }, 400);
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
    setManual({ title: "", year: "", genre: "", mediaType: "movie" });
    setManualMode(false);
    showToast(`Added "${manual.title.trim()}"`);
  }

  const list = movies.filter((m) => !m.watched);

  return (
    <div>
      <div className="search-row">
        <Search size={16} className="search-icon" />
        <input
          className="input search-input"
          placeholder={settings.apiKey ? "Search a title…" : "Add a TMDB key in Settings to search"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!settings.apiKey}
        />
      </div>
      {searching && <p className="hint">Searching…</p>}
      {results.length > 0 && (
        <div className="results">
          {results.map((r) => (
            <button key={`${r.mediaType}:${r.id}`} className="result-row" onClick={() => addFromTmdb(r)}>
              <PosterThumb poster={r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null} size="sm" />
              <div className="result-text">
                <div className="result-title">{r.title || r.name}</div>
                <div className="result-year">{(r.release_date || r.first_air_date || "").slice(0, 4)} <MediaTypeTag mediaType={r.mediaType} /></div>
              </div>
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
          <div className="segmented small">
            <button className={manual.mediaType === "movie" ? "active" : ""} onClick={() => setManual({ ...manual, mediaType: "movie" })}>Movie</button>
            <button className={manual.mediaType === "tv" ? "active" : ""} onClick={() => setManual({ ...manual, mediaType: "tv" })}>Show</button>
          </div>
          <input className="input" placeholder="Title" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <div className="field-row">
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
          <MediaRow key={m.id} m={m} me={me} haveIt={haveIt(m)} toggleHype={toggleHype} markWatched={markWatched} removeMovie={removeMovie} />
        ))}
      </div>
    </div>
  );
}

function MediaRow({ m, me, haveIt, toggleHype, markWatched, removeMovie }) {
  const hypeCount = Object.values(m.hype || {}).filter(Boolean).length;
  return (
    <div className="media-row">
      <PosterThumb poster={m.poster} />
      <div className="media-row-body">
        <div className="media-row-title">{m.title} {m.year && <span className="muted">· {m.year}</span>} <MediaTypeTag mediaType={m.mediaType || "movie"} /></div>
        <div className="tag-row">{(m.genreNames || []).slice(0, 3).map((g) => <span key={g} className="genre-tag">{g}</span>)}</div>
        <div className="meta-row">Added by {m.addedBy}</div>
        <div className="provider-row"><AvailabilityBadge providers={m.providers} haveIt={haveIt} /></div>
      </div>
      <div className="media-row-actions">
        <button className="icon-btn" onClick={() => toggleHype(m.id)} aria-label="Hype">
          <Heart size={16} fill={m.hype?.[me] ? "var(--like)" : "none"} color={m.hype?.[me] ? "var(--like)" : "var(--text-faint)"} />
          {hypeCount > 0 && <span className="count-badge">{hypeCount}</span>}
        </button>
        <button className="icon-btn" onClick={() => markWatched(m.id, true)} aria-label="Mark watched"><PlayCircle size={16} /></button>
        <button className="icon-btn" onClick={() => removeMovie(m.id)} aria-label="Remove"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}
