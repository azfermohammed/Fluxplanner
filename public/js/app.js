/* ── FLUX PLANNER · app.js v2 ── */

// ══ CONSTANTS ══
const SUBJECTS={LIT:{name:'Am. Lit',short:'LIT',color:'#6366f1'},AME:{name:'Am. Studies',short:'AME',color:'#f43f5e'},PP:{name:'Personal Project',short:'PP',color:'#10d9a0'},CHE:{name:'Chemistry',short:'CHE',color:'#fbbf24'},FRE:{name:'French',short:'FRE',color:'#3b82f6'},ORC:{name:'Orchestra',short:'ORC',color:'#c084fc'},PHY:{name:'Physics',short:'PHY',color:'#fb923c'},MTH:{name:'Math 3',short:'MTH',color:'#e879f9'},GYM:{name:'Gym',short:'GYM',color:'#10d9a0'}};
const noHomeworkDays=["2025-09-01","2025-09-26","2025-09-27","2025-09-28","2025-10-17","2025-10-18","2025-10-19","2025-11-05","2025-11-26","2025-11-27","2025-11-28","2025-11-29","2025-12-20","2025-12-21","2025-12-22","2025-12-23","2025-12-24","2025-12-25","2025-12-26","2025-12-27","2025-12-28","2025-12-29","2025-12-30","2025-12-31","2026-01-01","2026-01-02","2026-01-03","2026-01-04","2026-01-19","2026-02-13","2026-02-14","2026-02-15","2026-02-16","2026-02-17","2026-03-27","2026-03-28","2026-03-29","2026-03-30","2026-03-31","2026-04-01","2026-04-02","2026-04-03","2026-04-04","2026-04-05","2026-05-25","2026-05-26","2026-05-27"];
const AFFIRMATIONS=["You are capable of amazing things.","Every expert was once a beginner.","Progress, not perfection.","Hard work compounds. Keep going.","Your future self is grateful for today's effort.","Difficult roads lead to beautiful destinations.","You've got this, one step at a time.","Consistency beats intensity. Show up today.","Your potential is limitless.","Rest is part of the process too."];
const PANEL_TITLES={dashboard:'Dashboard',calendar:'Calendar',school:'School Info',grades:'Grades',notes:'Notes',timer:'Focus Timer',profile:'Profile',goals:'Goals',habits:'Habits',mood:'Mood',ai:'Flux AI',gmail:'Gmail',settings:'Settings'};

function buildABMap(){const m={};let t=true;for(let d=new Date('2025-08-25');d<=new Date('2026-06-12');d.setDate(d.getDate()+1)){const dw=d.getDay();if(dw===0||dw===6)continue;m[d.toISOString().slice(0,10)]=t?'A':'B';t=!t;}return m;}
const AB_MAP=buildABMap();
const TODAY=new Date();

// ══ STORAGE ══
const load=(k,def)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('Storage full',e);}};

// ══ STATE ══
let tasks=load('tasks',[]);
let grades=load('flux_grades',{});
let weightedRows=load('flux_weighted',[]);
let notes=load('flux_notes',[]);
let habits=load('flux_habits',[]);
let goals=load('flux_goals',[]);
let colleges=load('flux_colleges',[]);
let moodHistory=load('flux_mood',[]);
let confidences=load('flux_conf',{});
let studyDNA=load('flux_dna',[]);
let subjectBudgets=load('flux_budgets',{});
let sessionLog=load('flux_session_log',[]);
let settings=load('flux_settings',{panic:true,quiet:true,dndStart:'07:50',dndEnd:'14:30',dailyGoalHrs:2});
let schoolInfo=load('flux_school',{locker:'',combo:'',counselor:'',studentID:''});
let classes=load('flux_classes',[]);
let teacherNotes=load('flux_teacher_notes',[]);

// Tab config — each tab has id, icon, label, visible flag
const DEFAULT_TABS=[
  {id:'dashboard',icon:'⚡',label:'Dashboard',visible:true},
  {id:'calendar',icon:'📅',label:'Calendar',visible:true},
  {id:'ai',icon:'✦',label:'Flux AI',visible:true},
  {id:'school',icon:'🏫',label:'School Info',visible:true},
  {id:'grades',icon:'📊',label:'Grades',visible:true},
  {id:'notes',icon:'📝',label:'Notes',visible:true},
  {id:'timer',icon:'⏱',label:'Focus Timer',visible:true},
  {id:'profile',icon:'👤',label:'Profile',visible:true},
  {id:'goals',icon:'🎯',label:'Goals',visible:true},
  {id:'habits',icon:'🔥',label:'Habits',visible:true},
  {id:'mood',icon:'😊',label:'Mood',visible:true},
  {id:'gmail',icon:'📧',label:'Gmail',visible:true},
  {id:'settings',icon:'⚙',label:'Settings',visible:true},
];
let tabConfig=load('flux_tabs',DEFAULT_TABS);
// Ensure new tabs get added if missing
DEFAULT_TABS.forEach(dt=>{if(!tabConfig.find(t=>t.id===dt.id))tabConfig.push({...dt});});
save('flux_tabs',tabConfig);

let taskFilter='all',editingId=null,editingGoalId=null;
let aiHistory=[],aiPendingImg=null;
// Canvas + Gmail — declared here so renderProfile/renderCanvasStatus can access them at init time
let canvasToken=load('flux_canvas_token','');
let canvasUrl=load('flux_canvas_url','');
let gmailEmails=[];
let gmailToken=sessionStorage.getItem('flux_gmail_token')||null;
let calYear=TODAY.getFullYear(),calMonth=TODAY.getMonth(),calSelected=TODAY.getDate();
let currentNoteId=null,noteFilter='all',flashcards=[],fcIndex=0,fcFlipped=false;
let ambientCtx=null,breathingActive=false,breathTimer=null;
let sidebarCollapsed=load('flux_sidebar_collapsed',false);

// ══ SUPABASE + API ══
const SB_URL='https://lfigdijuqmbensebnevo.supabase.co';
const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaWdkaWp1cW1iZW5zZWJuZXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjEzMDgsImV4cCI6MjA4ODkzNzMwOH0.qG1d9DLKrs0qqLgAp-6UGdaU7xWvlg2sWq-oD-y2kVo';
const API={
  ai:`${SB_URL}/functions/v1/ai-proxy`,
  gemini:`${SB_URL}/functions/v1/gemini-proxy`,
  canvas:`${SB_URL}/functions/v1/canvas-proxy`
};
// Headers for Supabase Edge Functions (AI + Canvas)
const API_HEADERS={'Content-Type':'application/json','Authorization':`Bearer ${SB_ANON}`};
// Gemini proxy doesn't need Authorization header - it uses the server-side key
const GEMINI_HEADERS={'Content-Type':'application/json','Authorization':`Bearer ${SB_ANON}`};

let _sb=null,currentUser=null;
function getSB(){if(!_sb&&window.supabase?.createClient)_sb=window.supabase.createClient(SB_URL,SB_ANON);return _sb;}

// ══ HELPERS ══
const precise=n=>Number(n).toFixed(4);
const isBreak=d=>noHomeworkDays.includes(d);
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const strip=html=>html.replace(/<[^>]+>/g,'').slice(0,120);
const todayStr=()=>TODAY.toISOString().slice(0,10);

function refreshAIContext(){
  const now=new Date();now.setHours(0,0,0,0);
  const ago7=new Date(now);ago7.setDate(now.getDate()-7);
  const fwd14=new Date(now);fwd14.setDate(now.getDate()+14);
  return{recent:tasks.filter(t=>t.done&&t.date&&new Date(t.date+'T00:00:00')>=ago7),upcoming:tasks.filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')>=now&&new Date(t.date+'T00:00:00')<=fwd14)};
}
function quietHours(){if(!settings.quiet)return false;const now=new Date(),h=now.getHours(),m=now.getMinutes(),cur=h*60+m;const[sh,sm]=(settings.dndStart||'07:50').split(':').map(Number);const[eh,em]=(settings.dndEnd||'14:30').split(':').map(Number);return cur>=sh*60+sm&&cur<=eh*60+em;}
function panicCheck(task){if(!settings.panic||quietHours())return;const now=new Date(),due=new Date((task.date||'')+'T23:59:00');if((due-now)/3600000<12&&(due-now)>0)checkAllPanic();}
function checkAllPanic(){if(!settings.panic||quietHours()){hidePanic();return;}const now=new Date(),in12=new Date(now.getTime()+12*3600000);const urgent=tasks.filter(t=>{if(!t.done&&t.date){const d=new Date(t.date+'T23:59:00');return d>now&&d<=in12;}return false;});if(urgent.length)showPanic(urgent);else hidePanic();}
function showPanic(list){document.getElementById('panicBanner').classList.add('on');const pp=document.getElementById('panicPill');if(pp)pp.style.display='flex';document.getElementById('panicList').textContent=list.map(t=>t.name).join(' · ');}
function hidePanic(){document.getElementById('panicBanner').classList.remove('on');const pp=document.getElementById('panicPill');if(pp)pp.style.display='none';}

// ══ SPLASH ══
// runSplash() is defined in splash.js and exposed on window
// This stub ensures nothing breaks if splash.js hasn't loaded yet
if(!window.runSplash){
  window.runSplash=function(cb){
    const s=document.getElementById('splash');
    if(s)s.style.display='none';
    cb();
  };
}

// ══ LOGIN FEATURE PILLS ══
function initLoginFeaturePills(){
  const pills=[
    {icon:'✦',text:'Flux AI Tutor'},
    {icon:'📷',text:'Vision Import'},
    {icon:'📊',text:'GPA Tracker'},
    {icon:'⏱',text:'Pomodoro Timer'},
    {icon:'📅',text:'Smart Calendar'},
    {icon:'☁️',text:'Cloud Sync'},
    {icon:'🃏',text:'Flashcard Gen'},
    {icon:'📧',text:'Gmail Tasks'},
    {icon:'🎯',text:'Goal Tracker'},
    {icon:'🔥',text:'Habit Streaks'},
    {icon:'📝',text:'Rich Notes'},
    {icon:'😊',text:'Mood Check-In'},
    {icon:'🏫',text:'Canvas Sync'},
    {icon:'🧠',text:'Study DNA'},
  ];
  const el=document.getElementById('featPills');
  if(!el)return;
  // Duplicate for seamless infinite scroll
  const doubled=[...pills,...pills];
  el.innerHTML=doubled.map(p=>`<div class="feat-pill"><span class="fp-icon">${p.icon}</span>${p.text}</div>`).join('');
}

// ══ NAV ══
function nav(id,btn){
  // Check if tab is visible
  const tc=tabConfig.find(t=>t.id===id);
  if(tc&&!tc.visible){nav('dashboard');return;}
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById(id);if(panel)panel.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`[data-tab="${id}"]`).forEach(b=>b.classList.add('active'));
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  const bni=document.querySelector(`.bnav-item[data-tab="${id}"]`);if(bni)bni.classList.add('active');
  const tTitle=document.getElementById('topbarTitle');if(tTitle)tTitle.textContent=PANEL_TITLES[id]||id;
  const fns={dashboard:()=>{renderStats();renderTasks();renderCountdown();renderSmartSug();},calendar:()=>{renderCalendar();renderCalToday();renderCalUpcoming();const gcalStatusEl=document.getElementById('gcalStatus');if(gcalStatusEl&&!gcalStatusEl.innerHTML)syncGoogleCalendar();},school:()=>renderSchool(),grades:()=>{renderGradeInputs();renderGradeOverview();renderWeightedRows();calcWeighted();},notes:()=>renderNotesList(),habits:()=>{renderHabitList();renderHeatmap();},goals:()=>{renderGoalsList();renderCollegeList();},mood:()=>{renderMoodHistory();renderAffirmation();},timer:()=>{updateTDisplay();renderTDots();updateTStats();renderSubjectBudget();renderFocusHeatmap();},profile:()=>renderProfile(),ai:()=>renderAISugs(),settings:()=>{renderNoHWList();renderTabCustomizer();},gmail:()=>loadGmail()};
  fns[id]?.();
}
function navMob(id){closeDrawer();nav(id);}

// ══ SIDEBAR ══
function renderSidebars(){
  const groups=[
    {label:'Main',ids:['dashboard','calendar','ai']},
    {label:'School',ids:['school','grades','notes','timer']},
    {label:'Me',ids:['profile','goals','habits','mood','gmail','settings']},
  ];
  const visibleIds=new Set(tabConfig.filter(t=>t.visible).map(t=>t.id));
  // Build nav HTML for both sidebar and drawer
  const buildNav=(clickFn)=>groups.map(g=>{
    const items=g.ids.filter(id=>visibleIds.has(id)).map(id=>{
      const tc=tabConfig.find(t=>t.id===id)||DEFAULT_TABS.find(t=>t.id===id);
      return`<button class="nav-item" onclick="${clickFn}('${id}')" data-tab="${id}"><span class="ni">${tc?.icon||'•'}</span><span class="nl">${tc?.label||id}</span></button>`;
    }).join('');
    if(!items)return'';
    return`<div class="nav-group"><div class="nav-group-label">${g.label}</div>${items}</div>`;
  }).join('');

  const sidebarNav=document.querySelector('.sidebar-nav');
  if(sidebarNav)sidebarNav.innerHTML=buildNav('nav');

  const drawerNav=document.querySelector('.mob-drawer-nav');
  if(drawerNav)drawerNav.innerHTML=buildNav('navMob');

  // Bottom nav — show first 5 visible tabs
  const bnav=document.querySelector('.bottom-nav');
  if(bnav){
    const visible=tabConfig.filter(t=>t.visible);
    const first5=visible.slice(0,5);
    bnav.innerHTML=first5.map(t=>`<button class="bnav-item" onclick="nav('${t.id}',this)" data-tab="${t.id}"><span class="bni">${t.icon}</span>${t.label}</button>`).join('')
      +`<button class="bnav-item" onclick="openDrawer()" id="moreBtn"><span class="bni">☰</span>More</button>`;
  }
}
function toggleSidebar(){sidebarCollapsed=!sidebarCollapsed;save('flux_sidebar_collapsed',sidebarCollapsed);const sb=document.getElementById('sidebar');if(sb)sb.classList.toggle('collapsed',sidebarCollapsed);}

// ── Sidebar resize (drag handle) ──
function initSidebarResize(){
  const handle=document.getElementById('sidebarResizeHandle');
  const sidebar=document.getElementById('sidebar');
  if(!handle||!sidebar)return;
  let dragging=false,startX=0,startW=0;
  const MIN_W=60,MAX_W=420;
  handle.addEventListener('mousedown',e=>{
    dragging=true;startX=e.clientX;startW=sidebar.offsetWidth;
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const w=Math.min(MAX_W,Math.max(MIN_W,startW+(e.clientX-startX)));
    sidebar.style.width=w+'px';sidebar.style.minWidth=w+'px';
    if(w<90)sidebar.classList.add('collapsed');else sidebar.classList.remove('collapsed');
    save('flux_sidebar_w',w);
  });
  document.addEventListener('mouseup',()=>{if(!dragging)return;dragging=false;document.body.style.cursor='';document.body.style.userSelect='';});
  handle.addEventListener('touchstart',e=>{dragging=true;startX=e.touches[0].clientX;startW=sidebar.offsetWidth;e.preventDefault();},{passive:false});
  document.addEventListener('touchmove',e=>{if(!dragging)return;const w=Math.min(MAX_W,Math.max(MIN_W,startW+(e.touches[0].clientX-startX)));sidebar.style.width=w+'px';sidebar.style.minWidth=w+'px';if(w<90)sidebar.classList.add('collapsed');else sidebar.classList.remove('collapsed');});
  document.addEventListener('touchend',()=>{dragging=false;});
  const savedW=load('flux_sidebar_w',null);
  if(savedW&&!sidebarCollapsed){sidebar.style.width=savedW+'px';sidebar.style.minWidth=savedW+'px';}
}

function openDrawer(){
  // Detect which side the ☰ button is on and open drawer from that side
  const btn=document.getElementById('moreBtn')||document.querySelector('.mob-menu-btn');
  const drawer=document.getElementById('mobDrawer');
  if(drawer&&btn){
    const bRect=btn.getBoundingClientRect();
    const isRight=bRect.left>window.innerWidth/2;
    drawer.classList.toggle('drawer-right',isRight);
  }
  document.getElementById('drawerOverlay').classList.add('open');
  if(drawer)drawer.classList.add('open');
}
function closeDrawer(){document.getElementById('drawerOverlay').classList.remove('open');const d=document.getElementById('mobDrawer');if(d)d.classList.remove('open');}

// ══ TASKS ══
function calcUrgency(task){const now=new Date();now.setHours(0,0,0,0);const days=task.date?Math.max(0,Math.floor((new Date(task.date+'T00:00:00')-now)/86400000)):99;const pMap={high:3,med:2,low:1};return(pMap[task.priority]||2)*(task.difficulty||3)/Math.max(days,0.5);}
function addTask(){
  const name=document.getElementById('taskName').value.trim();if(!name)return;
  const task={id:Date.now(),name,date:document.getElementById('taskDate').value,subject:document.getElementById('taskSubject').value,priority:document.getElementById('taskPriority').value,type:document.getElementById('taskType').value,estTime:parseInt(document.getElementById('taskEstTime').value)||0,difficulty:parseInt(document.getElementById('taskDifficulty').value)||3,notes:document.getElementById('taskNotes').value.trim(),subtasks:[],done:false,rescheduled:0,createdAt:Date.now()};
  task.urgencyScore=calcUrgency(task);tasks.unshift(task);save('tasks',tasks);
  document.getElementById('taskName').value='';document.getElementById('taskNotes').value='';
  renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();panicCheck(task);
  syncKey('tasks',tasks);
}
function toggleTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;if(t.done){t.completedAt=Date.now();spawnConfetti();}save('tasks',tasks);renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();checkAllPanic();syncKey('tasks',tasks);}
function deleteTask(id){tasks=tasks.filter(x=>x.id!==id);save('tasks',tasks);renderStats();renderTasks();renderCalendar();renderCountdown();syncKey('tasks',tasks);}
function setFilter(f,el){taskFilter=f;document.querySelectorAll('#filterChips .tmode-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');renderTasks();}
function renderStats(){const now=new Date();now.setHours(0,0,0,0);const total=tasks.length,done=tasks.filter(t=>t.done).length,over=tasks.filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')<now).length,high=tasks.filter(t=>!t.done&&t.priority==='high').length;document.getElementById('statsRow').innerHTML=`<div class="stat"><div class="stat-n" style="color:var(--accent)">${total}</div><div class="stat-l">Total</div></div><div class="stat"><div class="stat-n" style="color:var(--green)">${done}</div><div class="stat-l">Done</div></div><div class="stat"><div class="stat-n" style="color:var(--red)">${over}</div><div class="stat-l">Overdue</div></div><div class="stat"><div class="stat-n" style="color:var(--gold)">${high}</div><div class="stat-l">High Pri</div></div>`;}
function renderTasks(){
  const now=new Date();now.setHours(0,0,0,0);
  let list=[...tasks];
  if(taskFilter==='active')list=list.filter(t=>!t.done);if(taskFilter==='done')list=list.filter(t=>t.done);if(taskFilter==='overdue')list=list.filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')<now);if(taskFilter==='today')list=list.filter(t=>t.date&&t.date===todayStr());if(taskFilter==='high')list=list.filter(t=>!t.done&&t.priority==='high');
  list.sort((a,b)=>{if(a.done!==b.done)return a.done?1:-1;if((b.urgencyScore||0)!==(a.urgencyScore||0))return(b.urgencyScore||0)-(a.urgencyScore||0);if(a.date&&b.date)return new Date(a.date)-new Date(b.date);return 0;});
  const el=document.getElementById('taskList');if(!list.length){el.innerHTML='<div class="empty">No tasks here.</div>';return;}
  const tm={hw:{l:'HW',c:'#64748b'},test:{l:'Test',c:'#f43f5e'},quiz:{l:'Quiz',c:'#f59e0b'},project:{l:'Project',c:'#a78bfa'},essay:{l:'Essay',c:'#3b82f6'},lab:{l:'Lab',c:'#22d3a5'},other:{l:'Other',c:'#64748b'}};
  el.innerHTML=list.map(t=>{const sub=SUBJECTS[t.subject];const isOver=t.date&&new Date(t.date+'T00:00:00')<now&&!t.done;const isNP=t.date&&isBreak(t.date);const ds=t.date?new Date(t.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';const ti=tm[t.type]||tm.other;const pc=t.priority==='high'?'#f43f5e':t.priority==='med'?'#f59e0b':'#22d3a5';const pl=t.priority==='high'?'🔴 High':t.priority==='med'?'🟡 Med':'🟢 Low';const procras=(t.rescheduled||0)>=3?`<div class="procras-flag">⚠ Rescheduled ${t.rescheduled}×</div>`:'';const estTag=t.estTime?`<span class="tag" style="background:#1e293b;color:#94a3b8">⏱ ${t.estTime}m</span>`:'';const stPct=t.subtasks?.length?Math.round(t.subtasks.filter(s=>s.done).length/t.subtasks.length*100):-1;const stBar=stPct>=0?`<div class="task-prog"><div class="task-prog-fill" style="width:${stPct}%"></div></div>`:'';return`<div class="task-item"><div class="check ${t.done?'done':''}" onclick="toggleTask(${t.id})">${t.done?'✓':''}</div><div class="task-body"><div class="task-text ${t.done?'done':''}">${esc(t.name)}</div><div class="task-tags">${sub?`<span class="tag" style="background:${sub.color}22;color:${sub.color}">${sub.short}</span>`:''}<span class="tag" style="background:${ti.c}22;color:${ti.c}">${ti.l}</span><span class="tag" style="background:${pc}18;color:${pc}">${pl}</span>${estTag}${ds?`<span class="tag due-tag ${isOver?'over':''}">📅 ${ds}${isNP?' 📵':''}</span>`:''}</div>${stBar}${procras}</div><div style="display:flex;flex-direction:column;gap:3px"><button class="btn-sm btn-del" onclick="deleteTask(${t.id})">✕</button><button class="btn-sm" onclick="openEdit(${t.id})">✎</button></div></div>`;}).join('');}
function renderSmartSug(){const active=tasks.filter(t=>!t.done).sort((a,b)=>(b.urgencyScore||0)-(a.urgencyScore||0));const card=document.getElementById('smartSugCard');if(!active.length){card.style.display='none';return;}card.style.display='block';const top=active[0];const sub=SUBJECTS[top.subject];const energy=parseInt(localStorage.getItem('flux_energy')||'3');const tip=energy<=2?'(low energy — try a short review)':energy>=4?'(high energy — tackle this first!)':'';document.getElementById('smartSug').textContent=top.name+(sub?' · '+sub.short:'');document.getElementById('smartSugSub').textContent=(top.type||'hw').toUpperCase()+(top.date?' · due '+new Date(top.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'')+' '+tip;}
function renderCountdown(){const now=new Date();now.setHours(0,0,0,0);const next=tasks.filter(t=>!t.done&&(t.type==='test'||t.type==='quiz')&&t.date&&new Date(t.date+'T00:00:00')>=now).sort((a,b)=>new Date(a.date)-new Date(b.date))[0];const card=document.getElementById('countdownCard');if(!next){card.style.display='none';return;}card.style.display='block';const diff=Math.max(0,Math.floor((new Date(next.date+'T00:00:00')-now)/86400000));const sub=SUBJECTS[next.subject];const statusC=diff<=2?'var(--red)':diff<=5?'var(--gold)':'var(--green)';document.getElementById('countdownLabel').textContent=next.name+(sub?' · '+sub.short:'');document.getElementById('countdownGrid').innerHTML=[[diff,'Days','var(--accent)'],[Math.floor(diff/7),'Weeks','var(--accent)'],[new Date(next.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),'Date','var(--accent)'],[diff<=2?'SOON ⚠':diff<=5?'NEAR':'OK ✓','Status',statusC]].map(([n,l,c])=>`<div style="background:var(--card2);border-radius:10px;padding:10px 6px;text-align:center"><div style="font-size:1.2rem;font-weight:800;font-family:'JetBrains Mono',monospace;color:${c}">${n}</div><div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:3px">${l}</div></div>`).join('');}
function setEnergy(v){localStorage.setItem('flux_energy',v);const emojis=['','😴','😕','😐','😊','🚀'];const labels=['','Very Low','Low','Neutral','Good','Peak'];const el=document.getElementById('energyEmoji');if(el)el.textContent=emojis[v];const lb=document.getElementById('energyLabel');if(lb)lb.textContent=labels[v];renderSmartSug();}
function openEdit(id){const t=tasks.find(x=>x.id===id);if(!t)return;editingId=id;document.getElementById('editText').value=t.name;document.getElementById('editSubject').value=t.subject||'';document.getElementById('editPriority').value=t.priority||'med';document.getElementById('editType').value=t.type||'hw';document.getElementById('editDue').value=t.date||'';document.getElementById('editEstTime').value=t.estTime||'';document.getElementById('editDifficulty').value=t.difficulty||3;document.getElementById('editSubtasks').value=(t.subtasks||[]).map(s=>s.text).join('\n');document.getElementById('editNotes').value=t.notes||'';document.getElementById('editModal').style.display='flex';}
function closeEdit(){document.getElementById('editModal').style.display='none';editingId=null;}
function saveEdit(){const t=tasks.find(x=>x.id===editingId);if(!t)return;const oldDate=t.date;t.name=document.getElementById('editText').value.trim()||t.name;t.subject=document.getElementById('editSubject').value;t.priority=document.getElementById('editPriority').value;t.type=document.getElementById('editType').value;t.date=document.getElementById('editDue').value;t.estTime=parseInt(document.getElementById('editEstTime').value)||0;t.difficulty=parseInt(document.getElementById('editDifficulty').value)||3;t.notes=document.getElementById('editNotes').value.trim();const stLines=document.getElementById('editSubtasks').value.split('\n').map(s=>s.trim()).filter(Boolean);t.subtasks=stLines.map((s,i)=>({text:s,done:t.subtasks?.[i]?.done||false}));if(oldDate&&t.date!==oldDate)t.rescheduled=(t.rescheduled||0)+1;t.urgencyScore=calcUrgency(t);save('tasks',tasks);closeEdit();renderStats();renderTasks();renderCalendar();renderCountdown();syncKey('tasks',tasks);}
function spawnConfetti(){const colors=['#6366f1','#10d9a0','#fbbf24','#c084fc','#f43f5e','#fb923c'];for(let i=0;i<22;i++){const p=document.createElement('div');p.className='confetti-piece';p.style.left=Math.random()*100+'vw';p.style.animationDelay=Math.random()*.5+'s';p.style.background=colors[Math.floor(Math.random()*colors.length)];document.body.appendChild(p);setTimeout(()=>p.remove(),1500);}}

// ══ CALENDAR ══
function changeMonth(d){calMonth+=d;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
function selectDay(d){calSelected=d;renderCalendar();document.getElementById('calAddBtn').style.display='inline-flex';}
function openAddForDate(){document.getElementById('taskDate').value=new Date(calYear,calMonth,calSelected).toISOString().slice(0,10);nav('dashboard');document.getElementById('taskName').focus();}
function renderCalendar(){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthLabel').textContent=months[calMonth]+' '+calYear;
  const first=new Date(calYear,calMonth,1).getDay(),days=new Date(calYear,calMonth+1,0).getDate(),prevDays=new Date(calYear,calMonth,0).getDate();
  const now=new Date();now.setHours(0,0,0,0);
  const tMap={};tasks.filter(t=>t.date).forEach(t=>{const d=new Date(t.date+'T00:00:00');if(d.getFullYear()===calYear&&d.getMonth()===calMonth){const k=d.getDate();if(!tMap[k])tMap[k]=[];tMap[k].push(t);}});
  // Also map custom events
  const evMap={};(load('flux_events',[])).filter(e=>e.date).forEach(e=>{const d=new Date(e.date+'T00:00:00');if(d.getFullYear()===calYear&&d.getMonth()===calMonth){const k=d.getDate();if(!evMap[k])evMap[k]=[];evMap[k].push(e);}});
  let html=['S','M','T','W','T','F','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=first-1;i>=0;i--)html+=`<div class="cal-day other"><div class="cal-dn">${prevDays-i}</div></div>`;
  for(let d=1;d<=days;d++){const dt=new Date(calYear,calMonth,d),ds=dt.toISOString().slice(0,10);const isToday=dt.getTime()===now.getTime(),isNP=isBreak(ds),ab=AB_MAP[ds];const tlist=tMap[d]||[];const elist=evMap[d]||[];const dots=[...tlist.slice(0,3).map(t=>{const s=SUBJECTS[t.subject];return`<div class="cal-dot" style="background:${s?s.color:'var(--accent)'};opacity:${t.done?.4:1}"></div>`;}), ...elist.slice(0,1).map(()=>`<div class="cal-dot" style="background:var(--purple)"></div>`)].join('');const abLabel=ab?`<div style="font-size:.45rem;font-family:'JetBrains Mono',monospace;color:${ab==='A'?'var(--accent)':'var(--green)'};line-height:1;margin-top:1px">${ab}</div>`:'';const overFlag=tlist.some(t=>!t.done&&new Date(t.date+'T00:00:00')<now)?'<div style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--red)"></div>':'';html+=`<div class="cal-day ${isToday?'today ':''}${d===calSelected?'selected ':''}${isNP?'no-hw':''}" onclick="selectDay(${d})" style="position:relative">${overFlag}<div class="cal-dn">${d}</div>${abLabel}<div class="cal-dots">${dots}</div></div>`;}
  document.getElementById('calGrid').innerHTML=html;
  renderCalDay();
  renderCalToday();
  renderCalUpcoming();
}

function renderCalDay(){
  const dt=new Date(calYear,calMonth,calSelected);
  const titleEl=document.getElementById('calDayTitle');
  if(titleEl)titleEl.textContent=dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const addBtn=document.getElementById('calAddBtn');if(addBtn)addBtn.style.display='inline-flex';
  const addEvBtn=document.getElementById('calAddEventBtn');if(addEvBtn)addEvBtn.style.display='inline-flex';
  const day=tasks.filter(t=>{if(!t.date)return false;const d=new Date(t.date+'T00:00:00');return d.getFullYear()===calYear&&d.getMonth()===calMonth&&d.getDate()===calSelected;});
  const events=(load('flux_events',[])).filter(e=>{if(!e.date)return false;const d=new Date(e.date+'T00:00:00');return d.getFullYear()===calYear&&d.getMonth()===calMonth&&d.getDate()===calSelected;});
  const el=document.getElementById('calDayTasks');
  if(!day.length&&!events.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:4px 0">Nothing scheduled.</div>';return;}
  el.innerHTML=[
    ...events.map(e=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.2);border-radius:10px;margin-bottom:6px"><span style="font-size:.85rem">📅</span><div style="flex:1"><div style="font-size:.85rem;font-weight:600">${esc(e.title)}</div>${e.time?`<div style="font-size:.7rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${e.time}</div>`:''}</div><button onclick="deleteEvent('${e.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.9rem;padding:2px">✕</button></div>`),
    ...day.map(t=>`<div class="task-item" style="margin-bottom:6px"><div class="check ${t.done?'done':''}" onclick="toggleTask(${t.id})">${t.done?'✓':''}</div><div class="task-body"><div class="task-text ${t.done?'done':''}">${esc(t.name)}</div></div><button class="btn-sm btn-del" onclick="deleteTask(${t.id})">✕</button></div>`)
  ].join('');
}

function renderCalToday(){
  const ts=todayStr();
  const todayEl=document.getElementById('calTodayTasks');
  const badgeEl=document.getElementById('todayDateBadge');
  if(badgeEl)badgeEl.textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const todayTasks=tasks.filter(t=>t.date===ts&&!t.done);
  const todayEvents=(load('flux_events',[])).filter(e=>e.date===ts);
  if(!todayEl)return;
  if(!todayTasks.length&&!todayEvents.length){todayEl.innerHTML='<div style="color:var(--muted);font-size:.82rem">Nothing due today 🎉</div>';return;}
  todayEl.innerHTML=[
    ...todayEvents.map(e=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(192,132,252,.08);border-radius:10px;margin-bottom:5px"><span>📅</span><div style="flex:1;font-size:.82rem;font-weight:600">${esc(e.title)}</div>${e.time?`<span style="font-size:.7rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${e.time}</span>`:''}</div>`),
    ...todayTasks.map(t=>{const sub=SUBJECTS[t.subject];const pc=t.priority==='high'?'var(--red)':t.priority==='med'?'var(--gold)':'var(--green)';return`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card2);border-radius:10px;margin-bottom:5px;border-left:3px solid ${pc}"><div class="check ${t.done?'done':''}" onclick="toggleTask(${t.id})" style="width:18px;height:18px;border-radius:5px;font-size:10px">${t.done?'✓':''}</div><div style="flex:1;font-size:.82rem;font-weight:500">${esc(t.name)}</div>${sub?`<span style="font-size:.65rem;color:${sub.color};font-family:'JetBrains Mono',monospace">${sub.short}</span>`:''}</div>`;})
  ].join('');
}

function renderCalUpcoming(){
  const el=document.getElementById('calUpcomingTasks');if(!el)return;
  const now=new Date();now.setHours(0,0,0,0);
  const in7=new Date(now);in7.setDate(now.getDate()+7);
  const upcoming=tasks.filter(t=>{if(!t.date||t.done)return false;const d=new Date(t.date+'T00:00:00');return d>now&&d<=in7;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const upEvents=(load('flux_events',[])).filter(e=>{if(!e.date)return false;const d=new Date(e.date+'T00:00:00');return d>now&&d<=in7;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const all=[...upEvents.map(e=>({...e,_type:'event'})),...upcoming.map(t=>({...t,_type:'task'}))].sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!all.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem">Nothing coming up 🎉</div>';return;}
  el.innerHTML=all.map(item=>{
    const d=new Date(item.date+'T00:00:00');const dStr=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    if(item._type==='event')return`<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><span style="font-size:.85rem">📅</span><div style="flex:1"><div style="font-size:.82rem;font-weight:600">${esc(item.title)}</div><div style="font-size:.68rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${dStr}</div></div></div>`;
    const sub=SUBJECTS[item.subject];const pc=item.priority==='high'?'var(--red)':item.priority==='med'?'var(--gold)':'var(--green)';
    return`<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><div style="width:4px;height:32px;border-radius:2px;background:${pc};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-size:.82rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.name)}</div><div style="font-size:.68rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${dStr}${sub?' · '+sub.short:''}</div></div></div>`;
  }).join('');
}

// ── Add event modal ──
let addEventType='task';
function openAddEventModal(){
  const modal=document.getElementById('addEventModal');if(!modal)return;
  document.getElementById('addEventDate').value=new Date(calYear,calMonth,calSelected).toISOString().slice(0,10);
  document.getElementById('addEventTitle').value='';
  document.getElementById('addEventNotes').value='';
  setAddEventType('task');
  modal.style.display='flex';
}
function closeAddEventModal(){document.getElementById('addEventModal').style.display='none';}
function setAddEventType(type){
  addEventType=type;
  document.getElementById('addEventTypeTask').style.background=type==='task'?'var(--accent)':'';
  document.getElementById('addEventTypeTask').className=type==='task'?'':'btn-sec';
  document.getElementById('addEventTypeEvent').style.background=type==='event'?'var(--accent)':'';
  document.getElementById('addEventTypeEvent').className=type==='event'?'':'btn-sec';
  document.getElementById('addEventSubjectRow').style.display=type==='task'?'block':'none';
  document.getElementById('addEventPriorityRow').style.display=type==='task'?'block':'none';
}
function saveAddEvent(){
  const title=document.getElementById('addEventTitle').value.trim();if(!title)return;
  const date=document.getElementById('addEventDate').value;
  const time=document.getElementById('addEventTime').value;
  const notes=document.getElementById('addEventNotes').value.trim();
  if(addEventType==='task'){
    const task={id:Date.now(),name:title,date,subject:document.getElementById('addEventSubject').value,priority:document.getElementById('addEventPriority').value,type:'hw',notes,done:false,rescheduled:0,createdAt:Date.now()};
    task.urgencyScore=calcUrgency(task);tasks.unshift(task);save('tasks',tasks);
    renderStats();renderTasks();
  }else{
    const events=load('flux_events',[]);
    events.push({id:String(Date.now()),title,date,time,notes});
    save('flux_events',events);
  }
  syncKey('tasks',tasks);
  closeAddEventModal();renderCalendar();
}
function deleteEvent(id){
  const events=load('flux_events',[]).filter(e=>e.id!==id);
  save('flux_events',events);renderCalendar();
}

// ── Google Calendar sync ──
async function syncGoogleCalendar(){
  const statusEl=document.getElementById('gcalStatus');
  const eventsEl=document.getElementById('gcalEvents');
  if(!gmailToken){
    if(statusEl)statusEl.innerHTML='<div class="sync-badge offline">○ Sign in with Google to sync</div>';return;
  }
  if(statusEl)statusEl.innerHTML='<div class="sync-badge syncing">↑ Syncing...</div>';
  try{
    const now=new Date().toISOString();
    const end=new Date();end.setDate(end.getDate()+30);
    const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(end.toISOString())}&maxResults=20&singleEvents=true&orderBy=startTime`,{
      headers:{'Authorization':`Bearer ${gmailToken}`}
    });
    if(res.status===401){if(statusEl)statusEl.innerHTML='<div class="sync-badge offline">○ Session expired — sign in again</div>';return;}
    if(!res.ok)throw new Error('Calendar API '+res.status);
    const data=await res.json();
    const items=data.items||[];
    if(statusEl)statusEl.innerHTML=`<div class="sync-badge synced">✓ Synced ${items.length} events</div>`;
    if(eventsEl){
      if(!items.length){eventsEl.innerHTML='<div style="color:var(--muted);font-size:.82rem">No upcoming events</div>';return;}
      eventsEl.innerHTML=items.map(ev=>{
        const start=ev.start?.dateTime||ev.start?.date||'';
        const d=start?new Date(start).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'';
        return`<div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:5px"></div>
          <div style="flex:1;min-width:0"><div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ev.summary||'(no title)')}</div><div style="font-size:.68rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${d}</div></div>
          <button onclick="addGCalEventAsTask('${encodeURIComponent(ev.summary||'')}','${start.slice(0,10)}')" style="padding:3px 8px;font-size:.68rem;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.25);color:var(--accent);border-radius:7px;flex-shrink:0">+ Task</button>
        </div>`;
      }).join('');
    }
  }catch(e){
    if(statusEl)statusEl.innerHTML=`<div style="color:var(--red);font-size:.78rem">${e.message}</div>`;
  }
}
function addGCalEventAsTask(encodedName,date){
  const name=decodeURIComponent(encodedName);
  const task={id:Date.now(),name,date,subject:'',priority:'med',type:'hw',done:false,rescheduled:0,createdAt:Date.now()};
  task.urgencyScore=calcUrgency(task);tasks.unshift(task);save('tasks',tasks);
  renderStats();renderTasks();renderCalendar();syncKey('tasks',tasks);
  const btn=event?.target;if(btn){btn.textContent='✓';btn.style.color='var(--green)';setTimeout(()=>{btn.textContent='+ Task';btn.style.color='var(--accent)';},1500);}
}

// ══ SCHOOL INFO ══
function saveSchoolInfo(){schoolInfo={locker:document.getElementById('inputLocker').value.trim(),combo:document.getElementById('inputCombo').value.trim(),counselor:document.getElementById('inputCounselor').value.trim(),studentID:document.getElementById('inputStudentID').value.trim()};save('flux_school',schoolInfo);renderSchool();syncKey('school',schoolInfo);const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Info',1500);}}
function addClass(){const period=document.getElementById('classPeriod').value,name=document.getElementById('className').value.trim(),teacher=document.getElementById('classTeacher').value.trim(),room=document.getElementById('classRoom').value.trim();if(!name)return;classes.push({id:Date.now(),period:parseInt(period)||classes.length+1,name,teacher,room});classes.sort((a,b)=>a.period-b.period);save('flux_classes',classes);document.getElementById('classPeriod').value='';document.getElementById('className').value='';document.getElementById('classTeacher').value='';document.getElementById('classRoom').value='';renderSchool();syncKey('classes',classes);}
function deleteClass(id){classes=classes.filter(c=>c.id!==id);save('flux_classes',classes);renderSchool();}
function addTeacherNote(){const teacher=document.getElementById('tNoteTeacher').value.trim(),note=document.getElementById('tNoteText').value.trim();if(!teacher||!note)return;teacherNotes.push({id:Date.now(),teacher,note});save('flux_teacher_notes',teacherNotes);document.getElementById('tNoteTeacher').value='';document.getElementById('tNoteText').value='';renderSchool();}
function deleteTeacherNote(id){teacherNotes=teacherNotes.filter(n=>n.id!==id);save('flux_teacher_notes',teacherNotes);renderSchool();}
function renderSchool(){
  document.getElementById('displayLocker').textContent=schoolInfo.locker||'—';
  document.getElementById('displayCombo').textContent=schoolInfo.combo||'—';
  document.getElementById('displayCounselor').textContent=schoolInfo.counselor||'—';
  document.getElementById('displayStudentID').textContent=schoolInfo.studentID||'—';
  document.getElementById('inputLocker').value=schoolInfo.locker||'';
  document.getElementById('inputCombo').value=schoolInfo.combo||'';
  document.getElementById('inputCounselor').value=schoolInfo.counselor||'';
  document.getElementById('inputStudentID').value=schoolInfo.studentID||'';
  const cl=document.getElementById('classesList');
  if(!classes.length){cl.innerHTML='<div class="empty" style="padding:10px 0">No classes added yet.</div>';return;}
  const subColors=Object.values(SUBJECTS).map(s=>s.color);
  cl.innerHTML=classes.map((c,i)=>{const col=subColors[i%subColors.length];return`<div class="class-row"><div class="class-period" style="background:${col}22;color:${col}">${c.period}</div><div style="flex:1"><div style="font-size:.88rem;font-weight:700">${esc(c.name)}</div><div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${c.teacher?c.teacher:''}${c.room?' · '+c.room:''}</div></div><button onclick="deleteClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`;}).join('');
  const tn=document.getElementById('teacherNotesList');
  if(!teacherNotes.length){tn.innerHTML='<div style="color:var(--muted);font-size:.82rem;margin-bottom:8px">No notes yet.</div>';return;}
  tn.innerHTML=teacherNotes.map(n=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><div style="font-size:.82rem;font-weight:700">${esc(n.teacher)}</div><div style="font-size:.75rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${esc(n.note)}</div></div><button onclick="deleteTeacherNote(${n.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`).join('');
}

// ══ GRADES ══
function calcGPA(g){const map={'A+':4.3,'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'F':0};const vals=Object.values(g).map(v=>{const p=parseFloat(v);if(!isNaN(p)){if(p>=97)return 4.3;if(p>=93)return 4.0;if(p>=90)return 3.7;if(p>=87)return 3.3;if(p>=83)return 3.0;if(p>=80)return 2.7;if(p>=77)return 2.3;if(p>=73)return 2.0;if(p>=70)return 1.7;if(p>=67)return 1.3;if(p>=60)return 1.0;return 0;}return map[(v||'').trim().toUpperCase()]??null;}).filter(v=>v!==null);if(!vals.length)return null;return parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(4));}
function addGradeRow(){const s=document.getElementById('newSubject').value.trim(),v=document.getElementById('newGrade').value.trim();if(!s||!v)return;grades[s]=v;save('flux_grades',grades);document.getElementById('newSubject').value='';document.getElementById('newGrade').value='';renderGradeInputs();renderGradeOverview();}
function removeGrade(k){delete grades[k];save('flux_grades',grades);renderGradeInputs();renderGradeOverview();}
function updateGPADisplay(){const gpa=calcGPA(grades);document.getElementById('gpaDisplay').textContent=gpa!==null?precise(gpa):'—';}
function renderGradeInputs(){const el=document.getElementById('gradeInputs');if(!el)return;if(!Object.keys(grades).length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem;margin-bottom:8px">No grades yet.</div>';updateGPADisplay();return;}el.innerHTML=Object.entries(grades).map(([k,v])=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="flex:1;font-size:.85rem;font-weight:500">${esc(k)}</div><input type="text" id="g_${k.replace(/\s/g,'_')}" value="${esc(v)}" style="width:90px;text-align:center;font-family:'JetBrains Mono',monospace;font-size:.82rem;margin:0;padding:6px 8px" oninput="updateGPADisplay()"><button onclick="removeGrade('${k}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0 4px">✕</button></div>`).join('');updateGPADisplay();}
function renderGradeOverview(){const el=document.getElementById('gradeOverview');if(!el)return;if(!Object.keys(grades).length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem">No grades yet.</div>';return;}el.innerHTML=Object.entries(grades).map(([k,g])=>{const pct=parseFloat(g);const c=!isNaN(pct)?(pct>=90?'var(--green)':pct>=80?'var(--accent)':pct>=70?'var(--gold)':'var(--red)'):'var(--accent)';const w=!isNaN(pct)?Math.min(pct,100):75;return`<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><div style="flex:1;font-size:.85rem;font-weight:500">${esc(k)}</div><span style="font-size:.82rem;font-weight:700;color:${c};font-family:'JetBrains Mono',monospace">${esc(g)}</span></div>${!isNaN(pct)?`<div class="gpa-bar"><div class="gpa-fill" style="width:${w}%;background:${c}"></div></div>`:''}</div>`;}).join('');}
function saveGrades(){Object.keys(grades).forEach(k=>{const inp=document.getElementById('g_'+k.replace(/\s/g,'_'));if(inp)grades[k]=inp.value.trim();});save('flux_grades',grades);updateGPADisplay();renderGradeOverview();syncKey('grades',grades);const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Grades',1500);}}
function addWeightRow(){const c=document.getElementById('wCat').value.trim(),w=document.getElementById('wWeight').value,s=document.getElementById('wScore').value;if(!c||!w)return;weightedRows.push({cat:c,weight:parseFloat(w),score:parseFloat(s)||0});save('flux_weighted',weightedRows);document.getElementById('wCat').value='';document.getElementById('wWeight').value='';document.getElementById('wScore').value='';renderWeightedRows();calcWeighted();}
function removeWeightRow(i){weightedRows.splice(i,1);save('flux_weighted',weightedRows);renderWeightedRows();calcWeighted();}
function renderWeightedRows(){const el=document.getElementById('weightRows');if(!el)return;if(!weightedRows.length){el.innerHTML='<div style="font-size:.78rem;color:var(--muted);margin-bottom:8px">Add categories below.</div>';return;}el.innerHTML=weightedRows.map((r,i)=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:6px"><span style="font-size:.82rem;font-weight:500">${esc(r.cat)}</span><span style="font-size:.82rem;font-family:'JetBrains Mono',monospace;color:var(--muted2)">${r.weight}%</span><span style="font-size:.82rem;font-family:'JetBrains Mono',monospace;color:var(--accent)">${r.score}%</span><button onclick="removeWeightRow(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0">✕</button></div>`).join('');}
function calcWeighted(){const el=document.getElementById('weightedResult');if(!el||!weightedRows.length){if(el)el.textContent='—';return;}const total=weightedRows.reduce((s,r)=>s+r.weight,0);if(!total){el.textContent='—';return;}el.textContent=weightedRows.reduce((s,r)=>s+(r.score*r.weight/total),0).toFixed(2)+'%';}
function calcFinal(){const cur=parseFloat(document.getElementById('finalCurrent').value),fw=parseFloat(document.getElementById('finalWeight').value),tar=parseFloat(document.getElementById('finalTarget').value);const el=document.getElementById('finalResult');if(isNaN(cur)||isNaN(fw)||isNaN(tar)){el.style.display='none';return;}el.style.display='block';const needed=(tar-(cur*(100-fw)/100))/(fw/100);if(needed>100){el.textContent=`You need ${needed.toFixed(1)}% on the final — very challenging!`;el.style.color='var(--red)';}else if(needed<0){el.textContent=`Any score keeps you above ${tar}%. You're set!`;el.style.color='var(--green)';}else{el.textContent=`You need ${needed.toFixed(1)}% on the final.`;el.style.color=needed>85?'var(--gold)':'var(--text)';}}

// ══ NOTES ══
function setNoteFilter(f,el){noteFilter=f;document.querySelectorAll('#notes .tmode-btn').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');renderNotesList();}
function renderNotesList(){const el=document.getElementById('notesList');if(!el)return;const q=(document.getElementById('noteSearch').value||'').toLowerCase();let list=[...notes];if(noteFilter==='starred')list=list.filter(n=>n.starred);if(noteFilter==='flashcards')list=list.filter(n=>n.flashcards?.length);if(q)list=list.filter(n=>(n.title||'').toLowerCase().includes(q)||(n.body||'').toLowerCase().includes(q));if(!list.length){el.innerHTML='<div class="empty">No notes yet. Tap + New to create one.</div>';return;}el.innerHTML=list.sort((a,b)=>b.updatedAt-a.updatedAt).map(n=>{const sub=SUBJECTS[n.subject];return`<div class="note-card" onclick="openNote(${n.id})"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><div class="note-title">${esc(n.title||'Untitled')}</div>${n.starred?'<span style="color:var(--gold)">⭐</span>':''}${n.flashcards?.length?`<span class="badge badge-purple" style="padding:2px 6px;font-size:.6rem">🃏 ${n.flashcards.length}</span>`:''}</div>${sub?`<span class="badge badge-blue" style="padding:2px 6px;font-size:.62rem;margin-bottom:4px">${sub.short}</span>`:''}<div class="note-preview">${strip(n.body||'')}</div><div style="font-size:.62rem;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-top:5px">${new Date(n.updatedAt||Date.now()).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></div>`;}).join('');}
function openNewNote(){currentNoteId=null;document.getElementById('noteTitleInput').value='';document.getElementById('noteEditor').innerHTML='';document.getElementById('noteSubjectTag').value='';document.getElementById('starBtn').textContent='☆';document.getElementById('aiNoteResult').style.display='none';document.getElementById('notesListView').style.display='none';document.getElementById('notesEditorView').style.display='block';}
function openNote(id){const n=notes.find(x=>x.id===id);if(!n)return;currentNoteId=id;document.getElementById('noteTitleInput').value=n.title||'';document.getElementById('noteEditor').innerHTML=n.body||'';document.getElementById('noteSubjectTag').value=n.subject||'';document.getElementById('starBtn').textContent=n.starred?'⭐':'☆';document.getElementById('aiNoteResult').style.display='none';document.getElementById('notesListView').style.display='none';document.getElementById('notesEditorView').style.display='block';}
function backToNotesList(){document.getElementById('notesEditorView').style.display='none';document.getElementById('flashcardView').style.display='none';document.getElementById('notesListView').style.display='block';renderNotesList();}
function saveNote(){const title=document.getElementById('noteTitleInput').value.trim()||'Untitled';const body=document.getElementById('noteEditor').innerHTML;const subject=document.getElementById('noteSubjectTag').value;const starred=document.getElementById('starBtn').textContent==='⭐';if(currentNoteId){const n=notes.find(x=>x.id===currentNoteId);if(n){n.title=title;n.body=body;n.subject=subject;n.starred=starred;n.updatedAt=Date.now();}}else{const n={id:Date.now(),title,body,subject,starred,flashcards:[],createdAt:Date.now(),updatedAt:Date.now()};notes.unshift(n);currentNoteId=n.id;}save('flux_notes',notes);syncKey('notes',notes);const b=event?.target;if(b){b.textContent='✓ Saved';setTimeout(()=>b.textContent='Save',1500);}}
function deleteNote(){if(!currentNoteId)return;if(!confirm('Delete this note?'))return;notes=notes.filter(n=>n.id!==currentNoteId);save('flux_notes',notes);backToNotesList();}
function toggleStarNote(){const btn=document.getElementById('starBtn');btn.textContent=btn.textContent==='⭐'?'☆':'⭐';}
function fmt(cmd){document.execCommand(cmd,false,null);}
function insHeading(){document.execCommand('formatBlock',false,'<h3>');}
function insBullet(){document.execCommand('insertUnorderedList',false,null);}
function insCode(){document.execCommand('insertHTML',false,'<code style="background:var(--border);padding:2px 6px;border-radius:4px;font-family:JetBrains Mono,monospace;font-size:.82em">code</code>');}
async function summarizeNoteWithAI(){const body=strip(document.getElementById('noteEditor').innerHTML);if(!body.trim())return;const resEl=document.getElementById('aiNoteResult');resEl.style.display='block';resEl.innerHTML='<div class="ai-bub bot"><div class="ai-think"><span></span><span></span><span></span></div></div>';try{const res=await fetch(API.ai,{method:'POST',headers:API_HEADERS,body:JSON.stringify({system:'Summarize the following student note concisely in bullet points.',messages:[{role:'user',content:body}]})});const data=await res.json();resEl.innerHTML=`<div class="ai-bub bot" style="max-width:100%">${fmtAI(data.content?.[0]?.text||'Could not summarize.')}</div>`;}catch(e){resEl.innerHTML=`<div style="color:var(--red);font-size:.82rem">${e.message}</div>`;}}
async function generateFlashcardsFromNote(){const body=strip(document.getElementById('noteEditor').innerHTML);if(!body.trim())return;const resEl=document.getElementById('aiNoteResult');resEl.style.display='block';resEl.innerHTML='<div style="color:var(--muted2);font-size:.82rem">Generating flashcards...</div>';try{const res=await fetch(API.ai,{method:'POST',headers:API_HEADERS,body:JSON.stringify({system:'Generate 8-12 flashcards from these notes. Respond ONLY with a JSON array of {"q":"question","a":"answer"} objects.',messages:[{role:'user',content:body}]})});const data=await res.json();let txt=(data.content?.[0]?.text||'[]').replace(/```json|```/g,'').trim();const cards=JSON.parse(txt);if(currentNoteId){const n=notes.find(x=>x.id===currentNoteId);if(n){n.flashcards=cards;save('flux_notes',notes);}}flashcards=cards;fcIndex=0;fcFlipped=false;resEl.innerHTML=`<div style="color:var(--green);font-size:.82rem">✓ Generated ${cards.length} flashcards!</div>`;openFlashcards();}catch(e){resEl.innerHTML=`<div style="color:var(--red);font-size:.82rem">Error generating flashcards.</div>`;}}
function openFlashcards(){if(!flashcards.length)return;fcIndex=0;fcFlipped=false;document.getElementById('notesEditorView').style.display='none';document.getElementById('flashcardView').style.display='block';renderFC();}
function closeFlashcards(){document.getElementById('flashcardView').style.display='none';document.getElementById('notesEditorView').style.display='block';}
function renderFC(){if(!flashcards.length)return;const fc=flashcards[fcIndex];document.getElementById('fcProgress').textContent=`Card ${fcIndex+1} / ${flashcards.length}`;document.getElementById('fcText').textContent=fcFlipped?fc.a:fc.q;document.getElementById('fcCard').style.background=fcFlipped?'rgba(var(--accent-rgb),.1)':'var(--card)';}
function flipFC(){fcFlipped=!fcFlipped;renderFC();}
function nextFC(){fcIndex=(fcIndex+1)%flashcards.length;fcFlipped=false;renderFC();}
function prevFC(){fcIndex=(fcIndex-1+flashcards.length)%flashcards.length;fcFlipped=false;renderFC();}

// ══ HABITS ══
function addHabit(){const name=document.getElementById('habitName').value.trim();if(!name)return;const icon=document.getElementById('habitIcon').value||'✅';const cat=document.getElementById('habitCat').value;habits.push({id:Date.now(),name,icon,cat,log:[],streak:0,bestStreak:0});save('flux_habits',habits);document.getElementById('habitName').value='';document.getElementById('habitIcon').value='';renderHabitList();renderHeatmap();}
function toggleHabitDay(id,day){const h=habits.find(x=>x.id===id);if(!h)return;const idx=h.log.indexOf(day);if(idx>=0)h.log.splice(idx,1);else h.log.push(day);h.streak=calcHabitStreak(h);h.bestStreak=Math.max(h.bestStreak||0,h.streak);save('flux_habits',habits);renderHabitList();}
function calcHabitStreak(h){let s=0,d=new Date(TODAY);while(true){const ds=d.toISOString().slice(0,10);if(h.log.includes(ds))s++;else break;d.setDate(d.getDate()-1);}return s;}
function deleteHabit(id){habits=habits.filter(h=>h.id!==id);save('flux_habits',habits);renderHabitList();}
function renderHabitList(){const el=document.getElementById('habitList');if(!el)return;if(!habits.length){el.innerHTML='<div class="empty">No habits yet. Add one above!</div>';return;}const td=todayStr();el.innerHTML=habits.map(h=>{const done=h.log.includes(td);const pct=Math.min(Math.round(h.log.length/90*100),100);return`<div class="card" style="padding:14px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:10px"><div style="font-size:1.4rem;width:38px;text-align:center">${h.icon}</div><div style="flex:1"><div style="font-size:.88rem;font-weight:700">${esc(h.name)}</div><div style="font-size:.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace">🔥 ${h.streak} streak · Best: ${h.bestStreak} · ${h.cat}</div></div><button onclick="toggleHabitDay(${h.id},'${td}')" style="padding:7px 14px;border-radius:20px;${done?'background:var(--green);color:#080a0f':'background:transparent;border:1px solid var(--border2);color:var(--muted2)'}">${done?'✓ Done':'Mark Done'}</button><button onclick="deleteHabit(${h.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div><div class="cas-bar" style="margin-top:8px"><div class="cas-fill" style="width:${pct}%"></div></div></div>`;}).join('');document.getElementById('heatmapCard').style.display='block';}
function renderHeatmap(){const el=document.getElementById('heatmapGrid');if(!el||!habits.length)return;const allLogs=new Set(habits.flatMap(h=>h.log));let html='<div style="display:flex;gap:2px;flex-wrap:nowrap">';const start=new Date(TODAY);start.setDate(TODAY.getDate()-90);for(let d=new Date(start);d<=TODAY;d.setDate(d.getDate()+1)){const ds=d.toISOString().slice(0,10);html+=`<div title="${ds}" style="width:10px;height:10px;border-radius:2px;flex-shrink:0;background:${allLogs.has(ds)?'var(--green)':'var(--border)'}"></div>`;}el.innerHTML=html+'</div>';}

// ══ GOALS ══
function addGoal(){const title=document.getElementById('goalTitle').value.trim();if(!title)return;goals.push({id:Date.now(),title,cat:document.getElementById('goalCat').value,deadline:document.getElementById('goalDeadline').value,target:parseFloat(document.getElementById('goalTarget').value)||100,progress:0,createdAt:Date.now()});save('flux_goals',goals);document.getElementById('goalTitle').value='';document.getElementById('goalTarget').value='';renderGoalsList();syncKey('goals',goals);}
function deleteGoal(id){goals=goals.filter(g=>g.id!==id);save('flux_goals',goals);renderGoalsList();}
function openGoalModal(id){editingGoalId=id;const g=goals.find(x=>x.id===id);if(!g)return;document.getElementById('goalProgressInput').value=g.progress||0;document.getElementById('goalProgressLabel').textContent='Target: '+g.target;document.getElementById('goalModal').style.display='flex';}
function closeGoalModal(){document.getElementById('goalModal').style.display='none';editingGoalId=null;}
function saveGoalProgress(){const g=goals.find(x=>x.id===editingGoalId);if(!g)return;g.progress=parseFloat(document.getElementById('goalProgressInput').value)||0;save('flux_goals',goals);closeGoalModal();renderGoalsList();}
function renderGoalsList(){const el=document.getElementById('goalsList');if(!el)return;if(!goals.length){el.innerHTML='<div class="empty">No goals yet. Set one above!</div>';return;}const catColors={academic:'var(--accent)',gpa:'var(--gold)',habit:'var(--green)',extracurricular:'var(--purple)',college:'var(--red)',personal:'var(--orange)'};el.innerHTML=goals.map(g=>{const pct=Math.min(Math.round(g.progress/g.target*100),100);const days=g.deadline?Math.max(0,Math.floor((new Date(g.deadline+'T00:00:00')-new Date())/86400000)):null;const c=catColors[g.cat]||'var(--accent)';return`<div class="goal-item"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span class="badge" style="background:${c}18;color:${c};border:1px solid ${c}33;padding:2px 6px;font-size:.6rem">${g.cat}</span><span style="font-size:.9rem;font-weight:700">${esc(g.title)}</span></div>${days!==null?`<div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">📅 ${days} days left</div>`:''}</div><div style="display:flex;gap:5px"><button onclick="openGoalModal(${g.id})" class="btn-sm">✎</button><button onclick="deleteGoal(${g.id})" class="btn-sm btn-del">✕</button></div></div><div style="font-size:.72rem;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent);margin-top:8px">${g.progress} / ${g.target} (${pct}%)</div><div class="goal-progress"><div class="goal-prog-fill" style="width:${pct}%"></div></div></div>`;}).join('');}
function addCollege(){const n=document.getElementById('cName').value.trim();if(!n)return;colleges.push({id:Date.now(),name:n,deadline:document.getElementById('cDeadline').value,status:document.getElementById('cStatus').value});save('flux_colleges',colleges);document.getElementById('cName').value='';renderCollegeList();}
function removeCollege(id){colleges=colleges.filter(c=>c.id!==id);save('flux_colleges',colleges);renderCollegeList();}
function renderCollegeList(){const el=document.getElementById('collegeList');if(!el)return;if(!colleges.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem">No schools added yet.</div>';return;}const sc={researching:{c:'var(--muted)',l:'Researching'},'in-progress':{c:'var(--gold)',l:'In Progress'},submitted:{c:'var(--accent)',l:'Submitted'},accepted:{c:'var(--green)',l:'Accepted ✓'},rejected:{c:'var(--red)',l:'Rejected'}};el.innerHTML=colleges.map(c=>{const s=sc[c.status]||sc.researching;return`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><div style="font-size:.88rem;font-weight:600">${esc(c.name)}</div>${c.deadline?`<div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">📅 ${c.deadline}</div>`:''}</div><span style="font-size:.72rem;font-weight:700;color:${s.c};font-family:'JetBrains Mono',monospace">${s.l}</span><button onclick="removeCollege(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`;}).join('');}

// ══ MOOD ══
function setMood(val,el){document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');localStorage.setItem('flux_mood_today',val);}
function setStress(v){const el=document.getElementById('stressVal');if(el)el.textContent=v;localStorage.setItem('flux_stress_today',v);}
function saveMoodEntry(){const mood=parseInt(localStorage.getItem('flux_mood_today')||'3');const stress=parseInt(document.getElementById('stressSlider').value||'3');const sleep=parseFloat(document.getElementById('sleepHours').value||'7');const entry={date:todayStr(),mood,stress,sleep};const idx=moodHistory.findIndex(m=>m.date===entry.date);if(idx>=0)moodHistory[idx]=entry;else moodHistory.push(entry);save('flux_mood',moodHistory);const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Check-In',1500);}const ba=document.getElementById('burnoutAlert');if(ba)ba.style.display=(stress>=8&&sleep<6)?'block':'none';renderMoodHistory();}
function renderMoodHistory(){const el=document.getElementById('moodHistory');if(!el)return;const last30=moodHistory.slice(-30);const moodEmoji=['','😞','😕','😐','🙂','😄'];if(!last30.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem">No entries yet.</div>';return;}el.innerHTML=last30.map(m=>`<div title="${m.date}" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:.95rem;background:var(--card2);border:1px solid var(--border)">${moodEmoji[m.mood]}</div>`).join('');const avg=last30.reduce((s,m)=>s+m.mood,0)/last30.length;const ins=document.getElementById('moodInsight');if(ins)ins.textContent=avg>=4?'😊 You\'ve been feeling pretty good lately!':avg<=2?'😟 Rough stretch — remember to rest.':'😐 Mood has been neutral. Keep pushing!';}
function renderAffirmation(){const el=document.getElementById('affirmation');if(!el)return;el.textContent='"'+AFFIRMATIONS[TODAY.getDate()%AFFIRMATIONS.length]+'"';}
function startBreathing(){if(breathingActive){clearInterval(breathTimer);breathingActive=false;document.getElementById('breathBtn').textContent='Start';document.getElementById('breathCircle').style.transform='scale(1)';document.getElementById('breathCircle').textContent='START';return;}breathingActive=true;document.getElementById('breathBtn').textContent='Stop';const phases=[{label:'Inhale',secs:4,scale:1.5},{label:'Hold',secs:7,scale:1.5},{label:'Exhale',secs:8,scale:1}];let pi=0,countdown=phases[0].secs;const tick=()=>{const p=phases[pi];document.getElementById('breathCircle').textContent=p.label+'\n'+countdown;document.getElementById('breathCircle').style.transform='scale('+p.scale+')';countdown--;if(countdown<0){pi=(pi+1)%3;countdown=phases[pi].secs;}};tick();breathTimer=setInterval(tick,1000);}

// ══ TIMER ══
const TM={pomodoro:{label:'Focus Time',mins:25},short:{label:'Short Break',mins:5},long:{label:'Long Break',mins:15}};
let tMode='pomodoro',tRunning=false,tInterval=null,tSecs=25*60,tTotal=25*60;
let tDone=load('t_sessions',0),tMins=load('t_minutes',0),tStreak=load('t_streak',0),tLastDate=load('t_date','');
const CIRC=2*Math.PI*88;
function updateTLengths(){if(tRunning)return;TM.pomodoro.mins=parseInt(document.getElementById('customWork').value)||25;TM.short.mins=parseInt(document.getElementById('customShort').value)||5;if(tMode==='pomodoro'||tMode==='short'){tSecs=TM[tMode].mins*60;tTotal=tSecs;updateTDisplay();}}
function setTMode(mode,el){if(tRunning)return;tMode=mode;tSecs=TM[mode].mins*60;tTotal=tSecs;document.querySelectorAll('#timer .tmode-btn').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');updateTDisplay();document.getElementById('tLbl').textContent=TM[mode].label;}
function toggleTimer(){tRunning?pauseTimer():startTimer();}
function startTimer(){tRunning=true;document.getElementById('timerBtn').textContent='⏸ Pause';tInterval=setInterval(()=>{tSecs--;updateTDisplay();if(tSecs<=0)timerDone();},1000);}
function pauseTimer(){tRunning=false;clearInterval(tInterval);document.getElementById('timerBtn').textContent='▶ Resume';}
function resetTimer(){tRunning=false;clearInterval(tInterval);tSecs=TM[tMode].mins*60;tTotal=tSecs;document.getElementById('timerBtn').textContent='▶ Start';updateTDisplay();}
function timerDone(){tRunning=false;clearInterval(tInterval);document.getElementById('timerBtn').textContent='▶ Start';if(tMode==='pomodoro'){tDone++;tMins+=TM.pomodoro.mins;const ts=todayStr();if(tLastDate!==ts){const y=new Date(TODAY);y.setDate(TODAY.getDate()-1);tStreak=tLastDate===y.toISOString().slice(0,10)?tStreak+1:1;tLastDate=ts;save('t_date',tLastDate);}const sub=document.getElementById('timerSubject')?.value||'';sessionLog.push({date:ts,mins:TM.pomodoro.mins,subject:sub});save('flux_session_log',sessionLog);if(sub){subjectBudgets[sub]=(subjectBudgets[sub]||0)+(TM.pomodoro.mins/60);save('flux_budgets',subjectBudgets);}save('t_sessions',tDone);save('t_minutes',tMins);save('t_streak',tStreak);updateTStats();renderTDots();renderSubjectBudget();renderFocusHeatmap();setTimeout(()=>{const mode=tDone%4===0?'long':'short';const btns=document.querySelectorAll('#timer .tmode-btn');setTMode(mode,btns[mode==='long'?2:1]);},400);}else{setTimeout(()=>{setTMode('pomodoro',document.querySelectorAll('#timer .tmode-btn')[0]);},400);}}
function updateTDisplay(){const m=Math.floor(tSecs/60),s=tSecs%60;document.getElementById('tDisplay').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');const offset=CIRC*(1-tSecs/tTotal);const ring=document.getElementById('timerRing');if(ring){ring.style.strokeDasharray=CIRC;ring.style.strokeDashoffset=offset;}}
function renderTDots(){const el=document.getElementById('timerDots');if(!el)return;const c=Math.min((tDone%4)||(tDone>0?4:0),4);el.innerHTML=[0,1,2,3].map(i=>`<div class="t-dot ${i<c?'done':''}"></div>`).join('');const lbl=document.getElementById('tSessionLbl');if(lbl)lbl.textContent=`Session ${(tDone%4)+1} of 4`;}
function updateTStats(){const a=document.getElementById('tSessions'),b=document.getElementById('tMinutes'),c=document.getElementById('tStreak');if(a)a.textContent=tDone;if(b)b.textContent=tMins;if(c)c.textContent=tStreak;}
function renderSubjectBudget(){const el=document.getElementById('subjectBudget');if(!el)return;const targets={LIT:3,CHE:4,PHY:4,MTH:4,FRE:2,AME:3,PP:2};el.innerHTML=Object.entries(SUBJECTS).filter(([k])=>targets[k]).map(([k,s])=>{const done=parseFloat((subjectBudgets[k]||0).toFixed(1));const target=targets[k];const pct=Math.min(Math.round(done/target*100),100);const c=pct>=100?'var(--green)':pct>=60?'var(--accent)':'var(--gold)';return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${s.color}"></div><span style="font-size:.8rem;font-weight:600">${s.short}</span></div><span style="font-size:.72rem;font-family:'JetBrains Mono',monospace;color:${c}">${done} / ${target}h</span></div><div class="budget-bar"><div class="budget-fill" style="width:${pct}%;background:${s.color}"></div></div></div>`;}).join('');}
function renderFocusHeatmap(){const el=document.getElementById('focusHeatmap');if(!el)return;const weekStart=new Date(TODAY);weekStart.setDate(TODAY.getDate()-TODAY.getDay()+1);const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];el.innerHTML=days.map((day,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const ds=d.toISOString().slice(0,10);const mins=sessionLog.filter(s=>s.date===ds).reduce((sum,s)=>sum+s.mins,0);const intensity=Math.min(mins/120,1);const isToday=ds===todayStr();return`<div style="flex:1;text-align:center"><div style="height:40px;border-radius:8px;background:rgba(var(--accent-rgb),${intensity.toFixed(2)});border:1px solid ${isToday?'var(--accent)':'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:'JetBrains Mono',monospace;color:var(--text);font-weight:700">${mins>0?mins+'m':''}</div><div style="font-size:.58rem;color:var(--muted);margin-top:3px;font-family:'JetBrains Mono',monospace">${day}</div></div>`;}).join('');}
function playAmbient(type,btn){stopAmbient();document.querySelectorAll('#timer .tmode-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');try{ambientCtx=new(window.AudioContext||window.webkitAudioContext)();const buf=ambientCtx.createBuffer(1,ambientCtx.sampleRate*2,ambientCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(type==='white'?0.15:0.08);const src=ambientCtx.createBufferSource();src.buffer=buf;src.loop=true;const g=ambientCtx.createGain();g.gain.value=0.4;if(type==='rain'){const f=ambientCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=1200;src.connect(f);f.connect(g);}else src.connect(g);g.connect(ambientCtx.destination);src.start();}catch(e){}}
function stopAmbient(){if(ambientCtx){try{ambientCtx.close();}catch(e){}ambientCtx=null;}document.querySelectorAll('#timer .card .tmode-btn').forEach(b=>b.classList.remove('active'));}

// ══ PROFILE ══
function saveProfile(){const p={name:document.getElementById('name').value,grade:document.getElementById('grade').value,track:document.getElementById('track').value};localStorage.setItem('profile',JSON.stringify(p));localStorage.setItem('flux_user_name',p.name);renderProfile();syncKey('profile',p);const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Profile',1500);}}
function handlePicUpload(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{localStorage.setItem('flux_profile_pic',ev.target.result);const av=document.getElementById('pAvatar');if(av)av.innerHTML=`<img src="${ev.target.result}"><input type="file" id="picUpload" accept="image/*" style="display:none" onchange="handlePicUpload(event)">`;};r.readAsDataURL(file);}
function setDNA(type){const idx=studyDNA.indexOf(type);if(idx>=0)studyDNA.splice(idx,1);else studyDNA.push(type);save('flux_dna',studyDNA);document.querySelectorAll('[id^=dna-]').forEach(b=>b.classList.remove('active'));studyDNA.forEach(d=>{const btn=document.getElementById('dna-'+d);if(btn)btn.classList.add('active');});const tips={visual:'Use diagrams, charts, color-coded notes.',audio:'Read aloud, record yourself, use podcasts.',reading:'Textbooks, detailed notes, rewrite summaries.',practice:'Do problems, flashcards, practice tests.'};const el=document.getElementById('studyDNAResult');if(el)el.textContent=studyDNA.map(d=>tips[d]).join(' ');}
function renderProfile(){const p=load('profile',{});const name=p.name||localStorage.getItem('flux_user_name')||'Student';const grade=p.grade||'10';const track=p.track||'Pre-IB / MYP';document.getElementById('profileName').textContent=name;document.getElementById('profileSubline').textContent=`Grade ${grade} · ${track}`;if(p.name){document.getElementById('name').value=p.name;document.getElementById('grade').value=p.grade||'10';document.getElementById('track').value=p.track||'Pre-IB / MYP';}const pic=localStorage.getItem('flux_profile_pic');const av=document.getElementById('pAvatar');if(av)av.innerHTML=(pic?`<img src="${pic}">`:name.charAt(0).toUpperCase())+`<input type="file" id="picUpload" accept="image/*" style="display:none" onchange="handlePicUpload(event)">`;const gpa=calcGPA(grades);const done=tasks.filter(t=>t.done).length;const badges=[];if(gpa!==null&&gpa>=3.7)badges.push({t:'🏆 Honor Roll',c:'badge-gold'});if(done>=20)badges.push({t:'✓ Task Master',c:'badge-green'});if(tStreak>=7)badges.push({t:'🔥 Study Streak',c:'badge-red'});if(track.toLowerCase().includes('ib diploma'))badges.push({t:'📚 IB Diploma',c:'badge-blue'});if(notes.length>=10)badges.push({t:'📝 Note Taker',c:'badge-purple'});const badgeEl=document.getElementById('profileBadges');if(badgeEl)badgeEl.innerHTML=badges.length?badges.map(b=>`<span class="badge ${b.c}">${b.t}</span>`).join(''):'<span style="font-size:.75rem;color:var(--muted)">Complete tasks to earn badges!</span>';const ps=document.getElementById('profileStats');if(ps)ps.innerHTML=[[gpa!==null?precise(gpa):'—','GPA (4dp)','var(--accent)'],[done,'Done','var(--green)'],[tasks.filter(t=>!t.done).length,'Active','var(--gold)'],[notes.length,'Notes','var(--purple)']].map(([n,l,c])=>`<div style="background:var(--card2);border-radius:10px;padding:12px"><div style="font-size:1.4rem;font-weight:800;color:${c}">${n}</div><div style="font-size:.65rem;color:var(--muted);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-top:2px">${l}</div></div>`).join('');const confEl=document.getElementById('confidenceSliders');if(confEl)confEl.innerHTML=Object.entries(SUBJECTS).map(([k,s])=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${s.color}"></div><span style="font-size:.82rem;font-weight:600">${s.short}</span></div><span style="font-size:.75rem;font-family:'JetBrains Mono',monospace;color:var(--accent);font-weight:700" id="cv-${k}">${confidences[k]||5}/10</span></div><input type="range" min="1" max="10" value="${confidences[k]||5}" oninput="document.getElementById('cv-${k}').textContent=this.value+'/10';confidences['${k}']=parseInt(this.value)" style="width:100%"></div>`).join('');studyDNA.forEach(d=>{const btn=document.getElementById('dna-'+d);if(btn)btn.classList.add('active');});renderCanvasStatus();}
function saveConfidences(){save('flux_conf',confidences);const b=event?.target;if(b){b.textContent='✓ Saved';setTimeout(()=>b.textContent='Save',1500);}}

// ══ THEMES ══
const THEMES={
  dark:{
    label:'🌙 Midnight',
    vars:{'--bg':'#0a0b10','--bg2':'#0d0e15','--card':'#161826','--card2':'#1a1d2c','--card-solid':'#161826','--border':'rgba(255,255,255,.07)','--border2':'rgba(255,255,255,.1)','--text':'#eef0f7','--muted':'#6b7280','--muted2':'#9ca3af','--accent':'#6366f1','--accent-rgb':'99,102,241','--green':'#10d9a0','--red':'#f43f5e','--gold':'#fbbf24','--purple':'#c084fc','--orange':'#fb923c'}
  },
  light:{
    label:'☀️ Cloud',
    vars:{'--bg':'#f0f2f8','--bg2':'#e4e8f2','--card':'#ffffff','--card2':'#f5f7ff','--card-solid':'#ffffff','--border':'rgba(0,0,0,.09)','--border2':'rgba(0,0,0,.13)','--text':'#1a1d2e','--muted':'#6b7280','--muted2':'#4b5563','--accent':'#6366f1','--accent-rgb':'99,102,241','--green':'#059669','--red':'#dc2626','--gold':'#d97706','--purple':'#9333ea','--orange':'#ea580c'}
  },
  aurora:{
    label:'🌌 Aurora',
    vars:{'--bg':'#060a12','--bg2':'#080d18','--card':'#08101e','--card2':'#0a1424','--card-solid':'#08101e','--border':'rgba(100,200,255,.09)','--border2':'rgba(100,200,255,.14)','--text':'#e0f0ff','--muted':'#5a7a9a','--muted2':'#7a9aba','--accent':'#22d3ee','--accent-rgb':'34,211,238','--green':'#34d399','--red':'#f87171','--gold':'#fbbf24','--purple':'#818cf8','--orange':'#fb923c'}
  },
  ember:{
    label:'🔥 Ember',
    vars:{'--bg':'#0d0804','--bg2':'#120a05','--card':'#1c1008','--card2':'#221408','--card-solid':'#1c1008','--border':'rgba(255,120,40,.09)','--border2':'rgba(255,120,40,.14)','--text':'#fff4ec','--muted':'#8a5a3a','--muted2':'#b07a5a','--accent':'#f97316','--accent-rgb':'249,115,22','--green':'#fbbf24','--red':'#ef4444','--gold':'#f59e0b','--purple':'#fb923c','--orange':'#f97316'}
  },
  forest:{
    label:'🌿 Forest',
    vars:{'--bg':'#060d08','--bg2':'#080f0a','--card':'#0a140c','--card2':'#0d1a0f','--card-solid':'#0a140c','--border':'rgba(80,200,100,.09)','--border2':'rgba(80,200,100,.14)','--text':'#e8f5ea','--muted':'#4a7a52','--muted2':'#6a9a72','--accent':'#22c55e','--accent-rgb':'34,197,94','--green':'#4ade80','--red':'#f87171','--gold':'#fbbf24','--purple':'#a3e635','--orange':'#fb923c'}
  },
  rose:{
    label:'🌸 Rose',
    vars:{'--bg':'#0d0608','--bg2':'#120809','--card':'#1c0a0e','--card2':'#220c12','--card-solid':'#1c0a0e','--border':'rgba(255,100,130,.09)','--border2':'rgba(255,100,130,.14)','--text':'#fff0f3','--muted':'#8a4a58','--muted2':'#b07080','--accent':'#f43f5e','--accent-rgb':'244,63,94','--green':'#fb7185','--red':'#e11d48','--gold':'#fbbf24','--purple':'#e879f9','--orange':'#fb923c'}
  },
  ocean:{
    label:'🌊 Deep Ocean',
    vars:{'--bg':'#020810','--bg2':'#030a14','--card':'#04101e','--card2':'#061424','--card-solid':'#04101e','--border':'rgba(30,100,200,.11)','--border2':'rgba(30,100,200,.17)','--text':'#dceeff','--muted':'#3a5a7a','--muted2':'#5a80a0','--accent':'#3b82f6','--accent-rgb':'59,130,246','--green':'#22d3ee','--red':'#f87171','--gold':'#fbbf24','--purple':'#818cf8','--orange':'#fb923c'}
  },
  candy:{
    label:'🍬 Candy',
    vars:{'--bg':'#0e0814','--bg2':'#120a18','--card':'#14101e','--card2':'#1a1428','--card-solid':'#14101e','--border':'rgba(200,100,255,.09)','--border2':'rgba(200,100,255,.14)','--text':'#f5e8ff','--muted':'#7a4a9a','--muted2':'#a070c0','--accent':'#a855f7','--accent-rgb':'168,85,247','--green':'#f472b6','--red':'#f43f5e','--gold':'#fbbf24','--purple':'#e879f9','--orange':'#fb923c'}
  },
};

function applyTheme(key){
  const theme=THEMES[key];if(!theme)return;
  const root=document.documentElement;
  // First reset any custom overrides so theme shows cleanly
  Object.keys(THEMES.dark.vars).forEach(k=>root.style.removeProperty(k));
  // Apply theme vars
  Object.entries(theme.vars).forEach(([k,v])=>root.style.setProperty(k,v));
  document.body.setAttribute('data-theme',key);
  localStorage.setItem('flux_theme',key);
  // Re-apply custom color overrides on top
  const custom=load('flux_custom_colors',{});
  Object.entries(custom).forEach(([k,v])=>root.style.setProperty(k,v));
}
function themeDark(){applyTheme('dark');}
function themeCrimson(){applyTheme('ember');}
function themeFocus(){applyTheme('forest');}
function themeSepia(){applyTheme('rose');}

function loadTheme(){
  const key=localStorage.getItem('flux_theme')||'dark';
  applyTheme(key);
}

function applyCustomVar(varName,value){
  document.documentElement.style.setProperty(varName,value);
  const custom=load('flux_custom_colors',{});
  custom[varName]=value;
  save('flux_custom_colors',custom);
}
function resetCustomColors(){
  save('flux_custom_colors',{});
  const key=localStorage.getItem('flux_theme')||'dark';
  applyTheme(key);
  const b=event?.target;if(b){b.textContent='✓ Reset!';setTimeout(()=>b.textContent='↺ Reset colors',1500);}
}
function setAccent(hex,rgb,el){
  applyCustomVar('--accent',hex);
  applyCustomVar('--accent-rgb',rgb);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));
  if(el)el.classList.add('active');
}
function applyCustomColor(){
  const hex=document.getElementById('customColor').value;
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  setAccent(hex,`${r},${g},${b}`,null);
}
  document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));
  if(el)el.classList.add('active');
}
function applyCustomColor(){
  const hex=document.getElementById('customColor').value;
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  setAccent(hex,`${r},${g},${b}`,null);
}

// ══ SETTINGS ══
function switchStab(id,el){document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.spane').forEach(p=>p.classList.remove('active'));el.classList.add('active');document.getElementById('spane-'+id).classList.add('active');}
function toggleSetting(k,el){settings[k]=!settings[k];el.classList.toggle('on',settings[k]);save('flux_settings',settings);}
function saveDND(){settings.dndStart=document.getElementById('dndStart').value;settings.dndEnd=document.getElementById('dndEnd').value;save('flux_settings',settings);const b=event?.target;if(b){b.textContent='✓';setTimeout(()=>b.textContent='Save',1500);}}
function saveDailyGoal(){settings.dailyGoalHrs=parseFloat(document.getElementById('dailyGoalHrs').value)||2;save('flux_settings',settings);const done=tMins/60,goal=settings.dailyGoalHrs;const el=document.getElementById('dailyGoalStatus');if(el)el.textContent=done>=goal?`✓ Goal reached! (${done.toFixed(1)}h / ${goal}h)`:`Progress: ${done.toFixed(1)}h / ${goal}h`;}
function loadSettingsUI(){const pt=document.getElementById('panicToggle');if(pt)pt.classList.toggle('on',settings.panic!==false);const qt=document.getElementById('quietToggle');if(qt)qt.classList.toggle('on',settings.quiet!==false);const ds=document.getElementById('dndStart');if(ds)ds.value=settings.dndStart||'07:50';const de=document.getElementById('dndEnd');if(de)de.value=settings.dndEnd||'14:30';const dg=document.getElementById('dailyGoalHrs');if(dg)dg.value=settings.dailyGoalHrs||2;}
function renderNoHWList(){const el=document.getElementById('noHWList');if(!el)return;const sorted=[...noHomeworkDays].sort();const groups=[];let rs=null,rp=null;const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});sorted.forEach(d=>{if(!rs){rs=d;rp=d;}else{const prev=new Date(rp+'T12:00:00');prev.setDate(prev.getDate()+1);if(prev.toISOString().slice(0,10)===d)rp=d;else{groups.push(rs===rp?fmt(rs):fmt(rs)+' – '+fmt(rp));rs=d;rp=d;}}});if(rs)groups.push(rs===rp?fmt(rs):fmt(rs)+' – '+fmt(rp));el.innerHTML=groups.map(g=>`<div>📵 ${g}</div>`).join('');}

function renderTabCustomizer(){
  const el=document.getElementById('tabCustomizerList');if(!el)return;
  el.innerHTML=tabConfig.map((t,i)=>`
    <div class="tab-row" draggable="true" data-idx="${i}"
      ondragstart="tcDragStart(event,${i})"
      ondragover="tcDragOver(event,${i})"
      ondragleave="tcDragLeave(event)"
      ondrop="tcDrop(event,${i})"
      ondragend="tcDragEnd(event)">
      <span class="tab-drag-handle" title="Drag to reorder">⠿</span>
      <span class="tab-row-icon">${t.icon}</span>
      <span class="tab-row-name">${t.label}</span>
      <button class="tab-row-toggle ${t.visible?'on':''}" onclick="tcToggle(${i})" title="${t.visible?'Hide':'Show'}"></button>
    </div>`).join('');
}
let tcDragIdx=null;
function tcDragStart(e,i){
  tcDragIdx=i;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',String(i));
  setTimeout(()=>e.currentTarget.style.opacity='.4',0);
}
function tcDragOver(e,i){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  // Highlight drop target
  document.querySelectorAll('.tab-row').forEach(r=>r.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function tcDragLeave(e){e.currentTarget.classList.remove('drag-over');}
function tcDragEnd(e){
  e.currentTarget.style.opacity='';
  document.querySelectorAll('.tab-row').forEach(r=>{r.classList.remove('drag-over');r.style.opacity='';});
}
function tcDrop(e,i){
  e.preventDefault();
  document.querySelectorAll('.tab-row').forEach(r=>r.classList.remove('drag-over'));
  if(tcDragIdx===null||tcDragIdx===i){tcDragIdx=null;return;}
  const moved=tabConfig.splice(tcDragIdx,1)[0];
  tabConfig.splice(i,0,moved);
  tcDragIdx=null;
  save('flux_tabs',tabConfig);
  renderTabCustomizer();
  renderSidebars();
}
function tcToggle(i){
  if(tabConfig[i].id==='settings'&&tabConfig[i].visible){return;}
  tabConfig[i].visible=!tabConfig[i].visible;
  save('flux_tabs',tabConfig);
  renderTabCustomizer();
  renderSidebars();
}
function resetTabs(){
  tabConfig=DEFAULT_TABS.map(t=>({...t}));
  save('flux_tabs',tabConfig);
  renderTabCustomizer();
  renderSidebars();
  const b=event?.target;if(b){b.textContent='✓ Reset!';setTimeout(()=>b.textContent='↺ Reset to defaults',1500);}
}
function exportData(){const data={tasks,grades,notes:notes.map(n=>({...n,body:strip(n.body)})),habits,goals,colleges,moodHistory,schoolInfo,classes,settings,exportDate:new Date().toISOString()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='flux-data.json';a.click();URL.revokeObjectURL(url);}
function exportToICal(){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Flux Planner//EN'];tasks.filter(t=>t.date&&!t.done).forEach(t=>{const d=t.date.replace(/-/g,'');lines.push('BEGIN:VEVENT','DTSTART;VALUE=DATE:'+d,'SUMMARY:'+t.name,'END:VEVENT');});lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='flux.ics';a.click();URL.revokeObjectURL(url);}
function clearCache(){if(!confirm('Clear all local data?'))return;const keep=['flux_settings','flux_accent','flux_accent_rgb','flux_theme','profile','flux_user_name'];Object.keys(localStorage).forEach(k=>{if(!keep.includes(k))localStorage.removeItem(k);});tasks=[];grades={};notes=[];habits=[];goals=[];colleges=[];moodHistory=[];renderStats();renderTasks();}

// ══ AI ══
function fmtAI(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^### (.+)$/gm,'<strong style="display:block;margin-top:8px;margin-bottom:2px">$1</strong>').replace(/^- (.+)$/gm,'<li style="margin-left:14px;margin-bottom:3px">$1</li>').replace(/Q:\s*(.+)/g,'<strong style="color:var(--accent)">Q:</strong> $1').replace(/A:\s*(.+)/g,'<strong style="color:var(--green)">A:</strong> $1').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');}
function appendMsg(role,content,isThink){const wrap=document.getElementById('aiMsgs');if(!wrap)return document.createElement('div');const div=document.createElement('div');div.className='ai-msg '+role;const isBot=role==='bot';if(isThink){div.id='aiThink';div.innerHTML='<div class="ai-av bot">✦</div><div class="ai-bub bot"><div class="ai-think"><span></span><span></span><span></span></div></div>';}else{const f=isBot?fmtAI(content):esc(content);const init=(localStorage.getItem('flux_user_name')||'U').charAt(0).toUpperCase();div.innerHTML=`<div class="ai-av ${isBot?'bot':'me'}">${isBot?'✦':init}</div><div class="ai-bub ${isBot?'bot':'user'}">${f}</div>`;}wrap.appendChild(div);div.scrollIntoView({behavior:'smooth',block:'end'});return div;}
function renderAISugs(){const el=document.getElementById('aiSugs');if(!el)return;el.innerHTML='';["What's due this week?","Make me a study plan","Create Chemistry flashcards","Explain this Physics concept","Help with my essay outline","Quiz me on Math 3","What should I work on now?","Generate a 3-day exam prep plan"].forEach(s=>{const btn=document.createElement('button');btn.className='ai-sug';btn.textContent=s;btn.onclick=()=>{document.getElementById('aiInput').value=s;sendAI();};el.appendChild(btn);});}
function handleAIImg(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{aiPendingImg={data:e.target.result.split(',')[1],mime:file.type,name:file.name};const prev=document.getElementById('aiImgPreview');if(prev){prev.style.display='block';prev.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.2);border-radius:8px"><img src="${e.target.result}" style="width:44px;height:44px;object-fit:cover;border-radius:6px"><div style="flex:1;font-size:.78rem;font-weight:600">${file.name}</div><button onclick="aiPendingImg=null;this.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0">✕</button></div>`;}};reader.readAsDataURL(file);}
function buildAIPrompt(){const ctx=refreshAIContext();const name=localStorage.getItem('flux_user_name')||'Student';const now=new Date();now.setHours(0,0,0,0);const ab=AB_MAP[todayStr()];const gpa=calcGPA(grades);const mood=moodHistory.slice(-1)[0];const fmt=t=>{const due=t.date?new Date(t.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'no date';const over=t.date&&new Date(t.date+'T00:00:00')<now?' OVERDUE':'';const np=t.date&&isBreak(t.date)?' [NO-HW]':'';const s=SUBJECTS[t.subject];return`- [${(t.priority||'med').toUpperCase()}|${s?s.short:t.subject||'—'}|${t.type||'hw'}|Due ${due}${over}${np}]: ${t.name}`;};return`You are Flux AI — a brilliant, warm AI tutor and planner assistant.
Student: ${name} · Today: ${TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · ${ab||'?'} Day
${mood?`Mood: ${mood.mood}/5, Stress: ${mood.stress}/10, Sleep: ${mood.sleep}h`:''}
Recent (7d): ${ctx.recent.length?ctx.recent.map(fmt).join(' | '):'None'}
Upcoming (14d): ${ctx.upcoming.length?ctx.upcoming.map(fmt).join(' | '):'None'}
Active tasks: ${tasks.filter(t=>!t.done).slice(0,20).map(fmt).join(' | ')||'None'}
${Object.keys(grades).length?`Grades: ${Object.entries(grades).map(([k,v])=>k+': '+v).join(', ')} | GPA: ${gpa!==null?precise(gpa):'—'}`:''}
Physics: always g=10 m/s². GPA: 4dp always. Be warm, call student by name.

CRITICAL TASK RULES:
- When adding tasks, output the actions block ONLY. Do NOT write any description, confirmation, or explanation of the task after it. The UI handles confirmation automatically.
- Keep responses concise. Never repeat back task details you just added.
- Never sign off with the student's name after every message — only use it naturally mid-conversation.

TASK ACTIONS — output this JSON block to add/modify tasks, then say nothing else about it:
\`\`\`actions
[{"action":"add_task","name":"...","priority":"high","date":"YYYY-MM-DD","type":"test","subject":"CHE"}]
\`\`\``;}
function execActions(reply){const match=reply.match(/```actions\s*([\s\S]*?)```/);if(!match)return null;let actions;try{actions=JSON.parse(match[1].trim());}catch(e){return null;}if(!Array.isArray(actions))return null;let results=[],changed=false;actions.forEach(a=>{if(a.action==='add_task'){const t={id:Date.now()+Math.random(),name:a.name||'Task',subject:a.subject||'',priority:a.priority||'med',date:a.date||'',type:a.type||'hw',done:false,rescheduled:0,createdAt:Date.now()};t.urgencyScore=calcUrgency(t);tasks.unshift(t);results.push('✓ Added: '+a.name);changed=true;}else if(a.action==='delete_done'){const c=tasks.filter(t=>t.done).length;tasks=tasks.filter(t=>!t.done);results.push('✓ Removed '+c+' done tasks');changed=true;}else if(a.action==='mark_done'){const t=tasks.find(x=>x.name?.toLowerCase().includes((a.name||'').toLowerCase()));if(t){t.done=true;results.push('✓ Done: '+t.name);changed=true;}}});if(changed){save('tasks',tasks);renderStats();renderTasks();renderCalendar();renderCountdown();}return results.length?`<div style="padding:8px 10px;background:rgba(var(--accent-rgb),.08);border-radius:8px;font-size:.8rem;border:1px solid rgba(var(--accent-rgb),.2)">${results.join('<br>')}</div>`:null;}
async function sendAI(){
  const input=document.getElementById('aiInput'),btn=document.getElementById('aiSendBtn');
  if(!input||!btn)return;
  const text=input.value.trim();
  if(!text&&!aiPendingImg)return;
  if(btn.disabled)return;
  document.getElementById('aiSugs').style.display='none';
  const imgSnapshot=aiPendingImg;
  appendMsg('user',text||(imgSnapshot?'📷 Analyze image':''));
  aiPendingImg=null;
  const prev=document.getElementById('aiImgPreview');if(prev)prev.style.display='none';
  const userMsg=text||(imgSnapshot?'Please analyze this image.':'');
  aiHistory.push({role:'user',content:userMsg});
  input.value='';input.style.height='auto';btn.disabled=true;
  const thinkEl=appendMsg('bot','',true);
  try{
    const body={system:buildAIPrompt(),messages:aiHistory.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)}))};
    // If image attached, send it for Gemini vision via the ai-proxy
    if(imgSnapshot){body.imageBase64=imgSnapshot.data;body.mimeType=imgSnapshot.mime;}
    const res=await fetch(API.ai,{method:'POST',headers:API_HEADERS,body:JSON.stringify(body)});
    if(!res.ok){const err=await res.json().catch(()=>({error:'Unknown error'}));throw new Error(err.error||'HTTP '+res.status);}
    const data=await res.json();
    const reply=data.content?.[0]?.text||"I didn't get a response — try again.";
    thinkEl.remove();
    const ar=execActions(reply);
    // Strip the actions block from the displayed reply
    const clean=reply.replace(/```actions[\s\S]*?```/g,'').trim();
    // Only show the reply if there's actual text content (not just whitespace after stripping)
    if(clean){appendMsg('bot',clean);}
    // Show action result as a separate small confirmation below, not inside the bubble
    if(ar){
      const confDiv=document.createElement('div');
      confDiv.style.cssText='font-size:.78rem;padding:6px 10px;margin-top:-4px;margin-bottom:8px;opacity:.8';
      confDiv.innerHTML=ar;
      document.getElementById('aiMsgs').appendChild(confDiv);
      confDiv.scrollIntoView({behavior:'smooth',block:'end'});
    }
    aiHistory.push({role:'assistant',content:reply});
    if(aiHistory.length>24)aiHistory=aiHistory.slice(-24);
  }catch(err){
    thinkEl.remove();
    appendMsg('bot','Something went wrong: '+err.message+'\n\nCheck that your Supabase Edge Functions are deployed and API keys are set.');
  }
  btn.disabled=false;input.focus();
}

// ══ SUPABASE SYNC ══
const SYNC_KEYS=['tasks','grades','notes','habits','goals','colleges','moodHistory','schoolInfo','classes','teacherNotes','profile'];
function setSyncStatus(status){
  const el=document.getElementById('syncIndicator');const sl=document.getElementById('syncStatus');const bh=document.getElementById('syncBadgeHolder');
  if(!el)return;
  if(status==='synced'){el.className='sync-badge synced';el.textContent='✓ Synced';if(sl)sl.textContent='All data synced to cloud';if(bh)bh.innerHTML='<span class="sync-badge synced">✓ Synced</span>';}
  else if(status==='syncing'){el.className='sync-badge syncing';el.textContent='↑ Syncing...';if(sl)sl.textContent='Syncing...';}
  else{el.className='sync-badge offline';el.textContent='○ Local';if(sl)sl.textContent='Not signed in — data is local only';}
  el.style.display=currentUser?'flex':'none';
}
function getCloudPayload(){return{tasks,grades,weightedRows,notes:notes.map(n=>({...n,body:n.body||''})),habits,goals,colleges,moodHistory,schoolInfo,classes,teacherNotes,profile:load('profile',{}),studyDNA,confidences,sessionLog};}
async function syncToCloud(){
  if(!currentUser)return;
  const sb=getSB();if(!sb)return;
  setSyncStatus('syncing');
  try{
    const{error}=await sb.from('user_data').upsert({id:currentUser.id,data:getCloudPayload(),updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error)throw error;
    setSyncStatus('synced');save('flux_last_sync',Date.now());
  }catch(e){console.error('Sync error',e);setSyncStatus('offline');}
}
async function syncFromCloud(){
  if(!currentUser)return;
  const sb=getSB();if(!sb)return;
  setSyncStatus('syncing');
  try{
    const{data,error}=await sb.from('user_data').select('data').eq('id',currentUser.id).single();
    if(error||!data){setSyncStatus('offline');return;}
    const d=data.data;
    if(d.tasks){tasks=d.tasks;save('tasks',tasks);}
    if(d.grades){grades=d.grades;save('flux_grades',grades);}
    if(d.weightedRows){weightedRows=d.weightedRows;save('flux_weighted',weightedRows);}
    if(d.notes){notes=d.notes;save('flux_notes',notes);}
    if(d.habits){habits=d.habits;save('flux_habits',habits);}
    if(d.goals){goals=d.goals;save('flux_goals',goals);}
    if(d.colleges){colleges=d.colleges;save('flux_colleges',colleges);}
    if(d.moodHistory){moodHistory=d.moodHistory;save('flux_mood',moodHistory);}
    if(d.schoolInfo){schoolInfo=d.schoolInfo;save('flux_school',schoolInfo);}
    if(d.classes){classes=d.classes;save('flux_classes',classes);}
    if(d.teacherNotes){teacherNotes=d.teacherNotes;save('flux_teacher_notes',teacherNotes);}
    if(d.profile){localStorage.setItem('profile',JSON.stringify(d.profile));}
    if(d.studyDNA){studyDNA=d.studyDNA;save('flux_dna',studyDNA);}
    if(d.confidences){confidences=d.confidences;save('flux_conf',confidences);}
    if(d.sessionLog){sessionLog=d.sessionLog;save('flux_session_log',sessionLog);}
    setSyncStatus('synced');
    renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();renderProfile();renderGradeInputs();renderGradeOverview();renderNotesList();renderHabitList();renderGoalsList();renderCollegeList();renderMoodHistory();renderSchool();updateTStats();
  }catch(e){console.error('Sync from cloud error',e);setSyncStatus('offline');}
}
const syncDebounceTimers={};
function syncKey(key,val){
  if(!currentUser)return;
  clearTimeout(syncDebounceTimers[key]);
  syncDebounceTimers[key]=setTimeout(()=>syncToCloud(),3000);
}

// ══ ONBOARDING ══
let obCurrentStep=1;
const OB_TOTAL=4;
let obSelectedGrade='10';
let obSelectedTrack='Pre-IB / MYP';
let obScheduleImgData=null;
let obExtractedClasses=[];

function showOnboarding(){
  obCurrentStep=1;
  document.getElementById('loginScreen').classList.remove('visible');
  document.getElementById('app').classList.remove('visible');
  const ob=document.getElementById('onboarding');
  if(ob)ob.classList.add('visible');
  renderObProgress();
  showObStep(1);
}
function renderObProgress(){
  const el=document.getElementById('obProgress');if(!el)return;
  el.innerHTML=Array.from({length:OB_TOTAL},(_,i)=>{
    const n=i+1;
    const cls=n<obCurrentStep?'done':n===obCurrentStep?'active':'';
    return`<div class="ob-dot ${cls}"></div>`;
  }).join('');
}
function showObStep(n){
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('active'));
  const s=document.getElementById('ob-step-'+n);if(s)s.classList.add('active');
  obCurrentStep=n;renderObProgress();
}
function selectObChip(el,key,val){
  el.closest('.ob-chip-wrap,.ob-chips').querySelectorAll('.ob-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  if(key==='obGrade')obSelectedGrade=val;
  if(key==='obTrack')obSelectedTrack=val;
}
function updateObPreview(){
  const name=(document.getElementById('obName')?.value||'').trim();
  const av=document.getElementById('obAvatar');
  if(av&&name&&!av.querySelector('img'))av.textContent=name.charAt(0).toUpperCase();
}
function handleObPic(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    localStorage.setItem('flux_profile_pic',e.target.result);
    const av=document.getElementById('obAvatar');
    if(av)av.innerHTML=`<img src="${e.target.result}"><input type="file" id="obPicInput" accept="image/*" style="display:none" onchange="handleObPic(event)">`;
  };
  reader.readAsDataURL(file);
}
function obNext(){
  if(obCurrentStep===1){
    const name=document.getElementById('obName')?.value.trim();
    if(!name){document.getElementById('obName')?.focus();return;}
    const p={name,grade:obSelectedGrade,track:obSelectedTrack};
    localStorage.setItem('profile',JSON.stringify(p));
    localStorage.setItem('flux_user_name',name.split(' ')[0]);
    _updateSidebarName(name);
  }
  if(obCurrentStep===2){
    schoolInfo.schoolName=document.getElementById('obSchool')?.value.trim()||'';
    schoolInfo.counselor=document.getElementById('obCounselor')?.value.trim()||'';
    schoolInfo.locker=document.getElementById('obLocker')?.value.trim()||'';
    schoolInfo.combo=document.getElementById('obCombo')?.value.trim()||'';
    save('flux_school',schoolInfo);
  }
  if(obCurrentStep===3){
    if(obExtractedClasses.length){classes=obExtractedClasses;save('flux_classes',classes);}
  }
  if(obCurrentStep===4){obFinish();return;}
  showObStep(obCurrentStep+1);
}
function obBack(){if(obCurrentStep>1)showObStep(obCurrentStep-1);}
function obFinish(){
  // Capture DNA + study goal from step 4 if set
  const dnaChips=document.querySelectorAll('.ob-chip[data-dna].active');
  if(dnaChips.length){studyDNA=Array.from(dnaChips).map(c=>c.dataset.dna);save('flux_dna',studyDNA);}
  const goalSlider=document.getElementById('obStudyGoal');
  if(goalSlider){settings.dailyGoalHrs=parseFloat(goalSlider.value)||2;save('flux_settings',settings);}
  save('flux_onboarded',true);
  const ob=document.getElementById('onboarding');if(ob)ob.classList.remove('visible');
  document.getElementById('app').classList.add('visible');
  spawnConfetti();
  renderProfile();renderSchool();renderSidebars();
  if(currentUser)syncToCloud();
}
function _updateSidebarName(name){
  const sn=document.getElementById('sidebarName');if(sn)sn.textContent=name;
  const mn=document.getElementById('mobName');if(mn)mn.textContent=name;
}
function handleScheduleImg(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    obScheduleImgData=e.target.result;
    const prev=document.getElementById('schedulePreview');
    const prevImg=document.getElementById('schedulePreviewImg');
    if(prev)prev.style.display='block';
    if(prevImg)prevImg.src=e.target.result;
    analyzeScheduleImg();
  };
  reader.readAsDataURL(file);
}
async function analyzeScheduleImg(){
  if(!obScheduleImgData)return;
  const analyzing=document.getElementById('obAnalyzing');
  const resultEl=document.getElementById('obExtractedClasses');
  if(analyzing)analyzing.style.display='flex';
  if(resultEl)resultEl.innerHTML='';
  try{
    const base64=obScheduleImgData.split(',')[1];
    const mime=obScheduleImgData.split(';')[0].split(':')[1];
    const res=await fetch(API.gemini,{
      method:'POST',headers:GEMINI_HEADERS,
      body:JSON.stringify({imageBase64:base64,mimeType:mime,
        prompt:'This is a student class schedule. Extract every class and return ONLY a JSON array: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods sequentially if not shown. Empty string for missing fields. ONLY the JSON array.'})
    });
    if(!res.ok)throw new Error('Gemini error '+res.status);
    const data=await res.json();
    let txt=(data.text||'[]').replace(/```json|```/g,'').trim();
    const match=txt.match(/\[[\s\S]*\]/);if(match)txt=match[0];
    const parsed=JSON.parse(txt);
    obExtractedClasses=parsed.map((c,i)=>({id:Date.now()+i,period:c.period||i+1,name:c.name||'Class '+(i+1),teacher:c.teacher||'',room:c.room||''}));
    if(resultEl){
      resultEl.style.display='block';
      resultEl.innerHTML='<div style="color:var(--green);font-weight:700;margin-bottom:8px;font-size:.82rem">✓ Found '+obExtractedClasses.length+' classes</div>'+
        obExtractedClasses.map(c=>`<div class="ob-class-row"><div class="ob-class-period">${c.period}</div><div style="flex:1"><div style="font-size:.85rem;font-weight:700">${esc(c.name)}</div><div style="font-size:.7rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${c.teacher}${c.room?' · Rm '+c.room:''}</div></div></div>`).join('');
    }
  }catch(e){
    if(resultEl){resultEl.style.display='block';resultEl.innerHTML='<div style="color:var(--red);font-size:.82rem">Could not read schedule. Add classes manually in the School tab.</div>';}
  }finally{
    if(analyzing)analyzing.style.display='none';
  }
}

// ══ AUTH ══
// getRedirectURL works for GitHub Pages (/Fluxplanner/ path) and any other host
function getRedirectURL(){
  // Use origin + pathname base for GitHub Pages subdirectory support
  const loc=window.location;
  // If on github.io/Fluxplanner, redirect back to that exact path
  if(loc.pathname.includes('/Fluxplanner')){
    return loc.origin+'/Fluxplanner/';
  }
  return loc.origin+'/';
}

async function signInWithGoogle(){
  const sb=getSB();
  if(!sb){
    alert('Supabase not loaded yet — please refresh the page.');
    return;
  }
  try{
    const redirectTo=getRedirectURL();
    const{error}=await sb.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo,
        scopes:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
        queryParams:{access_type:'offline',prompt:'consent'}
      }
    });
    if(error)throw error;
  }catch(e){
    console.error('OAuth error:',e);
    alert('Sign in failed: '+e.message+'\n\nMake sure '+getRedirectURL()+' is added to Supabase > Authentication > URL Configuration > Redirect URLs');
  }
}

async function signOut(){
  if(!confirm('Sign out?'))return;
  const sb=getSB();if(sb)await sb.auth.signOut();
  handleSignedOut();
}

// ── GUEST LOGIN ──
function skipLogin(){
  showGuestDisclaimer();
}

function showGuestDisclaimer(){
  const existing=document.getElementById('guestModal');if(existing)existing.remove();
  const modal=document.createElement('div');
  modal.id='guestModal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)';
  modal.innerHTML=`
    <div style="background:var(--card);border:1px solid var(--border2);border-radius:22px;padding:30px 24px;width:100%;max-width:380px;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,.5)">
      <div style="font-size:2.2rem;margin-bottom:14px">👤</div>
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:8px">Continuing as Guest</div>
      <div style="font-size:.84rem;color:var(--muted2);line-height:1.75;margin-bottom:22px">
        Your data will be saved <strong style="color:var(--gold)">on this device only</strong>.<br>
        It won't sync across devices and could be lost if you clear your browser storage.<br><br>
        <span style="font-size:.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace">You can sign in with Google anytime from Settings to back everything up.</span>
      </div>
      <button onclick="confirmGuestLogin()" style="width:100%;padding:13px;margin-bottom:10px;font-size:.92rem">Got it — Continue as Guest</button>
      <button onclick="document.getElementById('guestModal').remove()" class="btn-sec" style="width:100%;padding:11px;font-size:.85rem">← Back to Sign In</button>
    </div>`;
  document.body.appendChild(modal);
}

function confirmGuestLogin(){
  const modal=document.getElementById('guestModal');if(modal)modal.remove();
  save('flux_was_guest',true);
  document.getElementById('loginScreen').classList.remove('visible');
  const onboarded=load('flux_onboarded',false);
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  if(!onboarded&&!hasData){
    showOnboarding();
  }else{
    document.getElementById('app').classList.add('visible');
    renderSidebars();
  }
  setSyncStatus('offline');
}

async function initAuth(){
  const sb=getSB();
  if(!sb){
    // Supabase didn't load — go straight to login screen
    document.getElementById('loginScreen').classList.add('visible');
    return;
  }
  try{
    const{data:{session}}=await sb.auth.getSession();
    if(session?.user)await handleSignedIn(session.user,session);
    else showLoginOrApp();
    sb.auth.onAuthStateChange(async(event,s)=>{
      if(event==='SIGNED_IN'&&s?.user)await handleSignedIn(s.user,s);
      else if(event==='SIGNED_OUT')handleSignedOut();
    });
  }catch(e){
    console.error('Auth init error:',e);
    showLoginOrApp();
  }
}

function showLoginOrApp(){
  // Always show login for Google users who signed out
  // Returning guests who already onboarded can skip straight to app
  const onboarded=load('flux_onboarded',false);
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  const wasGuest=load('flux_was_guest',false);
  if(wasGuest&&(onboarded||hasData)){
    document.getElementById('loginScreen').classList.remove('visible');
    document.getElementById('app').classList.add('visible');
    setSyncStatus('offline');
    renderSidebars();
  }else{
    document.getElementById('loginScreen').classList.add('visible');
    initLoginFeaturePills();
  }
}

async function handleSignedIn(user,session){
  currentUser=user;
  save('flux_was_guest',false); // clear guest flag when signed in with Google
  if(session?.provider_token){
    gmailToken=session.provider_token;
    sessionStorage.setItem('flux_gmail_token',session.provider_token);
  }
  document.getElementById('loginScreen').classList.remove('visible');
  const name=user.user_metadata?.full_name||user.email?.split('@')[0]||'Student';
  const firstName=name.split(' ')[0];
  if(!load('profile',{}).name)localStorage.setItem('flux_user_name',firstName);
  _updateUserUI(user,name);
  setSyncStatus('syncing');
  // Pull cloud data first — it may tell us if user has been onboarded before
  await syncFromCloud();
  const onboarded=load('flux_onboarded',false);
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  const isFirstTime=!onboarded&&!hasData;
  const ob=document.getElementById('onboarding');
  if(isFirstTime){
    if(ob)ob.classList.add('visible');
  }else{
    if(ob)ob.classList.remove('visible');
    document.getElementById('app').classList.add('visible');
    renderSidebars();
  }
  setInterval(syncToCloud,5*60*1000);
}

function _updateUserUI(user,name){
  const firstName=(name||user.email?.split('@')[0]||'User').split(' ')[0];
  localStorage.setItem('flux_user_name',firstName);
  const sav=document.getElementById('sidebarAv');if(sav){if(user.user_metadata?.avatar_url)sav.innerHTML=`<img src="${user.user_metadata.avatar_url}" referrerpolicy="no-referrer">`;else sav.textContent=firstName.charAt(0).toUpperCase();}
  const sn=document.getElementById('sidebarName');if(sn)sn.textContent=name||firstName;
  const se=document.getElementById('sidebarEmail');if(se)se.textContent=user.email||'';
  const mav=document.getElementById('mobAv');if(mav){if(user.user_metadata?.avatar_url)mav.innerHTML=`<img src="${user.user_metadata.avatar_url}" referrerpolicy="no-referrer">`;else mav.textContent=firstName.charAt(0).toUpperCase();}
  const mn=document.getElementById('mobName');if(mn)mn.textContent=name||firstName;
  const me=document.getElementById('mobEmail');if(me)me.textContent=user.email||'';
  const asd=document.getElementById('accountSignedOut');if(asd)asd.style.display='none';
  const asi=document.getElementById('accountSignedIn');if(asi)asi.style.display='block';
  const emailEl=document.getElementById('accountEmail');if(emailEl)emailEl.textContent=user.email||'';
}

function handleSignedOut(){
  currentUser=null;gmailToken=null;
  sessionStorage.removeItem('flux_gmail_token');
  const asd=document.getElementById('accountSignedOut');if(asd)asd.style.display='block';
  const asi=document.getElementById('accountSignedIn');if(asi)asi.style.display='none';
  const sn=document.getElementById('sidebarName');if(sn)sn.textContent='Not signed in';
  const se=document.getElementById('sidebarEmail');if(se)se.textContent='';
  setSyncStatus('offline');
  document.getElementById('app').classList.remove('visible');
  document.getElementById('loginScreen').classList.add('visible');
}

// ══ FEATURE PILLS — injected into login screen ══
function initFeaturePills(){
  const wrap=document.getElementById('featPills');if(!wrap)return;
  const pills=[
    {label:'✦ Flux AI Tutor',c:'#6366f1'},
    {label:'📷 Gemini Vision Import',c:'#10d9a0'},
    {label:'📊 4-Decimal GPA',c:'#fbbf24'},
    {label:'⏱ Pomodoro Timer',c:'#a78bfa'},
    {label:'📅 A/B Day Calendar',c:'#3b82f6'},
    {label:'☁️ Cloud Sync',c:'#10d9a0'},
    {label:'🃏 AI Flashcards',c:'#e879f9'},
    {label:'🚨 Panic Mode',c:'#f43f5e'},
    {label:'📧 Gmail Tasks',c:'#fb923c'},
    {label:'📝 Smart Notes',c:'#6366f1'},
    {label:'🎯 Goal Tracker',c:'#fbbf24'},
    {label:'🔥 Habit Streaks',c:'#fb923c'},
  ];
  // Duplicate for seamless scroll
  const all=[...pills,...pills];
  wrap.innerHTML=all.map(p=>`<div class="feat-pill" style="color:${p.c};border-color:${p.c}33;background:${p.c}11">${p.label}</div>`).join('');
}

// ══ INIT ══
(function init(){
  loadTheme();
  loadSettingsUI();
  const sb=document.getElementById('sidebar');if(sb&&sidebarCollapsed)sb.classList.add('collapsed');
  document.getElementById('datePill').textContent=TODAY.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const ab=AB_MAP[todayStr()];
  if(ab){const p=document.getElementById('abPill');p.textContent=ab+' Day';p.style.display='block';p.style.background=ab==='A'?'rgba(99,102,241,.15)':'rgba(16,217,160,.15)';p.style.color=ab==='A'?'var(--accent)':'var(--green)';p.style.border='1px solid '+(ab==='A'?'rgba(99,102,241,.3)':'rgba(16,217,160,.3)');}
  const td=document.getElementById('taskDate');if(td)td.valueAsDate=TODAY;
  setEnergy(document.getElementById('energySlider')?.value||3);
  renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();
  renderProfile();renderGradeInputs();renderGradeOverview();renderWeightedRows();
  renderNotesList();renderHabitList();renderGoalsList();renderCollegeList();
  renderMoodHistory();renderAffirmation();renderAISugs();renderSchool();
  renderSubjectBudget();renderFocusHeatmap();
  updateTDisplay();renderTDots();updateTStats();
  checkAllPanic();setInterval(checkAllPanic,60000);
  initFeaturePills();
  renderSidebars();
  initSidebarResize();

  // ── FLOW: Splash (once per session) → Login → (1st time) Onboarding → App ──
  const afterSplash = () => initAuth();

  const shownSplash = sessionStorage.getItem('flux_splash_shown');
  if(!shownSplash){
    sessionStorage.setItem('flux_splash_shown','1');
    // Small delay so splash.js script is definitely parsed
    setTimeout(()=>{
      if(typeof window.runSplash==='function'){
        window.runSplash(afterSplash);
      }else{
        const s=document.getElementById('splash');if(s)s.style.display='none';
        afterSplash();
      }
    },30);
  }else{
    const s=document.getElementById('splash');if(s)s.style.display='none';
    afterSplash();
  }
})();

// ══ IMAGE IMPORT FEATURES ══

// Utility: file to base64 (returns just the data part, no prefix)
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>resolve(e.target.result.split(',')[1]);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

// Generic Gemini vision call via edge function
async function callGemini(imageBase64,mimeType,prompt){
  const res=await fetch(API.gemini,{
    method:'POST',headers:GEMINI_HEADERS,
    body:JSON.stringify({imageBase64,mimeType,prompt})
  });
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'Gemini error '+res.status);}
  const data=await res.json();
  return data.text||'';
}

// Import grades from photo
async function importGradesFromPhoto(event){
  const file=event.target.files[0];if(!file)return;
  const el=document.getElementById('gradesImportResult');
  el.style.display='block';
  el.innerHTML='<div style="color:var(--muted2);font-size:.82rem;font-family:JetBrains Mono,monospace">📷 Reading grades with Gemini AI...</div>';
  try{
    const base64=await fileToBase64(file);
    const txt=await callGemini(base64,file.type,
      'This is a student gradebook or report card. Extract every subject and its grade percentage or letter grade. Return ONLY a JSON object like {"Chemistry":92,"Math 3":"B+"}. Use the exact subject names shown. Return ONLY the JSON object, no markdown.');
    const clean=txt.replace(/```json|```/g,'').trim();
    const parsed=JSON.parse(clean);
    let imported=0;
    Object.entries(parsed).forEach(([k,v])=>{if(k&&v!==undefined){grades[k]=String(v);imported++;}});
    save('flux_grades',grades);
    renderGradeInputs();renderGradeOverview();updateGPADisplay();
    el.innerHTML=`<div style="color:var(--green);font-size:.82rem">✓ Imported ${imported} grades! Review and save below.</div>`;
    syncKey('grades',grades);
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);font-size:.82rem">Could not read grades: ${e.message}</div>`;
  }
}

// Import note/assignment guide content from photo
async function importNoteFromPhoto(event){
  const file=event.target.files[0];if(!file)return;
  const resEl=document.getElementById('aiNoteResult');
  resEl.style.display='block';
  resEl.innerHTML='<div style="color:var(--muted2);font-size:.82rem">📷 Reading image with Gemini AI...</div>';
  try{
    const base64=await fileToBase64(file);
    const txt=await callGemini(base64,file.type,
      'This is a student assignment guide, worksheet, or lesson material. Extract all the text and content. Format it clearly with headers and bullet points where appropriate. Preserve all important details including questions, instructions, and due dates.');
    const editor=document.getElementById('noteEditor');
    if(editor){
      const existing=editor.innerHTML;
      editor.innerHTML=existing+(existing?'<hr style="border-color:var(--border);margin:12px 0">':'')+'<p>'+fmtAI(txt)+'</p>';
    }
    resEl.innerHTML='<div style="color:var(--green);font-size:.82rem">✓ Content added to note. Save when ready.</div>';
  }catch(e){
    resEl.innerHTML=`<div style="color:var(--red);font-size:.82rem">Could not read image: ${e.message}</div>`;
  }
}

// Import schedule from photo (school tab)
async function importScheduleFromPhoto(event,resultElId){
  const file=event.target.files[0];if(!file)return;
  const resEl=document.getElementById(resultElId||'schoolImgResult');
  if(resEl){resEl.style.display='block';resEl.innerHTML='<div style="color:var(--muted2);font-size:.82rem;font-family:JetBrains Mono,monospace">📷 Reading schedule with Gemini AI...</div>';}
  try{
    const base64=await fileToBase64(file);
    const txt=await callGemini(base64,file.type,
      'This is a student class schedule. Extract every class/period. Return ONLY a JSON array: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods 1,2,3... if not shown. Use empty string for missing fields. ONLY return the JSON array, no markdown.');
    const clean=txt.replace(/```json|```/g,'').trim();
    const match=clean.match(/\[[\s\S]*\]/);
    const parsed=JSON.parse(match?match[0]:clean);
    classes=parsed.map((c,i)=>({id:Date.now()+i,period:c.period||i+1,name:c.name||'Class '+(i+1),teacher:c.teacher||'',room:c.room||''}));
    save('flux_classes',classes);
    renderSchool();
    if(resEl)resEl.innerHTML=`<div style="color:var(--green);font-size:.82rem">✓ Imported ${classes.length} classes!</div>`;
    syncKey('classes',classes);
  }catch(e){
    if(resEl)resEl.innerHTML=`<div style="color:var(--red);font-size:.82rem">Could not read schedule: ${e.message}</div>`;
  }
}

// ══ CANVAS SYNC ══

function saveCanvasConfig(){
  canvasToken=document.getElementById('canvasToken')?.value.trim()||'';
  canvasUrl=document.getElementById('canvasUrl')?.value.trim()||'';
  save('flux_canvas_token',canvasToken);
  save('flux_canvas_url',canvasUrl);
  const b=event?.target;if(b){b.textContent='✓ Saved';setTimeout(()=>b.textContent='Save',1500);}
  renderCanvasStatus();
}
function renderCanvasStatus(){
  const el=document.getElementById('canvasStatus');if(!el)return;
  const urlEl=document.getElementById('canvasUrl');if(urlEl)urlEl.value=canvasUrl||'';
  if(canvasToken&&canvasUrl){
    el.innerHTML=`<div class="sync-badge synced">✓ Canvas connected</div>`;
  }else{
    el.innerHTML=`<div class="sync-badge offline">○ Not connected — enter URL and token below</div>`;
  }
}
async function syncCanvas(){
  if(!canvasToken||!canvasUrl){alert('Enter your Canvas URL and token first.');return;}
  const btn=event?.target;if(btn){btn.textContent='Syncing...';btn.disabled=true;}
  try{
    const base=canvasUrl.replace(/\/+$/,'');
    const res=await fetch(`${API.canvas}?url=${encodeURIComponent(base+'/api/v1/courses?enrollment_state=active&per_page=20')}&token=${encodeURIComponent(canvasToken)}`,{headers:API_HEADERS});
    const courses=await res.json();
    if(!Array.isArray(courses))throw new Error('Invalid response from Canvas — check your URL and token');
    let added=0;
    for(const course of courses.slice(0,10)){
      const aRes=await fetch(`${API.canvas}?url=${encodeURIComponent(base+'/api/v1/courses/'+course.id+'/assignments?per_page=30&order_by=due_at')}&token=${encodeURIComponent(canvasToken)}`,{headers:API_HEADERS});
      const assignments=await aRes.json();
      if(!Array.isArray(assignments))continue;
      assignments.forEach(a=>{
        if(!a.due_at)return;
        const due=a.due_at.slice(0,10);
        const name=a.name||'Assignment';
        if(!tasks.find(t=>t.name===name&&t.date===due)){
          tasks.unshift({id:Date.now()+Math.random(),name,date:due,subject:'',priority:'med',type:'hw',done:false,rescheduled:0,createdAt:Date.now(),urgencyScore:0});
          added++;
        }
      });
    }
    save('tasks',tasks);renderStats();renderTasks();renderCountdown();
    if(btn){btn.textContent=`✓ Imported ${added} tasks`;setTimeout(()=>{btn.textContent='↓ Sync Assignments';btn.disabled=false;},2500);}
    syncKey('tasks',tasks);
  }catch(e){
    if(btn){btn.textContent='Sync failed';btn.disabled=false;}
    alert('Canvas sync error: '+e.message);
  }
}

// ══ GMAIL PANEL ══

async function loadGmail(){
  const el=document.getElementById('gmailList');if(!el)return;
  // Try to get token from current session if not already stored
  if(!gmailToken){
    const sb=getSB();
    if(sb){
      try{
        const{data:{session}}=await sb.auth.getSession();
        if(session?.provider_token){
          gmailToken=session.provider_token;
          sessionStorage.setItem('flux_gmail_token',gmailToken);
        }
      }catch(e){}
    }
  }
  if(!gmailToken){
    el.innerHTML=`<div class="card" style="text-align:center;padding:28px 20px">
      <div style="font-size:2rem;margin-bottom:12px">📧</div>
      <div style="font-size:.95rem;font-weight:700;margin-bottom:8px">Connect Gmail</div>
      <div style="font-size:.8rem;color:var(--muted2);margin-bottom:20px;line-height:1.6">Sign in with Google to view your school emails and add them as tasks.</div>
      <button onclick="signInWithGoogle()" style="width:100%;padding:12px;display:flex;align-items:center;justify-content:center;gap:10px">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Sign in with Google
      </button>
    </div>`;
    return;
  }
  el.innerHTML='<div style="color:var(--muted2);font-size:.82rem;padding:16px;font-family:JetBrains Mono,monospace">Loading emails...</div>';
  try{
    const res=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox',{
      headers:{'Authorization':`Bearer ${gmailToken}`}
    });
    if(res.status===401){
      // Token expired — clear and prompt re-login
      gmailToken=null;sessionStorage.removeItem('flux_gmail_token');
      el.innerHTML=`<div class="card" style="text-align:center;padding:24px"><div style="color:var(--red);font-size:.85rem;margin-bottom:14px">Gmail session expired.</div><button onclick="signInWithGoogle()" style="padding:10px 20px">Re-connect Gmail</button></div>`;
      return;
    }
    if(!res.ok)throw new Error('Gmail API error '+res.status);
    const data=await res.json();
    if(!data.messages?.length){el.innerHTML='<div class="empty">No emails found in inbox.</div>';return;}
    gmailEmails=await Promise.all(data.messages.map(async m=>{
      try{
        const detail=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,{
          headers:{'Authorization':`Bearer ${gmailToken}`}
        });
        const d=await detail.json();
        const headers=d.payload?.headers||[];
        const get=name=>headers.find(h=>h.name===name)?.value||'';
        return{id:m.id,subject:get('Subject'),from:get('From'),date:get('Date'),snippet:d.snippet||''};
      }catch(e){return{id:m.id,subject:'(error)',from:'',date:'',snippet:''};}
    }));
    renderGmailList();
  }catch(e){
    el.innerHTML=`<div style="color:var(--red);font-size:.82rem;padding:16px">${e.message}<br><br><button onclick="signInWithGoogle()" style="padding:8px 16px;font-size:.8rem;margin-top:8px">Re-connect Gmail</button></div>`;
  }
}

function renderGmailList(){
  const el=document.getElementById('gmailList');if(!el)return;
  if(!gmailEmails.length){el.innerHTML='<div class="empty">No emails found.</div>';return;}
  el.innerHTML=`<div style="font-size:.7rem;color:var(--muted);font-family:'JetBrains Mono',monospace;padding:4px 4px 10px">${gmailEmails.length} recent emails · tap + Task to add to planner</div>`
    +gmailEmails.map(e=>`
    <div class="gmail-item">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:.87rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.subject||'(no subject)')}</div>
          <div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.from)}</div>
          <div style="font-size:.79rem;color:var(--muted2);margin-top:5px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(e.snippet)}</div>
        </div>
        <button onclick="addEmailAsTask('${e.id}')" style="padding:6px 12px;font-size:.72rem;white-space:nowrap;background:rgba(var(--accent-rgb),.14);border:1px solid rgba(var(--accent-rgb),.3);color:var(--accent);flex-shrink:0;border-radius:10px;margin:0">+ Task</button>
      </div>
    </div>`).join('');
}

function addEmailAsTask(id){
  const email=gmailEmails.find(e=>e.id===id);if(!email)return;
  const task={
    id:Date.now(),name:email.subject||'Email task',
    date:'',subject:'',priority:'med',type:'hw',
    notes:`From: ${email.from}\n\n${email.snippet}`,
    done:false,rescheduled:0,createdAt:Date.now()
  };
  task.urgencyScore=calcUrgency(task);
  tasks.unshift(task);save('tasks',tasks);
  renderStats();renderTasks();
  syncKey('tasks',tasks);
  const btn=event?.target;
  if(btn){btn.textContent='✓ Added';btn.style.color='var(--green)';setTimeout(()=>{btn.textContent='+ Task';btn.style.color='var(--accent)';},2000);}
}

function renderGmail(){loadGmail();}
