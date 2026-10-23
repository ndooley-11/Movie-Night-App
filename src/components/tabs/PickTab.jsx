import { useState, useRef, useEffect, useCallback } from 'react';
import { Shuffle, ThumbsDown, Film, Info, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { Switch, PosterThumb } from '../shared.jsx';
import ActionSheet from '../ActionSheet.jsx';
import { eligibleTitles, chooseTitle, fanTitles } from '../../lib/picking.js';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function Poster({ movie, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [movie?.poster]);
  return movie?.poster && !failed ? <img src={movie.poster} alt={movie.title} className={className} onError={() => setFailed(true)} />
    : <div className={`poster-fallback ${className}`}><Film size={28} aria-hidden="true" /><span>{movie?.title || 'Your next favorite'}</span></div>;
}

export default function PickTab({ movies, me, partner, allGenres, contentType, tonight, onChooseTonight, onClearTonight, onFinishTonight, openDetails }) {
  const [filters, setFilters] = useState({ genres: [], unwatchedOnly: true });
  const [draft, setDraft] = useState(filters), [filterOpen, setFilterOpen] = useState(false);
  const [spinning, setSpinning] = useState(false), [display, setDisplay] = useState(null), [result, setResult] = useState(null);
  const [vetoed, setVetoed] = useState([]), [vetoUsed, setVetoUsed] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const interval = useRef(null), rolling = useRef(false), latest = useRef(null);
  const closeFilters = useCallback(() => setFilterOpen(false), []);
  const pool = eligibleTitles(movies, { contentType, ...filters, vetoed });
  latest.current = { movies, filters, contentType };
  const visibleResult = result && pool.find(m => m.id === result.id);
  const preview = fanTitles(pool);
  const tonightMovie = tonight && movies.find(m => m.id === tonight.movieId);
  const choiceCard = useRef(null);
  useEffect(() => { if (tonightMovie) choiceCard.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, [tonightMovie?.id]);
  const cancelRoll = useCallback(() => { clearInterval(interval.current); rolling.current = false; setSpinning(false); }, []);
  useEffect(() => () => clearInterval(interval.current), []);
  useEffect(() => { cancelRoll(); setDisplay(null); setResult(null); setVetoed([]); setVetoUsed({}); }, [contentType, cancelRoll]);

  function spin(excluded = vetoed) {
    if (rolling.current) return;
    const currentPool = () => eligibleTitles(latest.current.movies, { contentType: latest.current.contentType, ...latest.current.filters, vetoed: excluded });
    if (!currentPool().length) { setResult(null); setDisplay(null); return; }
    setError(''); setResult(null); rolling.current = true; setSpinning(true);
    function reveal() { const chosen = chooseTitle(currentPool()); cancelRoll(); setDisplay(chosen); setResult(chosen); }
    if (reducedMotion()) { reveal(); return; }
    let ticks = 0;
    interval.current = setInterval(() => { if (++ticks >= 13) reveal(); else setDisplay(chooseTitle(currentPool())); }, 95);
  }
  function veto(name) {
    if (rolling.current || vetoUsed[name] || !visibleResult) return;
    const excluded = [...vetoed, visibleResult.id];
    setVetoed(excluded); setVetoUsed(v => ({ ...v, [name]: true }));
    spin(excluded); // Do not reselect the vetoed title through stale state.
  }
  function applyFilters() { cancelRoll(); setFilters(draft); setResult(null); setDisplay(null); setVetoed([]); setVetoUsed({}); closeFilters(); }
  async function watch() {
    if (busy || !visibleResult) return;
    setBusy(true); setError('');
    try { await onChooseTonight(visibleResult.id); setResult(null); setDisplay(null); }
    catch { setError('Could not save that choice. Please try again.'); }
    finally { setBusy(false); }
  }
  async function changeTonight(action) {
    if (busy || !tonightMovie) return;
    setBusy(true); setError('');
    try { await action(tonightMovie.id); } catch (e) { setError(e.message || 'Could not update tonight’s choice.'); }
    finally { setBusy(false); }
  }
  return <section className="pick-page">
    {tonightMovie && <aside ref={choiceCard} className="tonight-choice"><p className="pick-eyebrow">Tonight’s choice · shared with {partner}</p><button className="media-row-main" onClick={() => openDetails(tonightMovie)}><PosterThumb poster={tonightMovie.poster} /><span className="media-row-title">{tonightMovie.title}</span></button><p className="hint">{tonightMovie.mediaType === 'tv' ? 'Ready to start? Track each person’s episodes in Watching.' : 'Saved for tonight. Mark it watched after you’ve seen it.'}</p><div className="feature-actions"><button className="btn btn-outline" disabled={busy} onClick={() => changeTonight(onFinishTonight)}>{tonightMovie.mediaType === 'tv' ? 'Start episode tracking' : 'Mark watched together'}</button><button className="link-btn" disabled={busy} onClick={() => changeTonight(onClearTonight)}>Clear choice</button></div></aside>}
    <div className={'pick-stage' + (visibleResult && !spinning ? ' has-result' : '')}>
      {!(visibleResult && !spinning) && <header className="pick-heading"><p className="pick-eyebrow">{me} + {partner}</p><h2>Let’s make it a movie night.</h2><p>Your shortlist. One great pick.</p></header>}
      {visibleResult && !spinning ? <div className="pick-winner">
        <p className="pick-eyebrow">Tonight’s pick</p>
        <div className="pick-poster-card">
          <Poster movie={visibleResult} className="pick-card-art" />
          <div className="pick-card-caption">
            <div role="status"><h3>{visibleResult.title}</h3><p className="meta-row">{[visibleResult.year, visibleResult.mediaType === 'tv' ? 'Show' : 'Movie', ...(visibleResult.genreNames || []).slice(0, 2)].filter(Boolean).join(' · ')}</p></div>
            <button className="pick-confirm" onClick={watch} disabled={busy}><Check size={17} aria-hidden="true" />{busy ? 'Saving…' : 'Choose for tonight'}</button>
          </div>
        </div>
        <div className="pick-card-toolbar">
          <button className="link-btn" onClick={() => spin()} disabled={!pool.length || busy}><Shuffle size={17} aria-hidden="true" />Pick again</button>
          <button className="link-btn" onClick={() => openDetails(visibleResult)} aria-label={`More info about ${visibleResult.title}`}><Info size={17} aria-hidden="true" />Details</button>
        </div>
      </div> : preview.length ? (
        // The fan itself is the control: tap the cards to pick.
        <button type="button" className={'poster-fan fan-button' + (spinning ? ' is-shuffling' : '')} onClick={() => spin()} disabled={spinning || busy} aria-busy={spinning}
          aria-label={spinning ? 'Picking a title' : `Pick a title for us from ${pool.length} in the running`}>
          {preview.map((m, i) => { const offset = i - (preview.length - 1) / 2; return <span key={m.id} className="fan-card" aria-hidden="true" style={{ '--fan-offset': offset, '--fan-depth': Math.abs(offset), zIndex: Math.round(10 - Math.abs(offset)) }}><Poster movie={spinning && i === Math.floor(preview.length / 2) && display ? display : m} className="fan-poster" /></span>; })}
          <span className="fan-cta" aria-hidden="true"><Shuffle size={18} />{spinning ? 'Picking…' : 'Tap the cards to pick'}</span>
        </button>
      ) : <div className="poster-fan" aria-label="No eligible titles">
          <div className="pick-empty"><Film size={44} aria-hidden="true" /><h3>{movies.length ? 'A different mood?' : 'Start your shortlist'}</h3><p>{movies.length ? 'No titles match. Refine your pick to see more options.' : 'Add titles in Suggest or match in Discover, then come back here.'}</p></div>
        </div>}
      <p className="hint pool-count" role="status">{spinning ? 'Shuffling your shortlist…' : `${pool.length} title${pool.length === 1 ? '' : 's'} in the running`}</p>
      {!visibleResult && !!pool.length && <p className="hint pick-helper">We’ll choose from your shared list.</p>}
      {visibleResult && !spinning && <details className="pick-vetoes"><summary>Not feeling this one? <ChevronDown size={14} aria-hidden="true" /></summary><p className="hint">One veto each. We’ll pick something else.</p><div className="veto-row"><button className="btn btn-outline" disabled={vetoUsed[me] || busy} onClick={() => veto(me)}><ThumbsDown size={15} aria-hidden="true" />{vetoUsed[me] ? 'Veto used' : 'Your veto'}</button><button className="btn btn-outline" disabled={vetoUsed[partner] || busy} onClick={() => veto(partner)}><ThumbsDown size={15} aria-hidden="true" />{vetoUsed[partner] ? 'Veto used' : `${partner}’s veto`}</button></div></details>}
      {!pool.length && vetoed.length > 0 && <button className="link-btn center" onClick={() => { setVetoed([]); setVetoUsed({}); }}>Reset vetoes</button>}
      {error && <p className="feature-error" role="alert">{error}</p>}
    </div>
    <div className="pick-refine"><button className="link-btn" onClick={() => { setDraft({ ...filters, genres: [...filters.genres] }); setFilterOpen(true); }} disabled={spinning || busy} aria-haspopup="dialog"><SlidersHorizontal size={18} /> Refine your pick <ChevronDown size={16} /></button><p className="hint">{filters.genres.length ? filters.genres.join(', ') : 'Any genre'} · {filters.unwatchedOnly ? 'Unwatched only' : 'Including watched'}</p></div>
    {filterOpen && <ActionSheet title="Refine your pick" onClose={closeFilters}>
      <p className="hint">Choose any matching genre. Changes apply when you’re ready.</p>
      <div className="chip-row" role="group" aria-label="Pick genres">{allGenres.map(g => <button key={g} className={'chip' + (draft.genres.includes(g) ? ' active' : '')} aria-pressed={draft.genres.includes(g)} onClick={() => setDraft(d => ({ ...d, genres: d.genres.includes(g) ? d.genres.filter(x => x !== g) : [...d.genres, g] }))}>{g}</button>)}</div>
      <div className="toggle-row"><Switch checked={draft.unwatchedOnly} onChange={v => setDraft(d => ({ ...d, unwatchedOnly: v }))} label="Unwatched only" /></div>
      <p className="hint" role="status">{eligibleTitles(movies, { contentType, ...draft }).length} matching titles</p>
      <div className="feature-actions"><button className="btn btn-outline" onClick={() => setDraft({ genres: [], unwatchedOnly: true })}>Reset filters</button><button className="btn btn-primary" onClick={applyFilters}>Apply filters</button></div>
    </ActionSheet>}
  </section>;
}
