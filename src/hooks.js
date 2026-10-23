import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export const DEFAULT_SETTINGS = {
  names: ["Player 1", "Player 2"],
  apiKey: "",
  traktClientId: "",
  region: "US",
  services: { "Player 1": [], "Player 2": [] },
  contentType: "both", // 'movies' | 'shows' | 'both'
  language: "any", // 'any' | 'en' | 'non-en'
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
        setReady(true);
      },
      (err) => setError(err.message)
    );
    return () => unsub();
  }, [roomCode]);

  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    await setDoc(doc(db, "movienight", roomCode), { settings: next }, { merge: true });
  }, [roomCode]);

  const saveMovies = useCallback(async (next) => {
    setMovies(next);
    await setDoc(doc(db, "movienight", roomCode), { movies: next }, { merge: true });
  }, [roomCode]);

  const setSwipe = useCallback(async (name, mediaType, tmdbId, value) => {
    const key = swipeKey(mediaType, tmdbId);
    await updateDoc(doc(db, "movienight", roomCode), { [`swipes.${name}.${key}`]: value });
  }, [roomCode]);

  return { settings, movies, swipes, saveSettings, saveMovies, setSwipe, ready, error };
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
