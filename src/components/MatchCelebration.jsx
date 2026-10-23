import { useEffect } from "react";
import { Heart } from "lucide-react";

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

// Brief, non-blocking confirmation: it floats over the deck without a scrim,
// so swiping can carry on underneath, and dismisses itself.
export default function MatchCelebration({ match, names, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4200);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.key]);

  return (
    <div className="match-layer">
      <button className="match-card" onClick={onClose} aria-label={`You both picked ${match.title}. Added to your list. Dismiss`}>
        <span className="match-avatars" aria-hidden="true">
          <span className="avatar avatar-a">{initial(names[0])}</span>
          <span className="match-heart"><Heart size={13} fill="currentColor" /></span>
          <span className="avatar avatar-b">{initial(names[1])}</span>
        </span>
        <span className="match-text">
          <span className="match-title">You both picked this</span>
          <span className="match-movie">{match.title}</span>
          <span className="match-sub">Added to your list</span>
        </span>
        {match.poster && <img className="match-poster" src={match.poster} alt="" />}
      </button>
      <span className="visually-hidden" role="status">{`You both picked ${match.title}. Added to your list.`}</span>
    </div>
  );
}
