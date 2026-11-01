const keys=['version','id','status','startedAt','pausedAt','pauseMs','stoppedAt','lastEventAt','jobId','scheme','vehicle','driver','route','planId'];
const clone=value=>({...value});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const timestamp=value=>finite(value)&&value>0&&value<=8640000000000000;
const pad=n=>String(n).padStart(2,'0');
const localDate=stamp=>{const d=new Date(stamp);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const localTime=stamp=>{const d=new Date(stamp);return `${pad(d.getHours())}:${pad(d.getMinutes())}`;};
export function validateTimer(value){
  const errors=[];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return {ok:false,errors:['Timeren har et ugyldigt format.'],timer:null};
  if(Object.keys(value).some(k=>!keys.includes(k)))errors.push('Timeren indeholder ukendte felter.');
  if(value.version!==1||!['running','paused','stopped'].includes(value.status))errors.push('Timerens version eller status er ugyldig.');
  for(const k of ['id','jobId','scheme','vehicle','driver','route','planId'])if(typeof value[k]!=='string'||value[k].length>200)errors.push(`Timerens ${k} er ugyldig.`);
  if(!value.id||!value.jobId||!['3','4','5'].includes(value.scheme))errors.push('Timeren mangler job eller arbejdsuge.');
  if(!timestamp(value.startedAt)||!finite(value.pauseMs)||value.pauseMs<0||value.pauseMs>8640000000000000)errors.push('Timerens tid er ugyldig.');
  if(value.pausedAt!==null&&(!timestamp(value.pausedAt)||value.pausedAt<value.startedAt))errors.push('Pausens start er ugyldig.');
  if(value.stoppedAt!==null&&(!timestamp(value.stoppedAt)||value.stoppedAt<value.startedAt))errors.push('Timerens sluttid er ugyldig.');
  if(value.lastEventAt!==undefined&&(!timestamp(value.lastEventAt)||value.lastEventAt<value.startedAt))errors.push('Timerens seneste ændringstid er ugyldig.');
  if(value.status==='paused'&&value.pausedAt===null)errors.push('Den aktive pause mangler starttid.');
  if(value.status==='stopped'&&value.stoppedAt===null)errors.push('Den stoppede timer mangler sluttid.');
  if(value.status!=='paused'&&value.pausedAt!==null)errors.push('En afsluttet pause må ikke være aktiv.');
  if(value.status!=='stopped'&&value.stoppedAt!==null)errors.push('En aktiv timer må ikke have en sluttid.');
  if(value.lastEventAt!==undefined&&value.status==='paused'&&value.lastEventAt!==value.pausedAt)errors.push('Timerens pausetid og ændringstid stemmer ikke overens.');
  if(value.lastEventAt!==undefined&&value.status==='stopped'&&value.lastEventAt!==value.stoppedAt)errors.push('Timerens sluttid og ændringstid stemmer ikke overens.');
  const end=value.stoppedAt??value.pausedAt??value.lastEventAt;
  if(finite(end)&&value.pauseMs>end-value.startedAt)errors.push('Pausetiden er længere end vagten.');
  return {ok:errors.length===0,errors,timer:errors.length?null:clone(value)};
}
function valid(timer){const result=validateTimer(timer);if(!result.ok)throw Error(result.errors[0]);return result.timer;}
function eventTime(timer,now){if(!timestamp(now)||now<(timer.lastEventAt??timer.pausedAt??timer.startedAt))throw Error('Enhedens klokkeslæt skal kontrolleres.');}
export function startTimer(meta,now=Date.now()){
  const timer={version:1,id:meta.id||globalThis.crypto?.randomUUID?.()||`timer-${now}-${Math.random().toString(36).slice(2,9)}`,status:'running',startedAt:now,pausedAt:null,pauseMs:0,stoppedAt:null,lastEventAt:now,jobId:String(meta.jobId||''),scheme:String(meta.scheme||'3'),vehicle:String(meta.vehicle||''),driver:String(meta.driver||''),route:String(meta.route||''),planId:String(meta.planId||'')};
  return valid(timer);
}
export function pauseTimer(timer,now=Date.now()){const t=valid(timer);if(t.status!=='running')throw Error('Timeren kører ikke.');eventTime(t,now);return valid({...t,status:'paused',pausedAt:now,lastEventAt:now});}
export function resumeTimer(timer,now=Date.now()){const t=valid(timer);if(t.status!=='paused')throw Error('Der er ingen aktiv pause.');eventTime(t,now);return valid({...t,status:'running',pauseMs:t.pauseMs+now-t.pausedAt,pausedAt:null,lastEventAt:now});}
export function stopTimer(timer,now=Date.now()){let t=valid(timer);if(t.status==='stopped')return t;if(t.status==='paused')t=resumeTimer(t,now);eventTime(t,now);return valid({...t,status:'stopped',stoppedAt:now,lastEventAt:now});}
export function timerPauseMs(timer,now=Date.now()){return Math.max(0,timer.pauseMs+(timer.status==='paused'?Math.max(0,now-timer.pausedAt):0));}
export function timerElapsedMs(timer,now=Date.now()){return Math.max(0,(timer.stoppedAt??now)-timer.startedAt-timerPauseMs(timer,now));}
export function formatTimerElapsed(ms){const seconds=Math.floor(Math.max(0,ms)/1000);return `${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}`;}
export function timerEntryPreset(timer){
  const t=valid(timer);if(t.status!=='stopped')throw Error('Stop timeren, før arbejdsdagen gemmes.');
  if(t.stoppedAt-t.startedAt>=86400000)throw Error('Timeren spænder over mindst et døgn. Registrér dagene manuelt med de korrekte tider.');
  if(new Date(t.startedAt).getTimezoneOffset()!==new Date(t.stoppedAt).getTimezoneOffset())throw Error('Vagten krydser et skift mellem sommer- og vintertid. Kontrollér varigheden manuelt; lokale klokkeslæt kan ikke alene beskrive den korrekt.');
  const start=localTime(t.startedAt),end=localTime(t.stoppedAt);
  return {type:'work',date:localDate(t.startedAt),start,end:start===end?'':end,breakMinutes:Math.round(t.pauseMs/60000),jobId:t.jobId,scheme:t.scheme,vehicle:t.vehicle,driver:t.driver,route:t.route,planId:t.planId,timerId:t.id};
}
