/* Durable, account/project-scoped outbox and optimistic concurrency using kv_store.updated_at.
   No schema changes or privileged Supabase credentials are required. */
let syncLegacyCount = 0, syncPendingCount = 0, syncIssue = '', syncTail = Promise.resolve();
const syncBases = new Map();
function syncSerial(work){
  const task = syncTail.then(()=>typeof navigator!=='undefined' && navigator.locks ? navigator.locks.request('alpha-terminal-sync',work) : work());
  syncTail = task.catch(()=>{});
  return task;
}
function syncOwner(){ return {id:cloudUser.id, client:sb, prefix:getCloudConfig().url+'::u_'+cloudUser.id+'::'}; }
function ensureSyncOwner(owner){ if(!cloudUser || cloudUser.id!==owner.id || sb!==owner.client) throw new Error('Account changed. Reload before saving.'); }
async function cloudKvGet(key){
  const owner = syncOwner();
  const {data,error} = await owner.client.from('kv_store').select('value,updated_at').eq('user_id',owner.id).eq('key',key).maybeSingle();
  if(error) throw error;
  ensureSyncOwner(owner);
  syncBases.set(owner.prefix+key, data ? data.updated_at : null);
  await idbSet(owner.prefix+'base::'+key, {timestamp:data ? data.updated_at : null});
  return data ? data.value : null;
}
async function cloudKvSet(key,value,base){
  const owner=syncOwner();
  if(base===undefined) throw new Error('Cloud version unknown. Reload online before saving this collection.');
  const timestamp=new Date(Math.max(Date.now(),base ? Date.parse(base)+1 : 0)).toISOString();
  const row={user_id:owner.id,key,value,updated_at:timestamp};
  let result;
  if(base===null) result=await owner.client.from('kv_store').insert(row).select('updated_at');
  else result=await owner.client.from('kv_store').update({value,updated_at:timestamp}).eq('user_id',owner.id).eq('key',key).eq('updated_at',base).select('updated_at');
  if(result.error){
    if(result.error.code==='23505') throw new Error('Conflict: another device has saved this collection.');
    throw result.error;
  }
  if(!result.data?.length) throw new Error('Conflict: another device has saved this collection.');
  ensureSyncOwner(owner);
  syncBases.set(owner.prefix+key,result.data[0].updated_at);
  await idbSet(owner.prefix+'base::'+key,{timestamp:result.data[0].updated_at});
  return result.data[0].updated_at;
}
async function syncedGet(key){
  return syncSerial(async()=>{
    const owner=syncOwner(), pending=await idbGet(owner.prefix+'outbox') || {};
    syncPendingCount=Object.keys(pending).length;
    syncLegacyCount=Object.keys(await idbGet(owner.prefix+'legacy_recovery') || {}).length;
    if(pending[key]){ storageBackend='cloud-offline'; return structuredClone(pending[key].value); }
    try{
      const previouslyCached=await idbGet(owner.prefix+key);
      const value=await cloudKvGet(key);
      const legacy=await idbGet('u_'+owner.id+'::'+key);
      if(previouslyCached===null && legacy!==null && JSON.stringify(legacy)!==JSON.stringify(value)){
        const recovery=await idbGet(owner.prefix+'legacy_recovery') || {};recovery[key]={value:legacy,detectedAt:new Date().toISOString()};await idbSet(owner.prefix+'legacy_recovery',recovery);syncLegacyCount=Object.keys(recovery).length;
      }
      await idbSet(owner.prefix+key,value);
      storageBackend=syncPendingCount ? 'cloud-offline' : 'cloud';
      return value;
    }catch(e){
      storageBackend='cloud-offline'; syncIssue='Cloud unavailable; using this device’s cache';
      const cached=await idbGet(owner.prefix+key);
      if(cached!==null) return cached;
      // Read the previous app's account-scoped cache without uploading it blindly.
      return await idbGet('u_'+owner.id+'::'+key);
    }
  });
}
function syncedSet(key,value){
  const snapshot=structuredClone(value), owner=syncOwner();
  return syncSerial(async()=>{
    ensureSyncOwner(owner);
    const pending=await idbGet(owner.prefix+'outbox') || {};
    const storedBase=await idbGet(owner.prefix+'base::'+key);
    const base=pending[key] ? pending[key].base : (syncBases.has(owner.prefix+key) ? syncBases.get(owner.prefix+key) : storedBase?.timestamp);
    pending[key]={value:snapshot,base,savedAt:new Date().toISOString()};
    // Persist the outbox first; the pending value is authoritative across reloads.
    await idbSet(owner.prefix+'outbox',pending);
    await idbSet(owner.prefix+key,snapshot);
    await flushSyncNow(owner,pending);
  });
}
async function flushSyncNow(owner,pending){
  syncIssue='';
  for(const [key,entry] of Object.entries(pending)){
    ensureSyncOwner(owner);
    try{
      await cloudKvSet(key,entry.value,entry.base);
      delete pending[key];
      await idbSet(owner.prefix+'outbox',pending);
    }catch(e){ syncIssue=String(e.message||'Connection unavailable').replace(/[<>&"']/g,''); }
  }
  syncPendingCount=Object.keys(pending).length;
  storageBackend=syncPendingCount ? 'cloud-offline' : 'cloud';
  updateStorageIndicator();
}
function retryCloudSync(){
  if(!sb || !cloudUser) return Promise.resolve();
  return syncSerial(async()=>{
    const owner=syncOwner();
    const pending=await idbGet(owner.prefix+'outbox') || {};
    if(Object.keys(pending).length)await flushSyncNow(owner,pending);
  }).catch(e=>{syncIssue=e.message; storageBackend='cloud-offline'; updateStorageIndicator();});
}
async function openSyncStatus(){
  const owner=syncOwner(), pending=await idbGet(owner.prefix+'outbox') || {};
  let dialog=document.getElementById('syncDialog');
  if(!dialog){ dialog=document.createElement('dialog'); dialog.id='syncDialog'; dialog.className='at-dialog'; document.body.append(dialog); }
  const legacy=await idbGet(owner.prefix+'legacy_recovery')||{};syncLegacyCount=Object.keys(legacy).length;
  dialog.innerHTML='<h2>Cloud sync</h2><p>Pending collections: '+Object.keys(pending).map(k=>k.replace(/[^a-z_]/g,'')).join(', ')+'</p><p></p><div class="feature-toolbar"><button class="btn" id="syncRetry">Retry saves</button><button class="btn ghost" id="syncDownload">Download pending backup</button><button class="btn ghost" id="syncLegacy">Download previous local cache</button><button class="btn ghost" id="syncRecovery">Download recovery copies</button><button class="btn ghost" id="syncCloud">Use cloud version</button><button class="btn ghost" id="syncClose">Close</button></div>';
  dialog.querySelectorAll('p')[1].textContent=syncIssue || 'Your saved collections are up to date. Reload to fetch changes made on other devices.';
  dialog.querySelector('#syncRetry').onclick=async()=>{await retryCloudSync();dialog.close();openSyncStatus();};
  dialog.querySelector('#syncDownload').onclick=()=>downloadJson(pending,'alpha-terminal-pending-backup');
  dialog.querySelector('#syncLegacy').disabled=!syncLegacyCount;
  dialog.querySelector('#syncLegacy').onclick=()=>downloadJson(legacy,'alpha-terminal-previous-local-cache');
  const archived=await idbGet(owner.prefix+'recovery')||[];
  dialog.querySelector('#syncRecovery').disabled=!archived.length;
  dialog.querySelector('#syncRecovery').onclick=()=>downloadJson(archived,'alpha-terminal-recovery-copies');
  dialog.querySelector('#syncCloud').onclick=async()=>{
    if(!confirm('Keep a recovery copy of pending edits on this device, then reload the cloud versions?')) return;
    await syncSerial(async()=>{
      ensureSyncOwner(owner);
      const archive=await idbGet(owner.prefix+'recovery')||[];
      archive.push({savedAt:new Date().toISOString(),pending:await idbGet(owner.prefix+'outbox')});
      await idbSet(owner.prefix+'recovery',archive);
      await idbSet(owner.prefix+'outbox',{});
    });
    location.reload();
  };
  dialog.querySelector('#syncClose').onclick=()=>dialog.close();
  if(!dialog.open) dialog.showModal();
}
window.addEventListener('online',retryCloudSync);
setInterval(retryCloudSync,30000);
window.addEventListener('beforeunload',e=>{if(syncPendingCount){e.preventDefault();e.returnValue='';}});
