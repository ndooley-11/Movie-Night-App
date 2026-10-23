import { useId, useRef, useState } from "react";
import { Film, Tv, Star, User, Users, X } from "lucide-react";
import { ratingAt, stepRating, starFill, ratingText } from "../lib/rating.js";
import { streamingAccess } from "../lib/streaming.js";

// Simplified from the popcorn app icon so it stays legible at header size:
// same puffed top, rim and tapered bucket, with two stripe gaps instead of three.
export function BrandMark({ size = 22 }) {
  const clip = `brand-clip-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="brand-mark">
      <defs><clipPath id={clip}><rect x="0" y="0" width="24" height="10.1" /></clipPath></defs>
      <g fill="currentColor">
        <g clipPath={`url(#${clip})`}>
          <circle cx="6.1" cy="9" r="2.7" />
          <circle cx="9.3" cy="6.3" r="3" />
          <circle cx="13.1" cy="5.3" r="3.2" />
          <circle cx="16.8" cy="6.6" r="2.9" />
          <circle cx="18.4" cy="9.3" r="2.4" />
          <circle cx="11.6" cy="8.4" r="2.6" />
        </g>
        <rect x="3" y="10.8" width="18" height="2.4" rx="1" />
        <path d="M4.6 14.2H8.8L9.4 21.4H6.4Z" />
        <path d="M10 14.2H14L13.4 21.4H10.6Z" />
        <path d="M15.2 14.2H19.4L17.6 21.4H14.6Z" />
      </g>
    </svg>
  );
}

function StarRow({ value, size }) {
  return [1, 2, 3, 4, 5].map((n) => {
    const fill = starFill(value, n);
    return (
      <span key={n} className="star-cell">
        <Star size={size} aria-hidden="true" fill="none" color={fill ? "var(--gold)" : "var(--text-faint)"} />
        {fill > 0 && (
          <span className="star-fill" style={fill < 1 ? { clipPath: "inset(0 50% 0 0)" } : undefined}>
            <Star size={size} aria-hidden="true" fill="var(--gold)" color="var(--gold)" />
          </span>
        )}
      </span>
    );
  });
}

// Half-star rating as one slider: tap the left half of a star for a half,
// drag across to adjust. It only commits on release, so dragging doesn't save
// on every pixel. Tapping the current rating again clears it.
export function Stars({ value = 0, onChange, size = 16, readOnly = false, label = "Rating" }) {
  const rowRef = useRef(null);
  const press = useRef(null);
  const [preview, setPreview] = useState(null);
  const shown = preview ?? (value || 0);

  if (readOnly) {
    return (
      <span className="stars" role="img" aria-label={`${label}: ${ratingText(value)}`}>
        <StarRow value={value || 0} size={size} />
      </span>
    );
  }

  const at = (e) => {
    const r = rowRef.current.getBoundingClientRect();
    return ratingAt(e.clientX - r.left, r.width);
  };
  function down(e) {
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const v = at(e);
    press.current = { x: e.clientX, moved: false, start: value || 0 };
    setPreview(v);
  }
  function move(e) {
    if (!press.current) return;
    if (Math.abs(e.clientX - press.current.x) > 4) press.current.moved = true;
    setPreview(at(e));
  }
  function up(e) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    const v = at(e);
    setPreview(null);
    onChange(!p.moved && v === p.start ? 0 : v);
  }
  function cancel() { press.current = null; setPreview(null); }
  function key(e) {
    const steps = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };
    if (e.key in steps) { e.preventDefault(); onChange(stepRating(value, steps[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(0); }
    else if (e.key === "End") { e.preventDefault(); onChange(5); }
  }

  return (
    <div
      ref={rowRef}
      className="stars stars-input"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value || 0}
      aria-valuetext={ratingText(value)}
      style={{ "--star": `${Math.max(34, size + 16)}px` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onKeyDown={key}
    >
      <StarRow value={shown} size={size} />
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className={"switch" + (checked ? " on" : "")} aria-hidden="true"><span className="switch-knob" /></span>
    </button>
  );
}

export function TabBtn({ icon, label, active, onClick }) {
  return (
    <button className={"tab" + (active ? " active" : "")} onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}<span>{label}</span>
    </button>
  );
}

export function MediaTypeTag({ mediaType }) {
  return (
    <span className="media-tag">
      {mediaType === "tv" ? <Tv size={11} aria-hidden="true" /> : <Film size={11} aria-hidden="true" />}
      {mediaType === "tv" ? "Show" : "Movie"}
    </span>
  );
}

export function PosterThumb({ poster, size = "md" }) {
  return poster
    ? <img className={"poster poster-" + size} src={poster} alt="" loading="lazy" decoding="async" />
    : <div className={"poster poster-fallback poster-" + size}><Film size={18} aria-hidden="true" /></div>;
}

// Green: you can both stream it. Blue: only one of you (named). Red: neither.
// Each state also has its own icon and words, so it never relies on color alone.
export function AccessBadge({ providers, people }) {
  const a = streamingAccess(providers, people.myServices, people.partnerServices);
  if (a.level === "unknown") return null;
  const where = a.via.slice(0, 2).join(", ");
  const content = {
    both: { icon: <Users size={12} aria-hidden="true" />, who: "Both", text: a.isFree ? `Free on ${where}` : where, sr: `You can both stream it${where ? ` on ${where}` : ""}` },
    me: { icon: <User size={12} aria-hidden="true" />, who: "You", text: where, sr: `Only you can stream it, on ${where}` },
    partner: { icon: <User size={12} aria-hidden="true" />, who: people.partner, text: where, sr: `Only ${people.partner} can stream it, on ${where}` },
    neither: { icon: <X size={12} aria-hidden="true" />, who: a.rentOnly ? "Rent or buy" : "Neither", text: a.rentOnly ? "" : where, sr: a.rentOnly ? "Not streaming. Rent or buy only" : `Neither of you has ${where}` },
  }[a.level];
  return (
    <span className={`access-badge access-${a.level === "partner" ? "me" : a.level}`} title={content.sr}>
      <span className="access-visual" aria-hidden="true">
        {content.icon}
        <b>{content.who}</b>
        {content.text && <span className="access-where">{content.text}</span>}
      </span>
      <span className="visually-hidden">{content.sr}</span>
    </span>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && <button className="toast-action" onClick={toast.action.onClick}>{toast.action.label}</button>}
    </div>
  );
}
