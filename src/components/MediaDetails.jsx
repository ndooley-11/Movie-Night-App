import { useState, useEffect, useRef, useId } from "react";
import { Play, ExternalLink, X, Film, Tv } from "lucide-react";
import { fetchFullDetails } from "../lib/api.js";
import { fetchOmdbRatings, getCachedOmdb, rottenTomatoesSearchUrl } from "../lib/omdb.js";
import { groupProviders, providerAccess } from "../lib/streaming.js";
import { AccessBadge } from "./shared.jsx";

const NO_PEOPLE = { me: "", partner: "", myServices: [], partnerServices: [] };

function WhereToWatch({ watch, fallback, people, region }) {
  // Fresh details carry logos and the JustWatch link; a title added by hand or
  // still loading falls back to the names saved when it was added.
  const src = watch || {
    flatrate: (fallback?.flatrate || []).map((name) => ({ name })),
    free: (fallback?.free || []).map((name) => ({ name })),
    rent: [...(fallback?.rent || []), ...(fallback?.buy || [])].map((name) => ({ name })),
  };
  const streams = groupProviders(src.flatrate);
  const free = groupProviders(src.free);
  const rent = groupProviders(src.rent);
  const summary = { flatrate: src.flatrate.map((p) => p.name), free: src.free.map((p) => p.name), rent: src.rent.map((p) => p.name) };
  const chip = { both: ["Both", "access-both"], me: ["You", "access-me"], partner: [people.partner, "access-me"] };
  const headingId = useId();

  return (
    <section className="details-section where-to-watch" aria-labelledby={headingId}>
      <div className="wtw-head">
        <h4 id={headingId} className="details-subhead">Where to watch</h4>
        <AccessBadge providers={summary} people={people} />
      </div>
      {!streams.length && !free.length && !rent.length && (
        <p className="hint">Not streaming in your region ({region}) right now.</p>
      )}
      {(streams.length > 0 || free.length > 0) && (
        <ul className="wtw-list">
          {streams.map((p) => {
            const level = providerAccess(p.raw, people.myServices, people.partnerServices);
            return (
              <li key={p.name}>
                {p.logo ? <img src={p.logo} alt="" loading="lazy" /> : <span className="wtw-logo-fallback" aria-hidden="true"><Tv size={15} /></span>}
                <span className="wtw-name">{p.name}</span>
                {chip[level]
                  ? <span className={`wtw-chip ${chip[level][1]}`}>{chip[level][0]}</span>
                  : <span className="wtw-none">Not subscribed</span>}
              </li>
            );
          })}
          {free.map((p) => (
            <li key={`free-${p.name}`}>
              {p.logo ? <img src={p.logo} alt="" loading="lazy" /> : <span className="wtw-logo-fallback" aria-hidden="true"><Tv size={15} /></span>}
              <span className="wtw-name">{p.name}</span>
              <span className="wtw-chip access-both">Free</span>
            </li>
          ))}
        </ul>
      )}
      {rent.length > 0 && (
        <p className="details-line wtw-rent">
          <span className="muted">Rent or buy: </span>
          {rent.slice(0, 4).map((p) => p.name).join(", ")}{rent.length > 4 ? ` +${rent.length - 4} more` : ""}
        </p>
      )}
      {watch?.link && (
        <a className="wtw-credit" href={watch.link} target="_blank" rel="noopener noreferrer">
          Availability by JustWatch <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

const resolved = new Map();
const pending = new Map();

function loadDetails(mediaType, id, apiKey, region) {
  const key = `${mediaType}:${id}`;
  if (resolved.has(key)) return Promise.resolve(resolved.get(key));
  if (!pending.has(key)) {
    pending.set(key, fetchFullDetails(mediaType, id, apiKey, region)
      .then((d) => { resolved.set(key, d); pending.delete(key); return d; })
      .catch((e) => { pending.delete(key); throw e; }));
  }
  return pending.get(key);
}

export function useDetails(item, apiKey, region, enabled = true) {
  const key = item?.tmdbId ? `${item.mediaType || "movie"}:${item.tmdbId}` : null;
  const [data, setData] = useState(() => (key && resolved.get(key)) || null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!key || !enabled || !apiKey) return;
    if (resolved.has(key)) { setData(resolved.get(key)); return; }
    let live = true;
    setError(false);
    loadDetails(item.mediaType || "movie", item.tmdbId, apiKey, region)
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, apiKey, region]);

  const current = data && `${data.mediaType}:${data.tmdbId}` === key ? data : (key && resolved.get(key)) || null;
  return { data: current, loading: !!key && enabled && !!apiKey && !current && !error, error };
}

export function useOmdb(imdbId, omdbKey, enabled = true) {
  const [ratings, setRatings] = useState(() => getCachedOmdb(imdbId));
  useEffect(() => {
    setRatings(getCachedOmdb(imdbId));
    if (!enabled || !imdbId || !omdbKey) return;
    let live = true;
    fetchOmdbRatings(imdbId, omdbKey).then((r) => live && setRatings(r));
    return () => { live = false; };
  }, [imdbId, omdbKey, enabled]);
  return omdbKey ? ratings : null;
}

export function formatRuntime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export const SCORE_SOURCES = {
  imdb: { badge: "IMDb", name: "IMDb" },
  rt: { badge: "RT", name: "Rotten Tomatoes" },
  tmdb: { badge: "TMDB", name: "TMDB" },
};

// Rotten Tomatoes' own scale: 60% and up is Fresh (a tomato), below is
// Rotten (a splat). Drawn here rather than copied from their artwork.
function FreshTomato({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="rt-icon">
      <ellipse cx="12" cy="14.2" rx="9.4" ry="8.3" fill="#fa320a" />
      <ellipse cx="8.4" cy="11.4" rx="2.6" ry="1.7" fill="#fff" opacity="0.32" transform="rotate(-28 8.4 11.4)" />
      <path d="M12 9.6 9.3 11.2l.8-2.4-2.6-.6 2.6-.9-.9-2.3 2.5 1.2L12 4.2l.6 2 2.5-1.2-.9 2.3 2.6.9-2.6.6.8 2.4Z" fill="#00912d" />
      <path d="M12 6.4c0-1.5.5-2.6 1.6-3.4" stroke="#00912d" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function RottenSplat({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="rt-icon">
      <path
        fill="#0ac855"
        d="M12 3.6c1.2 0 1.6 2 2.6 2.2 1.1.2 2.4-1.3 3.3-.6.9.7-.4 2.3.1 3.2.5.9 2.6.9 2.8 2 .2 1.1-1.8 1.7-1.9 2.8-.1 1.1 1.7 2.2 1.1 3.1-.6.9-2.4-.1-3.3.5-.9.6-.6 2.7-1.7 2.9-1.1.2-1.7-1.8-2.9-1.8s-1.8 2-2.9 1.8c-1.1-.2-.8-2.3-1.7-2.9-.9-.6-2.7.4-3.3-.5-.6-.9 1.2-2 1.1-3.1-.1-1.1-2.1-1.7-1.9-2.8.2-1.1 2.3-1.1 2.8-2 .5-.9-.8-2.5.1-3.2.9-.7 2.2.8 3.3.6C10.4 5.6 10.8 3.6 12 3.6Z"
      />
      <circle cx="3.2" cy="4.6" r="1.1" fill="#0ac855" />
      <circle cx="21" cy="19.4" r="0.9" fill="#0ac855" />
      <circle cx="20.4" cy="5.4" r="0.7" fill="#0ac855" />
    </svg>
  );
}

export function Score({ source, value, href, size = "md" }) {
  const s = SCORE_SOURCES[source];
  let mark = <span className={"mini-badge " + source} aria-hidden="true">{s.badge}</span>;
  let label = `${s.name} ${value}`;
  if (source === "rt") {
    const fresh = parseInt(value, 10) >= 60;
    const px = size === "sm" ? 18 : 20;
    mark = fresh ? <FreshTomato size={px} /> : <RottenSplat size={px} />;
    label = `Rotten Tomatoes ${value}, ${fresh ? "Fresh" : "Rotten"}`;
  }
  const body = (<>{mark}<span className="score-value">{value}</span></>);
  const cls = "score score-" + size;
  return href
    ? <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{body}</a>
    : <span className={cls} role="img" aria-label={label}>{body}</span>;
}

export default function MediaDetails({ item, settings, people = NO_PEOPLE, showPoster = false, active = true, fetchRatings = true }) {
  const { data, loading, error } = useDetails(item, settings.apiKey, settings.region, active);
  const omdb = useOmdb(data?.imdbId, settings.omdbKey, active && fetchRatings);

  const title = data?.title || item.title;
  const year = data?.year || item.year;
  const typeLabel = (item.mediaType || "movie") === "tv" ? "Show" : "Movie";
  const length = data?.mediaType === "tv"
    ? (data.seasons ? `${data.seasons} season${data.seasons !== 1 ? "s" : ""}` : null)
    : formatRuntime(data?.runtime);
  const genres = data?.genres?.length ? data.genres : item.genreNames || [];
  const overview = data?.overview || item.overview;

  return (
    <div className="details">
      <div className={"details-head" + (showPoster ? " with-poster" : "")}>
        {showPoster && (item.poster
          ? <img className="details-poster" src={item.poster} alt="" />
          : <div className="details-poster poster-fallback"><Film size={22} /></div>)}
        <div>
          <h3 className="details-title">{title}</h3>
          <p className="details-meta">{[year, typeLabel, length].filter(Boolean).join(" · ")}</p>
          {data?.tagline && <p className="details-tagline">{data.tagline}</p>}
        </div>
      </div>

      {!item.tmdbId && <p className="hint">Added by hand, so there are no extra details for this one.</p>}
      {item.tmdbId && !settings.apiKey && <p className="hint">Add a TMDB key in Settings to see cast, ratings and trailers.</p>}
      {error && <p className="hint">Couldn't load details right now.</p>}

      {loading && (
        <div className="details-skeleton" aria-hidden="true">
          <span /><span /><span className="short" />
        </div>
      )}

      {data && (
        <div className="scores">
          {omdb?.imdb && <Score source="imdb" value={omdb.imdb} href={`https://www.imdb.com/title/${data.imdbId}/`} />}
          {omdb?.rottenTomatoes && <Score source="rt" value={omdb.rottenTomatoes} href={rottenTomatoesSearchUrl(title)} />}
          {data.tmdbRating != null && <Score source="tmdb" value={data.tmdbRating.toFixed(1)} href={`https://www.themoviedb.org/${data.mediaType}/${data.tmdbId}`} />}
        </div>
      )}

      {genres.length > 0 && (
        <div className="tag-row">{genres.slice(0, 4).map((g) => <span key={g} className="genre-tag">{g}</span>)}</div>
      )}

      {overview && <p className="details-overview">{overview}</p>}

      {data?.people?.length > 0 && (
        <p className="details-line"><span className="muted">{data.peopleLabel} </span>{data.people.join(", ")}</p>
      )}

      {(data || item.providers) && item.tmdbId && (
        <WhereToWatch watch={data?.watch} fallback={item.providers} people={people} region={settings.region} />
      )}

      {data?.cast?.length > 0 && (
        <div className="details-section">
          <h4 className="details-subhead">Cast</h4>
          <ul className="cast">
            {data.cast.map((c) => (
              <li key={c.name + c.character}>
                {c.photo ? <img src={c.photo} alt="" loading="lazy" /> : <span className="cast-fallback" aria-hidden="true">{c.name[0]}</span>}
                <span className="cast-text">
                  <span className="cast-name">{c.name}</span>
                  {c.character && <span className="cast-role">{c.character}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="details-actions">
          <a className="btn btn-primary" href={data.trailerUrl} target="_blank" rel="noopener noreferrer">
            <Play size={15} /> {data.hasOfficialTrailer ? "Watch trailer" : "Find trailer"}
          </a>
          {!omdb?.rottenTomatoes && (
            <a className="btn btn-outline" href={rottenTomatoesSearchUrl(title)} target="_blank" rel="noopener noreferrer">
              Reviews <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function DetailsSheet({ item, settings, people, onClose, footer }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <button ref={closeRef} className="sheet-close" onClick={onClose} aria-label="Close details"><X size={18} /></button>
        <div className="sheet-body">
          <MediaDetails item={item} settings={settings} people={people} showPoster />
          {footer}
        </div>
      </div>
    </div>
  );
}
