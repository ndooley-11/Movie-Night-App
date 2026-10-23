import test from 'node:test';
import assert from 'node:assert/strict';
import { validNames, renamedRoom, samePosition } from '../src/lib/players.js';

test('renaming and swapping names preserves both players and personal slots', () => {
 const settings = {names:['Nico','Syd'],services:{Nico:['netflix'],Syd:['hulu']}};
 const room = {settings, swipes:{Nico:{1:'like'},Syd:{2:'pass'}}, movies:[{id:1,addedBy:'Nico + Syd',ratings:{Nico:4,Syd:5},seenBy:{Nico:1},hype:{Syd:true},reviews:{p0:{text:'Keep me'}},showProgress:{p1:{season:2,episode:3}}}]};
 const result = renamedRoom(room,{...settings,names:['Syd','Nico']});
 assert.deepEqual(result.settings.services,{Syd:['netflix'],Nico:['hulu']});
 assert.deepEqual(result.swipes,{Syd:{1:'like'},Nico:{2:'pass'}});
 assert.deepEqual(result.movies[0].ratings,{Syd:4,Nico:5});
 assert.deepEqual(result.movies[0].seenBy,{Syd:1});
 assert.deepEqual(result.movies[0].hype,{Nico:true});
 assert.equal(result.movies[0].addedBy,'Syd + Nico');
 assert.deepEqual(result.movies[0].reviews,room.movies[0].reviews);
 assert.deepEqual(result.movies[0].showProgress,room.movies[0].showProgress);
 assert.deepEqual(room.settings.names,['Nico','Syd']);
});
test('player names trim and reject duplicate or empty values', () => {
 assert.deepEqual(validNames([' Nico ','Syd']),['Nico','Syd']);
 for (const names of [['Nico','nico'],['','Syd'],['x'],['x'.repeat(41),'Syd']]) assert.throws(() => validNames(names));
});
test('undo position comparison includes completion and handles not started', () => {
 assert.equal(samePosition(null,undefined),true);
 assert.equal(samePosition({season:1,episode:2},{season:1,episode:2,completed:false}),true);
 assert.equal(samePosition({season:1,episode:2},{season:1,episode:2,completed:true}),false);
 assert.equal(samePosition({season:1,episode:2},{season:1,episode:3}),false);
});
