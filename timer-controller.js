import {validateTimer,startTimer,pauseTimer,resumeTimer,stopTimer,timerElapsedMs,timerPauseMs,formatTimerElapsed,timerEntryPreset} from './timer-domain.js';
const TIMER_KEY='arbejde.timer.v1';
export function createTimerController({key=TIMER_KEY,onChange=()=>{},onError=()=>{}}={}){
  let current=null,interval=null,observedRaw=null,dirty=false,blocked=false;
  function load(){
    try{
      const raw=localStorage.getItem(key);
      if(dirty&&raw===observedRaw){blocked=false;return;}
      observedRaw=raw;dirty=false;blocked=false;
      if(!raw){current=null;return;}
      const result=validateTimer(JSON.parse(raw));
      if(!result.ok)throw Error('invalid');
      current=result.timer;
    }catch{if(!dirty)current=null;blocked=true;onError('Den gemte timer kunne ikke læses. Kontrollér browserens lager, og brug manuel registrering.');}
  }
  function store(timer){
    let raw;
    try{raw=localStorage.getItem(key);}catch{blocked=true;onError('Timerens lager kunne ikke kontrolleres. Ændringen blev ikke skrevet.');throw Error('Timerens lager kunne ikke læses. Prøv igen, eller registrér manuelt.');}
    if(raw!==observedRaw){load();onChange();throw Error('Timeren er ændret i en anden fane. Kontrollér den aktuelle arbejdsdag.');}
    current=timer;dirty=true;
    try{const raw=timer?JSON.stringify(timer):null;if(raw)localStorage.setItem(key,raw);else localStorage.removeItem(key);observedRaw=raw;dirty=false;blocked=false;}
    catch{onError('Timerændringen er kun i hukommelsen. Registrér arbejdsdagen, før du lukker appen.');}
    onChange();return current?{...current}:null;
  }
  function fresh(expectedId){
    load();if(blocked)throw Error('Den gemte timer kunne ikke læses. Brug manuel registrering, og kontrollér browserens lager.');
    if(expectedId&&current?.id!==expectedId){onChange();throw Error('Timeren er ændret i en anden fane. Kontrollér den aktuelle arbejdsdag.');}
    return current;
  }
  function updateCounters(){if(!current||typeof document==='undefined')return;document.querySelectorAll('[data-timer-elapsed]').forEach(node=>node.textContent=formatTimerElapsed(timerElapsedMs(current)));document.querySelectorAll('[data-timer-pause]').forEach(node=>node.textContent=Math.round(timerPauseMs(current)/60000)+' min.');}
  load();
  const onStorage=event=>{if(event.key===key||event.key===null){load();onChange();}};
  if(typeof window!=='undefined')window.addEventListener('storage',onStorage);
  return {
    snapshot:()=>current?{...current}:null,
    start(meta){fresh();if(current)throw Error('Der er allerede en arbejdsdag i timeren. Afslut den først.');return store(startTimer(meta));},
    pause(){return store(pauseTimer(fresh(current?.id)));},resume(){return store(resumeTimer(fresh(current?.id)));},stop(){return store(stopTimer(fresh(current?.id)));},
    preset(){return timerEntryPreset(fresh(current?.id));},
    clear(id=current?.id){fresh(id);if(id&&current?.id===id)store(null);},
    reconcile(entries){load();if(blocked)return;if(current&&entries.some(e=>e.timerId===current.id)){try{if(localStorage.getItem(key)!==observedRaw){load();return;}}catch{return;}current=null;dirty=true;try{localStorage.removeItem(key);observedRaw=null;dirty=false;}catch{}}},
    attach(){updateCounters();if(interval===null&&typeof setInterval==='function'){interval=setInterval(updateCounters,1000);interval?.unref?.();}},
    dispose(){if(interval!==null){clearInterval(interval);interval=null;}if(typeof window!=='undefined')window.removeEventListener?.('storage',onStorage);},
    elapsed:()=>current?timerElapsedMs(current):0,pauseMs:()=>current?timerPauseMs(current):0
  };
}
