import {validateTimer,startTimer,pauseTimer,resumeTimer,stopTimer,timerElapsedMs,timerPauseMs,formatTimerElapsed,timerEntryPreset} from './timer-domain.js';
const TIMER_KEY='arbejde.timer.v1';
export function createTimerController({onChange=()=>{},onError=()=>{}}={}){
  let current=null,interval=null,observedRaw=null,dirty=false,blocked=false;
  function load(){
    try{
      const raw=localStorage.getItem(TIMER_KEY);
      if(dirty&&raw===observedRaw)return;
      observedRaw=raw;dirty=false;blocked=false;
      if(!raw){current=null;return;}
      const result=validateTimer(JSON.parse(raw));
      if(!result.ok)throw Error('invalid');
      current=result.timer;
    }catch{if(dirty)return;current=null;blocked=true;onError('Den gemte timer kunne ikke læses. Kontrollér browserens lager, og brug manuel registrering.');}
  }
  function store(timer){
    current=timer;dirty=true;
    try{const raw=timer?JSON.stringify(timer):null;if(raw)localStorage.setItem(TIMER_KEY,raw);else localStorage.removeItem(TIMER_KEY);observedRaw=raw;dirty=false;blocked=false;}
    catch{onError('Timerændringen er kun i hukommelsen. Registrér arbejdsdagen, før du lukker appen.');}
    onChange();return current;
  }
  function fresh(expectedId){
    load();if(blocked)throw Error('Den gemte timer kunne ikke læses. Brug manuel registrering, og kontrollér browserens lager.');
    if(expectedId&&current?.id!==expectedId){onChange();throw Error('Timeren er ændret i en anden fane. Kontrollér den aktuelle arbejdsdag.');}
    return current;
  }
  function updateCounters(){if(!current)return;document.querySelectorAll('[data-timer-elapsed]').forEach(node=>node.textContent=formatTimerElapsed(timerElapsedMs(current)));document.querySelectorAll('[data-timer-pause]').forEach(node=>node.textContent=Math.round(timerPauseMs(current)/60000)+' min.');}
  load();
  if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===TIMER_KEY){load();onChange();}});
  return {
    snapshot:()=>current?{...current}:null,
    start(meta){fresh();if(current)throw Error('Der er allerede en arbejdsdag i timeren. Afslut den først.');return store(startTimer(meta));},
    pause(){return store(pauseTimer(fresh(current?.id)));},resume(){return store(resumeTimer(fresh(current?.id)));},stop(){return store(stopTimer(fresh(current?.id)));},
    preset(){return timerEntryPreset(fresh(current?.id));},
    clear(id){fresh(id);if(!id||current?.id===id)store(null);},
    reconcile(entries){load();if(current&&entries.some(e=>e.timerId===current.id)){current=null;dirty=true;try{localStorage.removeItem(TIMER_KEY);observedRaw=null;dirty=false;}catch{}}},
    attach(){updateCounters();if(interval===null&&typeof setInterval==='function'){interval=setInterval(updateCounters,1000);interval?.unref?.();}},
    elapsed:()=>current?timerElapsedMs(current):0,pauseMs:()=>current?timerPauseMs(current):0
  };
}
