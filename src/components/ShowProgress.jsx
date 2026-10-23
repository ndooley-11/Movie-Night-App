import { useState, useEffect, useCallback } from 'react';
import { Plus, Tv, Check, Pencil } from 'lucide-react';
import { PosterThumb } from './shared.jsx';
import ActionSheet from './ActionSheet.jsx';
import { fetchShowEpisodes } from '../lib/api.js';
import { episodeLabel, episodeGap, nextEpisode, caughtUpWithReleased, released } from '../lib/personalMedia.js';

const cached = new Map();
function loadMetadata(id, apiKey) {
  const key = `${id}:${apiKey}`;
  const entry = cached.get(key);
  if (entry && Date.now() - entry.time < 15 * 60 * 1000) return entry.promise;
  const promise = fetchShowEpisodes(id, apiKey).catch(e => { cached.delete(key); throw e; });
  cached.set(key, { time: Date.now(), promise });
  return promise;
}

export default function ShowProgress({ movie, names, meIdx, settings, saveProgress, openDetails, loadEpisodes = loadMetadata }) {
  const [metadata, setMetadata] = useState(null), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const [season, setSeason] = useState('1'), [episode, setEpisode] = useState('1'), [notStarted, setNotStarted] = useState(false);
  const [undo, setUndo] = useState(null);
  const close = useCallback(() => setEditing(false), []);
  useEffect(() => { setEditing(false); setMessage(''); setUndo(null); }, [meIdx]);
  const mine = movie.showProgress?.[`p${meIdx}`] || null;
  const otherIndex = meIdx === 0 ? 1 : 0;
  const theirs = movie.showProgress?.[`p${otherIndex}`] || null;
  useEffect(() => {
    let active = true;
    setMetadata(null); setLoadError('');
    if (!movie.tmdbId || !settings.apiKey) { setLoading(false); return; }
    setLoading(true);
    loadEpisodes(movie.tmdbId, settings.apiKey).then(data => { if (active) setMetadata(data); })
      .catch(() => { if (active) setLoadError('Episode details are unavailable. You can still enter your position manually.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [movie.tmdbId, settings.apiKey, retry, loadEpisodes]);
  const gap = episodeGap(mine, theirs, metadata);
  const next = nextEpisode(mine, metadata);
  const availableSeasons = [...new Set((metadata?.episodes || []).map(e => e.season))].sort((a, b) => a - b);
  const options = (metadata?.episodes || []).filter(e => e.season === Number(season));
  const selected = options.find(e => e.episode === Number(episode));
  const knownFuture = selected?.airDate && !released(selected);
  const useMetadataSelects = availableSeasons.length > 0 && metadata?.complete;
  const canComplete = !metadata?.complete || !metadata.episodes.some(e => e.season > 0 && released(e)) || caughtUpWithReleased({ season: Number(season), episode: Number(episode) }, metadata);
  async function update(value) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await saveProgress(movie.id, value); setUndo({ before: mine, after: value }); setEditing(false); setMessage('Your progress is saved.'); }
    catch (e) { setMessage(e.message || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  }
  async function undoUpdate() {
    if (!undo || busy) return;
    setBusy(true);
    try { await saveProgress(movie.id, undo.before, { expectedPosition: undo.after }); setUndo(null); setMessage('Progress restored.'); }
    catch (e) { setMessage(e.message || 'Could not undo. Please try again.'); }
    finally { setBusy(false); }
  }
  function edit() {
    const fallback = next || (metadata?.episodes || []).find(e => e.season > 0 && released(e));
    setSeason(String(mine?.season ?? fallback?.season ?? 1)); setEpisode(String(mine?.episode ?? fallback?.episode ?? 1)); setNotStarted(!mine); setMessage(''); setEditing(true);
  }
  const summary = gap === null ? 'Compare your latest completed episodes below.' : gap === 0 ? (mine || theirs ? 'You’re caught up with each other.' : 'Ready for your first episode together.') : gap > 0 ? `You’re ${gap} episode${gap === 1 ? '' : 's'} behind ${names[otherIndex]}.` : `You’re ${-gap} episode${gap === -1 ? '' : 's'} ahead of ${names[otherIndex]}.`;
  return <article className="show-tracker">
    <button className="media-row-main" onClick={() => openDetails(movie)}><PosterThumb poster={movie.poster} /><span className="media-row-body"><span className="media-row-title">{movie.title}</span><span className="meta-row">Watching together</span></span></button>
    <p className="show-summary" role="status">{summary}</p>
    <div className="episode-people">{names.map((name, i) => {
      const p = movie.showProgress?.[`p${i}`];
      const ownEpisode = i === meIdx && p ? metadata?.episodes.find(e => e.season === p.season && e.episode === p.episode) : null;
      return <div className="episode-person" key={i}><span className="person-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><div><b>{i === meIdx ? 'You' : name}</b><span>{episodeLabel(p)}{p?.completed ? ' · Finished' : ''}</span>{ownEpisode?.name && <small>{ownEpisode.name}</small>}</div></div>;
    })}</div>
    {caughtUpWithReleased(mine, metadata) && <p className="hint"><Check size={13} aria-hidden="true" /> Caught up with all released episodes{metadata?.status === 'Ended' ? ' · Series ended' : ''}.</p>}
    {loading && <p className="hint" role="status">Loading episode information…</p>}
    {(loadError || !movie.tmdbId || !settings.apiKey || (metadata && !metadata.complete)) && <p className="hint">{loadError || 'Full episode metadata is unavailable. Exact gaps and next-episode shortcuts may be unavailable.'} {loadError && <button className="link-btn" onClick={() => setRetry(v => v + 1)}>Retry</button>}</p>}
    <div className="feature-actions"><button className="btn btn-outline" onClick={edit} disabled={busy}><Pencil size={14} /> Update my progress</button>{next && !mine?.completed && <button className="btn btn-primary" disabled={busy} onClick={() => update({ season: next.season, episode: next.episode, completed: false })}><Plus size={15} /> Mark {episodeLabel(next)} watched</button>}</div>
    {mine?.completed && <button className="link-btn" disabled={busy} onClick={() => update({ ...mine, completed: false })}>Resume watching</button>}
    <p className="hint" role={message.includes('Could') ? 'alert' : 'status'}>{message}</p>
    {undo && <button className="link-btn" onClick={undoUpdate} disabled={busy}>Undo progress update</button>}
    {editing && <ActionSheet title={`Your progress · ${movie.title}`} onClose={close}>
      <p className="hint">Set the latest episode you’ve finished. This changes only your position, not {names[otherIndex]}’s.</p>
      <label className="check-label"><input type="checkbox" checked={notStarted} disabled={busy} onChange={e => setNotStarted(e.target.checked)} /> I haven’t started yet</label>
      {!notStarted && <div className="episode-selectors"><label className="field-label">Season{useMetadataSelects ? <select className="input" value={season} disabled={busy} onChange={e => { setSeason(e.target.value); setEpisode(String(metadata.episodes.find(x => x.season === Number(e.target.value))?.episode || 1)); }}>{availableSeasons.map(s => <option key={s} value={s}>{s === 0 ? 'Specials' : `Season ${s}`}</option>)}</select> : <input className="input" type="number" min="0" max="1000" value={season} disabled={busy} onChange={e => setSeason(e.target.value)} />}</label><label className="field-label">Completed episode{useMetadataSelects ? <select className="input" value={episode} disabled={busy} onChange={e => setEpisode(e.target.value)}>{options.map(e => <option key={e.episode} value={e.episode} disabled={!!e.airDate && !released(e)}>Episode {e.episode}{e.airDate && !released(e) ? ' · Unreleased' : !e.airDate ? ' · Air date unknown' : ''}</option>)}</select> : <input className="input" type="number" min="1" max="10000" value={episode} disabled={busy} onChange={e => setEpisode(e.target.value)} />}</label></div>}
      {!notStarted && (!metadata || !selected?.airDate) && <p className="hint">Air dates cannot be verified for this position. Only select an episode you’ve already watched.</p>}
      {Number(season) === 0 && !notStarted && <p className="hint">Specials are tracked separately and excluded from episode-gap calculations.</p>}
      {message && <p className="feature-error" role="alert">{message}</p>}
      <div className="feature-actions"><button className="btn btn-outline" disabled={busy} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || knownFuture || (!notStarted && (!season || !episode))} onClick={() => update(notStarted ? null : { season: Number(season), episode: Number(episode), completed: false })}>{busy ? 'Saving…' : 'Save progress'}</button></div>
      {!notStarted && <button className="link-btn finish-show" disabled={busy || knownFuture || !season || !episode || !canComplete} onClick={() => update({ season: Number(season), episode: Number(episode), completed: true })}><Check size={15} /> I’ve completed this show</button>}
      {!notStarted && !canComplete && <p className="hint">Choose the latest released regular episode to mark this show completed.</p>}
      <p className="hint">Completing a show is separate from finishing an episode. It moves to completed history after both people finish. You can resume it later if a new season arrives.</p>
    </ActionSheet>}
  </article>;
}
