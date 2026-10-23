import { useState } from "react";
import { Stars, PosterThumb } from "./shared.jsx";
import ActionSheet from "./ActionSheet.jsx";
import { ratingText } from "../lib/rating.js";

const HINTS = ["Tap a star. Left half for a half star.", "Rough", "Not for me", "Meh", "Okay", "Decent", "Good", "Really good", "Great", "Loved it", "All-time favorite"];

// Quick "I've already seen this" from Discover: a half-star rating and an
// optional note, then it lands in Watched as seen by this person only.
export default function SeenItSheet({ item, partner, onSave, onClose }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave({ rating, text, spoiler }); }
    catch (e) { setError(e.message || "Could not save. Please try again."); setBusy(false); }
  }

  return (
    <ActionSheet title="You've seen it" onClose={onClose}>
      <div className="seen-head">
        <PosterThumb poster={item.poster} size="sm" />
        <div>
          <p className="seen-title">{item.title}</p>
          <p className="meta-row">{[item.year, item.mediaType === "tv" ? "Show" : "Movie"].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div className="seen-rating">
        <Stars value={rating} onChange={setRating} size={30} label="Your rating" />
        <p className="seen-rating-text" aria-hidden="true">
          {rating ? <><b>{ratingText(rating).replace(" of 5 stars", "")}</b> / 5 · {HINTS[rating * 2]}</> : HINTS[0]}
        </p>
      </div>

      <label className="field">
        <span className="field-label">Any thoughts? <span className="muted">optional</span></span>
        <textarea className="input review-input" rows={3} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What stayed with you?" disabled={busy} enterKeyHint="done" />
      </label>
      {text.trim() && (
        <label className="seen-spoiler">
          <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} disabled={busy} />
          Contains spoilers <span className="muted">(hidden from {partner} until they tap to reveal)</span>
        </label>
      )}

      {error && <p className="feature-error" role="alert">{error}</p>}
      <div className="feature-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : rating ? "Save to Watched" : "Save without rating"}
        </button>
      </div>
      <p className="hint">It goes to Watched, marked as seen by you only.</p>
    </ActionSheet>
  );
}
