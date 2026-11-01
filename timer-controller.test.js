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
