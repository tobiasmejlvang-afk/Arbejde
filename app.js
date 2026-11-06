import {todayISO,uid,emptyState,demoState,defaultJob,calculateAll,summarize,validateEntry,validateState,weekStart,addDays,monthRange,payPeriod,money,hours,dateLabel} from './domain.js';
import {renderCalendar,renderJobs,renderWork,renderSettings,renderCreate,renderRoutes,bindPanels} from './panels.js';
import {brandArt,renderOverview,renderDailyWorkspace,renderWageWorkspace,renderAbsenceWorkspace,renderStatisticsWorkspace,renderExportWorkspace} from './experience.js';
import {renderDirectory,bindDirectory} from './directory-ui.js';
import {validateDirectory,mergeDirectoryState} from './directory-domain.js';
import {renderScheduleImport,bindScheduleImport} from './schedule-import-ui.js';
import {createTimerController} from './timer-controller.js';
import {createDataStore} from './data-store.js';
import {createCloudAccount} from './cloud-account.js';
import {bindEntryPhotos} from './photos.js';
import {plansForDate,entryForPlan,renderTimerHeader,renderDaySummary,renderDailyTools} from './daily-tools.js';

const KEY='arbejde.data.v1';
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',clock:'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',calendar:'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',work:'M3 7h18v14H3z M8 7V3h8v4 M3 12c6 4 12 4 18 0 M12 11v5',plus:'M12 5v14 M5 12h14',job:'M4 21V5h10v16 M14 10h6v11 M2 21h20 M8 8h2 M8 12h2 M8 16h2 M17 14h1 M17 18h1',settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',arrow:'M5 12h14 M14 7l5 5-5 5',check:'M5 12l4 4L19 6',chevron:'M9 5l7 7-7 7',truck:'M2 5h12v12H2z M14 9h4l4 4v4h-8 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',wallet:'M3 6h17v15H3z M3 6l13-3v3 M15 11h6v5h-6z',download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',leaf:'M20 3C7 1 1 10 6 17c6 5 14-1 14-14z M4 21L15 9',edit:'M4 16L16 4l4 4L8 20H4z M13 7l4 4',close:'M6 6l12 12 M18 6L6 18',sun:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'};
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.clock}"/></svg>`;
const types={work:'Arbejdsdag',sick:'Sygdom',off:'Fridag',holiday:'Ferie',freeHoliday:'Feriefridag',absence:'Fraværsdag'};
const schemes={'3':'3 dage · 12,33 t.','4':'4 dage · 9,25 t.','5':'5 dage · 7,4 / 7,0 t.'};
const wastes=['Mad','Rest','Pap/Papir','Plast','Glas','Metal','Haveaffald','Storskrald'];
const nav=[['overblik','overview','Overblik'],['daglig','time','Arbejdstid'],['loen','pay','Løn'],['kalender','calendar','Kalender'],['arbejde','overview','Registreringer'],['opret','job','Opret'],['job','job','Job & kontrakt'],['fravaer','absence','Fravær'],['vogntur','vehicle','Vogn & kollegaer'],['ture','vehicle','Ture'],['statistik','statistics','Statistik'],['planimport','calendar','Importér vagtplan'],['eksport','export','Eksport'],['indstillinger','settings','Indstillinger']];
let menuOpen=false,dataEpoch=0;
let storageProblem='',state=emptyState(),realState,demoMode=false,calcs=[],periodMode='month',periodDate=todayISO(),jobFilter='',calendarDate=todayISO(),view=location.hash.slice(1)||'overblik';
const storage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
let workspaceKey=KEY,modalCleanup,cloudAccount;
let dataStore=createDataStore(storage,workspaceKey);
state=dataStore.load();storageProblem=dataStore.error;
let pendingInstallPrompt=null,installedThisSession=false;
const app=document.querySelector('#app'),editor=document.querySelector('#editor');
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('visible'),4500);}
function workspaceTimer(key){return createTimerController({key,onChange:()=>render(),onError:message=>toast(message)});}
let timer=workspaceTimer('arbejde.timer.v1');
timer.reconcile(state.entries);
function save(options){let saved=true;if(!demoMode){const result=dataStore.save(state,options);saved=result.ok;storageProblem=result.error||'';if(saved){timer.reconcile(state.entries);cloudAccount?.schedule();}else toast(storageProblem);}render();return saved;}
function downloadOriginalData(){
  const raw=dataStore.rawRecovery;if(raw===null)return;
  try{const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='arbejde-oprindelige-data-'+todayISO()+'.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('De oprindelige data er klargjort til download. Kontrollér browserens downloadliste.');}
  catch{toast('De oprindelige data kunne ikke downloades. Hold appen åben, og kontrollér browserens downloadindstillinger.');}
}
function navigate(page){menuOpen=false;closeModal();if(location.hash.slice(1)===page){view=page;render();}else location.hash=page;}
function closeModal(){
  modalCleanup?.();modalCleanup=undefined;
  if(editor.open){if(typeof editor.close==='function')editor.close();else editor.removeAttribute('open');}
  editor.replaceChildren();
}
function modal(title,html,onSubmit,{submitLabel='Gem ændringer',guardData=true}={}){
  closeModal();const openedEpoch=dataEpoch;
  editor.innerHTML=`<form id="modal-form"><div class="dialog-heading"><div><span class="section-label">ARBEJDE · TID & LØN</span><h2 id="dialog-title">${escape(title)}</h2></div><button type="button" class="icon-button" id="close-editor" aria-label="Luk">${icon('close')}</button></div><div class="dialog-body">${html}<div id="form-errors" role="alert" class="form-errors" hidden></div></div><div class="dialog-footer"><button class="button secondary" id="cancel-editor" type="button">Annuller</button><button class="button primary" type="submit">${icon('check',17)} ${escape(submitLabel)}</button></div></form>`;
  editor.querySelector('#close-editor').onclick=closeModal;editor.querySelector('#cancel-editor').onclick=closeModal;
  const form=editor.querySelector('form');let submitting=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(submitting)return;
    if(guardData&&openedEpoch!==dataEpoch){formError('Oplysningerne er ændret, mens formularen var åben. Luk den og åbn den igen, så du arbejder med de nyeste data.');return;}
    submitting=true;const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
    try{const result=await onSubmit(new FormData(form));if(result!==false&&editor.querySelector('form')===form)closeModal();}
    catch(err){if(editor.querySelector('form')===form)formError(err.message||'Registreringen kunne ikke gemmes.');}
    finally{submitting=false;if(submit&&editor.querySelector('form')===form)submit.disabled=false;}
  };
  if(typeof editor.showModal==='function')editor.showModal();else editor.setAttribute('open','');
}
function formError(message){const node=editor.querySelector('#form-errors');if(node){node.hidden=false;node.textContent=message;node.scrollIntoView({block:'nearest'});}else toast(message);return false;}
function showConfirm(title,description,callback){modal(title,`<p class="muted">${escape(description)}</p>`,()=>callback(),{submitLabel:'Bekræft'});}
function ctx(){return {get state(){return state;},get needsRecovery(){return dataStore.needsRecovery||dataStore.readBlocked;},calcs,view,calendarDate,escape,save,navigate,openEntry,openPlannedEntry,timer,get isDemo(){return demoMode;},get syncCard(){return cloudAccount?.render()||'';},get dailyToolsHTML(){return renderDailyTools(this);},get daySummaryHTML(){return renderDaySummary(this);},toast,modal,closeModal,render,showConfirm,isInstalled:isAppInstalled(),setCalendarDate:date=>{calendarDate=date;render();},icon,types,schemes,periodMode,periodDate,jobFilter,rows:selectedRows(),range:periodRange(),job:activeJob(),entryTable};}
const options=(items,value)=>items.map(([v,label])=>`<option value="${escape(v)}" ${String(v)===String(value)?'selected':''}>${escape(label)}</option>`).join('');
const field=(name,label,value='',type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const select=(name,label,items,value,extra='')=>`<label class="field">${label}<select name="${name}" ${extra}>${options(items,value)}</select></label>`;
function activeJob(){return state.jobs.find(j=>j.id===jobFilter)||state.jobs.find(j=>j.id===state.settings.defaultJobId)||state.jobs[0];}
function periodRange(){const job=activeJob();return periodMode==='pay'&&job?payPeriod(job,periodDate):monthRange(periodDate);}
function selectedRows(){const range=periodRange();return calcs.filter(c=>c.entry.date>=range.start&&c.entry.date<=range.end&&(!jobFilter||c.entry.jobId===jobFilter));}
function header(title,subtitle,actions=''){return `<div class="page-heading"><div><div class="section-label">DIT PERSONLIGE ARBEJDSRUM</div><h1>${title}</h1><p>${subtitle}</p></div>${actions}</div>`;}
function entryTable(rows,limit=6){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Dato / registrering</th><th>Tur & vogn</th><th>Arbejdet</th><th>Betalte timer</th><th>Overarbejde</th><th></th></tr></thead><tbody>${rows.slice(0,limit).map(c=>`<tr><td><div class="table-title">${escape(dateLabel(c.entry.date))}</div><span class="muted small">${escape(types[c.entry.type])}</span></td><td><div>${escape(c.entry.route||'—')}</div><span class="muted small">${escape(c.entry.vehicle?`Vogn ${c.entry.vehicle}`:'—')}</span></td><td>${hours(c.actualHours)}</td><td>${hours(c.paidHours)}</td><td><span class="${c.overtimeHours?'text-amber':'muted'}">${hours(c.overtimeHours)}</span></td><td><button class="icon-button" data-edit="${escape(c.entry.id)}" aria-label="Rediger ${escape(dateLabel(c.entry.date))}">${icon('edit',17)}</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state">${icon('calendar',32)}<h3>Her begynder dit overblik</h3><p>Registrér din første arbejdsdag.<br>Timer, overarbejde og løn følger automatisk med.</p><button class="button secondary" data-action="new">${icon('plus',17)} Tilføj arbejdsdag</button></div>`;}
function renderDashboard(){return renderOverview(ctx());}
function renderDaily(){return renderDailyWorkspace(ctx());}
function render(){
  if(!nav.some(([id])=>id===view))view='overblik';
  if(jobFilter&&!state.jobs.some(job=>job.id===jobFilter))jobFilter='';
  document.documentElement.classList.toggle('compact-workspace',Boolean(state.settings.preferences?.compact));
  document.documentElement.classList.toggle('reduce-motion',Boolean(state.settings.preferences?.reduceMotion));
  calcs=calculateAll(state);
  const page={overblik:renderDashboard,daglig:renderDaily,loen:()=>renderWageWorkspace(ctx()),kalender:()=>renderCalendar(ctx()),planimport:()=>renderScheduleImport(ctx()),arbejde:()=>renderWork(ctx()),opret:()=>renderCreate(ctx()),job:()=>renderJobs(ctx()),fravaer:()=>renderAbsenceWorkspace(ctx()),vogntur:()=>renderDirectory(ctx()),ture:()=>renderRoutes(ctx()),statistik:()=>renderStatisticsWorkspace(ctx()),eksport:()=>renderExportWorkspace(ctx()),indstillinger:()=>renderSettings(ctx())}[view]();
  const navItem=([id,art,label])=>`<a href="#${id}" aria-label="${escape(label)}" title="${escape(label)}" ${view===id?'aria-current="page"':''} class="nav-link ${view===id?'active':''}">${brandArt(art,'nav-art')}<span>${label}</span>${id==='opret'?'<kbd>+</kbd>':''}</a>`;
  app.innerHTML=`<div class="app-frame ${menuOpen?'drawer-open':''}"><button class="drawer-scrim" data-action="close-menu" aria-label="Luk menu" ${menuOpen?'':'hidden'}></button><aside class="sidebar"><a class="brand" href="#overblik"><img src="./assets/brand/monogram.png" alt=""><span>Arbejde<small>Tid & Løn</small></span></a><div class="workspace-label">DIT ARBEJDSRUM</div><nav aria-label="Hovedmenu"><div class="nav-group">${nav.slice(0,4).map(navItem).join('')}</div><div class="workspace-label nav-section-label">ARBEJDE & PLANLÆGNING</div><div class="nav-group">${nav.slice(4,11).map(navItem).join('')}</div><div class="workspace-label nav-section-label">DIN APP</div><div class="nav-group">${nav.slice(11).map(navItem).join('')}</div></nav><div class="sidebar-bottom"><div class="local-note"><span class="status-dot"></span><div>${cloudAccount?.user?'Personligt arbejdsrum':'Personligt & lokalt'}<small>${cloudAccount?.user?'Dine gemte data følger din konto':'Dit arbejde bliver på din enhed'}</small></div></div><button class="profile" data-nav="indstillinger"><span class="avatar">${escape((state.settings.name||'M').slice(0,1).toUpperCase())}</span><span>${escape(state.settings.name||'Min profil')}<small>${escape(state.directory?.name||'Mit arbejdsrum')}</small></span>${icon('chevron',16)}</button></div></aside><div class="main-shell"><header class="topbar"><div class="topbar-left"><button class="icon-button menu-toggle" data-action="toggle-menu" aria-label="Åbn menu" aria-expanded="${menuOpen}">☰</button><a class="topbar-brand" href="#overblik"><img src="./assets/brand/logo-horizontal.png" alt="Arbejde – Tid & Løn"></a><div class="breadcrumb">Mit arbejdsrum ${icon('chevron',12)} <b>${escape(nav.find(n=>n[0]===view)?.[2])}</b></div></div><div class="topbar-right">${renderTimerHeader(ctx())}<span class="topbar-date">${escape(dateLabel(todayISO(),{weekday:'short',day:'numeric',month:'long',year:'numeric'}))}</span><span class="saved-indicator ${storageProblem?'unsaved':''}"><span class="status-dot"></span>${demoMode?'Demovisning':storageProblem?'Ikke gemt':cloudAccount?.user?'Gemt på enheden · Konto':'Gemt på enheden'}</span><button class="avatar small-avatar" data-nav="indstillinger" aria-label="Åbn profil">${escape((state.settings.name||'M').slice(0,1).toUpperCase())}</button></div></header><main id="main" tabindex="-1">${demoMode?`<div class="notice demo-notice"><span><b>Demovisning</b> · Eksempeldata. Ændringer gemmes ikke.</span><button class="text-button" data-action="exit-demo">Til mine egne data ${icon('arrow',15)}</button></div>`:!state.entries.length?`<div class="notice welcome-notice"><span><span class="status-dot"></span>Dit arbejdsrum er klar. Tilføj dine satser og registrér den første dag.</span><button class="text-button" data-action="demo">Prøv demovisning ${icon('arrow',15)}</button></div>`:''}${storageProblem?`<div class="notice error-notice" role="alert">${escape(storageProblem)}${dataStore.rawRecovery!==null?'<button class="text-button" data-action="download-original">Download oprindelige data</button>':''}<button class="text-button" data-nav="eksport">Åbn backup</button></div>`:''}${page}</main><footer class="app-footer"><span>Arbejde <b>· Tid & Løn</b></span><span>Dit personlige arbejdsrum</span></footer></div><nav class="mobile-nav" aria-label="Hurtig navigation">${nav.slice(0,4).map(([id,art,label])=>`<a href="#${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${brandArt(art)}<span>${label}</span></a>`).join('')}<button data-action="toggle-menu" aria-label="Åbn alle sider" aria-expanded="${menuOpen}">${brandArt('settings')}<span>Mere</span></button></nav></div>`;
  bindRoot();bindPanels(ctx());bindDirectory(ctx());bindScheduleImport(ctx());timer.attach();
}
function openPlannedEntry(plan,date){
  if(!plan)return;
  date ||= plan.date||todayISO();
  const existing=entryForPlan(state,plan,date);if(existing){openEntry(existing.id);return;}
  const kind=plan.kind||'work';
  if(!types[kind]){modal('Oplysning fra vagtplan',`<p>${escape(plan.title||'Bemanding ikke afklaret')}</p><p class="muted">Denne plan kan ses i kalenderen. Afklar bemandingen, før du registrerer en arbejdsdag.</p>`,()=>true);return;}
  openEntry(null,{date,jobId:plan.jobId,scheme:plan.scheme,type:kind,start:plan.start||'',end:plan.end||'',vehicle:plan.vehicle||'',route:plan.route||'',driver:plan.driver||state.settings.defaultDriver||'',colleague:plan.colleague||'',crew:plan.crew||'Alene',planId:plan.id,notes:plan.title||''});
}
function finishTimer(){
  const current=timer.snapshot();if(!current)return;
  const existing=state.entries.find(e=>e.timerId===current.id);if(existing){openEntry(existing.id);return;}
  const plan=state.plans.find(p=>p.id===current.planId);
  try{openEntry(null,{...timer.preset(),crew:plan?.crew||'Alene',colleague:plan?.colleague||'',notes:plan?.title||''});}catch(error){toast(error.message);}
}
function timerAction(action){
  if(demoMode){toast('Skift til dine egne data for at starte en arbejdsdag.');return;}
  try{
    if(action==='start'){
      if(dataStore.needsRecovery||dataStore.readBlocked){toast(storageProblem||'Gendan dine data, før du starter en ny arbejdsdag.');return;}
      const plan=plansForDate(state,todayISO()).find(p=>p.id===document.querySelector('#timer-plan-choice')?.value);
      const job=state.jobs.find(j=>j.id===(plan?.jobId||state.settings.defaultJobId))||state.jobs[0];
      if(!job){toast('Opret dit job, før du starter arbejdsdagen.');navigate('job');return;}
      timer.start({jobId:job.id,scheme:plan?.scheme||job.scheme,vehicle:plan?.vehicle||state.settings.defaultVehicle||'',driver:plan?.driver||state.settings.defaultDriver||'',route:plan?.route||'',planId:plan?.id||''});
    }else if(action==='pause')timer.pause();
    else if(action==='resume')timer.resume();
    else if(action==='stop'){timer.stop();finishTimer();}
    else if(action==='finish')finishTimer();
    else if(action==='discard'){const id=timer.snapshot()?.id;showConfirm('Kassér timeren?','Starttid og pauser for denne igangværende arbejdsdag slettes. Gemte registreringer bevares.',()=>timer.clear(id));}
  }catch(error){toast(error.message||'Timeren kunne ikke opdateres.');}
}
function bindRoot(){
document.querySelectorAll('[data-action="download-original"]').forEach(button=>button.onclick=downloadOriginalData);
document.querySelectorAll('[data-timer-action]').forEach(button=>button.onclick=()=>timerAction(button.dataset.timerAction));
document.querySelectorAll('[data-planned-entry]').forEach(button=>button.onclick=()=>openPlannedEntry(state.plans.find(p=>p.id===button.dataset.plannedEntry),button.dataset.planDate));document.querySelectorAll('[data-action="toggle-menu"]').forEach(b=>b.onclick=()=>{menuOpen=!menuOpen;render();});document.querySelector('[data-action="close-menu"]')?.addEventListener('click',()=>{menuOpen=false;render();});document.querySelector('[data-action="install-app"]')?.addEventListener('click',installApp);document.querySelectorAll("[data-height]").forEach(node=>node.style.height=Number(node.dataset.height)+"%");document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEntry(b.dataset.edit));document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>openEntry(null,{type:b.dataset.type}));document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>openEntry(null,{date:b.dataset.day}));document.querySelectorAll('[data-action="new"]').forEach(b=>b.onclick=()=>openEntry());document.querySelector('[data-action="demo"]')?.addEventListener('click',()=>{realState=state;state=demoState();demoMode=true;dataEpoch++;render();});document.querySelector('[data-action="exit-demo"]')?.addEventListener('click',()=>{state=realState||emptyState();demoMode=false;dataEpoch++;render();});document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{periodMode=b.dataset.period;render();});document.querySelector('#overview-job')?.addEventListener('change',e=>{jobFilter=e.target.value;render();});document.querySelectorAll('[data-shift]').forEach(b=>b.onclick=()=>{const direction=Number(b.dataset.shift),range=periodRange();periodDate=direction>0?addDays(range.end,1):addDays(range.start,-1);render();});}

function extraHtml(extra={}){const e={id:uid(),kind:'emptying',minutes:0,paidOvertime:false,...extra};return `<div class="extra-card" data-extra="${escape(e.id)}"><div class="extra-heading"><span class="badge">${e.kind==='task'?'Andet arbejde':'Ekstra tømning'}</span><input type="hidden" name="extra-kind" value="${e.kind}"><button class="icon-button remove-extra" type="button" aria-label="Fjern ekstraopgave">${icon('close',16)}</button></div><div class="form-grid">${field('extra-task',e.kind==='task'?'Arbejdsopgave':'Beskrivelse',e.task,'text','required maxlength="250"')}${field('extra-minutes','Tidsforbrug (min.)',e.minutes,'number','min="1" max="1440" required step="1"')}${field('extra-vehicle','Vogn nr.',e.vehicle,'text','list="vehicle-options" maxlength="60"')}${e.kind==='emptying'?field('extra-forVehicle','Hentes for vogn nr.',e.forVehicle,'text','list="vehicle-options" maxlength="60"'):''}${field('extra-from','Kørsel fra',e.from,'text','maxlength="250"')}${field('extra-to','Kørsel til',e.to,'text','maxlength="250"')}${e.kind==='emptying'?`${field('extra-address','Adresse(r)',e.address,'text','maxlength="500"')}${select('extra-waste','Affaldstype',[['','Vælg affaldstype'],...wastes.map(w=>[w,w])],e.waste)}${field('extra-container','Containerstørrelse',e.container,'text','placeholder="Fx 240 liter" maxlength="60"')}`:''}<label class="check-field full"><input type="checkbox" name="extra-paidOvertime" ${e.paidOvertime?'checked':''}><span>Med overarbejdsbetaling</span></label></div></div>`;}
function readEntry(form,id){const fd=new FormData(form),type=fd.get('type');return {id:id||uid(),date:fd.get('date'),jobId:fd.get('jobId'),type,restDay:type==='work'&&fd.get('restDay')==='on',scheme:form.elements.scheme?.value||fd.get('scheme')||state.jobs.find(j=>j.id===fd.get('jobId'))?.scheme||'4',start:type==='work'?fd.get('start'):'',end:type==='work'?fd.get('end'):'',breakMinutes:type==='work'?Number(fd.get('breakMinutes')||0):0,vehicle:fd.get('vehicle')||'',route:fd.get('route')||'',crew:fd.get('crew')||'Alene',planId:String(fd.get('planId')||''),timerId:String(fd.get('timerId')||''),driver:String(fd.get('driver')||'').trim(),colleague:String(fd.get('colleague')||'').trim(),empties:type==='work'?Number(fd.get('empties')||0):0,waste:type==='work'?fd.getAll('waste'):[],extras:type==='work'?[...form.querySelectorAll('[data-extra]')].map(node=>{const val=name=>node.querySelector(`[name="extra-${name}"]`)?.value||'';return {id:node.dataset.extra,kind:val('kind'),task:val('task'),minutes:Number(val('minutes')),vehicle:val('vehicle'),forVehicle:val('forVehicle'),from:val('from'),to:val('to'),address:val('address'),waste:val('waste'),container:val('container'),paidOvertime:node.querySelector('[name="extra-paidOvertime"]').checked};}):[],notes:String(fd.get('notes')||'').trim()};}
function matchingRoutes(date) {
  const thursday = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(thursday.getTime())) return [];
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
  const week = Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 604800000) + 1;
  const parity = week % 2 ? 'odd' : 'even';
  return (state.routeTemplates || []).filter(route => route.weekday === weekday && (route.weekParity === 'all' || route.weekParity === parity));
}

function openEntry(id = null, preset = {}) {
  if (!state.jobs.length) {
    toast('Opret først dit job og vælg din arbejdsuge.');
    navigate('job');
    return;
  }
  const existing = id ? state.entries.find(entry => entry.id === id) : null;
  if (id && !existing) return;
  const job = state.jobs.find(item => item.id === (preset.jobId || existing?.jobId || state.settings.defaultJobId)) || state.jobs[0];
  const preferences = state.settings.preferences;
  const date = existing?.date || preset.date || todayISO();
  const defaultRoute = !existing && !preset.route && matchingRoutes(date).find(route => route.id === preferences?.defaultRouteId);
  const entry = {
    date, jobId: job.id, type: 'work', scheme: job.scheme, restDay: false,
    start: preferences?.defaultStart ?? '06:00', end: preferences?.defaultEnd ?? '14:00',
    breakMinutes: preferences?.defaultBreakMinutes ?? 0,
    vehicle: defaultRoute?.vehicle || state.settings.defaultVehicle || state.vehicles[0] || '',
    route: defaultRoute?.name || state.routes[0] || '',
    crew: 'Alene', driver: state.settings.defaultDriver || '', colleague: '',
    planId: '', timerId: '', empties: defaultRoute?.empties ?? 0,
    waste: defaultRoute?.waste || [], extras: [], notes: '', photos: [], ...preset, ...existing
  };
  entry.crew = ({alone:'Alene', colleague:'Med kollega', substitute:'Afløser', temp:'Vikar'})[entry.crew] || entry.crew;
  const routeOptions = day => [['', 'Vælg en tur for datoen'], ...matchingRoutes(day).map(route => [route.id, route.name])];
  const wasteFields = wastes.map(waste => `<label><input type="checkbox" name="waste" value="${escape(waste)}" ${entry.waste.includes(waste) ? 'checked' : ''}><span>${escape(waste)}</span></label>`).join('');
  const html = `<input type="hidden" name="planId" value="${escape(entry.planId)}">
    <input type="hidden" name="timerId" value="${escape(entry.timerId)}">
    <div class="form-grid">
      ${select('type', 'Registreringstype', Object.entries(types), entry.type)}
      ${select('jobId', 'Job', state.jobs.map(item => [item.id, item.name]), entry.jobId, 'required')}
      ${field('date', 'Dato', entry.date, 'date', 'required')}
      ${!existing && !entry.timerId ? field('until', 'Til og med (valgfrit)', '', 'date') : ''}
      <div class="work-fields full"><div class="form-grid">
        ${select('scheme', 'Arbejdsuge', Object.entries(schemes), entry.scheme)}
        <div class="field field-hint">Dagens norm<p id="norm-hint" class="muted"></p></div>
        <label class="check-field full"><input name="restDay" type="checkbox" ${entry.restDay ? 'checked' : ''}><span>Jeg arbejder på min ugentlige fridag · fuldt overarbejde</span></label>
        ${field('start', 'Starttid', entry.start, 'time', 'required')}
        ${field('end', 'Sluttid', entry.end, 'time', 'required')}
        ${field('breakMinutes', 'Ubetalt pause (min.)', entry.breakMinutes, 'number', 'min="0" max="1440" step="1" required')}
        ${field('empties', 'Antal tømninger', entry.empties, 'number', 'min="0" max="100000" step="1" required')}
        ${state.routeTemplates?.length ? select('routeTemplate', 'Hent oplysninger fra en gemt tur', routeOptions(date), defaultRoute?.id || '') : ''}
        ${field('vehicle', 'Vogn / arbejdssted', entry.vehicle, 'text', 'list="vehicle-options" maxlength="100"')}
        ${field('route', 'Tur nr. eller navn', entry.route, 'text', 'list="route-options" maxlength="100"')}
        ${select('crew', 'Bemanding', [['Alene','Alene'],['Med kollega','Med kollega'],['Afløser','Afløser'],['Vikar','Vikar']], entry.crew)}
        ${field('driver', 'Chauffør', entry.driver, 'text', 'list="driver-options" maxlength="200"')}
        ${field('colleague', 'Kollega / medhjælper', entry.colleague, 'text', 'list="driver-options" maxlength="200"')}
        <p class="field-hint full" id="vehicle-context"></p>
        <fieldset class="full entry-waste-group"><legend>Affaldstyper</legend><div class="waste-choices entry-waste">${wasteFields}</div></fieldset>
      </div><div class="extra-section">
        <div class="panel-head"><div><h3>Dagens ekstraarbejde</h3><p>Tiden indgår i start/slut. Den lægges ikke til igen.</p></div></div>
        <div id="extras">${entry.extras.map(extraHtml).join('')}</div>
        <div class="extra-actions"><button type="button" class="button secondary" id="add-emptying">${icon('plus',16)} Ekstra tømning</button><button type="button" class="button secondary" id="add-task">${icon('plus',16)} Andet arbejde</button></div>
      </div></div>
      <label class="field full">Noter<textarea name="notes" rows="3" maxlength="4000" placeholder="Noget, du vil huske fra dagen?">${escape(entry.notes)}</textarea></label>
      <div class="full" data-entry-photos></div>
      <div class="full" id="entry-preview" aria-live="polite"></div>
      <p class="muted small full">Ved flere datoer oprettes én registrering pr. hverdag. Enkeltdage kan også ligge i weekenden. Sluttid før starttid betyder nattevagt.</p>
    </div>
    <datalist id="vehicle-options">${options(state.vehicles.map(value => [value, value]), '')}</datalist>
    <datalist id="route-options">${options([...new Set([...state.routes, ...(state.routeTemplates || []).map(route => route.name)])].map(value => [value, value]), '')}</datalist>
    <datalist id="driver-options">${options((state.directory?.people || []).map(person => [person.name, person.name]), '')}</datalist>`;

  let photos;
  modal(existing ? 'Rediger registrering' : 'Ny registrering', html, async fields => {
    const form = editor.querySelector('form');
    const candidate = readEntry(form, existing?.id);
    const until = fields.get('until') || candidate.date;
    if (until < candidate.date) return formError('Slutdato skal være på eller efter startdato.');
    if ((new Date(until) - new Date(candidate.date)) / 86400000 > 366) return formError('Vælg højst ét år ad gangen.');
    const additions = [];
    const entries = state.entries.filter(item => item.id !== existing?.id);
    const updated = {...state, entries};
    for (let day = candidate.date; day <= until; day = addDays(day, 1)) {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (until !== candidate.date && (weekday === 0 || weekday === 6)) continue;
      const next = {...candidate, id: existing?.id || uid(), date: day, extras: candidate.extras.map(extra => ({...extra, id:uid()}))};
      const errors = validateEntry(next, updated);
      if (errors.length) return formError(errors.join(' '));
      additions.push(next);
      entries.push(next);
    }
    if (!additions.length) return formError('Datointervallet indeholder ingen hverdage.');
    const epoch = dataEpoch;
    const attachments = await photos.save();
    if (editor.querySelector('form') !== form || epoch !== dataEpoch) return false;
    for (const next of additions) next.photos = attachments;
    const previous = state.entries;
    state.entries = entries;
    if (!save()) { state.entries = previous; render(); return formError(storageProblem); }
    toast(existing ? 'Registreringen er opdateret.' : `${additions.length === 1 ? 'Registreringen er' : additions.length + ' registreringer er'} gemt.`);
    return true;
  });

  const form = editor.querySelector('form');
  const fields = form.elements;
  photos = bindEntryPhotos(form, entry.photos, {readRemote: meta => cloudAccount.readPhoto(meta), onError: toast});
  modalCleanup = () => photos.dispose();
  function updateVehicleContext() {
    const vehicle = state.directory?.vehicles.find(item => item.number === fields.vehicle.value);
    form.querySelector('#vehicle-context').textContent = vehicle ? [vehicle.makeModel,vehicle.registrationNumber,vehicle.description].filter(Boolean).join(' · ') : '';
  }
  function preview(event) {
    if (event?.target?.closest?.('[data-entry-photos]')) return;
    const work = fields.type.value === 'work';
    const section = form.querySelector('.work-fields');
    if (section.hidden === work) {
      section.hidden = !work;
      for (const control of section.querySelectorAll('input,select,button')) control.disabled = !work;
    }
    const scheme = fields.scheme.value;
    form.querySelector('#norm-hint').textContent = fields.restDay.checked ? 'Ugentlig fridag · fuldt overarbejde' : {3:'12,33 t. · 3 dage pr. uge',4:'9,25 t. · 4 dage pr. uge',5:'Man–tors 7,4 t. · fredag 7,0 t.'}[scheme];
    const candidate = readEntry(form, existing?.id);
    const others = state.entries.filter(item => item.id !== existing?.id);
    const display = form.querySelector('#entry-preview');
    const errors = validateEntry(candidate, {...state, entries: others});
    if (errors.length) { display.innerHTML = `<div class="preview-info">${escape(errors[0])}</div>`; return; }
    const monday = weekStart(candidate.date);
    const sunday = addDays(monday, 6);
    const weekEntries = others.filter(item => item.jobId === candidate.jobId && item.date >= monday && item.date <= sunday);
    const result = calculateAll({...state, entries:[...weekEntries,candidate]}).find(item => item.entry.id === candidate.id);
    if (!result) return;
    display.innerHTML = `<div class="entry-preview"><span>Arbejdet<b>${hours(result.actualHours)} t.</b></span><span>Betalte timer<b>${hours(result.paidHours)} t.</b></span><span>Overarbejde<b class="text-amber">${hours(result.overtimeHours)} t.</b></span><span>Est. brutto<b>${result.rateMissing ? 'Udfyld lønsats' : money(result.grossPay)}</b></span></div>`;
  }
  fields.vehicle.addEventListener('change', () => {
    updateVehicleContext();
    const vehicle = state.directory?.vehicles.find(item => item.number === fields.vehicle.value);
    if (vehicle?.driverIds.length === 1 && !fields.driver.value) fields.driver.value = state.directory.people.find(person => person.id === vehicle.driverIds[0])?.name || '';
  });
  fields.colleague.addEventListener('change', () => {
    if (fields.colleague.value && fields.crew.value === 'Alene') fields.crew.value = 'Med kollega';
  });
  fields.jobId.addEventListener('change', () => {
    fields.scheme.value = state.jobs.find(item => item.id === fields.jobId.value)?.scheme || '4';
  });
  fields.date.addEventListener('change', () => {
    if (fields.routeTemplate) fields.routeTemplate.innerHTML = options(routeOptions(fields.date.value), '');
  });
  fields.routeTemplate?.addEventListener('change', () => {
    const route = matchingRoutes(fields.date.value).find(item => item.id === fields.routeTemplate.value);
    if (!route) return;
    fields.route.value = route.name;
    if (route.vehicle) fields.vehicle.value = route.vehicle;
    fields.empties.value = route.empties;
    for (const choice of form.querySelectorAll('[name="waste"]')) choice.checked = route.waste.includes(choice.value);
    updateVehicleContext();
  });
  function bindExtras() {
    for (const button of form.querySelectorAll('.remove-extra')) button.onclick = () => { button.closest('[data-extra]').remove(); preview(); };
  }
  function addExtra(kind) {
    form.querySelector('#extras').insertAdjacentHTML('beforeend', extraHtml({kind, vehicle: fields.vehicle.value}));
    bindExtras();
    preview();
  }
  form.querySelector('#add-emptying').onclick = () => addExtra('emptying');
  form.querySelector('#add-task').onclick = () => addExtra('task');
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  updateVehicleContext();
  bindExtras();
  preview();
}

function isAppInstalled(){return installedThisSession||Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);}
function showInstallInfo(){
  const local=location.protocol==='file:';
  const html='<div class="form-grid"><section class="full"><h3>Windows · Edge</h3><p class="muted">Åbn browserens menu (⋯), og vælg Flere værktøjer → Apps → Installér dette websted som en app. Du kan også bruge installationsikonet i adresselinjen.</p></section><section class="full"><h3>Windows · Chrome</h3><p class="muted">Åbn menuen (⋮), og vælg Cast, gem og del → Installér siden som app. Følg derefter browserens trin.</p></section><section class="full"><h3>Samsung tablet · Chrome</h3><p class="muted">Åbn appen i Chrome, tryk på menuen (⋮), og vælg Installér app eller Føj til startskærm. Bekræft tilføjelsen på skærmen.</p></section>'+ (local?'<section class="full"><h3>Åbn installationssiden</h3><p class="muted">En lokal fil kan ikke installeres som denne app. Åbn appen via HTTPS for at installere den.</p><p><a class="button secondary" href="https://tobiasmejlvang-afk.github.io/Arbejde/" target="_blank" rel="noopener noreferrer">Åbn installationssiden ↗</a></p></section>':'')+'<p class="muted small full">Menuernes ordlyd kan variere med browsersprog og version. <a href="https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge" target="_blank" rel="noopener noreferrer">Hjælp til Edge ↗</a> · <a href="https://support.google.com/chrome/answer/9658361" target="_blank" rel="noopener noreferrer">Hjælp til Chrome ↗</a></p></div>';
  modal('Installér arbejde',html,()=>true,{guardData:false});
  const submit=editor.querySelector('button[type="submit"]');if(submit)submit.textContent='Luk';
  const cancel=editor.querySelector('#cancel-editor');if(cancel)cancel.hidden=true;
}
async function installApp(){
  if(isAppInstalled()){toast('Appen er allerede installeret');return;}
  if(!pendingInstallPrompt){showInstallInfo();return;}
  const prompt=pendingInstallPrompt;pendingInstallPrompt=null;
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')toast('Installationen er startet. Følg browserens trin.');else toast('Du kan installere appen senere fra Indstillinger.');}catch{showInstallInfo();}
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingInstallPrompt=event;});
window.addEventListener('appinstalled',()=>{pendingInstallPrompt=null;installedThisSession=true;toast('Appen er installeret.');if(view==='indstillinger')render();});
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const main=document.querySelector('#main');main?.focus();main?.scrollIntoView({block:'start'});});
window.addEventListener('hashchange',()=>{closeModal();view=location.hash.slice(1);menuOpen=false;render();window.scrollTo({top:0});});
function applyStoredData(raw){
  dataEpoch++;const result=dataStore.accept(raw);
  if(!result.ok){storageProblem=result.error;render();toast(storageProblem);return;}
  if(demoMode)realState=result.state;else state=result.state;
  storageProblem='';timer.reconcile(result.state.entries);render();toast('Registreringer er opdateret fra en anden fane.');
}
window.addEventListener('storage',event=>{if(event.key===workspaceKey||event.key===null){try{applyStoredData(event.key===null?localStorage.getItem(workspaceKey):event.newValue);}catch{dataEpoch++;storageProblem='Browseren kunne ikke læse de ændrede data. Gem en backup af din visning, og genindlæs appen.';render();toast(storageProblem);}}});
editor.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
editor.addEventListener('click',event=>{if(event.target===editor){const r=editor.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
const privateSeed=document.querySelector('#private-directory-seed');
if(privateSeed&&!state.directory&&!dataStore.needsRecovery&&!dataStore.readBlocked){try{const envelope=JSON.parse(privateSeed.textContent);const checked=validateDirectory(envelope.directory);if(envelope.kind==='arbejde-directory'&&checked.ok){state=mergeDirectoryState(state,checked.directory);const stored=dataStore.save(state);if(!stored.ok)storageProblem=stored.error;}}catch{storageProblem='Det private register kunne ikke indlæses. Brug registerimport under Vogn & kollegaer.';}}
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuOpen){menuOpen=false;render();}});

function switchWorkspace(accountKey){
  closeModal();dataEpoch++;demoMode=false;realState=null;jobFilter='';
  workspaceKey=accountKey ? KEY+'.'+accountKey : KEY;
  timer.dispose();
  dataStore=createDataStore(storage,workspaceKey);
  state=dataStore.load();storageProblem=dataStore.error;
  timer=workspaceTimer(accountKey ? 'arbejde.timer.v1.'+accountKey : 'arbejde.timer.v1');
  timer.reconcile(state.entries);
}
function canApplyCloud(){return !editor.open&&!demoMode&&!timer.snapshot()&&!storageProblem;}
function applyCloudState(next){
  if(!canApplyCloud())return false;
  const stored=dataStore.save(next);
  if(!stored.ok)return false;
  dataEpoch++;state=next;timer.reconcile(state.entries);render();
  return true;
}
function copyLocalToAccount(){
  if(!cloudAccount.user||demoMode)return false;
  if(timer.snapshot()){toast('Afslut arbejdsdagen, før du kopierer data.');return false;}
  const local=createDataStore(storage,KEY);
  const next=local.load();
  if(local.error||storage.getItem(KEY)===null){toast('Der er ingen læsbare lokale data at kopiere.');return false;}
  const previous=state;state=next;
  if(!save()){state=previous;render();return false;}
  toast('De lokale data er kopieret til kontoens arbejdsrum.');
  return true;
}
cloudAccount=createCloudAccount({
  switchWorkspace,readState:()=>{if(storageProblem)throw Error('Arbejde: Gem eller gendan dine lokale data, før synkroniseringen kan fortsætte.');return demoMode?realState:state;},
  applyState:applyCloudState,canApply:canApplyCloud,hasLocal:()=>storage.getItem(workspaceKey)!==null,
  copyLocal:copyLocalToAccount,onSession:render,confirm:showConfirm,escape,storage
});
render();
cloudAccount.start(app);
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
