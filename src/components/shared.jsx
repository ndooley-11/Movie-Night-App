import { Film, Tv, Star, Check, X } from "lucide-react";

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
