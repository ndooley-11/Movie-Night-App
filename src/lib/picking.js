import { mediaTypesForFilter } from './api.js';

export function eligibleTitles(movies, { contentType, genres = [], unwatchedOnly = true, vetoed = [] } = {}) {
  const types = mediaTypesForFilter(contentType);
  return movies.filter(m => types.includes(m.mediaType || 'movie') &&
    (!unwatchedOnly || !m.watched) &&
    (!genres.length || genres.some(g => (m.genreNames || []).includes(g))) && !vetoed.includes(m.id));
}

export function chooseTitle(pool, random = Math.random) {
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
}

export function fanTitles(pool) {
  if (pool.length <= 5) return pool;
  return Array.from({ length: 5 }, (_, i) => pool[Math.floor(i * (pool.length - 1) / 4)]);
}
