import { Star } from "lucide-react";
import { PosterThumb } from "../shared.jsx";
import { seenStatus } from "../../lib/seen.js";

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function StatsTab({ movies, names, me, partner }) {
  const watched = movies.filter((m) => m.watched);
  const waiting = movies.length - watched.length;
  const statuses = watched.map((m) => seenStatus(m, me, partner, names));
  const together = statuses.filter((s) => s === "both").length;
  const onlyMe = statuses.filter((s) => s === "me").length;
  const onlyPartner = statuses.filter((s) => s === "partner").length;
  const allRatings = watched.flatMap((m) => Object.values(m.ratings || {})).filter(Boolean);
  const shows = movies.filter((m) => m.mediaType === "tv").length;

  const genreCounts = {};
  movies.forEach((m) => (m.genreNames || []).forEach((g) => { genreCounts[g] = (genreCounts[g] || 0) + 1; }));
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  const added = { [names[0]]: 0, [names[1]]: 0, matches: 0 };
  movies.forEach((m) => {
    if ((m.addedBy || "").includes(" + ")) added.matches++;
    else if (m.addedBy in added) added[m.addedBy]++;
  });

  const rated = watched
    .map((m) => ({ m, score: avg(Object.values(m.ratings || {}).filter(Boolean)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const topRated = rated[0];
  const mostHyped = movies
    .filter((m) => !m.watched)
    .map((m) => ({ m, fans: Object.entries(m.hype || {}).filter(([, v]) => v).map(([n]) => n) }))
    .filter((x) => x.fans.length > 0)
    .sort((a, b) => b.fans.length - a.fans.length)[0];

  if (movies.length === 0) {
    return (
      <div>
        <h2 className="section-title">Stats</h2>
        <div className="empty-state">Your numbers show up here once you start adding and watching things together.</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Your list</h2>
      <dl className="stat-list">
        <Row label="Waiting to watch" value={waiting} />
        <Row label="Watched together" value={together} />
        {onlyMe > 0 && <Row label="Only you've seen" value={onlyMe} />}
        {onlyPartner > 0 && <Row label={`Only ${partner} has seen`} value={onlyPartner} />}
        <Row label="Movies · Shows" value={`${movies.length - shows} · ${shows}`} />
        {allRatings.length > 0 && <Row label="Average rating" value={<><Star size={14} fill="var(--gold)" color="var(--gold)" aria-hidden="true" /> {avg(allRatings).toFixed(1)}</>} />}
        {topGenres.length > 0 && <Row label="Favorite genres" value={topGenres.join(", ")} />}
      </dl>

      <h2 className="section-title">Who's bringing the picks</h2>
      <dl className="stat-list">
        <Row label={`${names[0]} suggested`} value={added[names[0]]} />
        <Row label={`${names[1]} suggested`} value={added[names[1]]} />
        <Row label="Matched in Discover" value={added.matches} />
      </dl>

      {(topRated || mostHyped) && <h2 className="section-title">Highlights</h2>}
      {topRated && (
        <div className="highlight">
          <PosterThumb poster={topRated.m.poster} size="sm" />
          <div>
            <p className="highlight-label">Highest rated</p>
            <p className="highlight-title">{topRated.m.title}</p>
            <p className="meta-row"><Star size={12} fill="var(--gold)" color="var(--gold)" aria-hidden="true" /> {topRated.score.toFixed(1)} average</p>
          </div>
        </div>
      )}
      {mostHyped && (
        <div className="highlight">
          <PosterThumb poster={mostHyped.m.poster} size="sm" />
          <div>
            <p className="highlight-label">Most anticipated</p>
            <p className="highlight-title">{mostHyped.m.title}</p>
            <p className="meta-row">{mostHyped.fans.length > 1 ? "You're both excited" : `${mostHyped.fans[0] === me ? "You're" : `${mostHyped.fans[0]} is`} excited`}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="stat-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
