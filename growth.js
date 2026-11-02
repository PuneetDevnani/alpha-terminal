/* Growth library and event planner. Uses the same authenticated storage as the journal. */
let learningLibrary={sections:[{id:'forex',name:'Forex',categories:[]},{id:'equity',name:'Equity',categories:[]},{id:'indian',name:'Indian Market',categories:[]},{id:'fundamentals',name:'Fundamentals',categories:[]}],videos:[]};
let newsEvents=[], learningView='watchlist', learningQuery='', learningCategory='', learningStatus='', newsView='dashboard', newsQuery='', newsMarket='', newsImpact='', newsRange='upcoming',newsOnlyStarred=false;
const selectedVideos=new Set();
function hx(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uid(){return crypto.randomUUID();}
function safeWebUrl(raw){try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function youtubeId(raw){
  try{
    const u=new URL(raw), host=u.hostname.toLowerCase().replace(/^www\./,'');
    let id='';
    if(host==='youtu.be') id=u.pathname.split('/')[1];
    else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) id=u.pathname==='/watch'?u.searchParams.get('v'): /^(embed|shorts|live)$/.test(u.pathname.split('/')[1])?u.pathname.split('/')[2]:'';
    return /^[\w-]{11}$/.test(id||'')?id:null;
  }catch{return null;}
}
function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadGrowthData(){
  const library=await sGet('learning_library');
  if(library && Array.isArray(library.sections)&&Array.isArray(library.videos)) learningLibrary=library;
  const events=await sGet('news_events'); newsEvents=Array.isArray(events)?events:[];
  const bookmarks=await sGet('news_bookmarks');newsBookmarks=Array.isArray(bookmarks)?bookmarks:[];
  renderLearning();renderNews();await retryCloudSync();
}
function featureDialog(title,body){
  let d=document.getElementById('featureDialog');if(!d){d=document.createElement('dialog');d.id='featureDialog';d.className='at-dialog';document.body.append(d);}
  if(d.open)d.close();
  d.innerHTML='<h2>'+hx(title)+'</h2><form>'+body+'<p class="feature-error" role="alert"></p><div class="feature-toolbar"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>';
  d.querySelector('[data-close]').onclick=()=>d.close();d.showModal();return d;
}
function formSave(dialog,handler){dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await handler(new FormData(e.target));dialog.close();}catch(err){dialog.querySelector('.feature-error').textContent=err.message||String(err);}finally{btn.disabled=false;}};}
function sectionOptions(value='',empty=true){return (empty?'<option value="">Uncategorized</option>':'')+learningLibrary.sections.map(s=>'<option value="'+hx(s.id)+'" '+(s.id===value?'selected':'')+'>'+hx(s.name)+'</option>').join('');}
function categoryOptions(section,value=''){return '<option value="">No subcategory</option>'+(learningLibrary.sections.find(s=>s.id===section)?.categories||[]).map(c=>'<option '+(c===value?'selected':'')+'>'+hx(c)+'</option>').join('');}
function bindCategory(dialog){const section=dialog.querySelector('[name=section]'),category=dialog.querySelector('[name=category]');section.onchange=()=>category.innerHTML=categoryOptions(section.value);}
function editLearningSection(){
  const d=featureDialog('Add section','<label>Section name<input name="name" required maxlength="80" placeholder="e.g. Risk management"></label>');
  formSave(d,async f=>{const name=f.get('name').trim();if(!name)throw Error('Enter a section name.');if(learningLibrary.sections.some(s=>s.name.toLowerCase()===name.toLowerCase()))throw Error('That section already exists.');const next=structuredClone(learningLibrary);next.sections.push({id:uid(),name,categories:[]});await sSet('learning_library',next);learningLibrary=next;renderLearning();});
}
function addLearningCategory(){
  const d=featureDialog('Add subcategory','<label>Section<select name="section" required>'+sectionOptions(learningView,false)+'</select></label><label>Subcategory name<input name="name" required maxlength="80" placeholder="e.g. Market structure"></label>');
  formSave(d,async f=>{const next=structuredClone(learningLibrary),section=next.sections.find(s=>s.id===f.get('section')),name=f.get('name').trim();if(!section||!name)throw Error('Choose a section and enter a name.');if(section.categories.some(c=>c.toLowerCase()===name.toLowerCase()))throw Error('This subcategory already exists.');section.categories.push(name);await sSet('learning_library',next);learningLibrary=next;renderLearning();});
}
function editLearningVideo(id){
  const v=learningLibrary.videos.find(v=>v.id===id)||{title:'',url:'',section:learningLibrary.sections.some(s=>s.id===learningView)?learningView:'',category:'',notes:'',watchlist:true,watched:false};
  const d=featureDialog(id?'Edit learning link':'Add learning link',`<label>Video or resource URL<input name="url" type="url" required value="${hx(v.url)}" placeholder="https://www.youtube.com/watch?v=…"></label><label>Title<input name="title" required maxlength="240" value="${hx(v.title)}" placeholder="What will you learn?"></label><button type="button" class="btn ghost" data-preview>Preview YouTube link / fill title</button><div data-preview-host></div><div class="form-grid"><label>Section<select name="section">${sectionOptions(v.section)}</select></label><label>Subcategory<select name="category">${categoryOptions(v.section,v.category)}</select></label></div><label>Learning notes<textarea name="notes" maxlength="10000">${hx(v.notes)}</textarea></label><label><input type="checkbox" name="watchlist" ${v.watchlist?'checked':''}> Keep in watchlist</label><label><input type="checkbox" name="watched" ${v.watched?'checked':''}> Watched / completed</label>`);
  bindCategory(d);
  d.querySelector('[data-preview]').onclick=async()=>{
    const url=d.querySelector('[name=url]').value,video=youtubeId(url),host=d.querySelector('[data-preview-host]');
    if(!video){host.textContent='A valid YouTube video link is required for a thumbnail and player. Other web links can still be saved.';return;}
    host.innerHTML='<img style="width:100%;margin-top:12px;border-radius:8px" alt="YouTube video thumbnail" src="https://i.ytimg.com/vi/'+video+'/hqdefault.jpg">';
    try{const response=await fetch('https://www.youtube.com/oembed?url='+encodeURIComponent('https://www.youtube.com/watch?v='+video)+'&format=json',{signal:AbortSignal.timeout(5000)});if(response.ok){const metadata=await response.json();if(!d.querySelector('[name=title]').value)d.querySelector('[name=title]').value=metadata.title||'';}}catch{/* A title can always be entered manually. */}
  };
  formSave(d,async f=>{
    const url=safeWebUrl(f.get('url')),title=f.get('title').trim();if(!url||!title)throw Error('Enter a valid http(s) link and a title.');
    const video=youtubeId(url),canonical=video?'https://www.youtube.com/watch?v='+video:url;
    if(learningLibrary.videos.some(x=>x.id!==id&&x.url===canonical))throw Error('This link is already in your library.');
    const next=structuredClone(learningLibrary),record={...v,id:id||uid(),url:canonical,title,section:f.get('section'),category:f.get('category'),notes:f.get('notes').trim(),watchlist:f.has('watchlist'),watched:f.has('watched'),createdAt:v.createdAt||new Date().toISOString()};
    if(id)next.videos[next.videos.findIndex(x=>x.id===id)]=record;else next.videos.unshift(record);
    await sSet('learning_library',next);learningLibrary=next;renderLearning();
  });
}
function bulkLearningLinks(){
  const d=featureDialog('Add videos to watchlist','<p class="feature-summary">Paste one YouTube video or web link per line. Categorize the saved videos whenever you are ready.</p><label>Links<textarea name="links" required placeholder="https://youtu.be/…\nhttps://www.youtube.com/watch?v=…" style="min-height:180px"></textarea></label>');
  formSave(d,async f=>{
    const lines=f.get('links').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),next=structuredClone(learningLibrary);let count=0;
    if(lines.length>200)throw Error('Please add up to 200 links at a time.');
    for(const line of lines){const url=safeWebUrl(line);if(!url)throw Error('Invalid link: '+line);const video=youtubeId(url),canonical=video?'https://www.youtube.com/watch?v='+video:url;if(next.videos.some(v=>v.url===canonical))continue;next.videos.push({id:uid(),url:canonical,title:video?'YouTube · '+video:new URL(url).hostname,section:'',category:'',notes:'',watchlist:true,watched:false,createdAt:new Date().toISOString()});count++;}
    if(!count)throw Error('All these links are already saved.');await sSet('learning_library',next);learningLibrary=next;learningView='watchlist';renderLearning();
  });
}
function categorizeLearning(){
  if(!selectedVideos.size)return;
  const d=featureDialog('Categorize '+selectedVideos.size+' selected links','<label>Section<select name="section">'+sectionOptions()+'</select></label><label>Subcategory<select name="category">'+categoryOptions('')+'</select></label><label><input type="checkbox" name="remove"> Remove selected videos from watchlist</label>');bindCategory(d);
  formSave(d,async f=>{const next=structuredClone(learningLibrary);next.videos.filter(v=>selectedVideos.has(v.id)).forEach(v=>{v.section=f.get('section');v.category=f.get('category');if(f.has('remove'))v.watchlist=false;});await sSet('learning_library',next);learningLibrary=next;selectedVideos.clear();renderLearning();});
}
function renderLearning(){
  const host=document.getElementById('learning');if(!host)return;
  host.innerHTML=`<div class="section-title"><span class="left">YouTube Learning</span><button class="btn" id="addVideo">+ Add link</button></div><p class="feature-summary">Build your trading knowledge, one lesson at a time. Save links now, organize them later.</p><div class="feature-toolbar"><button class="btn ghost" id="bulkVideos">+ Paste watchlist links</button><button class="btn ghost" id="addSection">+ Section</button><button class="btn ghost" id="addCategory">+ Subcategory</button><button class="btn ghost" id="categorizeVideos">Categorize selected (${selectedVideos.size})</button></div><div class="learning-layout"><aside class="learning-sections" id="learningSections"></aside><div><div class="feature-toolbar"><input id="learningSearch" aria-label="Search learning library" placeholder="Search titles, links or notes…" value="${hx(learningQuery)}"><select id="learningCategory" aria-label="Filter subcategory">${categoryOptions(learningView,learningCategory).replace('No subcategory','All subcategories')}</select><select id="learningStatus" aria-label="Watch status"><option value="">All progress</option value="unwatched">To watch</option><option value="watched">Watched</option></select></div><div id="learningResults" class="learning-grid"></div></div></div>`;
  const sections=[{id:'watchlist',name:'Watchlist',count:learningLibrary.videos.filter(v=>v.watchlist).length},{id:'all',name:'All learning',count:learningLibrary.videos.length},...learningLibrary.sections.map(s=>({...s,count:learningLibrary.videos.filter(v=>v.section===s.id).length})),{id:'uncategorized',name:'Uncategorized',count:learningLibrary.videos.filter(v=>!v.section).length}];
  document.getElementById('learningSections').innerHTML=sections.map(s=>'<button class="btn ghost '+(learningView===s.id?'selected':'')+'" data-view="'+hx(s.id)+'">'+hx(s.name)+' <span style="opacity:.6">'+s.count+'</span></button>').join('');
  host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{learningView=b.dataset.view;learningCategory='';selectedVideos.clear();renderLearning();});
  document.getElementById('addVideo').onclick=()=>editLearningVideo();document.getElementById('bulkVideos').onclick=bulkLearningLinks;document.getElementById('addSection').onclick=editLearningSection;document.getElementById('addCategory').onclick=addLearningCategory;document.getElementById('categorizeVideos').onclick=categorizeLearning;
  document.getElementById('learningSearch').oninput=e=>{learningQuery=e.target.value;renderLearningResults();};document.getElementById('learningCategory').onchange=e=>{learningCategory=e.target.value;renderLearningResults();};const status=document.getElementById('learningStatus');status.value=learningStatus;status.onchange=e=>{learningStatus=e.target.value;renderLearningResults();};renderLearningResults();
}
function renderLearningResults(){
  const query=learningQuery.toLowerCase(),videos=learningLibrary.videos.filter(v=>(learningView==='all'||learningView==='watchlist'&&v.watchlist||learningView==='uncategorized'&&!v.section||v.section===learningView)&&(!learningCategory||v.category===learningCategory)&&(!learningStatus||(learningStatus==='watched'?v.watched:!v.watched))&&[v.title,v.url,v.notes].join(' ').toLowerCase().includes(query));
  const host=document.getElementById('learningResults');host.innerHTML=videos.length?videos.map(v=>{
    const video=youtubeId(v.url),section=learningLibrary.sections.find(s=>s.id===v.section)?.name||'Uncategorized';
    return `<article class="learning-card" data-id="${hx(v.id)}">${video?'<img loading="lazy" referrerpolicy="no-referrer" alt="'+hx(v.title)+' thumbnail" src="https://i.ytimg.com/vi/'+video+'/hqdefault.jpg">':''}<div class="learning-card-content"><label class="feature-summary"><input type="checkbox" data-select ${selectedVideos.has(v.id)?'checked':''}> Select</label><div class="learning-tag">${hx(section)}${v.category?' / '+hx(v.category):''} · ${v.watched?'WATCHED':'TO WATCH'}</div><h3>${hx(v.title)}</h3><p class="feature-summary">${hx(v.notes).replace(/\n/g,'<br>')}</p><div class="feature-toolbar">${video?'<button class="btn" data-action="play">▷ Play</button>':''}<a class="btn ghost" href="${hx(safeWebUrl(v.url))}" target="_blank" rel="noopener noreferrer">Open link ↗</a><button class="btn ghost" data-action="edit">Edit / categorize</button><button class="btn ghost" data-action="watched">${v.watched?'Mark unwatched':'Mark watched'}</button><button class="btn ghost" data-action="watchlist">${v.watchlist?'Remove from watchlist':'+ Watchlist'}</button><button class="btn ghost" data-action="delete">Delete</button></div></div></article>`;
  }).join(''):'<div class="feature-empty">No lessons here yet. Add a link or paste videos into your watchlist.</div>';
  host.querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{const id=c.closest('[data-id]').dataset.id;c.checked?selectedVideos.add(id):selectedVideos.delete(id);document.getElementById('categorizeVideos').textContent='Categorize selected ('+selectedVideos.size+')';});
  host.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{
    const id=b.closest('[data-id]').dataset.id,v=learningLibrary.videos.find(v=>v.id===id),action=b.dataset.action;
    if(action==='play'){playLearningVideo(v);return;}if(action==='edit'){editLearningVideo(id);return;}
    if(action==='delete'&&!await confirmFeature('Delete this learning link?'))return;
    b.disabled=true;
    try{const next=structuredClone(learningLibrary),record=next.videos.find(v=>v.id===id);if(action==='delete'){next.videos=next.videos.filter(v=>v.id!==id);selectedVideos.delete(id);}else record[action]=!record[action];await sSet('learning_library',next);learningLibrary=next;renderLearning();}catch(e){alert('Could not save: '+e.message);b.disabled=false;}
  });
}
function playLearningVideo(v){
  let d=document.getElementById('learningPlayer');if(!d){d=document.createElement('dialog');d.id='learningPlayer';d.className='at-dialog video-player';d.addEventListener('close',()=>d.replaceChildren());document.body.append(d);}
  d.innerHTML='<div class="feature-toolbar"><h2 style="flex:1">'+hx(v.title)+'</h2><button class="btn ghost">Close player</button></div><iframe title="'+hx(v.title)+'" src="https://www.youtube-nocookie.com/embed/'+youtubeId(v.url)+'" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><p class="feature-summary">If the creator restricts embedding, <a target="_blank" rel="noopener noreferrer" href="'+hx(safeWebUrl(v.url))+'">watch on YouTube ↗</a>.</p>';
  d.querySelector('button').onclick=()=>d.close();d.showModal();
}
function stopLearningVideo(){document.getElementById('learningPlayer')?.close();}
function istInput(iso){const d=new Date(Date.parse(iso)+330*60000);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,16);}
function istDate(iso){return new Date(iso).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' IST';}
function newsOptions(values,selected){return values.map(v=>'<option '+(v===selected?'selected':'')+'>'+hx(v)+'</option>').join('');}
function editNewsEvent(id){
  const e=newsEvents.find(x=>x.id===id)||{title:'',date:new Date().toISOString(),market:'Forex',currency:'USD',impact:'High',source:'',notes:'',forecast:'',previous:'',actual:'',starred:true};
  const d=featureDialog(id?'Edit important event':'Add important event',`<label>Event name<input name="title" required maxlength="240" value="${hx(e.title)}" placeholder="e.g. US CPI, RBI policy, earnings"></label><div class="form-grid"><label>Date and time (IST)<input name="date" type="datetime-local" required value="${istInput(e.date)}"></label><label>Market<select name="market">${newsOptions(['Forex','Equity','Indian Market','Global'],e.market)}</select></label><label>Currency / symbol<input name="currency" required maxlength="40" value="${hx(e.currency)}" placeholder="USD, INR, NIFTY, AAPL"></label><label>Impact<select name="impact">${newsOptions(['High','Medium','Low'],e.impact)}</select></label><label>Forecast<input name="forecast" maxlength="80" value="${hx(e.forecast)}"></label><label>Previous<input name="previous" maxlength="80" value="${hx(e.previous)}"></label><label>Actual<input name="actual" maxlength="80" value="${hx(e.actual)}"></label></div><label>Source URL (optional)<input name="source" type="url" value="${hx(e.source)}"></label><label>Notes / trading preparation<textarea name="notes" maxlength="10000">${hx(e.notes)}</textarea></label><label><input name="starred" type="checkbox" ${e.starred?'checked':''}> Important / starred</label>`);
  formSave(d,async f=>{
    const title=f.get('title').trim(),time=new Date(f.get('date')+':00+05:30'),source=f.get('source').trim();
    if(!title||Number.isNaN(time.getTime()))throw Error('Enter an event name and a valid date.');if(source&&!safeWebUrl(source))throw Error('Enter a valid http(s) source URL.');
    const record={id:id||uid(),title,date:time.toISOString(),market:f.get('market'),currency:f.get('currency').trim(),impact:f.get('impact'),source:source?safeWebUrl(source):'',notes:f.get('notes').trim(),forecast:f.get('forecast'),previous:f.get('previous'),actual:f.get('actual'),starred:f.has('starred')},next=structuredClone(newsEvents);
    if(id)next[next.findIndex(x=>x.id===id)]=record;else next.push(record);await sSet('news_events',next);newsEvents=next;renderNews();
  });
}
function renderSavedEvents(){
  const content=document.getElementById('eventPlanner');
  content.innerHTML=`<div class="feature-toolbar"><input id="newsSearch" aria-label="Search events" placeholder="Search event, symbol or notes…" value="${hx(newsQuery)}"><select id="newsMarket" aria-label="Filter market"><option value="">All markets</option>${newsOptions(['Forex','Equity','Indian Market','Global'],newsMarket)}</select><select id="newsImpact" aria-label="Filter impact"><option value="">All impacts</option>${newsOptions(['High','Medium','Low'],newsImpact)}</select><select id="newsRange" aria-label="Date range"><option value="upcoming">Upcoming</option><option value="today">Today (IST)</option><option value="week">Next 7 days</option><option value="all">All / past events</option></select><label class="feature-summary"><input id="newsStarred" type="checkbox" ${newsOnlyStarred?'checked':''}> Starred only</label></div><div id="newsResults" class="news-list"></div>`;
  for(const [id,set] of [['newsSearch',v=>newsQuery=v],['newsMarket',v=>newsMarket=v],['newsImpact',v=>newsImpact=v],['newsRange',v=>newsRange=v]]){const el=document.getElementById(id);el.value={newsSearch:newsQuery,newsMarket,newsImpact,newsRange}[id];el.addEventListener(id==='newsSearch'?'input':'change',()=>{set(el.value);renderNewsResults();});}
  document.getElementById('newsStarred').onchange=e=>{newsOnlyStarred=e.target.checked;renderNewsResults();};renderNewsResults();
}
function renderNewsResults(){
  const now=Date.now(),today=istInput(new Date(now).toISOString()).slice(0,10),query=newsQuery.toLowerCase();
  const events=newsEvents.filter(e=>{
    const time=Date.parse(e.date);return (!newsMarket||e.market===newsMarket)&&(!newsImpact||e.impact===newsImpact)&&(!newsOnlyStarred||e.starred)&&[e.title,e.currency,e.notes].join(' ').toLowerCase().includes(query)&&(newsRange==='all'||newsRange==='today'&&istInput(e.date).startsWith(today)||newsRange==='upcoming'&&time>=now||newsRange==='week'&&time>=now&&time<now+7*86400000);
  }).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const host=document.getElementById('newsResults');host.innerHTML=events.length?events.map(e=>`<article class="news-card" data-id="${hx(e.id)}"><div class="news-time">${hx(istDate(e.date))}<br><span class="news-impact ${hx(e.impact.toLowerCase())}">${hx(e.impact)} impact</span></div><div><div class="learning-tag">${hx(e.market)} · ${hx(e.currency)}</div><h3>${e.starred?'★ ':''}${hx(e.title)}</h3><p class="feature-summary">Forecast: ${hx(e.forecast||'—')} · Previous: ${hx(e.previous||'—')} · Actual: ${hx(e.actual||'—')}</p><p class="feature-summary">${hx(e.notes).replace(/\n/g,'<br>')}</p>${safeWebUrl(e.source)?'<a class="feature-summary" href="'+hx(safeWebUrl(e.source))+'" target="_blank" rel="noopener noreferrer">Source ↗</a>':''}</div><div class="feature-toolbar"><button class="btn ghost" data-action="star">${e.starred?'★':'☆'}</button><button class="btn ghost" data-action="edit">Edit</button><button class="btn ghost" data-action="delete">Delete</button></div></article>`).join(''):'<div class="feature-empty">No events match this view. Add an important event or explore the economic calendar.</div>';
  host.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const id=b.closest('[data-id]').dataset.id,action=b.dataset.action;if(action==='edit'){editNewsEvent(id);return;}if(action==='delete'&&!await confirmFeature('Delete this event?'))return;b.disabled=true;try{let next=structuredClone(newsEvents);if(action==='delete')next=next.filter(e=>e.id!==id);else{const e=next.find(e=>e.id===id);e.starred=!e.starred;}await sSet('news_events',next);newsEvents=next;renderNewsResults();}catch(e){alert('Could not save: '+e.message);b.disabled=false;}});
}

function confirmFeature(message){
 return new Promise(resolve=>{const d=document.createElement('dialog');d.className='at-dialog';d.innerHTML='<h2>Confirm deletion</h2><p>'+hx(message)+'</p><div class="feature-toolbar"><button class="btn" data-confirm>Delete</button><button class="btn ghost" data-cancel>Cancel</button></div>';document.body.append(d);let accepted=false;d.querySelector('[data-confirm]').onclick=()=>{accepted=true;d.close();};d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>{d.remove();resolve(accepted);};d.showModal();});
}

function validateBackup(data){
 if(!data||typeof data!=='object'||!Array.isArray(data.trades)||!Array.isArray(data.accounts))throw Error('Choose a full Alpha Terminal backup with trades and accounts arrays.');
 for(const key of ['trades','accounts','transactions','psychology','challenges','notes','coach_reviews','coach_chat','mistakes','strategies_lib','news_events','news_bookmarks'])if(key in data && (!Array.isArray(data[key])||data[key].some(row=>!row||typeof row!=='object'||Array.isArray(row))))throw Error('Invalid backup collection: '+key);
 if(data.learning_library && (!Array.isArray(data.learning_library.sections)||!Array.isArray(data.learning_library.videos)))throw Error('Invalid learning library backup.');
}
