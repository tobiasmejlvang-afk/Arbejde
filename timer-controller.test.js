import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimerController} from './timer-controller.js';
import {startTimer,pauseTimer} from './timer-domain.js';
const key='arbejde.timer.v1';
function storage(){const data=new Map();let fail=false;globalThis.localStorage={getItem:k=>data.get(k)||null,setItem(k,v){if(fail)throw Error('full');data.set(k,v);},removeItem(k){if(fail)throw Error('full');data.delete(k);}};return {data,setFail:v=>fail=v};}
test('timer reload retains a pause and delayed cross-tab changes are read before mutation',()=>{
  const {data}=storage(),a=createTimerController();a.start({id:'one',jobId:'j',scheme:'3'});
  const newer=pauseTimer(a.snapshot(),Date.now()+100);data.set(key,JSON.stringify(newer));
  assert.throws(()=>a.pause(),/kører ikke/);assert.equal(a.snapshot().status,'paused');
  const b=createTimerController();assert.equal(b.snapshot().pausedAt,newer.pausedAt);
});
test('a stale tab never removes a newer timer',()=>{
  const {data}=storage(),a=createTimerController();a.start({id:'old',jobId:'j'});
  const next=startTimer({id:'new',jobId:'j'});data.set(key,JSON.stringify(next));
  assert.throws(()=>a.clear('old'),/anden fane/);assert.equal(JSON.parse(data.get(key)).id,'new');
  a.reconcile([{timerId:'old'}]);assert.equal(JSON.parse(data.get(key)).id,'new');
});
test('storage failure preserves the in-memory timer for completion and reconciliation',()=>{
  const s=storage(),errors=[],a=createTimerController({onError:m=>errors.push(m)});s.setFail(true);
  a.start({id:'memory',jobId:'j'});a.pause();a.stop();assert.equal(a.snapshot().status,'stopped');
  assert.equal(a.preset().timerId,'memory');assert.ok(errors.length>=3);
  s.setFail(false);a.reconcile([{timerId:'memory'}]);assert.equal(a.snapshot(),null);
});
test('malformed persisted timers are never silently overwritten',()=>{
  const {data}=storage();data.set(key,'{broken');const a=createTimerController();assert.equal(a.snapshot(),null);
  assert.throws(()=>a.start({jobId:'j'}),/kunne ikke læses/);assert.equal(data.get(key),'{broken');
});
test('a timer changed between refresh and write is not overwritten or reconciled away',()=>{
  const {data}=storage(),a=createTimerController();a.start({id:'old',jobId:'j'});
  const originalGet=globalThis.localStorage.getItem,next=JSON.stringify(startTimer({id:'new',jobId:'j'}));
  let reads=0;
  globalThis.localStorage.getItem=k=>{if(++reads===2)data.set(key,next);return originalGet(k);};
  assert.throws(()=>a.pause(),/anden fane/);assert.equal(data.get(key),next);
  assert.equal(a.snapshot().id,'new');
  globalThis.localStorage.getItem=originalGet;
  const b=createTimerController();data.set(key,JSON.stringify(startTimer({id:'another',jobId:'j'})));
  reads=0;globalThis.localStorage.getItem=k=>{if(++reads===2)data.set(key,next);return originalGet(k);};
  b.reconcile([{timerId:'another'}]);assert.equal(data.get(key),next);
  globalThis.localStorage.getItem=originalGet;
});
test('storage clear events refresh the timer and disposed controllers stop listening',()=>{
  const previousWindow=globalThis.window,listeners=new Set();
  globalThis.window={addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
  try{
    const {data}=storage(),a=createTimerController();a.start({id:'event',jobId:'j'});
    data.clear();for(const listener of listeners)listener({key:null});
    assert.equal(a.snapshot(),null);a.dispose();assert.equal(listeners.size,0);
  }finally{globalThis.window=previousWindow;}
});
test('dirty memory cannot overwrite storage while reads fail, and recovers after reads resume',()=>{
  const {data,setFail}=storage(),a=createTimerController();setFail(true);a.start({id:'memory-read',jobId:'j'});
  const originalGet=globalThis.localStorage.getItem;globalThis.localStorage.getItem=()=>{throw Error('blocked');};
  assert.throws(()=>a.pause(),/kunne ikke læses/);assert.equal(a.snapshot().status,'running');assert.equal(data.size,0);
  globalThis.localStorage.getItem=originalGet;setFail(false);
  a.pause();assert.equal(a.snapshot().status,'paused');assert.equal(JSON.parse(data.get(key)).status,'paused');
});
test('returned timers are copies and a controller without an observed timer cannot clear a new one',()=>{
  const {data}=storage(),a=createTimerController();
  const created=a.start({id:'copy',jobId:'j'});created.status='stopped';assert.equal(a.snapshot().status,'running');
  a.clear('copy');data.set(key,JSON.stringify(startTimer({id:'new-unseen',jobId:'j'})));
  a.clear();assert.equal(JSON.parse(data.get(key)).id,'new-unseen');
});
