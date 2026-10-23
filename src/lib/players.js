export function validNames(names) {
  if (!Array.isArray(names) || names.length !== 2) throw new Error('Enter two player names.');
  const cleaned = names.map(n => String(n).trim());
  if (cleaned.some(n => !n || n.length > 40)) throw new Error('Names must be between 1 and 40 characters.');
  if (cleaned[0].toLowerCase() === cleaned[1].toLowerCase()) throw new Error('Use a different name for each player.');
  return cleaned;
}

// Capture both slots before assigning new keys, so swapping names is safe.
function renameMap(map = {}, oldNames, newNames) {
  const pairs = oldNames.map((name, i) => [newNames[i], map[name]]);
  const next = Object.fromEntries(Object.entries(map).filter(([name]) => !oldNames.includes(name) && !newNames.includes(name)));
  for (const [name, value] of pairs) if (value !== undefined) next[name] = value;
  return next;
}

export function renamedRoom(data, incomingSettings) {
  const oldNames = data.settings?.names || ['Player 1', 'Player 2'];
  const names = validNames(incomingSettings.names);
  const changed = oldNames.some((n, i) => n !== names[i]);
  // The settings form still addresses services by the old displayed names.
  const settings = { ...incomingSettings, names, services: changed ? renameMap(incomingSettings.services || data.settings?.services, oldNames, names) : incomingSettings.services || {} };
  if (!changed) return { settings };
  return {
    settings,
    swipes: renameMap(data.swipes, oldNames, names),
    movies: (data.movies || []).map(movie => {
      const next = { ...movie };
      for (const field of ['ratings', 'seenBy', 'hype']) if (movie[field]) next[field] = renameMap(movie[field], oldNames, names);
      if (oldNames.includes(movie.addedBy)) next.addedBy = names[oldNames.indexOf(movie.addedBy)];
      else if (movie.addedBy === oldNames.join(' + ')) next.addedBy = names.join(' + ');
      return next;
    }),
  };
}

export function samePosition(a, b) {
  if (!a || !b) return !a && !b;
  return a.season === b.season && a.episode === b.episode && !!a.completed === !!b.completed;
}
