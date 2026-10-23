import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Heart, X, Film } from "lucide-react";
import { mediaTypesForFilter, fetchDetails, posterUrl, backdropUrl, normalizeResult } from "../../lib/api.js";
import { fetchDiscoverBatch, emptyPageState } from "../../lib/discoverFeed.js";
import { swipeKey } from "../../hooks.js";

const LANGUAGE_CHIPS = [["any", "Any language"], ["en", "English"], ["non-en", "Non-English"]];

function parseSwipeKey(key) {
  return key.startsWith("tv:") ? { mediaType: "tv", tmdbId: Number(key.slice(3)) } : { mediaType: "movie", tmdbId: Number(key) };
}

export default function DiscoverTab({ settings, genreMap, movies, me, partner, swipes, setSwipe, showToast, showPassed, setShowPassed }) {
  const [mode, setMode] = useState("discover");
  const [genreFilter, setGenreFilter] = useState(null);
  const [language, setLanguage] = useState(settings.language || "any");
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [theirQueue, setTheirQueue] = useState([]);
  const [theirLoading, setTheirLoading] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null);
  const startX = useRef(0);
  const pageStateRef = useRef(emptyPageState());
  const detailCacheRef = useRef(new Map());
  const fetchedRef = useRef(new Set());

  const enabledTypes = mediaTypesForFilter(settings.contentType);
  const mySwipes = swipes[me] || {};
  const partnerSwipes = swipes[partner] || {};

  const excludeKeys = useMemo(() => {
    const keys = new Set();
    movies.forEach((m) => keys.add(`${m.mediaType || "movie"}:${m.tmdbId}`));
    Object.entries(mySwipes).forEach(([key, val]) => {
      const { mediaType, tmdbId } = parseSwipeKey(key);
      if (val === "like" || !showPassed) keys.add(`${mediaType}:${tmdbId}`);
    });
    return keys;
  }, [movies, mySwipes, showPassed]);

  const partnerPendingKeys = Object.entries(partnerSwipes)
    .filter(([key, v]) => v === "like" && !mySwipes[key] && !movies.some((m) => `${m.mediaType || "movie"}:${m.tmdbId}` === `${parseSwipeKey(key).mediaType}:${parseSwipeKey(key).tmdbId}`))
    .map(([key]) => key);

  const loadMore = useCallback(async (reset) => {
    if (!settings.apiKey || loading) return;
    setLoading(true);
    try {
      if (reset) pageStateRef.current = emptyPageState();
      const { items, pageState } = await fetchDiscoverBatch({
        apiKey: settings.apiKey,
        traktClientId: settings.traktClientId,
        mediaTypes: enabledTypes,
        language,
        genreMap,
        pageState: pageStateRef.current,
        excludeKeys,
        detailCache: detailCacheRef.current,
      });
      pageStateRef.current = pageState;
      const filtered = genreFilter ? items.filter((it) => (it.genreNames || []).includes(genreFilter)) : items;
      setQueue((q) => (reset ? filtered : [...q, ...filtered]));
    } catch (e) { /* network hiccup — the stack just won't refill this round */ }
    setLoading(false);
  }, [settings.apiKey, settings.traktClientId, settings.contentType, language, genreFilter, loading, genreMap, excludeKeys, enabledTypes]);

  useEffect(() => {
    setQueue([]);
    if (mode === "discover") loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreFilter, language, settings.apiKey, settings.contentType, mode]);

  useEffect(() => {
    if (mode === "discover" && queue.length <= 3 && !loading && settings.apiKey) loadMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, mode]);

  useEffect(() => {
    if (!settings.apiKey) return;
    const toFetch = partnerPendingKeys.filter((k) => !fetchedRef.current.has(k));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      setTheirLoading(true);
      const fetched = [];
      for (const key of toFetch) {
        fetchedRef.current.add(key);
        const { mediaType, tmdbId } = parseSwipeKey(key);
        try {
          const d = await fetchDetails(mediaType, tmdbId, settings.apiKey);
          fetched.push(normalizeResult(mediaType, d, genreMap));
        } catch (e) { /* skip titles that fail to resolve */ }
      }
      if (!cancelled) setTheirQueue((q) => [...q, ...fetched]);
      setTheirLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, movies, settings.apiKey]);

  useEffect(() => {
    setTheirQueue((q) => q.filter((item) => partnerPendingKeys.includes(swipeKey(item.mediaType, item.tmdbId))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, movies]);

  const activeQueue = mode === "discover" ? queue : theirQueue;
  const activeLoading = mode === "discover" ? loading : theirLoading;

  function commitSwipe(liked) {
    const current = activeQueue[0];
    if (!current) return;
    setExiting(liked ? "right" : "left");
    setSwipe(me, current.mediaType, current.tmdbId, liked ? "like" : "pass");
    setTimeout(() => {
      if (mode === "discover") setQueue((q) => q.slice(1));
      else setTheirQueue((q) => q.slice(1));
      setExiting(null);
      setDragX(0);
    }, 220);
  }

  function onPointerDown(e) { startX.current = e.clientX; setDragging(true); }
  function onPointerMove(e) { if (dragging) setDragX(e.clientX - startX.current); }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 90) commitSwipe(true);
    else if (dragX < -90) commitSwipe(false);
    else setDragX(0);
  }

  const genreOptions = useMemo(() => {
    const names = new Set();
    enabledTypes.forEach((mt) => Object.values(genreMap?.[mt] || {}).forEach((n) => names.add(n)));
    return Array.from(names).sort();
  }, [genreMap, settings.contentType]);

  const current = activeQueue[0];
  const next = activeQueue[1];

  return (
    <div>
      <h2 className="section-title">Discover</h2>
      <div className="segmented">
        <button className={mode === "discover" ? "active" : ""} onClick={() => setMode("discover")}>New for you</button>
        <button className={mode === "theirs" ? "active" : ""} onClick={() => setMode("theirs")}>
          {partner} liked{partnerPendingKeys.length > 0 && <span className="count-pill">{partnerPendingKeys.length}</span>}
        </button>
      </div>

      {mode === "discover" && (
        <>
          <div className="toggle-row">
            <label className="switch-row">
              <span>Show things I've already passed on</span>
              <span className={"switch" + (showPassed ? " on" : "")} onClick={() => setShowPassed(!showPassed)}>
                <span className="switch-knob" />
              </span>
            </label>
          </div>
          <div className="chip-row">
            {LANGUAGE_CHIPS.map(([val, label]) => (
              <button key={val} className={"chip" + (language === val ? " active" : "")} onClick={() => setLanguage(val)}>{label}</button>
            ))}
          </div>
          <div className="chip-row">
            <button className={"chip" + (genreFilter === null ? " active" : "")} onClick={() => setGenreFilter(null)}>All genres</button>
            {genreOptions.slice(0, 12).map((name) => (
              <button key={name} className={"chip" + (genreFilter === name ? " active" : "")} onClick={() => setGenreFilter(name)}>{name}</button>
            ))}
          </div>
        </>
      )}

      {!settings.apiKey && <div className="empty-state" style={{ marginTop: 14 }}>Add a TMDB key in Settings to start discovering.</div>}

      {settings.apiKey && (
        <div className="swipe-stack">
          {!current && !activeLoading && mode === "discover" && (
            <div className="empty-state">You're all caught up — check back later, or try a different filter.</div>
          )}
          {!current && !activeLoading && mode === "theirs" && (
            <div className="empty-state">Nothing waiting on you — {partner} hasn't liked anything you haven't already seen.</div>
          )}
          {!current && activeLoading && <p className="hint" style={{ textAlign: "center" }}>Loading…</p>}

          {next && (
            <div className="swipe-card behind">
              {next.backdrop || next.poster ? <img src={next.backdrop || next.poster} alt="" /> : <div className="poster-fallback big" />}
            </div>
          )}

          {current && (
            <div
              className={"swipe-card" + (exiting ? " exit-" + exiting : "")}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`, opacity: dragging ? 1 - Math.min(Math.abs(dragX) / 400, 0.3) : 1 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {current.poster ? <img src={current.poster} alt="" className="swipe-poster" /> : <div className="poster-fallback big"><Film size={28} /></div>}
              <div className="swipe-info">
                <div className="swipe-title">{current.title} {current.year && <span className="muted">· {current.year}</span>}</div>
                <div className="tag-row" style={{ justifyContent: "center" }}>
                  {(current.genreNames || []).slice(0, 3).map((g) => <span key={g} className="genre-tag">{g}</span>)}
                </div>
                {current.overview && <p className="swipe-overview">{current.overview.length > 130 ? current.overview.slice(0, 130) + "…" : current.overview}</p>}
              </div>
              {mode === "theirs" && <div className="swipe-stamp their-pick">{partner}'s pick</div>}
              {dragX > 40 && <div className="swipe-stamp like">Like</div>}
              {dragX < -40 && <div className="swipe-stamp pass">Pass</div>}
            </div>
          )}

          {current && (
            <div className="swipe-actions">
              <button className="swipe-btn swipe-btn-pass" onClick={() => commitSwipe(false)} aria-label="Pass"><X size={22} /></button>
              <button className="swipe-btn swipe-btn-like" onClick={() => commitSwipe(true)} aria-label="Like"><Heart size={22} /></button>
            </div>
          )}
          <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>
            {mode === "discover" ? "Swipe or tap — when you both like the same one, it's added automatically." : `These are things ${partner} already liked. Like one back and it goes straight to your list.`}
          </p>
        </div>
      )}
    </div>
  );
}
