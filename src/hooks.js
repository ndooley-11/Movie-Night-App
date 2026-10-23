import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, updateDoc, runTransaction, FieldPath } from "firebase/firestore";
import { db } from "./firebase.js";
import { renamedRoom } from './lib/players.js';
import { tonightChoice, moviePatch } from './lib/roomUpdates.js';

export const DEFAULT_SETTINGS = {
  names: ["Player 1", "Player 2"],
  apiKey: "",
  traktClientId: "",
  omdbKey: "",
  region: "US",
  services: { "Player 1": [], "Player 2": [] },
  contentType: "both", // 'movies' | 'shows' | 'both'
};

// Movie swipes predate media types and were keyed by bare tmdbId; keeping
// that format for movies means existing rooms don't need a migration.
export function swipeKey(mediaType, tmdbId) {
  return mediaType === "tv" ? `tv:${tmdbId}` : String(tmdbId);
}

export function useRoom(roomCode) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [movies, setMovies] = useState([]);
  const [swipes, setSwipes] = useState({});
  const [tonight, setTonight] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomCode) return;
    setReady(false);
    const roomRef = doc(db, "movienight", roomCode);
    const unsub = onSnapshot(
      roomRef,
      (snap) => {
        const data = snap.data() || {};
        setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
        setMovies(data.movies || []);
        setSwipes(data.swipes || {});
        setTonight(data.tonight || null);
        setReady(true);
      },
      (err) => setError(err.message)
    );
    return () => unsub();
  }, [roomCode]);

  const saveSettings = useCallback(async (next) => {
    const ref = doc(db, 'movienight', roomCode);
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      const patch = renamedRoom(snap.data() || {}, next);
      if (snap.exists()) transaction.update(ref, patch);
      else transaction.set(ref, patch);
    });
  }, [roomCode]);

  const saveMovies = useCallback(async (next) => {
    const ref = doc(db, "movienight", roomCode);
    // Compute against the server's latest array on every retry. Two devices
    // updating different reviews/progress must not overwrite one another.
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      const current = snap.data()?.movies || [];
      const movies = typeof next === 'function' ? next(current) : next;
      transaction.set(ref, moviePatch(snap.data() || {}, movies), { merge: true });
    });
  }, [roomCode]);

  const setSwipe = useCallback(async (name, mediaType, tmdbId, value) => {
    const key = swipeKey(mediaType, tmdbId);
    await updateDoc(doc(db, "movienight", roomCode), new FieldPath('swipes', name, key), value);
  }, [roomCode]);

  const chooseTonight = useCallback(async (movieId, playerIndex) => {
    const ref = doc(db, 'movienight', roomCode);
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      transaction.update(ref, { tonight: tonightChoice(snap.data()?.movies || [], movieId, playerIndex) });
    });
  }, [roomCode]);
  const clearTonight = useCallback(async movieId => {
    const ref = doc(db, 'movienight', roomCode);
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(ref);
      if (snap.data()?.tonight?.movieId === movieId) transaction.update(ref, { tonight: null });
    });
  }, [roomCode]);

  return { settings, movies, swipes, tonight, saveSettings, saveMovies, setSwipe, chooseTonight, clearTonight, ready, error };
}

export function usePersonal(key, fallback) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  });

  // Re-read when the key itself changes (e.g. switching rooms mid-session) —
  // the lazy useState initializer above only ever runs once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setVal(raw ? JSON.parse(raw) : fallback);
    } catch (e) { setVal(fallback); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useCallback((next) => {
    setVal(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) { /* storage may be unavailable, keep running in-memory */ }
  }, [key]);
  return [val, save];
}
