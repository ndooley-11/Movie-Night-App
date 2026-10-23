import { useId } from "react";
import { Film, Tv, Star, Check, X } from "lucide-react";

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

export function Stars({ value, onChange, size = 16, readOnly = false, label = "Rating" }) {
  if (readOnly) {
    return (
      <span className="stars" role="img" aria-label={value ? `${label}: ${value} of 5 stars` : `${label}: not rated`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="star-cell">
            <Star size={size} aria-hidden="true" fill={value >= n ? "var(--gold)" : "none"} color={value >= n ? "var(--gold)" : "var(--text-faint)"} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="star-btn" onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={value === n}>
          <Star size={size} aria-hidden="true" fill={value >= n ? "var(--gold)" : "none"} color={value >= n ? "var(--gold)" : "var(--text-faint)"} />
        </button>
      ))}
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

export function AvailabilityBadge({ providers, haveIt }) {
  if (providers?.flatrate?.length > 0) {
    return (
      <span className={"badge " + (haveIt ? "badge-have" : "badge-nohave")}>
        {haveIt ? <Check size={11} aria-hidden="true" /> : <X size={11} aria-hidden="true" />} {providers.flatrate.slice(0, 2).join(", ")}
      </span>
    );
  }
  if (providers?.rent?.length > 0) return <span className="badge badge-rent">Rent / buy</span>;
  return null;
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
