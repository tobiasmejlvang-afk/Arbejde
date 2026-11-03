import {emptyState,validateState} from './domain.js';
const unreadable='Gemte data kunne ikke indlæses. Download de oprindelige data, og importér en gyldig sikkerhedskopi, før du gemmer ændringer.';
export function createDataStore(storage,key='arbejde.data.v1'){
  let observed,rawRecovery=null,readBlocked=false,error='';
  function accept(raw){
    observed=raw;readBlocked=false;rawRecovery=null;error='';
    if(raw===null)return {ok:true,state:emptyState()};
    try{const result=validateState(JSON.parse(raw));if(!result.ok)throw Error('invalid');return {ok:true,state:result.state};}
    catch{rawRecovery=raw;error=unreadable;return {ok:false,state:null,error};}
  }
  return {
    load(){try{const result=accept(storage.getItem(key));return result.state||emptyState();}catch{readBlocked=true;error='Browseren kunne ikke læse dine data. Genindlæs appen, og kontrollér browserens lager, før du gemmer.';return emptyState();}},
    accept,
    get needsRecovery(){return rawRecovery!==null;},
    get readBlocked(){return readBlocked;},
    get rawRecovery(){return rawRecovery;},
    get error(){return error;},
    save(state,{restoreBackup=false}={}){
      if(readBlocked)return {ok:false,error};
      if(rawRecovery!==null&&!restoreBackup)return {ok:false,error:unreadable};
      const checked=validateState(state);
      if(!checked.ok)return {ok:false,error:'Ændringerne kunne ikke gemmes: '+checked.errors.slice(0,2).join(' ')};
      try{
        if(storage.getItem(key)!==observed)return {ok:false,error:'Nyere data er gemt i en anden fane. Gem en kopi af dine ændringer, og genindlæs appen før du fortsætter.'};
        const next=JSON.stringify(checked.state);storage.setItem(key,next);observed=next;rawRecovery=null;error='';
        return {ok:true};
      }catch{return {ok:false,error:'Ændringerne er kun i hukommelsen. Browserens lager er fuldt eller blokeret. Download en backup nu.'};}
    }
  };
}
