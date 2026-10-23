import { useState, useEffect, useRef, useMemo } from "react";
import { Heart, X, Film, Info, SlidersHorizontal, ChevronUp, RotateCcw, Eye } from "lucide-react";
import { mediaTypesForFilter, fetchDetails, normalizeResult } from "../../lib/api.js";
import { createMixer, refillPools, drawCards, isDrained, feedUnavailable } from "../../lib/discoverFeed.js";
import { swipeKey } from "../../hooks.js";
import { Switch } from "../shared.jsx";
import MediaDetails, { useDetails, useOmdb, Score, formatRuntime } from "../MediaDetails.jsx";
import SeenItSheet from "../SeenItSheet.jsx";

const QUEUE_TARGET = 16;
const REFILL_AT = 6;
const LANGUAGES = [["any", "Any"], ["en", "English"], ["non-en", "Non-English"]];
const CONTENT_TYPES = [["movies", "Movies"], ["shows", "Shows"], ["both", "Both"]];

function parseSwipeKey(key) {
  return key.startsWith("tv:") ? { mediaType: "tv", tmdbId: Number(key.slice(3)) } : { mediaType: "movie", tmdbId: Number(key) };
}

const largePoster = (url) => (url ? url.replace("/w342/", "/w780/") : null);

// Both the top card and the one behind it render this, so the next card's
// details and scores are already loaded by the time it slides up.
function CardFront({ item, settings, flipped = false, partnerPick, onInfo, dragX = 0 }) {
  const { data } = useDetails(item, settings.apiKey, settings.region, true);
  const omdb = useOmdb(data?.imdbId, settings.omdbKey, true);
  const tmdbScore = data?.tmdbRating ?? (item.voteAverage > 0 ? Math.round(item.voteAverage * 10) / 10 : null);
  const length = data?.mediaType === "tv"
    ? (data.seasons ? `${data.seasons} season${data.seasons !== 1 ? "s" : ""}` : null)
    : formatRuntime(data?.runtime);
  const genres = (data?.genres?.length ? data.genres : item.genreNames || []).slice(0, 3);

  return (
    <div className="face front" aria-hidden={flipped}>
      {item.poster
        ? <img className="card-img" src={largePoster(item.poster)} alt="" draggable="false" />
        : <div className="poster-fallback big"><Film size={32} aria-hidden="true" /></div>}
      <div className="card-shade" aria-hidden="true" />
      {dragX > 40 && <div className="swipe-stamp like">Like</div>}
      {dragX < -40 && <div className="swipe-stamp pass">Pass</div>}
      <div className="card-overlay">
        <h3 className="card-title">{item.title}</h3>
        {genres.length > 0 && <p className="card-genres">{genres.join(", ")}</p>}
        <p className="card-meta">
          {[item.year, item.mediaType === "tv" ? "Show" : "Movie", length].filter(Boolean).join(" · ")}
          {partnerPick && <span className="their-pick"> · {partnerPick}'s pick</span>}
        </p>
        {(omdb?.imdb || omdb?.rottenTomatoes || tmdbScore) && (
          <div className="card-scores">
            {omdb?.imdb && <Score source="imdb" value={omdb.imdb} size="sm" />}
            {omdb?.rottenTomatoes && <Score source="rt" value={omdb.rottenTomatoes} size="sm" />}
            {tmdbScore != null && <Score source="tmdb" value={tmdbScore.toFixed(1)} size="sm" />}
          </div>
        )}
      </div>
      {onInfo && (
        <button className="card-info-btn" onClick={onInfo} aria-label={`Details for ${item.title}`} tabIndex={flipped ? -1 : 0}>
          <Info size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function DiscoverTab({ settings, saveSettings, genreMap, movies, me, partner, swipes, setSwipe, showPassed, setShowPassed, language, setLanguage, people, onMatch, onSeenIt }) {
  const [mode, setMode] = useState("discover");
  const [seenItem, setSeenItem] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genreFilter, setGenreFilter] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [theirQueue, setTheirQueue] = useState([]);
  const [theirLoading, setTheirLoading] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const gesture = useRef(null);
  const cardRef = useRef(null);
  const mixerRef = useRef(createMixer());
  const genRef = useRef(0);
  const busyRef = useRef(false);
  const retriesRef = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const detailCacheRef = useRef(new Map());
  const fetchedRef = useRef(new Set());

  const contentType = settings.contentType || "both";
  const enabledTypes = mediaTypesForFilter(contentType);
  const mySwipes = swipes[me] || {};
  const partnerSwipes = swipes[partner] || {};

  const excludeKeys = useMemo(() => {
    const keys = new Set();
    movies.forEach((m) => keys.add(`${m.mediaType || "movie"}:${m.tmdbId}`));
    Object.entries(mySwipes).forEach(([key, val]) => {
      const { mediaType, tmdbId } = parseSwipeKey(key);
      // Likes and "seen it" never come back; passes only when that filter is on.
      if (val === "like" || val === "seen" || !showPassed) keys.add(`${mediaType}:${tmdbId}`);
    });
    return keys;
  }, [movies, mySwipes, showPassed]);

  const onList = (key) => {
    const { mediaType, tmdbId } = parseSwipeKey(key);
    return movies.some((m) => (m.mediaType || "movie") === mediaType && String(m.tmdbId) === String(tmdbId));
  };
  const partnerPendingKeys = Object.entries(partnerSwipes)
    .filter(([key, v]) => v === "like" && !mySwipes[key] && !onList(key))
    .map(([key]) => key);

  // A filter change starts a new generation with a fresh mixer; anything still
  // in flight from the old generation is dropped when it lands.
  async function loadMore(reset) {
    if (!settings.apiKey) return;
    if (reset) {
      genRef.current++;
      mixerRef.current = createMixer();
      busyRef.current = false;
      retriesRef.current = 0;
    }
    if (busyRef.current) return;
    const gen = genRef.current;
    const mixer = mixerRef.current;
    busyRef.current = true;
    setLoading(true);
    try {
      const inQueue = new Set((reset ? [] : queueRef.current).map((it) => `${it.mediaType}:${it.tmdbId}`));
      const isExcluded = (k) => excludeKeys.has(k) || inQueue.has(k);
      const opts = {
        apiKey: settings.apiKey,
        traktClientId: settings.traktClientId,
        mediaTypes: enabledTypes,
        language,
        genreFilter,
        genreMap,
        isExcluded,
        detailCache: detailCacheRef.current,
      };
      const want = Math.max(0, QUEUE_TARGET - (reset ? 0 : queueRef.current.length));
      const drawn = [];
      // Titles already swiped are skipped while refilling, so heavy users page
      // past them; keep going a few rounds until the deck is topped up.
      for (let round = 0; round < 12 && drawn.length < want && !isDrained(mixer, enabledTypes); round++) {
        await refillPools(mixer, opts);
        if (gen !== genRef.current) return;
        const got = drawCards(mixer, want - drawn.length, isExcluded, enabledTypes);
        drawn.push(...got);
        // TMDB is failing and backing off: stop here and let the retry below
        // try again later rather than spinning through empty rounds.
        if (!got.length && feedUnavailable(mixer, enabledTypes)) break;
      }
      setQueue((q) => (reset ? drawn : [...q, ...drawn]));
      setOffline(!drawn.length && !queueRef.current.length && !!feedUnavailable(mixer, enabledTypes));
      // Came back short but there's more out there (slow network, narrow
      // filters): try again shortly instead of showing an empty deck.
      if (drawn.length > 0) retriesRef.current = 0;
      if (drawn.length < want && !isDrained(mixer, enabledTypes) && retriesRef.current < 3) {
        retriesRef.current++;
        setTimeout(() => { if (gen === genRef.current) loadMoreRef.current(false); }, 1500 * retriesRef.current);
      }
    } catch (e) { /* network hiccup: the retry above or the next swipe picks it up */ }
    finally {
      if (gen === genRef.current) { busyRef.current = false; setLoading(false); }
    }
  }
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    setQueue([]);
    setFlipped(false);
    setOffline(false);
    if (mode === "discover") loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreFilter, language, settings.apiKey, contentType, showPassed, mode]);

  // Rolling refresh: top the deck back up whenever it gets down to its last
  // few cards, so a fresh batch lands roughly every 10 swipes.
  useEffect(() => {
    if (mode === "discover" && queue.length <= REFILL_AT && !busyRef.current && settings.apiKey) loadMore(false);
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
  const current = activeQueue[0];
  const next = activeQueue[1];

  // Remove by key rather than position: in "partner liked" mode a sync effect
  // can drop the same card first, and slicing would then lose the next one.
  function dismissCurrent(direction) {
    const key = `${current.mediaType}:${current.tmdbId}`;
    const drop = (q) => q.filter((it) => `${it.mediaType}:${it.tmdbId}` !== key);
    setExiting(direction);
    setTimeout(() => {
      setQueue(drop);
      setTheirQueue(drop);
      setExiting(null);
      setDragX(0);
      setFlipped(false);
    }, 240);
  }

  function commitSwipe(liked) {
    if (!current || exiting || seenItem) return;
    const saved = setSwipe(me, current.mediaType, current.tmdbId, liked ? "like" : "pass");
    if (liked && partnerSwipes[swipeKey(current.mediaType, current.tmdbId)] === "like") {
      // This like completes a match. Hand the card to the celebration: a copy
      // of its face takes over this exact spot (the burst is anchored to it),
      // while the real card leaves the queue at once so the next title is
      // ready underneath. App adds the title to the list and de-duplicates.
      const cardEl = cardRef.current;
      const face = cardEl?.querySelector(".face.front")?.cloneNode(true);
      if (face) {
        face.removeAttribute("aria-hidden");
        face.style.visibility = "visible";
        face.querySelectorAll(".card-info-btn, .swipe-stamp").forEach((n) => n.remove());
      }
      const slot = cardEl?.closest(".deck-inner")?.getBoundingClientRect();
      onMatch?.(current, { saved, origin: face && slot ? { rect: slot, node: face, dragX } : null });
      const key = `${current.mediaType}:${current.tmdbId}`;
      const drop = (q) => q.filter((it) => `${it.mediaType}:${it.tmdbId}` !== key);
      setQueue(drop);
      setTheirQueue(drop);
      setDragX(0);
      setFlipped(false);
      return;
    }
    dismissCurrent(liked ? "right" : "left");
  }

  async function saveSeenIt(data) {
    const item = seenItem;
    await onSeenIt(item, data);
    setSwipe(me, item.mediaType, item.tmdbId, "seen").catch(() => { /* the list entry already keeps it out of Discover */ });
    setSeenItem(null);
    if (current && current.tmdbId === item.tmdbId && current.mediaType === item.mediaType) dismissCurrent("up");
  }

  // One gesture handler for both swipe and tap: a press that barely moves is
  // a tap (flip the card); a horizontal drag on the poster side is a swipe.
  // While flipped, the back scrolls natively, so a scroll cancels the tap.
  function onPointerDown(e) {
    if (e.button > 0 || exiting) return;
    if (e.target.closest("a, button")) return;
    gesture.current = { x: e.clientX, y: e.clientY, moved: false };
    if (!flipped) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
  }
  function onPointerMove(e) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - g.y) > 6) g.moved = true;
    if (!flipped) setDragX(dx);
  }
  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    if (!g.moved) { setDragX(0); setFlipped((f) => !f); return; }
    if (flipped) return;
    if (dragX > 90) commitSwipe(true);
    else if (dragX < -90) commitSwipe(false);
    else setDragX(0);
  }
  function onPointerCancel() {
    gesture.current = null;
    setDragging(false);
    setDragX(0);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.("input, textarea, select, [role=dialog]")) return;
      if (e.key === "ArrowRight") commitSwipe(true);
      else if (e.key === "ArrowLeft") commitSwipe(false);
      else if (e.key === "ArrowUp" && current && !exiting) { e.preventDefault(); setSeenItem(current); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const genreOptions = useMemo(() => {
    const names = new Set();
    enabledTypes.forEach((mt) => Object.values(genreMap?.[mt] || {}).forEach((n) => names.add(n)));
    return Array.from(names).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreMap, contentType]);

  const activeFilters = [
    contentType !== "both" && (contentType === "movies" ? "Movies only" : "Shows only"),
    language !== "any" && (language === "en" ? "English" : "Non-English"),
    genreFilter,
    showPassed && "Including passed",
  ].filter(Boolean);

  function resetFilters() {
    setGenreFilter(null);
    setLanguage("any");
    setShowPassed(false);
    if (contentType !== "both") saveSettings({ ...settings, contentType: "both" });
  }

  const cardStyle = {
    transform: `translateX(${dragX}px) rotate(${dragX / 22}deg)`,
    transition: dragging ? "none" : undefined,
    touchAction: flipped ? "pan-y" : "none",
  };

  return (
    <div className="discover">
      <div className="discover-bar">
        <div className="segmented grow" role="group" aria-label="Discover mode">
          <button className={mode === "discover" ? "active" : ""} aria-pressed={mode === "discover"} onClick={() => setMode("discover")}>New for you</button>
          <button className={mode === "theirs" ? "active" : ""} aria-pressed={mode === "theirs"} onClick={() => setMode("theirs")}>
            {partner} liked{partnerPendingKeys.length > 0 && <span className="count-pill">{partnerPendingKeys.length}</span>}
          </button>
        </div>
        {mode === "discover" && (
          <button
            className={"filter-btn" + (filtersOpen ? " open" : "") + (activeFilters.length ? " has-active" : "")}
            aria-expanded={filtersOpen}
            aria-controls="discover-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? <ChevronUp size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
            <span>Filters</span>
            {activeFilters.length > 0 && <span className="count-pill">{activeFilters.length}</span>}
          </button>
        )}
      </div>

      {mode === "discover" && !filtersOpen && activeFilters.length > 0 && (
        <p className="filter-summary">{activeFilters.join(" · ")}</p>
      )}

      {mode === "discover" && filtersOpen && (
        <div id="discover-filters" className="filter-panel">
          <div className="filter-group">
            <span className="filter-label">Show <span className="muted">· shared with {partner}</span></span>
            <div className="segmented" role="group" aria-label="Content type">
              {CONTENT_TYPES.map(([val, label]) => (
                <button key={val} className={contentType === val ? "active" : ""} aria-pressed={contentType === val} onClick={() => saveSettings({ ...settings, contentType: val })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Original language</span>
            <div className="segmented" role="group" aria-label="Original language">
              {LANGUAGES.map(([val, label]) => (
                <button key={val} className={language === val ? "active" : ""} aria-pressed={language === val} onClick={() => setLanguage(val)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Genre</span>
            <div className="chip-scroll" role="group" aria-label="Genre">
              <button className={"chip" + (genreFilter === null ? " active" : "")} aria-pressed={genreFilter === null} onClick={() => setGenreFilter(null)}>All</button>
              {genreOptions.map((name) => (
                <button key={name} className={"chip" + (genreFilter === name ? " active" : "")} aria-pressed={genreFilter === name} onClick={() => setGenreFilter(genreFilter === name ? null : name)}>{name}</button>
              ))}
            </div>
          </div>
          <Switch checked={showPassed} onChange={setShowPassed} label="Show titles I already passed on" />
          <div className="filter-footer">
            {activeFilters.length > 0 && <button className="link-btn" onClick={resetFilters}>Reset filters</button>}
            <button className="btn btn-outline btn-sm" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>
        </div>
      )}

      <div className="deck">
        <div className="deck-inner">
          {!settings.apiKey && <div className="empty-state deck-empty">Add a TMDB key in Settings to start discovering.</div>}
          {settings.apiKey && !current && !activeLoading && mode === "discover" && offline && (
            <div className="empty-state deck-empty" role="status">
              Couldn't reach TMDB just now.
              <button className="link-btn" onClick={() => { setOffline(false); loadMore(true); }}>Try again</button>
            </div>
          )}
          {settings.apiKey && !current && !activeLoading && !(mode === "discover" && offline) && (
            <div className="empty-state deck-empty">
              {mode === "discover"
                ? (activeFilters.length ? "Nothing left with these filters. Try loosening them." : "You're all caught up. Check back later for more.")
                : `Nothing waiting on you. ${partner} hasn't liked anything you haven't seen.`}
              {mode === "discover" && activeFilters.length > 0 && <button className="link-btn" onClick={resetFilters}>Reset filters</button>}
            </div>
          )}
          {settings.apiKey && !current && activeLoading && <div className="card-skeleton" aria-label="Loading titles" />}

          {next && (
            <div key={`behind-${next.mediaType}:${next.tmdbId}`} className="swipe-card behind" aria-hidden="true">
              <CardFront item={next} settings={settings} />
            </div>
          )}

          {current && (
            <div
              key={`${current.mediaType}:${current.tmdbId}`}
              ref={cardRef}
              data-key={`${current.mediaType}:${current.tmdbId}`}
              data-bucket={current.bucket}
              data-slot={current.slot}
              className={"swipe-card" + (exiting ? " exit-" + exiting : "") + (flipped ? " flipped" : "")}
              style={cardStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <div className="flip">
                <CardFront
                  item={current}
                  settings={settings}
                  flipped={flipped}
                  dragX={dragX}
                  partnerPick={mode === "theirs" ? partner : null}
                  onInfo={() => setFlipped(true)}
                />
                <div className="face back" aria-hidden={!flipped}>
                  <div className="back-scroll">
                    <button className="back-flip" onClick={() => setFlipped(false)} tabIndex={flipped ? 0 : -1}>
                      <RotateCcw size={14} aria-hidden="true" /> Back to poster
                    </button>
                    <MediaDetails item={current} settings={settings} people={people} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {current && (
        <div className="swipe-actions">
          <button className="swipe-action swipe-action-pass" onClick={() => commitSwipe(false)} aria-label={`Not interested in ${current.title}`}>
            <span className="swipe-btn"><X size={26} aria-hidden="true" /></span>
            <span className="swipe-label" aria-hidden="true">Pass</span>
          </button>
          <button className="swipe-action swipe-action-seen" onClick={() => setSeenItem(current)} aria-haspopup="dialog" aria-label={`I've already seen ${current.title}`}>
            <span className="swipe-btn"><Eye size={22} aria-hidden="true" /></span>
            <span className="swipe-label" aria-hidden="true">Seen it</span>
          </button>
          <button className="swipe-action swipe-action-like" onClick={() => commitSwipe(true)} aria-label={`Want to watch ${current.title}`}>
            <span className="swipe-btn"><Heart size={26} aria-hidden="true" /></span>
            <span className="swipe-label" aria-hidden="true">Want it</span>
          </button>
        </div>
      )}

      {seenItem && <SeenItSheet item={seenItem} partner={partner} onSave={saveSeenIt} onClose={() => setSeenItem(null)} />}
    </div>
  );
}
