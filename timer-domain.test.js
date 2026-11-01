import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {startTimer,pauseTimer,resumeTimer,stopTimer,timerElapsedMs,timerPauseMs,timerEntryPreset,validateTimer,formatTimerElapsed} from './timer-domain.js';
const meta={id:'timer-example',jobId:'job-example',scheme:'3',vehicle:'TEST-001',driver:'Eksempel Person',route:'Eksempel',planId:'plan-example'};
const begin=new Date(2026,10,2,6,0,0).getTime();
test('actual timer excludes multiple unpaid pauses and retains plan metadata',()=>{let t=startTimer(meta,begin);t=pauseTimer(t,begin+2*3600000);t=resumeTimer(t,begin+2*3600000+15*60000);t=pauseTimer(t,begin+4*3600000);t=resumeTimer(t,begin+4*3600000+10*60000);t=stopTimer(t,begin+8*3600000);assert.equal(timerElapsedMs(t),8*3600000-25*60000);const p=timerEntryPreset(t);assert.equal(p.start,'06:00');assert.equal(p.end,'14:00');assert.equal(p.breakMinutes,25);assert.equal(p.planId,meta.planId);assert.equal(p.timerId,meta.id);});
test('paused timer survives JSON reload and stopping includes the active pause',()=>{let t=pauseTimer(startTimer(meta,begin),begin+3600000);t=JSON.parse(JSON.stringify(t));assert.equal(validateTimer(t).ok,true);assert.equal(timerElapsedMs(t,begin+2*3600000),3600000);assert.equal(timerPauseMs(t,begin+2*3600000),3600000);t=stopTimer(t,begin+3*3600000);assert.equal(t.pauseMs,2*3600000);assert.equal(timerElapsedMs(t),3600000);assert.deepEqual(stopTimer(t,begin+8*3600000),t);});
test('overnight timer retains the start date; minute-sized forms never invent a full-day shift',()=>{const night=new Date(2026,10,2,22).getTime();const p=timerEntryPreset(stopTimer(startTimer(meta,night),night+8*3600000));assert.equal(p.date,'2026-11-02');assert.equal(p.start,'22:00');assert.equal(p.end,'06:00');const short=timerEntryPreset(stopTimer(startTimer(meta,begin),begin+20000));assert.equal(short.end,'');assert.throws(()=>timerEntryPreset(stopTimer(startTimer(meta,begin),begin+86400000)),/døgn/);});
test('malformed clocks, states and unknown fields cannot become an active timer',()=>{const t=startTimer(meta,begin);assert.equal(validateTimer({...t,startedAt:'bad'}).ok,false);assert.equal(validateTimer({...t,status:'paused'}).ok,false);assert.equal(validateTimer({...t,unexpected:'data'}).ok,false);assert.throws(()=>resumeTimer(t,begin+1));assert.throws(()=>pauseTimer(t,begin-1));assert.equal(formatTimerElapsed(27*3600000+61000),'27:01:01');});
test('nonfinite event timestamps and nonrepresentable dates never produce persisted timer states',()=>{
  const running=startTimer(meta,begin),paused=pauseTimer(running,begin+60000);
  for(const now of [NaN,Infinity,-Infinity,1e30]){
    assert.throws(()=>pauseTimer(running,now));
    assert.throws(()=>resumeTimer(paused,now));
    assert.throws(()=>stopTimer(running,now));
    assert.throws(()=>stopTimer(paused,now));
    assert.throws(()=>startTimer(meta,now));
  }
  assert.equal(validateTimer({...running,pauseMs:1e30}).ok,false);
});
test('last event survives reload and blocks clock rollback after a resumed pause',()=>{
  let t=pauseTimer(startTimer(meta,begin),begin+3600000);
  t=resumeTimer(t,begin+2*3600000);
  t=JSON.parse(JSON.stringify(t));
  assert.equal(t.lastEventAt,begin+2*3600000);
  assert.throws(()=>stopTimer(t,begin+90*60000),/klokkeslæt/);
  assert.throws(()=>pauseTimer(t,begin+90*60000),/klokkeslæt/);
  assert.equal(validateTimer(t).ok,true);
  const legacy={...t};delete legacy.lastEventAt;
  assert.equal(validateTimer(legacy).ok,true);
  assert.equal(stopTimer(legacy,begin+3*3600000).lastEventAt,begin+3*3600000);
});
test('daylight-saving transitions cannot silently turn elapsed time into a different paid duration',()=>{
  const moduleUrl=new URL('./timer-domain.js',import.meta.url).href;
  const code=`import {startTimer,stopTimer,timerEntryPreset} from ${JSON.stringify(moduleUrl)};const t=stopTimer(startTimer({jobId:'synthetic-job'},Date.parse('2028-10-29T00:30:00Z')),Date.parse('2028-10-29T02:30:00Z'));try{timerEntryPreset(t);process.exitCode=2;}catch(error){if(!error.message.includes('sommer- og vintertid'))throw error;}`;
  const result=spawnSync(process.execPath,['--input-type=module','--eval',code],{env:{...process.env,TZ:'Europe/Copenhagen'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
