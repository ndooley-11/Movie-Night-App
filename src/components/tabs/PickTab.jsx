import { useState, useRef } from "react";
import { Shuffle, ThumbsDown, Film } from "lucide-react";
import { mediaTypesForFilter } from "../../lib/api.js";
import { MediaTypeTag } from "../shared.jsx";

export default function PickTab({ movies, me, partner, allGenres, contentType, markWatched }) {
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [unwatchedOnly, setUnwatchedOnly] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState(null);
  const [result, setResult] = useState(null);
  const [vetoed, setVetoed] = useState([]);
  const [vetoUsed, setVetoUsed] = useState({});
  const intervalRef = useRef(null);

  const enabledTypes = mediaTypesForFilter(contentType);

  const pool = movies.filter((m) => {
    if (!enabledTypes.includes(m.mediaType || "movie")) return false;
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
        {allGenres.length === 0 && <p className="hint">Add some titles with genres first.</p>}
        {allGenres.map((g) => (<button key={g} className={"chip" + (selectedGenres.includes(g) ? " active" : "")} onClick={() => toggleGenre(g)}>{g}</button>))}
      </div>
      <div className="toggle-row">
        <label className="checkbox-row"><input type="checkbox" checked={unwatchedOnly} onChange={(e) => setUnwatchedOnly(e.target.checked)} /> Unwatched only</label>
      </div>
      <p className="hint">{pool.length} title{pool.length !== 1 ? "s" : ""} in the running</p>

      <button className="btn btn-primary spin-btn" onClick={() => { newSession(); spin(); }} disabled={pool.length === 0 || spinning}>
        <Shuffle size={16} /> {spinning ? "Rolling…" : "Pick for us"}
      </button>

      {display && (
        <div className={"reveal-card" + (spinning ? " spinning" : "")}>
          {display.poster ? <img src={display.poster} alt="" className="reveal-poster" /> : <div className="poster-fallback big"><Film size={28} /></div>}
          <div className="reveal-title">{display.title} <MediaTypeTag mediaType={display.mediaType || "movie"} /></div>
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
