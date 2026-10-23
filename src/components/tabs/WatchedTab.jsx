import { useState } from "react";
import { Undo2, Users, Check } from "lucide-react";
import { Stars, PosterThumb } from "../shared.jsx";
import { seenByOf, seenStatus } from "../../lib/seen.js";

export default function WatchedTab({ movies, me, partner, names, setRating, markSeen, markUnseen, openDetails }) {
  const [filter, setFilter] = useState("all");
  const watched = movies.filter((m) => m.watched).sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
  const statusOf = (m) => seenStatus(m, me, partner, names);
  const counts = { all: watched.length, both: 0, me: 0, partner: 0 };
  watched.forEach((m) => { counts[statusOf(m)] = (counts[statusOf(m)] || 0) + 1; });
  const list = filter === "all" ? watched : watched.filter((m) => statusOf(m) === filter);

  const FILTERS = [
    ["all", "All"],
    ["both", "Together"],
    ["me", `Only you`],
    ["partner", `Only ${partner}`],
  ];

  return (
    <div>
      <h2 className="section-title">Watched <span className="section-count">{watched.length}</span></h2>
      {watched.length > 0 && (
        <div className="chip-scroll" role="group" aria-label="Filter watched">
          {FILTERS.map(([val, label]) => (
            <button key={val} className={"chip" + (filter === val ? " active" : "")} aria-pressed={filter === val} onClick={() => setFilter(val)}>
              {label} <span className="chip-count">{counts[val] || 0}</span>
            </button>
          ))}
        </div>
      )}
      {watched.length === 0 && <div className="empty-state">Nothing watched yet. Roll something in Pick and enjoy the show.</div>}
      {watched.length > 0 && list.length === 0 && (
        <div className="empty-state">
          {filter === "partner" ? `Nothing ${partner} has seen without you.` : filter === "me" ? `You haven't watched anything without ${partner}.` : "Nothing here yet."}
        </div>
      )}
      <ul className="list">
        {list.map((m) => {
          const seenBy = seenByOf(m, names);
          const status = statusOf(m);
          return (
            <li key={m.id} className="media-row watched-row">
              <button className="media-row-main" onClick={() => openDetails(m)} aria-label={`${m.title}, show details`}>
                <PosterThumb poster={m.poster} />
                <span className="media-row-body">
                  <span className="media-row-title">{m.title}</span>
                  <span className={"seen-badge seen-" + status}>
                    {status === "both" ? <><Users size={13} aria-hidden="true" /> Watched together</> : <>Only {status === "me" ? "you" : partner} {status === "me" ? "have" : "has"} seen it</>}
                  </span>
                  {m.watchedAt && <span className="meta-row">{new Date(m.watchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
                </span>
              </button>
              <div className="person-lines">
                <PersonLine name={me} isMe seen={!!seenBy[me]} rating={m.ratings?.[me] || 0} onRate={(v) => setRating(m.id, v)} onSeen={() => markSeen(m.id, "me")} />
                <PersonLine name={partner} seen={!!seenBy[partner]} rating={m.ratings?.[partner] || 0} />
              </div>
              <button className="icon-btn row-corner" onClick={() => markUnseen(m.id)} aria-label={`Move ${m.title} back to the list`} title="Move back to list">
                <Undo2 size={17} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PersonLine({ name, isMe, seen, rating, onRate, onSeen }) {
  return (
    <div className={"person-line" + (seen ? "" : " unseen")}>
      <span className="person-name">
        {seen && <Check size={13} className="person-check" aria-hidden="true" />}
        {isMe ? "You" : name}
      </span>
      {seen
        ? (isMe
          ? <Stars value={rating} onChange={onRate} size={17} label="Your rating" />
          : <Stars value={rating} readOnly size={17} label={`${name}'s rating`} />)
        : (isMe
          ? <button className="btn btn-outline btn-sm" onClick={onSeen}>I've seen it</button>
          : <span className="muted">Hasn't seen it yet</span>)}
    </div>
  );
}
