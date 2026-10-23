import { useState, useEffect } from "react";
import { Copy, LogOut, Repeat } from "lucide-react";

const SERVICES = ["Netflix", "Hulu", "Max", "Disney+", "Prime Video", "Apple TV+", "Paramount+", "Peacock"];
const REGIONS = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"]];
const CONTENT_TYPES = [["movies", "Movies"], ["shows", "Shows"], ["both", "Both"]];

export default function SettingsTab({ settings, saveSettings, me, showToast, roomCode, onLeaveRoom, meIdx, saveMeIdx }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);

  function update(patch) { setLocal({ ...local, ...patch }); }
  async function save() { await saveSettings(local); showToast("Settings saved"); }

  function toggleService(name, svc) {
    const list = local.services[name] || [];
    const next = list.includes(svc) ? list.filter((s) => s !== svc) : [...list, svc];
    update({ services: { ...local.services, [name]: next } });
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode).then(() => showToast("Room code copied")).catch(() => {});
  }

  const partnerName = local.names[1 - meIdx];

  return (
    <div className={"settings" + (dirty ? " has-savebar" : "")}>
      <h2 className="section-title">Room</h2>
      <div className="panel">
        <div className="room-code">{roomCode}</div>
        <p className="hint center">Share this code so your partner can join the same list.</p>
        <div className="room-card-actions">
          <button className="btn btn-outline" onClick={copyCode}><Copy size={15} aria-hidden="true" /> Copy code</button>
          <button className="btn btn-outline" onClick={onLeaveRoom}><LogOut size={15} aria-hidden="true" /> Leave room</button>
        </div>
      </div>

      <h2 className="section-title">Who's playing</h2>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Person 1</span>
          <input className="input" value={local.names[0]} onChange={(e) => update({ names: [e.target.value, local.names[1]] })} />
        </label>
        <label className="field">
          <span className="field-label">Person 2</span>
          <input className="input" value={local.names[1]} onChange={(e) => update({ names: [local.names[0], e.target.value] })} />
        </label>
      </div>
      <button className="link-btn" onClick={() => saveMeIdx(1 - meIdx)}>
        <Repeat size={13} aria-hidden="true" /> <span>This phone is <b>{me}</b>. Switch to {partnerName}</span>
      </button>

      <h2 className="section-title">What shows up</h2>
      <div className="segmented" role="group" aria-label="Content type">
        {CONTENT_TYPES.map(([val, label]) => (
          <button key={val} className={(local.contentType || "both") === val ? "active" : ""} aria-pressed={(local.contentType || "both") === val} onClick={() => update({ contentType: val })}>{label}</button>
        ))}
      </div>
      <p className="hint">Applies to Discover, Suggest and Pick for both of you. Your Watched history always stays visible.</p>

      <h2 className="section-title">{me}'s streaming services</h2>
      <div className="chip-row" role="group" aria-label="Your streaming services">
        {SERVICES.map((s) => {
          const on = (local.services[me] || []).includes(s);
          return <button key={s} className={"chip" + (on ? " active" : "")} aria-pressed={on} onClick={() => toggleService(me, s)}>{s}</button>;
        })}
      </div>
      <label className="field">
        <span className="field-label">Region</span>
        <select className="input" value={local.region} onChange={(e) => update({ region: e.target.value })}>
          {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>

      <h2 className="section-title">Data sources</h2>
      <label className="field">
        <span className="field-label">TMDB API key <span className="required">required</span></span>
        <input className="input" type="password" autoComplete="off" placeholder="Paste your TMDB API key" value={local.apiKey} onChange={(e) => update({ apiKey: e.target.value })} />
        <span className="hint">Free at themoviedb.org → Settings → API. Powers search, Discover, cast and trailers.</span>
      </label>
      <label className="field">
        <span className="field-label">OMDb API key <span className="muted">optional</span></span>
        <input className="input" type="password" autoComplete="off" placeholder="Paste your OMDb API key" value={local.omdbKey || ""} onChange={(e) => update({ omdbKey: e.target.value })} />
        <span className="hint">Free at omdbapi.com/apikey.aspx. Adds Rotten Tomatoes and IMDb scores to cards. The free plan allows 1,000 lookups a day, shared by both of you.</span>
      </label>
      <label className="field">
        <span className="field-label">Trakt Client ID <span className="muted">optional</span></span>
        <input className="input" type="password" autoComplete="off" placeholder="Paste your Trakt Client ID" value={local.traktClientId || ""} onChange={(e) => update({ traktClientId: e.target.value })} />
        <span className="hint">Free at trakt.tv/oauth/applications. Blends Trakt's trending list into Discover.</span>
      </label>

      <div className="install-tip">
        <b>Use it like an app:</b> in Safari, tap Share, then "Add to Home Screen". It opens full screen with its own icon.
      </div>

      {dirty && (
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span>Unsaved changes</span>
          <div className="savebar-actions">
            <button className="btn btn-outline btn-sm" onClick={() => setLocal(settings)}>Discard</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
