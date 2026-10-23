import { useState, useRef, useEffect } from "react";
import { Shuffle, ThumbsDown, Film, Info } from "lucide-react";
import { mediaTypesForFilter } from "../../lib/api.js";
import { Switch } from "../shared.jsx";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function PickTab({ movies, me, partner, allGenres, contentType, onWatchNow, openDetails }) {
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [unwatchedOnly, setUnwatchedOnly] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState(null);
  const [result, setResult] = useState(null);
  const [vetoed, setVetoed] = useState([]);
  const [vetoUsed, setVetoUsed] = useState({});
  const intervalRef = useRef(null);
  const revealRef = useRef(null);

  // The reveal card renders below the button, which on shorter phones is
  // off-screen — bring it into view so a roll never looks like it did nothing.
  // Runs again when the result lands, since the veto/watch buttons that
  // appear then make the card taller.
  const hasDisplay = !!display;
  useEffect(() => {
    if (hasDisplay) revealRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hasDisplay, result]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

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
    const rolls = prefersReducedMotion() ? 0 : 14;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setDisplay(pool[Math.floor(Math.random() * pool.length)]);
      count++;
      if (count > rolls) {
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
      <h2 className="section-title">What are you in the mood for?</h2>
      {allGenres.length === 0
        ? <p className="hint">Add a few titles to your list first, then come back to pick one.</p>
        : (
          <div className="chip-row" role="group" aria-label="Genres">
            {allGenres.map((g) => (<button key={g} className={"chip" + (selectedGenres.includes(g) ? " active" : "")} aria-pressed={selectedGenres.includes(g)} onClick={() => toggleGenre(g)}>{g}</button>))}
          </div>
        )}
      <div className="toggle-row">
        <Switch checked={unwatchedOnly} onChange={setUnwatchedOnly} label="Skip anything you've already watched" />
      </div>

      <button className="btn btn-primary btn-lg spin-btn" onClick={() => { newSession(); spin(); }} disabled={pool.length === 0 || spinning}>
        <Shuffle size={18} aria-hidden="true" /> {spinning ? "Rolling…" : "Pick for us"}
      </button>
      <p className="hint pool-count" aria-live="polite">{pool.length} title{pool.length !== 1 ? "s" : ""} in the running</p>

      {display && (
        <div ref={revealRef} className={"reveal-card" + (spinning ? " spinning" : "")} aria-live="polite" aria-busy={spinning}>
          {display.poster ? <img src={display.poster} alt="" className="reveal-poster" /> : <div className="reveal-poster poster-fallback"><Film size={28} aria-hidden="true" /></div>}
          <div className="reveal-title">{display.title}</div>
          <p className="meta-row">{[display.year, (display.mediaType || "movie") === "tv" ? "Show" : "Movie", ...(display.genreNames || []).slice(0, 2)].filter(Boolean).join(" · ")}</p>
          {!spinning && result && (
            <>
              <button className="link-btn center" onClick={() => openDetails(result)}><Info size={14} aria-hidden="true" /> More info</button>
              <div className="veto-row">
                <button className="btn btn-outline" disabled={vetoUsed[me]} onClick={() => veto(me)}><ThumbsDown size={15} aria-hidden="true" /> {vetoUsed[me] ? "Veto used" : "Your veto"}</button>
                <button className="btn btn-outline" disabled={vetoUsed[partner]} onClick={() => veto(partner)}><ThumbsDown size={15} aria-hidden="true" /> {vetoUsed[partner] ? "Veto used" : `${partner}'s veto`}</button>
              </div>
              <button className="btn btn-primary" onClick={() => onWatchNow(result.id)}>We're watching this</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
