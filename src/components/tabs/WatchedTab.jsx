import { useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, Star, Check } from 'lucide-react';
import { Stars, PosterThumb } from '../shared.jsx';
import { seenByOf, seenStatus } from '../../lib/seen.js';
import PersonalReview from '../PersonalReview.jsx';
import ShowProgress from '../ShowProgress.jsx';
import ActionSheet from '../ActionSheet.jsx';

export default function WatchedTab({ movies, me, partner, names, meIdx, settings, roomCode, saveReview, saveProgress, startShow, setRating, markSeen, markUnseen, openDetails, loadEpisodes }) {
  const activeShows = movies.filter(m => m.mediaType === 'tv' && m.watchingTogether && !m.watched);
  const availableShows = movies.filter(m => m.mediaType === 'tv' && !m.watched && !m.watchingTogether);
  const [view, setView] = useState(() => activeShows.length ? 'watching' : 'finished');
  const [filter, setFilter] = useState('all'), [sheet, setSheet] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [completionUndo, setCompletionUndo] = useState(null);
  useEffect(() => setCompletionUndo(null), [meIdx]);
  async function track(id, position, options = {}) {
    const before = movies.find(m => m.id === id)?.showProgress?.[`p${meIdx}`] || null;
    await saveProgress(id, position, options);
    setCompletionUndo('expectedPosition' in options ? null : { id, before, after: position });
  }
  const close = useCallback(() => setSheet(null), []);
  const selected = movies.find(m => m.id === sheet?.id);
  const watched = movies.filter(m => m.watched).sort((a,b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  const statusOf = m => seenStatus(m, me, partner, names);
  const list = filter === 'all' ? watched : watched.filter(m => statusOf(m) === filter);
  async function act(fn, nextView) {
    setBusy(true); setError('');
    try { await fn(); setSheet(null); if (nextView) setView(nextView); }
    catch (e) { setError(e.message || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  }
  const filters = [['all','All'],['both','Both watched'],['me','Only you'],['partner',`Only ${partner}`]];
  return <div className="watch-library">
    <div className="watch-tabs" role="group" aria-label="Watch library views">
      <button aria-pressed={view === 'watching'} className={view === 'watching' ? 'active' : ''} onClick={() => setView('watching')}>Watching <span>{activeShows.length}</span></button>
      <button aria-pressed={view === 'finished'} className={view === 'finished' ? 'active' : ''} onClick={() => setView('finished')}>Finished <span>{watched.length}</span></button>
    </div>
    {completionUndo && movies.find(m => m.id === completionUndo.id)?.watched && <div className="completion-undo" role="status"><p>Show moved to Finished.</p><button className="link-btn" disabled={busy} onClick={() => act(async () => { await saveProgress(completionUndo.id, completionUndo.before, { expectedPosition: completionUndo.after }); setCompletionUndo(null); }, 'watching')}>Undo completion</button></div>}
    {error && !sheet && <p className="feature-error" role="alert">{error}</p>}
    {view === 'watching' ? <section aria-label="Watching together">
      <h2 className="section-title">Keep the story going</h2><p className="hint watch-intro">See where you both are. Catch up at your own pace.</p>
      {activeShows.map(m => <ShowProgress key={m.id} movie={m} names={names} meIdx={meIdx} settings={settings} saveProgress={track} openDetails={openDetails} loadEpisodes={loadEpisodes} />)}
      {!activeShows.length && <p className="empty-state">Your next series starts here. Add a show in Suggest, then track it together.</p>}
      {!!availableShows.length && <details className="show-starters"><summary>Start a show from your list ({availableShows.length})</summary>{availableShows.map(m => <div className="show-start-row" key={m.id}><span>{m.title}</span><button className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(() => startShow(m.id), 'watching')}>Watch together</button></div>)}</details>}
    </section> : <section aria-label="Finished titles">
      <h2 className="section-title">Your movie nights</h2><p className="hint watch-intro">The stories you’ve shared, and what you thought.</p>
      {!!watched.length && <div className="chip-scroll" role="group" aria-label="Filter finished titles">{filters.map(([value,label]) => <button key={value} aria-pressed={filter === value} className={'chip' + (filter === value ? ' active' : '')} onClick={() => setFilter(value)}>{label}</button>)}</div>}
      {!list.length && <p className="empty-state">{watched.length ? 'No finished titles in this view yet.' : 'Finish something from your list and save your thoughts here.'}</p>}
      <ul className="list finished-list">{list.map(m => {
        const reviews = Object.entries(m.reviews || {}).filter(([,r]) => r?.text);
        const preview = reviews.find(([key,r]) => key === `p${meIdx}` || !r.spoiler);
        return <li className="finished-card" key={m.id}>
          <div className="finished-heading"><button className="media-row-main" onClick={() => openDetails(m)} aria-label={`${m.title}, show details`}><PosterThumb poster={m.poster} /><span className="media-row-body"><span className="media-row-title">{m.title}</span><span className="meta-row">{statusOf(m) === 'both' ? 'Both watched' : `Seen by ${statusOf(m) === 'me' ? 'you' : partner}`}{m.watchedAt ? ` · ${new Date(m.watchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : ''}</span></span></button><button className="icon-btn" aria-label={`More options for ${m.title}`} onClick={() => { setError(''); setSheet({id:m.id, type:'menu'}); }}><MoreHorizontal size={20} /></button></div>
          <div className="rating-summary">{names.map((name,i) => <span key={i}>{i === meIdx ? 'You' : name} <Star size={13} aria-hidden="true" /> <b>{m.ratings?.[name] ? `${m.ratings[name]}/5` : '—'}</b></span>)}</div>
          {preview && <p className="review-snippet">“{preview[1].text.slice(0,120)}{preview[1].text.length > 120 ? '…' : ''}”</p>}
          <button className="review-open" onClick={() => { setError(''); setSheet({id:m.id,type:'reviews'}); }}>{reviews.length ? `${reviews.length} review${reviews.length === 1 ? '' : 's'} · Ratings & notes` : 'Add your rating & review'} <span aria-hidden="true">→</span></button>
        </li>;
      })}</ul>
    </section>}
    {selected && <ActionSheet title={sheet.type === 'menu' ? selected.title : `Ratings & reviews · ${selected.title}`} onClose={close}>
      {sheet.type === 'menu' ? <div className="library-menu"><button className="btn btn-outline" onClick={() => setSheet({...sheet,type:'reviews'})}>Ratings & reviews</button>{selected.mediaType === 'tv' && <button className="btn btn-outline" disabled={busy} onClick={() => act(() => startShow(selected.id),'watching')}>Resume watching together</button>}<button className="btn btn-outline" disabled={busy} onClick={() => act(() => markUnseen(selected.id))}>Move back to your list</button><p className="hint">Moving it back keeps your ratings, reviews and episode positions.</p></div> : <>
        <div className="person-lines">{names.map((name,i) => <PersonLine key={i} name={name} isMe={i === meIdx} seen={!!seenByOf(selected,names)[name]} rating={selected.ratings?.[name] || 0} onRate={v => setRating(selected.id,v).catch(() => setError('Could not save your rating. Please try again.'))} onSeen={() => act(() => markSeen(selected.id,'me'))} />)}</div>
        <div className="movie-reviews">{names.map((name,i) => <PersonalReview key={i} movie={selected} index={i} name={name} isMe={i === meIdx} canReview={!!seenByOf(selected,names)[name]} saveReview={saveReview} roomCode={roomCode} />)}</div>
      </>}
      {error && <p className="feature-error" role="alert">{error}</p>}
    </ActionSheet>}
  </div>;
}
function PersonLine({ name, isMe, seen, rating, onRate, onSeen }) {
  return <div className={'person-line' + (seen ? '' : ' unseen')}><span className="person-name">{seen && <Check size={13} className="person-check" aria-hidden="true" />}{isMe ? 'You' : name}</span>{seen ? <Stars value={rating} onChange={onRate} readOnly={!isMe} size={17} label={isMe ? 'Your rating' : `${name}'s rating`} /> : isMe ? <button className="btn btn-outline btn-sm" onClick={onSeen}>I’ve seen it</button> : <span className="muted">Hasn’t seen it yet</span>}</div>;
}
