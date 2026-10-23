import test from 'node:test';
import assert from 'node:assert/strict';
import {tonightChoice,moviePatch} from '../src/lib/roomUpdates.js';
test('choosing tonight does not mark a movie watched or change reviews',()=>{
 const movies=[{id:'one',watched:false,reviews:{p0:{text:'hi'}}}];
 assert.deepEqual(tonightChoice(movies,'one',0,123),{movieId:'one',chosenBySlot:0,chosenAt:123});
 assert.equal(movies[0].watched,false);
 assert.throws(()=>tonightChoice(movies,'removed',0));
});
test('tonight survives unrelated edits, clears on finishing, starting, or removal, and supports rewatches',()=>{
 const data={movies:[{id:'one',watched:false}],tonight:{movieId:'one'}};
 assert.equal('tonight' in moviePatch(data,[{id:'one',watched:false,reviews:{p0:{text:'hi'}}}]),false);
 assert.equal(moviePatch(data,[{id:'one',watched:true}]).tonight,null);
 assert.equal(moviePatch(data,[{id:'one',watchingTogether:true}]).tonight,null);
 assert.equal(moviePatch(data,[]).tonight,null);
 assert.equal('tonight' in moviePatch({...data,movies:[{id:'one',watched:true}]},[{id:'one',watched:true,ratings:{Nico:5}}]),false);
 assert.equal(tonightChoice([{id:'one',watched:true}],'one',0).movieId,'one');
});
