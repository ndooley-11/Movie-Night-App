import { useState, useEffect } from "react";
import { Copy, LogOut, RefreshCcw } from "lucide-react";

const SERVICES = ["Netflix", "Hulu", "Max", "Disney+", "Prime Video", "Apple TV+", "Paramount+", "Peacock"];
const REGIONS = [["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"]];
const CONTENT_TYPES = [["movies", "Movies"], ["shows", "Shows"], ["both", "Both"]];
const LANGUAGES = [["any", "Any"], ["en", "English"], ["non-en", "Non-English"]];

export default function SettingsTab({ settings, saveSettings, me, showToast, roomCode, onLeaveRoom, meIdx, saveMeIdx }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

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

  return (
    <div>
      <h2 className="section-title">Room</h2>
      <div className="room-card">
        <div className="room-code">{roomCode}</div>
        <div className="room-card-actions">
          <button className="btn btn-outline" onClick={copyCode}><Copy size={14} /> Copy code</button>
          <button className="btn btn-outline" onClick={onLeaveRoom}><LogOut size={14} /> Leave room</button>
        </div>
        <p className="hint">Share this code with your partner so they can join the same list.</p>
      </div>

      <h2 className="section-title">Who's playing</h2>
      <div className="field-row">
        <input className="input" value={local.names[0]} onChange={(e) => update({ names: [e.target.value, local.names[1]] })} />
        <input className="input" value={local.names[1]} onChange={(e) => update({ names: [local.names[0], e.target.value] })} />
      </div>
      <button className="link-btn" onClick={() => saveMeIdx(1 - meIdx)}>
        <RefreshCcw size={12} /> You're currently viewing as <b>{me}</b> — tap to switch
      </button>

      <h2 className="section-title">What shows up</h2>
      <p className="hint">Controls Suggest, Discover, and Pick — your Watched history always stays visible.</p>
      <div className="segmented">
        {CONTENT_TYPES.map(([val, label]) => (
          <button key={val} className={(local.contentType || "both") === val ? "active" : ""} onClick={() => update({ contentType: val })}>{label}</button>
        ))}
      </div>

      <h2 className="section-title">Language</h2>
      <div className="segmented">
        {LANGUAGES.map(([val, label]) => (
          <button key={val} className={(local.language || "any") === val ? "active" : ""} onClick={() => update({ language: val })}>{label}</button>
        ))}
      </div>

      <h2 className="section-title">TMDB API key</h2>
      <p className="hint">Free at themoviedb.org → Settings → API. Enables search, discover, and streaming lookup.</p>
      <input className="input" type="password" placeholder="Paste your TMDB API key" value={local.apiKey} onChange={(e) => update({ apiKey: e.target.value })} />

      <h2 className="section-title">Trakt Client ID <span className="muted">(optional)</span></h2>
      <p className="hint">Free from trakt.tv/oauth/applications. Blends Trakt's trending data into the "trending" quarter of Discover.</p>
      <input className="input" type="password" placeholder="Paste your Trakt Client ID" value={local.traktClientId || ""} onChange={(e) => update({ traktClientId: e.target.value })} />

      <h2 className="section-title">Region</h2>
      <select className="input" value={local.region} onChange={(e) => update({ region: e.target.value })}>
        {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>

      <h2 className="section-title">{me}'s streaming services</h2>
      <div className="chip-row">
        {SERVICES.map((s) => (<button key={s} className={"chip" + ((local.services[me] || []).includes(s) ? " active" : "")} onClick={() => toggleService(me, s)}>{s}</button>))}
      </div>

      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={save}>Save settings</button>

      <div className="install-tip">
        <b>Add to your home screen:</b> open the share menu in your browser and choose "Add to Home Screen" (iPhone) or "Install app" (Android).
      </div>
    </div>
  );
}
