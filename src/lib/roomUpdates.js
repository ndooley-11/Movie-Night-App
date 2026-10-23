// Pure room updates are shared by transactional writes and regression checks.
export function tonightChoice(movies, movieId, playerIndex, now = Date.now()) {
  if (!movies.some(m => m.id === movieId)) throw new Error('That title is no longer available in your list.');
  return { movieId, chosenBySlot: playerIndex, chosenAt: now };
}

export function moviePatch(data, movies) {
  const selected = data.tonight;
  const chosen = selected && movies.find(m => m.id === selected.movieId);
  const previous = selected && (data.movies || []).find(m => m.id === selected.movieId);
  const finished = chosen && (!previous?.watched && chosen.watched);
  const started = chosen && (!previous?.watchingTogether && chosen.watchingTogether);
  return { movies, ...(selected && (!chosen || finished || started) ? { tonight: null } : {}) };
}
