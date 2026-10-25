/* MyMint — core: on-phone storage, money, Dropbox live copy, snapshots, backup & restore.
   The storage and Dropbox parts follow the same design as MyMaglites. */
"use strict";
const APP_ID="mymint", APP_NAME="MyMint", APP_VERSION="1.14", BACKUP_VERSION=1;

/* ================= storage (IndexedDB, on this device) ================= */
const STORES=["coins","wanted","settings","receipts","files","meta","outbox"];
let _db, _dbP;
function openRaw(v){ return new Promise((res,rej)=>{ const r=v?indexedDB.open(APP_ID,v):indexedDB.open(APP_ID);
  r.onupgradeneeded=()=>{ const d=r.result; for(const s of STORES) if(!d.objectStoreNames.contains(s)) d.createObjectStore(s,{keyPath:"id"}); };
  r.onblocked=()=>{ const m=document.getElementById("main"); if(m) m.innerHTML=`<section class="view"><div class="empty"><b>Finishing the update…</b><span>An older copy of MyMint is still open — usually the installed app in the background or a Chrome tab. Close it and this carries on by itself. Your data is safe.</span></div></section>`; };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function openDB(){
  let d=await openRaw();
  if(STORES.some(s=>!d.objectStoreNames.contains(s))){ const v=d.version+1; d.close(); d=await openRaw(v); }
  d.onversionchange=()=>{ d.close(); location.reload(); };
  _db=d; return d;
}
function tx(store,mode,fn){ if(!_db) return (_dbP||Promise.reject(new Error("Storage isn't ready yet — close and reopen the app"))).then(()=>tx(store,mode,fn)); return new Promise((res,rej)=>{ const t=_db.transaction(store,mode); const os=t.objectStore(store); let out; const r=fn(os); if(r) r.onsuccess=()=>{out=r.result}; t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); }
const dbAll=s=>tx(s,"readonly",os=>os.getAll());
const dbGet=(s,id)=>tx(s,"readonly",os=>os.get(id));
let _bulk=0; // >0 while restoring, so those writes don't count as your changes
const _user=s=>s!=="meta"&&s!=="outbox"&&!_bulk;
const _w=(s,op,key)=>r=>{ if(_user(s)) noteChange(s,op,key); return r; };
const _ro=s=>_user(s)&&S.readOnly?Promise.reject(new Error(RO_MSG)):null;
const dbPut=(s,o)=>_ro(s)||tx(s,"readwrite",os=>os.put(o)).then(_w(s,"put",o.id));
const dbDel=(s,id)=>_ro(s)||tx(s,"readwrite",os=>os.delete(id)).then(_w(s,"del",id));
const dbClear=s=>_ro(s)||tx(s,"readwrite",os=>os.clear()).then(_w(s,"clear",null));
const saveMeta=()=>tx("meta","readwrite",os=>os.put({id:"main",...S.meta}));
const uid=p=>(p||"x")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ================= small helpers ================= */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=s=>document.querySelector(s);
const clone=o=>JSON.parse(JSON.stringify(o));
const blank=v=>v==null||v==="";
function toast(m){ const t=$("#toast"); t.textContent=m; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2800); }
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d){ if(!d) return ""; const [y,m,dd]=String(d).split("-"); return dd?`${+dd} ${MON[+m-1]} ${y}`:d; }
const todayISO=()=>{ const d=new Date(); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
function stamp(){ const d=new Date(),z=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; }
function todayStr(){ return todayISO(); }
function fmtWhen(iso){ if(!iso) return "—"; const d=new Date(iso); if(isNaN(d)) return "—"; const z=n=>String(n).padStart(2,"0"); const today=new Date().toDateString()===d.toDateString(); const t=d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}); return today?`today ${t}`:`${fmtDate(`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`)} ${t}`; }
function devWord(){ return /Android|iPhone/i.test(navigator.userAgent)?"phone":"device"; }

/* ================= money: original currency + AUD equivalent ================= */
const CURRENCIES=["AUD","USD","GBP","EUR","NZD","CAD","JPY"];
const CUR_SYM={AUD:"A$",USD:"US$",GBP:"£",EUR:"€",NZD:"NZ$",CAD:"C$",JPY:"¥"};
const curOf=c=>c||"AUD";
function fmtMoney(n,cur){ if(blank(n)) return ""; cur=curOf(cur); const v=Number(n); const dp=cur==="JPY"?0:(Math.round(v*100)%100?2:0); return (CUR_SYM[cur]||cur+" ")+v.toLocaleString("en-AU",{minimumFractionDigits:dp,maximumFractionDigits:dp}); }
const aud=n=>blank(n)?"":"$"+Number(n).toLocaleString("en-AU",{minimumFractionDigits:Math.round(n*100)%100?2:0,maximumFractionDigits:2});
function priceAUD(c){ if(blank(c.price)) return null; if(curOf(c.priceCur)==="AUD") return +c.price; return blank(c.priceAud)?null:+c.priceAud; }
const pendingConv=c=>!blank(c.price)&&+c.price!==0&&curOf(c.priceCur)!=="AUD"&&blank(c.priceAud);
const _rates={};
/* Daily reference rates from the European Central Bank, via the free Frankfurter service (no key, no account). */
async function getRate(cur,date){
  cur=curOf(cur); if(cur==="AUD") return {rate:1,date};
  const d=(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=todayISO())?date:"latest"; const key=cur+"|"+d; if(_rates[key]) return _rates[key];
  const tries=[
    async()=>{ const r=await fetch(`https://api.frankfurter.dev/v1/${d}?base=${cur}&symbols=AUD`); if(!r.ok) throw 0; const j=await r.json(); return {rate:j.rates&&j.rates.AUD,date:j.date}; },
    async()=>{ const r=await fetch(`https://api.frankfurter.app/${d}?from=${cur}&to=AUD`); if(!r.ok) throw 0; const j=await r.json(); return {rate:j.rates&&j.rates.AUD,date:j.date}; }
  ];
  for(const f of tries){ try{ const x=await f(); if(x&&+x.rate>0){ x.rate=+x.rate; _rates[key]=x; return x; } }catch{} }
  return null;
}
async function convertCoin(c){ if(!pendingConv(c)) return false; const r=await getRate(c.priceCur,c.acqDate); if(!r) return false; c.priceAud=Math.round(+c.price*r.rate*100)/100; c.priceRate={rate:r.rate,date:r.date}; return true; }

/* ================= file blobs → object URLs ================= */
async function urlFor(id){ if(!id) return ""; if(S.urls[id]) return S.urls[id]; const f=await dbGet("files",id); if(!f) return ""; S.urls[id]=URL.createObjectURL(f.blob); return S.urls[id]; }
async function hydrateImages(root){ const imgs=(root||document).querySelectorAll("img[data-fid]"); for(const im of imgs){ const u=await urlFor(im.dataset.fid); if(u) im.src=u; } }
async function resizeImage(blob,max){ const bmp=await createImageBitmap(blob); const s=Math.min(1,(max||1600)/Math.max(bmp.width,bmp.height)); const c=document.createElement("canvas"); c.width=Math.round(bmp.width*s); c.height=Math.round(bmp.height*s); c.getContext("2d").drawImage(bmp,0,0,c.width,c.height); return await new Promise(r=>c.toBlob(r,"image/jpeg",0.84)); }
async function askPersist(){ try{ if(navigator.storage&&navigator.storage.persist&&!(await navigator.storage.persisted())) await navigator.storage.persist(); }catch{} }

/* ================= backup file ================= */
function backupName(kind){ return `mymint-${kind||"backup"}-${stamp()}.zip`; }
function fileExt(f){ return (f.type==="image/jpeg"?"jpg":f.type==="application/pdf"?"pdf":f.type==="image/png"?"png":f.type==="image/webp"?"webp":(String(f.name||"").split(".").pop()||"bin")).toLowerCase().replace(/[^a-z0-9]/g,"")||"bin"; }
async function buildBackup(kind){
  const zip=new JSZip(); const files=await dbAll("files"); const manifest=[];
  for(const f of files){ const path=`files/${f.id}.${fileExt(f)}`; zip.file(path,f.blob); manifest.push({id:f.id,type:f.type,name:f.name,path}); }
  const data={app:APP_ID,version:BACKUP_VERSION,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),counts:{coins:S.coins.length,files:files.length,receipts:(S.receipts||[]).length},coins:S.coins,wanted:S.wanted,settings:S.settings,receipts:S.receipts||[],files:manifest};
  zip.file("backup.json",JSON.stringify(data,null,1));
  const blob=await zip.generateAsync({type:"blob",compression:"STORE"});
  return {blob,name:backupName(kind),nFiles:files.length};
}
async function makeBackup(){
  const st=$("#bkStat"); st.textContent="Packing…";
  const {blob,name,nFiles}=await buildBackup(); const url=URL.createObjectURL(blob);
  $("#bkOut").innerHTML=`<a class="btn primary" href="${url}" download="${esc(name)}" data-dlbk>Save to phone</a><span class="muted small">${(blob.size/1048576).toFixed(1)} MB · ${S.coins.length} coins · ${nFiles} photos</span>`;
  st.textContent="";
}
async function markBackedUp(){ S.meta.lastBackup=new Date().toISOString(); S.meta.changes=0; await saveMeta(); hdrStatus(); }
let _restore=null;
async function readRestore(file){
  const st=$("#rsStat")||{}; st.textContent="Reading…";
  try{
    let zip=null, data;
    const head=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(head[0]===0x50&&head[1]===0x4b){ zip=await JSZip.loadAsync(file); const j=zip.file("backup.json"); if(!j) throw new Error("This isn't a MyMint backup (no backup.json inside)."); data=JSON.parse(await j.async("string")); }
    else { const txt=(await file.text()).replace(/^\ufeff/,"").trim(); if(!txt.startsWith("{")) throw new Error(file.size?"That file isn't a MyMint backup (it may not have downloaded fully — try saving it again).":"That file is empty — it didn't download fully. Save it again and retry."); data=JSON.parse(txt); }
    if(data.app!==APP_ID) throw new Error("This file is from a different app.");
    _restore={zip,data};
    const html=`<div class="banner" style="margin-top:8px"><span>Backup from ${fmtWhen(data.exportedAt)}: ${data.coins.length} coins, ${(data.files||[]).length} photos and files, ${(data.receipts||[]).length} receipts, ${(data.wanted||[]).length} wanted. This replaces what's on this ${devWord()}${S.coins.length?` (${S.coins.length} coins)`:""}.</span><button type="button" class="btn primary sm" data-rsyes>Restore</button><button type="button" class="btn ghost sm" data-rsno>Cancel</button></div>`;
    if($("#rsConfirm")){ $("#rsConfirm").innerHTML=html; st.textContent=""; }
    else { S.tab="more"; S.moreView="backup"; render(); $("#rsConfirm").innerHTML=html; }
  }catch(e){ if($("#rsStat")) $("#rsStat").textContent=""; toast(e.message||"That file couldn't be read."); }
}
async function doRestore(){
  const {zip,data}=_restore; const st=$("#rsStat");
  if(S.readOnly){ toast(RO_MSG); return; }
  if(dbxOn()&&S.coins.length){ st.textContent="Saving a snapshot of what's here first…"; try{ await uploadSnapshot("before-restore"); }catch(e){ st.textContent=""; toast("Couldn't save a snapshot to Dropbox first ("+(e.message||e)+"). Make a backup file, then try again."); return; } }
  st.textContent="Restoring…"; _bulk++; try{
  for(const s of ["coins","wanted","settings","receipts","files"]) await dbClear(s);
  for(const u of Object.values(S.urls)) URL.revokeObjectURL(u); S.urls={};
  let n=0; for(const f of (zip?data.files||[]:[])){ const z=zip.file(f.path); if(!z) continue; const b=await z.async("blob"); await dbPut("files",{id:f.id,type:f.type,name:f.name,blob:new Blob([b],{type:f.type})}); if(++n%10===0) st.textContent=`Restoring photos ${n} of ${data.files.length}…`; }
  for(const c of data.coins) await dbPut("coins",c); for(const w of (data.wanted||[])) await dbPut("wanted",w); for(const x of (data.settings||[])) await dbPut("settings",x); for(const x of (data.receipts||[])) await dbPut("receipts",x);
  S.meta.lastBackup=data.exportedAt; S.meta.changes=0; S.meta.needFull=true; S.meta.snapDirty=true; await tx("outbox","readwrite",os=>os.clear()); await saveMeta();
  _restore=null; await reload(); }finally{ _bulk--; } askPersist(); S.tab="coins"; render(); toast(`Restored ${data.coins.length} coins`); if(dbxOn()) syncNow();
}

/* ---------- Dropbox: live copy, upload queue, snapshots, main-device handover ----------
   Dropbox app folder layout:
     live/manifest.json   who the main device is, revision, counts
     live/coins/<id>.json, live/files/<id>.<ext>, live/files.json (photo index), live/wanted.json, live/settings.json
     snapshots/*.zip      daily full backups (and one before every restore)
     deleted/…            anything deleted or replaced on the phone, moved here instead of erased      */
const DBX_APP_KEY="o386ym9hmi3jn7t"; // Dropbox App key for the MyMint app folder (not a secret; the App secret is never used)
const PROMPT_EVERY=10, SYNC_DELAY=3000, VERIFY_DAYS=7, SNAP_DAILY_DAYS=30, SNAP_MONTHS=24;
const DBX_TOKEN="https://api.dropboxapi.com/oauth2/token";
const RO_MSG="This device has been replaced as the main one — view only. Use More › Backup & restore to make it the main device again.";
let _syncT=null, _syncing=false, _syncAgain=false;
const LIST_STORES=["wanted","settings","receipts"];
function noteChange(s,op,key){
  S.meta.changes=(S.meta.changes||0)+1; S.meta.snapDirty=true;
  const k=s==="coins"?"t:"+key:s==="files"?"f:"+key:LIST_STORES.includes(s)?"l:"+s:null;
  if(op==="clear") S.meta.needFull=true;
  else if(k) tx("outbox","readwrite",os=>os.put({id:k,op:k[0]==="l"?"put":op,at:Date.now()+Math.random()})).catch(()=>{});
  saveMeta().catch(()=>{});
  if(dbxOn()) scheduleSync(); hdrStatus();
  if(!dbxOn()&&S.meta.changes%PROMPT_EVERY===0) setTimeout(()=>toast(`${S.meta.changes} changes not backed up — More › Backup & restore`),3000);
}
function hdrStatus(){ const el=$("#hdrsub"); if(!el) return; const ch=S.meta.changes||0;
  const st=S.readOnly?"view only":_syncing?"syncing…":ch?(dbxOn()?`${ch} change${ch===1?"":"s"} waiting`:`${ch} change${ch===1?"":"s"} not backed up`):dbxOn()?"in Dropbox ✓":S.meta.lastBackup?"backed up ✓":"not backed up";
  const n=S.coins.filter(isOwned).reduce((a,c)=>a+(typeof coinsIn==="function"?coinsIn(c):(+c.qty||1)),0);
  el.textContent=`${n} coin${n===1?"":"s"} · ${st}`; el.classList.toggle("warnTxt",S.readOnly||(!_syncing&&(ch>0||(!dbxOn()&&!S.meta.lastBackup))&&S.coins.length>0)); }
function dbxOn(){ return !!(S.meta.dbx&&S.meta.dbx.refresh); }
function appKey(){ return DBX_APP_KEY||(S.meta.dbx||{}).appKey||""; }
function onCellular(){ const c=navigator.connection; return !!(c&&c.type==="cellular"); }
function dbxRedirect(){ return new URL("./",location.href).href.split(/[?#]/)[0]; }
function setDbx(patch){ S.meta.dbx={...(S.meta.dbx||{}),...patch}; return saveMeta(); }
function deviceId(){ if(!S.meta.deviceId){ S.meta.deviceId=uid("dev"); saveMeta().catch(()=>{}); } return S.meta.deviceId; }
function deviceName(){ const u=navigator.userAgent; return (/Android/.test(u)?"Android phone":/iPhone|iPad/.test(u)?"iPhone/iPad":/Windows/.test(u)?"Windows PC":/Mac/.test(u)?"Mac":/Linux/.test(u)?"Linux PC":"Device")+` (set up ${fmtDate(S.meta.deviceSince||todayStr())})`; }
function scheduleSync(ms){ clearTimeout(_syncT); _syncT=setTimeout(()=>syncNow(),ms??SYNC_DELAY); }
const b64url=u8=>btoa(String.fromCharCode(...u8)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
async function dbxHash(data){ // Dropbox content_hash: SHA-256 of the concatenated SHA-256s of each 4 MB block
  const buf=data instanceof Blob?await data.arrayBuffer():new TextEncoder().encode(data).buffer; const parts=[];
  for(let i=0;i<buf.byteLength||i===0;i+=4194304){ parts.push(new Uint8Array(await crypto.subtle.digest("SHA-256",buf.slice(i,i+4194304)))); if(!buf.byteLength) break; }
  const all=new Uint8Array(parts.length*32); parts.forEach((p,i)=>all.set(p,i*32)); return hex(await crypto.subtle.digest("SHA-256",all));
}
/* sign-in (OAuth with PKCE; no password or secret is ever stored) */
async function dbxConnect(){
  const key=DBX_APP_KEY||(($("#dbxKey")||{}).value||"").trim(); if(!/^[a-z0-9]{8,}$/i.test(key)){ S.tab="more"; S.moreView="backup"; render(); toast("Paste the App key from the Dropbox App Console first"); return; }
  if(!(window.crypto&&crypto.subtle)){ toast("This browser can't do the secure sign-in — open the app from its https address"); return; }
  const v=b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge=b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))));
  const state=b64url(crypto.getRandomValues(new Uint8Array(16)));
  await setDbx({appKey:key,pkce:{v,state},lastError:null});
  const q=new URLSearchParams({client_id:key,response_type:"code",code_challenge:challenge,code_challenge_method:"S256",token_access_type:"offline",redirect_uri:dbxRedirect(),state});
  location.href="https://www.dropbox.com/oauth2/authorize?"+q.toString();
}
async function dbxFinish(){
  const p=new URLSearchParams(location.search); if(!p.has("code")&&!p.has("error")) return;
  history.replaceState(null,"",location.pathname);
  const dx=S.meta.dbx||{}; S.tab="more"; S.moreView="backup";
  if(p.has("error")){ render(); toast("Dropbox not connected: "+(p.get("error_description")||p.get("error")).replace(/\+/g," ")); return; }
  if(!dx.pkce||p.get("state")!==dx.pkce.state){ render(); toast("That Dropbox sign-in didn't match — tap Connect Dropbox again"); return; }
  try{
    let r,j;
    for(let i=0;i<4;i++){ // Dropbox sometimes says "rate limited" while it sets up a new app folder: wait and try again
      r=await fetch(DBX_TOKEN,{method:"POST",body:new URLSearchParams({grant_type:"authorization_code",code:p.get("code"),client_id:dx.appKey,code_verifier:dx.pkce.v,redirect_uri:dbxRedirect()})});
      j=await r.json().catch(()=>({}));
      if(r.ok&&j.refresh_token) break;
      const busy=r.status===429||r.status>=500||/rate.?limit|too_many|concurrency/i.test(String(j.error_description||j.error||""));
      if(!busy||i===3) break;
      toast("Dropbox is busy setting up your folder — retrying…"); await new Promise(z=>setTimeout(z,(i+1)*4000));
    }
    if(!r.ok||!j.refresh_token) throw new Error(shortErr(j.error_description||j.error||("HTTP "+r.status)));
    S.meta.dbx={appKey:dx.appKey,refresh:j.refresh_token,access:j.access_token,expires:Date.now()+(j.expires_in||14400)*1000,wifiOnly:dx.wifiOnly!==false};
    await saveMeta();
    try{ const a=await dbxApi("users/get_current_account",null); await setDbx({email:a.email,name:a.name&&a.name.display_name}); }catch{}
  }catch(e){ await setDbx({pkce:null,lastError:"Dropbox sign-in failed: "+(e.message||e)}); render(); return; }
  await afterConnect();
}
function shortErr(m){ m=String(m||""); if(/rate.?limit|too_many|concurrency/i.test(m)) return "Dropbox was busy setting up your app folder. Wait a minute, then tap Connect Dropbox again."; m=m.split(/ORIGINAL STACK|\n/)[0].trim(); return m.length>160?m.slice(0,157)+"…":m; }
async function afterConnect(){
  render();
  let man; try{ man=await dbxReadJSON("/live/manifest.json"); }catch(e){ toast("Connected, but Dropbox couldn't be read: "+e.message); return; }
  if(!man){
    if(S.coins.length){ toast("Dropbox connected — sending your collection"); S.meta.needFull=true; S.meta.snapDirty=true; await saveMeta(); await syncNow({takeOver:true}); }
    else { toast("Dropbox connected — no collection there yet. Restore a backup or add a coin."); dbxListBackups(); }
    return;
  }
  if(man.owner===deviceId()){ await syncNow(); return; }
  if(!S.coins.length){ await dbxTakeOver(true); return; }
  await enterReadOnly(man); S.tab="more"; S.moreView="backup"; render();
  toast(`Dropbox has a collection from ${man.ownerName||"another device"} — choose what to do`);
}
async function dbxToken(force){
  const dx=S.meta.dbx; if(!force&&dx.access&&dx.expires>Date.now()+60000) return dx.access;
  const r=await fetch(DBX_TOKEN,{method:"POST",body:new URLSearchParams({grant_type:"refresh_token",refresh_token:dx.refresh,client_id:dx.appKey})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ if(j.error==="invalid_grant"){ await setDbx({refresh:null,access:null,lastError:"Dropbox access was removed or expired — connect Dropbox again"}); } throw new Error(shortErr(j.error_description||j.error||("HTTP "+r.status))); }
  await setDbx({access:j.access_token,expires:Date.now()+(j.expires_in||14400)*1000}); return j.access_token;
}
class DbxErr extends Error{ constructor(m,status,summary){ super(m); this.status=status; this.summary=summary||""; } }
async function dbxCall(url,opts){
  for(let i=0;i<4;i++){ const tok=await dbxToken(i>0&&opts._401); const r=await fetch(url,{method:"POST",...opts,headers:{...opts.headers,Authorization:"Bearer "+tok}});
    if(r.status===401&&!opts._401){ opts._401=true; continue; }
    if((r.status===429||r.status>=500)&&i<3){ const wait=Math.min(30,Number(r.headers.get("Retry-After"))||2**i); await new Promise(z=>setTimeout(z,wait*1000)); continue; }
    if(!r.ok){ const t=await r.text().catch(()=>""); let m=t; try{ m=JSON.parse(t).error_summary||t; }catch{} throw new DbxErr(`Dropbox ${r.status}: ${String(m).slice(0,120)}`,r.status,String(m)); }
    return r; }
}
async function dbxApi(ep,arg){ const r=await dbxCall("https://api.dropboxapi.com/2/"+ep,arg===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(arg)}); const t=await r.text(); return t?JSON.parse(t):null; }
const dbxArg=o=>JSON.stringify(o).replace(/[\u007f-￿]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
async function dbxUpload(path,body,mode){ if(body instanceof Blob&&body.size>145*1048576) throw new Error("a file over 145 MB is too big to send"); const r=await dbxCall("https://content.dropboxapi.com/2/files/upload",{headers:{"Content-Type":"application/octet-stream","Dropbox-API-Arg":dbxArg({path,mode:mode||"overwrite",autorename:mode==="add",mute:true})},body}); return r.json(); }
async function dbxDownload(path){ const r=await dbxCall("https://content.dropboxapi.com/2/files/download",{headers:{"Dropbox-API-Arg":dbxArg({path})}}); return r.blob(); }
const notFound=e=>e instanceof DbxErr&&e.status===409&&/not_found/.test(e.summary);
async function dbxReadJSON(path){ try{ return JSON.parse(await (await dbxDownload(path)).text()); }catch(e){ if(notFound(e)) return null; throw e; } }
async function dbxList(path,recursive){
  let r; try{ r=await dbxApi("files/list_folder",{path,recursive:!!recursive}); }catch(e){ if(notFound(e)) return []; throw e; }
  let es=r.entries; while(r.has_more){ r=await dbxApi("files/list_folder/continue",{cursor:r.cursor}); es=es.concat(r.entries); }
  return es.filter(e=>e[".tag"]==="file");
}
async function dbxMoveToDeleted(path){ const name=path.split("/").pop(); const sub=path.split("/").slice(2,-1).join("/");
  try{ await dbxApi("files/move_v2",{from_path:path,to_path:`/deleted/${sub?sub+"/":""}${stamp()}_${name}`,autorename:true}); return true; }catch(e){ if(notFound(e)) return false; throw e; } }
async function pool(items,n,fn){ let i=0; await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{ while(i<items.length){ const k=i++; await fn(items[k],k); } })); }
const coinPath=c=>`/live/coins/${c.id}.json`, filePath=f=>`/live/files/${f.id}.${fileExt(f)}`;
async function fileIndex(){ return JSON.stringify((await dbAll("files")).map(f=>({id:f.id,type:f.type,name:f.name,path:filePath(f).slice(6)}))); }
async function listBody(s){ return JSON.stringify(await dbAll(s)); }
async function syncNow(opts={}){
  if(!dbxOn()) return; if(_syncing){ _syncAgain=true; return; } if(S.readOnly&&!opts.takeOver) return;
  if(!navigator.onLine){ hdrStatus(); return; }
  clearTimeout(_syncT); _syncing=true; refreshDbxPanel(); let ok=false;
  try{
    const man=await dbxReadJSON("/live/manifest.json");
    if(man&&man.owner&&man.owner!==deviceId()&&!opts.takeOver){ await enterReadOnly(man); return; }
    const due=!S.meta.verify||Date.now()-new Date(S.meta.verify.at)>VERIFY_DAYS*864e5;
    let sent;
    if(!man||S.meta.needFull||opts.check||due) sent=await dbxReconcile(!man?"first":S.meta.needFull?"restore":"check");
    else sent=await drainOutbox();
    if(sent||!man||man.owner!==deviceId()) await writeManifest(man);
    S.meta.changes=await outboxCount(); if(!S.meta.changes&&!S.meta.needFull) S.meta.lastBackup=new Date().toISOString();
    S.meta.lastSync=new Date().toISOString(); await setDbx({lastError:null,lastErrorAt:null}); ok=true;
  }catch(e){
    const msg=!navigator.onLine||e instanceof TypeError?"couldn't reach Dropbox (no connection?)":shortErr(e&&e.message||e);
    await setDbx({lastError:msg,lastErrorAt:new Date().toISOString()}).catch(()=>{});
    if(opts.manual) toast("Dropbox sync failed: "+msg);
    if(dbxOn()) scheduleSync(60000);
  }finally{ _syncing=false; refreshDbxPanel(); }
  if(ok){ if(opts.manual) toast("Dropbox is up to date"); maybeSnapshot(opts.snap).catch(()=>{}); }
  if(_syncAgain||(ok&&S.meta.changes)){ _syncAgain=false; scheduleSync(500); }
}
async function outboxCount(){ return (await dbAll("outbox")).length; }
function outboxDone(it){ return new Promise((res,rej)=>{ const t=_db.transaction("outbox","readwrite"); const os=t.objectStore("outbox"); const g=os.get(it.id); g.onsuccess=()=>{ if(g.result&&g.result.at===it.at) os.delete(it.id); }; t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }
async function drainOutbox(){
  const items=(await dbAll("outbox")).sort((a,b)=>a.at-b.at); if(!items.length) return 0;
  let filesChanged=false, remoteFiles=null;
  for(const it of items){
    const [kind,id]=[it.id.slice(0,1),it.id.slice(2)];
    if(kind==="t"){ const c=await dbGet("coins",id); if(c&&it.op!=="del") await dbxUpload(coinPath(c),JSON.stringify(c)); else await dbxMoveToDeleted(`/live/coins/${id}.json`); }
    else if(kind==="f"){ filesChanged=true; const f=await dbGet("files",id);
      if(f&&it.op!=="del") await dbxUpload(filePath(f),f.blob);
      else { remoteFiles=remoteFiles||await dbxList("/live/files"); for(const e of remoteFiles.filter(e=>e.name.toLowerCase().startsWith(id.toLowerCase()+"."))) await dbxMoveToDeleted(e.path_lower); } }
    else if(kind==="l") await dbxUpload(`/live/${id}.json`,await listBody(id));
    await outboxDone(it);
  }
  if(filesChanged) await dbxUpload("/live/files.json",await fileIndex());
  return items.length;
}
async function dbxReconcile(mode){
  const remote=new Map((await dbxList("/live",true)).map(e=>[e.path_lower,e]));
  const want=[]; const coins=await dbAll("coins"), files=await dbAll("files");
  for(const c of coins) want.push([coinPath(c),JSON.stringify(c)]);
  for(const f of files) want.push([filePath(f),f.blob]);
  for(const s of LIST_STORES) want.push([`/live/${s}.json`,await listBody(s)]);
  want.push(["/live/files.json",await fileIndex()]);
  const keep=new Set(want.map(w=>w[0].toLowerCase())); keep.add("/live/manifest.json");
  let fixed=0; const pending=await dbAll("outbox");
  await pool(want,4,async([path,body])=>{ const r=remote.get(path.toLowerCase()); if(!r||r.content_hash!==await dbxHash(body)){ await dbxUpload(path,body); fixed++; } });
  for(const [p,e] of remote) if(!keep.has(p)&&/^\/live\/(coins|files)\//.test(p)){ await dbxMoveToDeleted(e.path_lower); fixed++; }
  for(const it of pending) await outboxDone(it);
  S.meta.needFull=false; S.meta.verify={at:new Date().toISOString(),coins:coins.length,files:files.length,fixed,mode:mode||"check"}; await saveMeta();
  return fixed;
}
async function writeManifest(prev){
  const man={app:APP_ID,schema:1,appVersion:APP_VERSION,owner:deviceId(),ownerName:deviceName(),rev:((prev&&prev.rev)||0)+1,updatedAt:new Date().toISOString(),
    counts:{coins:S.coins.length,files:(await dbAll("files")).length,wanted:S.wanted.length,receipts:(S.receipts||[]).length}};
  await dbxUpload("/live/manifest.json",JSON.stringify(man,null,1)); S.meta.owner={id:man.owner,name:man.ownerName,at:man.updatedAt}; await saveMeta();
}
async function enterReadOnly(man){ S.readOnly=true; S.meta.readOnly=true; S.meta.owner={id:man.owner,name:man.ownerName,at:man.updatedAt}; await saveMeta(); clearTimeout(_syncT); render(); }
async function dbxTakeOver(){
  const st=$("#rsStat"); const say=m=>{ if($("#rsStat")) $("#rsStat").textContent=m; else toast(m); };
  const man=await dbxReadJSON("/live/manifest.json");
  if(!man){ S.readOnly=false; S.meta.readOnly=false; await saveMeta(); await syncNow({takeOver:true}); render(); return; }
  if(S.coins.length){ say("Saving a snapshot of this device first…"); await uploadSnapshot("before-restore"); }
  say("Downloading your collection from Dropbox…");
  await dbxPull(m=>say(m));
  await syncNow({takeOver:true});
  S.tab="coins"; render(); toast(`${S.coins.length} coins downloaded from Dropbox — this is now the main ${devWord()}`);
  if(st) st.textContent="";
}
async function dbxPull(progress){
  const index=await dbxReadJSON("/live/files.json")||[]; const lists={}; for(const s of LIST_STORES) lists[s]=await dbxReadJSON(`/live/${s}.json`)||[];
  const cfiles=(await dbxList("/live/coins")).filter(e=>/\.json$/.test(e.name));
  const coins=[], blobs=[]; let n=0; const total=cfiles.length+index.length;
  await pool(cfiles,4,async e=>{ coins.push(JSON.parse(await (await dbxDownload(e.path_lower)).text())); if(++n%5===0) progress&&progress(`Downloading ${n} of ${total}…`); });
  await pool(index,4,async f=>{ const b=await dbxDownload("/live/"+f.path); blobs.push({id:f.id,type:f.type,name:f.name,blob:new Blob([b],{type:f.type})}); if(++n%5===0) progress&&progress(`Downloading ${n} of ${total}…`); });
  _bulk++; try{
    for(const s of ["coins","wanted","settings","receipts","files","outbox"]) await dbClear(s);
    for(const u of Object.values(S.urls)) URL.revokeObjectURL(u); S.urls={};
    for(const f of blobs) await dbPut("files",f); for(const c of coins) await dbPut("coins",c);
    for(const s of LIST_STORES) for(const x of lists[s]) await dbPut(s,x);
    S.readOnly=false; S.meta.readOnly=false; S.meta.changes=0; S.meta.needFull=false; S.meta.snapDirty=false; S.meta.lastBackup=new Date().toISOString(); await saveMeta();
    await reload();
  }finally{ _bulk--; }
  askPersist();
  S.meta.verify={at:new Date().toISOString(),coins:coins.length,files:blobs.length,fixed:0}; await saveMeta();
}
async function uploadSnapshot(kind){
  const {blob,name}=await buildBackup(kind||"snapshot"); await dbxUpload("/snapshots/"+name,blob,"add");
  await setDbx({lastSnap:new Date().toISOString(),lastSnapSize:blob.size}); return name;
}
async function maybeSnapshot(force){
  if(!dbxOn()||S.readOnly||!S.coins.length) return;
  if(!force){ if(!S.meta.snapDirty||S.meta.lastSnapDay===todayStr()) return; if((S.meta.dbx||{}).wifiOnly!==false&&onCellular()) return; }
  if(force) toast("Making a snapshot…");
  await uploadSnapshot("snapshot"); S.meta.lastSnapDay=todayStr(); S.meta.snapDirty=false; await saveMeta(); refreshDbxPanel();
  if(force) toast("Snapshot saved to Dropbox");
  pruneSnapshots().catch(()=>{});
}
async function pruneSnapshots(){
  const list=(await dbxList("/snapshots")).sort((a,b)=>String(b.server_modified).localeCompare(String(a.server_modified)));
  const now=Date.now(), months=new Set();
  for(const e of list){ const t=new Date(e.server_modified), age=(now-t)/864e5;
    if(age<=SNAP_DAILY_DAYS) continue;
    const m=t.getFullYear()+"-"+t.getMonth();
    if(age<=SNAP_MONTHS*31&&!months.has(m)){ months.add(m); continue; }
    await dbxApi("files/delete_v2",{path:e.path_lower}); }
}
async function dbxListBackups(){
  const el=$("#dbxList"); if(!el) return; el.innerHTML=`<p class="muted small">Looking in Dropbox…</p>`;
  try{ const list=(await dbxList("/snapshots")).filter(e=>/\.zip$/i.test(e.name)).sort((a,b)=>String(b.server_modified).localeCompare(String(a.server_modified)));
    el.innerHTML=list.length?`<div class="lst">${list.slice(0,60).map(e=>`<div class="item"><div><b>${esc(fmtWhen(e.server_modified))}</b><div class="muted small">${/before-restore/.test(e.name)?"Before a restore · ":""}${(e.size/1048576).toFixed(1)} MB</div></div><button type="button" class="btn sm" data-dbxget="${esc(e.path_lower)}">Use this</button></div>`).join("")}</div>`:`<p class="muted small">No snapshots in Dropbox yet.</p>`;
  }catch(e){ el.innerHTML=`<p class="small warnTxt">Couldn't list Dropbox snapshots: ${esc(e.message||e)}</p>`; }
}
async function dbxDisconnect(){
  try{ await dbxApi("auth/token/revoke"); }catch{}
  const dx=S.meta.dbx||{}; S.meta.dbx={appKey:dx.appKey,wifiOnly:dx.wifiOnly}; S.readOnly=false; S.meta.readOnly=false; await saveMeta(); clearTimeout(_syncT); render(); toast("Dropbox disconnected — everything already in Dropbox is kept");
}
function refreshDbxPanel(){ const el=$("#dbxPanel"); if(el) el.outerHTML=dbxPanel(); hdrStatus(); }
function dbxPanel(){
  const dx=S.meta.dbx||{}, ch=S.meta.changes||0, v=S.meta.verify;
  if(!dbxOn()) return `<div class="panel" id="dbxPanel"><h3>Dropbox</h3>
    <p class="m0">Connect Dropbox and your collection is kept there as well as on this ${devWord()}: each coin and photo is sent within seconds of saving, and a full snapshot is kept each day. If this ${devWord()} is cleared, lost or replaced, connect Dropbox on the new one and everything comes back.</p>
    ${dx.lastError?`<p class="small warnTxt m0">${esc(dx.lastError)}</p>`:""}
    ${DBX_APP_KEY?"":`<div class="field"><label for="dbxKey">Dropbox App key</label><input id="dbxKey" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(dx.appKey||"")}" placeholder="from the Dropbox App Console"></div>`}
    <div class="row"><button type="button" class="btn primary" data-dbxconnect>Connect Dropbox</button></div>
    ${DBX_APP_KEY?"":`<p class="muted small m0">First time: create the app at dropbox.com/developers/apps (steps in the README). Its Redirect URI must be exactly <code class="sel">${esc(dbxRedirect())}</code></p>`}</div>`;
  const status=S.readOnly?`View only — replaced by ${esc((S.meta.owner||{}).name||"another device")}`:_syncing?"Syncing now…":ch?`${ch} change${ch===1?"":"s"} waiting to send`:"All changes in Dropbox ✓";
  return `<div class="panel" id="dbxPanel"><h3>Dropbox</h3>
    <dl class="dbxst"><dt>Account</dt><dd>${esc(dx.email||dx.name||"Connected")}</dd>
    <dt>This ${devWord()}</dt><dd>${S.readOnly?"View only":"Main device"}</dd>
    <dt>Status</dt><dd>${status}</dd>
    <dt>Last sync</dt><dd>${S.meta.lastSync?fmtWhen(S.meta.lastSync):"Not yet"}</dd>
    <dt>Last check</dt><dd>${v?`${fmtWhen(v.at)} · ${v.coins} coins, ${v.files} photos${v.fixed?` · fixed ${v.fixed}`:" · all match ✓"}`:"Not yet"}</dd>
    <dt>Last snapshot</dt><dd>${dx.lastSnap?`${fmtWhen(dx.lastSnap)} · ${(dx.lastSnapSize/1048576).toFixed(1)} MB`:"Not yet"}</dd>
    ${dx.lastError?`<dt>Problem</dt><dd class="warnTxt">${esc(dx.lastError)}${dx.lastErrorAt?` (${fmtWhen(dx.lastErrorAt)})`:""}</dd>`:""}</dl>
    <label class="check-inline"><input type="checkbox" id="dbxWifi" ${dx.wifiOnly!==false?"checked":""}><span>Daily snapshots on Wi-Fi only <span class="muted small">(coins and photos always send straight away)</span></span></label>
    <div class="row">${S.readOnly?`<button type="button" class="btn primary" data-dbxtake>Make this the main ${devWord()}</button>`:`<button type="button" class="btn primary" data-dbxsync ${_syncing?"disabled":""}>Sync now</button><button type="button" class="btn" data-dbxcheck ${_syncing?"disabled":""}>Check Dropbox copy</button><button type="button" class="btn" data-dbxsnap ${_syncing?"disabled":""}>Snapshot now</button>`}<button type="button" class="btn ghost" data-dbxoff>Disconnect</button></div>
    <p class="muted small m0">In Dropbox › Apps › <i>your app's name</i>: <b>live</b> is the current collection (one file per coin, photo and receipt), <b>snapshots</b> holds daily full backups (every day for ${SNAP_DAILY_DAYS} days, then one a month for ${SNAP_MONTHS} months), and <b>deleted</b> keeps anything you delete.</p></div>`;
}
