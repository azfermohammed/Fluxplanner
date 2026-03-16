/* ── FLUX IA EAST PLANNER · app.js v2 ── */

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

let taskFilter='all',editingId=null,editingGoalId=null;
let aiHistory=[],aiPendingImg=null;
let calYear=TODAY.getFullYear(),calMonth=TODAY.getMonth(),calSelected=TODAY.getDate();
let currentNoteId=null,noteFilter='all',flashcards=[],fcIndex=0,fcFlipped=false;
let ambientCtx=null,breathingActive=false,breathTimer=null;
let sidebarCollapsed=load('flux_sidebar_collapsed',false);

// ══ SUPABASE + API ══
const SB_URL='https://lfigdijuqmbensebnevo.supabase.co';
const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaWdkaWp1cW1iZW5zZWJuZXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjEzMDgsImV4cCI6MjA4ODkzNzMwOH0.qG1d9DLKrs0qqLgAp-6UGdaU7xWvlg2sWq-oD-y2kVo';
// All AI calls go to Supabase Edge Functions - no separate backend needed
const API={ai:`${SB_URL}/functions/v1/ai-proxy`,gemini:`${SB_URL}/functions/v1/gemini-proxy`,canvas:`${SB_URL}/functions/v1/canvas-proxy`};
const API_HEADERS={'Content-Type':'application/json','Authorization':`Bearer ${SB_ANON}`};
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

// ══ SPLASH ANIMATION ══
function runSplash(cb){
  const splash=document.getElementById('splash');
  // Trigger animations
  requestAnimationFrame(()=>{
    splash.classList.add('active');
    setTimeout(()=>{
      splash.classList.add('fade-out');
      setTimeout(()=>{splash.style.display='none';cb();},500);
    },2200);
  });
}

// ══ NAV ══
function nav(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // sidebar
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`[data-tab="${id}"]`).forEach(b=>b.classList.add('active'));
  // bottom nav
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  const bni=document.querySelector(`.bnav-item[data-tab="${id}"]`);if(bni)bni.classList.add('active');
  // topbar title
  const tTitle=document.getElementById('topbarTitle');if(tTitle)tTitle.textContent=PANEL_TITLES[id]||id;
  const fns={dashboard:()=>{renderStats();renderTasks();renderCountdown();renderSmartSug();},calendar:()=>renderCalendar(),school:()=>renderSchool(),grades:()=>{renderGradeInputs();renderGradeOverview();renderWeightedRows();calcWeighted();},notes:()=>renderNotesList(),habits:()=>{renderHabitList();renderHeatmap();},goals:()=>{renderGoalsList();renderCollegeList();},mood:()=>{renderMoodHistory();renderAffirmation();},timer:()=>{updateTDisplay();renderTDots();updateTStats();renderSubjectBudget();renderFocusHeatmap();},profile:()=>renderProfile(),ai:()=>renderAISugs(),settings:()=>renderNoHWList()};
  fns[id]?.();
}
function navMob(id){closeDrawer();nav(id);}

// ══ SIDEBAR ══
function toggleSidebar(){sidebarCollapsed=!sidebarCollapsed;save('flux_sidebar_collapsed',sidebarCollapsed);const sb=document.getElementById('sidebar');if(sb)sb.classList.toggle('collapsed',sidebarCollapsed);}
function openDrawer(){document.getElementById('drawerOverlay').classList.add('open');document.getElementById('mobDrawer').classList.add('open');}
function closeDrawer(){document.getElementById('drawerOverlay').classList.remove('open');document.getElementById('mobDrawer').classList.remove('open');}

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
  let html=['S','M','T','W','T','F','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=first-1;i>=0;i--)html+=`<div class="cal-day other"><div class="cal-dn">${prevDays-i}</div></div>`;
  for(let d=1;d<=days;d++){const dt=new Date(calYear,calMonth,d),ds=dt.toISOString().slice(0,10);const isToday=dt.getTime()===now.getTime(),isNP=isBreak(ds),ab=AB_MAP[ds];const tlist=tMap[d]||[];const dots=tlist.slice(0,4).map(t=>{const s=SUBJECTS[t.subject];return`<div class="cal-dot" style="background:${s?s.color:'var(--accent)'};opacity:${t.done?.4:1}"></div>`;}).join('');const abLabel=ab?`<div style="font-size:.45rem;font-family:'JetBrains Mono',monospace;color:${ab==='A'?'var(--accent)':'var(--green)'};line-height:1;margin-top:1px">${ab}</div>`:'';const overFlag=tlist.some(t=>!t.done&&new Date(t.date+'T00:00:00')<now)?'<div style="position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%;background:var(--red)"></div>':'';html+=`<div class="cal-day ${isToday?'today ':''}${d===calSelected?'selected ':''}${isNP?'no-hw':''}" onclick="selectDay(${d})" style="position:relative">${overFlag}<div class="cal-dn">${d}</div>${abLabel}<div class="cal-dots">${dots}</div></div>`;}
  document.getElementById('calGrid').innerHTML=html;renderCalDay();
}
function renderCalDay(){const dt=new Date(calYear,calMonth,calSelected);document.getElementById('calDayTitle').textContent=dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});const day=tasks.filter(t=>{if(!t.date)return false;const d=new Date(t.date+'T00:00:00');return d.getFullYear()===calYear&&d.getMonth()===calMonth&&d.getDate()===calSelected;});const el=document.getElementById('calDayTasks');if(!day.length){el.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:4px 0">No tasks this day.</div>';return;}el.innerHTML=day.map(t=>`<div class="task-item" style="margin-bottom:6px"><div class="check ${t.done?'done':''}" onclick="toggleTask(${t.id})">${t.done?'✓':''}</div><div class="task-body"><div class="task-text ${t.done?'done':''}">${esc(t.name)}</div></div><button class="btn-sm btn-del" onclick="deleteTask(${t.id})">✕</button></div>`).join('');}

// ══ SCHOOL INFO ══
function saveSchoolInfo(){schoolInfo={locker:document.getElementById('inputLocker').value.trim(),combo:document.getElementById('inputCombo').value.trim(),counselor:document.getElementById('inputCounselor').value.trim(),studentID:document.getElementById('inputStudentID').value.trim()};save('flux_school',schoolInfo);renderSchool();syncKey('school',schoolInfo);const b=event?.target;if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='Save Info',1500);}}
function addClass(){const period=document.getElementById('classPeriod').value,name=document.getElementById('className').value.trim(),teacher=document.getElementById('classTeacher').value.trim(),room=document.getElementById('classRoom').value.trim();if(!name)return;classes.push({id:Date.now(),period:parseInt(period)||classes.length+1,name,teacher,room});classes.sort((a,b)=>a.period-b.period);save('flux_classes',classes);document.getElementById('classPeriod').value='';document.getElementById('className').value='';document.getElementById('classTeacher').value='';document.getElementById('classRoom').value='';renderSchool();syncKey('classes',classes);}
function deleteClass(id){classes=classes.filter(c=>c.id!==id);save('flux_classes',classes);renderSchool();}
function addTeacherNote(){const teacher=document.getElementById('tNoteTeacher').value.trim(),note=document.getElementById('tNoteText').value.trim();if(!teacher||!note)return;teacherNotes.push({id:Date.now(),teacher,note});save('flux_teacher_notes',teacherNotes);document.getElementById('tNoteTeacher').value='';document.getElementById('tNoteText').value='';renderSchool();}
function deleteTeacherNote(id){teacherNotes=teacherNotes.filter(n=>n.id!==id);save('flux_teacher_notes',teacherNotes);renderSchool();}
function renderSchool(){
  // fill display tiles
  document.getElementById('displayLocker').textContent=schoolInfo.locker||'—';
  document.getElementById('displayCombo').textContent=schoolInfo.combo||'—';
  document.getElementById('displayCounselor').textContent=schoolInfo.counselor||'—';
  document.getElementById('displayStudentID').textContent=schoolInfo.studentID||'—';
  // fill inputs
  document.getElementById('inputLocker').value=schoolInfo.locker||'';
  document.getElementById('inputCombo').value=schoolInfo.combo||'';
  document.getElementById('inputCounselor').value=schoolInfo.counselor||'';
  document.getElementById('inputStudentID').value=schoolInfo.studentID||'';
  // classes
  const cl=document.getElementById('classesList');
  if(!classes.length){cl.innerHTML='<div class="empty" style="padding:10px 0">No classes added yet.</div>';return;}
  const subColors=Object.values(SUBJECTS).map(s=>s.color);
  cl.innerHTML=classes.map((c,i)=>{const col=subColors[i%subColors.length];return`<div class="class-row"><div class="class-period" style="background:${col}22;color:${col}">${c.period}</div><div style="flex:1"><div style="font-size:.88rem;font-weight:700">${esc(c.name)}</div><div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace">${c.teacher?c.teacher:''}${c.room?' · '+c.room:''}</div></div><button onclick="deleteClass(${c.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:4px">✕</button></div>`;}).join('');
  // teacher notes
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
function renderProfile(){const p=load('profile',{});const name=p.name||localStorage.getItem('flux_user_name')||'Student';const grade=p.grade||'10';const track=p.track||'Pre-IB / MYP';document.getElementById('profileName').textContent=name;document.getElementById('profileSubline').textContent=`Grade ${grade} · ${track}`;if(p.name){document.getElementById('name').value=p.name;document.getElementById('grade').value=p.grade||'10';document.getElementById('track').value=p.track||'Pre-IB / MYP';}const pic=localStorage.getItem('flux_profile_pic');const av=document.getElementById('pAvatar');if(av)av.innerHTML=(pic?`<img src="${pic}">`:name.charAt(0).toUpperCase())+`<input type="file" id="picUpload" accept="image/*" style="display:none" onchange="handlePicUpload(event)">`;const gpa=calcGPA(grades);const done=tasks.filter(t=>t.done).length;const badges=[];if(gpa!==null&&gpa>=3.7)badges.push({t:'🏆 Honor Roll',c:'badge-gold'});if(done>=20)badges.push({t:'✓ Task Master',c:'badge-green'});if(tStreak>=7)badges.push({t:'🔥 Study Streak',c:'badge-red'});if(track.toLowerCase().includes('ib diploma'))badges.push({t:'📚 IB Diploma',c:'badge-blue'});if(notes.length>=10)badges.push({t:'📝 Note Taker',c:'badge-purple'});const badgeEl=document.getElementById('profileBadges');if(badgeEl)badgeEl.innerHTML=badges.length?badges.map(b=>`<span class="badge ${b.c}">${b.t}</span>`).join(''):'<span style="font-size:.75rem;color:var(--muted)">Complete tasks to earn badges!</span>';const ps=document.getElementById('profileStats');if(ps)ps.innerHTML=[[gpa!==null?precise(gpa):'—','GPA (4dp)','var(--accent)'],[done,'Done','var(--green)'],[tasks.filter(t=>!t.done).length,'Active','var(--gold)'],[notes.length,'Notes','var(--purple)']].map(([n,l,c])=>`<div style="background:var(--card2);border-radius:10px;padding:12px"><div style="font-size:1.4rem;font-weight:800;color:${c}">${n}</div><div style="font-size:.65rem;color:var(--muted);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-top:2px">${l}</div></div>`).join('');const confEl=document.getElementById('confidenceSliders');if(confEl)confEl.innerHTML=Object.entries(SUBJECTS).map(([k,s])=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${s.color}"></div><span style="font-size:.82rem;font-weight:600">${s.short}</span></div><span style="font-size:.75rem;font-family:'JetBrains Mono',monospace;color:var(--accent);font-weight:700" id="cv-${k}">${confidences[k]||5}/10</span></div><input type="range" min="1" max="10" value="${confidences[k]||5}" oninput="document.getElementById('cv-${k}').textContent=this.value+'/10';confidences['${k}']=parseInt(this.value)" style="width:100%"></div>`).join('');studyDNA.forEach(d=>{const btn=document.getElementById('dna-'+d);if(btn)btn.classList.add('active');});}
function saveConfidences(){save('flux_conf',confidences);const b=event?.target;if(b){b.textContent='✓ Saved';setTimeout(()=>b.textContent='Save',1500);}}

// ══ THEMES ══
function themeDark(){document.body.className='';localStorage.setItem('flux_theme','dark');}
function themeCrimson(){document.body.className='crimson';localStorage.setItem('flux_theme','crimson');}
function themeFocus(){document.body.className='focus';localStorage.setItem('flux_theme','focus');}
function themeSepia(){document.body.className='sepia';localStorage.setItem('flux_theme','sepia');}
function setAccent(hex,rgb,el){document.documentElement.style.setProperty('--accent',hex);document.documentElement.style.setProperty('--accent-rgb',rgb);localStorage.setItem('flux_accent',hex);localStorage.setItem('flux_accent_rgb',rgb);document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));if(el)el.classList.add('active');}
function applyCustomColor(){const hex=document.getElementById('customColor').value;const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);setAccent(hex,`${r},${g},${b}`,null);}
function loadTheme(){const t=localStorage.getItem('flux_theme');if(t==='crimson')themeCrimson();else if(t==='focus')themeFocus();else if(t==='sepia')themeSepia();const a=localStorage.getItem('flux_accent'),r=localStorage.getItem('flux_accent_rgb');if(a)document.documentElement.style.setProperty('--accent',a);if(r)document.documentElement.style.setProperty('--accent-rgb',r);}

// ══ SETTINGS ══
function switchStab(id,el){document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.spane').forEach(p=>p.classList.remove('active'));el.classList.add('active');document.getElementById('spane-'+id).classList.add('active');}
function toggleSetting(k,el){settings[k]=!settings[k];el.classList.toggle('on',settings[k]);save('flux_settings',settings);}
function saveDND(){settings.dndStart=document.getElementById('dndStart').value;settings.dndEnd=document.getElementById('dndEnd').value;save('flux_settings',settings);const b=event?.target;if(b){b.textContent='✓';setTimeout(()=>b.textContent='Save',1500);}}
function saveDailyGoal(){settings.dailyGoalHrs=parseFloat(document.getElementById('dailyGoalHrs').value)||2;save('flux_settings',settings);const done=tMins/60,goal=settings.dailyGoalHrs;const el=document.getElementById('dailyGoalStatus');if(el)el.textContent=done>=goal?`✓ Goal reached! (${done.toFixed(1)}h / ${goal}h)`:`Progress: ${done.toFixed(1)}h / ${goal}h`;}
function loadSettingsUI(){const pt=document.getElementById('panicToggle');if(pt)pt.classList.toggle('on',settings.panic!==false);const qt=document.getElementById('quietToggle');if(qt)qt.classList.toggle('on',settings.quiet!==false);const ds=document.getElementById('dndStart');if(ds)ds.value=settings.dndStart||'07:50';const de=document.getElementById('dndEnd');if(de)de.value=settings.dndEnd||'14:30';const dg=document.getElementById('dailyGoalHrs');if(dg)dg.value=settings.dailyGoalHrs||2;}
function renderNoHWList(){const el=document.getElementById('noHWList');if(!el)return;const sorted=[...noHomeworkDays].sort();const groups=[];let rs=null,rp=null;const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});sorted.forEach(d=>{if(!rs){rs=d;rp=d;}else{const prev=new Date(rp+'T12:00:00');prev.setDate(prev.getDate()+1);if(prev.toISOString().slice(0,10)===d)rp=d;else{groups.push(rs===rp?fmt(rs):fmt(rs)+' – '+fmt(rp));rs=d;rp=d;}}});if(rs)groups.push(rs===rp?fmt(rs):fmt(rs)+' – '+fmt(rp));el.innerHTML=groups.map(g=>`<div>📵 ${g}</div>`).join('');}
function exportData(){const data={tasks,grades,notes:notes.map(n=>({...n,body:strip(n.body)})),habits,goals,colleges,moodHistory,schoolInfo,classes,settings,exportDate:new Date().toISOString()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='flux-data.json';a.click();URL.revokeObjectURL(url);}
function exportToICal(){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Flux IA East//EN'];tasks.filter(t=>t.date&&!t.done).forEach(t=>{const d=t.date.replace(/-/g,'');lines.push('BEGIN:VEVENT','DTSTART;VALUE=DATE:'+d,'SUMMARY:'+t.name,'END:VEVENT');});lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='flux.ics';a.click();URL.revokeObjectURL(url);}
function clearCache(){if(!confirm('Clear all local data?'))return;const keep=['flux_settings','flux_accent','flux_accent_rgb','flux_theme','profile','flux_user_name'];Object.keys(localStorage).forEach(k=>{if(!keep.includes(k))localStorage.removeItem(k);});tasks=[];grades={};notes=[];habits=[];goals=[];colleges=[];moodHistory=[];renderStats();renderTasks();}

// ══ AI ══
function fmtAI(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^### (.+)$/gm,'<strong style="display:block;margin-top:8px;margin-bottom:2px">$1</strong>').replace(/^- (.+)$/gm,'<li style="margin-left:14px;margin-bottom:3px">$1</li>').replace(/Q:\s*(.+)/g,'<strong style="color:var(--accent)">Q:</strong> $1').replace(/A:\s*(.+)/g,'<strong style="color:var(--green)">A:</strong> $1').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');}
function appendMsg(role,content,isThink){const wrap=document.getElementById('aiMsgs');if(!wrap)return document.createElement('div');const div=document.createElement('div');div.className='ai-msg '+role;const isBot=role==='bot';if(isThink){div.id='aiThink';div.innerHTML='<div class="ai-av bot">✦</div><div class="ai-bub bot"><div class="ai-think"><span></span><span></span><span></span></div></div>';}else{const f=isBot?fmtAI(content):esc(content);const init=(localStorage.getItem('flux_user_name')||'U').charAt(0).toUpperCase();div.innerHTML=`<div class="ai-av ${isBot?'bot':'me'}">${isBot?'✦':init}</div><div class="ai-bub ${isBot?'bot':'user'}">${f}</div>`;}wrap.appendChild(div);div.scrollIntoView({behavior:'smooth',block:'end'});return div;}
function renderAISugs(){const el=document.getElementById('aiSugs');if(!el)return;el.innerHTML='';["What's due this week?","Make me a study plan","Create Chemistry flashcards","Explain this Physics concept","Help with my essay outline","Quiz me on Math 3","What should I work on now?","Generate a 3-day exam prep plan"].forEach(s=>{const btn=document.createElement('button');btn.className='ai-sug';btn.textContent=s;btn.onclick=()=>{document.getElementById('aiInput').value=s;sendAI();};el.appendChild(btn);});}
function handleAIImg(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{aiPendingImg=e.target.result;const prev=document.getElementById('aiImgPreview');if(prev){prev.style.display='block';prev.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.2);border-radius:8px"><img src="${aiPendingImg}" style="width:44px;height:44px;object-fit:cover;border-radius:6px"><div style="flex:1;font-size:.78rem;font-weight:600">${file.name}</div><button onclick="aiPendingImg=null;this.parentElement.parentElement.style.display='none'" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0">✕</button></div>`;}};reader.readAsDataURL(file);}
function buildAIPrompt(){const ctx=refreshAIContext();const name=localStorage.getItem('flux_user_name')||'Student';const now=new Date();now.setHours(0,0,0,0);const ab=AB_MAP[todayStr()];const gpa=calcGPA(grades);const mood=moodHistory.slice(-1)[0];const fmt=t=>{const due=t.date?new Date(t.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'no date';const over=t.date&&new Date(t.date+'T00:00:00')<now?' OVERDUE':'';const np=t.date&&isBreak(t.date)?' [NO-HW]':'';const s=SUBJECTS[t.subject];return`- [${(t.priority||'med').toUpperCase()}|${s?s.short:t.subject||'—'}|${t.type||'hw'}|Due ${due}${over}${np}]: ${t.name}`;};return`You are Flux AI — a brilliant, warm AI tutor in Flux, a school planner for IB MYP students at IA East (International Academy East, Troy MI).
Student: ${name} · 10th Grade · MYP Program · Today: ${TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · ${ab||'?'} Day
${mood?`Mood: ${mood.mood}/5, Stress: ${mood.stress}/10, Sleep: ${mood.sleep}h`:''}
Recent (7d): ${ctx.recent.length?ctx.recent.map(fmt).join(' | '):'None'}
Upcoming (14d): ${ctx.upcoming.length?ctx.upcoming.map(fmt).join(' | '):'None'}
Active tasks: ${tasks.filter(t=>!t.done).slice(0,20).map(fmt).join(' | ')||'None'}
${Object.keys(grades).length?`Grades: ${Object.entries(grades).map(([k,v])=>k+': '+v).join(', ')} | GPA: ${gpa!==null?precise(gpa):'—'}`:''}
Physics: always g=10 m/s². GPA: 4dp always. Be warm, call by name.
TASK ACTIONS:
\`\`\`actions
[{"action":"add_task","name":"...","priority":"high","date":"YYYY-MM-DD","type":"test","subject":"CHE"}]
\`\`\``;}
function execActions(reply){const match=reply.match(/```actions\s*([\s\S]*?)```/);if(!match)return null;let actions;try{actions=JSON.parse(match[1].trim());}catch(e){return null;}if(!Array.isArray(actions))return null;let results=[],changed=false;actions.forEach(a=>{if(a.action==='add_task'){const t={id:Date.now()+Math.random(),name:a.name||'Task',subject:a.subject||'',priority:a.priority||'med',date:a.date||'',type:a.type||'hw',done:false,rescheduled:0,createdAt:Date.now()};t.urgencyScore=calcUrgency(t);tasks.unshift(t);results.push('✓ Added: '+a.name);changed=true;}else if(a.action==='delete_done'){const c=tasks.filter(t=>t.done).length;tasks=tasks.filter(t=>!t.done);results.push('✓ Removed '+c+' done tasks');changed=true;}else if(a.action==='mark_done'){const t=tasks.find(x=>x.name?.toLowerCase().includes((a.name||'').toLowerCase()));if(t){t.done=true;results.push('✓ Done: '+t.name);changed=true;}}});if(changed){save('tasks',tasks);renderStats();renderTasks();renderCalendar();renderCountdown();}return results.length?`<div style="padding:8px 10px;background:rgba(var(--accent-rgb),.08);border-radius:8px;font-size:.8rem;border:1px solid rgba(var(--accent-rgb),.2)">${results.join('<br>')}</div>`:null;}
async function sendAI(){const input=document.getElementById('aiInput'),btn=document.getElementById('aiSendBtn');if(!input||!btn)return;const text=input.value.trim();if(!text&&!aiPendingImg)return;if(btn.disabled)return;document.getElementById('aiSugs').style.display='none';appendMsg('user',text||'📷 Analyze image');let msgContent=text;if(aiPendingImg){msgContent=text||'Please analyze this image.';aiPendingImg=null;const prev=document.getElementById('aiImgPreview');if(prev)prev.style.display='none';}aiHistory.push({role:'user',content:msgContent});input.value='';input.style.height='auto';btn.disabled=true;const thinkEl=appendMsg('bot','',true);try{const res=await fetch(API.ai,{method:'POST',headers:API_HEADERS,body:JSON.stringify({system:buildAIPrompt(),messages:aiHistory.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:JSON.stringify(m.content)}))})});if(!res.ok){const err=await res.json().catch(()=>({error:'Unknown error'}));throw new Error(err.error||'HTTP '+res.status);}const data=await res.json();const reply=data.content?.[0]?.text||"I didn't get a response — try again.";thinkEl.remove();const ar=execActions(reply);const clean=reply.replace(/```actions[\s\S]*?```/g,'').trim();appendMsg('bot',clean+(ar?'\n\n'+ar:''));aiHistory.push({role:'assistant',content:reply});if(aiHistory.length>24)aiHistory=aiHistory.slice(-24);}catch(err){thinkEl.remove();appendMsg('bot','Something went wrong: '+err.message);}btn.disabled=false;input.focus();}

// ══ SUPABASE SYNC ══
// All user data stored in one row per user in a `user_data` table.
// Schema: id (uuid, PK, = auth.uid()), data (jsonb), updated_at (timestamptz)
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
    // Merge: cloud wins for all keys
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
    // Re-render everything
    renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();renderProfile();renderGradeInputs();renderGradeOverview();renderNotesList();renderHabitList();renderGoalsList();renderCollegeList();renderMoodHistory();renderSchool();updateTStats();
  }catch(e){console.error('Sync from cloud error',e);setSyncStatus('offline');}
}

// Throttled per-key sync — called after each data mutation when signed in
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
  document.getElementById('onboarding').classList.add('visible');
  renderObProgress();
  showObStep(1);
  // Personalise done step with name if already known
  const p=load('profile',{});
  if(p.name){const t=document.getElementById('obDoneTitle');if(t)t.textContent="You're all set, "+p.name+"!";}
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
  if(n===4){const p=load('profile',{});const t=document.getElementById('obDoneTitle');if(t&&p.name)t.textContent="You're all set, "+p.name.split(' ')[0]+"!";}
}

function selectObChip(el,key,val){
  el.closest('.ob-chips').querySelectorAll('.ob-chip').forEach(c=>c.classList.remove('active'));
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
  save('flux_onboarded',true);
  document.getElementById('onboarding').classList.remove('visible');
  document.getElementById('app').classList.add('visible');
  spawnConfetti();
  renderProfile();renderSchool();
  syncToCloud();
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
    const prev=document.getElementById('obImgPreview');
    if(prev){prev.style.display='block';prev.src=e.target.result;}
    const zone=document.getElementById('obUploadZone');if(zone)zone.classList.add('has-img');
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
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({imageBase64:base64,mimeType:mime,
        prompt:'This is a student class schedule. Extract every class and return ONLY a JSON array: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods sequentially if not shown. Empty string for missing fields. ONLY the JSON array.'})
    });
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
// IMPORTANT: The redirect URL must match EXACTLY what's in Supabase Dashboard
// Authentication > URL Configuration > Redirect URLs
// Add both: https://azferplanner.vercel.app/ AND http://localhost:3000/
function getRedirectURL(){
  return window.location.origin + '/';
}

async function signInWithGoogle(){
  const sb=getSB();
  if(!sb){alert('Auth not available — please refresh the page.');return;}
  try{
    const{error}=await sb.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo:getRedirectURL(),
        queryParams:{access_type:'offline',prompt:'select_account'}
      }
    });
    if(error)throw error;
  }catch(e){
    console.error('OAuth error:',e);
    alert('Sign in error: '+e.message+'\n\nFix: Go to Supabase Dashboard > Authentication > URL Configuration and add:\n'+getRedirectURL());
  }
}

async function signOut(){
  if(!confirm('Sign out?'))return;
  const sb=getSB();if(sb)await sb.auth.signOut();
  handleSignedOut();
}

function skipLogin(){
  document.getElementById('loginScreen').classList.remove('visible');
  document.getElementById('onboarding').style.display='none';
  document.getElementById('app').classList.add('visible');
  setSyncStatus('offline');
}

async function initAuth(){
  const sb=getSB();if(!sb)return;
  const{data:{session}}=await sb.auth.getSession();
  if(session?.user)await handleSignedIn(session.user);
  else showLoginOrApp();
  sb.auth.onAuthStateChange(async(_,s)=>{if(s?.user)await handleSignedIn(s.user);else handleSignedOut();});
}

function showLoginOrApp(){
  const onboarded=load('flux_onboarded',false);
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  if(onboarded||hasData){
    document.getElementById('loginScreen').classList.remove('visible');
    document.getElementById('app').classList.add('visible');
    setSyncStatus('offline');
  }else{
    document.getElementById('loginScreen').classList.add('visible');
  }
}

async function handleSignedIn(user){
  currentUser=user;
  document.getElementById('loginScreen').classList.remove('visible');
  const name=user.user_metadata?.full_name||user.email.split('@')[0];
  const firstName=name.split(' ')[0];
  if(!load('profile',{}).name)localStorage.setItem('flux_user_name',firstName);
  _updateUserUI(user,name);
  setSyncStatus('syncing');
  await syncFromCloud();
  const hasData=tasks.length>0||notes.length>0||Object.keys(grades).length>0||classes.length>0;
  const shouldOnboard=!load('flux_onboarded',false)&&!hasData;
  if(shouldOnboard)showOnboarding();
  else{document.getElementById('onboarding').style.display='none';document.getElementById('app').classList.add('visible');}
  setInterval(syncToCloud,5*60*1000);
}

function _updateUserUI(user,name){
  const firstName=(name||user.email.split('@')[0]).split(' ')[0];
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
  currentUser=null;
  const asd=document.getElementById('accountSignedOut');if(asd)asd.style.display='block';
  const asi=document.getElementById('accountSignedIn');if(asi)asi.style.display='none';
  const sn=document.getElementById('sidebarName');if(sn)sn.textContent='Not signed in';
  const se=document.getElementById('sidebarEmail');if(se)se.textContent='';
  setSyncStatus('offline');
  document.getElementById('app').classList.remove('visible');
  document.getElementById('loginScreen').classList.add('visible');
}

// ══ INIT ══
(function init(){
  loadTheme();
  loadSettingsUI();
  const sb=document.getElementById('sidebar');if(sb&&sidebarCollapsed)sb.classList.add('collapsed');
  document.getElementById('datePill').textContent=TODAY.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const ab=AB_MAP[todayStr()];
  if(ab){const p=document.getElementById('abPill');p.textContent=ab+' Day';p.style.display='block';p.style.background=ab==='A'?'rgba(99,102,241,.15)':('rgba(16,217,160,.15)');p.style.color=ab==='A'?'var(--accent)':('var(--green)');p.style.border='1px solid '+(ab==='A'?'rgba(99,102,241,.3)':('rgba(16,217,160,.3)'));}
  const td=document.getElementById('taskDate');if(td)td.valueAsDate=TODAY;
  setEnergy(document.getElementById('energySlider').value);
  renderStats();renderTasks();renderCalendar();renderCountdown();renderSmartSug();
  renderProfile();renderGradeInputs();renderGradeOverview();renderWeightedRows();
  renderNotesList();renderHabitList();renderGoalsList();renderCollegeList();
  renderMoodHistory();renderAffirmation();renderAISugs();renderSchool();
  renderSubjectBudget();renderFocusHeatmap();
  updateTDisplay();renderTDots();updateTStats();
  checkAllPanic();setInterval(checkAllPanic,60000);
  const shownSplash=sessionStorage.getItem('flux_splash_shown');
  if(!shownSplash){sessionStorage.setItem('flux_splash_shown','1');runSplash(()=>initAuth());}
  else{document.getElementById('splash').style.display='none';initAuth();}
})();

// ══ IMAGE IMPORT FEATURES ══

// Generic Gemini vision call
async function callGemini(imageBase64, mimeType, prompt) {
  const res = await fetch(API.gemini, {
    method: 'POST', headers: API_HEADERS,
    body: JSON.stringify({ imageBase64, mimeType, prompt })
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||'Gemini error'); }
  return (await res.json()).text || '';
}

// Import grades from photo
async function importGradesFromPhoto(event) {
  const file = event.target.files[0]; if (!file) return;
  const el = document.getElementById('gradesImportResult');
  el.style.display = 'block';
  el.innerHTML = '<div style="color:var(--muted2);font-size:.82rem;font-family:JetBrains Mono,monospace">📷 Reading grades with Gemini...</div>';
  try {
    const base64 = await fileToBase64(file);
    const txt = await callGemini(base64, file.type,
      'This is a student gradebook or report card. Extract every subject and its grade percentage. Return ONLY a JSON object like {"Chemistry":92,"Math 3":88}. Use the exact subject names shown. Return ONLY the JSON object.');
    const clean = txt.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    let imported = 0;
    Object.entries(parsed).forEach(([k,v]) => { if(k&&v!==undefined){grades[k]=String(v);imported++;} });
    save('flux_grades', grades);
    renderGradeInputs(); renderGradeOverview(); updateGPADisplay();
    el.innerHTML = `<div style="color:var(--green);font-size:.82rem">✓ Imported ${imported} grades! Review and save below.</div>`;
    syncKey('grades', grades);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:.82rem">Could not read grades: ${e.message}</div>`;
  }
}

// Import note content from photo (assignment guide, worksheet, etc.)
async function importNoteFromPhoto(event) {
  const file = event.target.files[0]; if (!file) return;
  const resEl = document.getElementById('aiNoteResult');
  resEl.style.display = 'block';
  resEl.innerHTML = '<div style="color:var(--muted2);font-size:.82rem">📷 Reading image with Gemini...</div>';
  try {
    const base64 = await fileToBase64(file);
    const txt = await callGemini(base64, file.type,
      'This is a student assignment, worksheet, or lesson guide. Extract all the text and content from it. Format it clearly with headers and bullet points where appropriate. Preserve all important details like questions, instructions, and due dates.');
    const editor = document.getElementById('noteEditor');
    if (editor) {
      const existing = editor.innerHTML;
      editor.innerHTML = existing + (existing ? '<hr style="border-color:var(--border);margin:12px 0">' : '') + '<p>' + fmtAI(txt) + '</p>';
    }
    resEl.innerHTML = '<div style="color:var(--green);font-size:.82rem">✓ Content added to note. Save when ready.</div>';
  } catch(e) {
    resEl.innerHTML = `<div style="color:var(--red);font-size:.82rem">Could not read image: ${e.message}</div>`;
  }
}

// Import schedule from photo (used in onboarding + school tab)
async function importScheduleFromPhoto(event, resultElId) {
  const file = event.target.files[0]; if (!file) return;
  const resEl = document.getElementById(resultElId||'schoolImgResult');
  if (resEl) { resEl.style.display='block'; resEl.innerHTML='<div style="color:var(--muted2);font-size:.82rem;font-family:JetBrains Mono,monospace">📷 Reading schedule with Gemini...</div>'; }
  try {
    const base64 = await fileToBase64(file);
    const txt = await callGemini(base64, file.type,
      'This is a student class schedule. Extract every class/period and return ONLY a JSON array: [{"period":1,"name":"Chemistry","teacher":"Mr. Smith","room":"204"}]. Number periods 1,2,3 if not shown. Empty string for missing fields. ONLY the JSON array.');
    const clean = txt.replace(/```json|```/g,'').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : clean);
    classes = parsed.map((c,i) => ({id:Date.now()+i, period:c.period||i+1, name:c.name||'Class '+(i+1), teacher:c.teacher||'', room:c.room||''}));
    save('flux_classes', classes);
    renderSchool();
    if (resEl) resEl.innerHTML = `<div style="color:var(--green);font-size:.82rem">✓ Imported ${classes.length} classes!</div>`;
    syncKey('classes', classes);
  } catch(e) {
    if (resEl) resEl.innerHTML = `<div style="color:var(--red);font-size:.82rem">Could not read schedule: ${e.message}</div>`;
  }
}

// Utility: file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ══ CANVAS SYNC ══
let canvasToken = load('flux_canvas_token', '');
let canvasUrl = load('flux_canvas_url', '');

function saveCanvasConfig() {
  canvasToken = document.getElementById('canvasToken')?.value.trim() || '';
  canvasUrl = document.getElementById('canvasUrl')?.value.trim() || '';
  save('flux_canvas_token', canvasToken);
  save('flux_canvas_url', canvasUrl);
  const b = event?.target; if(b){b.textContent='✓ Saved';setTimeout(()=>b.textContent='Save',1500);}
  renderCanvasStatus();
}

function renderCanvasStatus() {
  const el = document.getElementById('canvasStatus'); if (!el) return;
  if (canvasToken && canvasUrl) {
    el.innerHTML = `<div class="sync-badge synced">✓ Canvas connected</div>`;
  } else {
    el.innerHTML = `<div class="sync-badge offline">○ Not connected</div>`;
  }
}

async function syncCanvas() {
  if (!canvasToken || !canvasUrl) { alert('Enter your Canvas URL and token first.'); return; }
  const btn = event?.target; if(btn){btn.textContent='Syncing...';btn.disabled=true;}
  try {
    const base = canvasUrl.replace(/\/+$/, '');
    const res = await fetch(`${API.canvas}?url=${encodeURIComponent(base+'/api/v1/courses?enrollment_state=active&per_page=20')}&token=${encodeURIComponent(canvasToken)}`, { headers: API_HEADERS });
    const courses = await res.json();
    if (!Array.isArray(courses)) throw new Error('Invalid response from Canvas');
    let added = 0;
    for (const course of courses.slice(0, 10)) {
      const aRes = await fetch(`${API.canvas}?url=${encodeURIComponent(base+'/api/v1/courses/'+course.id+'/assignments?per_page=30&order_by=due_at')}&token=${encodeURIComponent(canvasToken)}`, { headers: API_HEADERS });
      const assignments = await aRes.json();
      if (!Array.isArray(assignments)) continue;
      assignments.forEach(a => {
        if (!a.due_at) return;
        const due = a.due_at.slice(0,10);
        const name = a.name || 'Assignment';
        if (!tasks.find(t => t.name === name && t.date === due)) {
          tasks.unshift({ id: Date.now()+Math.random(), name, date: due, subject: '', priority: 'med', type: 'hw', done: false, rescheduled: 0, createdAt: Date.now(), urgencyScore: 0 });
          added++;
        }
      });
    }
    save('tasks', tasks); renderStats(); renderTasks(); renderCountdown();
    if(btn){btn.textContent=`✓ Imported ${added} tasks`;setTimeout(()=>{btn.textContent='Sync Canvas';btn.disabled=false;},2000);}
    syncKey('tasks', tasks);
  } catch(e) {
    if(btn){btn.textContent='Sync failed';btn.disabled=false;}
    alert('Canvas sync error: '+e.message);
  }
}

// ══ GMAIL PANEL ══
// Gmail uses Google OAuth (same token from Supabase Google login)
// We read emails via Gmail API using the user's access token
let gmailEmails = [];
let gmailToken = null;

async function loadGmail() {
  const el = document.getElementById('gmailList');
  if (!el) return;
  // Get access token from Supabase session
  const sb = getSB(); if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.provider_token) {
    el.innerHTML = `<div class="empty" style="padding:24px">
      <div style="font-size:1.5rem;margin-bottom:10px">📧</div>
      <div style="font-size:.88rem;font-weight:600;margin-bottom:6px">Connect Gmail</div>
      <div style="font-size:.78rem;color:var(--muted2);margin-bottom:16px">Sign in with Google to view your school emails here.</div>
      <button onclick="signInWithGoogleGmail()" style="padding:10px 20px">Sign in with Google</button>
    </div>`;
    return;
  }
  gmailToken = session.provider_token;
  el.innerHTML = '<div style="color:var(--muted2);font-size:.82rem;padding:16px;font-family:JetBrains Mono,monospace">Loading emails...</div>';
  try {
    // Fetch recent emails
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox', {
      headers: { 'Authorization': `Bearer ${gmailToken}` }
    });
    if (!res.ok) throw new Error('Gmail API error '+res.status);
    const data = await res.json();
    if (!data.messages?.length) { el.innerHTML = '<div class="empty">No emails found.</div>'; return; }
    // Fetch details for each
    gmailEmails = await Promise.all(data.messages.map(async m => {
      const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: { 'Authorization': `Bearer ${gmailToken}` }
      });
      const d = await detail.json();
      const headers = d.payload?.headers || [];
      const get = name => headers.find(h => h.name===name)?.value || '';
      return { id: m.id, subject: get('Subject'), from: get('From'), date: get('Date'), snippet: d.snippet || '' };
    }));
    renderGmailList();
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:.82rem;padding:16px">${e.message}<br><br><button onclick="signInWithGoogleGmail()" style="padding:8px 16px;font-size:.8rem">Re-connect Gmail</button></div>`;
  }
}

async function signInWithGoogleGmail() {
  const sb = getSB(); if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/',
      scopes: 'https://www.googleapis.com/auth/gmail.readonly',
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
}

function renderGmailList() {
  const el = document.getElementById('gmailList'); if (!el) return;
  if (!gmailEmails.length) { el.innerHTML = '<div class="empty">No emails.</div>'; return; }
  el.innerHTML = gmailEmails.map(e => `
    <div class="gmail-item" onclick="expandEmail('${e.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.subject||'(no subject)')}</div>
          <div style="font-size:.72rem;color:var(--muted2);font-family:'JetBrains Mono',monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.from)}</div>
          <div style="font-size:.78rem;color:var(--muted2);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(e.snippet)}</div>
        </div>
        <button onclick="event.stopPropagation();addEmailAsTask('${e.id}')" style="padding:5px 10px;font-size:.72rem;white-space:nowrap;background:rgba(var(--accent-rgb),.15);border:1px solid rgba(var(--accent-rgb),.3);color:var(--accent)">+ Task</button>
      </div>
    </div>`).join('');
}

function addEmailAsTask(id) {
  const email = gmailEmails.find(e => e.id === id); if (!email) return;
  const task = {
    id: Date.now(), name: email.subject || 'Email task',
    date: '', subject: '', priority: 'med', type: 'hw',
    notes: `From: ${email.from}\n\n${email.snippet}`,
    done: false, rescheduled: 0, createdAt: Date.now()
  };
  task.urgencyScore = calcUrgency(task);
  tasks.unshift(task); save('tasks', tasks);
  renderStats(); renderTasks();
  syncKey('tasks', tasks);
  // Show feedback
  const btn = event?.target; if(btn){btn.textContent='✓ Added';btn.style.color='var(--green)';setTimeout(()=>{btn.textContent='+ Task';btn.style.color='var(--accent)';},2000);}
}

function renderGmail() {
  loadGmail();
}
