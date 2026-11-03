import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataStore} from './data-store.js';
import {emptyState} from './domain.js';
const KEY='arbejde.data.v1';
function setup(raw=null){const values=new Map(raw===null?[]:[[KEY,raw]]);let fail=false;const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail)throw Error('quota');values.set(k,v);}};return {values,store:createDataStore(storage),fail:v=>fail=v};}
test('invalid and empty persisted strings stay untouched until an explicit valid restore',()=>{
  for(const raw of ['{broken','',JSON.stringify({version:999})]){
    const s=setup(raw),state=s.store.load();state.settings.name='Draft';
    assert.equal(s.store.needsRecovery,true);assert.equal(s.store.rawRecovery,raw);
    assert.equal(s.store.save(state).ok,false);assert.equal(s.values.get(KEY),raw);
    assert.equal(s.store.save(state,{restoreBackup:true}).ok,true);assert.equal(s.store.needsRecovery,false);
    assert.equal(JSON.parse(s.values.get(KEY)).settings.name,'Draft');
  }
});
test('failed or invalid restore preserves the original bytes and the recovery state',()=>{
  const s=setup('{original'),state=s.store.load();s.fail(true);
  assert.equal(s.store.save(state,{restoreBackup:true}).ok,false);assert.equal(s.values.get(KEY),'{original');assert.equal(s.store.rawRecovery,'{original');
  s.fail(false);assert.equal(s.store.save({...state,unknown:true},{restoreBackup:true}).ok,false);assert.equal(s.values.get(KEY),'{original');
});
test('a delayed storage event cannot let an old tab overwrite newer or cleared data',()=>{
  const initial=emptyState(),s=setup(JSON.stringify(initial)),draft=s.store.load();draft.settings.name='Old draft';
  const newer=emptyState();newer.settings.name='Newer';s.values.set(KEY,JSON.stringify(newer));
  assert.equal(s.store.save(draft).ok,false);assert.equal(JSON.parse(s.values.get(KEY)).settings.name,'Newer');
  s.store.accept(s.values.get(KEY));s.values.delete(KEY);assert.equal(s.store.save(draft).ok,false);assert.equal(s.values.has(KEY),false);
  const cleared=s.store.accept(null);assert.equal(cleared.state.entries.length,0);assert.equal(s.store.save(cleared.state).ok,true);
});
test('valid legacy data loads, and an unavailable initial read never writes a fallback over it',()=>{
  const state=emptyState();delete state.directory;const s=setup(JSON.stringify(state));assert.equal(s.store.load().jobs.length,state.jobs.length);assert.equal(s.store.save(s.store.load()).ok,true);
  let writes=0;const blocked=createDataStore({getItem(){throw Error('denied')},setItem(){writes++}});
  const fallback=blocked.load();assert.equal(blocked.readBlocked,true);assert.equal(blocked.save(fallback,{restoreBackup:true}).ok,false);assert.equal(writes,0);
});
