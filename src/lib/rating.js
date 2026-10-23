// Ratings run 0.5–5 in half-star steps; 0 means "not rated".
export const RATING_STEP = 0.5;

/** Rating for a pointer at `x` across a star row `width` px wide: left half of a star is a half. */
export function ratingAt(x, width) {
  if (!(width > 0)) return 0;
  const raw = Math.ceil((Math.min(Math.max(x, 0), width) / width) * 10) / 2;
  return Math.min(5, Math.max(RATING_STEP, raw));
}

export function stepRating(value, delta) {
  const next = Math.round(((value || 0) + delta) * 2) / 2;
  return Math.min(5, Math.max(0, next));
}

/** How full star `n` (1–5) is for a rating: 1, 0.5 or 0. */
export function starFill(value, n) {
  if (value >= n) return 1;
  if (value >= n - 0.5) return 0.5;
  return 0;
}

export function ratingText(value) {
  return value ? `${value % 1 ? value.toFixed(1) : value} of 5 stars` : "Not rated";
}
