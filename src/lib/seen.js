// Per-person "seen" status. Titles marked watched before this existed meant
// "we watched it together", so a legacy `watched` with no `seenBy` counts as
// seen by both.
export function seenByOf(m, names) {
  if (m.seenBy && Object.keys(m.seenBy).length > 0) return m.seenBy;
  if (m.watched) return Object.fromEntries(names.map((n) => [n, m.watchedAt || 1]));
  return {};
}

export function hasSeen(m, name, names) {
  return !!seenByOf(m, names)[name];
}

export function seenStatus(m, me, partner, names) {
  const s = seenByOf(m, names);
  if (s[me] && s[partner]) return "both";
  if (s[me]) return "me";
  if (s[partner]) return "partner";
  return "none";
}
