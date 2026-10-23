import { useState, useEffect } from 'react';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';

export default function PersonalReview({ movie, index, name, isMe, canReview, saveReview, roomCode }) {
  const review = movie.reviews?.[`p${index}`];
  const [editing, setEditing] = useState(false), [expanded, setExpanded] = useState(false), [revealed, setRevealed] = useState(false);
  const [text, setText] = useState(''), [spoiler, setSpoiler] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [deletedReview, setDeletedReview] = useState(null);
  const draftKey = `mn-review-draft:${roomCode}:${movie.id}:p${index}`;
  useEffect(() => { setRevealed(false); setExpanded(false); }, [review?.updatedAt]);
  useEffect(() => { if (!isMe) { setEditing(false); setDeletedReview(null); } }, [isMe]);
  function edit() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch { /* private browsing */ }
    setText(draft?.text ?? review?.text ?? ''); setSpoiler(draft?.spoiler ?? review?.spoiler ?? false); setMessage(''); setEditing(true);
  }
  function change(nextText, nextSpoiler) {
    setText(nextText); setSpoiler(nextSpoiler);
    try { localStorage.setItem(draftKey, JSON.stringify({ text: nextText, spoiler: nextSpoiler })); } catch { /* keep draft in memory */ }
  }
  async function save(remove = false) {
    if (!isMe || busy) return;
    setBusy(true); setMessage('');
    try {
      await saveReview(movie.id, remove ? null : { text, spoiler });
      setDeletedReview(remove ? review : null);
      try { localStorage.removeItem(draftKey); } catch { /* optional draft */ }
      setEditing(false); setMessage(remove ? 'Review deleted.' : 'Review saved.');
    } catch { setMessage('Could not save. Your draft is still here; please try again.'); }
    finally { setBusy(false); }
  }
  async function undoDelete() {
    if (!deletedReview || busy || !isMe) return;
    setBusy(true);
    try { await saveReview(movie.id, deletedReview, { onlyIfAbsent: true }); setDeletedReview(null); setMessage('Review restored.'); }
    catch (e) { setMessage(e.message || 'Could not restore the review. Please try again.'); }
    finally { setBusy(false); }
  }
  const hiddenSpoiler = review?.spoiler && !isMe && !revealed;
  return <div className="personal-review">
    <div className="review-byline"><span><MessageSquare size={14} aria-hidden="true" /> {isMe ? 'Your review' : `${name}’s review`}</span>{review?.spoiler && <span className="review-spoiler-label">Spoilers</span>}</div>
    {editing ? <form onSubmit={e => { e.preventDefault(); save(); }}>
      <label className="field-label">Your thoughts after watching<textarea className="input review-input" value={text} maxLength={5000} rows={4} onChange={e => change(e.target.value, spoiler)} placeholder="What stayed with you?" disabled={busy} /></label>
      <div className="review-editor-meta"><label><input type="checkbox" checked={spoiler} onChange={e => change(text, e.target.checked)} disabled={busy} /> Contains spoilers</label><small>{text.length}/5,000</small></div>
      <div className="feature-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save review'}</button></div>
    </form> : <>
      {review ? <>
        {hiddenSpoiler ? <button className="btn btn-outline btn-sm" onClick={() => setRevealed(true)}>Reveal spoiler review</button> : <p className="review-copy">{expanded || review.text.length <= 180 ? review.text : `${review.text.slice(0, 180)}…`}</p>}
        {!hiddenSpoiler && review.text.length > 180 && <button className="link-btn" onClick={() => setExpanded(v => !v)}>{expanded ? 'Show less' : 'Read full review'}</button>}
        <small className="muted">Updated {new Date(review.updatedAt).toLocaleDateString()}</small>
        {isMe && <div className="review-tools"><button className="link-btn" onClick={edit} disabled={busy}><Pencil size={13} /> Edit</button><button className="link-btn" onClick={() => save(true)} disabled={busy}><Trash2 size={13} /> {busy ? 'Deleting…' : 'Delete'}</button></div>}
      </> : isMe && canReview ? <button className="link-btn" onClick={edit}>Add your review</button> : <p className="hint">{isMe ? 'Mark it seen to add your review.' : 'No review yet.'}</p>}
    </>}
    <p className="hint" role={message.startsWith('Could') ? 'alert' : 'status'}>{message}</p>
    {deletedReview && !review && isMe && <button className="link-btn" onClick={undoDelete} disabled={busy}>Undo delete</button>}
  </div>;
}
