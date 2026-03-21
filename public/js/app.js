/* ── FLUX PLANNER · app.js v2 ── */

// ══ STORAGE — must be first, everything below depends on it ══
const load=(k,def)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('Storage full',e);}};

// ══ DATA VERSION — bump this to force-wipe all local data on all devices ══
const DATA_VERSION=3;
(function checkDataVersion(){
  const stored=parseInt(localStorage.getItem('flux_data_version')||'0');
  if(stored<DATA_VERSION){
    const keep=['flux_data_version','flux_splash_shown'];
    Object.keys(localStorage).forEach(k=>{if(!keep.includes(k))localStorage.removeItem(k);});
    localStorage.setItem('flux_data_version',String(DATA_VERSION));
    console.log('✓ Flux data wiped for version',DATA_VERSION);
  }
})();

// ══ PWA — register service worker ══
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/Fluxplanner/service-worker.js')
      .then(r=>console.log('✓ SW registered',r.scope))
      .catch(e=>console.warn('SW failed',e));
  });
}

// ══ DYNAMIC FOCUS CARD ══
function renderDynamicFocus(){
  const el=document.getElementById('dynamicFocusCard');if(!el)return;
  const now=new Date();
  const todayDay=now.toLocaleDateString('en-US',{weekday:'short'});
  const nowMin=now.getHours()*60+now.getMinutes();

  // Find next class
  let nextClass=null,minDiff=Infinity;
  classes.forEach(c=>{
    if(!c.timeStart)return;
    const[h,m]=c.timeStart.split(':').map(Number);
    const classMin=h*60+m;
    const diff=classMin-nowMin;
    if(diff>0&&diff<minDiff){minDiff=diff;nextClass=c;}
  });

  // Find soonest due task
  const todayStr=now.toISOString().slice(0,10);
  const urgent=tasks.filter(t=>!t.done&&t.date===todayStr).sort((a,b)=>(b.priority==='high'?1:0)-(a.priority==='high'?1:0))[0];

  // Contextual task suggestion: task that fits in the gap before next class
  let gapSug=null;
  if(nextClass&&minDiff>0){
    gapSug=tasks.filter(t=>!t.done&&t.estTime&&t.estTime<=minDiff).sort((a,b)=>b.urgencyScore-a.urgencyScore)[0];
  }

  let html='';
  if(nextClass){
    const hrs=Math.floor(minDiff/60),mins=minDiff%60;
    const timeStr=hrs>0?`${hrs}h ${mins}m`:`${mins}m`;
    html+=`<div class="focus-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="font-size:1.4rem">📍</div>
        <div>
          <div class="focus-label">Next Class</div>
          <div style="font-size:.95rem;font-weight:700;margin-top:2px">${esc(nextClass.name)}${nextClass.room?' · Rm '+nextClass.room:''}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="focus-time">${timeStr}</div>
          <div class="focus-label">away</div>
        </div>
      </div>
      ${gapSug?`<div style="background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.15);border-radius:10px;padding:10px 14px;font-size:.8rem">
        <span style="color:var(--muted2)">💡 Gap task:</span> <strong>${esc(gapSug.name)}</strong>
        <span style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:.72rem;margin-left:6px">~${gapSug.estTime}min</span>
      </div>`:''}
    </div>`;
  } else if(urgent){
    html+=`<div class="focus-card">
      <div class="focus-label">Focus on now</div>
      <div style="font-size:1rem;font-weight:700;margin-top:6px">${esc(urgent.name)}</div>
      <div style="font-size:.75rem;color:var(--muted2);margin-top:4px">Due today${urgent.estTime?' · ~'+urgent.estTime+'min':''}</div>
    </div>`;
  }
  el.innerHTML=html;
}

// ══ TIME POVERTY DETECTOR ══
function checkTimePoverty(){
  const banner=document.getElementById('timePovertyBanner');if(!banner)return;
  const now=new Date();
  const todayStr=now.toISOString().slice(0,10);

  // Total est minutes of tasks due today
  const todayTasks=tasks.filter(t=>!t.done&&t.date===todayStr);
  const totalEstMin=todayTasks.reduce((s,t)=>s+(t.estTime||30),0);

  // Available minutes: now → 11PM minus class time
  const endOfDay=new Date();endOfDay.setHours(23,0,0,0);
  const availableMin=Math.max(0,(endOfDay-now)/60000);
  const classMin=classes.reduce((s,c)=>{
    if(!c.timeStart||!c.timeEnd)return s;
    const[sh,sm]=c.timeStart.split(':').map(Number);
    const[eh,em]=c.timeEnd.split(':').map(Number);
    return s+(eh*60+em-(sh*60+sm));
  },0);
  const freeMin=Math.max(0,availableMin-classMin);

  if(totalEstMin>freeMin&&freeMin>0&&todayTasks.length>0){
    banner.classList.add('on');
    const over=Math.round(totalEstMin-freeMin);
    banner.innerHTML=`<span style="font-size:1.2rem">⚠️</span>
      <div style="flex:1">
        <div style="font-size:.85rem;font-weight:700;color:var(--gold)">Time Poverty Alert</div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.7)">You have ${Math.round(totalEstMin)}min of tasks but only ~${Math.round(freeMin)}min free today. You're <strong>${over}min over</strong>.</div>
      </div>
      <button onclick="this.parentElement.classList.remove('on')" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1rem;padding:0;transform:none;box-shadow:none">✕</button>`;
  } else {
    banner.classList.remove('on');
  }
}

// ══ GRADE BUFFER ══
function renderGradeBuffer(){
  const el=document.getElementById('gradeBufferCard');if(!el)return;
  const gradeEntries=Object.entries(grades);
  if(!gradeEntries.length){el.innerHTML='';return;}

  const thresholds=[{grade:'A',min:90},{grade:'B',min:80},{grade:'C',min:70},{grade:'D',min:60}];
  const cards=gradeEntries.map(([subject,val])=>{
    const pct=parseFloat(val);if(isNaN(pct))return'';
    const currentThresh=thresholds.find(t=>pct>=t.min)||{grade:'F',min:0};
    const nextDown=thresholds[thresholds.indexOf(currentThresh)+1];
    const buffer=nextDown?Number((pct-nextDown.min).toFixed(4)):Number((pct-0).toFixed(4));
    const cls=buffer>10?'safe':buffer>5?'warning':'danger';
    const barW=Math.min(100,buffer/20*100);
    return`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:.85rem;font-weight:600">${esc(subject)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.8rem">
          <span style="color:var(--${cls==='safe'?'green':cls==='warning'?'gold':'red'})">${currentThresh.grade} (${pct.toFixed(4)}%)</span>
          ${nextDown?`<span style="color:var(--muted);font-size:.7rem"> · ${buffer.toFixed(4)}pts buffer</span>`:''}
        </div>
      </div>
      <div class="grade-buffer-bar"><div class="grade-buffer-fill ${cls}" style="width:${barW}%"></div></div>
    </div>`;
  }).join('');
  el.innerHTML=cards||'<div class="empty"><div class="empty-icon">📊</div><div class="empty-title">No grades yet</div><div class="empty-sub">Add grades in the Grades tab</div></div>';
}

// ══ BREAK IT DOWN (AI-powered task splitter) ══
async function breakItDown(taskId){
  const task=tasks.find(t=>t.id===taskId);if(!task)return;
  const btn=document.getElementById('breakdown-btn-'+taskId);
  if(btn){btn.textContent='Breaking down...';btn.disabled=true;btn.classList.add('btn-loading');}

  try{
    const res=await fetch(API.ai,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+((await getSB()?.auth?.getSession())?.data?.session?.access_token||'')},
      body:JSON.stringify({
        model:'llama-3.3-70b-versatile',
        messages:[
          {role:'system',content:'You are a productivity assistant. Return ONLY a JSON array of exactly 5 short, actionable sub-tasks. No explanation, no markdown, just the array: ["sub-task 1","sub-task 2","sub-task 3","sub-task 4","sub-task 5"]'},
          {role:'user',content:`Break down this task into 5 immediate actionable sub-tasks: "${task.name}"`}
        ],
        max_tokens:300,temperature:0.4
      })
    });
    const data=await res.json();
    const txt=(data.choices?.[0]?.message?.content||'').trim().replace(/```json|```/g,'');
    const start=txt.indexOf('['),end=txt.lastIndexOf(']');
    const subtasks=JSON.parse(txt.slice(start,end+1));
    if(!Array.isArray(subtasks)||!subtasks.length)throw new Error('Invalid response');
    task.subtasks=(subtasks||[]).map(s=>({text:s,done:false}));
    save('tasks',tasks);
    renderTasks();
    syncKey('tasks',tasks);
  }catch(e){
    if(btn){btn.textContent='Break it Down';btn.disabled=false;btn.classList.remove('btn-loading');}
    showToast('Could not break down task: '+e.message,'error');
  }
}

// ══ ENERGY-BASED SMART SORT ══
function smartSortTasks(taskList){
  const energy=parseInt(localStorage.getItem('flux_energy')||'3');
  return [...taskList].sort((a,b)=>{
    if(energy<=2){
      // Low energy: easy tasks first (difficulty 1-2), then by urgency
      const da=a.difficulty||3,db=b.difficulty||3;
      if(da<=2&&db>2)return -1;
      if(db<=2&&da>2)return 1;
    } else if(energy>=4){
      // High energy: projects and essays first, then by urgency
      const isProjA=['project','essay'].includes(a.type);
      const isProjB=['project','essay'].includes(b.type);
      if(isProjA&&!isProjB)return -1;
      if(isProjB&&!isProjA)return 1;
    }
    return (b.urgencyScore||0)-(a.urgencyScore||0);
  });
}

// ══ PRIVACY REVEAL (tap-to-reveal) ══
function toggleReveal(fieldId,btnId){
  const field=document.getElementById(fieldId);
  const btn=document.getElementById(btnId);
  if(!field||!btn)return;
  const isHidden=field.dataset.hidden==='true';
  field.dataset.hidden=isHidden?'false':'true';
  if(isHidden){
    field.textContent=field.dataset.value||'—';
    btn.textContent='🙈';
  } else {
    const len=(field.dataset.value||'').length||4;
    field.textContent='•'.repeat(len);
    btn.textContent='👁';
  }
}

function maskPrivateField(el,value){
  if(!el||!value)return;
  el.dataset.value=value;
  el.dataset.hidden='true';
  el.textContent='•'.repeat(Math.min(value.length,8));
}

// ══ TOAST NOTIFICATIONS ══
function showToast(msg,type='success'){
  const t=document.createElement('div');
  const colors={success:'var(--green)',error:'var(--red)',info:'var(--accent)',warning:'var(--gold)'};
  const textColors={success:'#080a0f',error:'#fff',info:'#fff',warning:'#080a0f'};
  t.style.cssText=`position:fixed;bottom:${window.innerWidth<768?'80':'20'}px;left:50%;transform:translateX(-50%);
    background:${colors[type]||colors.success};color:${textColors[type]||'#080a0f'};
    padding:10px 20px;border-radius:12px;font-size:.82rem;font-weight:700;z-index:9999;
    animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;
    box-shadow:0 4px 20px rgba(0,0,0,.4);`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .2s';setTimeout(()=>t.remove(),200);},2800);
}

// ══ STUDY DNA AI INTEGRATION ══
function getStudyDNAPrompt(){
  const dna=load('flux_dna',[]);if(!dna.length)return'';
  const parts=[];
  if(dna.includes('Visual'))parts.push('Use tables, diagrams, and visual formatting in your explanations. Structure information visually.');
  if(dna.includes('Practice'))parts.push('After every explanation, generate exactly 3 practice questions for the student to test themselves.');
  if(dna.includes('Audio'))parts.push('Write in a conversational, easy-to-read-aloud style.');
  if(dna.includes('Reading'))parts.push('Provide detailed written explanations with clear structure.');
  return parts.length?'\n\nLearning style preferences: '+parts.join(' '):'';
}
// ══ SUBJECTS — built dynamically from user's classes ══
// No hardcoded subjects. Colors auto-assigned.
const SUBJECT_COLORS=['#6366f1','#f43f5e','#10d9a0','#fbbf24','#3b82f6','#c084fc','#fb923c','#e879f9','#22d3ee','#4ade80','#f472b6','#a78bfa'];
function getSubjects(){
  const subjs={};
  // Always include built-in subjects as base
  Object.entries(SUBJECTS).forEach(([k,s])=>{subjs[k]={...s};});
  // Merge in user classes (override/add)
  classes.forEach((c,i)=>{
    if(!c.name)return;
    const cleanName=c.name.replace(/^(IB\s+MYP|IB\s+DP|MYP|IB|DP|AP|Honors|Honours)\s+/i,'').trim()||c.name;
    const key=(c.id?'CLS'+c.id:cleanName).toString().slice(0,8).toUpperCase().replace(/\s/g,'');
    subjs[key]={name:cleanName,short:cleanName.length>8?cleanName.slice(0,3).toUpperCase():cleanName,color:c.color||SUBJECT_COLORS[i%SUBJECT_COLORS.length]};
  });
  return subjs;
}
// SUBJECTS is a live getter — always reflects current classes
function SUBJECTS_GET(){return getSubjects();}
// Compat shim — returns current subjects object
const SUBJECTS=new Proxy({},{get:(_,k)=>getSubjects()[k],ownKeys:()=>Object.keys(getSubjects()),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
const noHomeworkDays=load('flux_no_hw_days',[]);
const AFFIRMATIONS=["You are capable of amazing things.","Every expert was once a beginner.","Progress, not perfection.","Hard work compounds. Keep going.","Your future self is grateful for today's effort.","Difficult roads lead to beautiful destinations.","You've got this, one step at a time.","Consistency beats intensity. Show up today.","Your potential is limitless.","Rest is part of the process too."];
const PANEL_TITLES={dashboard:'Dashboard',calendar:'Calendar',school:'School Info',grades:'Grades',notes:'Notes',timer:'Focus Timer',profile:'Profile',goals:'Goals',habits:'Habits',mood:'Mood',ai:'Flux AI',gmail:'Gmail',settings:'Settings'};

function buildABMap(){return load('flux_ab_map',{});}
const AB_MAP=buildABMap();
const TODAY=new Date();


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
const fmtTime=t=>{if(!t)return'';const[h,m]=t.split(':').map(Number);const ampm=h>=12?'PM':'AM';return`${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;};

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
  const fns={dashboard:()=>{renderStats();renderTasks();renderCountdown();renderSmartSug();renderDynamicFocus();checkTimePoverty();renderGradeBuffer();},calendar:()=>{renderCalendar();renderCalToday();renderCalUpcoming();const gcalStatusEl=document.getElementById('gcalStatus');if(gcalStatusEl&&!gcalStatusEl.innerHTML)syncGoogleCalendar();},school:()=>renderSchool(),grades:()=>{renderGradeInputs();renderGradeOverview();renderWeightedRows();calcWeighted();},notes:()=>renderNotesList(),habits:()=>{renderHabitList();renderHeatmap();},goals:()=>{renderGoalsList();renderCollegeList();if(typeof renderExtrasList==='function')renderExtrasList();},mood:()=>{renderMoodHistory();renderAffirmation();},timer:()=>{updateTDisplay();renderTDots();updateTStats();renderSubjectBudget();renderFocusHeatmap();},profile:()=>renderProfile(),ai:()=>{renderAISugs();initAIChats();},settings:()=>{renderNoHWList();renderTabCustomizer();renderAboutStats();},gmail:()=>loadGmail()};
  fns[id]?.();
}
function navMob(id){closeDrawer();nav(id);}

// ══ SIDEBAR ══
// ── Populate subject dropdowns dynamically from user's classes ──
function populateSubjectSelects(){
  const subjs=getSubjects();
  const opts='<option value="">No subject</option>'+Object.entries(subjs).map(([k,s])=>`<option value="${k}">${s.name}</option>`).join('');
  ['taskSubject','editSubject','noteSubjectTag','timerSubject','addEventSubject'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const cur=el.value;
    el.innerHTML=opts;
    if(cur)el.value=cur;
  });
}

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
function toggleSidebar(){
  sidebarCollapsed=!sidebarCollapsed;
  save('flux_sidebar_collapsed',sidebarCollapsed);
  const sb=document.getElementById('sidebar');
  if(sb)sb.classList.toggle('collapsed',sidebarCollapsed);
  // Update toggle button icon
  const btn=document.querySelector('.sidebar-toggle');
  if(btn)btn.textContent=sidebarCollapsed?'»':'☰';
}

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
// ── TOPBAR TASK COUNT PILL ──────────────────────────────────
function updateTopbarStats(){
  const pill=document.getElementById('topbarTaskPill');
  if(!pill)return;
  const now=new Date();now.setHours(0,0,0,0);
  const active=tasks.filter(t=>!t.done);
  const overdue=active.filter(t=>t.date&&new Date(t.date+'T00:00:00')<now);
  const today=active.filter(t=>t.date===todayStr());
  if(overdue.length){
    pill.style.display='block';
    pill.textContent=overdue.length+' overdue';
    pill.style.background='rgba(244,63,94,.15)';
    pill.style.border='1px solid rgba(244,63,94,.3)';
    pill.style.color='var(--red)';
  } else if(today.length){
    pill.style.display='block';
    pill.textContent=today.length+' due today';
    pill.style.background='rgba(251,191,36,.1)';
    pill.style.border='1px solid rgba(251,191,36,.25)';
    pill.style.color='var(--gold)';
  } else if(active.length){
    pill.style.display='block';
    pill.textContent=active.length+' tasks';
    pill.style.background='rgba(var(--accent-rgb),.1)';
    pill.style.border='1px solid rgba(var(--accent-rgb),.2)';
    pill.style.color='var(--accent)';
  } else {
    pill.style.display='block';
    pill.textContent='✓ All done';
    pill.style.background='rgba(16,217,160,.1)';
    pill.style.border='1px solid rgba(16,217,160,.25)';
    pill.style.color='var(--green)';
  }
}

// ── TOPBAR NEXT CLASS PILL ───────────────────────────────────
function updateNextClassPill(){
  const pill=document.getElementById('topbarNextClass');
  if(!pill||!classes||!classes.length)return;
  const ab=AB_MAP[todayStr()];
  if(!ab){pill.style.display='none';return;}
  const todayClasses=classes.filter(c=>{
    if(!c.days||c.days==='')return true;
    if(c.days.includes('Mon-Fri'))return true;
    if(c.days.includes(ab+' Day'))return true;
    return false;
  }).sort((a,b)=>(a.timeStart||'').localeCompare(b.timeStart||'')||a.period-b.period);
  if(!todayClasses.length){pill.style.display='none';return;}
  const now=new Date();
  const timeStr=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const next=todayClasses.find(c=>c.timeStart&&c.timeStart>timeStr)||todayClasses[0];
  if(!next){pill.style.display='none';return;}
  const timeLabel=next.timeStart?fmtTime(next.timeStart):'P'+next.period;
  pill.style.display='block';
  pill.textContent='Next: '+next.name+' · '+timeLabel;
}

// ── SHOW TOS MODAL ───────────────────────────────────────────
function showTOS(){
  const m=document.createElement('div');
  m.style.cssText='position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
  m.innerHTML=`<div style="background:var(--card);border:1px solid var(--border2);border-radius:20px;max-width:540px;width:100%;max-height:80vh;overflow-y:auto;padding:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:1rem;font-weight:800">Terms of Service</div>
      <button onclick="this.closest('[style]').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.2rem;padding:4px">✕</button>
    </div>
    <div style="font-size:.8rem;color:var(--muted2);line-height:1.9;font-family:'JetBrains Mono',monospace">
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">Last updated: March 2026</div>
      <p>By using Flux Planner you agree to these terms. Flux is provided free of charge as a student productivity tool.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">1. Use</div>
      <p>Flux is for personal, non-commercial educational use. You may not resell, redistribute, or misuse the platform.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">2. Your Data</div>
      <p>You own your data. We sync it to Supabase for your convenience. You can delete it anytime from Settings → Data.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">3. Google Integrations</div>
      <p>Gmail and Calendar access is read-only. We never send emails, create events, or modify your Google account.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">4. AI</div>
      <p>AI responses are generated by Groq/Llama and may not always be accurate. Do not rely on AI for critical academic decisions.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">5. Limitation of Liability</div>
      <p>Flux Planner is provided as-is. The developer (Azfer Mohammed) is not liable for any data loss or academic outcomes.</p>
      <div style="font-weight:700;color:var(--text);margin:12px 0 4px">6. Contact</div>
      <p>Questions? Email azfermohammed21@gmail.com</p>
    </div>
  </div>`;
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target===m)m.remove();};
}

// ── ABOUT STATS ──────────────────────────────────────────────
function renderAboutStats(){
  const el=document.getElementById('aboutStats');
  if(!el)return;
  const totalTasks=tasks.length;
  const doneTasks=tasks.filter(t=>t.done).length;
  const totalMins=sessionLog.reduce((s,l)=>s+l.mins,0);
  const noteCount=notes.length;
  const habitCount=habits.length;
  const gradeCount=Object.keys(grades).length;
  el.innerHTML=[
    ['📝',totalTasks,'Total Tasks'],
    ['✅',doneTasks,'Completed'],
    ['⏱',Math.round(totalMins/60)+'h','Focus Time'],
    ['📓',noteCount,'Notes'],
    ['🔥',habitCount,'Habits'],
    ['📊',gradeCount,'Subjects'],
  ].map(([icon,val,label])=>`
    <div style="padding:12px;background:var(--card2);border-radius:10px;border:1px solid var(--border);text-align:center">
      <div style="font-size:1.2rem;margin-bottom:4px">${icon}</div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--accent)">${val}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-family:'JetBrains Mono',monospace">${label}</div>
    </div>`).join('');
}

function renderStats(){const now=new Date();now.setHours(0,0,0,0);const total=tasks.length,done=tasks.filter(t=>t.done).length,over=tasks.filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')<now).length,high=tasks.filter(t=>!t.done&&t.priority==='high').length;document.getElementById('statsRow').innerHTML=`<div class="stat"><div class="stat-n" style="color:var(--accent)">${total}</div><div class="stat-l">Total</div></div><div class="stat"><div class="stat-n" style="color:var(--green)">${done}</div><div class="stat-l">Done</div></div><div class="stat"><div class="stat-n" style="color:var(--red)">${over}</div><div class="stat-l">Overdue</div></div><div class="stat"><div class="stat-n" style="color:var(--gold)">${high}</div><div class="stat-l">High Pri</div></div>`;
  if(typeof updateTopbarStats==='function')updateTopbarStats();
}
function renderTasks(){
  const now=new Date();now.setHours(0,0,0,0);
  let list=[...tasks];
  if(taskFilter==='active')list=list.filter(t=>!t.done);
  if(taskFilter==='done')list=list.filter(t=>t.done);
  if(taskFilter==='overdue')list=list.filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')<now);
  if(taskFilter==='today')list=list.filter(t=>t.date&&t.date===todayStr());
  if(taskFilter==='high')list=list.filter(t=>!t.done&&t.priority==='high');
  const energy=parseInt(localStorage.getItem('flux_energy')||'3');
  list.sort((a,b)=>{
    if(a.done!==b.done)return a.done?1:-1;
    if(energy<=2){const da=(a.difficulty||3),db=(b.difficulty||3);if(da!==db)return da-db;}
    else if(energy>=4){const heavy=['project','essay','lab'];const ha=heavy.includes(a.type||'')?0:1,hb=heavy.includes(b.type||'')?0:1;if(ha!==hb)return ha-hb;}
    if((b.urgencyScore||0)!==(a.urgencyScore||0))return(b.urgencyScore||0)-(a.urgencyScore||0);
    if(a.date&&b.date)return new Date(a.date)-new Date(b.date);
    return 0;
  });
  const el=document.getElementById('taskList');
  if(!list.length){
    const msgs={active:'No active tasks — you\'re on top of it! 🎉',done:'No completed tasks yet.',overdue:'No overdue tasks! Great work.',today:'Nothing due today.',high:'No high-priority tasks.',all:'Add your first task to get started.'};
    el.innerHTML=`<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">${msgs[taskFilter]||msgs.all}</div><div class="empty-sub">Use the + button to add a task</div></div>`;
    return;
  }
  const tm={hw:{l:'HW',c:'var(--muted)'},test:{l:'Test',c:'var(--red)'},quiz:{l:'Quiz',c:'var(--gold)'},project:{l:'Project',c:'var(--purple)'},essay:{l:'Essay',c:'var(--blue)'},lab:{l:'Lab',c:'var(--green)'},other:{l:'Other',c:'var(--muted)'}};
  el.innerHTML=list.map(t=>{
    const sub=SUBJECTS[t.subject];
    const isOver=t.date&&new Date(t.date+'T00:00:00')<now&&!t.done;
    const isNP=t.date&&isBreak(t.date);
    const ds=t.date?new Date(t.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    const ti=tm[t.type]||tm.other;
    const priClass=t.priority==='high'?'priority-high':t.priority==='med'?'priority-med':'priority-low';
    const procras=(t.rescheduled||0)>=3?`<div class="procras-flag">⚠ Rescheduled ${t.rescheduled}×</div>`:'';
    const estTag=t.estTime?`<span class="tag est-tag">⏱ ${t.estTime}m</span>`:'';
    const stPct=t.subtasks?.length?Math.round(t.subtasks.filter(s=>s.done).length/t.subtasks.length*100):-1;
    const stBar=stPct>=0?`<div class="task-prog"><div class="task-prog-fill" style="width:${stPct}%"></div></div>`:'';
    const panicBtn=t.panic?`<button class="btn-sm" style="color:var(--red);border-color:rgba(var(--red-rgb),.3);font-size:.65rem;margin-top:4px" onclick="breakItDown(${t.id})">⚡ Break it Down</button>`:'';
    return`<div class="task-item ${priClass} ${t.done?'task-done':''}" data-task-id="${t.id}" draggable="true">
<div class="drag-handle" title="Drag to reorder" style="color:var(--border2);cursor:grab;font-size:.75rem;padding:2px 4px;align-self:center;flex-shrink:0">⠿</div>
<div class="check ${t.done?'done':''}" onclick="toggleTask(${t.id})">${t.done?'✓':''}</div>
<div class="task-body">
<div class="task-text ${t.done?'done':''}">${esc(t.name)}</div>
<div class="task-tags">
${sub?`<span class="tag" style="background:${sub.color}22;color:${sub.color}">${sub.short}</span>`:''}
<span class="tag" style="background:rgba(255,255,255,.06);color:var(--muted2)">${ti.l}</span>
${estTag}${ds?`<span class="tag due-tag ${isOver?'over':''}">📅 ${ds}${isNP?' 📵':''}</span>`:''}
</div>
${panicBtn}${stBar}${procras}
</div>
<div style="display:flex;flex-direction:column;gap:3px">
<button class="btn-sm btn-del" onclick="deleteTask(${t.id})" style="padding:4px 8px">✕</button>
<button class="btn-sm" onclick="openEdit(${t.id})" style="padding:4px 8px">✎</button>
</div>
</div>`;
  }).join('');
}
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
function openAddForDate(){
  const dateStr=new Date(calYear,calMonth,calSelected).toISOString().slice(0,10);
  // Show inline add-task modal in calendar instead of navigating away
  showCalAddModal(dateStr);
}
function showCalAddModal(dateStr){
  const existing=document.getElementById('calAddModal');if(existing)existing.remove();
  const m=document.createElement('div');
  m.id='calAddModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:600;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)';
  m.innerHTML=`<div style="background:var(--card);border:1px solid var(--border2);border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:24px;animation:slideUp .2s ease">
    <div style="font-size:1rem;font-weight:700;margin-bottom:14px">+ Task for ${new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div>
    <input type="text" id="calModalName" placeholder="Task name..." style="width:100%;margin-bottom:10px" autofocus>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <select id="calModalSubject" style="margin:0"><option value="">No subject</option>${Object.entries(SUBJECTS).map(([k,s])=>`<option value="${k}">${s.name}</option>`).join('')}</select>
      <select id="calModalPriority" style="margin:0"><option value="high">High Priority</option><option value="med" selected>Medium</option><option value="low">Low</option></select>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('calAddModal').remove()" class="btn-sec" style="flex:1">Cancel</button>
      <button onclick="submitCalTask('${dateStr}')" style="flex:1">+ Add Task</button>
    </div>
  </div>`;
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('calModalName')?.focus(),100);
}
function submitCalTask(dateStr){
  const name=document.getElementById('calModalName')?.value.trim();
  if(!name)return;
  const task={id:Date.now(),name,date:dateStr,subject:document.getElementById('calModalSubject')?.value||'',priority:document.getElementById('calModalPriority')?.value||'med',type:'hw',estTime:0,difficulty:3,notes:'',subtasks:[],done:false,rescheduled:0,createdAt:Date.now()};
  task.urgencyScore=calcUrgency(task);
  tasks.unshift(task);save('tasks',tasks);
  document.getElementById('calAddModal')?.remove();
  renderCalendar();renderStats();renderCountdown();
  syncKey('tasks',tasks);
  showToast('✓ Task added');
}
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
  for(let d=1;d<=days;d++){const dt=new Date(calYear,calMonth,d),ds=dt.toISOString().slice(0,10);const isToday=dt.getTime()===now.getTime(),isNP=isBreak(ds),ab=AB_MAP[ds];const tlist=tMap[d]||[];const elist=evMap[d]||[];// Task bars with names
const taskBars=tlist.slice(0,3).map(t=>{const s=SUBJECTS[t.subject];const c=s?s.color:'var(--accent)';return`<div class="cal-task-bar" style="background:${c}22;border-left:2px solid ${c};opacity:${t.done?.5:1};text-decoration:${t.done?'line-through':'none'}">${esc(t.name)}</div>`;}).join('');
const eventBars=elist.slice(0,1).map(e=>`<div class="cal-task-bar" style="background:rgba(192,132,252,.15);border-left:2px solid var(--purple)">${esc(e.title||'Event')}</div>`).join('');
const dots=taskBars+eventBars;const abLabel=ab?`<div style="font-size:.45rem;font-family:'JetBrains Mono',monospace;color:${ab==='A'?'var(--accent)':'var(--green)'};line-height:1;margin-top:1px">${ab}</div>`:'';const overFlag=tlist.some(t=>!t.done&&new Date(t.date+'T00:00:00')<now)?'<div style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--red)"></div>':'';html+=`<div class="cal-day ${isToday?'today ':''}${d===calSelected?'selected ':''}${isNP?'no-hw':''}" onclick="selectDay(${d})" style="position:relative">${overFlag}<div class="cal-dn">${d}</div>${abLabel}<div class="cal-dots">${dots}</div></div>`;}
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
function addClass(){
  const period=document.getElementById('classPeriod').value;
  const name=document.getElementById('className').value.trim();
  const teacher=document.getElementById('classTeacher').value.trim();
  const room=document.getElementById('classRoom').value.trim();
  const days=document.getElementById('classDays').value;
  const timeStart=document.getElementById('classTimeStart').value;
  const timeEnd=document.getElementById('classTimeEnd').value;
  const color=document.getElementById('classColor')?.value||'';
  if(!name)return;
  const COLORS=['#3b82f6','#f43f5e','#10d9a0','#fbbf24','#a78bfa','#fb923c','#e879f9','#22d3ee'];
  classes.push({id:Date.now(),period:parseInt(period)||classes.length+1,name,teacher,room,days,timeStart,timeEnd,color:color||COLORS[classes.length%COLORS.length]});
  classes.sort((a,b)=>a.period-b.period);
  save('flux_classes',classes);
  ['classPeriod','className','classTeacher','classRoom'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cd=document.getElementById('classDays');if(cd)cd.value='';
  const cs=document.getElementById('classTimeStart');if(cs)cs.value='';
  const ce=document.getElementById('classTimeEnd');if(ce)ce.value='';
  renderSchool();populateSubjectSelects();syncKey('classes',classes);
}
function deleteClass(id){classes=classes.filter(c=>c.id!==id);save('flux_classes',classes);renderSchool();populateSubjectSelects();}
function addTeacherNote(){const teacher=document.getElementById('tNoteTeacher').value.trim(),note=document.getElementById('tNoteText').value.trim();if(!teacher||!note)return;teacherNotes.push({id:Date.now(),teacher,note});save('flux_teacher_notes',teacherNotes);document.getElementById('tNoteTeacher').value='';document.getElementById('tNoteText').value='';renderSchool();}
function deleteTeacherNote(id){teacherNotes=teacherNotes.filter(n=>n.id!==id);save('flux_teacher_notes',teacherNotes);renderSchool();}
function renderSchool(){
  const comboEl=document.getElementById('displayCombo');
  const sidEl=document.getElementById('displayStudentID');
  if(comboEl){comboEl.dataset.value=schoolInfo.combo||'';comboEl.dataset.hidden='true';comboEl.textContent=schoolInfo.combo?'•'.repeat(Math.min(schoolInfo.combo.length,10)):'—';}
  if(sidEl){sidEl.dataset.value=schoolInfo.studentID||'';sidEl.dataset.hidden='true';sidEl.textContent=schoolInfo.studentID?'•'.repeat(Math.min(schoolInfo.studentID.length,10)):'—';}
  document.getElementById('displayLocker').textContent=schoolInfo.locker||'—';
  document.getElementById('displayCounselor').textContent=schoolInfo.counselor||'—';
  document.getElementById('inputLocker').value=schoolInfo.locker||'';
  document.getElementById('inputCombo').value=schoolInfo.combo||'';
  document.getElementById('inputCounselor').value=schoolInfo.counselor||'';
  document.getElementById('inputStudentID').value=schoolInfo.studentID||'';
  const cl=document.getElementById('classesList');
  if(!cl)return;
  if(!classes.length){cl.innerHTML='<div class="empty"><div class="empty-icon">📚</div><div class="empty-title">No classes yet</div><div class="empty-sub">Add classes below or import from a photo</div></div>';}
  else{
    const COLORS=['#3b82f6','#f43f5e','#10d9a0','#fbbf24','#a78bfa','#fb923c','#e879f9','#22d3ee'];
    const colorMap={};
    classes.forEach((c,i)=>{colorMap[c.id]=c.color||COLORS[i%COLORS.length];});
    // Check if any class uses A Day / B Day scheduling
    const hasAB=classes.some(c=>c.days&&(c.days==='A Day'||c.days==='B Day'));
    if(hasAB){
      const aClasses=classes.filter(c=>!c.days||c.days===''||c.days==='A Day'||c.days==='Mon-Fri'||c.days==='Mon/Wed/Fri'||c.days==='Tue/Thu'||(!c.days.includes('B Day')));
      const bClasses=classes.filter(c=>c.days&&c.days==='B Day');
      const renderClassRow=(c,col)=>{
        const timeStr=c.timeStart?`${fmtTime(c.timeStart)}${c.timeEnd?' – '+fmtTime(c.timeEnd):''}` :'';
        const meta=[c.teacher,timeStr,c.room].filter(Boolean).join(' · ');
        return`<div class="class-row" style="border-left:3px solid ${col}"><div class="class-period" style="background:${col}22;color:${col}">${c.period}</div><div style="flex:1"><div style="font-size:.88rem;font-weight:700">${esc(c.name)}</div>${meta?`<div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${meta}</div>`:''}</div><button onclick="editClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px" title="Edit">✎</button><button onclick="deleteClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`;
      };
      cl.innerHTML=`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:2px;color:var(--accent);font-family:'JetBrains Mono',monospace;padding:0 0 8px;border-bottom:1px solid rgba(var(--accent-rgb),.2);margin-bottom:10px;font-weight:700">A Day · ${aClasses.length} classes</div>
            ${aClasses.map(c=>renderClassRow(c,colorMap[c.id])).join('')}
          </div>
          <div>
            <div style="font-size:.62rem;text-transform:uppercase;letter-spacing:2px;color:var(--green);font-family:'JetBrains Mono',monospace;padding:0 0 8px;border-bottom:1px solid rgba(16,217,160,.2);margin-bottom:10px;font-weight:700">B Day · ${bClasses.length} classes</div>
            ${bClasses.map(c=>renderClassRow(c,colorMap[c.id])).join('')}
          </div>
        </div>`;
    } else {
      cl.innerHTML=classes.map((c,i)=>{
        const col=colorMap[c.id];
        const timeStr=c.timeStart?`${fmtTime(c.timeStart)}${c.timeEnd?' – '+fmtTime(c.timeEnd):''}` :'';
        const meta=[c.teacher,c.days,timeStr,c.room].filter(Boolean).join(' · ');
        return`<div class="class-row" style="border-left:3px solid ${col}"><div class="class-period" style="background:${col}22;color:${col}">${c.period}</div><div style="flex:1"><div style="font-size:.88rem;font-weight:700">${esc(c.name)}</div>${meta?`<div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${meta}</div>`:''}</div><button onclick="editClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px" title="Edit">✎</button><button onclick="deleteClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`;
      }).join('');
    }
  }
  const tn=document.getElementById('teacherNotesList');
  if(tn){
    if(!teacherNotes.length){tn.innerHTML='<div style="color:var(--muted);font-size:.82rem;margin-bottom:8px">No notes yet.</div>';}
    else{tn.innerHTML=teacherNotes.map(n=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><div style="font-size:.82rem;font-weight:700">${esc(n.teacher)}</div><div style="font-size:.75rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${esc(n.note)}</div></div><button onclick="deleteTeacherNote(${n.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`).join('');}
  }
}

// Edit class inline
function editClass(id){
  const c=classes.find(x=>x.id===id);
  if(!c)return;
  const modal=document.getElementById('editClassModal');
  if(!modal){
    // Create modal if it doesn't exist
    const m=document.createElement('div');
    m.id='editClassModal';
    m.className='modal-overlay';
    m.onclick=function(e){if(e.target===this)this.style.display='none';};
    m.innerHTML=`<div class="modal-card">
      <div class="modal-title">Edit Class</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="mrow"><label>Period</label><input type="number" id="ecPeriod" min="1" max="12"></div>
        <div class="mrow"><label>Color</label><input type="color" id="ecColor" style="width:100%;height:40px;margin:0;border-radius:8px;cursor:pointer;border:1px solid var(--border2)"></div>
        <div class="mrow" style="grid-column:span 2"><label>Class Name</label><input type="text" id="ecName"></div>
        <div class="mrow"><label>Teacher</label><input type="text" id="ecTeacher"></div>
        <div class="mrow"><label>Room</label><input type="text" id="ecRoom"></div>
        <div class="mrow"><label>Days</label><select id="ecDays">
          <option value="">Any day</option>
          <option value="Mon-Fri">Mon–Fri</option>
          <option value="A Day">A Day</option>
          <option value="B Day">B Day</option>
          <option value="Mon/Wed/Fri">Mon/Wed/Fri</option>
          <option value="Tue/Thu">Tue/Thu</option>
          <option value="Mon">Monday</option>
          <option value="Tue">Tuesday</option>
          <option value="Wed">Wednesday</option>
          <option value="Thu">Thursday</option>
          <option value="Fri">Friday</option>
        </select></div>
        <div class="mrow"><label>Time</label><div style="display:flex;gap:4px;align-items:center"><input type="time" id="ecStart" style="flex:1;margin:0"><span style="color:var(--muted)">–</span><input type="time" id="ecEnd" style="flex:1;margin:0"></div></div>
      </div>
      <div class="mactions"><button onclick="document.getElementById('editClassModal').style.display='none'" class="btn-sec">Cancel</button><button onclick="saveEditClass()">Save</button></div>
    </div>`;
    document.body.appendChild(m);
  }
  document.getElementById('editClassModal').dataset.classId=id;
  document.getElementById('ecPeriod').value=c.period||'';
  document.getElementById('ecName').value=c.name||'';
  document.getElementById('ecTeacher').value=c.teacher||'';
  document.getElementById('ecRoom').value=c.room||'';
  document.getElementById('ecDays').value=c.days||'';
  document.getElementById('ecStart').value=c.timeStart||'';
  document.getElementById('ecEnd').value=c.timeEnd||'';
  document.getElementById('ecColor').value=c.color||'#3b82f6';
  document.getElementById('editClassModal').style.display='flex';
}
function saveEditClass(){
  const id=parseInt(document.getElementById('editClassModal').dataset.classId);
  const c=classes.find(x=>x.id===id);
  if(!c)return;
  c.period=parseInt(document.getElementById('ecPeriod').value)||c.period;
  c.name=document.getElementById('ecName').value.trim()||c.name;
  c.teacher=document.getElementById('ecTeacher').value.trim();
  c.room=document.getElementById('ecRoom').value.trim();
  c.days=document.getElementById('ecDays').value;
  c.timeStart=document.getElementById('ecStart').value;
  c.timeEnd=document.getElementById('ecEnd').value;
  c.color=document.getElementById('ecColor').value;
  classes.sort((a,b)=>a.period-b.period);
  save('flux_classes',classes);
  document.getElementById('editClassModal').style.display='none';
  renderSchool();populateSubjectSelects();syncKey('classes',classes);
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

// ══ EXTRACURRICULARS, AWARDS & ACHIEVEMENTS ══
let extras = load('flux_extras', []);
function addExtra(){
  const name = document.getElementById('extraName')?.value.trim();
  const type = document.getElementById('extraType')?.value || 'activity';
  const year = document.getElementById('extraYear')?.value.trim();
  if(!name) return;
  extras.push({id: Date.now(), name, type, year});
  save('flux_extras', extras);
  const ni = document.getElementById('extraName'); if(ni) ni.value = '';
  const yi = document.getElementById('extraYear'); if(yi) yi.value = '';
  renderExtrasList();
}
function removeExtra(id){
  extras = extras.filter(e => e.id !== id);
  save('flux_extras', extras);
  renderExtrasList();
}
function renderExtrasList(){
  const el = document.getElementById('extrasList'); if(!el) return;
  if(!extras.length){ el.innerHTML = '<div style="color:var(--muted);font-size:.82rem">No activities added yet.</div>'; return; }
  const tc = {activity:'var(--accent)',award:'var(--gold)',achievement:'var(--green)',leadership:'var(--purple)',sport:'var(--red)',art:'#e879f9',volunteer:'#10d9a0'};
  el.innerHTML = extras.map(e => {
    const c = tc[e.type] || 'var(--accent)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:600">${esc(e.name)}</div>
        <div style="display:flex;gap:6px;margin-top:2px;align-items:center">
          <span style="font-size:.62rem;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:.5px;background:${c}18;padding:2px 7px;border-radius:10px;border:1px solid ${c}33">${e.type}</span>
          ${e.year ? `<span style="font-size:.62rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${esc(e.year)}</span>` : ''}
        </div>
      </div>
      <button onclick="removeExtra(${e.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button>
    </div>`;
  }).join('');
}

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
function renderSubjectBudget(){
  const el=document.getElementById('subjectBudget');if(!el)return;
  const subjs=getSubjects();
  const entries=Object.entries(subjs);
  if(!entries.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem">Add classes in School Info to see subject budgets.</div>';return;}
  el.innerHTML=entries.map(([k,s])=>{
    const done=parseFloat((subjectBudgets[k]||0).toFixed(1));
    const target=2; // default 2h/week per subject
    const pct=Math.min(Math.round(done/target*100),100);
    const c=pct>=100?'var(--green)':pct>=60?'var(--accent)':'var(--gold)';
    return`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${s.color}"></div><span style="font-size:.8rem;font-weight:600">${s.short}</span></div><span style="font-size:.72rem;font-family:'JetBrains Mono',monospace;color:${c}">${done} / ${target}h</span></div><div class="budget-bar"><div class="budget-fill" style="width:${pct}%;background:${s.color}"></div></div></div>`;
  }).join('');
}
function renderFocusHeatmap(){const el=document.getElementById('focusHeatmap');if(!el)return;const weekStart=new Date(TODAY);weekStart.setDate(TODAY.getDate()-TODAY.getDay()+1);const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];el.innerHTML=days.map((day,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const ds=d.toISOString().slice(0,10);const mins=sessionLog.filter(s=>s.date===ds).reduce((sum,s)=>sum+s.mins,0);const intensity=Math.min(mins/120,1);const isToday=ds===todayStr();return`<div style="flex:1;text-align:center"><div style="height:40px;border-radius:8px;background:rgba(var(--accent-rgb),${intensity.toFixed(2)});border:1px solid ${isToday?'var(--accent)':'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:.65rem;font-family:'JetBrains Mono',monospace;color:var(--text);font-weight:700">${mins>0?mins+'m':''}</div><div style="font-size:.58rem;color:var(--muted);margin-top:3px;font-family:'JetBrains Mono',monospace">${day}</div></div>`;}).join('');}
function playAmbient(type,btn){stopAmbient();document.querySelectorAll('#timer .tmode-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');try{ambientCtx=new(window.AudioContext||window.webkitAudioContext)();const buf=ambientCtx.createBuffer(1,ambientCtx.sampleRate*2,ambientCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(type==='white'?0.15:0.08);const src=ambientCtx.createBufferSource();src.buffer=buf;src.loop=true;const g=ambientCtx.createGain();g.gain.value=0.4;if(type==='rain'){const f=ambientCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=1200;src.connect(f);f.connect(g);}else src.connect(g);g.connect(ambientCtx.destination);src.start();}catch(e){}}
function stopAmbient(){if(ambientCtx){try{ambientCtx.close();}catch(e){}ambientCtx=null;}document.querySelectorAll('#timer .card .tmode-btn').forEach(b=>b.classList.remove('active'));}

// ══ PROFILE ══
function saveProfile(){
  const p={
    name:document.getElementById('name').value.trim(),
    grade:document.getElementById('grade').value,
    program:document.getElementById('program').value,
    school:document.getElementById('profileSchool').value.trim(),
  };
  localStorage.setItem('profile',JSON.stringify(p));
  localStorage.setItem('flux_user_name',p.name);
  checkProgramUpgrade(p);
  renderProfile();
  syncKey('profile',p);
  const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Profile',1500);}
}

// Auto-upgrade MYP → DP when grade reaches 11
function checkProgramUpgrade(p){
  if(!p)return;
  const grade=parseInt(p.grade)||0;
  const prog=p.program||'';
  if(grade>=11&&prog==='IB MYP'){
    p.program='IB DP';
    localStorage.setItem('profile',JSON.stringify(p));
    // Show upgrade notification
    const notif=document.createElement('div');
    notif.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff;padding:14px 24px;border-radius:14px;font-size:.88rem;font-weight:700;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.4);animation:floatIn .3s ease';
    notif.innerHTML='🎓 Welcome to IB DP! Your program has been updated.';
    document.body.appendChild(notif);
    setTimeout(()=>notif.remove(),4000);
    save('flux_onboarded',true);
  }
}

function renderProfile(){
  const p=load('profile',{});
  const name=p.name||localStorage.getItem('flux_user_name')||'Student';
  const grade=p.grade||'';
  const program=p.program||'';
  const school=p.school||'';

  // Auto-check upgrade on render
  if(p.grade)checkProgramUpgrade(p);

  const subline=[grade?`Grade ${grade}`:'',program,school].filter(Boolean).join(' · ');
  const profileNameEl=document.getElementById('profileName');if(profileNameEl)profileNameEl.textContent=name;
  const profileSubEl=document.getElementById('profileSubline');if(profileSubEl)profileSubEl.textContent=subline||'Set up your profile';

  if(p.name){
    const nameEl=document.getElementById('name');if(nameEl)nameEl.value=p.name;
    const gradeEl=document.getElementById('grade');if(gradeEl)gradeEl.value=p.grade||'';
    const progEl=document.getElementById('program');if(progEl)progEl.value=p.program||'';
    const schoolEl=document.getElementById('profileSchool');if(schoolEl)schoolEl.value=p.school||'';
  }

  const pic=localStorage.getItem('flux_profile_pic');
  const av=document.getElementById('pAvatar');
  if(av)av.innerHTML=(pic?`<img src="${pic}">`:name.charAt(0).toUpperCase())+`<input type="file" id="picUpload" accept="image/*" style="display:none" onchange="handlePicUpload(event)">`;

  const gpa=calcGPA(grades);
  const done=tasks.filter(t=>t.done).length;
  const badges=[];
  if(gpa!==null&&gpa>=3.7)badges.push({t:'🏆 Honor Roll',c:'badge-gold'});
  if(done>=20)badges.push({t:'✓ Task Master',c:'badge-green'});
  if(tStreak>=7)badges.push({t:'🔥 Study Streak',c:'badge-red'});
  if(program==='IB DP')badges.push({t:'📚 IB DP',c:'badge-blue'});
  if(program==='IB MYP')badges.push({t:'📖 IB MYP',c:'badge-purple'});
  if(notes.length>=10)badges.push({t:'📝 Note Taker',c:'badge-purple'});
  const badgeEl=document.getElementById('profileBadges');
  if(badgeEl)badgeEl.innerHTML=badges.length?badges.map(b=>`<span class="badge ${b.c}">${b.t}</span>`).join(''):'<span style="font-size:.75rem;color:var(--muted)">Complete tasks to earn badges!</span>';

  const ps=document.getElementById('profileStats');
  if(ps)ps.innerHTML=[[gpa!==null?precise(gpa):'—','GPA (4dp)','var(--accent)'],[done,'Done','var(--green)'],[tasks.filter(t=>!t.done).length,'Active','var(--gold)'],[notes.length,'Notes','var(--purple)']].map(([n,l,c])=>`<div style="background:var(--card2);border-radius:10px;padding:12px"><div style="font-size:1.4rem;font-weight:800;color:${c}">${n}</div><div style="font-size:.65rem;color:var(--muted);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-top:2px">${l}</div></div>`).join('');

  // Program tracker
  renderProgramTracker(p);

  // Confidence sliders — now use dynamic subjects from user's classes
  const confEl=document.getElementById('confidenceSliders');
  const subjs=getSubjects();
  if(confEl){
    const subjEntries=Object.entries(subjs);
    if(!subjEntries.length){confEl.innerHTML='<div style="color:var(--muted);font-size:.82rem">Add your classes in School Info to see confidence sliders.</div>';return;}
    confEl.innerHTML=subjEntries.map(([k,s])=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${s.color}"></div><span style="font-size:.82rem;font-weight:600">${s.short}</span></div><span style="font-size:.75rem;font-family:'JetBrains Mono',monospace;color:var(--accent);font-weight:700" id="cv-${k}">${confidences[k]||5}/10</span></div><input type="range" min="1" max="10" value="${confidences[k]||5}" oninput="document.getElementById('cv-${k}').textContent=this.value+'/10';confidences['${k}']=parseInt(this.value)" style="width:100%"></div>`).join('');
  }

  studyDNA.forEach(d=>{const btn=document.getElementById('dna-'+d);if(btn)btn.classList.add('active');});
  renderCanvasStatus();
}

function renderProgramTracker(p){
  const el=document.getElementById('programTracker');if(!el)return;
  const grade=parseInt(p?.grade)||0;
  const program=p?.program||'';
  const isIB=program.includes('IB');
  if(!isIB){el.style.display='none';return;}
  el.style.display='block';
  const isDP=program==='IB DP';
  const isMYP=program==='IB MYP';
  // MYP: grades 6-10 | DP: grades 11-12
  const dpItems=[
    {key:'tok',label:'Theory of Knowledge',desc:'TOK Essay + Exhibition',done:load('flux_pt_tok',false)},
    {key:'ee',label:'Extended Essay',desc:'4000-word independent research',done:load('flux_pt_ee',false)},
    {key:'cas',label:'CAS',desc:'Creativity, Activity, Service',done:load('flux_pt_cas',false)},
  ];
  const mypItems=[
    {key:'pp',label:'Personal Project',desc:'Self-directed project (Grade 10)',done:load('flux_pt_pp',false)},
    {key:'comm',label:'Community Project',desc:'Community service (Grade 9)',done:load('flux_pt_comm',false)},
  ];
  const items=isDP?dpItems:mypItems;
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:700">${program} Progress Tracker</div>
        <div style="font-size:.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-top:2px">Grade ${grade||'?'} · ${isDP?'Diploma Programme':'Middle Years Programme'}</div>
      </div>
      ${isMYP&&grade>=10?`<div style="font-size:.72rem;padding:4px 10px;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.25);border-radius:10px;color:var(--accent)">→ DP eligible at Grade 11</div>`:''}
    </div>
    ${items.map(item=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <button onclick="togglePT('${item.key}')" style="width:22px;height:22px;border-radius:7px;padding:0;flex-shrink:0;background:${item.done?'var(--green)':'transparent'};border:2px solid ${item.done?'var(--green)':'var(--border2)'};color:#080a0f;font-size:11px">${item.done?'✓':''}</button>
        <div style="flex:1"><div style="font-size:.87rem;font-weight:600;${item.done?'text-decoration:line-through;opacity:.6':''}">${item.label}</div><div style="font-size:.7rem;color:var(--muted)">${item.desc}</div></div>
      </div>`).join('')}`;
}
function togglePT(key){
  const current=load('flux_pt_'+key,false);
  save('flux_pt_'+key,!current);
  renderProfile();
}
function handlePicUpload(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{localStorage.setItem('flux_profile_pic',ev.target.result);const av=document.getElementById('pAvatar');if(av)av.innerHTML=`<img src="${ev.target.result}"><input type="file" id="picUpload" accept="image/*" style="display:none" onchange="handlePicUpload(event)">`;};r.readAsDataURL(file);}
function setDNA(type){const idx=studyDNA.indexOf(type);if(idx>=0)studyDNA.splice(idx,1);else studyDNA.push(type);save('flux_dna',studyDNA);document.querySelectorAll('[id^=dna-]').forEach(b=>b.classList.remove('active'));studyDNA.forEach(d=>{const btn=document.getElementById('dna-'+d);if(btn)btn.classList.add('active');});const tips={visual:'Use diagrams, charts, color-coded notes.',audio:'Read aloud, record yourself, use podcasts.',reading:'Textbooks, detailed notes, rewrite summaries.',practice:'Do problems, flashcards, practice tests.'};const el=document.getElementById('studyDNAResult');if(el)el.textContent=studyDNA.map(d=>tips[d]).join(' ');}
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

function applyThemeByName(name){
  document.body.classList.remove('crimson','focus','sepia','cloud','aurora','ember','forest','rose','deep-ocean','candy');
  if(name&&name!=='dark'&&name!=='midnight')document.body.classList.add(name);
}
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
  // Update all logo/title gradients to match accent
  const logoGrad=`linear-gradient(135deg,${hex},${hex}bb)`;
  document.querySelectorAll('.sidebar-logo,.mob-drawer-logo,.login-logo,.topbar-left').forEach(el=>{
    if(el){el.style.background=logoGrad;el.style.webkitBackgroundClip='text';el.style.webkitTextFillColor='transparent';el.style.backgroundClip='text';}
  });
  // Update task pill border color
  const tp=document.getElementById('topbarTaskPill');
  if(tp)tp.style.borderColor=`rgba(${rgb},.3)`;
  save('flux_accent',hex);
  save('flux_accent_rgb',rgb);
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
function renderNoHWList(){
  const el=document.getElementById('noHWList');if(!el)return;
  const days=load('flux_no_hw_days',[]);
  if(!days.length){el.innerHTML='<div style="color:var(--muted);font-size:.78rem">No days added yet.</div>';return;}
  const sorted=[...days].sort();
  el.innerHTML=sorted.map(d=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0"><span>📵 ${new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><button onclick="removeNoHWDay('${d}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:2px 6px">✕</button></div>`).join('');
}
function addNoHWDay(){
  const inp=document.getElementById('noHWInput');if(!inp||!inp.value)return;
  const days=load('flux_no_hw_days',[]);
  if(!days.includes(inp.value))days.push(inp.value);
  save('flux_no_hw_days',days);inp.value='';renderNoHWList();
}
function removeNoHWDay(d){
  const days=load('flux_no_hw_days',[]).filter(x=>x!==d);
  save('flux_no_hw_days',days);renderNoHWList();
}

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
function clearCache(){
  const inp=prompt('Type DELETE to confirm wiping all planner data. This cannot be undone.');
  if(inp!=='DELETE'){if(inp!==null)alert('Cancelled — you must type DELETE exactly.');return;}
  const keep=['flux_settings','flux_accent','flux_accent_rgb','flux_theme','profile','flux_user_name'];
  Object.keys(localStorage).forEach(k=>{if(!keep.includes(k))localStorage.removeItem(k);});
  tasks=[];grades={};notes=[];habits=[];goals=[];colleges=[];moodHistory=[];
  renderStats();renderTasks();
  showToast('All planner data cleared.','info');
}

// ══ MOD / DEV ACCOUNT ══
// ══ OWNER / DEV ACCOUNT SYSTEM ══
const OWNER_EMAIL='azfermohammed21@gmail.com';

// Permission levels: owner > dev > user
// Dev accounts + their permissions stored in Supabase under owner's row
function isOwner(){return currentUser&&currentUser.email===OWNER_EMAIL;}
function getMyRole(){
  if(isOwner())return'owner';
  const devAccounts=load('flux_dev_accounts',[]);
  const me=devAccounts.find(d=>d.email===currentUser?.email);
  return me?'dev':'user';
}
function getMyDevPerms(){
  const devAccounts=load('flux_dev_accounts',[]);
  const me=devAccounts.find(d=>d.email===currentUser?.email);
  return me?.perms||[];
}
function hasDevPerm(perm){
  if(isOwner())return true;
  return getMyDevPerms().includes(perm);
}
function isDevMode(){return load('flux_dev_mode',false);}

// Load dev accounts from cloud (stored under owner's Supabase row)
async function loadDevAccounts(){
  const sb=getSB();if(!sb)return;
  try{
    const{data}=await sb.from('user_data').select('data').eq('id',currentUser.id).single();
    if(data?.data?.devAccounts){
      save('flux_dev_accounts',data.data.devAccounts);
    }
  }catch(e){}
}

// Save dev accounts to cloud under owner's row
async function saveDevAccounts(devAccounts){
  save('flux_dev_accounts',devAccounts);
  // Also push to cloud immediately
  if(isOwner())await syncToCloud();
}

function initModFeatures(){
  const role=getMyRole();
  if(role==='user')return;
  const footer=document.querySelector('.sidebar-footer');
  if(!footer||document.getElementById('modBadge'))return;
  const badge=document.createElement('div');
  badge.id='modBadge';
  const isOwnerAcc=role==='owner';
  badge.style.cssText=`padding:6px 10px;margin-bottom:6px;background:${isOwnerAcc?'linear-gradient(135deg,rgba(251,191,36,.2),rgba(249,115,22,.15))':'linear-gradient(135deg,rgba(var(--accent-rgb),.15),rgba(192,132,252,.1))'};border:1px solid ${isOwnerAcc?'rgba(251,191,36,.4)':'rgba(var(--accent-rgb),.3)'};border-radius:10px;font-size:.68rem;font-family:JetBrains Mono,monospace;color:${isOwnerAcc?'var(--gold)':'var(--accent)'};display:flex;align-items:center;gap:6px;cursor:pointer`;
  badge.innerHTML=`<span>${isOwnerAcc?'👑':'⚡'}</span><span>${isOwnerAcc?'Owner':'Dev Account'}</span><span style="margin-left:auto;opacity:.6">${isDevMode()?'DEV':'LIVE'}</span>`;
  badge.onclick=()=>openModPanel();
  footer.insertBefore(badge,footer.firstChild);
}

function openModPanel(){
  const role=getMyRole();
  if(role==='user')return;
  const existing=document.getElementById('modPanel');if(existing)existing.remove();
  const panel=document.createElement('div');
  panel.id='modPanel';
  panel.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9800;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);overflow-y:auto';

  const devMode=isDevMode();
  const devAccounts=load('flux_dev_accounts',[]);
  const allPerms=['clear_data','feature_flags','dev_mode','manage_devs','view_users'];
  const permLabels={clear_data:'Clear Data',feature_flags:'Feature Flags',dev_mode:'Dev Mode Toggle',manage_devs:'Manage Dev Accounts',view_users:'View Users'};

  const devAccountsHTML=isOwner()?`
    <div style="margin-top:18px">
      <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:10px">Dev Accounts</div>
      <div id="devAccountsList">
        ${devAccounts.length?devAccounts.map((d,i)=>`
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;flex:1">${d.email}</span>
              <button onclick="removeDevAccount(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem;padding:2px 6px">✕ Remove</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${allPerms.map(p=>`<button onclick="toggleDevPerm(${i},'${p}',this)" style="padding:3px 10px;font-size:.68rem;border-radius:20px;background:${d.perms?.includes(p)?'rgba(var(--accent-rgb),.15)':'rgba(255,255,255,.04)'};border:1px solid ${d.perms?.includes(p)?'rgba(var(--accent-rgb),.35)':'var(--border2)'};color:${d.perms?.includes(p)?'var(--accent)':'var(--muted2)'}">${permLabels[p]}</button>`).join('')}
            </div>
          </div>`).join(''):'<div style="color:var(--muted);font-size:.78rem;margin-bottom:10px">No dev accounts yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="email" id="newDevEmail" placeholder="email@gmail.com" style="flex:1;margin:0;padding:8px 12px;font-size:.8rem">
        <button onclick="addDevAccount()" style="padding:8px 14px;font-size:.78rem;flex-shrink:0">+ Add Dev</button>
      </div>
    </div>`:'';

  const myPerms=getMyDevPerms();

  panel.innerHTML=`
    <div style="background:var(--card);border:1px solid ${role==='owner'?'rgba(251,191,36,.4)':'rgba(var(--accent-rgb),.3)'};border-radius:22px;padding:24px;width:100%;max-width:500px;box-shadow:0 32px 80px rgba(0,0,0,.6);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <div style="font-size:1.4rem">${role==='owner'?'👑':'⚡'}</div>
        <div>
          <div style="font-size:1rem;font-weight:800">${role==='owner'?'Owner Panel':'Dev Panel'}</div>
          <div style="font-size:.7rem;color:var(--muted);font-family:'JetBrains Mono',monospace">${currentUser?.email}</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span style="font-size:.65rem;padding:3px 8px;border-radius:20px;background:${role==='owner'?'rgba(251,191,36,.15)':'rgba(var(--accent-rgb),.12)'};border:1px solid ${role==='owner'?'rgba(251,191,36,.3)':'rgba(var(--accent-rgb),.25)'};color:${role==='owner'?'var(--gold)':'var(--accent)'};font-family:JetBrains Mono,monospace">${role.toUpperCase()}</span>
          <button onclick="document.getElementById('modPanel').remove()" style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer;padding:0">✕</button>
        </div>
      </div>

      ${(isOwner()||myPerms.includes('dev_mode'))?`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-size:.87rem;font-weight:700">🧪 Dev Mode</div><div style="font-size:.72rem;color:var(--muted)">Test features before pushing to users</div></div>
        <button onclick="toggleDevMode()" style="padding:6px 16px;font-size:.78rem;background:${devMode?'var(--green)':'rgba(255,255,255,.06)'};border:1px solid ${devMode?'var(--green)':'var(--border2)'};color:${devMode?'#080a0f':'var(--muted2)'}">${devMode?'ON':'OFF'}</button>
      </div>`:''}

      ${(isOwner()||myPerms.includes('feature_flags'))?`
      <div style="margin-top:14px;margin-bottom:6px;font-size:.65rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-family:'JetBrains Mono',monospace">Feature Flags</div>
      ${['ai','gmail','calendar','grades','goals','habits','mood','timer','notes'].map(f=>{
        const enabled=load('flux_feat_'+f,true);
        return`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:.85rem;font-weight:500">${f.charAt(0).toUpperCase()+f.slice(1)}</span>
          <button onclick="toggleFeatureFlag('${f}',this)" style="padding:4px 12px;font-size:.72rem;background:${enabled?'rgba(var(--accent-rgb),.15)':'rgba(255,255,255,.04)'};border:1px solid ${enabled?'rgba(var(--accent-rgb),.3)':'var(--border2)'};color:${enabled?'var(--accent)':'var(--muted2)'}">${enabled?'Enabled':'Disabled'}</button>
        </div>`;
      }).join('')}`:''}

      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        ${(isOwner()||myPerms.includes('clear_data'))?`<button onclick="clearMyPlannerData()" style="flex:1;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:var(--red);font-size:.78rem;min-width:120px">🗑 Clear My Data</button>`:''}
        <button onclick="forceSyncNow()" style="flex:1;font-size:.78rem;min-width:100px">⟳ Force Sync</button>
      </div>

      ${devAccountsHTML}
    </div>`;
  document.body.appendChild(panel);
}

function addDevAccount(){
  if(!isOwner())return;
  const email=document.getElementById('newDevEmail')?.value.trim();
  if(!email||!email.includes('@')){alert('Enter a valid email.');return;}
  const devAccounts=load('flux_dev_accounts',[]);
  if(devAccounts.find(d=>d.email===email)){alert('Already a dev account.');return;}
  devAccounts.push({email,perms:[],addedAt:Date.now()});
  saveDevAccounts(devAccounts);
  openModPanel();
}

function removeDevAccount(idx){
  if(!isOwner())return;
  const devAccounts=load('flux_dev_accounts',[]);
  devAccounts.splice(idx,1);
  saveDevAccounts(devAccounts);
  openModPanel();
}

function toggleDevPerm(idx,perm,btn){
  if(!isOwner())return;
  const devAccounts=load('flux_dev_accounts',[]);
  const acc=devAccounts[idx];if(!acc)return;
  if(!acc.perms)acc.perms=[];
  const has=acc.perms.includes(perm);
  if(has)acc.perms=acc.perms.filter(p=>p!==perm);
  else acc.perms.push(perm);
  saveDevAccounts(devAccounts);
  btn.style.background=!has?'rgba(var(--accent-rgb),.15)':'rgba(255,255,255,.04)';
  btn.style.borderColor=!has?'rgba(var(--accent-rgb),.35)':'var(--border2)';
  btn.style.color=!has?'var(--accent)':'var(--muted2)';
}

function toggleDevMode(){
  const cur=isDevMode();
  save('flux_dev_mode',!cur);
  openModPanel();
  initModFeatures();
}

function toggleFeatureFlag(feature,btn){
  const cur=load('flux_feat_'+feature,true);
  save('flux_feat_'+feature,!cur);
  btn.textContent=cur?'Disabled':'Enabled';
  btn.style.background=cur?'rgba(255,255,255,.04)':'rgba(var(--accent-rgb),.15)';
  btn.style.borderColor=cur?'var(--border2)':'rgba(var(--accent-rgb),.3)';
  btn.style.color=cur?'var(--muted2)':'var(--accent)';
  const tc=tabConfig.find(t=>t.id===feature);
  if(tc){tc.visible=!cur;save('flux_tabs',tabConfig);renderSidebars();}
}

function clearMyPlannerData(){
  if(!confirm('Clear ALL your planner data? This cannot be undone.'))return;
  tasks=[];grades={};notes=[];habits=[];goals=[];colleges=[];moodHistory=[];weightedRows=[];
  save('tasks',tasks);save('flux_grades',grades);save('flux_notes',notes);
  save('flux_habits',habits);save('flux_goals',goals);save('flux_colleges',colleges);
  save('flux_mood',moodHistory);save('flux_weighted',weightedRows);
  renderStats();renderTasks();renderGradeInputs();renderNotesList();
  renderHabitList();renderGoalsList();renderMoodHistory();
  if(currentUser)syncToCloud();
  document.getElementById('modPanel')?.remove();
  const n=document.createElement('div');
  n.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--green);color:#080a0f;padding:10px 20px;border-radius:10px;font-size:.82rem;font-weight:700;z-index:9999';
  n.textContent='✓ Planner data cleared';
  document.body.appendChild(n);setTimeout(()=>n.remove(),2500);
}


// ══════════════════════════════════════════
// FEATURE ENHANCEMENTS v3
// ══════════════════════════════════════════

// ── DYNAMIC FOCUS CARD ──
function updateDynamicFocus(){
  const el=document.getElementById('dynamicFocus');if(!el)return;
  const now=new Date();
  const todayClasses=classes.filter(c=>{
    if(!c.timeStart)return false;
    const days=c.days||'';
    const dayMap={0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat'};
    const d=dayMap[now.getDay()];
    if(days&&days!=='Mon-Fri'&&days!=='Any day'&&days!=='')return days.includes(d);
    return true;
  }).sort((a,b)=>a.timeStart?.localeCompare(b.timeStart));

  // Find next class
  let nextClass=null,gapMin=null;
  for(const c of todayClasses){
    if(!c.timeStart)continue;
    const[h,m]=c.timeStart.split(':').map(Number);
    const classTime=new Date(now);classTime.setHours(h,m,0,0);
    if(classTime>now){
      nextClass=c;
      gapMin=Math.round((classTime-now)/60000);
      break;
    }
  }

  if(!nextClass){
    el.innerHTML=`<div class="focus-card">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:1.6rem">🌙</div>
        <div><div class="focus-time" style="font-size:1.4rem">No more classes</div><div class="focus-label">Free for the rest of the day</div></div>
      </div>
    </div>`;
    return;
  }

  const hrs=Math.floor(gapMin/60),mins=gapMin%60;
  const timeStr=hrs>0?`${hrs}h ${mins}m`:`${mins}m`;

  // Find a task that fits in the gap
  const fitTask=tasks.filter(t=>!t.done&&t.estTime&&parseInt(t.estTime)<=gapMin).sort((a,b)=>(b.urgencyScore||0)-(a.urgencyScore||0))[0];
  const sugHtml=fitTask?`<div style="margin-top:12px;padding:10px;background:rgba(255,255,255,.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:4px">Suggested task for this gap</div>
    <div style="font-size:.85rem;font-weight:600">${esc(fitTask.name)}</div>
    <div style="font-size:.7rem;color:var(--muted2)">⏱ ${fitTask.estTime}m — fits before ${nextClass.name}</div>
  </div>`:'';

  el.innerHTML=`<div class="focus-card">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
      <div>
        <div class="focus-label">Next class in</div>
        <div class="focus-time">${timeStr}</div>
        <div style="font-size:.8rem;color:var(--muted2);margin-top:4px">${esc(nextClass.name)}${nextClass.room?' · '+esc(nextClass.room):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-family:'JetBrains Mono',monospace">Starts</div>
        <div style="font-size:1rem;font-weight:700;font-family:'JetBrains Mono',monospace">${fmtTime(nextClass.timeStart)}</div>
      </div>
    </div>
    ${sugHtml}
  </div>`;
}

// ── TIME POVERTY DETECTOR ─// ══ AI CHAT HISTORY / TABS ══
let aiChats=[];
function getAIChatKey(){return currentUser?'flux_ai_chats_'+currentUser.id:'flux_ai_chats_guest';}
function loadAIChatsForUser(){aiChats=load(getAIChatKey(),[]);if(!Array.isArray(aiChats))aiChats=[];}
function saveAIChats(){save(getAIChatKey(),aiChats);}
let aiCurrentChatId=null;

function initAIChats(){
  loadAIChatsForUser();
  if(!aiChats.length)newAIChat();
  else loadAIChat(aiChats[0].id);
  renderAIChatTabs();
}

function newAIChat(){
  const id='chat_'+Date.now();
  const chat={id,title:'New Chat',messages:[],createdAt:Date.now()};
  aiChats.unshift(chat);
  if(aiChats.length>10)aiChats=aiChats.slice(0,10); // keep last 10
  saveAIChats();
  loadAIChat(id);
  renderAIChatTabs();
}

function loadAIChat(id){
  aiCurrentChatId=id;
  const chat=aiChats.find(c=>c.id===id);
  if(!chat)return;
  aiHistory=chat.messages.map(m=>({role:m.role,content:m.content}));
  // Render messages
  const wrap=document.getElementById('aiMsgs');
  const sugs=document.getElementById('aiSugs');
  if(!wrap)return;
  wrap.innerHTML='';
  if(sugs)sugs.style.display=chat.messages.length?'none':'flex';
  chat.messages.forEach(m=>{
    if(m.role==='user')appendMsg('user',m.content);
    else if(m.role==='assistant')appendMsg('bot',m.content);
  });
  renderAIChatTabs();
  // Scroll to bottom
  const msgWrap=document.getElementById('aiMsgsWrap');
  if(msgWrap)setTimeout(()=>msgWrap.scrollTop=msgWrap.scrollHeight,50);
}

function saveCurrentChat(){
  if(!aiCurrentChatId)return;
  const chat=aiChats.find(c=>c.id===aiCurrentChatId);
  if(!chat)return;
  chat.messages=aiHistory.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)}));
  // Auto-title from first user message
  const firstUser=chat.messages.find(m=>m.role==='user');
  if(firstUser&&chat.title==='New Chat'){
    chat.title=firstUser.content.slice(0,30)+(firstUser.content.length>30?'…':'');
  }
  chat.updatedAt=Date.now();
  saveAIChats();
  renderAIChatTabs();
}

function deleteAIChat(id,e){
  e?.stopPropagation();
  aiChats=aiChats.filter(c=>c.id!==id);
  saveAIChats();
  if(aiCurrentChatId===id){
    if(aiChats.length)loadAIChat(aiChats[0].id);
    else newAIChat();
  }
  renderAIChatTabs();
}

function renderAIChatTabs(){
  const el=document.getElementById('aiChatTabs');if(!el)return;
  if(!aiChats.length){el.innerHTML='';return;}
  el.innerHTML=aiChats.map(c=>`
    <div onclick="loadAIChat('${c.id}')" style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;cursor:pointer;white-space:nowrap;font-size:.75rem;transition:all .15s;flex-shrink:0;
      ${c.id===aiCurrentChatId?'background:rgba(var(--accent-rgb),.15);border:1px solid rgba(var(--accent-rgb),.3);color:var(--accent)':'background:var(--card2);border:1px solid var(--border);color:var(--muted2)'}">
      <span>${c.title||'Chat'}</span>
      <span onclick="deleteAIChat('${c.id}',event)" style="opacity:.5;font-size:.7rem;padding:0 2px;cursor:pointer" title="Delete">✕</span>
    </div>`).join('');
}

function clearAIChat(){
  aiHistory=[];
  const wrap=document.getElementById('aiMsgs');if(wrap)wrap.innerHTML='';
  const sugs=document.getElementById('aiSugs');if(sugs)sugs.style.display='flex';
  // Reset current chat
  if(aiCurrentChatId){
    const chat=aiChats.find(c=>c.id===aiCurrentChatId);
    if(chat){chat.messages=[];chat.title='New Chat';saveAIChats();renderAIChatTabs();}
  }
}
function fmtAI(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^### (.+)$/gm,'<strong style="display:block;margin-top:8px;margin-bottom:2px">$1</strong>').replace(/^- (.+)$/gm,'<li style="margin-left:14px;margin-bottom:3px">$1</li>').replace(/Q:\s*(.+)/g,'<strong style="color:var(--accent)">Q:</strong> $1').replace(/A:\s*(.+)/g,'<strong style="color:var(--green)">A:</strong> $1').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');}
function appendMsg(role,content,isThink){const wrap=document.getElementById('aiMsgs');if(!wrap)return document.createElement('div');const div=document.createElement('div');div.className='ai-msg '+role;const isBot=role==='bot';if(isThink){div.id='aiThink';div.innerHTML='<div class="ai-av bot">✦</div><div class="ai-bub bot"><div class="ai-think"><span></span><span></span><span></span></div></div>';}else{const f=isBot?fmtAI(content):esc(content);const init=(localStorage.getItem('flux_user_name')||'U').charAt(0).toUpperCase();div.innerHTML=`<div class="ai-av ${isBot?'bot':'me'}">${isBot?'✦':init}</div><div class="ai-bub ${isBot?'bot':'user'}">${f}</div>`;}wrap.appendChild(div);// Scroll inner wrapper, not the page
const msgWrap=document.getElementById('aiMsgsWrap');if(msgWrap)setTimeout(()=>msgWrap.scrollTop=msgWrap.scrollHeight,30);return div;}
function renderAISugs(){const el=document.getElementById('aiSugs');if(!el)return;el.innerHTML='';const sugs=["What's due this week?","Make me a study plan","Create flashcards for my next test","Help with my essay outline","What should I work on now?","Generate a 3-day exam prep plan","Quiz me on my hardest subject","Summarize what I have coming up"];sugs.forEach(s=>{const btn=document.createElement('button');btn.className='ai-sug';btn.textContent=s;btn.onclick=()=>{document.getElementById('aiInput').value=s;sendAI();};el.appendChild(btn);});}
function handleAIImg(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{aiPendingImg={data:e.target.result.split(',')[1],mime:file.type,name:file.name};const prev=document.getElementById('aiImgPreview');if(prev){prev.style.display='block';prev.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.2);border-radius:8px"><img src="${e.target.result}" style="width:44px;height:44px;object-fit:cover;border-radius:6px"><div style="flex:1;font-size:.78rem;font-weight:600">${file.name}</div><button onclick="aiPendingImg=null;this.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0">✕</button></div>`;}};reader.readAsDataURL(file);}
function buildAIPrompt(){
  const ctx=refreshAIContext();
  const name=localStorage.getItem('flux_user_name')||'Student';
  const p=load('profile',{});
  const grade=p.grade||'';
  const program=p.program||'';
  const now=new Date();now.setHours(0,0,0,0);
  const gpa=calcGPA(grades);
  const mood=moodHistory.slice(-1)[0];
  const subjs=getSubjects();
  const fmt=t=>{const due=t.date?new Date(t.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'no date';const over=t.date&&new Date(t.date+'T00:00:00')<now?' OVERDUE':'';const np=t.date&&isBreak(t.date)?' [NO-HW]':'';const s=subjs[t.subject];return`- [${(t.priority||'med').toUpperCase()}|${s?s.short:t.subject||'—'}|${t.type||'hw'}|Due ${due}${over}${np}]: ${t.name}`;};

  // Calendar context — upcoming events + classes
  const today=todayStr();
  const in7=new Date(now);in7.setDate(now.getDate()+7);
  const calEvents=(load('flux_events',[])).filter(e=>{if(!e.date)return false;const d=new Date(e.date+'T00:00:00');return d>=now&&d<=in7;}).map(e=>`- [EVENT|${e.date}${e.time?' '+e.time:''}]: ${e.title}`).join('\n')||'None';
  const todayClasses=classes.filter(c=>c.name).map(c=>`P${c.period}: ${c.name}${c.teacher?' ('+c.teacher+')':''}`).join(', ')||'Not set up';

  return`You are Flux AI — a brilliant, warm AI tutor and planner assistant built into Flux Planner.
Student: ${name}${grade?' · Grade '+grade:''}${program?' · '+program:''}
Today: ${TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
${mood?`Mood: ${mood.mood}/5, Stress: ${mood.stress}/10, Sleep: ${mood.sleep}h`:''}

SCHEDULE:
Classes: ${todayClasses}
Calendar events this week:\n${calEvents}

TASKS:
Recent completed (7d): ${ctx.recent.length?ctx.recent.map(fmt).join(' | '):'None'}
Upcoming (14d): ${ctx.upcoming.length?ctx.upcoming.map(fmt).join(' | '):'None'}
Active tasks: ${tasks.filter(t=>!t.done).slice(0,20).map(fmt).join(' | ')||'None'}
${Object.keys(grades).length?`\nGrades: ${Object.entries(grades).map(([k,v])=>k+': '+v).join(', ')} | GPA: ${gpa!==null?precise(gpa)+' (4dp)':'—'}`:''}

RULES:
- Be warm, concise, and helpful. Call the student by name naturally.
- When adding tasks, output the actions block ONLY — no confirmation text.
- Never sign off with the student's name repeatedly.
- You can see their calendar and schedule above — use it to answer schedule questions.
- GPA always to 4 decimal places (toFixed(4)).
- g = 10 m/s² for all physics calculations.
${getStudyDNAPrompt()}

TASK ACTIONS — output ONLY this block when adding tasks:
\`\`\`actions
[{"action":"add_task","name":"...","priority":"high","date":"YYYY-MM-DD","type":"test","subject":"SUBJECT_KEY"}]
\`\`\``;
}
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
  saveCurrentChat(); // save user message immediately
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
    saveCurrentChat(); // persist to chat tabs
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
  // Show guest banner in account settings if guest
  const guestBanner=document.getElementById('guestAccountBanner');
  const signedOutMsg=document.getElementById('accountSignedOutMsg');
  const wasGuest=load('flux_was_guest',false);
  if(guestBanner){guestBanner.style.display=wasGuest&&!currentUser?'block':'none';}
  if(signedOutMsg){signedOutMsg.style.display=wasGuest&&!currentUser?'none':'block';}
}
function getCloudPayload(){
  // Include colors in sync now — user wants same colors everywhere
  return{
    accent:localStorage.getItem('flux_accent')||'',
    accentRgb:localStorage.getItem('flux_accent_rgb')||'',
    theme:localStorage.getItem('flux_theme')||'',
    tasks,
    grades,
    weightedRows,
    notes:notes.map(n=>({...n,body:n.body||''})),
    habits,
    goals,
    colleges,
    moodHistory,
    schoolInfo,
    classes,
    teacherNotes,
    profile:load('profile',{}),
    studyDNA,
    confidences,
    sessionLog,
    onboarded:true,
    noHWDays:load('flux_no_hw_days',[]),
    events:load('flux_events',[]),
    settings:settings,
    ...(isOwner()?{devAccounts:load('flux_dev_accounts',[]),ownerEmail:OWNER_EMAIL}:{}),
  };
}
async function syncToCloud(){
  if(!currentUser)return;
  const sb=getSB();if(!sb)return;
  setSyncStatus('syncing');
  try{
    const payload=getCloudPayload();
    const{error}=await sb.from('user_data').upsert({id:currentUser.id,data:payload,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error){
      console.error('Sync error:',error);
      setSyncStatus('offline');
      // Show error in UI
      const el=document.getElementById('syncStatus');
      if(el)el.textContent='Sync failed: '+error.message;
      return;
    }
    setSyncStatus('synced');
    save('flux_last_sync',Date.now());
    console.log('✓ Synced to cloud at',new Date().toLocaleTimeString());
  }catch(e){
    console.error('Sync error:',e);
    setSyncStatus('offline');
  }
}

async function forceSyncNow(){
  const btn=event?.target;
  if(btn){btn.textContent='Syncing...';btn.disabled=true;}
  await syncToCloud();
  await syncFromCloud();
  // Re-render everything so pulled data appears immediately without refresh
  renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();
  renderProfile();renderGradeInputs();renderGradeOverview();renderNotesList();
  renderHabitList();renderGoalsList();renderCollegeList();renderMoodHistory();
  renderSchool();updateTStats();populateSubjectSelects();
  if(btn){btn.textContent='✓ Synced';setTimeout(()=>{btn.textContent='Force Sync Now';btn.disabled=false;},2000);}
  showToast('✓ Data synced');
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
    if(d.profile&&d.profile.name){localStorage.setItem('profile',JSON.stringify(d.profile));localStorage.setItem('flux_user_name',d.profile.name.split(' ')[0]);}
    if(d.studyDNA){studyDNA=d.studyDNA;save('flux_dna',studyDNA);}
    if(d.confidences){confidences=d.confidences;save('flux_conf',confidences);}
    if(d.sessionLog){sessionLog=d.sessionLog;save('flux_session_log',sessionLog);}
    if(d.noHWDays){save('flux_no_hw_days',d.noHWDays);}
    if(d.events){save('flux_events',d.events);}
    if(d.settings){
      settings={...settings,...d.settings};
      save('flux_settings',settings);
    }
    // Restore synced colors
    if(d.accent){localStorage.setItem('flux_accent',d.accent);document.documentElement.style.setProperty('--accent',d.accent);}
    if(d.accentRgb){localStorage.setItem('flux_accent_rgb',d.accentRgb);document.documentElement.style.setProperty('--accent-rgb',d.accentRgb);}
    if(d.theme){localStorage.setItem('flux_theme',d.theme);applyThemeByName(d.theme);}
    if(d.onboarded)save('flux_onboarded',true);
    // Load devAccounts — owner's list syncs to all dev accounts too
    if(d.devAccounts)save('flux_dev_accounts',d.devAccounts);
    // Dev accounts: fetch owner's devAccounts list to check permissions
    if(!isOwner()&&!d.devAccounts){
      // Try to load dev accounts from owner's row
      try{
        const ownerRes=await sb.from('user_data').select('data').eq('id',(await sb.from('user_data').select('id,data').limit(100)).data?.find(r=>r.data?.ownerEmail===OWNER_EMAIL)?.id||'').single();
        if(ownerRes.data?.data?.devAccounts)save('flux_dev_accounts',ownerRes.data.data.devAccounts);
      }catch(e){}
    }
    setSyncStatus('synced');
    const hasCloudData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0||!!load('profile',{}).name||d.onboarded;
    if(hasCloudData)save('flux_onboarded',true);
    renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();renderProfile();renderGradeInputs();renderGradeOverview();renderNotesList();renderHabitList();renderGoalsList();renderCollegeList();renderMoodHistory();renderSchool();updateTStats();
    populateSubjectSelects();
  }catch(e){console.error('Sync from cloud error',e);setSyncStatus('offline');}
}
const syncDebounceTimers={};
function syncKey(key,val){
  if(!currentUser)return;
  clearTimeout(syncDebounceTimers[key]);
  // Sync after 1.5s of inactivity (was 3s — faster feedback)
  syncDebounceTimers[key]=setTimeout(async()=>{
    await syncToCloud();
  },1500);
}

// ══ ONBOARDING ══
let obCurrentStep=1;
const OB_TOTAL=4;
let obSelectedGrade='10';
let obSelectedTrack='';
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
    const p={name,grade:obSelectedGrade,program:obSelectedTrack};
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
  renderProfile();renderSchool();renderSidebars();populateSubjectSelects();
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
        prompt:'This is a student class schedule image. Extract every class/period. Return ONLY a valid JSON array with no extra text, no markdown, no backticks: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods sequentially if not shown. Empty string for missing fields. ONLY the JSON array.'})
    });
    if(!res.ok)throw new Error('Gemini error '+res.status);
    const data=await res.json();
    let txt=(data.text||'').replace(/```json/g,'').replace(/```/g,'').trim();
    if(!txt)throw new Error('Gemini returned empty response — check GEMINI_API_KEY in Supabase secrets');
    const start=txt.indexOf('[');const end=txt.lastIndexOf(']');
    if(start===-1||end===-1)throw new Error('No class list found. Try a clearer photo.');
    const parsed=JSON.parse(txt.slice(start,end+1));
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

// Sign in with Google while keeping all existing guest data
// ══ EMAIL / PASSWORD AUTH ══
let _authMode='signin'; // 'signin' | 'signup'

function toggleAuthMode(){
  _authMode=_authMode==='signin'?'signup':'signin';
  const nameRow=document.getElementById('loginNameRow');
  const btn=document.getElementById('loginEmailBtn');
  const toggleText=document.getElementById('loginToggleText');
  const toggleAction=document.getElementById('loginToggleAction');
  if(_authMode==='signup'){
    if(nameRow)nameRow.style.display='block';
    if(btn)btn.textContent='Create account';
    if(toggleText)toggleText.textContent='Already have an account?';
    if(toggleAction)toggleAction.textContent='Sign in';
  } else {
    if(nameRow)nameRow.style.display='none';
    if(btn)btn.textContent='Sign in';
    if(toggleText)toggleText.textContent="Don't have an account?";
    if(toggleAction)toggleAction.textContent='Sign up';
  }
  const errEl=document.getElementById('loginAuthError');
  if(errEl){errEl.textContent='';errEl.classList.remove('show');}
}

function showAuthError(msg){
  const el=document.getElementById('loginAuthError');
  if(!el)return;
  el.textContent=msg;el.classList.add('show');
}

async function handleEmailAuth(){
  const email=document.getElementById('loginEmail')?.value.trim();
  const password=document.getElementById('loginPassword')?.value;
  const name=document.getElementById('loginDisplayName')?.value.trim();
  if(!email||!password){showAuthError('Please enter your email and password.');return;}
  if(password.length<6){showAuthError('Password must be at least 6 characters.');return;}
  const sb=getSB();if(!sb){showAuthError('Auth not available.');return;}
  const btn=document.getElementById('loginEmailBtn');
  if(btn){btn.textContent='...';btn.disabled=true;}
  try{
    let result;
    if(_authMode==='signup'){
      result=await sb.auth.signUp({
        email,password,
        options:{data:{full_name:name||email.split('@')[0]}}
      });
      if(result.error)throw result.error;
      if(result.data?.user&&!result.data.session){
        showAuthError('Check your email for a confirmation link!');
        if(btn){btn.textContent='Create account';btn.disabled=false;}
        return;
      }
    } else {
      result=await sb.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
    }
  }catch(e){
    showAuthError(e.message||'Authentication failed. Please try again.');
    if(btn){btn.textContent=_authMode==='signup'?'Create account':'Sign in';btn.disabled=false;}
  }
}

// ══ FAB — FLOATING ACTION BUTTON ══
function initFAB(){
  const fab=document.getElementById('fabBtn');
  const menu=document.getElementById('fabMenu');
  if(!fab||!menu)return;
  let open=false;
  fab.addEventListener('click',e=>{
    e.stopPropagation();
    open=!open;
    fab.style.transform=open?'rotate(45deg) scale(1.1)':'rotate(0) scale(1)';
    menu.style.display=open?'flex':'none';
    if(open){
      requestAnimationFrame(()=>{
        menu.style.opacity='1';menu.style.transform='translateY(0) scale(1)';
      });
    }
  });
  document.addEventListener('click',()=>{
    if(open){open=false;fab.style.transform='';menu.style.opacity='0';menu.style.transform='translateY(8px) scale(.97)';setTimeout(()=>{if(!open)menu.style.display='none';},180);}
  });
}

function fabAddTask(){
  document.getElementById('fabMenu').style.display='none';
  document.getElementById('fabBtn').style.transform='';
  // Focus quick add
  const qa=document.getElementById('quickAddInput');
  if(qa){nav('dashboard');setTimeout(()=>{qa.focus();qa.scrollIntoView({behavior:'smooth',block:'center'});},120);}
}
function fabAddGrade(){
  document.getElementById('fabMenu').style.display='none';
  document.getElementById('fabBtn').style.transform='';
  nav('grades');
  setTimeout(()=>{document.getElementById('newSubject')?.focus();},150);
}
function fabFocus(){
  document.getElementById('fabMenu').style.display='none';
  document.getElementById('fabBtn').style.transform='';
  nav('timer');
}

// ══ KEYBOARD SHORTCUTS ══
function initKeyboardShortcuts(){
  document.addEventListener('keydown',e=>{
    // Don't fire when typing in inputs
    const tag=document.activeElement?.tagName;
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    switch(e.key){
      case 'n': case 'N': case 't': case 'T':
        e.preventDefault();
        nav('dashboard');
        setTimeout(()=>{
          const qa=document.getElementById('quickAddInput');
          if(qa){qa.focus();qa.scrollIntoView({behavior:'smooth',block:'center'});}
        },100);
        break;
      case '/':
        e.preventDefault();
        nav('ai');
        setTimeout(()=>document.getElementById('aiInput')?.focus(),150);
        break;
      case 'g': case 'G':
        e.preventDefault();nav('grades');break;
      case 'c': case 'C':
        e.preventDefault();nav('calendar');break;
      case 'Escape':
        // Close any open modal
        document.querySelectorAll('.modal-overlay').forEach(m=>{if(m.style.display!=='none')closeModal(m.id);});
        break;
    }
  });
}

// Keyboard hint tooltip
function showKeyHint(){
  const hint=document.getElementById('keyHint');
  if(!hint||load('flux_keyhint_dismissed',false))return;
  setTimeout(()=>{
    hint.style.display='flex';
    hint.style.animation='slideUp .3s var(--ease-spring)';
    setTimeout(()=>{hint.style.opacity='0';hint.style.transition='opacity .3s';setTimeout(()=>hint.style.display='none',300);},4000);
  },2000);
}

// ══ GPA WHAT-IF CALCULATOR ══
function calcGPAWhatIf(){
  const subject=document.getElementById('whatIfSubject')?.value.trim();
  const score=parseFloat(document.getElementById('whatIfScore')?.value);
  const el=document.getElementById('whatIfResult');
  if(!el)return;
  if(!subject||isNaN(score)){el.textContent='Enter a subject and score.';el.style.color='var(--muted)';return;}
  // Clone grades and add/overwrite with hypothetical
  const hypothetical={...grades,[subject]:String(score)};
  const newGPA=calcGPA(hypothetical);
  const currentGPA=calcGPA(grades);
  if(newGPA===null){el.textContent='Could not calculate.';return;}
  const diff=newGPA-(currentGPA||0);
  const sign=diff>=0?'+':'';
  const color=diff>0?'var(--green)':diff<0?'var(--red)':'var(--muted2)';
  el.innerHTML=`New GPA: <strong style="color:var(--accent);font-family:'JetBrains Mono',monospace">${newGPA.toFixed(4)}</strong>
    <span style="color:${color};font-size:.8rem;margin-left:8px">${sign}${diff.toFixed(4)}</span>`;
}

// ══ PANIC GLOW (task-level) ══
function applyPanicGlow(){
  const now=new Date();
  const in12h=new Date(now.getTime()+12*60*60*1000);
  document.querySelectorAll('[data-task-id]').forEach(el=>{
    const id=parseInt(el.dataset.taskId);
    const t=tasks.find(x=>x.id===id);
    if(!t||t.done)return;
    if(t.date){
      const due=new Date(t.date+'T23:59:00');
      if(due<=in12h&&due>=now){
        el.style.boxShadow='0 0 0 1px rgba(255,77,109,.3),0 4px 20px rgba(255,77,109,.15)';
        el.style.borderColor='rgba(255,77,109,.3)';
      }
    }
  });
}

// ══ ITEM 21 — FIXED LAYOUT: PANEL SCROLL INDEPENDENCE ══
function initScrollLayout(){
  // App container: sidebar + main are fixed height, main scrolls independently
  const app=document.getElementById('app');
  if(!app)return;
  app.style.height='100vh';
  app.style.overflow='hidden';
  app.style.display='flex';

  const mainContent=document.querySelector('.main-content');
  if(mainContent){
    mainContent.style.height='100vh';
    mainContent.style.overflow='hidden';
    mainContent.style.display='flex';
    mainContent.style.flexDirection='column';
  }

  const sidebar=document.getElementById('sidebar');
  if(sidebar){
    sidebar.style.height='100vh';
    sidebar.style.overflowY='auto';
    sidebar.style.position='sticky';
    sidebar.style.top='0';
    sidebar.style.flexShrink='0';
  }

  const topbar=document.querySelector('.topbar');
  if(topbar){
    topbar.style.flexShrink='0';
    topbar.style.position='relative';
    topbar.style.zIndex='30';
  }

  // Each panel becomes independent scroll container
  document.querySelectorAll('.panel').forEach(panel=>{
    panel.style.flex='1';
    panel.style.overflowY='auto';
    panel.style.overscrollBehavior='contain';
    panel.style.webkitOverflowScrolling='touch';
  });

  // AI panel special — already flex column with fixed height
  const aiPanel=document.getElementById('ai');
  if(aiPanel){
    aiPanel.style.overflow='hidden';
    aiPanel.style.flex='1';
  }
}

async function signInWithGoogleKeepData(){
  // Mark that we want to migrate guest data after sign-in
  save('flux_migrate_guest',true);
  await signInWithGoogle();
}

async function signInWithGoogle(){
  const sb=getSB();
  if(!sb){alert('Supabase not loaded yet — please refresh the page.');return;}
  try{
    // Always use the exact GitHub Pages URL as redirect
    const redirectTo='https://azfermohammed.github.io/Fluxplanner/';
    const{data,error}=await sb.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo,
        scopes:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
        queryParams:{access_type:'offline',prompt:'select_account'}
      }
    });
    if(error)throw error;
    // Supabase will redirect the current tab to Google — no new tab needed
  }catch(e){
    console.error('OAuth error:',e);
    alert('Sign in failed: '+e.message);
  }
}

async function signOut(){
  if(!confirm('Sign out?'))return;
  if(window._syncInterval){clearInterval(window._syncInterval);window._syncInterval=null;}
  const sb=getSB();
  if(sb) await sb.auth.signOut();
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
      if(event==='SIGNED_IN'&&s?.user){
        // Hide login screen immediately on OAuth callback
        const ls=document.getElementById('loginScreen');if(ls)ls.classList.remove('visible');
        await handleSignedIn(s.user,s);
      }
      else if(event==='SIGNED_OUT')handleSignedOut();
      else if(event==='TOKEN_REFRESHED'&&s?.user&&currentUser){
        // Keep user UI fresh on token refresh
        _updateUserUI(s.user,s.user.user_metadata?.full_name||s.user.email?.split('@')[0]);
      }
    });
  }catch(e){
    console.error('Auth init error:',e);
    showLoginOrApp();
  }
}

function showLoginOrApp(){
  const onboarded=load('flux_onboarded',false);
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  const wasGuest=load('flux_was_guest',false);
  if(wasGuest&&(onboarded||hasData)){
    document.getElementById('loginScreen').classList.remove('visible');
    document.getElementById('app').classList.add('visible');
    setSyncStatus('offline');
    renderSidebars();
    populateSubjectSelects();
    // ← These were missing — without them NO clicks work in guest mode
    initModFeatures();
    initDashboardFeatures();
    renderStats();renderTasks();renderCalendar();renderCountdown();
    renderSmartSug();renderProfile();renderGradeInputs();renderGradeOverview();
    renderNotesList();renderHabitList();renderGoalsList();renderMoodHistory();
    renderSchool();updateTStats();
  }else{
    document.getElementById('loginScreen').classList.add('visible');
    initLoginFeaturePills();
  }
}

async function handleSignedIn(user,session){
  // ── ACCOUNT SWITCH: wipe previous user's data ──────────────
  const lastId = localStorage.getItem('flux_last_user_id');
  if(lastId && lastId !== user.id){
    // Different account — clear EVERYTHING personal from localStorage
    // Device prefs (splash flag) survive; everything else goes
    const survivingKeys = ['flux_splash_shown','flux_theme'];
    const survived = {};
    survivingKeys.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)survived[k]=v;});
    localStorage.clear();
    Object.entries(survived).forEach(([k,v])=>localStorage.setItem(k,v));
    // Reset all in-memory state
    tasks=[];grades={};notes=[];habits=[];goals=[];colleges=[];
    moodHistory=[];schoolInfo={};classes=[];teacherNotes=[];
    sessionLog=[];studyDNA=[];confidences={};weightedRows=[];
    aiChats=[];aiHistory=[];
    console.log('🔄 Account switched — wiped previous user data');
  }
  localStorage.setItem('flux_last_user_id', user.id);
  // ────────────────────────────────────────────────────────────

  currentUser=user;
  save('flux_was_guest',false);
  if(session?.provider_token){
    gmailToken=session.provider_token;
    sessionStorage.setItem('flux_gmail_token',session.provider_token);
  }
  document.getElementById('loginScreen').classList.remove('visible');
  const name=user.user_metadata?.full_name||user.email?.split('@')[0]||'Student';
  const firstName=name.split(' ')[0];
  localStorage.setItem('flux_user_name',firstName);
  _updateUserUI(user,name);
  setSyncStatus('syncing');

  // If migrating from guest account, push local data to cloud first
  const migratingGuest=load('flux_migrate_guest',false);
  if(migratingGuest){
    save('flux_migrate_guest',false);
    save('flux_onboarded',true);
    await syncToCloud();
  }

  await syncFromCloud();

  const onboarded=load('flux_onboarded',false);
  const hasLocalData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  const hasProfile=!!load('profile',{}).name;
  const isFirstTime=!onboarded&&!hasLocalData&&!hasProfile;

  const ob=document.getElementById('onboarding');
  if(isFirstTime){
    if(ob)ob.classList.add('visible');
  }else{
    if(ob)ob.classList.remove('visible');
    document.getElementById('app').classList.add('visible');
    renderSidebars();
    populateSubjectSelects();
    initModFeatures();
    initDashboardFeatures();
  }
  // Sync every 2 minutes while logged in
  if(!window._syncInterval)window._syncInterval=setInterval(syncToCloud,2*60*1000);
}

function _updateUserUI(user,name){
  const firstName=(name||user.email?.split('@')[0]||'User').split(' ')[0];
  localStorage.setItem('flux_user_name',firstName);
  // Avatar — use Google profile pic if available
  const avatarUrl=user.user_metadata?.avatar_url||user.user_metadata?.picture||'';
  const avatarHTML=avatarUrl
    ?`<img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    :`<span style="font-size:.9rem;font-weight:700">${firstName.charAt(0).toUpperCase()}</span>`;
  // Sidebar user card
  const sav=document.getElementById('sidebarAv');if(sav)sav.innerHTML=avatarHTML;
  const sn=document.getElementById('sidebarName');if(sn)sn.textContent=name||firstName;
  const se=document.getElementById('sidebarEmail');if(se)se.textContent=user.email||'';
  // Mobile drawer user card
  const mav=document.getElementById('mobAv');if(mav)mav.innerHTML=avatarHTML;
  const mn=document.getElementById('mobName');if(mn)mn.textContent=name||firstName;
  const me=document.getElementById('mobEmail');if(me)me.textContent=user.email||'';
  // Settings account section
  const asd=document.getElementById('accountSignedOut');if(asd)asd.style.display='none';
  const asi=document.getElementById('accountSignedIn');if(asi)asi.style.display='block';
  const emailEl=document.getElementById('accountEmail');if(emailEl)emailEl.textContent=user.email||'';
  // Also update any topbar user indicators
  const topUser=document.getElementById('topbarUser');if(topUser)topUser.textContent=firstName;
}

function handleSignedOut(){
  currentUser=null;gmailToken=null;
  if(window._syncInterval){clearInterval(window._syncInterval);window._syncInterval=null;}
  sessionStorage.clear();
  // Keep only device prefs, wipe all user data
  const keysToKeep=['flux_splash_shown','flux_theme','flux_accent','flux_accent_rgb'];
  const kept={};
  keysToKeep.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)kept[k]=v;});
  localStorage.clear();
  Object.entries(kept).forEach(([k,v])=>localStorage.setItem(k,v));
  // Force hard reload — page restarts fresh, initAuth sees no session, shows login
  window.location.href='https://azfermohammed.github.io/Fluxplanner/';
}

// ══ FEATURE PILLS — injected into login screen ══
function initFeaturePills(){
  const wrap=document.getElementById('featPills');if(!wrap)return;
  const pills=[
    {label:'✦ Flux AI Tutor',c:'#6366f1'},
    {label:'📷 Gemini Vision Import',c:'#10d9a0'},
    {label:'📊 4-Decimal GPA',c:'#fbbf24'},
    {label:'⏱ Pomodoro Timer',c:'#a78bfa'},
    {label:'📅 Smart Calendar',c:'#3b82f6'},
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

// ══ ITEM 4 — TOPBAR FULL IMPLEMENTATION ══
function initTopbar(){
  function updateClock(){
    const now=new Date();
    const timeStr=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    const el=document.getElementById('topbarClock');if(el)el.textContent=timeStr;
  }
  updateClock();setInterval(updateClock,10000);
  function updateEnergyPill(){
    const energy=parseInt(localStorage.getItem('flux_energy')||'3');
    const emojis=['','😴','😕','😐','😊','🚀'];
    const el=document.getElementById('topbarEnergy');if(el)el.textContent=emojis[energy]||'😐';
  }
  updateEnergyPill();
  const _orig=window.setEnergy;
  if(_orig&&!window._topbarEnergyPatched){
    window._topbarEnergyPatched=true;
    window.setEnergy=function(v){_orig(v);updateEnergyPill();};
  }
}

// ══ ITEM 20 — DASHBOARD SECTION REORDER ══
function reorderDashboard(){
  const panel=document.getElementById('dashboard');if(!panel)return;
  const order=['panicBanner','timePovertyBanner','dynamicFocusCard','statsRow','smartSugCard','dashEnergyCard','dashQuickAdd','filterChips','taskList','countdownCard'];
  order.forEach(id=>{const el=document.getElementById(id);if(el&&el.parentElement===panel)panel.appendChild(el);});
}

// ══ ITEM 22 — QUICK-ADD TASK BAR ══
function initQuickAdd(){
  const qa=document.getElementById('quickAddInput');if(!qa)return;
  qa.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      const val=qa.value.trim();if(!val)return;
      const priority=val.includes(' high')?'high':val.includes(' low')?'low':'med';
      const name=val.replace(/ high| low| med/g,'').trim();
      let date='';
      const tmr=new Date(TODAY);tmr.setDate(TODAY.getDate()+1);
      if(val.toLowerCase().includes('tomorrow'))date=tmr.toISOString().slice(0,10);
      else if(val.toLowerCase().includes('today'))date=TODAY.toISOString().slice(0,10);
      const task={id:Date.now()+Math.random(),name,priority,date,type:'hw',done:false,rescheduled:0,createdAt:Date.now(),urgencyScore:0,estTime:0,difficulty:3};
      task.urgencyScore=calcUrgency(task);
      tasks.unshift(task);save('tasks',tasks);
      qa.value='';
      renderStats();renderTasks();renderCalendar();renderCountdown();
      checkAllPanic();syncKey('tasks',tasks);
      showToast('✓ Task added');panicCheck(task);
    }
    if(e.key==='Escape')qa.blur();
  });
}

// ══ ITEM 24 — DRAG TO REORDER TASKS ══
let _dragTaskId=null,_dragOverId=null;
function initTaskDrag(){
  const list=document.getElementById('taskList');if(!list)return;
  list.addEventListener('dragstart',e=>{
    const item=e.target.closest('[data-task-id]');if(!item)return;
    _dragTaskId=parseInt(item.dataset.taskId);
    e.dataTransfer.effectAllowed='move';
    setTimeout(()=>item.classList.add('task-dragging'),0);
  });
  list.addEventListener('dragend',e=>{
    const item=e.target.closest('[data-task-id]');if(item)item.classList.remove('task-dragging');
    list.querySelectorAll('.drag-over-task').forEach(el=>el.classList.remove('drag-over-task'));
    _dragTaskId=null;_dragOverId=null;
  });
  list.addEventListener('dragover',e=>{
    e.preventDefault();
    const item=e.target.closest('[data-task-id]');if(!item||!_dragTaskId)return;
    const overId=parseInt(item.dataset.taskId);if(overId===_dragTaskId)return;
    if(_dragOverId!==overId){
      list.querySelectorAll('.drag-over-task').forEach(el=>el.classList.remove('drag-over-task'));
      item.classList.add('drag-over-task');_dragOverId=overId;
    }
  });
  list.addEventListener('drop',e=>{
    e.preventDefault();
    if(!_dragTaskId||!_dragOverId||_dragTaskId===_dragOverId)return;
    const fi=tasks.findIndex(t=>t.id===_dragTaskId),ti=tasks.findIndex(t=>t.id===_dragOverId);
    if(fi<0||ti<0)return;
    const[moved]=tasks.splice(fi,1);tasks.splice(ti,0,moved);
    save('tasks',tasks);renderTasks();syncKey('tasks',tasks);
    _dragTaskId=null;_dragOverId=null;
  });
}

// ══ ITEM 9 — MODAL ANIMATION POLISH ══
function openModal(id){
  const overlay=document.getElementById(id);if(!overlay)return;
  overlay.style.display='flex';
  requestAnimationFrame(()=>{
    overlay.style.animation='fadeIn .18s var(--ease-out)';
    const card=overlay.querySelector('.modal-card');
    if(card){card.style.animation='none';requestAnimationFrame(()=>card.style.animation='slideUpModal .28s var(--ease-spring)');}
  });
  document.body.style.overflow='hidden';
}
function closeModal(id){
  const overlay=document.getElementById(id);if(!overlay)return;
  overlay.style.opacity='0';overlay.style.transition='opacity .15s';
  setTimeout(()=>{overlay.style.display='none';overlay.style.opacity='';overlay.style.transition='';},160);
  document.body.style.overflow='';
}

// ══ ITEM 33 — LOADING STATES ══
function setLoading(btnEl,loading,origText){
  if(!btnEl)return;
  if(loading){btnEl.classList.add('btn-loading');btnEl.disabled=true;}
  else{btnEl.classList.remove('btn-loading');btnEl.disabled=false;if(origText)btnEl.textContent=origText;}
}
function showSectionLoading(containerId,rows=3){
  const el=document.getElementById(containerId);if(!el)return;
  el.innerHTML=Array(rows).fill(`<div class="skeleton" style="height:54px;border-radius:10px;margin-bottom:6px"></div>`).join('');
}

// ══ ITEM 34 — ERROR STATES ══
function showError(containerId,msg,retryFnStr){
  const el=document.getElementById(containerId);if(!el)return;
  el.innerHTML=`<div style="text-align:center;padding:32px 16px">
    <div style="font-size:2rem;margin-bottom:10px">⚠️</div>
    <div style="font-size:.9rem;font-weight:700;color:var(--text);margin-bottom:5px">Something went wrong</div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:16px;line-height:1.6">${esc(msg||'Please try again.')}</div>
    ${retryFnStr?`<button onclick="${retryFnStr}" style="font-size:.78rem;padding:7px 18px;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.3);color:var(--accent)">↺ Try again</button>`:''}
  </div>`;
}

// ══ ITEM 3 — MOBILE NAV FULL ACTIVATION ══
function initMobileNav(){
  const bnav=document.querySelector('.bottom-nav');if(!bnav)return;
  // Active state + haptic on every tab click
  bnav.addEventListener('click',e=>{
    const btn=e.target.closest('.bnav-item');
    if(!btn||btn.id==='moreBtn')return;
    bnav.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(navigator.vibrate)navigator.vibrate(6);
  });
  // Scroll active tab into view
  const updateBnavScroll=()=>{
    const active=bnav.querySelector('.bnav-item.active');
    if(active)active.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
  };
  bnav.addEventListener('click',updateBnavScroll);
  // Prevent page bounce on nav touch
  bnav.addEventListener('touchstart',e=>{if(e.touches.length>0)e.stopPropagation();},{passive:true});
}

// ══ DASHBOARD INIT ══
function initDashboardFeatures(){
  initTopbar();
  initQuickAdd();
  initTaskDrag();
  initMobileNav();
  reorderDashboard();
  renderDynamicFocus();
  checkTimePoverty();
  renderGradeBuffer();
  setInterval(()=>{renderDynamicFocus();checkTimePoverty();},60000);
}

// ══ INIT ══
(function init(){
  loadTheme();
  loadSettingsUI();
  const sb=document.getElementById('sidebar');if(sb&&sidebarCollapsed)sb.classList.add('collapsed');
  document.getElementById('datePill').textContent=TODAY.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const ab=AB_MAP[todayStr()];
  if(ab){const p=document.getElementById('abPill');p.textContent=ab+' Day';p.style.display='block';p.style.background=ab==='A'?'rgba(99,102,241,.15)':'rgba(16,217,160,.15)';p.style.color=ab==='A'?'var(--accent)':'var(--green)';p.style.border='1px solid '+(ab==='A'?'rgba(99,102,241,.3)':'rgba(16,217,160,.3)');}
  updateTopbarStats();
  updateNextClassPill();
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
  populateSubjectSelects();
  initSidebarResize();
  initKeyboardShortcuts();
  initFAB();
  initScrollLayout();
  showKeyHint();
  setInterval(applyPanicGlow,5000);

  // ── FLOW: Splash (once per session) → Login → (1st time) Onboarding → App ──
  const afterSplash = () => initAuth();

  // Show splash only on first ever visit or fresh install
  const shownSplash = localStorage.getItem('flux_splash_shown');
  if(!shownSplash){
    localStorage.setItem('flux_splash_shown','1');
    const s=document.getElementById('splash');
    if(s)s.style.display='block';
    setTimeout(()=>{
      if(typeof window.runSplash==='function'){
        window.runSplash(afterSplash);
      }else{
        if(s)s.style.display='none';
        afterSplash();
      }
    },30);
  }else{
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
      'This is a student gradebook or report card. Extract every subject and its grade percentage or letter grade. Return ONLY a JSON object like {"Math":92,"English":"B+"}. Use the exact subject names shown. Return ONLY the JSON object, no markdown.');
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
      'This is a student class schedule image. Extract every class/period. Return ONLY a valid JSON array with no extra text, no markdown, no backticks: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods 1,2,3... if not shown. Use empty string for missing fields. Return ONLY the JSON array.');
    if(!txt||!txt.trim()){throw new Error('Gemini returned empty response — check your GEMINI_API_KEY in Supabase secrets');}
    // Try to extract JSON array from response
    let jsonStr=txt.trim();
    // Remove markdown code blocks if present
    jsonStr=jsonStr.replace(/```json/g,'').replace(/```/g,'').trim();
    // Find the first [ and last ]
    const start=jsonStr.indexOf('[');
    const end=jsonStr.lastIndexOf(']');
    if(start===-1||end===-1)throw new Error('No class list found in response. Try a clearer photo.');
    jsonStr=jsonStr.slice(start,end+1);
    const parsed=JSON.parse(jsonStr);
    if(!Array.isArray(parsed)||!parsed.length)throw new Error('No classes detected. Try a clearer photo of your schedule.');
    classes=parsed.map((c,i)=>({id:Date.now()+i,period:c.period||i+1,name:c.name||'Class '+(i+1),teacher:c.teacher||'',room:c.room||''}));
    save('flux_classes',classes);
    renderSchool();populateSubjectSelects();
    if(resEl)resEl.innerHTML=`<div style="color:var(--green);font-size:.82rem">✓ Imported ${classes.length} classes! Check School Info tab.</div>`;
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
