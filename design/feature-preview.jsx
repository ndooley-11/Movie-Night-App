// Development-only component fixture. No Firebase imports, keys or live room.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shuffle, Eye } from 'lucide-react';
import '../src/styles.css';
import './feature-preview.css';
import PickTab from '../src/components/tabs/PickTab.jsx';
import WatchedTab from '../src/components/tabs/WatchedTab.jsx';
import { BrandMark } from '../src/components/shared.jsx';
import { samePosition } from '../src/lib/players.js';
import { withReview, withProgress, allFinishedTogether } from '../src/lib/personalMedia.js';

const names = ['Nico', 'Syd'];
const sample = [
  { id: 'mando', title: 'The Mandalorian and Grogu', poster: 'https://image.tmdb.org/t/p/w342/7GV5rrUJf0BRUhoh2cyFoeNthlQ.jpg', genreNames: ['Action', 'Adventure'] },
  { id: 'moana', title: 'Moana', poster: 'https://image.tmdb.org/t/p/w342/zKVgiv5qHCvCLT4A2ymJi5QeXDH.jpg', genreNames: ['Family', 'Fantasy'] },
  { id: 'hail', title: 'Project Hail Mary', poster: 'https://image.tmdb.org/t/p/w342/yihdXomYb5kTeSivtFndMy5iDmf.jpg', genreNames: ['Science Fiction', 'Adventure'] },
  { id: 'mario', title: 'The Super Mario Galaxy Movie', poster: 'https://image.tmdb.org/t/p/w342/eJGWx219ZcEMVQJhAgMiqo8tYY.jpg', genreNames: ['Family', 'Comedy'] },
  { id: 'fallback', title: 'A film without artwork', poster: null, genreNames: ['Drama'] },
  { id: 'watched', title: 'Our last movie night', watched: true, watchedAt: Date.now(), seenBy: { Nico: 1, Syd: 1 }, ratings: { Nico: 4, Syd: 5 }, genreNames: ['Drama'], reviews: { p0: { text: 'The quiet scenes stayed with me. A lovely one to watch together.', spoiler: false, updatedAt: Date.now() }, p1: { text: 'The ending completely changed how I understood the opening scene.', spoiler: true, updatedAt: Date.now() } } },
  { id: 'show', tmdbId: 1, mediaType: 'tv', title: 'Our shared show · sample', watchingTogether: true, watched: false, genreNames: ['Drama'], showProgress: { p0: { season: 1, episode: 10 }, p1: { season: 2, episode: 2 } } },
].map(m => ({ mediaType: 'movie', year: '2026', ...m }));
const metadata = { complete: true, status: 'Returning Series', episodes: [
  ...Array.from({ length: 10 }, (_, i) => ({ season: 1, episode: i + 1, name: `Episode ${i + 1}`, airDate: '2025-01-01' })),
  ...Array.from({ length: 6 }, (_, i) => ({ season: 2, episode: i + 1, name: `Episode ${i + 1}`, airDate: i < 4 ? '2026-01-01' : '2099-01-01' })),
] };
const loadEpisodes = async () => metadata;

function Preview() {
  const [tab, setTab] = useState('pick'), [meIdx, setMeIdx] = useState(0), [fail, setFail] = useState(false);
  const [movies, setMovies] = useState(() => { try { return JSON.parse(localStorage.getItem('mn-feature-fixture')) || sample; } catch { return sample; } });
  const [notice, setNotice] = useState('');
  const [tonight, setTonight] = useState(null);
  async function update(id, fn) {
    if (fail) throw new Error('Simulated save failure. Your draft is retained.');
    const next = movies.map(m => m.id === id ? fn(m) : m); localStorage.setItem('mn-feature-fixture', JSON.stringify(next)); setMovies(next);
  }
  const startShow = id => update(id, m => ({ ...m, watchingTogether: true, watched: false, showProgress: { ...m.showProgress, [`p${meIdx}`]: m.showProgress?.[`p${meIdx}`] ? { ...m.showProgress[`p${meIdx}`], completed: false } : null } }));
  const saveProgress = (id, p, options = {}) => update(id, m => { if ('expectedPosition' in options && !samePosition(m.showProgress?.['p'+meIdx],options.expectedPosition)) throw new Error('Progress changed elsewhere.'); const next = withProgress(m, meIdx, p); const finished = allFinishedTogether(next, names.length); return { ...next, watched: finished, watchingTogether: true, ...(finished ? { seenBy: { Nico: 1, Syd: 1 }, watchedAt: Date.now() } : {}) }; });
  const markSeen = id => update(id, m => ({ ...m, watched: true, watchedAt: Date.now(), seenBy: { Nico: 1, Syd: 1 } }));
  return <div className="app">
    <header className="topbar"><h1 className="brand"><BrandMark size={24} /> Movie Night</h1><span className="hint">Local sample</span></header>
    <div className="fixture-controls"><label>Preview as <select aria-label="Preview player" value={meIdx} onChange={e => setMeIdx(Number(e.target.value))}>{names.map((n,i) => <option key={n} value={i}>{n}</option>)}</select></label><label><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} /> Simulate save error</label></div>
    <main className={'content' + (tab === 'pick' ? ' content-pick' : '')}>
      {tab === 'pick' ? <PickTab movies={movies} me={names[meIdx]} partner={names[1-meIdx]} allGenres={[...new Set(movies.flatMap(m => m.genreNames || []))].sort()} contentType="both" tonight={tonight} onChooseTonight={async id => { if (fail) throw new Error("Could not save your choice."); setTonight({movieId:id}); }} onClearTonight={async () => setTonight(null)} onFinishTonight={async id => { setTonight(null); return movies.find(m => m.id === id)?.mediaType === 'tv' ? startShow(id) : markSeen(id); }} openDetails={m => setNotice(m.title)} />
        : <WatchedTab movies={movies} me={names[meIdx]} partner={names[1-meIdx]} names={names} meIdx={meIdx} settings={{ apiKey: 'fixture-only' }} roomCode="local-feature-preview" saveReview={(id, r, options = {}) => update(id, m => { if (options.onlyIfAbsent && m.reviews?.["p"+meIdx]) throw new Error("A newer review exists."); return withReview(m, meIdx, r); })} saveProgress={saveProgress} startShow={startShow} setRating={(id,r) => update(id,m=>({...m,ratings:{...m.ratings,[names[meIdx]]:r}}))} markSeen={markSeen} markUnseen={id => update(id,m=>({...m,watched:false,watchingTogether:false}))} openDetails={m => setNotice(m.title)} loadEpisodes={loadEpisodes} />}
      {notice && <p role="status" className="hint">Details preview: {notice}</p>}
    </main>
    <nav className="tabbar" aria-label="Preview navigation"><button className={'tab'+(tab==='pick'?' active':'')} onClick={()=>setTab('pick')}><Shuffle size={20} />Pick</button><button className={'tab'+(tab==='watched'?' active':'')} onClick={()=>setTab('watched')}><Eye size={20} />Watched</button></nav>
  </div>;
}
const previewRoot = createRoot(document.getElementById('root'));
previewRoot.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());


