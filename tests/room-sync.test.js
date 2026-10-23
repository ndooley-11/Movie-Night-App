import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,doc,setDoc,getDoc,deleteDoc,runTransaction,onSnapshot,terminate} from 'firebase/firestore';
import {db} from '../src/firebase.js';
import {withReview,withProgress} from '../src/lib/personalMedia.js';
import {renamedRoom} from '../src/lib/players.js';

test('two Firebase clients preserve simultaneous personal updates and receive live snapshots', {skip:process.env.MOVIENIGHT_LIVE_TEST !== '1',timeout:45000}, async()=>{
 const secondApp=initializeApp(db.app.options,`movie-night-check-${Date.now()}`);
 const secondDb=getFirestore(secondApp);
 // This test creates and removes only its own unique disposable room.
 const id=`codex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const ref=doc(db,'movienight',id), otherRef=doc(secondDb,'movienight',id);
 let unsubscribe;
 try {
  await setDoc(ref,{settings:{names:['Nico','Syd'],services:{Nico:['Netflix'],Syd:[]}},movies:[{id:'show',mediaType:'tv',ratings:{Nico:4,Syd:5}}],swipes:{Nico:{123:'like'}}});
  const live=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Live sync timed out')),30000);
   unsubscribe=onSnapshot(otherRef,snapshot=>{const data=snapshot.data(); if(data?.settings?.names?.[0]==='New Nico' && data?.movies?.[0]?.reviews?.p0 && data?.movies?.[0]?.showProgress?.p1){clearTimeout(timer);resolve(data);}},reject);
  });
  await Promise.all([
   runTransaction(db,async tx=>{const snap=await tx.get(ref);const data=snap.data(); tx.update(ref,{movies:data.movies.map(m=>withReview(m,0,{text:'Concurrent review',spoiler:false}))});}),
   runTransaction(secondDb,async tx=>{const snap=await tx.get(otherRef);const data=snap.data(); tx.update(otherRef,{movies:data.movies.map(m=>withProgress(m,1,{season:2,episode:3,completed:false}))});}),
   runTransaction(db,async tx=>{const snap=await tx.get(ref);const data=snap.data();tx.update(ref,renamedRoom(data,{...data.settings,names:['New Nico','Syd']}));}),
  ]);
  const observed=await live;
  const saved=(await getDoc(otherRef)).data();
  assert.equal(saved.movies[0].reviews.p0.text,'Concurrent review');
  assert.equal(saved.movies[0].showProgress.p1.episode,3);
  assert.equal(saved.movies[0].ratings['New Nico'],4);
  assert.deepEqual(saved.settings.services['New Nico'],['Netflix']);
  assert.equal(observed.movies[0].showProgress.p1.season,2);
 } finally {
  unsubscribe?.();
  await deleteDoc(ref);
  await terminate(secondDb); await deleteApp(secondApp); await terminate(db);
 }
});
