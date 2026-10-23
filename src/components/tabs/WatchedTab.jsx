import { RefreshCw } from "lucide-react";
import { Stars, PosterThumb, MediaTypeTag } from "../shared.jsx";

export default function WatchedTab({ movies, me, partner, setRating, markWatched }) {
  const list = movies.filter((m) => m.watched).sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  return (
    <div>
      <h2 className="section-title">Watched ({list.length})</h2>
      {list.length === 0 && <div className="empty-state">Nothing watched yet — pick something and enjoy the show.</div>}
      <div className="list">
        {list.map((m) => (
          <div key={m.id} className="media-row">
            <PosterThumb poster={m.poster} />
            <div className="media-row-body">
              <div className="media-row-title">{m.title} {m.year && <span className="muted">· {m.year}</span>} <MediaTypeTag mediaType={m.mediaType || "movie"} /></div>
              <div className="meta-row">{m.watchedAt ? new Date(m.watchedAt).toLocaleDateString() : ""}</div>
              <div className="rate-line"><span>{me}</span><Stars value={m.ratings?.[me] || 0} onChange={(v) => setRating(m.id, v)} size={13} /></div>
              <div className="rate-line"><span>{partner}</span><Stars value={m.ratings?.[partner] || 0} onChange={() => {}} size={13} /></div>
            </div>
            <div className="media-row-actions">
              <button className="icon-btn" onClick={() => markWatched(m.id, false)} aria-label="Move back to list"><RefreshCw size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
