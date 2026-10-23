import { Heart, Award } from "lucide-react";

export default function StatsTab({ movies, names }) {
  const watched = movies.filter((m) => m.watched);
  const allRatings = watched.flatMap((m) => Object.values(m.ratings || {})).filter(Boolean);
  const avg = allRatings.length ? (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1) : "—";
  const counts = {};
  movies.forEach((m) => { counts[m.addedBy] = (counts[m.addedBy] || 0) + 1; });
  const genreCounts = {};
  movies.forEach((m) => (m.genreNames || []).forEach((g) => { genreCounts[g] = (genreCounts[g] || 0) + 1; }));
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
  const showCount = movies.filter((m) => m.mediaType === "tv").length;
  const movieCount = movies.length - showCount;
  const mostHyped = [...movies].filter((m) => !m.watched).sort((a, b) => Object.values(b.hype || {}).filter(Boolean).length - Object.values(a.hype || {}).filter(Boolean).length)[0];
  const topRated = [...watched].sort((a, b) => {
    const ra = Object.values(a.ratings || {}); const rb = Object.values(b.ratings || {});
    const aa = ra.length ? ra.reduce((x, y) => x + y, 0) / ra.length : 0;
    const bb = rb.length ? rb.reduce((x, y) => x + y, 0) / rb.length : 0;
    return bb - aa;
  })[0];

  return (
    <div>
      <h2 className="section-title">The numbers</h2>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-num">{movies.length}</div><div className="stat-label">Suggested</div></div>
        <div className="stat-card"><div className="stat-num">{watched.length}</div><div className="stat-label">Watched</div></div>
        <div className="stat-card"><div className="stat-num">{avg}</div><div className="stat-label">Avg rating</div></div>
        <div className="stat-card"><div className="stat-num">{topGenre ? topGenre[0] : "—"}</div><div className="stat-label">Top genre</div></div>
      </div>
      <div className="meta-row" style={{ marginTop: 10 }}>{movieCount} movie{movieCount !== 1 ? "s" : ""} · {showCount} show{showCount !== 1 ? "s" : ""}</div>
      {names.map((n) => (<div key={n} className="meta-row" style={{ marginTop: 6 }}>{n} has suggested {counts[n] || 0} title{(counts[n] || 0) !== 1 ? "s" : ""}</div>))}
      {mostHyped && Object.values(mostHyped.hype || {}).some(Boolean) && (
        <div className="highlight-box"><Heart size={14} color="var(--like)" /> Most hyped pick still unwatched: <b>{mostHyped.title}</b></div>
      )}
      {topRated && allRatings.length > 0 && (
        <div className="highlight-box"><Award size={14} color="var(--gold)" /> Highest rated so far: <b>{topRated.title}</b></div>
      )}
    </div>
  );
}
