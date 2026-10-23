import { withReview } from "./personalMedia.js";

const sameTitle = (m, item) => (m.mediaType || "movie") === (item.mediaType || "movie") && String(m.tmdbId) === String(item.tmdbId);

/**
 * "Seen it" from Discover: record that this person has watched a title, with
 * an optional half-star rating and note. Goes on the shared list as watched by
 * them only, the same as "Just me" from the list. If the title is already on
 * the list (say the partner added it meanwhile) that entry is updated instead.
 */
export function withSeenIt(movies, item, { me, meIdx, rating = 0, text = "", spoiler = false, providers, id, now = Date.now() }) {
  if (rating && (rating < 0.5 || rating > 5 || (rating * 2) % 1)) throw new Error("Ratings go from half a star to 5 stars.");
  const apply = (m) => {
    let next = {
      ...m,
      seenBy: { ...(m.seenBy || {}), [me]: m.seenBy?.[me] || now },
      watched: true,
      watchedAt: m.watchedAt || now,
      ratings: rating ? { ...(m.ratings || {}), [me]: rating } : m.ratings || {},
    };
    if (text.trim()) next = withReview(next, meIdx, { text, spoiler }, now);
    return next;
  };
  if (movies.some((m) => sameTitle(m, item))) return movies.map((m) => (sameTitle(m, item) ? apply(m) : m));
  const entry = {
    id, tmdbId: item.tmdbId, mediaType: item.mediaType || "movie", title: item.title, year: item.year || "",
    poster: item.poster || null, genreNames: item.genreNames || [], originalLanguage: item.originalLanguage || "",
    overview: item.overview || "", addedBy: me, addedAt: now, hype: {}, reviews: {},
    providers: providers || { flatrate: [], rent: [], buy: [], free: [] },
  };
  return [apply(entry), ...movies];
}
