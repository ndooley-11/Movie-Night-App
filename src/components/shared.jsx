import { Film, Tv, Star, Check, X } from "lucide-react";

export function Stars({ value, onChange, size = 16 }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="star-btn" onClick={() => onChange(n === value ? 0 : n)} aria-label={`Rate ${n}`}>
          <Star size={size} fill={value >= n ? "var(--gold)" : "none"} color={value >= n ? "var(--gold)" : "var(--text-faint)"} />
        </button>
      ))}
    </div>
  );
}

export function TabBtn({ icon, label, active, onClick }) {
  return (
    <button className={"tab" + (active ? " active" : "")} onClick={onClick} aria-current={active}>
      {icon}<span>{label}</span>
    </button>
  );
}

export function MediaTypeTag({ mediaType }) {
  return (
    <span className="media-tag">
      {mediaType === "tv" ? <Tv size={10} /> : <Film size={10} />}
      {mediaType === "tv" ? "Show" : "Movie"}
    </span>
  );
}

export function PosterThumb({ poster, size = "md" }) {
  return poster
    ? <img className={"poster poster-" + size} src={poster} alt="" />
    : <div className={"poster poster-fallback poster-" + size}>{<Film size={18} />}</div>;
}

export function AvailabilityBadge({ providers, haveIt }) {
  if (providers?.flatrate?.length > 0) {
    return (
      <span className={"badge " + (haveIt ? "badge-have" : "badge-nohave")}>
        {haveIt ? <Check size={11} /> : <X size={11} />} {providers.flatrate.slice(0, 2).join(", ")}
      </span>
    );
  }
  if (providers?.rent?.length > 0) return <span className="badge badge-rent">Rent / buy</span>;
  return <span className="badge badge-unknown">No streaming data</span>;
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
