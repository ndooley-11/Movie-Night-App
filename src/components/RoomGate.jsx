import { useState } from "react";
import { Clapperboard, Users, ArrowRight } from "lucide-react";
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from "../lib/room.js";

export default function RoomGate({ onJoin, onCreate }) {
  const [mode, setMode] = useState("join");
  const [code, setCode] = useState("");
  const [names, setNames] = useState(["", ""]);
  const [error, setError] = useState("");

  function join() {
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError("Enter the room code your partner shared with you.");
      return;
    }
    onJoin(normalized);
  }

  function create() {
    if (!names[0].trim() || !names[1].trim()) {
      setError("Enter both names so you can tell your picks apart.");
      return;
    }
    const newCode = generateRoomCode();
    onCreate(newCode, [names[0].trim(), names[1].trim()]);
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand"><Clapperboard size={26} /><span>Movie Night</span></div>
        <p className="gate-sub">A shared watchlist for two. Pick a room to get started.</p>

        <div className="segmented">
          <button className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }}>Join a room</button>
          <button className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>Start a room</button>
        </div>

        {mode === "join" ? (
          <div className="gate-form">
            <label className="field-label" htmlFor="room-code">Room code</label>
            <input
              id="room-code"
              className="input"
              placeholder="e.g. amber-otter-42"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button className="btn btn-primary" onClick={join}>Join room <ArrowRight size={16} /></button>
          </div>
        ) : (
          <div className="gate-form">
            <label className="field-label" htmlFor="name-a">Your name</label>
            <input id="name-a" className="input" placeholder="Your name" value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} autoCapitalize="words" autoComplete="given-name" enterKeyHint="next" />
            <label className="field-label" htmlFor="name-b">Partner's name</label>
            <input id="name-b" className="input" placeholder="Partner's name" value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} onKeyDown={(e) => e.key === "Enter" && create()} autoCapitalize="words" autoComplete="off" enterKeyHint="go" />
            <button className="btn btn-primary" onClick={create}><Users size={16} /> Create room</button>
            <p className="hint">You'll get a short code right after — share it with your partner so they can join.</p>
          </div>
        )}

        {error && <p className="gate-error">{error}</p>}
      </div>
    </div>
  );
}
