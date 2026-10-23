// New personal fields use stable player slots, so renaming a player does not
// orphan their notes or episode position. This is not authentication.
export function playerKey(index) {
  if (!Number.isInteger(index) || index < 0 || index > 1) throw new Error('Choose your player first.');
  return `p${index}`;
}

export function withReview(movie, index, review, now = Date.now()) {
  const key = playerKey(index);
  const reviews = { ...movie.reviews };
  if (review === null) delete reviews[key];
  else {
    const text = review.text.trim();
    if (!text || text.length > 5000) throw new Error('Write a review between 1 and 5,000 characters.');
    reviews[key] = { text, spoiler: !!review.spoiler, updatedAt: now };
  }
  return { ...movie, reviews };
}

export function withProgress(movie, index, progress, now = Date.now()) {
  const key = playerKey(index);
  if (movie.mediaType !== 'tv') throw new Error('Episode progress is only for shows.');
  if (progress !== null && (!Number.isInteger(progress.season) || progress.season < 0 || progress.season > 1000 ||
    !Number.isInteger(progress.episode) || progress.episode < 1 || progress.episode > 10000)) {
    throw new Error('Enter a valid season and completed episode.');
  }
  const showProgress = { ...movie.showProgress, [key]: progress ? { ...progress, completed: !!progress.completed, updatedAt: now } : null };
  return { ...movie, showProgress };
}

export function episodeLabel(position) {
  return position ? `${position.season === 0 ? 'Special' : `S${position.season}`} E${position.episode}` : 'Not started';
}

export function allFinishedTogether(movie, count = 2) {
  const positions = Array.from({ length: count }, (_, i) => movie.showProgress?.[`p${i}`]);
  const first = positions[0];
  // A previous-season completion must not count as finishing a new season.
  return !!first && positions.every(p => p?.completed && p.season === first.season && p.episode === first.episode);
}

export function regularEpisodes(metadata) {
  return (metadata?.episodes || []).filter(e => e.season > 0).sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export function released(episode, today = new Date().toISOString().slice(0, 10)) {
  return !!episode.airDate && episode.airDate <= today;
}

function positionIndex(position, episodes) {
  return position ? episodes.findIndex(e => e.season === position.season && e.episode === position.episode) : -1;
}

export function episodeGap(mine, theirs, metadata) {
  if (!metadata?.complete || mine?.season === 0 || theirs?.season === 0) return null;
  const episodes = regularEpisodes(metadata);
  if (!episodes.length) return null;
  const a = positionIndex(mine, episodes), b = positionIndex(theirs, episodes);
  if ((mine && a < 0) || (theirs && b < 0)) return null;
  return b - a; // positive: I need to catch up
}

export function nextEpisode(position, metadata, today) {
  if (!metadata?.complete || position?.season === 0) return null;
  const episodes = regularEpisodes(metadata);
  const i = positionIndex(position, episodes);
  if (position && i < 0) return null;
  const next = episodes[i + 1];
  return next && released(next, today) ? next : null;
}

export function caughtUpWithReleased(position, metadata, today) {
  if (!metadata?.complete || !position || position.season === 0) return false;
  const episodes = regularEpisodes(metadata);
  const available = episodes.filter(e => released(e, today));
  return available.length > 0 && positionIndex(position, episodes) >= positionIndex(available.at(-1), episodes);
}
