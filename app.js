/* MyMint — screens, coin records, search & filters, Numista lookups, albums, wants, reports. */
"use strict";

/* ================= state ================= */
const S={coins:[],wanted:[],settings:[],receipts:[],meta:{},urls:{},tab:"coins",q:"",f:{},stack:[],moreView:null,readOnly:false};
const FDEF={grp:[],denom:"",coll:"",series:"",yFrom:"",yTo:"",mint:"",grade:"",finish:"",pack:"",colour:"",how:"",storage:"",photos:"",status:"owned",todo:false,dupes:false,sets:false};
S.f=clone(FDEF);
const view=()=>S.meta.view||(S.meta.view={mode:"grid",size:"m",sort:"year-desc",group:"denom"});

/* ================= reference lists ================= */
const DENOMS=[
  {k:"$10",face:"$10",grp:"big",metal:"silver"},{k:"$5",face:"$5",grp:"big",metal:"silver"},
  {k:"$2",face:"$2",grp:"two",metal:"gold"},{k:"$1",face:"$1",grp:"one",metal:"gold"},
  {k:"50c",face:"50c",grp:"fifty",metal:"silver",shape:"dodeca"},{k:"20c",face:"20c",grp:"twenty",metal:"silver"},
  {k:"10c",face:"10c",grp:"small",metal:"silver"},{k:"5c",face:"5c",grp:"small",metal:"silver"},
  {k:"2c",face:"2c",grp:"bronze",metal:"copper"},{k:"1c",face:"1c",grp:"bronze",metal:"copper"},
  {k:"Crown",face:"5/-",grp:"pre",metal:"silver"},{k:"Florin",face:"2/-",grp:"pre",metal:"silver"},{k:"Shilling",face:"1/-",grp:"pre",metal:"silver"},
  {k:"Sixpence",face:"6d",grp:"pre",metal:"silver"},{k:"Threepence",face:"3d",grp:"pre",metal:"silver"},{k:"Penny",face:"1d",grp:"pre",metal:"copper"},{k:"Halfpenny",face:"½d",grp:"pre",metal:"copper"},
  {k:"Other",face:"?",grp:"other",metal:"silver"}];
const GROUPS={
  big:{label:"$5 & up",solid:"#DB2777",tint:"#FCE7F3",text:"#9D174D",badge:"$5+"},
  two:{label:"$2 coins",solid:"#D97706",tint:"#FFF4DB",text:"#92400E",badge:"$2"},
  one:{label:"$1 coins",solid:"#65A30D",tint:"#ECFCCB",text:"#3F6212",badge:"$1"},
  fifty:{label:"50 cents",solid:"#0D9488",tint:"#DDF5F2",text:"#115E59",badge:"50"},
  twenty:{label:"20 cents",solid:"#7C3AED",tint:"#EDE9FE",text:"#5B21B6",badge:"20"},
  small:{label:"10c & 5c",solid:"#0284C7",tint:"#E0F2FE",text:"#075985",badge:"10"},
  bronze:{label:"2c & 1c",solid:"#B45309",tint:"#FDECD8",text:"#7C2D12",badge:"1c"},
  pre:{label:"Pre-decimal",solid:"#E8553B",tint:"#FFE8E1",text:"#9A3412",badge:"d"},
  other:{label:"Other",solid:"#475569",tint:"#E2E8F0",text:"#1E293B",badge:"?"}};
const GRP_ORDER=["big","two","one","fifty","twenty","small","bronze","pre","other"];
const GRADES=["G","VG","F","VF","EF","aUNC","UNC","BU"];
const GRADE_NAMES={G:"Good",VG:"Very Good",F:"Fine",VF:"Very Fine",EF:"Extremely Fine",aUNC:"About Uncirculated",UNC:"Uncirculated",BU:"Brilliant Uncirculated"};
const GRADE_HINTS={G:"Good (4–6): heavily worn, design mostly flat, date readable.",VG:"Very Good (8–10): central detail worn flat, rims full.",F:"Fine (12–15): about half the detail worn, lettering sharp.",VF:"Very Fine (20–35): light to moderate wear, major features clear.",EF:"Extremely Fine (40–45): only the high points lightly worn.",aUNC:"About Uncirculated (50–58): trace of rub on the highest points.",UNC:"Uncirculated (60–70): no wear at all.",BU:"Brilliant Uncirculated: no wear, full original lustre."};
const FINISHES=["Circulating","Uncirculated","Frosted uncirculated","Proof","Specimen"];
const PACKS=["Loose","Card","RAM card","DCPL card","Set / folder","Box / case","Tin","Roll / tube","Capsule","Flip","2x2 holder","Slab","Album"];
const PACK_OTHER="Other…";
const HOWS=["Bought","Noodled","Gift","Swapped","Inherited"];
const STATUSES=["In collection","Sold","Traded"];
const SIDES=["Obverse","Reverse","Card / packaging","Edge","Slab label","Certificate","Other"];
const SOURCES=["Numista","Royal Australian Mint","Perth Mint","Dealer","Other"];
const COLLS=["Decimal","Pre-decimal","World"];
const MINTS=["None","C","S","M","P","B","A","Privy mark"];

const dInfo=k=>DENOMS.find(d=>d.k===k)||DENOMS[DENOMS.length-1];
const grpOf=c=>c.denom?dInfo(c.denom).grp:"other";
const themeOf=c=>GROUPS[grpOf(c)];
const isOwned=c=>!["Sold","Traded"].includes(c.status);
const qtyOf=c=>Math.max(1,+c.qty||1);
const setSize=c=>c.isSet?((c.setItems||[]).length||Math.max(1,parseInt(c.setCount,10)||1)):1;
const coinsIn=c=>qtyOf(c)*setSize(c);
const collOf=c=>c.collection||(grpOf(c)==="pre"?"Pre-decimal":(c.country&&!/australia/i.test(c.country))?"World":"Decimal");
function autoTitle(c){ return [c.year,c.denom,c.series].filter(x=>!blank(x)).join(" "); }
/* A set looked up on Numista takes one coin's name ("… Olympic Team - Black"); show the name all its coins share instead */
function setCommon(items){ const ts=(items||[]).map(i=>String(i.title||"").trim()).filter(Boolean); if(ts.length<2) return null;
  let l=ts[0]; for(const t of ts) while(l&&!t.startsWith(l)) l=l.slice(0,-1);
  let cut=-1; for(const m of l.matchAll(/\s[-–]\s|;\s|\s\(|,\s/g)) cut=m.index; if(ts.every(t=>t===l)) cut=l.length;
  if(cut<6) return null; const raw=l.slice(0,cut).trim(); const open=(raw.match(/\(/g)||[]).length-(raw.match(/\)/g)||[]).length;
  return {raw,name:raw+")".repeat(Math.max(0,open))}; }
function setItemLabel(it,com){ const t=String(it.title||"").trim(); if(!com||!t.startsWith(com.raw)) return t; return t.slice(com.raw.length).replace(/^\s*[-–;,(]\s*/,"").replace(/\)+\s*$/,"").trim()||t; }
function titleOf(c){ const t=(c.title||"").trim();
  if(c.isSet){ const com=setCommon(c.setItems); if(com&&(!t||t.startsWith(com.raw))) return com.name; }
  return t||autoTitle(c)||"Untitled coin"; }
/* which coins in a set the search words point at, e.g. "green" → Green */
function setHits(c,q){ if(!c.isSet||!q||!q.trim()) return []; const items=c.setItems||[]; if(items.length<2) return [];
  const terms=norm(q.replace(/(\d{4})\s*(?:-|–|to|\.\.)\s*(\d{4})/g," ")).split(" ").filter(Boolean); if(!terms.length) return [];
  const own=" "+norm([titleOf(c),c.series,c.year,c.denom,denomWords(c.denom)].join(" "))+" ";
  const tx=it=>" "+norm([it.title,it.year,it.series,it.denom,denomWords(it.denom)].join(" "))+" ";
  const hit=items.filter(it=>{ const h=tx(it); return terms.every(t=>/^\d+$/.test(t)?h.includes(" "+t+" ")||own.includes(" "+t+" "):h.includes(" "+t)||own.includes(" "+t)); });
  if(!hit.length||hit.length===items.length) return []; const com=setCommon(items); return hit.map(it=>setItemLabel(it,com)); }
function hitLine(c){ const h=setHits(c,S.q); return h.length?`<span class="sethit">✓ Includes ${esc(h.join(", "))}</span>`:""; }
const yearNum=c=>{ const m=String(c.year||"").match(/\d{4}/); return m?+m[0]:null; };
function gradeText(c){ return c.grade?(c.grade+(c.sheldon?"-"+c.sheldon:"")):""; }
function gradeStyle(g){ g=String(g||""); if(/UNC|BU/.test(g)) return "background:#DCFCE7;color:#166534"; if(/^EF/.test(g)) return "background:#DBEAFE;color:#1E40AF"; if(/^VF/.test(g)) return "background:#FEF3C7;color:#92400E"; return "background:#E5E7EB;color:#374151"; }
function gradePill(c){ const g=gradeText(c); if(g) return `<span class="grade" style="${gradeStyle(c.grade)}">${esc(g)}</span>`; if(c.finish==="Proof") return `<span class="grade" style="background:#F3E8FF;color:#6B21A8">Proof</span>`; return ""; }
const mine=c=>(c.photos||[]).filter(p=>p.mine);
function coverOf(c){ const ph=c.photos||[]; return ph.find(p=>p.id===c.coverId)||ph.find(p=>p.mine&&p.side==="Reverse")||ph.find(p=>p.mine)||ph.find(p=>p.side==="Reverse")||ph[0]||null; }
function todoOf(c){ const t=[]; if(blank(c.year)) t.push("year"); if(!c.grade&&c.finish!=="Proof") t.push("grade"); if(!mine(c).length) t.push("your photos"); if(blank(c.storage)) t.push("storage location"); if(c.acqHow==="Bought"&&blank(c.price)) t.push("price paid"); return t; }
function imgTag(p,attrs){ return p.url?`<img src="${esc(p.url)}" alt="" referrerpolicy="no-referrer" onerror="this.style.opacity=0" ${attrs||""}>`:`<img data-fid="${esc(p.id)}" alt="" ${attrs||""}>`; }
function drawnCoin(c){ const d=dInfo(c.denom); return `<div class="coin m-${d.metal} ${d.shape||""}">${esc(c.denom?d.face:"?")}</div>`; }
function faceHTML(c){ const p=coverOf(c); return `<div class="face">${p?imgTag(p):drawnCoin(c)}</div>`; }
const fmtNum=n=>blank(n)?"":isNaN(+n)?String(n):Number(n).toLocaleString("en-AU");
const unit=(v,u)=>blank(v)?"":`${v}${/[a-z]$/i.test(String(v))?"":" "+u}`;

/* ================= search & filters ================= */
const norm=s=>String(s??"").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9$½]+/g," ").trim();
function denomWords(d){ if(!d) return ""; let m=d.match(/^\$(\d+)/); if(m) return `${m[1]} dollar dollars`; m=d.match(/^(\d+)c$/); if(m) return `${m[1]} cent cents`; return "pre decimal predecimal"; }
function hay(c){ if(c._h&&c._hv===c.updatedAt) return c._h;
  const parts=[titleOf(c),c.country,c.denom,denomWords(c.denom),c.year,c.mint&&("mint "+c.mint),c.series,c.variety,c.effigy,c.reverseDesigner,c.colourised?"coloured colour colourised color":"",c.isSet?"set":"",c.grade,GRADE_NAMES[c.grade],c.finish,c.packaging,c.serial,c.source,c.acqHow,c.storage,c.status,c.composition,c.edge,collOf(c),c.notes,c.history,c.ns&&c.ns.id?("n"+c.ns.id+" "+c.ns.id):"",c.ns&&c.ns.refs,c.setContents,(c.setItems||[]).map(it=>[it.title,it.year,it.series].filter(Boolean).join(" ")).join(" ")];
  const h=" "+norm(parts.filter(Boolean).join(" "))+" "; Object.defineProperty(c,"_h",{value:h,writable:true,enumerable:false,configurable:true}); Object.defineProperty(c,"_hv",{value:c.updatedAt,writable:true,enumerable:false,configurable:true}); return h; }
function matchQuery(c,q){
  if(!q.trim()) return true; let rest=q;
  const rng=[...q.matchAll(/(\d{4})\s*(?:-|–|to|\.\.)\s*(\d{4})/g)];
  for(const m of rng){ const y=yearNum(c); if(y==null||y<+m[1]||y>+m[2]) return false; rest=rest.replace(m[0]," "); }
  const h=hay(c);
  for(const t of norm(rest).split(" ").filter(Boolean)){
    if(/^\d{4}$/.test(t)){ if(String(yearNum(c))===t) continue; if(h.includes(" "+t)) continue; return false; }
    if(/^\d+$/.test(t)){ if(!h.includes(" "+t+" ")) return false; continue; }
    if(!h.includes(" "+t)) return false;
  }
  return true;
}
function passFilters(c,f,skip){
  const sk=k=>skip===k;
  if(f.status==="owned"&&!isOwned(c)) return false; if(f.status==="sold"&&isOwned(c)) return false;
  if(!sk("grp")&&f.grp.length&&!f.grp.includes(grpOf(c))) return false;
  if(f.denom&&c.denom!==f.denom) return false;
  if(f.coll&&collOf(c)!==f.coll) return false;
  if(f.series&&(c.series||"")!==f.series) return false;
  const y=yearNum(c); if(f.yFrom&&(y==null||y<+f.yFrom)) return false; if(f.yTo&&(y==null||y>+f.yTo)) return false;
  if(f.mint&&(c.mint||"")!==f.mint) return false;
  if(f.grade&&c.grade!==f.grade) return false;
  if(f.finish&&c.finish!==f.finish) return false;
  if(f.pack&&c.packaging!==f.pack) return false;
  if(f.colour==="yes"&&c.colourised!==true) return false; if(f.colour==="no"&&c.colourised===true) return false;
  if(f.how&&c.acqHow!==f.how) return false;
  if(f.storage&&(c.storage||"")!==f.storage) return false;
  if(f.photos==="mine"&&!mine(c).length) return false; if(f.photos==="none"&&mine(c).length) return false;
  if(!sk("todo")&&f.todo&&!todoOf(c).length) return false;
  if(!sk("dupes")&&f.dupes&&qtyOf(c)<2) return false;
  if(f.sets&&!c.isSet) return false;
  return true;
}
function activeFilters(){ const f=S.f, a=[];
  const add=(k,label)=>a.push({k,label});
  if(f.denom) add("denom",f.denom); if(f.coll) add("coll",f.coll); if(f.series) add("series","Series: "+f.series);
  if(f.yFrom||f.yTo) add("year",f.yFrom&&f.yTo?`${f.yFrom}–${f.yTo}`:f.yFrom?`From ${f.yFrom}`:`Up to ${f.yTo}`);
  if(f.mint) add("mint","Mint mark: "+f.mint); if(f.grade) add("grade","Grade: "+f.grade); if(f.finish) add("finish",f.finish); if(f.pack) add("pack",f.pack);
  if(f.colour) add("colour",f.colour==="yes"?"Coloured":"Not coloured"); if(f.how) add("how",f.how); if(f.storage) add("storage","In: "+f.storage);
  if(f.photos) add("photos",f.photos==="mine"?"Has my photos":"No photos yet"); if(f.status!=="owned") add("status",f.status==="all"?"Incl. sold":"Sold / traded");
  if(f.sets) add("sets","Sets only");
  return a; }
function clearFilter(k){ const f=S.f; if(k==="year"){ f.yFrom=""; f.yTo=""; } else if(k==="status") f.status="owned"; else f[k]=FDEF[k]; }
function sorted(list){ const s=view().sort, by=(fn,dir)=>list.sort((a,b)=>{ const x=fn(a),y=fn(b); if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; return (x<y?-1:x>y?1:0)*dir; });
  const dIdx=c=>DENOMS.indexOf(dInfo(c.denom));
  if(s==="year-asc") by(yearNum,1); else if(s==="year-desc") by(yearNum,-1);
  else if(s==="title") list.sort((a,b)=>titleOf(a).localeCompare(titleOf(b)));
  else if(s==="added") by(c=>c.addedAt||"",-1);
  else if(s==="value") by(c=>blank(c.value)?null:+c.value,-1);
  else if(s==="mintage") by(c=>blank(c.mintage)?null:+c.mintage,1);
  else if(s==="denom") list.sort((a,b)=>dIdx(a)-dIdx(b)||((yearNum(b)||0)-(yearNum(a)||0)));
  return list; }
function results(){ return sorted(S.coins.filter(c=>passFilters(c,S.f)&&matchQuery(c,S.q))); }
function groupsOf(list){ const g=view().group; if(g==="none") return [{key:"all",label:"",items:list}];
  const map=new Map(); const keyOf=c=>g==="denom"?grpOf(c):g==="series"?(c.series||""):g==="decade"?(yearNum(c)?Math.floor(yearNum(c)/10)*10+"s":""):g==="storage"?(c.storage||""):g==="collection"?collOf(c):"";
  for(const c of list){ const k=keyOf(c); if(!map.has(k)) map.set(k,[]); map.get(k).push(c); }
  let keys=[...map.keys()];
  if(g==="denom") keys.sort((a,b)=>GRP_ORDER.indexOf(a)-GRP_ORDER.indexOf(b));
  else if(g==="decade") keys.sort((a,b)=>(b||"0").localeCompare(a||"0"));
  else keys.sort((a,b)=>(a===""?1:b===""?-1:a.localeCompare(b)));
  const blankLbl={series:"No series",decade:"Year not recorded",storage:"Storage not recorded"}[g]||"Other";
  return keys.map(k=>({key:k,label:g==="denom"?GROUPS[k].label:(k||blankLbl),theme:g==="denom"?GROUPS[k]:null,items:map.get(k)})); }

/* ================= render: main tabs ================= */
function render(){
  document.querySelectorAll("nav.tabs [data-tab]").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===S.tab?"page":"false"));
  const wb=$("#wantBadge"), wn=S.wanted.filter(w=>!w.got).length; wb.hidden=!wn; wb.textContent=wn;
  const m=$("#main");
  m.innerHTML=S.tab==="coins"?viewCoins():S.tab==="albums"?viewAlbums():S.tab==="wants"?viewWants():viewMore();
  hydrateImages(m); hdrStatus();
}
function backupBanner(){
  if(S.readOnly) return `<div class="banner"><span>View only — another ${devWord()} is now the main one.</span><button type="button" class="btn sm" data-more-go="backup">Details</button></div>`;
  const ch=S.meta.changes||0, last=S.meta.lastBackup, dx=S.meta.dbx||{};
  if(dbxOn()){ if(dx.lastError&&ch) return `<div class="banner"><span>Dropbox sync didn't work: ${esc(dx.lastError)}</span><button type="button" class="btn sm" data-more-go="backup">Fix</button></div>`; return ""; }
  if(!S.coins.length) return "";
  const days=last?Math.floor((Date.now()-new Date(last))/864e5):null;
  if(!last) return `<div class="banner"><span>Your collection lives only on this ${devWord()}. Connect Dropbox so it's kept safe automatically.</span><button type="button" class="btn sm amber" data-more-go="backup">Set up</button></div>`;
  if(ch&&days>=30) return `<div class="banner"><span>${ch} changes since your last backup ${days} days ago.</span><button type="button" class="btn sm amber" data-more-go="backup">Back up</button></div>`;
  return "";
}
function viewCoins(){
  const v=view(), owned=S.coins.filter(isOwned), nCoins=owned.reduce((a,c)=>a+coinsIn(c),0);
  const val=owned.reduce((a,c)=>a+(blank(c.value)?0:+c.value*qtyOf(c)),0), paid=owned.reduce((a,c)=>{ const p=costEach(c); return a+(p==null?0:p*qtyOf(c)); },0);
  const wants=S.wanted.filter(w=>!w.got).length;
  if(!S.coins.length) return `<section class="view"><div class="hero"><div class="stats"><div class="stat"><b>0</b><span>Coins</span></div><div class="stat"><b>—</b><span>Value</span></div><div class="stat"><b>${wants}</b><span>Wanted</span></div></div></div>${backupBanner()}
    <div class="empty"><b>No coins on this ${devWord()} yet</b><span>${dbxOn()?"Connected to Dropbox, but there's no collection there yet.":"New phone, or cleared Chrome? Connect Dropbox and your collection downloads automatically. To load your starter list, restore the backup file you were given."}</span>
    <div class="row" style="justify-content:center">${dbxOn()?"":`<button type="button" class="btn primary" data-dbxconnect>Get my collection from Dropbox</button>`}<button type="button" class="btn" data-restore>Restore backup file</button><button type="button" class="btn amber" data-add>Add a coin</button></div></div></section>`;
  const present=GRP_ORDER.filter(g=>S.coins.some(c=>grpOf(c)===g&&passFilters(c,S.f,"grp")));
  const nTodo=S.coins.filter(c=>passFilters(c,{...S.f,todo:false},"todo")&&todoOf(c).length).length;
  const nDup=S.coins.filter(c=>passFilters(c,{...S.f,dupes:false},"dupes")&&qtyOf(c)>1).length;
  const act=activeFilters();
  return `<section class="view">
  <div class="hero">
    <div class="stats">
      <button type="button" class="stat" data-more-go="stats"><b style="color:#4338CA">${nCoins}</b><span>Coins</span></button>
      <button type="button" class="stat" data-more-go="stats"><b style="color:#0F766E">${val?aud(Math.round(val)):paid?aud(Math.round(paid)):"—"}</b><span>${val?"Current value":"Total cost"}</span></button>
      <button type="button" class="stat" data-tab="wants"><b style="color:#C2410C">${wants}</b><span>Wanted</span></button>
    </div>
    <div class="searchbar"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label for="q" class="sr">Search coins</label><input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search: 2022 bee, Vietnam, safe, 1966-1970…" value="${esc(S.q)}">
      <button type="button" class="clear" data-clearq aria-label="Clear search" ${S.q?"":"hidden"}>×</button></div>
  </div>
  ${backupBanner()}
  <div class="tools">
    <div class="seg" role="group" aria-label="View"><button type="button" data-mode="grid" aria-pressed="${v.mode==="grid"}">Grid</button><button type="button" data-mode="list" aria-pressed="${v.mode==="list"}">List</button><button type="button" data-tab="albums" aria-pressed="false">Albums</button></div>
    ${v.mode==="grid"?`<div class="seg light" role="group" aria-label="Tile size">${["s","m","l"].map(s=>`<button type="button" data-size="${s}" aria-pressed="${v.size===s}" aria-label="${{s:"Small",m:"Medium",l:"Large"}[s]} tiles">${s.toUpperCase()}</button>`).join("")}</div>`:""}
  </div>
  <div class="chips">
    <button type="button" class="fbtn" data-filters><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters${act.length?`<b>${act.length}</b>`:""}</button>
    ${present.map(g=>`<button type="button" class="chip" data-grp="${g}" aria-pressed="${S.f.grp.includes(g)}"><i style="background:${GROUPS[g].solid}"></i>${GROUPS[g].label}</button>`).join("")}
    ${nTodo||S.f.todo?`<button type="button" class="chip" data-qf="todo" aria-pressed="${S.f.todo}">To finish · ${nTodo}</button>`:""}
    ${nDup||S.f.dupes?`<button type="button" class="chip" data-qf="dupes" aria-pressed="${S.f.dupes}">Duplicates · ${nDup}</button>`:""}
  </div>
  ${act.length?`<div class="chips wrapy">${act.map(a=>`<button type="button" class="chip x" data-unf="${a.k}" aria-label="Remove filter ${esc(a.label)}">${esc(a.label)} ×</button>`).join("")}<button type="button" class="chip" data-clearall>Clear all</button></div>`:""}
  <div id="results">${resultsHTML()}</div>
  </section>`;
}
function resultsHTML(){
  const v=view(), list=results(), n=list.reduce((a,c)=>a+coinsIn(c),0);
  const filtered=!!(S.q.trim()||activeFilters().length||S.f.grp.length||S.f.todo||S.f.dupes);
  const meta=`<div class="metarow"><span class="count">${filtered?`${list.length} match${list.length===1?"":"es"}`:`${list.length} record${list.length===1?"":"s"}`}${n!==list.length?` · ${n} coins`:""}</span>
    <span class="row" style="gap:6px"><label class="sr" for="sortSel">Sort</label><select id="sortSel">${[["year-desc","Newest year"],["year-asc","Oldest year"],["denom","Denomination"],["title","Name A–Z"],["added","Recently added"],["value","Highest value"],["mintage","Lowest mintage"]].map(([k,l])=>`<option value="${k}" ${v.sort===k?"selected":""}>${l}</option>`).join("")}</select>
    <label class="sr" for="groupSel">Group by</label><select id="groupSel">${[["denom","Group: denomination"],["series","Group: series"],["decade","Group: decade"],["storage","Group: storage"],["collection","Group: collection"],["none","No groups"]].map(([k,l])=>`<option value="${k}" ${v.group===k?"selected":""}>${l}</option>`).join("")}</select></span></div>`;
  if(!list.length) return meta+`<div class="empty"><b>No coins match</b><span>Try fewer words, or clear a filter.</span>${activeFilters().length||S.q||S.f.grp.length||S.f.todo||S.f.dupes?`<button type="button" class="btn" data-clearall>Clear search &amp; filters</button>`:""}</div>`;
  return meta+groupsOf(list).map(g=>`${g.label?`<div class="ghead"><h2>${g.theme?`<span class="gico" style="background:${g.theme.solid}">${esc(g.theme.badge)}</span>`:""}${esc(g.label)}</h2><span class="gcount" style="${g.theme?`background:${g.theme.tint};color:${g.theme.text}`:"background:#E6E8F2;color:#374151"}">${g.items.length}</span></div>`:""}
    ${v.mode==="list"?`<div class="listbox">${g.items.map(rowHTML).join("")}</div>`:`<div class="tiles ${v.size==="m"?"":v.size}">${g.items.map(tileHTML).join("")}</div>`}`).join("");
}
function tileHTML(c){ const t=themeOf(c), p=coverOf(c);
  return `<button type="button" class="tile" style="background:${t.tint}" data-open="${c.id}">${faceHTML(c)}${p&&!p.mine?`<span class="reftag">REF</span>`:""}${qtyOf(c)>1?`<span class="qty">×${qtyOf(c)}</span>`:""}
    <span class="yr" style="color:${t.text}">${esc(c.year||"—")}</span>${(n=>`<span class="nm"><b>${esc(n.main)}</b>${n.sub?`<small>${esc(n.sub)}</small>`:""}</span>`)(nameParts(c))}${c.isSet?`<span class="setb">Set of ${setSize(c)}</span>`:""}${hitLine(c)}${gradePill(c)}</button>`; }
/* Numista titles read "2 Dollars - Elizabeth II (4th portrait - Australian Olympic Team)": lead with the subject, keep the rest underneath */
function nameParts(c){ const t=titleOf(c); const yr=String(c.year||"").replace(/[^\d]/g,""); const noYr=s=>(yr?s.replace(new RegExp("^"+yr+"\\s+"),""):s)||s;
  const m=t.match(/^(.*?)\s+-\s+([^()]+?)\s*\((.+)\)\s*$/);
  if(m){ const subj=m[3].split(/\s+-\s+|;\s*/).map(x=>x.trim()).filter(x=>x&&!/portrait$/i.test(x)).join(" · ");
    if(subj) return {main:subj,sub:[m[1].trim(),m[2].trim()].join(" · ")}; }
  return {main:noYr(t),sub:""}; }
function shortName(c){ const t=titleOf(c); let s=t.replace(new RegExp("^"+String(c.year||"").replace(/[^\d]/g,"")+"\\s*"),""); return s||t; }
function rowHTML(c){ const p=coverOf(c), t=themeOf(c);
  return `<button type="button" class="lrow" data-open="${c.id}">${faceHTML(c)}<span class="tx"><span class="t1">${esc(nameParts(c).main)}</span>${hitLine(c)}<span class="t2">${esc([nameParts(c).sub||c.denom,c.mint&&c.mint!=="None"?"Mint "+c.mint:"",c.packaging,c.storage].filter(Boolean).join(" · ")||"Tap to add details")}</span></span>
    <span class="rt">${c.isSet?`<span class="setb">Set of ${setSize(c)}</span>`:""}${gradePill(c)}${qtyOf(c)>1?`<span>×${qtyOf(c)}</span>`:""}${p&&!p.mine?`<span style="color:var(--ref);font-size:10px;font-weight:800">REF PHOTO</span>`:""}<i style="width:8px;height:8px;border-radius:4px;background:${t.solid}"></i></span></button>`; }

/* ---------- albums ---------- */
function progBar(o,w,t){ const T=Math.max(1,t); return `<div class="prog" role="progressbar" aria-valuenow="${o}" aria-valuemin="0" aria-valuemax="${t}" aria-label="Owned ${o} of ${t}"><i style="width:${o/T*100}%;background:#0D9488"></i><i style="width:${w/T*100}%;background:#F59E0B"></i></div>`; }
function viewAlbums(){
  const al=albumData(), tl=typeLists();
  return `<section class="view"><div class="hero" style="padding-top:12px"><h1 style="color:#fff;font-size:22px">Albums</h1><p class="m0" style="color:var(--on-indigo);font-size:13px">Coins grouped by theme or series, with gaps for the ones on your want list.</p></div>
  ${al.length?`<div class="listbox">${al.map(a=>{ const o=a.units.length,w=a.wants.length; const u0=a.units[0]; return `<button type="button" class="alb" data-album="${esc(a.key)}">${u0?unitFace(u0,48):`<span class="gico" style="background:#F59E0B;width:48px;height:48px;border-radius:24px">♡</span>`}<span class="tx"><b>${esc(a.key)}</b><span class="muted small">${o} owned${w?` · ${w} wanted`:""}</span>${w?progBar(o,0,o+w):""}</span><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></button>`; }).join("")}</div>`
   :`<div class="empty"><b>No albums yet</b><span>Give coins a Theme / series (for example "Australian Dinosaurs") and they gather here. Add wants with the same series to see the gaps.</span></div>`}
  ${tl.length?`<h2 style="font-size:16px;font-weight:800;margin-top:6px">Year checklists</h2><p class="m0 muted small">Every year and mint mark Numista lists for these coin types.</p><div class="listbox">${tl.map(t=>{ const own=t.issues.filter(i=>ownsIssue(t.id,i)).length; return `<button type="button" class="alb" data-tlist="${t.id}"><span class="tx"><b>${esc(t.title)}</b><span class="muted small">${own} of ${t.issues.length} issues</span>${progBar(own,0,t.issues.length)}</span><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></button>`; }).join("")}</div>`:""}
  </section>`;
}
function units(){ const out=[]; for(const c of S.coins.filter(isOwned)){ const items=c.isSet?(c.setItems||[]):[];
    if(items.length){ for(const it of items) out.push({open:c.id,coin:c,item:it,ns:it.ns,year:it.year||c.year,mint:it.mint||"",denom:it.denom||c.denom,series:c.series||it.series||"",title:it.title||titleOf(c)}); }
    else out.push({open:c.id,coin:c,ns:c.ns,year:c.year,mint:c.mint||"",denom:c.denom,series:c.series||"",title:titleOf(c)}); }
  return out; }
function unitFace(u,size){ const st=`style="--face:${size}px;width:${size}px;height:${size}px"`; if(!u.item) return faceHTML(u.coin).replace('class="face"',`class="face" ${st}`); const p=(u.item.photos||[]).find(p=>p.side==="Reverse")||(u.item.photos||[])[0]; return `<div class="face" ${st}>${p?imgTag(p):drawnCoin({denom:u.denom})}</div>`; }
const unitYear=u=>{ const m=String(u.year||"").match(/\d{4}/); return m?+m[0]:null; };
const unitTheme=u=>GROUPS[u.denom?dInfo(u.denom).grp:"other"];
function albumData(){
  const map=new Map(); const get=k=>{ if(!map.has(k)) map.set(k,{key:k,units:[],wants:[]}); return map.get(k); };
  for(const u of units()) if(u.series) get(u.series).units.push(u);
  for(const w of S.wanted.filter(w=>!w.got)) if(w.series) get(w.series).wants.push(w);
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
function typeLists(){ const m=new Map(); for(const u of units()){ const ns=u.ns; if(ns&&ns.id&&(ns.issues||[]).length>1){ const k=String(ns.id); if(!m.has(k)) m.set(k,{id:ns.id,title:ns.title||u.title,issues:ns.issues,units:[]}); m.get(k).units.push(u); } } return [...m.values()]; }
const issueMatch=(u,i)=>String(unitYear(u))===String(i.year)&&(((u.mint&&u.mint!=="None")?u.mint:"")===(i.mint||""));
function ownerOfIssue(nsId,i){ return units().find(u=>u.ns&&String(u.ns.id)===String(nsId)&&issueMatch(u,i)); }
const ownsIssue=(nsId,i)=>!!ownerOfIssue(nsId,i);

/* ---------- wants ---------- */
function viewWants(){
  const open=S.wanted.filter(w=>!w.got), got=S.wanted.filter(w=>w.got);
  return `<section class="view"><div class="hero" style="padding-top:12px"><h1 style="color:#fff;font-size:22px">Want list</h1><p class="m0" style="color:var(--on-indigo);font-size:13px">Coins you're hunting for. Tap "Got it" to turn one into a coin record.</p></div>
  <details class="fsec" ${open.length?"":"open"}><summary><span class="ico" style="background:#F59E0B"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>Add a want<span class="sp"></span></summary>
   <form id="wantForm" class="grid2">
    <div class="field full"><label for="w_title">What is it?</label><input id="w_title" name="title" required placeholder="e.g. 2023 $2 Coronation, mint mark C"></div>
    <div class="field"><label for="w_denom">Denomination</label><select id="w_denom" name="denom"><option value="">—</option>${DENOMS.map(d=>`<option>${d.k}</option>`).join("")}</select></div>
    <div class="field"><label for="w_year">Year</label><input id="w_year" name="year" inputmode="numeric" placeholder="e.g. 2023"></div>
    <div class="field full"><label for="w_series">Theme / series <span class="hint">puts it in that album</span></label><input id="w_series" name="series" list="dl_series" placeholder="e.g. Australian Dinosaurs"></div>
    <div class="field"><label for="w_target">Happy to pay up to (A$)</label><input id="w_target" name="target" inputmode="decimal"></div>
    <div class="field"><label for="w_notes">Notes</label><input id="w_notes" name="notes"></div>
    <div class="full"><button class="btn primary block" type="submit">Add to want list</button></div></form>${datalists()}</details>
  ${open.length?`<div class="lst">${open.map(w=>`<div class="item"><span class="gico" style="background:${GROUPS[w.denom?dInfo(w.denom).grp:"other"].solid}">${esc(w.denom?dInfo(w.denom).face:"?")}</span><div><b>${esc(w.title)}</b><div class="muted small">${esc([w.year,w.series,w.target?"up to "+aud(w.target):"",w.notes].filter(Boolean).join(" · "))}</div></div><button type="button" class="btn sm primary" data-wgot="${w.id}">Got it</button><button type="button" class="btn sm ghost" data-wdel="${w.id}" aria-label="Remove ${esc(w.title)}">×</button></div>`).join("")}</div>`:`<div class="empty"><b>Nothing on your want list</b><span>Add the coins you're looking for — they also show as gaps in your albums.</span></div>`}
  ${got.length?`<details class="fsec"><summary>Found (${got.length})<span class="sp"></span></summary><div class="lst">${got.map(w=>`<div class="item"><div><b>${esc(w.title)}</b><div class="muted small">Found${w.gotAt?" "+fmtDate(w.gotAt.slice(0,10)):""}</div></div><button type="button" class="btn sm ghost" data-wdel="${w.id}" aria-label="Remove">×</button></div>`).join("")}</div></details>`:""}
  </section>`;
}

/* ---------- more ---------- */
const backMore=`<button type="button" class="btn sm" data-more="" style="align-self:flex-start">‹ More</button>`;
function menuIco(bg,path){ return `<span class="ico" style="background:${bg};width:40px;height:40px;border-radius:12px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">${path}</svg></span>`; }
function viewMore(){
  const mv=S.moreView;
  if(mv==="backup") return viewBackup(); if(mv==="numista") return viewNumista(); if(mv==="stats") return viewStats(); if(mv==="export") return viewExport(); if(mv==="report") return viewReport(); if(mv==="checklist") return viewChecklist(); if(mv==="about") return viewAbout(); if(mv==="guide") return viewGuide(); if(mv==="receipts") return viewReceipts();
  const k=nsKey();
  return `<section class="view"><div class="hero" style="padding-top:12px"><h1 style="color:#fff;font-size:22px">More</h1></div><div class="menu">
    <button type="button" data-more="backup">${menuIco("#4338CA",'<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>')}<span class="tx"><b>Backup &amp; restore</b><span class="muted small">${S.readOnly?"View only":dbxOn()?"Kept in Dropbox":"Connect Dropbox, or make a backup file"}${S.meta.changes?` · ${S.meta.changes} not backed up`:""}</span></span></button>
    <button type="button" data-more="numista">${menuIco("#0D9488",'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}<span class="tx"><b>Numista lookups</b><span class="muted small">${k?"Key saved · "+nsUsage():"Add your free API key"}</span></span></button>
    <button type="button" data-more="guide">${menuIco("#2563EB",'<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>')}<span class="tx"><b>Collector's guide</b><span class="muted small">Grades, finishes, mint marks, care</span></span></button>
    <button type="button" data-more="receipts">${menuIco("#0F766E",'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>')}<span class="tx"><b>Receipts &amp; documents</b><span class="muted small">${S.receipts.length?S.receipts.length+" receipt"+(S.receipts.length===1?"":"s"):"Photos and PDFs of your purchases"}</span></span></button>
    <button type="button" data-more="stats">${menuIco("#D97706",'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}<span class="tx"><b>Statistics</b><span class="muted small">Totals, value, by denomination</span></span></button>
    <button type="button" data-more="checklist">${menuIco("#059669",'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>')}<span class="tx"><b>Collection checklist</b><span class="muted small">By denomination, with your wants — for coin fairs</span></span></button>
    <button type="button" data-more="report">${menuIco("#7C3AED",'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>')}<span class="tx"><b>Insurance report</b><span class="muted small">PDF listing with photos and values</span></span></button>
    <button type="button" data-more="export">${menuIco("#0284C7",'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')}<span class="tx"><b>Export CSV</b><span class="muted small">Spreadsheet copy for Excel</span></span></button>
    <button type="button" data-more="about">${menuIco("#475569",'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')}<span class="tx"><b>About MyMint</b><span class="muted small">Version ${APP_VERSION} · where your data lives</span></span></button>
  </div><p class="muted small" style="text-align:center;margin:4px 0 0">MyMint · Version ${APP_VERSION}</p></section>`;
}
const SITE_DATA_WARN=`<div class="banner"><span><b>Warning:</b> clearing Chrome's <b>"Cookies and site data"</b> (or uninstalling Chrome) <b>deletes the collection on this ${devWord()}</b>. With Dropbox connected it comes back when you reconnect; without it, only a backup file can bring it back.</span></div>`;
function viewBackup(){
  return `<section class="view">${backMore}${SITE_DATA_WARN}${dbxPanel()}
  <div class="panel"><h3>Backup file</h3><p class="m0">Makes one .zip file with every coin, photo and want, and saves it to your Downloads. Never upload a backup to GitHub — the repository is public.</p>
    <div class="row"><button type="button" class="btn ${dbxOn()?"":"primary"}" data-backup>Make backup file</button><span class="muted small" id="bkStat"></span></div><div id="bkOut" class="row"></div></div>
  <div class="panel"><h3>Restore</h3><p class="m0">Loads a backup onto this ${devWord()}. It <b>replaces</b> everything currently in the app. ${dbxOn()?"A snapshot of what's here now is saved to Dropbox first, so a restore can be undone.":"Use it on a new phone, to load your starter list, or to undo mistakes."}</p>
    <div class="row"><button type="button" class="btn" data-restore>Choose backup file…</button>${dbxOn()?`<button type="button" class="btn" data-dbxlist>Restore a Dropbox snapshot…</button>`:""}<span class="muted small" id="rsStat"></span></div><div id="dbxList"></div><div id="rsConfirm"></div></div></section>`;
}
function viewStats(){
  const owned=S.coins.filter(isOwned); const n=owned.reduce((a,c)=>a+coinsIn(c),0);
  const coinsPaid=owned.reduce((a,c)=>{ const p=priceAUD(c); return a+(p==null?0:p*qtyOf(c)); },0), postPaid=owned.reduce((a,c)=>a+(priceAUD(c)==null?0:postageTotal(c)),0), paid=coinsPaid+postPaid;
  const val=owned.reduce((a,c)=>a+(blank(c.value)?0:+c.value*qtyOf(c)),0);
  const both=owned.filter(c=>!blank(c.value)&&costEach(c)!=null); const bp=both.reduce((a,c)=>a+costEach(c)*qtyOf(c),0), bv=both.reduce((a,c)=>a+(+c.value)*qtyOf(c),0);
  const by={}; for(const c of owned){ const g=grpOf(c); by[g]=(by[g]||0)+qtyOf(c); }
  const bars=(entries,colorFn)=>{ const max=Math.max(1,...entries.map(e=>e[1])); return `<div class="bars">${entries.map(([k,v])=>`<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v/max*100}%;background:${colorFn(k)}"></div></div><span class="v">${v}</span></div>`).join("")}</div>`; };
  const ser={}; for(const c of owned) if(c.series) ser[c.series]=(ser[c.series]||0)+coinsIn(c);
  const sto={}; for(const c of owned) sto[c.storage||"Not recorded"]=(sto[c.storage||"Not recorded"]||0)+coinsIn(c);
  const todo=owned.filter(c=>todoOf(c).length).length;
  return `<section class="view">${backMore}
  <div class="stats"><div class="stat"><b style="color:#4338CA">${n}</b><span>Coins (${owned.length} records)</span></div><div class="stat"><b style="color:#0F766E">${val?aud(Math.round(val)):"—"}</b><span>Current value</span></div><div class="stat"><b style="color:#B45309">${paid?aud(Math.round(paid)):"—"}</b><span>Total cost</span></div></div>
  ${postPaid?`<p class="m0 muted small">Total cost = coins ${esc(aud(Math.round(coinsPaid)))} + postage &amp; fees ${esc(aud(Math.round(postPaid)))}.</p>`:""}
  ${both.length?`<div class="panel"><h3>Gain against total cost (price + postage)</h3><p class="m0"><b style="font-size:22px;color:${bv>=bp?"#15803D":"#B91C1C"}">${bv>=bp?"+":"−"}${aud(Math.abs(Math.round(bv-bp)))}</b> <span class="muted">across ${both.length} record${both.length===1?"":"s"} (cost ${aud(Math.round(bp))}, now ${aud(Math.round(bv))})</span></p></div>`:""}
  ${denomPanel(owned)}
  ${Object.keys(ser).length?`<div class="panel"><h3>By series</h3>${bars(Object.entries(ser).sort((a,b)=>b[1]-a[1]).slice(0,12),()=>"#4338CA")}</div>`:""}
  <div class="panel"><h3>Where they're kept</h3>${bars(Object.entries(sto).sort((a,b)=>b[1]-a[1]),k=>k==="Not recorded"?"#A5ABB8":"#7C3AED")}</div>
  ${todo?`<div class="todo"><span>${todo} record${todo===1?"":"s"} still need details (year, grade, photos or storage).</span><button type="button" class="btn sm" data-showtodo>Show them</button></div>`:""}
  </section>`;
}
const CSV_COLS=[["title",titleOf],["denomination",c=>c.denom],["year"],["mintMark",c=>c.mint],["series"],["country"],["collection",collOf],["colourised",c=>c.colourised===true?"Yes":c.colourised===false?"No":""],["isSet",c=>c.isSet?"Yes":""],["coinsInSet",c=>c.isSet?setSize(c):""],["setContents",c=>(c.setItems||[]).map(it=>[it.year,it.title].filter(Boolean).join(" ")).join("; ")||c.setContents],["grade"],["sheldon"],["finish"],["packaging"],["serial"],["quantity",qtyOf],["howAcquired",c=>c.acqHow],["dateAcquired",c=>c.acqDate],["source"],["priceEach",c=>c.price],["priceCurrency",c=>curOf(c.priceCur)],["priceEachAUD",c=>priceAUD(c)],["postageEachAUD",c=>{ const p=postageEach(c); return p?Math.round(p*100)/100:""; }],["totalCostEachAUD",c=>costEach(c)],["valueEachAUD",c=>c.value],["valueDate"],["storage"],["status",c=>c.status||"In collection"],["composition"],["massG",c=>c.mass],["diameterMm",c=>c.diameter],["thicknessMm",c=>c.thickness],["edge"],["mintage"],["effigy"],["reverseDesigner"],["variety"],["numistaId",c=>c.ns&&c.ns.id],["catalogueRefs",c=>c.ns&&c.ns.refs],["myPhotos",c=>mine(c).length],["referencePhotos",c=>(c.photos||[]).filter(p=>!p.mine).length],["receipts",c=>(c.receiptIds||[]).length||""],["historicalContext",c=>c.history],["notes"]];
function toCSV(){ const q=v=>{ v=v==null?"":String(v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }; return "﻿"+[CSV_COLS.map(c=>c[0]).join(","),...S.coins.map(c=>CSV_COLS.map(([k,fn])=>q(fn?fn(c):c[k])).join(","))].join("\r\n"); }
function viewExport(){ const url=URL.createObjectURL(new Blob([toCSV()],{type:"text/csv"})); return `<section class="view">${backMore}<div class="panel"><h3>Export CSV</h3><p class="m0">${S.coins.length} coins, ${CSV_COLS.length} columns. Opens in Excel. This is a spreadsheet copy, not a backup — photos aren't included and it can't be restored.</p><div class="row"><a class="btn primary" href="${url}" download="mymint-coins-${todayISO()}.csv">Save CSV</a><button type="button" class="btn" data-copycsv>Copy CSV text</button></div><textarea class="csv" id="csvText" readonly aria-label="CSV text">${esc(toCSV().slice(1))}</textarea></div></section>`; }
window.addEventListener("afterprint",()=>{ const el=$("#report"); if(el) el.innerHTML=""; });
function viewAbout(){ return `<section class="view">${backMore}<div class="panel"><h3>Where your data lives</h3><p class="m0"><b>Version ${APP_VERSION}</b>.</p><p class="m0">Everything — coins, photos and wants — is stored in this browser on this ${devWord()}${dbxOn()?", and a live copy is kept in your own Dropbox":""}. Catalogue details come from Numista when you look a coin up (catalogue data provided by Numista). Exchange rates come from Frankfurter. The app works offline once installed.</p><dl class="dbxst" id="storeInfo"><dt>Storage used</dt><dd>…</dd></dl></div></section>`; }
async function fillStoreInfo(){ const el=$("#storeInfo"); if(!el) return; let used="Unknown",prot="Unknown"; try{ const e=await navigator.storage.estimate(); used=(e.usage/1048576).toFixed(1)+" MB"; }catch{} try{ prot=(await navigator.storage.persisted())?"Yes — the browser won't clear it to save space":"Not yet — it's requested when you save"; }catch{} el.innerHTML=`<dt>Storage used</dt><dd>${used}</dd><dt>Protected storage</dt><dd>${prot}</dd>`; }

/* ================= Numista ================= */
const NS_API="https://api.numista.com/v3";
const asList=x=>Array.isArray(x)?x:(x&&(x.issues||x.items||x.types))||[];
const nsSet=()=>S.settings.find(x=>x.id==="numista")||{id:"numista"};
const nsKey=()=>nsSet().key||"";
function nsUsage(){ const u=S.meta.nsCalls||{}; const m=todayISO().slice(0,7); return `${u.month===m?u.n:0} of 2,000 lookups used this month`; }
async function nsFetch(path){
  const key=nsKey(); if(!key) throw new Error("Add your Numista API key first (More › Numista lookups).");
  if(navigator.onLine===false) throw new Error("No internet connection — Numista lookups need to be online.");
  let r; try{ r=await fetch(NS_API+path+(path.includes("?")?"&":"?")+"lang=en",{headers:{"Numista-API-Key":key}}); }catch(e){ throw new Error("Couldn't reach Numista (no connection, or the request was blocked)."); }
  const m=todayISO().slice(0,7); const u=S.meta.nsCalls||{}; S.meta.nsCalls={month:m,n:(u.month===m?u.n:0)+1}; saveMeta().catch(()=>{});
  if(r.status===401) throw new Error("Numista didn't accept the API key — check it in More › Numista lookups.");
  if(r.status===429) throw new Error("Numista's monthly lookup limit has been reached.");
  if(r.status===404) throw new Error("Numista doesn't have that entry.");
  if(!r.ok){ let m=""; try{ const j=await r.json(); m=j.error_message||j.message||j.error||""; }catch{} const e=new Error("Numista error "+r.status+(m?": "+String(m).slice(0,140):"")); e.status=r.status; throw e; }
  return r.json();
}
const stripHtml=h=>{ if(!h) return ""; const d=document.createElement("div"); d.innerHTML=String(h).replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n\n"); return d.textContent.replace(/\n{3,}/g,"\n\n").trim(); };
const nameList=a=>[...new Set((a||[]).map(x=>typeof x==="string"?x:(x&&x.name)||"").filter(Boolean))];
function denomFromValue(v){ if(!v) return ""; const t=String(v.text||"").toLowerCase(), n=v.numeric_value;
  if(/cent/.test(t)){ const k=(n<1?Math.round(n*100):n)+"c"; return DENOMS.some(d=>d.k===k)?k:"Other"; }
  if(/dollar/.test(t)){ const k="$"+(+n); return DENOMS.some(d=>d.k===k)?k:"Other"; }
  if(/halfpenny|half penny|½ penny/.test(t)) return "Halfpenny"; if(/penny/.test(t)&&!/pence/.test(t)) return "Penny";
  if(/threepence|3 pence/.test(t)) return "Threepence"; if(/sixpence|6 pence/.test(t)) return "Sixpence";
  if(/florin|2 shillings/.test(t)) return "Florin"; if(/crown|5 shillings/.test(t)) return "Crown"; if(/shilling/.test(t)) return "Shilling";
  return "Other"; }
function fromNumista(t,issue){
  const o={};
  o.title=t.title||""; o.country=t.issuer&&t.issuer.name||""; o.denom=denomFromValue(t.value);
  if(issue){ o.year=issue.year!=null?String(issue.year):issue.gregorian_year!=null?String(issue.gregorian_year):""; o.mint=issue.mint_letter||""; if(issue.mintage) o.mintage=String(issue.mintage); }
  else if(t.min_year&&t.min_year===t.max_year) o.year=String(t.min_year);
  o.composition=t.composition&&t.composition.text||""; o.mass=t.weight!=null?String(t.weight):""; o.diameter=t.size!=null?String(t.size):""; o.thickness=t.thickness!=null?String(t.thickness):"";
  o.edge=t.edge&&t.edge.description||"";
  const ob=t.obverse||{}, rv=t.reverse||{}; o.effigy=nameList([...(ob.designers||[]),...(ob.engravers||[])]).join(", "); o.reverseDesigner=nameList([...(rv.designers||[]),...(rv.engravers||[])]).join(", ");
  o.series=typeof t.series==="string"?t.series:(t.series&&t.series.name)||t.commemorated_topic||"";
  o.history=stripHtml(t.comments);
  for(const k of Object.keys(o)) if(blank(o[k])) delete o[k];
  return o;
}
function nsInfo(t,issues){ return {id:t.id,url:t.url||`https://en.numista.com/${t.id}`,title:t.title||"",refs:(t.references||[]).map(r=>`${(r.catalogue&&r.catalogue.code)||""} ${r.number||""}`.trim()).filter(Boolean).join(", "),
  issues:(issues||[]).map(i=>({year:i.year!=null?i.year:i.gregorian_year,mint:i.mint_letter||"",mintage:i.mintage||null,id:i.id})).filter(i=>i.year!=null),fetchedAt:new Date().toISOString()}; }
async function nsImage(url){ if(!url) return null;
  try{ const r=await fetch(url,{mode:"cors"}); if(!r.ok) throw 0; const b=await r.blob(); if(!/^image\//.test(b.type)) throw 0; const small=await resizeImage(b,1200); const id=uid("f"); await dbPut("files",{id,blob:small,type:"image/jpeg",name:id+".jpg"}); return {id}; }
  catch{ return {id:uid("r"),url}; } }
function applyNs(draft,o,overwriteAll){ draft.nsFilled=draft.nsFilled||{}; for(const [k,v] of Object.entries(o)){ if(overwriteAll||blank(draft[k])||draft.nsFilled[k]===draft[k]){ draft[k]=v; draft.nsFilled[k]=v; } } }
async function nsRefresh(id){
  const c=clone(S.coins.find(x=>x.id===id)); if(!c||!c.ns) return;
  toast("Checking Numista…");
  try{ const t=await nsFetch(`/types/${c.ns.id}`); let issues=[]; try{ issues=asList(await nsFetch(`/types/${c.ns.id}/issues`)); }catch{}
    const issue=(issues||[]).find(i=>String(i.year)===String(yearNum(c))&&(i.mint_letter||"")===((c.mint&&c.mint!=="None")?c.mint:""))||null;
    const before=JSON.stringify(c); applyNs(c,fromNumista(t,issue),false); c.ns=nsInfo(t,issues);
    c.updatedAt=new Date().toISOString(); await dbPut("coins",c); await reload(); drawTop();
    toast(JSON.stringify(c)!==before?"Updated from Numista — your own edits were kept":"Already up to date");
  }catch(e){ toast(e.message||String(e)); }
}

/* ================= sheets: a small stack so the phone's Back button works ================= */
function openView(d){ const sh=$("#sheet"); if(S.stack.length){ S.stack[S.stack.length-1].scroll=sh.scrollTop; } else { history.pushState({mm:1},""); } S.stack.push(d); drawTop(true); }
function replaceView(d){ S.stack[S.stack.length-1]=d; drawTop(true); }
async function popView(){ const d=S.stack.pop(); await cleanupView(d); if(!S.stack.length){ S._ignorePop=true; history.back(); } drawTop(); }
async function cleanupView(d){ if(d&&d.kind==="edit"&&!d.saved&&d.newFiles){ for(const f of d.newFiles) await dbDel("files",f); } }
window.addEventListener("popstate",async()=>{
  if(S._ignorePop){ S._ignorePop=false; return; }
  const z=$("#zoom"); if(z){ z.remove(); history.pushState({mm:1},""); return; }
  if(S.stack.length){ const d=S.stack.pop(); await cleanupView(d); if(S.stack.length) history.pushState({mm:1},""); drawTop(); }
});
function drawTop(fresh){
  const sh=$("#sheet"), d=S.stack[S.stack.length-1];
  if(!d){ sh.hidden=true; sh.innerHTML=""; document.body.style.overflow=""; render(); return; }
  const keep=fresh?0:(d.scroll!=null?d.scroll:sh.scrollTop);
  sh.innerHTML=d.kind==="detail"?detailHTML(d):d.kind==="edit"?editHTML(d):d.kind==="add"?addHTML(d):d.kind==="filters"?filtersHTML(d):d.kind==="album"?albumHTML(d):d.kind==="tlist"?tlistHTML(d):d.kind==="nsfind"?nsfindHTML(d):d.kind==="guide"?guideHTML(d):d.kind==="setfind"?setfindHTML(d):d.kind==="receipt"?receiptHTML(d):d.kind==="rcpick"?rcpickHTML(d):"";
  sh.hidden=false; document.body.style.overflow="hidden"; sh.scrollTop=keep; d.scroll=null; hydrateImages(sh);
  sh.querySelectorAll(".pick.scroll").forEach(row=>{ const on=row.querySelector('[aria-pressed="true"]'); if(on) row.scrollLeft=Math.max(0,on.offsetLeft-row.clientWidth/2+on.offsetWidth/2); });
  if(d.kind==="guide"&&fresh&&d.open){ const el=document.getElementById("g_"+d.open); if(el) setTimeout(()=>{ sh.scrollTop=el.offsetTop-70; },30); }
  if(d.kind==="add"&&fresh){ const i=$("#nsq"); if(i&&!d.results) setTimeout(()=>i.focus(),60); }
}
const topV=()=>S.stack[S.stack.length-1];
const backBtn=(label)=>`<button type="button" class="back" data-back><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>${esc(label||"Back")}</button>`;

/* ---------- coin record ---------- */
function photoOrder(c){ const ph=(c.photos||[]).slice(); const cv=coverOf(c); ph.sort((a,b)=>(b===cv)-(a===cv)||(b.mine-a.mine)); return ph; }
function kv(label,val){ return blank(val)||val===false?"":`<div class="kv"><span>${esc(label)}</span><span>${val===true?"Yes":esc(val)}</span></div>`; }
function kvH(label,html){ return html?`<div class="kv"><span>${esc(label)}</span><span>${html}</span></div>`:""; }
function cardH(title,bg,icon,body,extra){ return body.trim()?`<section class="card"><h3><span class="ico" style="background:${bg}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>${esc(title)}<span class="sp"></span>${extra||""}</h3>${body}</section>`:""; }
function detailHTML(d){
  const c=S.coins.find(x=>x.id===d.id); if(!c) return `<div class="shead"><div class="wrap">${backBtn()}</div></div>`;
  const t=themeOf(c), ph=photoOrder(c); if(d.sel==null||d.sel>=ph.length) d.sel=0; const p=ph[d.sel], cv=coverOf(c);
  const todo=todoOf(c), pa=priceAUD(c);
  const stage=p?`<div class="stage ${p.mine?"mine":"ref"}">${imgTag(p,'data-zoom')}${p.mine?`<span class="mybadge"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>MY COIN · ${esc(p.side||"")}</span>`:`<span class="sidetag">${esc(p.side||"")}</span><div class="refbanner">REFERENCE · ${esc(p.source||"Other")} — not your coin</div>`}
      <button type="button" class="coverbtn" data-cover="${esc(p.id)}" aria-pressed="${p===cv}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="${p===cv?"#111827":"none"}" stroke="#111827" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>${p===cv?"Cover photo":"Make cover"}</button></div>`
    :`<div class="stage" style="flex-direction:column;gap:10px"><div class="face" style="--face:150px;width:150px;height:150px">${drawnCoin(c)}</div><span class="muted small">No photos yet</span></div>`;
  const thumbs=`<div class="thumbs">${ph.map((q,i)=>`<div class="th ${q.mine?"mine":"ref"} ${i===d.sel?"sel":""}"><button type="button" data-sel="${i}" aria-label="${q.mine?"My photo":"Reference photo"}, ${esc(q.side||"")}">${imgTag(q)}${q.mine?"":`<span class="rb">REF · ${esc(shortSrc(q.source))}</span>`}</button>${q===cv?`<span class="star" aria-label="Cover photo"><svg width="12" height="12" viewBox="0 0 24 24" fill="#111827"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></span>`:""}</div>`).join("")}<button type="button" class="addph" data-addphoto="${c.id}" aria-label="Add photos"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
  const ns=c.ns;
  const issues=ns&&(ns.issues||[]).length>1?ns.issues:null;
  return `<div class="shead"><div class="wrap">${backBtn("Back")}<span style="flex:1"></span>${S.readOnly?"":`<button type="button" class="btn sm light" data-edit="${c.id}">Edit</button>`}</div></div>
  <div class="dhero"><div class="wrap">
    <div class="row" style="gap:6px">${c.denom?`<span class="pill" style="background:${t.solid};color:#fff">${esc(c.denom)}</span>`:""}${gradeText(c)?`<span class="pill" style="${gradeStyle(c.grade)}">${esc(gradeText(c))}</span>`:""}${c.colourised?`<span class="pill" style="background:#FDE68A;color:#78350F">Coloured</span>`:""}${c.isSet?`<span class="pill" style="background:#E0E7FF;color:#3730A3">Set${c.setCount?" of "+esc(c.setCount):""}</span>`:""}${qtyOf(c)>1?`<span class="pill" style="background:#fff;color:#111827">×${qtyOf(c)}</span>`:""}${!isOwned(c)?`<span class="pill" style="background:#FEE2E2;color:#991B1B">${esc(c.status)}</span>`:""}</div>
    <h1>${esc(titleOf(c))}</h1><div class="sub">${esc([c.country||"",collOf(c),c.mint&&c.mint!=="None"?"Mint mark "+c.mint:c.mint==="None"?"No mint mark":""].filter(Boolean).join(" · "))}</div></div></div>
  <div class="wrap sbody">
    ${todo.length&&!S.readOnly?`<div class="todo"><span><b>To finish:</b> ${esc(todo.join(", "))}</span><button type="button" class="btn sm" data-edit="${c.id}">Add</button></div>`:""}
    <section class="card" style="padding:14px">${stage}${thumbs}<p class="m0 muted small">Tap a photo to view it; tap the big photo to zoom. The star picks the photo shown in your coin list.</p></section>
    ${c.storage?`<div class="todo" style="background:#EDE9FE"><span class="ico" style="background:#7C3AED"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span><b>Kept in:</b> ${esc(c.storage)}</span></div>`:""}
    ${cardH("Identity","#4338CA",'<circle cx="12" cy="12" r="8"/><path d="M9 12h6"/>',kv("Denomination",c.denom)+kv("Year",c.year)+kv("Mint / privy mark",c.mint)+kv("Theme / series",c.series)+kv("Country",c.country)+kv("Variety / error",c.variety)+(c.isSet?kv("Coins in set",String(setSize(c)))+kv("Notes about the set",c.setContents):""))}
    ${cardH("Design","#DB2777",'<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',kv("Effigy",c.effigy)+kv("Reverse designer",c.reverseDesigner)+(c.colourised!=null?kv("Colourised",c.colourised?"Yes":"No"):""))}
    ${cardH("Condition","#2563EB",'<path d="M4 18h16M7 14l3-4 3 3 4-6"/>',kvH("Grade",gradeText(c)?`<span class="grade" style="${gradeStyle(c.grade)}">${esc(gradeText(c))}${GRADE_NAMES[c.grade]?" · "+esc(GRADE_NAMES[c.grade]):""}</span> ${infoBtn("grades")}`:"")+kv("Finish",c.finish)+kv("Packaging",c.packaging)+kv("Serial / certificate no.",c.serial))}
    ${cardH("Specifications","#0D9488",'<path d="M12 3v18M3 12h18"/>',kv("Composition",c.composition)+kv("Mass",unit(c.mass,"g"))+kv("Diameter",unit(c.diameter,"mm"))+kv("Thickness",unit(c.thickness,"mm"))+kv("Edge",c.edge)+kvH("Mintage",blank(c.mintage)?"":`${esc(fmtNum(c.mintage))}${+c.mintage&&+c.mintage<=50000?` <span class="grade" style="background:#FEF3C7;color:#92400E">Low mintage</span>`:""}`)+(!ns&&!c.isSet&&nsKey()&&!S.readOnly?`<div class="nsbar"><span>Not linked to Numista yet</span><button type="button" class="btn sm" style="background:#0D9488;border-color:#0D9488;color:#fff" data-nsfind="${c.id}">Find in Numista</button></div>`:"")+(ns?`<div class="nsbar"><span>Catalogue data provided by Numista · <a href="${esc(ns.url)}" target="_blank" rel="noopener">N# ${esc(ns.id)}</a>${ns.refs?" · "+esc(ns.refs):""}</span>${nsKey()&&!S.readOnly?`<button type="button" class="btn sm" style="background:#0D9488;border-color:#0D9488;color:#fff" data-nsrefresh="${c.id}">Refresh</button>`:""}</div>`:""))}
    ${cardH("Ownership","#D97706",'<path d="M4 7h16v12H4z"/><path d="M4 11h16"/>',kv("Quantity",qtyOf(c)>1?String(qtyOf(c)):"")+kv("How acquired",c.acqHow)+kv("Date acquired",fmtDate(c.acqDate))+kv("Source",c.source)+kv("Price paid (each)",blank(c.price)?"":(curOf(c.priceCur)==="AUD"?aud(c.price):`${fmtMoney(c.price,c.priceCur)}${pa!=null?" ("+aud(pa)+")":" (AUD pending)"}`))+(postageEach(c)>0?kv("Postage share (each)",aud(Math.round(postageEach(c)*100)/100))+(costEach(c)!=null?kvH("Total cost (each)",`<b>${esc(aud(costEach(c)))}</b>`):""):"")+kvH("Current value (each)",blank(c.value)?"":`${esc(aud(c.value))}${gainPill(c)}${c.valueDate?`<br><span class="muted small">as at ${esc(fmtDate(c.valueDate))}</span>`:""}`)+kv("Status",isOwned(c)?"":c.status))}
    ${setCard(c)}${rcCard(c)}
    ${issues?`<section class="card"><h3><span class="ico" style="background:#0F766E"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></span>All years of this type<span class="sp"></span><span class="muted small">${issues.filter(i=>ownsIssue(ns.id,i)).length}/${issues.length}</span></h3><div class="chips wrapy" style="padding-bottom:14px">${issues.map(i=>{ const o=ownsIssue(ns.id,i); return `<span class="chip" style="${o?"background:#DDF5F2;border-color:#0D9488;color:#115E59":""}">${o?"✓ ":""}${esc(i.year)}${i.mint?" "+esc(i.mint):""}${i.mintage?` <span class="muted" style="font-weight:600">· ${esc(fmtNum(i.mintage))}</span>`:""}</span>`; }).join("")}</div></section>`:""}
    ${c.history?`<section class="card"><h3><span class="ico" style="background:#7C3AED"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/></svg></span>Historical context</h3><p class="story">${esc(c.history)}</p></section>`:""}
    ${c.notes?`<section class="card"><h3><span class="ico" style="background:#475569"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>Notes</h3><p class="story">${esc(c.notes)}</p></section>`:""}
    ${S.readOnly?"":`<div class="row" style="justify-content:center;margin-top:6px"><button type="button" class="btn" data-dup="${c.id}">Duplicate as new</button><button type="button" class="btn" data-sold="${c.id}">${isOwned(c)?"Mark as sold":"Back in collection"}</button><button type="button" class="btn danger" data-delcoin="${c.id}">${d.confirmDel?"Tap again to delete":"Delete"}</button></div>`}
    <p class="muted small" style="text-align:center;margin:0">Added ${fmtDate((c.addedAt||"").slice(0,10))||"—"}${c.updatedAt?` · updated ${fmtWhen(c.updatedAt)}`:""}</p>
  </div>`;
}
const shortSrc=s=>({"Royal Australian Mint":"RAM","Perth Mint":"Perth"}[s]||s||"Other");

/* ---------- add: Numista search / manual / copy ---------- */
function nsSearchBlock(d){ return `<form id="nsForm" class="searchbar" style="border:2px solid #4338CA"><label class="sr" for="nsq">Search Numista</label><input id="nsq" type="search" enterkeyhint="search" autocomplete="off" placeholder="e.g. 2022 2 dollars honey bee" value="${esc(d.q||"")}"><button class="btn sm primary" type="submit">Search</button></form>
      <label class="check-inline"><input type="checkbox" id="nsAus" ${nsSet().ausOnly!==false?"checked":""}><span>Australian coins only</span></label>
      ${d.busy?`<p class="muted m0">${esc(d.busy)}</p>`:""}${d.err?`<p class="warnTxt m0">${esc(d.err)}</p>`:""}${d.tried&&!d.busy&&!d.issues?`<p class="muted small m0">No exact match — showing results for "${esc(d.tried)}".</p>`:""}
      ${d.issues?issuePicker(d):d.results?(d.results.length?`<div class="listbox">${d.results.map(r=>`<button type="button" class="nsres" data-nspick="${r.id}">${(r.reverse_thumbnail||r.obverse_thumbnail)?`<img src="${esc(r.reverse_thumbnail||r.obverse_thumbnail)}" alt="" referrerpolicy="no-referrer">`:`<span class="face" style="--face:48px;width:48px;height:48px"><span class="coin m-silver">?</span></span>`}<span class="tx"><b>${esc(r.title)}</b><span>${esc([r.issuer&&r.issuer.name,r.min_year===r.max_year?r.min_year:`${r.min_year||"?"}–${r.max_year||"?"}`,"N# "+r.id].filter(Boolean).join(" · "))}</span></span></button>`).join("")}<p class="m0 muted small" style="padding:8px 14px">Source: Numista</p></div>`:`<p class="muted m0">Nothing found — try fewer words, e.g. "2 dollars 2022".</p>`):`<p class="muted small m0">Tip: type the year, value and a word from the design. Picking a match fills in the specifications and reference photos.</p>`}`
; }
const NS_SETUP=`<div class="panel"><p class="m0">Add your free Numista API key and MyMint fills in composition, mass, diameter, mintage, designers and reference photos for you.</p><button type="button" class="btn primary" data-more-go="numista">Set up Numista</button></div>`;
function addHTML(d){
  const key=nsKey();
  return `<div class="shead"><div class="wrap">${backBtn("Cancel")}<h2>Add a coin</h2></div></div>
  <div class="wrap sbody">
    <div class="step"><i style="background:#4338CA">1</i><h2>Find it in the Numista catalogue</h2></div>
    ${key?nsSearchBlock(d):NS_SETUP}
    <div class="step" style="margin-top:6px"><i style="background:#D97706">2</i><h2>Or start another way</h2></div>
    <div class="row"><button type="button" class="btn" data-manual>Enter manually</button><button type="button" class="btn" data-copyfrom>${d.copy?"Hide":"Copy an existing coin"}</button></div>
    ${d.copy?`<div class="field"><label for="cpq">Find the coin to copy</label><input id="cpq" type="search" value="${esc(d.cq||"")}" placeholder="e.g. 2021 $2"></div><div class="listbox" id="cpList">${copyList(d.cq||"")}</div>`:""}
  </div>`;
}
function nsfindHTML(d){
  const c=d.target.draft;
  return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Find in Numista</h2></div></div>
  <div class="wrap sbody">
    <div class="todo" style="background:#DDF5F2"><span><b>${esc(titleOf(c))}</b><br><span class="muted">Pick the matching coin. Only empty details are filled in — anything you've entered is kept.</span></span></div>
    ${nsKey()?nsSearchBlock(d):NS_SETUP}
  </div>`;
}
function nsQueryFor(c){
  const dq=c.denom?(c.denom.match(/^\$(\d+)/)?`${RegExp.$1} dollar${RegExp.$1==="1"?"":"s"}`:c.denom.match(/^(\d+)c$/)?`${RegExp.$1} cents`:c.denom):"";
  let words=c.series||titleOf(c);
  words=words.replace(/\b(19|20)\d\d(\s*[-–]\s*(19|20)\d\d)?\b/g," ").replace(/\$\d+|\b\d+c\b/gi," ").replace(/\b(uncirculated|circulating|circulated|coloured|colour|color|coin|coins|card|ram|dcpl|on|in|the|of|and|al-br|frosted|silver|set|collection|privy|mark|four|seven|\d+-coin|volume|1|anniversary|australian|australia|end|50th|centenary|commemorative)\b/gi," ").replace(/[–\-:()]/g," ").replace(/\s+/g," ").trim();
  return [yearNum(c)||"",dq,words].filter(Boolean).join(" ");
}
async function nsLink(d,issue){
  const t=d.type, tgt=d.target, c=tgt.draft; d.busy="Filling in details and reference photos…"; d.issues=null; drawTop();
  applyNs(c,fromNumista(t,issue),false); c.ns=nsInfo(t,d.typeIssues);
  if(!(c.photos||[]).some(p=>!p.mine&&p.source==="Numista")){ c.photos=c.photos||[];
    for(const [side,obj] of [["Obverse",t.obverse],["Reverse",t.reverse]]){ const pic=obj&&(obj.picture||obj.thumbnail); if(!pic) continue; const r=await nsImage(pic); if(!r) continue; if(!r.url) tgt.newFiles.push(r.id); c.photos.push({id:r.id,url:r.url,mine:false,side,source:"Numista",link:c.ns.url}); } }
  d.busy=""; await popView(); toast("Filled from Numista — check the details, then Save");
}
function copyList(q){ const l=sorted(S.coins.filter(c=>matchQuery(c,q)).slice()).slice(0,40); return l.length?l.map(c=>`<button type="button" class="lrow" data-copy="${c.id}">${faceHTML(c)}<span class="tx"><span class="t1">${esc(titleOf(c))}</span><span class="t2">Copies the coin details, not the photos or purchase</span></span></button>`).join(""):`<p class="muted small" style="padding:12px">No coins match.</p>`; }
function issuePicker(d){ return `<div class="panel"><h3>${esc(d.type.title)}</h3><p class="m0 muted small">Which year and mint mark is yours?</p><div class="pick">${d.issues.map((i,k)=>`<button type="button" data-issue="${k}">${esc(i.year!=null?i.year:i.gregorian_year)}${i.mint_letter?" "+esc(i.mint_letter):""}${i.mintage?` <span style="font-weight:500;opacity:.8">· ${esc(fmtNum(i.mintage))}</span>`:""}</button>`).join("")}</div><button type="button" class="btn ghost" data-issue="-1">Not sure — choose later</button></div>`; }
function nsAttempts(q){
  const yrs=(q.match(/\b(19|20)\d\d\b/g)||[]); const noY=q.replace(/\b(19|20)\d\d\b/g," ").replace(/\s+/g," ").trim();
  const dm=noY.match(/^\d+\s+(dollars?|cents?)\b/i); const dq=dm?dm[0]:""; const words=(dm?noY.slice(dm[0].length):noY).trim().split(" ").filter(w=>w.length>2);
  const longest=words.slice().sort((a,b)=>b.length-a.length)[0]||"";
  const list=[q,noY,[dq,...words.slice(-2)].join(" ").trim(),[dq,longest].join(" ").trim(),words.slice(-2).join(" "),longest];
  return {list:[...new Set(list.map(x=>x.trim()).filter(Boolean))],year:yrs[0]?+yrs[0]:null};
}
async function nsAusCode(){
  if(S.meta.nsAus!==undefined) return S.meta.nsAus;
  let code=null;
  try{ const j=await nsFetch(`/issuers`); const list=asList(j.issuers?j.issuers:j); const hit=list.find(i=>/^australia$/i.test((i.name||"").trim()))||list.find(i=>/^australia\b/i.test((i.name||"").trim())&&!/state|colony|territor|antarctic/i.test(i.name||"")); code=hit?hit.code:null; }catch(e){ if(/key|limit|connection|reach/i.test(e.message)) throw e; }
  S.meta.nsAus=code; saveMeta().catch(()=>{}); return code;
}
async function nsQuery(q,aus){
  let list=null;
  const code=aus?await nsAusCode():null;
  if(code){ try{ list=(await nsFetch(`/types?q=${encodeURIComponent(q)}&category=coin&count=50&issuer=${encodeURIComponent(code)}`)).types||[]; }catch(e){ if(/key|limit|connection|reach/i.test(e.message)) throw e; if(e.status===400){ S.meta.nsAus=null; saveMeta().catch(()=>{}); } list=null; } }
  if(!list||!list.length){ list=(await nsFetch(`/types?q=${encodeURIComponent(q)}&category=coin&count=50`)).types||[]; if(aus){ const au=list.filter(r=>/australia/i.test((r.issuer&&r.issuer.name)||"")); list=au; } }
  return list;
}
async function nsSearch(d){
  const q=(d.q||"").trim(); if(!q) return; d.busy="Searching Numista…"; d.err=""; d.issues=null; d.tried=null; drawTop();
  try{ const aus=nsSet().ausOnly!==false; const {list:tries,year}=nsAttempts(q); let res=[], used=q;
    for(const t of tries.slice(0,4)){ res=await nsQuery(t,aus); used=t; if(res.length) break; }
    if(year) res.sort((a,b)=>{ const ina=(a.min_year||0)<=year&&year<=(a.max_year||9999), inb=(b.min_year||0)<=year&&year<=(b.max_year||9999); return inb-ina; });
    d.results=res; if(used!==q&&res.length) d.tried=used; }
  catch(e){ d.err=e.message||String(e); d.results=null; }
  d.busy=""; if(topV()===d) drawTop();
}
async function nsPick(d,id){
  d.busy="Getting details from Numista…"; d.err=""; drawTop();
  try{ const t=await nsFetch(`/types/${id}`); let issues=[]; try{ issues=asList(await nsFetch(`/types/${id}/issues`)); }catch{}
    d.type=t; d.typeIssues=issues||[]; d.busy="";
    if(d.kind==="setfind"){ const y=String(yearNum(d.target.draft)||""); if((issues||[]).length>1){ const hits=issues.filter(i=>String(i.year!=null?i.year:i.gregorian_year)===y); if(hits.length===1){ await siLink(d,hits[0]); return; } d.issues=issues; drawTop(); return; } await siLink(d,(issues||[])[0]||null); return; }
    if(d.kind==="nsfind"&&(issues||[]).length){ const c=d.target.draft, y=String(yearNum(c)||""), m=(c.mint&&c.mint!=="None"&&c.mint!=="Privy mark")?c.mint:null;
      let hits=issues.filter(i=>String(i.year!=null?i.year:i.gregorian_year)===y); if(m) hits=hits.filter(i=>(i.mint_letter||"")===m); else if(c.mint==="None") hits=hits.filter(i=>!i.mint_letter);
      if(hits.length===1){ await nsLink(d,hits[0]); return; } }
    if((issues||[]).length>1){ d.issues=issues; drawTop(); return; }
    if(d.kind==="nsfind"){ await nsLink(d,(issues||[])[0]||null); return; }
    await nsBuild(d,(issues||[])[0]||null);
  }catch(e){ d.busy=""; d.err=e.message||String(e); drawTop(); }
}
async function nsBuild(d,issue){
  d.busy="Saving reference photos…"; d.issues=null; drawTop();
  const t=d.type, draft=blankCoin(); applyNs(draft,fromNumista(t,issue),true); draft.ns=nsInfo(t,d.typeIssues);
  const newFiles=[];
  for(const [side,obj] of [["Obverse",t.obverse],["Reverse",t.reverse]]){ const pic=obj&&(obj.picture||obj.thumbnail); if(!pic) continue; const r=await nsImage(pic); if(!r) continue; if(!r.url) newFiles.push(r.id); draft.photos.push({id:r.id,url:r.url,mine:false,side,source:"Numista",link:draft.ns.url}); }
  d.busy=""; replaceView({kind:"edit",id:null,draft,newFiles,removedFiles:[],fromNs:true});
}

/* ---------- edit form ---------- */
function blankCoin(){ return {country:"Australia",priceCur:"AUD",qty:1,status:"In collection",photos:[],acqDate:todayISO()}; }
function datalists(){ const vals=k=>[...new Set(S.coins.map(c=>c[k]).concat(S.wanted.map(w=>w[k])).filter(v=>!blank(v)))].sort();
  return ["series","effigy","reverseDesigner","source","storage","country","composition","edge"].map(k=>`<datalist id="dl_${k}">${vals(k).map(v=>`<option value="${esc(v)}">`).join("")}</datalist>`).join("")+`<datalist id="dl_mint">${MINTS.map(m=>`<option value="${m}">`).join("")}</datalist>`; }
function pick(field,opts,cur,labels,scroll){ return `<div class="pick ${scroll?"scroll":""}" role="group">${opts.map((o,i)=>`<button type="button" data-pk="${field}" data-pv="${esc(o)}" aria-pressed="${String(cur)===String(o)}">${esc(labels?labels[i]:o)}</button>`).join("")}</div>`; }
function inp(field,label,draft,o={}){ return `<div class="field ${o.full?"full":""}"><label for="f_${field}">${esc(label)}${o.info?" "+infoBtn(o.info):""}${o.hint?` <span class="hint">${esc(o.hint)}</span>`:""}</label>${o.area?`<textarea id="f_${field}" data-f="${field}" placeholder="${esc(o.ph||"")}">${esc(draft[field]||"")}</textarea>`:`<input id="f_${field}" data-f="${field}" value="${esc(draft[field]??"")}" ${o.list?`list="dl_${o.list}"`:""} ${o.num?`inputmode="${o.num}"`:""} ${o.type?`type="${o.type}"`:""} placeholder="${esc(o.ph||"")}" autocomplete="off">`}</div>`; }
function editHTML(d){
  const c=d.draft, isNew=!d.id, specN=["composition","mass","diameter","thickness","edge","mintage"].filter(k=>!blank(c[k])).length, desN=["effigy","reverseDesigner","variety"].filter(k=>!blank(c[k])).length;
  return `<div class="shead"><div class="wrap">${backBtn("Cancel")}<h2>${isNew?"New coin":"Edit coin"}</h2><button type="button" class="btn sm amber" data-save>Save</button></div></div>
  <div class="wrap sbody">${datalists()}
  ${c.isSet&&!c.ns?"":c.ns?`<div class="nsbar" style="margin:0"><span>Linked to Numista · N# ${esc(c.ns.id)}. Check the details and add your own below.</span>${nsKey()?`<button type="button" class="btn sm" data-nsfind="edit">Change</button>`:""}</div>`:nsKey()?`<div class="nsbar" style="margin:0"><span>Not linked to Numista yet — find it to fill in specs, designers, mintage and reference photos.</span><button type="button" class="btn sm" style="background:#0D9488;border-color:#0D9488;color:#fff" data-nsfind="edit">Find in Numista</button></div>`:""}
  <section class="fsec"><h3><span class="ico" style="background:#4338CA"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/></svg></span>The coin</h3>
    <div class="field"><span class="flabel">Denomination</span>${pick("denom",DENOMS.map(d=>d.k),c.denom,null,true)}</div>
    <div class="grid2">${inp("year","Year",c,{num:"numeric",ph:"e.g. 2022"})}${inp("mint","Mint / privy mark",c,{list:"mint",ph:"C, S, None…",info:"marks"})}</div>
    ${inp("series","Theme / series",c,{list:"series",ph:"e.g. Australian Dinosaurs",hint:"groups coins into albums"})}
    ${inp("title","Name",c,{ph:autoTitle(c)||"e.g. 2022 $2 Honey Bee",hint:"leave blank to use year, value and series"})}
    <div class="field"><span class="flabel">Coloured coin?</span>${pick("colourised",["yes","no"],c.colourised===true?"yes":c.colourised===false?"no":"",["Coloured","Not coloured"])}</div>
    <label class="check-inline"><input type="checkbox" id="f_isSet" ${c.isSet?"checked":""}><span>This is a set of several coins (e.g. a 4-coin collection)</span></label>
    <div id="setFields" class="setbox" ${c.isSet?"":"hidden"}>${setSec(d)}</div>
  </section>
  <section class="fsec"><h3><span class="ico" style="background:#2563EB"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 18h16M7 14l3-4 3 3 4-6"/></svg></span>Condition</h3>
    <div class="field"><span class="flabel">Grade ${infoBtn("grades")}</span>${pick("grade",GRADES,c.grade)}<span class="hint" id="gradeHint">${c.grade?esc(GRADE_HINTS[c.grade]||""):"Not sure? Tap ? for what each grade looks like."}</span></div>
    <div class="grid2">${inp("sheldon","Sheldon no.",c,{num:"numeric",ph:"1–70, optional"})}${inp("serial","Serial / cert. no.",c,{ph:"if it has one"})}</div>
    <div class="field"><span class="flabel">Finish ${infoBtn("finish")}</span>${pick("finish",FINISHES,c.finish)}</div>
    ${packField(d)}
  </section>
  <section class="fsec"><h3><span class="ico" style="background:#D97706"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 7h16v12H4z"/><path d="M4 11h16"/></svg></span>Ownership</h3>
    <div class="field"><span class="flabel">How you got it</span>${pick("acqHow",HOWS,c.acqHow)}</div>
    <div class="field"><span class="flabel">Quantity</span><div class="stepper"><button type="button" data-qty="-1" aria-label="One fewer">−</button><input id="f_qty" data-f="qty" inputmode="numeric" value="${esc(c.qty||1)}" aria-label="Quantity"><button type="button" data-qty="1" aria-label="One more">+</button></div></div>
    <div class="field"><label for="f_acqDate">Date acquired</label><input id="f_acqDate" data-f="acqDate" type="date" value="${esc(c.acqDate||"")}"></div>
    ${inp("source","Source",c,{list:"source",ph:"e.g. Royal Australian Mint, coin fair, change"})}
    <div class="field"><label for="f_price">Price paid (each)</label><div class="inrow"><input id="f_price" data-f="price" inputmode="decimal" value="${esc(c.price??"")}" placeholder="0.00" style="flex:1"><select id="f_priceCur" data-f="priceCur" style="width:96px" aria-label="Currency">${CURRENCIES.map(x=>`<option ${curOf(c.priceCur)===x?"selected":""}>${x}</option>`).join("")}</select></div>${d.id&&postageEach(S.coins.find(x=>x.id===d.id)||{})>0?`<span class="hint">Plus ${esc(aud(Math.round(postageEach(S.coins.find(x=>x.id===d.id))*100)/100))} postage each from the receipt — counted in total cost.</span>`:""}<span class="hint" id="audNote">${curOf(c.priceCur)!=="AUD"?(c.priceAud!=null&&c.priceAud!==""?`About ${aud(c.priceAud)} — converted at the rate on the purchase date`:"Converted to AUD when you save (needs internet)"):""}</span></div>
    ${inp("value","Current value each (A$)",c,{num:"decimal",ph:"your estimate"})}<div class="field"><label for="f_valueDate">Value as at</label><input id="f_valueDate" data-f="valueDate" type="date" value="${esc(c.valueDate||"")}"></div>
    ${inp("storage","Storage location",c,{list:"storage",ph:"e.g. Safe, Album 1 page 3, Red box"})}
    ${isNew?"":`<div class="field"><span class="flabel">Status</span>${pick("status",STATUSES,c.status||"In collection")}</div>`}
  </section>
  <section class="fsec" id="phSec">${photosSec(d)}</section>
  <section class="fsec" id="rcSec">${rcSec(d)}</section>
  <details class="fsec" ${specN?"":""}><summary><span class="ico" style="background:#0D9488"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3v18M3 12h18"/></svg></span>Specifications<span class="sp"></span><span class="hint">${specN?specN+" filled":c.ns?"":"Numista fills these"}</span></summary>
    <div class="grid2">${inp("country","Country",c,{list:"country"})}<div class="field"><span class="flabel">Collection</span>${pick("collection",COLLS,c.collection||"",null)}</div>
    ${inp("composition","Composition",c,{list:"composition",full:true,ph:"e.g. Aluminium-bronze"})}${inp("mass","Mass (g)",c,{num:"decimal"})}${inp("diameter","Diameter (mm)",c,{num:"decimal"})}${inp("thickness","Thickness (mm)",c,{num:"decimal"})}${inp("mintage","Mintage",c,{num:"numeric"})}${inp("edge","Edge",c,{list:"edge",full:true,ph:"e.g. Reeded, Plain"})}</div></details>
  <details class="fsec"><summary><span class="ico" style="background:#DB2777"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/></svg></span>Design<span class="sp"></span><span class="hint">${desN?desN+" filled":""}</span></summary>
    ${inp("effigy","Effigy (portrait and designer)",c,{list:"effigy",ph:"e.g. Jody Clark 2019–2023"})}${inp("reverseDesigner","Reverse designer",c,{list:"reverseDesigner"})}${inp("variety","Variety / error",c,{ph:"if any"})}</details>
  <details class="fsec" ${c.history||c.notes?"":""}><summary><span class="ico" style="background:#7C3AED"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 4h11l3 3v13H5z"/></svg></span>Story &amp; notes<span class="sp"></span><span class="hint">${[c.history?"context":"",c.notes?"notes":""].filter(Boolean).join(", ")}</span></summary>
    ${inp("history","Historical context",c,{area:true,ph:"The background story of the coin"})}${inp("notes","Notes",c,{area:true,ph:"Your own remarks"})}</details>
  <details class="fsec"><summary><span class="ico" style="background:#475569"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>Catalogue link<span class="sp"></span><span class="hint">${c.ns?"N# "+esc(c.ns.id):""}</span></summary>
    ${nsKey()?`<button type="button" class="btn primary" data-nsfind="edit">Find in Numista</button><p class="m0 muted small">Or, if you already know its number:</p>`:""}<div class="field"><label for="f_nsid">Numista number (N#)</label><div class="inrow"><input id="f_nsid" inputmode="numeric" value="${esc(c.ns?c.ns.id:"")}" placeholder="e.g. 351234" style="flex:1">${nsKey()?`<button type="button" class="btn" data-nslink>Fill from Numista</button>`:""}</div><span class="hint">Fills empty fields only — anything you've typed is kept.</span></div></details>
  ${!isNew?"":`<p class="muted small m0" style="text-align:center">Only the denomination or a name is needed to save — you can add the rest later.</p>`}
  </div>
  <div class="savebar"><div class="wrap"><button type="button" class="btn" data-back>Cancel</button><button type="button" class="btn primary" data-save>Save coin</button></div></div>`;
}
function photosSec(d){
  const c=d.draft, ph=c.photos||[], cv=coverOf(c);
  return `<h3><span class="ico" style="background:#15803D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>Photos<span class="sp" style="flex:1"></span><span class="muted small">${ph.length}</span></h3>
  <div class="row"><button type="button" class="btn primary" data-cam><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Take photo</button><button type="button" class="btn" data-pickph>Choose from phone</button></div>
  <p class="m0 muted small">New photos are labelled <b style="color:var(--mine)">MY COIN</b> and take turns as obverse, reverse, then card. The reverse (design side) shows on the coin list unless you pick another cover. Switch a mint or catalogue picture to <b>Reference</b> and say where it's from.</p>
  ${ph.map((p,i)=>`<div class="phedit ${p.mine?"mine":"ref"}">${imgTag(p,'class="pimg"')}<div class="pc">
    <div class="whose" role="group" aria-label="Whose photo"><button type="button" data-whose="${i}:mine" class="${p.mine?"on-mine":""}" aria-pressed="${!!p.mine}">My coin</button><button type="button" data-whose="${i}:ref" class="${p.mine?"":"on-ref"}" aria-pressed="${!p.mine}">Reference</button></div>
    <select data-pside="${i}" aria-label="Side">${SIDES.map(s=>`<option ${p.side===s?"selected":""}>${s}</option>`).join("")}</select>
    ${p.mine?"":`<select data-psrc="${i}" aria-label="Source">${SOURCES.map(s=>`<option ${p.source===s?"selected":""}>${s}</option>`).join("")}</select><input data-plink="${i}" type="url" placeholder="Web link (optional)" value="${esc(p.link||"")}" aria-label="Web link">`}
    <div class="phbtns"><button type="button" class="btn sm ${p===cv?"amber":""}" data-pcover="${i}">${p===cv?"★ Cover":"☆ Make cover"}</button>${p.url?"":`<button type="button" class="btn sm" data-ptorc="${i}">Move to receipts</button>`}<button type="button" class="btn sm ghost" data-prm="${i}">Remove</button></div></div></div>`).join("")}`;
}
function drawPhotos(){ const d=topV(); const el=$("#phSec"); if(el){ el.innerHTML=photosSec(d); hydrateImages(el); } }
function readForm(){ const d=topV(); if(!d||d.kind!=="edit") return null; const c=d.draft;
  document.querySelectorAll("#sheet [data-f]").forEach(el=>{ c[el.dataset.f]=el.value; });
  const s=$("#f_isSet"); if(s) c.isSet=s.checked;
  if(d.packOther){ const po=$("#f_packOther"); if(po){ d.packOtherText=po.value.trim(); c.packaging=d.packOtherText; } }
  return c; }
function nextSide(c){ const used=new Set((c.photos||[]).filter(p=>p.mine).map(p=>p.side)); return ["Obverse","Reverse","Card / packaging"].find(s=>!used.has(s))||"Other"; }
async function addPhotoFiles(files){
  const d=topV(); if(!d||d.kind!=="edit") return; readForm(); const c=d.draft; let n=0;
  toast(files.length>1?`Adding ${files.length} photos…`:"Adding photo…");
  for(const f of files){ try{ const blob=await resizeImage(f,1600); const id=uid("f"); await dbPut("files",{id,blob,type:"image/jpeg",name:id+".jpg"}); d.newFiles.push(id); c.photos.push({id,mine:true,side:nextSide(c)}); n++; }catch(e){ toast("A photo couldn't be read: "+(e.message||e)); } }
  drawPhotos(); if(n) toast(n===1?"Photo added":`${n} photos added`);
}
function clean(c){
  for(const k of Object.keys(c)) if(typeof c[k]==="string") c[k]=c[k].trim();
  for(const k of ["price","value","priceAud"]) if(!blank(c[k])){ const n=Number(String(c[k]).replace(/[$,\s]/g,"")); c[k]=isNaN(n)?c[k]:n; }
  if(!blank(c.mintage)) c.mintage=String(c.mintage).replace(/[,\s]/g,"");
  c.qty=Math.max(1,parseInt(c.qty,10)||1);
  if(c.sheldon&&!/^\d{1,2}$/.test(c.sheldon)) c.sheldon="";
  if(!c.isSet){ delete c.isSet; delete c.setCount; delete c.setContents; delete c.setItems; }
  if(c.setItems&&!c.setItems.length) delete c.setItems;
  if(c.setItems) c.setCount=String(c.setItems.length);
  if(c.packaging===PACK_OTHER) delete c.packaging;
  if(c.receiptIds){ c.receiptIds=[...new Set(c.receiptIds)]; if(!c.receiptIds.length) delete c.receiptIds; }
  if(c.receiptCover){ for(const k of Object.keys(c.receiptCover)) if(!(c.receiptIds||[]).includes(k)||+c.receiptCover[k]>=c.qty) delete c.receiptCover[k]; if(!Object.keys(c.receiptCover).length) delete c.receiptCover; }
  if(curOf(c.priceCur)==="AUD"){ delete c.priceAud; delete c.priceRate; }
  for(const k of Object.keys(c)) if(c[k]===""||c[k]==null) delete c[k];
  return c;
}
async function saveCoin(){
  const d=topV(); readForm(); const c=d.draft;
  const nsid=($("#f_nsid")||{}).value; if(nsid&&(!c.ns||String(c.ns.id)!==nsid.trim())&&/^\d+$/.test(nsid.trim())) c.ns={id:+nsid.trim(),url:`https://en.numista.com/${nsid.trim()}`};
  if(!c.denom&&blank(c.title)&&blank(c.series)){ toast("Pick a denomination or give it a name first"); return; }
  if(!blank(c.year)&&!/^\d{4}(\s*[-–]\s*\d{4})?$/.test(String(c.year).trim())){ toast("Year should look like 2022 (or 2020-2021)"); return; }
  clean(c);
  const prev=d.id?S.coins.find(x=>x.id===d.id):null;
  if(prev&&!blank(c.value)&&String(c.value)!==String(prev.value??"")&&!c.valueDate) c.valueDate=todayISO();
  if(!prev&&!blank(c.value)&&!c.valueDate) c.valueDate=todayISO();
  if(pendingConv(c)||(prev&&(prev.price!==c.price||prev.priceCur!==c.priceCur||prev.acqDate!==c.acqDate)&&curOf(c.priceCur)!=="AUD")){ delete c.priceAud; try{ await convertCoin(c); }catch{} }
  c.id=d.id||uid("c"); c.addedAt=c.addedAt||new Date().toISOString(); c.updatedAt=new Date().toISOString();
  if(c.photos&&c.coverId&&!c.photos.some(p=>p.id===c.coverId)) delete c.coverId;
  for(const r of (d.newReceipts||[])) if((c.receiptIds||[]).includes(r.id)){ const {fromPhoto,...rec}=r; for(const k of ["seller","orderNo","notes"]) if(typeof rec[k]==="string") rec[k]=rec[k].trim(); for(const k of ["total","postage"]) if(!blank(rec[k])){ const n=Number(String(rec[k]).replace(/[$,\s]/g,"")); rec[k]=isNaN(n)?null:n; } for(const k of Object.keys(rec)) if(rec[k]===""||rec[k]==null) delete rec[k]; rec.updatedAt=new Date().toISOString(); await dbPut("receipts",rec); }
  await dbPut("coins",c); d.saved=true;
  const maybeUnused=[...(d.removedFiles||[]),...filesOf(prev),...(d.newFiles||[])];
  if(d.fromWant){ const w=S.wanted.find(x=>x.id===d.fromWant); if(w){ await dbPut("wanted",{...w,got:true,gotAt:new Date().toISOString(),coinId:c.id}); } }
  await reload(); await dropUnused(maybeUnused); askPersist();
  if(d.id){ toast("Saved"); await popView(); }
  else { S.stack=[{kind:"detail",id:c.id}]; drawTop(true); toast("Coin added"); }
}
async function deleteCoin(id){ const c=S.coins.find(x=>x.id===id); const ids=filesOf(c); await dbDel("coins",id); await reload(); await dropUnused(ids); toast("Coin deleted"); await popView(); }

/* ---------- filters sheet ---------- */
function fsel(id,label,opts,cur,anyLabel){ return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-ff="${id.slice(3)}"><option value="">${esc(anyLabel||"Any")}</option>${opts.map(o=>Array.isArray(o)?`<option value="${esc(o[0])}" ${cur===o[0]?"selected":""}>${esc(o[1])}</option>`:`<option ${cur===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`; }
function filtersHTML(){
  const f=S.f, vals=k=>[...new Set(S.coins.map(c=>c[k]).filter(v=>!blank(v)))].sort((a,b)=>String(a).localeCompare(String(b)));
  const n=results().length;
  return `<div class="shead"><div class="wrap">${backBtn("Done")}<h2>Filters</h2><button type="button" class="btn sm" data-clearall>Clear all</button></div></div>
  <div class="wrap sbody">
   <section class="fsec"><h3>Denomination</h3><div class="pick">${GRP_ORDER.filter(g=>S.coins.some(c=>grpOf(c)===g)).map(g=>`<button type="button" data-grp="${g}" aria-pressed="${f.grp.includes(g)}">${GROUPS[g].label}</button>`).join("")}</div>
     ${fsel("ff_denom","Exact value",DENOMS.filter(d=>S.coins.some(c=>c.denom===d.k)).map(d=>d.k),f.denom)}</section>
   <section class="fsec"><h3>Year</h3><div class="grid2"><div class="field"><label for="ff_yFrom">From</label><input id="ff_yFrom" data-ff="yFrom" inputmode="numeric" value="${esc(f.yFrom)}" placeholder="e.g. 1966"></div><div class="field"><label for="ff_yTo">To</label><input id="ff_yTo" data-ff="yTo" inputmode="numeric" value="${esc(f.yTo)}" placeholder="e.g. 2023"></div></div></section>
   <section class="fsec"><h3>About the coin</h3><div class="grid2">
     ${fsel("ff_series","Theme / series",vals("series"),f.series)}${fsel("ff_coll","Collection",COLLS,f.coll)}
     ${fsel("ff_mint","Mint / privy mark",vals("mint"),f.mint)}${fsel("ff_colour","Coloured",[["yes","Coloured"],["no","Not coloured"]],f.colour)}
     ${fsel("ff_grade","Grade",GRADES,f.grade)}${fsel("ff_finish","Finish",FINISHES,f.finish)}
     ${fsel("ff_pack","Packaging",packOptions(),f.pack)}${fsel("ff_how","How acquired",HOWS,f.how)}</div>
     <label class="check-inline"><input type="checkbox" data-ffc="sets" ${f.sets?"checked":""}><span>Sets only</span></label></section>
   <section class="fsec"><h3>Finding it</h3><div class="grid2">${fsel("ff_storage","Storage location",vals("storage"),f.storage)}${fsel("ff_photos","Photos",[["mine","Has my photos"],["none","No photos of mine yet"]],f.photos)}</div>
     <label class="check-inline"><input type="checkbox" data-ffc="todo" ${f.todo?"checked":""}><span>Still needs details (to finish)</span></label>
     <label class="check-inline"><input type="checkbox" data-ffc="dupes" ${f.dupes?"checked":""}><span>Duplicates (quantity 2 or more)</span></label>
     ${fsel("ff_status","Show",[["all","All, including sold"],["sold","Sold / traded only"]],f.status==="owned"?"":f.status,"In my collection")}</section>
  </div>
  <div class="savebar"><div class="wrap"><button type="button" class="btn primary" data-back>Show ${n} coin${n===1?"":"s"}</button></div></div>`;
}
function updFilterCount(){ const b=document.querySelector("#sheet .savebar [data-back]"); if(b&&topV()&&topV().kind==="filters"){ const n=results().length; b.textContent=`Show ${n} coin${n===1?"":"s"}`; } }
/* ---------- album and year checklist sheets ---------- */
function albumHTML(d){
  const a=albumData().find(x=>x.key===d.key)||{key:d.key,units:[],wants:[]}; const o=a.units.length,w=a.wants.length;
  const us=a.units.slice().sort((x,y)=>(unitYear(x)||0)-(unitYear(y)||0)||x.title.localeCompare(y.title));
  const lbl=u=>{ const par=u.title.match(/\(([^)]+)\)\s*$/); if(u.item&&par) return par[1]; const s=u.title.replace(new RegExp("^"+String(u.year||"").replace(/[^\d]/g,"")+"\\s*"),"").replace(a.key,"").replace(/^[\s–\-:,]+/,"").trim(); return s||u.denom||""; };
  return `<div class="shead"><div class="wrap">${backBtn("Albums")}<h2>${esc(a.key)}</h2></div></div>
  <div class="wrap sbody">
    <div class="stats"><div class="stat" style="background:#DDF5F2"><b style="color:#115E59">${o}</b><span>Owned</span></div><div class="stat" style="background:#FFF4DB"><b style="color:#92400E">${w}</b><span>Wanted</span></div><div class="stat"><b>${o+w?Math.round(o/(o+w)*100)+"%":"—"}</b><span>Complete</span></div></div>
    ${w?progBar(o,0,o+w):""}
    <section class="card" style="padding:16px 8px 8px"><div class="slots">
      ${us.map(u=>`<button type="button" class="slot" data-open="${u.open}"><span class="ring" style="background:${unitTheme(u).tint}">${unitFace(u,52)}</span><b style="color:${unitTheme(u).text}">${esc(u.year||"—")}</b><span>${esc(lbl(u))}</span></button>`).join("")}
      ${a.wants.map(x=>`<button type="button" class="slot" data-wgot="${x.id}"><span class="empty-c want">Want</span><b>${esc(x.year||"—")}</b><span>${esc(x.title)}</span></button>`).join("")}
      <button type="button" class="slot" data-addwant="${esc(a.key)}"><span class="empty-c">+</span><b>Add</b><span>a want</span></button>
    </div></section>
    <p class="m0 muted small">Tap a coin to open it (coins in a set open the set). Tap an amber "Want" when you get it — it becomes a coin record.</p>
  </div>`;
}
function tlistHTML(d){
  const t=typeLists().find(x=>String(x.id)===String(d.id)); if(!t) return `<div class="shead"><div class="wrap">${backBtn()}</div></div>`;
  const own=t.issues.filter(i=>ownsIssue(t.id,i)).length;
  return `<div class="shead"><div class="wrap">${backBtn("Albums")}<h2>${esc(t.title)}</h2></div></div>
  <div class="wrap sbody"><div class="stats"><div class="stat" style="background:#DDF5F2"><b style="color:#115E59">${own}</b><span>Owned</span></div><div class="stat"><b>${t.issues.length-own}</b><span>Missing</span></div><div class="stat"><b>${Math.round(own/t.issues.length*100)}%</b><span>Complete</span></div></div>${progBar(own,0,t.issues.length)}
  <section class="card" style="padding:16px 8px 8px"><div class="slots">${t.issues.map(i=>{ const u=ownerOfIssue(t.id,i); return u?`<button type="button" class="slot" data-open="${u.open}"><span class="ring" style="background:#DDF5F2">${unitFace(u,52)}</span><b style="color:#115E59">${esc(i.year)}${i.mint?" "+esc(i.mint):""}</b><span>${i.mintage?esc(fmtNum(i.mintage)):""}</span></button>`:`<button type="button" class="slot" data-wantissue="${esc(t.id)}|${esc(i.year)}|${esc(i.mint||"")}"><span class="empty-c">+</span><b>${esc(i.year)}${i.mint?" "+esc(i.mint):""}</b><span>${i.mintage?esc(fmtNum(i.mintage)):""}</span></button>`; }).join("")}</div></section>
  <p class="m0 muted small">Year and mint list from Numista. Tap a gap to put it on your want list.</p></div>`;
}

/* ================= files shared by coins, set coins and receipts ================= */
function filesOf(c){ const ids=[]; if(!c) return ids; for(const p of (c.photos||[])) if(p&&!p.url) ids.push(p.id); for(const it of (c.setItems||[])) for(const p of (it.photos||[])) if(p&&!p.url) ids.push(p.id); return ids; }
function fileInUse(id){ return S.coins.some(c=>filesOf(c).includes(id))||S.receipts.some(r=>r.fileId===id); }
async function dropUnused(ids){ for(const id of new Set(ids)) if(id&&!fileInUse(id)) await dbDel("files",id); }

/* ================= sets: the coins inside a set ================= */
const pickKeys=(o,ks)=>{ const r={}; for(const k of ks) if(!blank(o[k])) r[k]=o[k]; return r; };
function itemSub(it){ return [it.denom,it.year,it.mint&&it.mint!=="None"?"Mint "+it.mint:"",it.mintage?"Mintage "+fmtNum(it.mintage):""].filter(Boolean).join(" · "); }
function itemFace(it,size,rev){ size=size||44; const ph=it.photos||[]; const p=ph.find(p=>p.side==="Reverse")||ph.find(p=>p.side==="Obverse")||ph[0]; return `<div class="face" style="--face:${size}px;width:${size}px;height:${size}px">${p?imgTag(p):drawnCoin({denom:it.denom})}</div>`; }
function setSec(d){ const c=d.draft, items=c.setItems||[];
  return `<div class="setin"><div class="flabel" style="display:flex;align-items:center;gap:8px">Coins in this set<span class="muted small" style="font-weight:600">${items.length?items.length+" listed":""}</span></div>
  ${items.length?`<div class="sitems">${items.map((it,i)=>`<div class="sitem">${itemFace(it,44,true)}<span class="tx"><b>${esc(it.title||"Coin "+(i+1))}</b><span>${esc(itemSub(it)||"Added by hand")}</span></span><button type="button" class="btn sm ghost" data-sirm="${i}" aria-label="Remove ${esc(it.title||"coin")}">×</button></div>`).join("")}</div>`:`<p class="m0 muted small">Add each coin in the set — from Numista for its details and reference photos, or by hand.</p>`}
  <div class="row">${nsKey()?`<button type="button" class="btn primary" data-siadd>Add coin from Numista</button>`:""}<button type="button" class="btn" data-siman>${d.siManual?"Hide":"Add by hand"}</button></div>
  ${d.siManual?`<div class="grid2 siman"><div class="field full"><label for="si_title">Coin name</label><input id="si_title" autocomplete="off" placeholder="e.g. Muttaburrasaurus $1"></div><div class="field"><label for="si_year">Year</label><input id="si_year" inputmode="numeric" value="${esc(/^\d{4}$/.test(String(c.year||""))?c.year:"")}"></div><div class="field"><label for="si_mint">Mint / privy mark</label><input id="si_mint" list="dl_mint" autocomplete="off"></div><div class="field full"><label for="si_denom">Denomination</label><select id="si_denom"><option value="">—</option>${DENOMS.map(x=>`<option ${x.k===c.denom?"selected":""}>${x.k}</option>`).join("")}</select></div><div class="full"><button type="button" class="btn primary block" data-siok>Add to set</button></div></div>`:""}
  ${items.length?"":inp("setCount","Number of coins in the set",c,{num:"numeric",hint:"only if you're not listing them"})}
  ${inp("setContents","Notes about the set",c,{area:true,ph:"e.g. comes in a presentation box with certificate"})}</div>`; }
function drawSet(){ const el=$("#setFields"); if(el){ el.innerHTML=setSec(topV()); hydrateImages(el); } }
function setCard(c){ if(!c.isSet) return ""; const items=c.setItems||[];
  if(!items.length) return S.readOnly?"":`<div class="todo" style="background:#E0E7FF"><span><b>Coins in this set:</b> list each coin to get its details and count it in albums.</span><button type="button" class="btn sm" data-edit="${c.id}">Add</button></div>`;
  return `<section class="card"><h3><span class="ico" style="background:#3730A3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="12" cy="16" r="4"/></svg></span>Coins in this set<span class="sp"></span><span class="muted small">${items.length}</span></h3>
  <div class="sitems" style="padding-bottom:12px">${(com=>items.map(it=>`<details class="sdet"><summary>${itemFace(it,44,true)}<span class="tx"><b>${esc(setItemLabel(it,com)||"Coin")}</b><span>${esc(itemSub(it))}</span></span></summary><div class="sdbody">${com&&it.title?`<p class="m0 small" style="padding-top:6px">${esc(it.title)}</p>`:""}${(it.photos||[]).length?`<div class="thumbs">${it.photos.map(p=>`<div class="th ref"><button type="button" aria-label="Reference photo, ${esc(p.side||"")}">${imgTag(p,"data-zoom")}<span class="rb">REF · ${esc(shortSrc(p.source))}</span></button></div>`).join("")}</div>`:""}${kv("Composition",it.composition)+kv("Mass",unit(it.mass,"g"))+kv("Diameter",unit(it.diameter,"mm"))+kv("Edge",it.edge)+kv("Effigy",it.effigy)+kv("Reverse designer",it.reverseDesigner)+kv("Series",it.series)}${it.ns?`<p class="m0 small muted" style="padding:8px 0">Data provided by Numista · <a href="${esc(it.ns.url)}" target="_blank" rel="noopener">N# ${esc(it.ns.id)}</a></p>`:""}</div></details>`).join(""))(setCommon(items))}</div></section>`; }
function setfindHTML(d){ const c=d.target.draft, n=(c.setItems||[]).length;
  return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Add coin to set</h2></div></div>
  <div class="wrap sbody">
    <div class="todo" style="background:#E0E7FF"><span><b>${esc(titleOf(c))}</b><br><span class="muted">${n?`${n} coin${n===1?"":"s"} listed so far. `:""}Search for one coin from the set and pick it. Repeat for each coin.</span></span></div>
    ${nsKey()?nsSearchBlock(d):NS_SETUP}
  </div>`; }
async function siLink(d,issue){
  const t=d.type, tgt=d.target, c=tgt.draft; d.busy="Adding it to the set…"; d.issues=null; drawTop();
  const o=fromNumista(t,issue);
  const it={id:uid("si"),...pickKeys(o,["title","denom","year","mint","mintage","composition","mass","diameter","thickness","edge","effigy","reverseDesigner","series"]),ns:nsInfo(t,d.typeIssues),photos:[]};
  for(const [side,obj] of [["Obverse",t.obverse],["Reverse",t.reverse]]){ const pic=obj&&(obj.picture||obj.thumbnail); if(!pic) continue; const r=await nsImage(pic); if(!r) continue; if(!r.url) tgt.newFiles.push(r.id); it.photos.push({id:r.id,url:r.url,mine:false,side,source:"Numista",link:it.ns.url}); }
  c.setItems=[...(c.setItems||[]),it]; tgt.lastSetQ=d.q; d.busy="";
  await popView(); toast(`Added — ${c.setItems.length} coin${c.setItems.length===1?"":"s"} in the set`);
}

/* ================= packaging ================= */
function packOptions(extra){ const used=[...new Set(S.coins.map(c=>c.packaging).filter(v=>!blank(v)&&!PACKS.includes(v)&&v!==PACK_OTHER))]; if(extra&&!PACKS.includes(extra)&&extra!==PACK_OTHER&&!used.includes(extra)) used.push(extra); return [...PACKS,...used.sort()]; }
function packField(d){ const c=d.draft; const opts=[...packOptions(d.packOther?"":c.packaging),PACK_OTHER]; const cur=d.packOther?PACK_OTHER:c.packaging;
  return `<div class="field"><span class="flabel">Packaging ${infoBtn("packaging")}</span>${pick("packaging",opts,cur)}<input id="f_packOther" ${d.packOther?"":"hidden"} placeholder="Type the packaging, e.g. PNC, Wallet" autocomplete="off" value="${esc(d.packOtherText||"")}" aria-label="Other packaging"></div>`; }

/* ================= statistics by denomination ================= */
function denomPanel(owned){
  const rows=new Map(); const row=k=>{ if(!rows.has(k)) rows.set(k,{k,coins:0,records:0,value:0}); return rows.get(k); };
  for(const c of owned){ const dk=c.denom||"Not recorded"; const r=row(dk); r.records++; if(!blank(c.value)) r.value+=+c.value*qtyOf(c);
    const items=c.isSet?(c.setItems||[]):[];
    if(items.length){ for(const it of items) row(it.denom||dk).coins+=qtyOf(c); } else r.coins+=coinsIn(c); }
  const order=k=>{ const i=DENOMS.findIndex(d=>d.k===k); return i<0?999:i; };
  const list=[...rows.values()].sort((a,b)=>order(a.k)-order(b.k)); const max=Math.max(1,...list.map(r=>r.coins));
  return `<div class="panel"><h3>By denomination</h3><div class="dlist">${list.map(r=>{ const d=DENOMS.find(x=>x.k===r.k); const g=GROUPS[d?d.grp:"other"]; return `<div class="drow"><span class="gico" style="background:${g.solid}">${esc(d?d.face:"?")}</span><div class="dmain"><div class="dtop"><b>${esc(r.k)}</b><span class="num">${r.coins} coin${r.coins===1?"":"s"}</span></div><div class="track"><div class="fill" style="width:${r.coins/max*100}%;background:${g.solid}"></div></div><span class="muted small">${r.records?`${r.records} record${r.records===1?"":"s"}`:"in sets"}${r.value?` · value ${aud(Math.round(r.value))}`:""}</span></div></div>`; }).join("")}</div><p class="m0 muted small">Coins counts every coin — duplicates and each coin in a set. Value is your current value for those records.</p></div>`;
}

/* ================= receipts & documents ================= */
const isPdf=r=>/pdf/i.test((r&&r.type)||"");
function rcThumb(r){ return isPdf(r)?`<span class="rcthumb rcpdf" aria-label="PDF">PDF</span>`:`<span class="rcthumb"><img data-fid="${esc(r.fileId)}" alt=""></span>`; }
function rcSummary(r){ return [r.date?fmtDate(r.date):"",r.seller,!blank(r.total)?aud(r.total)+(+r.postage?" incl. "+aud(r.postage)+" postage":""):""].filter(Boolean).join(" · ")||"Receipt (no details yet)"; }
const rcCoins=id=>S.coins.filter(c=>(c.receiptIds||[]).includes(id));
const rcAll=()=>S.receipts.slice().sort((a,b)=>String(b.date||(b.addedAt||"").slice(0,10)).localeCompare(String(a.date||(a.addedAt||"").slice(0,10))));
function rcFind(id){ const t=topV(); return S.receipts.find(r=>r.id===id)||((t&&t.newReceipts)||[]).find(r=>r.id===id)||null; }
async function storeReceiptFile(file){
  const pdf=/pdf/i.test(file.type||"")||/\.pdf$/i.test(file.name||"");
  if(pdf){ if(file.size>20*1048576) throw new Error("That PDF is over 20 MB — too big to keep."); const id=uid("f"); await dbPut("files",{id,blob:file,type:"application/pdf",name:file.name||id+".pdf"}); return {fileId:id,type:"application/pdf",name:file.name||""}; }
  const blob=await resizeImage(file,2200); const id=uid("f"); await dbPut("files",{id,blob,type:"image/jpeg",name:id+".jpg"}); return {fileId:id,type:"image/jpeg",name:file.name||""};
}
function rcNewFields(r){ return `<div class="rcfields"><div class="field"><label for="rd_${r.id}">Receipt date</label><input type="date" id="rd_${r.id}" data-rnf="date" data-rid="${r.id}" value="${esc(r.date||"")}"></div><div class="field"><label for="rs_${r.id}">Seller</label><input id="rs_${r.id}" data-rnf="seller" data-rid="${r.id}" list="dl_source" autocomplete="off" value="${esc(r.seller||"")}" placeholder="e.g. Royal Australian Mint"></div><div class="grid2"><div class="field"><label for="rt_${r.id}">Receipt total (A$)</label><input id="rt_${r.id}" data-rnf="total" data-rid="${r.id}" inputmode="decimal" value="${esc(r.total??"")}" placeholder="whole amount"></div><div class="field"><label for="rp_${r.id}">Postage &amp; fees</label><input id="rp_${r.id}" data-rnf="postage" data-rid="${r.id}" inputmode="decimal" value="${esc(r.postage??"")}" placeholder="0"></div></div><div class="field"><label for="ro_${r.id}">Order / invoice no.</label><input id="ro_${r.id}" data-rnf="orderNo" data-rid="${r.id}" autocomplete="off" value="${esc(r.orderNo||"")}" placeholder="optional"></div></div>`; }
function rcSec(d){ const c=d.draft; const list=(c.receiptIds||[]).map(rcFind).filter(Boolean);
  return `<h3><span class="ico" style="background:#0F766E"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg></span>Receipts &amp; documents<span class="sp" style="flex:1"></span><span class="muted small">${list.length||""}</span></h3>
  <div class="row"><button type="button" class="btn primary" data-rcnew>New receipt</button>${S.receipts.some(r=>!(c.receiptIds||[]).includes(r.id))?`<button type="button" class="btn" data-rcuse>Use an existing receipt</button>`:""}</div>
  <p class="m0 muted small">Photos or PDFs, kept separate from your coin photos. One receipt can cover several coins — link it to each of them.</p>
  ${list.map(r=>{ const isNew=((d.newReceipts||[]).some(x=>x.id===r.id)); const others=rcCoins(r.id).filter(x=>x.id!==d.id).length;
    return `<div class="rcitem">${rcThumb(r)}<div class="pc">${isNew?`<b class="small" style="color:#0F766E">New receipt</b>${rcNewFields(r)}`:`<b>${esc(rcSummary(r))}</b><span class="muted small">${others?`Also covers ${others} other coin${others===1?"":"s"}`:"Only this coin so far"}</span>`}<div class="phbtns"><button type="button" class="btn sm" data-rcview="${r.id}">View</button><button type="button" class="btn sm ghost" data-rcun="${r.id}">Unlink</button></div></div></div>`; }).join("")}
  ${list.some(r=>r.date||r.seller)?`<button type="button" class="btn sm" data-rcfill>Fill empty date &amp; source from receipt</button>`:""}`; }
function drawRc(){ const el=$("#rcSec"); if(el){ el.innerHTML=rcSec(topV()); hydrateImages(el); } }
async function addReceiptToEdit(files){ const t=topV(); if(!t||t.kind!=="edit") return; readForm(); const c=t.draft; t.newReceipts=t.newReceipts||[]; let n=0;
  for(const f of files){ try{ const x=await storeReceiptFile(f); t.newFiles.push(x.fileId); const r={id:uid("rc"),...x,addedAt:new Date().toISOString()}; t.newReceipts.push(r); c.receiptIds=[...(c.receiptIds||[]),r.id]; n++; }catch(e){ toast(e.message||String(e)); } }
  drawRc(); if(n) toast(n===1?"Receipt added — add its date and seller if you like":`${n} receipts added`); }
async function viewReceiptFile(r){ if(!r) return; const u=await urlFor(r.fileId); if(!u){ toast("That file isn't on this phone."); return; }
  if(isPdf(r)){ const a=document.createElement("a"); a.href=u; a.target="_blank"; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove(); return; }
  const el=document.createElement("div"); el.id="zoom"; el.innerHTML=`<img src="${u}" alt="Receipt"><button type="button" class="btn">Close</button>`; document.body.appendChild(el); }
async function saveReceiptFile(r){ const u=await urlFor(r.fileId); if(!u){ toast("That file isn't on this phone."); return; } const base=(r.name||"").replace(/\.[a-z0-9]+$/i,"")||("receipt-"+(r.date||todayISO())); const a=document.createElement("a"); a.href=u; a.download=base+(isPdf(r)?".pdf":".jpg"); document.body.appendChild(a); a.click(); a.remove(); toast("Saved — check your Downloads"); }
function fillFromReceipt(c,r,isNewCoin){ let n=0; if(r.date&&(blank(c.acqDate)||(isNewCoin&&c.acqDate===todayISO()))){ c.acqDate=r.date; n++; } if(r.seller&&blank(c.source)){ c.source=r.seller; n++; } if(blank(c.acqHow)){ c.acqHow="Bought"; n++; } return n; }
function rcpickHTML(d){ const linked=new Set(d.target.draft.receiptIds||[]); const list=rcAll().filter(r=>!linked.has(r.id));
  return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Use an existing receipt</h2></div></div>
  <div class="wrap sbody">${list.length?`<div class="listbox">${list.map(r=>{ const n=rcCoins(r.id).length; return `<button type="button" class="rcrow" data-rcpick="${r.id}">${rcThumb(r)}<span class="tx"><b>${esc(rcSummary(r))}</b><span>${n?`Covers ${n} coin${n===1?"":"s"}`:"Not linked to any coins"}</span></span></button>`; }).join("")}</div>`:`<div class="empty"><b>No other receipts</b><span>Add a new one with "New receipt".</span></div>`}</div>`; }
function linkRows(d,list){ return list.map(c=>`<label class="ckrow"><input type="checkbox" data-rck="${c.id}" ${d.sel.has(c.id)?"checked":""}>${faceHTML(c).replace('class="face"','class="face" style="--face:36px;width:36px;height:36px"')}<span class="tx"><b>${esc(titleOf(c))}</b><span>${esc([c.denom,c.year,c.isSet?"Set of "+setSize(c):""].filter(Boolean).join(" · "))}</span></span></label>`).join("")||`<p class="muted small" style="padding:8px">No coins match.</p>`; }
function linkList(d){ return sorted(S.coins.filter(c=>matchQuery(c,d.lq||"")).slice()); }
function receiptHTML(d){
  const r=S.receipts.find(x=>x.id===d.id); if(!r) return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Receipt</h2></div></div><div class="wrap sbody"><div class="empty"><b>This receipt was deleted</b></div></div>`;
  const coins=rcCoins(r.id);
  return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Receipt</h2></div></div>
  <div class="wrap sbody">${datalists()}
    <section class="card" style="padding:14px">${isPdf(r)?`<div class="stage ref" style="flex-direction:column;gap:10px"><span class="rcthumb rcpdf" style="width:84px;height:104px;font-size:20px">PDF</span><span class="muted small">${esc(r.name||"PDF document")}</span></div>`:`<div class="stage ref"><img data-fid="${esc(r.fileId)}" alt="Receipt" data-zoom></div>`}
      <div class="row" style="margin-top:10px"><button type="button" class="btn" data-rcfile="${r.id}">${isPdf(r)?"Open PDF":"View full size"}</button><button type="button" class="btn" data-rcdl="${r.id}">Save to phone</button></div></section>
    <section class="fsec"><h3>Details</h3>
      <div class="field"><label for="rv_date">Receipt date</label><input type="date" id="rv_date" value="${esc(r.date||"")}"></div>
      <div class="field"><label for="rv_seller">Seller</label><input id="rv_seller" list="dl_source" autocomplete="off" value="${esc(r.seller||"")}"></div>
      <div class="grid2"><div class="field"><label for="rv_total">Receipt total (A$)</label><input id="rv_total" inputmode="decimal" value="${esc(r.total??"")}"></div><div class="field"><label for="rv_post">Postage &amp; fees (A$)</label><input id="rv_post" inputmode="decimal" value="${esc(r.postage??"")}" placeholder="0"></div></div>
      <p class="m0 muted small" style="margin-top:-4px">Receipt total is the whole amount you paid, including postage.</p>
      <div class="field"><label for="rv_order">Order / invoice no.</label><input id="rv_order" autocomplete="off" value="${esc(r.orderNo||"")}"></div>
      <div class="field"><label for="rv_notes">Notes</label><textarea id="rv_notes">${esc(r.notes||"")}</textarea></div>
      <button type="button" class="btn primary" data-rcsave="${r.id}">Save details</button></section>
    <section class="fsec"><h3>Coins on this receipt<span class="sp" style="flex:1"></span><span class="muted small">${coins.length}</span></h3>
      ${coins.length?`<div class="listbox">${coins.map(c=>{ const q=qtyOf(c), cv=covOf(c,r.id), pe=postageEach(c), ce=costEach(c); return `<div class="rcc"><button type="button" class="rccmain" data-open="${c.id}">${faceHTML(c).replace('class="face"','class="face" style="--face:40px;width:40px;height:40px"')}<span class="tx"><b>${esc(titleOf(c))}</b><span>${esc([c.year,q>1?"Qty "+q:"",blank(c.price)?"No price yet":aud(priceAUD(c)??c.price)+" each"+(pe>0&&ce!=null?" + "+aud(Math.round(pe*100)/100)+" postage = "+aud(ce):"")].filter(Boolean).join(" · "))}</span></span></button><button type="button" class="btn sm ghost rcx" data-rcunc="${c.id}" aria-label="Unlink ${esc(titleOf(c))}">×</button>${q>1?`<div class="rccov"><span>This receipt covers</span><div class="mini" role="group" aria-label="How many on this receipt"><button type="button" data-rccov="${c.id}|-1" aria-label="Fewer" ${cv<=1?"disabled":""}>−</button><b>${cv}</b><button type="button" data-rccov="${c.id}|1" aria-label="More" ${cv>=q?"disabled":""}>+</button></div><span>of ${q}</span></div>`:""}</div>`; }).join("")}</div>`:`<p class="m0 muted">Not linked to any coins yet.</p>`}
      ${d.linking?`<div class="panel" style="padding:12px;box-shadow:none;border:1px solid var(--line)"><div class="field"><label for="rlq">Find coins</label><input id="rlq" type="search" autocomplete="off" value="${esc(d.lq||"")}" placeholder="e.g. 2022 dinosaurs"></div><div class="cklist" id="rlList">${linkRows(d,linkList(d))}</div><label class="check-inline"><input type="checkbox" id="rlFill" ${d.fill!==false?"checked":""}><span>Fill empty date acquired and source from this receipt</span></label><div class="row"><button type="button" class="btn primary" data-rclsave>Save links</button><button type="button" class="btn ghost" data-rclcancel>Cancel</button></div></div>`:`<button type="button" class="btn" data-rclink>Link to more coins</button>`}
      ${coins.length&&(r.date||r.seller)&&!d.linking?`<button type="button" class="btn" data-rcfillall="${r.id}">Fill empty date &amp; source on these coins</button>`:""}
      ${!d.linking?splitHTML(r,d):""}
    </section>
    <button type="button" class="btn danger" data-rcdel="${r.id}" ${coins.length?"disabled":""}>${d.confirmDel?"Tap again to delete":"Delete receipt"}</button>${coins.length?`<p class="m0 muted small">A receipt can only be deleted once no coins are linked to it.</p>`:""}
  </div>`;
}
function viewReceipts(){ const list=rcAll();
  return `<section class="view">${backMore}<div class="panel"><h3>Receipts &amp; documents</h3><p class="m0">Every receipt and document, newest first. One receipt can cover several coins.</p><div class="row"><button type="button" class="btn primary" data-rcnewstd>New receipt</button></div></div>
  ${list.length?`<div class="listbox">${list.map(r=>{ const n=rcCoins(r.id).length; return `<button type="button" class="rcrow" data-rcopen="${r.id}">${rcThumb(r)}<span class="tx"><b>${esc(rcSummary(r))}</b><span>${n?`${n} coin${n===1?"":"s"}`:"Not linked to any coins"}</span></span></button>`; }).join("")}</div>`:`<div class="empty"><b>No receipts yet</b><span>Add one here, or from a coin's Edit screen.</span></div>`}</section>`; }
function rcCard(c){ const list=(c.receiptIds||[]).map(id=>S.receipts.find(r=>r.id===id)).filter(Boolean); if(!list.length) return "";
  return `<section class="card"><h3><span class="ico" style="background:#0F766E"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg></span>Receipts &amp; documents<span class="sp"></span><span class="muted small">${list.length}</span></h3><div class="rclist" style="padding-bottom:12px">${list.map(r=>{ const n=rcCoins(r.id).length; return `<button type="button" class="rcrow" data-rcopen="${r.id}">${rcThumb(r)}<span class="tx"><b>${esc(rcSummary(r))}</b><span>${n>1?`Covers ${n} coins`:"This coin only"}</span></span></button>`; }).join("")}</div></section>`; }
async function createStdReceipt(file){ try{ const x=await storeReceiptFile(file); const r={id:uid("rc"),...x,addedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; await dbPut("receipts",r); await reload(); render(); openView({kind:"receipt",id:r.id,linking:true,sel:new Set(),fill:true}); toast("Receipt saved — tick the coins it covers"); }catch(e){ toast(e.message||String(e)); } }

/* ================= insurance report ================= */
const RANK=["Obverse","Reverse","Card / packaging","Edge","Slab label","Other"];
function ownForReport(c){ const own=(c.photos||[]).filter(p=>p.mine&&!p.url&&p.side!=="Certificate"); const rk=p=>{ const i=RANK.indexOf(p.side||"Other"); return i<0?RANK.length:i; }; const cv=own.find(p=>p.id===c.coverId&&p.side!=="Other"); return [...(cv?[cv]:[]),...own.filter(p=>p!==cv).sort((a,b)=>rk(a)-rk(b))]; }
function refForReport(c){ const rk=p=>p.side==="Obverse"?0:p.side==="Reverse"?1:2; let r=(c.photos||[]).filter(p=>!p.mine).sort((a,b)=>rk(a)-rk(b)); if(!r.length) for(const it of (c.setItems||[])) r=r.concat((it.photos||[]).slice().sort((a,b)=>rk(a)-rk(b))); return r; }
function pickN(list,n){ if(n<2||list.length<2) return list.slice(0,1); const a=list[0]; return [a,list.find(p=>p!==a&&p.side!==a.side)||list[1]]; }
async function imgData(p){ if(!p) return null; try{ let blob; if(p.url){ const r=await fetch(p.url,{mode:"cors"}); if(!r.ok) return null; blob=await r.blob(); } else { const f=await dbGet("files",p.id); if(!f) return null; blob=f.blob; } if(!/^image\//.test(blob.type||"image/")) return null; const bmp=await createImageBitmap(blob); const S2=240, cv=document.createElement("canvas"); cv.width=S2; cv.height=S2; const x=cv.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,S2,S2); const s=Math.max(S2/bmp.width,S2/bmp.height); x.drawImage(bmp,(S2-bmp.width*s)/2,(S2-bmp.height*s)/2,bmp.width*s,bmp.height*s); return cv.toDataURL("image/jpeg",0.8); }catch{ return null; } }
function viewReport(){ const o=S.rep||(S.rep={photos:true,two:false,ref:true,sold:false,by:""}); if(o.two===undefined) o.two=false; if(o.ref===undefined) o.ref=true;
  const list=S.coins.filter(c=>o.sold||isOwned(c)); const none=list.filter(c=>!ownForReport(c).length); const otherOnly=list.filter(c=>{ const p=ownForReport(c); return p.length&&p.every(x=>x.side==="Other"); });
  return `<section class="view">${backMore}<div class="panel"><h3>Insurance report</h3><p class="m0">A PDF listing of your coins with photos, grade, quantity, price paid, current value and where each is kept, with totals. Save it, open it, or share it straight to email or Drive.</p>
  <label class="check-inline"><input type="checkbox" id="rPhotos" ${o.photos?"checked":""}><span>Include photos of my coins</span></label>
  <label class="check-inline"><input type="checkbox" id="rTwo" ${o.two?"checked":""} ${o.photos?"":"disabled"}><span>Two photos per coin (front and back, or the card)</span></label>
  <label class="check-inline"><input type="checkbox" id="rRef" ${o.ref?"checked":""} ${o.photos?"":"disabled"}><span>If there's no photo of mine, use the reference image — clearly labelled as not my coin</span></label>
  <label class="check-inline"><input type="checkbox" id="rSold" ${o.sold?"checked":""}><span>Include sold and traded coins</span></label>
  <div class="field"><label for="rBy">Prepared for (optional)</label><input id="rBy" value="${esc(o.by)}" placeholder="e.g. Home &amp; contents insurer"></div>
  ${o.photos&&none.length?`<div class="todo"><span><b>${none.length} coin${none.length===1?" has":"s have"} no photos of your own.</b> ${o.ref?"They'll use labelled reference images where there is one.":"They'll show “No owner photo”."}</span><button type="button" class="btn sm" data-shownophoto>Show them</button></div>`:""}
  ${o.photos&&otherOnly.length?`<div class="todo"><span>${otherOnly.length} coin${otherOnly.length===1?" only has a photo":"s only have photos"} labelled “Other”. If that's a receipt, open the coin › Edit › <b>Move to receipts</b>.</span></div>`:""}
  <button type="button" class="btn primary" data-mkreport>Create PDF</button><div class="row" id="repOut"></div></div></section>`; }
function loadJsPDF(){ if(window.jspdf) return Promise.resolve(); return new Promise((res,rej)=>{ const sc=document.createElement("script"); sc.src="jspdf.umd.min.js"; sc.onload=()=>res(); sc.onerror=()=>rej(new Error("Couldn't load the PDF maker — open the app once while online, then try again.")); document.head.appendChild(sc); }); }
const pdfTxt=t=>String(t??"").replace(/[–—]/g,"-").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/×/g,"x").replace(/…/g,"...").replace(/[^\x20-\x7E\xA0-\xFF\n]/g,"");
async function makeReport(){
  const o=S.rep, out=$("#repOut"), say=m=>{ if(out) out.innerHTML=`<span class="muted small">${esc(m)}</span>`; };
  say("Making the PDF…"); await loadJsPDF();
  const list=sorted(S.coins.filter(c=>o.sold||isOwned(c)).slice());
  const totP=list.reduce((a,c)=>{ const p=costEach(c); return a+(p==null?0:p*qtyOf(c)); },0), totPost=list.reduce((a,c)=>a+(priceAUD(c)==null?0:postageTotal(c)),0), totV=list.reduce((a,c)=>a+(blank(c.value)?0:+c.value*qtyOf(c)),0), nCoins=list.reduce((a,c)=>a+coinsIn(c),0);
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:"mm",format:"a4"}); const W=210, M=14, BOT=283;
  const PW=o.photos?(o.two?27:14):0, COINW=86-PW;
  const cols=[...(o.photos?[["",PW]]:[]),["Coin",COINW],["Grade",18],["Qty",10],["Cost each",21],["Value each",21],["Kept in",26]];
  let y=M, anyRef=false;
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(49,46,129); doc.text("Coin collection - insurance listing",M,y+5); y+=10;
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  const sub=pdfTxt(`${o.by?"Prepared for "+o.by+"  ·  ":""}${fmtDate(todayISO())}  ·  ${list.length} records, ${nCoins} coins  ·  Total cost ${aud(Math.round(totP))||"$0"}${totPost?" (incl. postage "+aud(Math.round(totPost))+")":""}  ·  Current value ${aud(Math.round(totV))||"$0"}`);
  doc.text(doc.splitTextToSize(sub,W-2*M),M,y+3); y+=9;
  const head=()=>{ doc.setFillColor(238,242,255); doc.rect(M,y,W-2*M,7,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(49,46,129); let x=M+1.5; for(const [h,w] of cols){ doc.text(h,x,y+4.8); x+=w; } y+=8; doc.setFont("helvetica","normal"); doc.setTextColor(20,20,20); };
  head(); let n=0;
  for(const c of list){
    if(out&&++n%5===0) say(`Adding coin ${n} of ${list.length}…`);
    const coinW=COINW-4, keptW=26-3;
    let pics=[], isRef=false;
    if(o.photos){ let cand=pickN(ownForReport(c),o.two?2:1); if(!cand.length&&o.ref){ cand=pickN(refForReport(c),o.two?2:1); isRef=cand.length>0; } for(const p of cand){ const dt=await imgData(p); if(dt) pics.push(dt); } if(!pics.length) isRef=false; if(isRef) anyRef=true; }
    const det=[c.denom,c.year,c.mint&&c.mint!=="None"?"Mint "+c.mint:"",c.packaging,c.isSet?"Set of "+setSize(c):"",c.serial?"Serial "+c.serial:""].filter(Boolean).join(" · ");
    const items=c.isSet?(c.setItems||[]):[]; let contains=items.length?"Contains: "+items.map(it=>it.title||"").filter(Boolean).join("; "):""; if(contains.length>240) contains=contains.slice(0,237)+"...";
    doc.setFont("helvetica","bold"); doc.setFontSize(9); const tl=doc.splitTextToSize(pdfTxt(titleOf(c)),coinW); doc.setFont("helvetica","normal");
    const gtxt=gradeText(c)||({"Uncirculated":"UNC","Frosted uncirculated":"Frosted UNC","Circulating":"Circulating","Specimen":"Specimen","Proof":"Proof"}[c.finish]||""); doc.setFontSize(8.5); const gl=doc.splitTextToSize(pdfTxt(gtxt),16);
    doc.setFontSize(8); const dl=det?doc.splitTextToSize(pdfTxt(det),coinW):[]; const cl=contains?doc.splitTextToSize(pdfTxt(contains),coinW):[]; const rl=isRef?doc.splitTextToSize("Photo: reference image - not the owner's coin",coinW):[]; const kl=doc.splitTextToSize(pdfTxt(c.storage||""),keptW);
    const h=Math.max(o.photos?15:9, tl.length*3.9+(dl.length+cl.length+rl.length)*3.4+4, kl.length*3.4+4, gl.length*3.6+4);
    if(y+h>BOT){ doc.addPage(); y=M; head(); }
    let x=M+1.5;
    if(o.photos){ pics.forEach((dt,i)=>doc.addImage(dt,"JPEG",x+i*13,y+1,12,12)); if(!pics.length){ doc.setFontSize(6.5); doc.setTextColor(150,150,150); doc.text(doc.splitTextToSize("No owner photo",PW-3),x,y+5); doc.setTextColor(20,20,20); } x+=PW; }
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(tl,x,y+4); doc.setFont("helvetica","normal"); doc.setFontSize(8);
    let ly=y+4+tl.length*3.9; doc.setTextColor(90,90,90); if(dl.length){ doc.text(dl,x,ly); ly+=dl.length*3.4; } if(cl.length){ doc.text(cl,x,ly); ly+=cl.length*3.4; } if(rl.length){ doc.setTextColor(146,64,14); doc.setFont("helvetica","italic"); doc.text(rl,x,ly); doc.setFont("helvetica","normal"); } doc.setTextColor(20,20,20);
    x+=COINW; doc.setFontSize(8.5);
    const pa=costEach(c);
    doc.text(gl,x,y+4); x+=18;
    for(const [val,w] of [[String(qtyOf(c)),10],[pa!=null?aud(pa):"",21],[blank(c.value)?"":aud(c.value),21]]){ doc.text(pdfTxt(val),x,y+4); x+=w; }
    doc.setFontSize(8); doc.text(kl,x,y+4);
    y+=h; doc.setDrawColor(225,228,236); doc.line(M,y,W-M,y); y+=1;
  }
  if(y+12>BOT){ doc.addPage(); y=M; }
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text(pdfTxt(`Totals: ${nCoins} coins  ·  Total cost ${aud(Math.round(totP))||"$0"}  ·  Current value ${aud(Math.round(totV))||"$0"}`),M,y+6);
  const pages=doc.getNumberOfPages(); for(let i=1;i<=pages;i++){ doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(120,120,120); doc.text(pdfTxt(`Cost each = price paid plus a share of any postage. Values are the owner's own estimates.${anyRef?" Photos marked as reference images are catalogue pictures, not the owner's coin.":""} MyMint ${APP_VERSION}  ·  Page ${i} of ${pages}`),M,292,{maxWidth:W-2*M}); }
  const blob=doc.output("blob"), name=`mymint-insurance-report-${todayISO()}.pdf`, url=URL.createObjectURL(blob);
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([blob],name,{type:"application/pdf"})]}));
  S._repFile=new File([blob],name,{type:"application/pdf"});
  if(out) out.innerHTML=`<a class="btn primary" href="${url}" download="${esc(name)}">Save PDF to phone</a><a class="btn" href="${url}" target="_blank" rel="noopener">Open PDF</a>${canShare?`<button type="button" class="btn" data-sharerep>Share…</button>`:""}<span class="muted small">${pages} page${pages===1?"":"s"} · ${(blob.size/1024).toFixed(0)} KB</span>`;
}

/* ================= collection checklist (by denomination, for coin fairs) ================= */
const ckOpts=()=>S.ck||(S.ck={off:[],split:true,wants:true,money:true,photos:true,sold:false});
const dKey=k=>k&&DENOMS.some(d=>d.k===k)?k:"Other";
function ckRows(o){ const rows=[];
  for(const c of S.coins.filter(c=>o.sold||isOwned(c))){ const items=c.isSet?(c.setItems||[]):[];
    if(o.split&&items.length){ const sn=nameParts(c).main; items.forEach((it,i)=>rows.push({c,it,denom:dKey(it.denom||c.denom),year:it.year||c.year,name:nameParts(it).main,sub:[nameParts(it).main.startsWith(sn)?`Part of a set of ${items.length}`:"In set: "+sn,it.mintage?"Mintage "+fmtNum(it.mintage):""],mint:it.mint||c.mint,first:i===0})); }
    else rows.push({c,denom:dKey(c.denom),year:c.year,name:nameParts(c).main,sub:[c.series&&!nameParts(c).main.toLowerCase().includes(String(c.series).toLowerCase())?c.series:"",c.isSet?`Set of ${setSize(c)}`+(items.length?": "+items.map(it=>setItemLabel(it,setCommon(items))).join(", "):""):"",c.mintage?"Mintage "+fmtNum(c.mintage):""],mint:c.mint}); }
  for(const r of rows){ const c=r.c; r.sub=[...r.sub,c.variety,c.colourised?"Coloured":"",isOwned(c)?"":c.status].filter(Boolean); if(r.mint==="None") r.mint=""; r.grade=gradeText(c)||({"Uncirculated":"UNC","Frosted uncirculated":"Frosted UNC","Proof":"Proof","Specimen":"Specimen","Circulating":"Circ."}[c.finish]||""); r.pack=c.packaging||""; r.qty=qtyOf(c); }
  return rows; }
function ckSections(o){ const rows=ckRows(o), wants=o.wants?S.wanted.filter(w=>!w.got):[]; const m=new Map();
  const get=k=>{ if(!m.has(k)) m.set(k,{k,rows:[],wants:[]}); return m.get(k); };
  for(const r of rows) get(r.denom).rows.push(r); for(const w of wants) get(dKey(w.denom)).wants.push(w);
  const yr=x=>{ const n=String(x.year||"").match(/\d{4}/); return n?+n[0]:9999; };
  const secs=[...m.values()].sort((a,b)=>DENOMS.findIndex(d=>d.k===a.k)-DENOMS.findIndex(d=>d.k===b.k));
  for(const s of secs){ s.rows.sort((a,b)=>yr(a)-yr(b)||a.name.localeCompare(b.name)); s.wants.sort((a,b)=>yr(a)-yr(b)); const seen=new Set(); for(const r of s.rows) if(r.it){ r.first=!seen.has(r.c.id); seen.add(r.c.id); }
    s.coins=s.rows.reduce((a,r)=>a+r.qty*(r.it||!r.c.isSet?1:setSize(r.c)),0);
    s.value=s.rows.reduce((a,r)=>a+(r.it&&!r.first||blank(r.c.value)?0:+r.c.value*r.qty),0);
    s.cost=s.rows.reduce((a,r)=>{ const p=costEach(r.c); return a+(r.it&&!r.first||p==null?0:p*r.qty); },0); }
  return secs; }
const dLabel=k=>({"$10":"$10 coins","$5":"$5 coins","$2":"$2 coins","$1":"$1 coins","50c":"50c coins","20c":"20c coins","10c":"10c coins","5c":"5c coins","2c":"2c coins","1c":"1c coins","Crown":"Crowns","Florin":"Florins","Shilling":"Shillings","Sixpence":"Sixpences","Threepence":"Threepences","Penny":"Pennies","Halfpenny":"Halfpennies","Other":"Other / not set"}[k]||k);
function viewChecklist(){ const o=ckOpts(); const secs=ckSections(o);
  return `<section class="view">${backMore}<div class="panel"><h3>Collection checklist</h3><p class="m0">Everything you have, sorted by denomination then year, with the wants you're still hunting for under each one. Save the PDF to your phone and it works offline at a coin fair.</p>
  <div class="flabel" style="margin-top:4px">Denominations</div>
  <div class="ckd">${secs.map(s=>`<label class="check-inline"><input type="checkbox" data-ckd="${esc(s.k)}" ${o.off.includes(s.k)?"":"checked"}><span><b>${esc(dLabel(s.k))}</b> <span class="muted small">${s.coins} owned${s.wants.length?` · ${s.wants.length} wanted`:""}</span></span></label>`).join("")||`<p class="m0 muted small">No coins yet.</p>`}</div>
  <div class="flabel" style="margin-top:4px">Include</div>
  <label class="check-inline"><input type="checkbox" id="ckSplit" ${o.split?"checked":""}><span>List each coin in a set on its own line</span></label>
  <label class="check-inline"><input type="checkbox" id="ckWants" ${o.wants?"checked":""}><span>"Still looking for" — my wants list, with the most I'll pay</span></label>
  <label class="check-inline"><input type="checkbox" id="ckMoney" ${o.money?"checked":""}><span>What I paid and current value</span></label>
  <label class="check-inline"><input type="checkbox" id="ckPhotos" ${o.photos?"checked":""}><span>Picture of each coin — the Numista reverse (design side)</span></label>
  <label class="check-inline"><input type="checkbox" id="ckSold" ${o.sold?"checked":""}><span>Include sold and traded coins</span></label>
  <button type="button" class="btn primary" data-mkck>Create PDF</button><div class="row" id="repOut"></div></div></section>`; }
/* checklist picture: the Numista reverse (design side); otherwise another reference reverse, then my own reverse */
function ckPhoto(r){ const rev=ph=>{ ph=ph||[]; return ph.find(p=>!p.mine&&p.side==="Reverse"&&p.source==="Numista")||ph.find(p=>!p.mine&&p.side==="Reverse")||ph.find(p=>p.mine&&p.side==="Reverse")||null; };
  if(r.it) return rev(r.it.photos); return rev(r.c.photos)||((r.c.setItems||[]).map(it=>rev(it.photos)).find(Boolean))||null; }
async function makeChecklist(){
  const o=ckOpts(), out=$("#repOut"), say=m=>{ if(out) out.innerHTML=`<span class="muted small">${esc(m)}</span>`; };
  const secs=ckSections(o).filter(s=>!o.off.includes(s.k)&&(s.rows.length||s.wants.length)); if(!secs.length){ say("Tick at least one denomination."); return; }
  say("Making the PDF…"); await loadJsPDF();
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:"mm",format:"a4"}); const W=210, M=14, BOT=283, IW=W-2*M;
  const PH=o.photos?11:0, MON=o.money?29:0;
  const cols=[...(o.photos?[["",PH]]:[]),["Year",13],["Coin",IW-PH-13-14-17-21-9-MON],["Mint",14],["Grade",17],["Pack",21],["Qty",9],...(o.money?[["Paid",14.5],["Value",14.5]]:[])];
  const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  let y=M;
  const tC=secs.reduce((a,s)=>a+s.coins,0), tR=secs.reduce((a,s)=>a+s.rows.length,0), tV=secs.reduce((a,s)=>a+s.value,0), tP=secs.reduce((a,s)=>a+s.cost,0), tW=secs.reduce((a,s)=>a+s.wants.length,0);
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(49,46,129); doc.text("Coin collection checklist",M,y+5); y+=10;
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  doc.text(pdfTxt(`${fmtDate(todayISO())}  ·  ${tC} coins on ${tR} lines${o.wants?`  ·  ${tW} wanted`:""}${o.money?`  ·  Paid ${aud(Math.round(tP))||"$0"}  ·  Value ${aud(Math.round(tV))||"$0"}`:""}`),M,y+3); y+=8;
  /* summary */
  doc.setFillColor(238,242,255); doc.rect(M,y,IW,6.5,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(49,46,129);
  const sc=[["Denomination",60],["Lines",22],["Coins",22],["Wanted",22],...(o.money?[["Paid",28],["Value",28]]:[])];
  let x=M+1.5; for(const [h,w] of sc){ doc.text(h,x,y+4.5); x+=w; } y+=7.5; doc.setFont("helvetica","normal"); doc.setTextColor(20,20,20);
  for(const s of secs){ x=M+1.5; const g=GROUPS[dInfo(s.k).grp]||GROUPS.other; doc.setFillColor(...hex(g.solid)); doc.circle(x+1.2,y+2.6,1.2,"F");
    for(const [v,w] of [[dLabel(s.k),60],[String(s.rows.length),22],[String(s.coins),22],[String(s.wants.length||""),22],...(o.money?[[s.cost?aud(Math.round(s.cost)):"",28],[s.value?aud(Math.round(s.value)):"",28]]:[])]){ doc.text(pdfTxt(v),x+(w===60?4:0),y+3.8); x+=w; }
    y+=5.4; }
  doc.setDrawColor(225,228,236); doc.line(M,y,W-M,y); y+=5;
  const head=()=>{ doc.setFillColor(245,246,251); doc.rect(M,y,IW,6,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(7.8); doc.setTextColor(75,85,99); let x=M+1.5; for(const [h,w] of cols){ doc.text(h,x,y+4.2); x+=w; } y+=7; doc.setFont("helvetica","normal"); doc.setTextColor(20,20,20); };
  const band=(s,cont)=>{ const g=GROUPS[dInfo(s.k).grp]||GROUPS.other; doc.setFillColor(...hex(g.solid)); doc.roundedRect(M,y,IW,8,1.5,1.5,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(255,255,255);
    doc.text(pdfTxt(dLabel(s.k)+(cont?" (continued)":"")),M+3,y+5.6); doc.setFontSize(8.5); doc.setFont("helvetica","normal");
    doc.text(pdfTxt(`${s.coins} coin${s.coins===1?"":"s"}${s.wants.length?` · ${s.wants.length} wanted`:""}${o.money&&s.value?` · value ${aud(Math.round(s.value))}`:""}`),W-M-3,y+5.6,{align:"right"}); y+=10; doc.setTextColor(20,20,20); };
  let n=0; const total=secs.reduce((a,s)=>a+s.rows.length,0);
  for(const s of secs){
    if(y+30>BOT){ doc.addPage(); y=M; }
    band(s,false);
    if(s.rows.length){ head();
      for(const r of s.rows){ if(out&&++n%5===0) say(`Adding ${n} of ${total}…`);
        const cw=cols.find(c=>c[0]==="Coin")[1]-3;
        doc.setFont("helvetica","bold"); doc.setFontSize(8.8); const tl=doc.splitTextToSize(pdfTxt(r.name),cw); doc.setFont("helvetica","normal"); doc.setFontSize(7.6); const sl=r.sub.length?doc.splitTextToSize(pdfTxt(r.sub.join(" · ")),cw):[];
        const pl=doc.splitTextToSize(pdfTxt(r.pack),20), ml=doc.splitTextToSize(pdfTxt(r.mint||""),13); const h=Math.max(o.photos?12:7,tl.length*3.7+sl.length*3.2+3,pl.length*3.2+3,ml.length*3.2+3,String(r.year||"").length>6?9:0);
        if(y+h>BOT){ doc.addPage(); y=M; band(s,true); head(); }
        let x=M+1.5;
        if(o.photos){ const ph=ckPhoto(r); const dt=ph?await imgData(ph):null; if(dt) doc.addImage(dt,"JPEG",x-0.5,y+0.5,10,10); x+=PH; }
        doc.setFontSize(8.8); doc.setFont("helvetica","bold"); { let yt=pdfTxt(String(r.year||"-")); if(doc.getTextWidth(yt)>12) yt=yt.replace(/\s*-\s*/,"-\n"); doc.text(yt.split("\n"),x,y+4); } x+=13;
        doc.text(tl,x,y+4); doc.setFont("helvetica","normal"); if(sl.length){ doc.setFontSize(7.6); doc.setTextColor(95,95,95); doc.text(sl,x,y+4+tl.length*3.7); doc.setTextColor(20,20,20); } x+=cols.find(c=>c[0]==="Coin")[1];
        doc.setFontSize(7.6); doc.text(doc.splitTextToSize(pdfTxt(r.mint||""),13),x,y+4); doc.setFontSize(8.3); x+=14; doc.text(pdfTxt(r.grade),x,y+4); x+=17; doc.setFontSize(7.6); doc.text(pl,x,y+4); x+=21; doc.setFontSize(8.3);
        doc.text(r.qty>1?"x"+r.qty:"1",x,y+4); x+=9;
        if(o.money){ if(r.it&&!r.first){ doc.setTextColor(150,150,150); doc.text("in set",x,y+4); doc.setTextColor(20,20,20); } else { const p=costEach(r.c); doc.text(pdfTxt(p!=null?aud(p*(r.it?1:1)):""),x,y+4); x+=14.5; doc.text(pdfTxt(blank(r.c.value)?"":aud(r.c.value)),x,y+4); if(r.it){ doc.setFontSize(6.5); doc.setTextColor(150,150,150); doc.text("whole set",x-14.5,y+7.2); doc.setTextColor(20,20,20); } } }
        y+=h; doc.setDrawColor(232,234,240); doc.line(M,y,W-M,y); y+=0.8; }
    }
    if(s.wants.length){ if(y+16>BOT){ doc.addPage(); y=M; band(s,true); }
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(180,83,9); doc.text(s.rows.length?"Still looking for":"Wanted - none owned yet",M+1.5,y+4.5); y+=6.5; doc.setTextColor(20,20,20);
      for(const w of s.wants){ doc.setFontSize(8.5); doc.setFont("helvetica","normal"); const wl=doc.splitTextToSize(pdfTxt([w.title,w.series&&!String(w.title||"").includes(w.series)?w.series:"",w.notes].filter(Boolean).join(" · ")),IW-13-34-8); const h=wl.length*3.6+2.5;
        if(y+h>BOT){ doc.addPage(); y=M; band(s,true); }
        doc.setDrawColor(180,83,9); doc.rect(M+1.5,y+1.2,3,3); doc.setFont("helvetica","bold"); doc.text(pdfTxt(String(w.year||"")),M+7,y+4); doc.setFont("helvetica","normal"); doc.text(wl,M+20,y+4);
        if(!blank(w.target)) doc.text(pdfTxt("up to "+aud(w.target)),W-M-2,y+4,{align:"right"}); y+=h; }
    }
    y+=5;
  }
  const pages=doc.getNumberOfPages(); for(let i=1;i<=pages;i++){ doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(120,120,120); doc.text(pdfTxt(`${o.money?"Paid = price each including a share of postage. Value = my own estimate, each. ":""}Mint = mint or privy mark. MyMint ${APP_VERSION}  ·  ${fmtDate(todayISO())}  ·  Page ${i} of ${pages}`),M,292,{maxWidth:IW}); }
  const blob=doc.output("blob"), name=`mymint-checklist-${todayISO()}.pdf`, url=URL.createObjectURL(blob);
  const canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([blob],name,{type:"application/pdf"})]}));
  S._repFile=new File([blob],name,{type:"application/pdf"});
  if(out) out.innerHTML=`<a class="btn primary" href="${url}" download="${esc(name)}">Save PDF to phone</a><a class="btn" href="${url}" target="_blank" rel="noopener">Open PDF</a>${canShare?`<button type="button" class="btn" data-sharerep>Share…</button>`:""}<span class="muted small">${pages} page${pages===1?"":"s"} · ${(blob.size/1024).toFixed(0)} KB</span>`;
}

/* ================= cost: price + share of receipt postage ================= */
const covOf=(c,rid)=>{ const q=qtyOf(c); const v=c.receiptCover&&c.receiptCover[rid]; return v?Math.min(q,Math.max(1,parseInt(v,10)||q)):q; };
function rcUnits(r){ return rcCoins(r.id).reduce((a,c)=>a+covOf(c,r.id),0); }
function postageTotal(c){ let t=0; for(const rid of (c.receiptIds||[])){ const r=S.receipts.find(x=>x.id===rid); if(!r||blank(r.postage)||!+r.postage) continue; const u=rcUnits(r); if(u) t+=+r.postage*covOf(c,rid)/u; } return t; }
const postageEach=c=>postageTotal(c)/qtyOf(c);
function costEach(c){ const p=priceAUD(c); if(p==null) return null; return Math.round((p+postageEach(c))*100)/100; }
function gainPill(c){ const ce=costEach(c); if(ce==null||blank(c.value)||+c.value===ce) return ""; const up=+c.value>=ce; return ` <span class="grade" style="${up?"background:#DCFCE7;color:#166534":"background:#FEE2E2;color:#991B1B"}">${up?"+":"−"}${esc(aud(Math.abs(Math.round((+c.value-ce)*100)/100)))}</span>`; }
function splitInfo(r){
  const coins=rcCoins(r.id); if(blank(r.total)||!coins.length) return null;
  const post=+r.postage||0, items=Math.round((+r.total-post)*100)/100, units=coins.reduce((a,c)=>a+covOf(c,r.id),0);
  const unpriced=coins.filter(c=>blank(c.price)), priced=coins.filter(c=>!blank(c.price));
  const known=Math.round(priced.reduce((a,c)=>a+(priceAUD(c)??+c.price)*covOf(c,r.id),0)*100)/100, uUnits=unpriced.reduce((a,c)=>a+covOf(c,r.id),0);
  if(uUnits){ const each=Math.round((items-known)/uUnits*100)/100; return {mode:"fill",post,items,known,each,units:uUnits,targets:unpriced}; }
  if(Math.abs(items-known)<0.011) return {mode:"match",post,items,known};
  return {mode:"mismatch",post,items,known,even:Math.round(items/units*100)/100,units,targets:coins};
}
function splitHTML(r,d){ const s=splitInfo(r); if(!s) return "";
  const lead=s.post?`Receipt ${esc(aud(r.total))} − postage ${esc(aud(s.post))} = <b>${esc(aud(s.items))}</b> for the coins.`:`Receipt ${esc(aud(r.total))} for the coins.`;
  if(s.mode==="match") return `<div class="todo" style="background:#DCFCE7"><span>✓ <b>Matches the prices entered.</b> ${lead}</span></div>`;
  if(s.mode==="fill"){ if(s.each<=0) return `<div class="todo"><span>${lead} The prices already entered add up to ${esc(aud(s.known))}, which leaves nothing for the coin${s.units===1?"":"s"} without a price — check the prices or the receipt total.</span></div>`;
    return `<div class="todo" style="background:#DDF5F2"><span>${lead}${s.known?` Prices entered: ${esc(aud(s.known))}.`:""} That leaves <b>${esc(aud(s.each))} each</b> for ${s.units} coin${s.units===1?"":"s"} without a price.</span><button type="button" class="btn sm" data-rcsplit="${r.id}">Fill empty prices</button></div>`; }
  return `<div class="todo"><span>${lead} The prices entered add up to ${esc(aud(s.known))}. An even split would be <b>${esc(aud(s.even))} each</b>.</span><button type="button" class="btn sm" data-rcsplit="${r.id}">${d.confirmSplit?"Tap again to replace":"Replace prices"}</button></div>`;
}

/* ================= built-in collector's guide ================= */
const GUIDE=[
 {id:"grades",title:"Grades at a glance",color:"#2563EB",icon:'<path d="M4 18h16M7 14l3-4 3 3 4-6"/>',html:`
  <p>A grade describes <b>how much wear</b> a coin has. Australia mostly uses the word grades below; the Sheldon numbers (1–70) are the US scale used by grading services like PCGS and NGC, and many Australian dealers quote both.</p>
  <table class="gt"><thead><tr><th>Grade</th><th>Sheldon</th><th>What you see</th></tr></thead><tbody>
  <tr><td><b>G</b> Good</td><td>4–6</td><td>Heavily worn. Design mostly flat and seen in outline; rims mostly full; date readable.</td></tr>
  <tr><td><b>VG</b> Very Good</td><td>8–10</td><td>Most central detail worn flat, but rims are full and the main design is clear.</td></tr>
  <tr><td><b>F</b> Fine</td><td>12–15</td><td>About half the fine detail worn away; lettering still sharp.</td></tr>
  <tr><td><b>VF</b> Very Fine</td><td>20–35</td><td>Light to moderate wear across the coin; all major features clear.</td></tr>
  <tr><td><b>EF</b> Extremely Fine</td><td>40–45</td><td>All design visible; only the highest points show light wear. Some lustre may remain.</td></tr>
  <tr><td><b>aUNC</b> About Unc.</td><td>50–58</td><td>Just a trace of wear or rub on the very highest points; most lustre still there.</td></tr>
  <tr><td><b>UNC</b> Uncirculated</td><td>60–70</td><td>No wear at all. May still have bag marks or a weak strike — higher numbers mean fewer marks and better lustre.</td></tr>
  <tr><td><b>BU</b> Brilliant Unc.</td><td>—</td><td>Uncirculated with full, original mint lustre. A description rather than a number.</td></tr>
  </tbody></table>
  <p class="muted small">"a" in front of a grade means "about" — e.g. aEF is almost Extremely Fine. "Choice" and "Gem" are used for the better uncirculated coins.</p>`},
 {id:"howto",title:"How to grade a coin",color:"#0D9488",icon:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',html:`
  <ol><li>Hold the coin by its edges under a <b>single light</b> and tilt it slowly. Wear shows as a dull patch where the lustre breaks.</li>
  <li>Look at the <b>highest points</b> of the design first (cheek, hair, crown, animal's shoulder) — they wear before anything else.</li>
  <li>Tell <b>wear</b> (flattened detail) apart from <b>damage</b> (scratches, dents, rim knocks, cleaning marks). Damage doesn't change the grade number, but note it — it lowers the value.</li>
  <li>Grade <b>both sides</b> and use the lower one.</li>
  <li>If you're unsure between two grades, choose the lower. You can add a Sheldon number later if you want more precision.</li></ol>
  <p><b>Pre-decimal tip:</b> on George V pennies collectors judge wear by the King's crown band. "8 pearls, full centre diamond" is a common shorthand for EF.</p>
  <p class="muted small">Proof isn't a grade — it's how the coin was made. Record it under Finish, and grade it as normal (most proofs are UNC).</p>`},
 {id:"sheldon",title:"Sheldon numbers in detail",color:"#4338CA",icon:'<path d="M5 6h14M5 12h14M5 18h9"/>',html:`
  <table class="gt"><tbody>
  <tr><td>PO-1</td><td>Poor — type, date and mint mark just identifiable</td></tr><tr><td>FR-2</td><td>Fair — worn flat, traces of rim lettering</td></tr>
  <tr><td>AG-3</td><td>About Good — rims worn into lettering</td></tr><tr><td>G-4 / G-6</td><td>Good — rims mostly full; design flat, seen in outline</td></tr>
  <tr><td>VG-8 / 10</td><td>Very Good — most central detail worn flat, rims full</td></tr><tr><td>F-12 / 15</td><td>Fine — about half the detail worn; lettering sharp</td></tr>
  <tr><td>VF-20 – 35</td><td>Very Fine — moderate to light wear; major detail clear</td></tr><tr><td>EF-40 / 45</td><td>Extremely Fine — high points flat or lightly worn; some lustre</td></tr>
  <tr><td>AU-50 – 58</td><td>About Uncirculated — trace of wear; from some to nearly full lustre</td></tr>
  <tr><td>MS-60 – 62</td><td>Mint State — no wear; weaker strike, many marks</td></tr><tr><td>MS-63 / 64</td><td>No wear; average strike, moderate to scattered marks</td></tr>
  <tr><td>MS-65 / 66</td><td>Gem — above-average strike, only minor marks</td></tr><tr><td>MS-67 – 69</td><td>Superb — tiny flaws, barely visible</td></tr><tr><td>MS-70</td><td>Perfect — no marks visible</td></tr>
  </tbody></table><p class="muted small">Proofs use the same numbers with PR or PF in front (e.g. PR-69). Source: PCGS grading standards.</p>`},
 {id:"finish",title:"Finishes: circulating, UNC, proof",color:"#7C3AED",icon:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',html:`
  <dl class="gd"><dt>Circulating</dt><dd>Made for everyday change. Includes coloured "coin-in-card" circulating releases like the Indigenous Military Service $2.</dd>
  <dt>Uncirculated (UNC)</dt><dd>Struck for collectors on normal dies and sold straight into a card, pack or set — never handled as change.</dd>
  <dt>Frosted uncirculated</dt><dd>Uncirculated with a frosted (matte) design standing out against the background.</dd>
  <dt>Proof</dt><dd>Struck more than once with specially polished dies and blanks, giving a mirror background and sharp frosted design. Handle only in its capsule.</dd>
  <dt>Specimen</dt><dd>A finish between uncirculated and proof — better than normal UNC, but not mirror-like.</dd></dl>`},
 {id:"marks",title:"Mint marks, privy marks & counterstamps",color:"#D97706",icon:'<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',html:`
  <p><b>Decimal coins (Royal Australian Mint)</b> — each marked version is collected as a separate coin:</p>
  <dl class="gd"><dt>Mintmark</dt><dd>A raised letter on the coin's background. Early ones were <b>C</b> (Canberra), <b>M</b> (Melbourne) and <b>S</b> (Sydney), struck at the Mint or on mobile presses at the Melbourne and Sydney Royal Easter Shows.</dd>
  <dt>Counterstamp</dt><dd>A raised letter or symbol inside a <b>sunken circle</b> (e.g. B, M, S) — used from 2002, plus one-offs for special events.</dd>
  <dt>Privy mark</dt><dd>A letter or symbol <b>sunk into a raised square</b>, e.g. [M], [S], [P] — used from 2008.</dd>
  <dt>No mint mark</dt><dd>Most everyday circulating coins have none. Record "None" so it's clear you checked.</dd></dl>
  <p><b>Pre-decimal coins</b> often show where they were struck:</p>
  <dl class="gd"><dt>M</dt><dd>Melbourne (on silver coins from 1916).</dd><dt>D / S</dt><dd>Denver and San Francisco — wartime silver coins struck in the USA.</dd>
  <dt>I</dt><dd>Bombay — below the King's head on wartime halfpennies.</dd><dt>PL</dt><dd>The 1951 "PL" penny, struck in London.</dd>
  <dt>Dots</dt><dd>Small dots near the date, scroll or denomination identify Melbourne, Sydney, Perth or Bombay strikes on some pennies and halfpennies.</dd></dl>
  <p class="muted small">Sources: Numista forum (brismike), NGC.</p>`},
 {id:"packaging",title:"Packaging & storage words",color:"#DB2777",icon:'<path d="M4 8l8-4 8 4v10l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v10"/>',html:`
  <dl class="gd"><dt>Card / coin-in-card</dt><dd>The coin sealed in a printed card. Keep it in the card — removing it usually lowers the value.</dd>
  <dt>RAM card</dt><dd>A card issued by the Royal Australian Mint itself.</dd><dt>DCPL card</dt><dd>A card issued by Downies (Downies Collectables) rather than the Mint.</dd>
  <dt>Set / folder</dt><dd>Several coins sold together, e.g. a 4-coin privy mark set or the 7-coin AC/DC set. Record it as one item with "This is a set" ticked.</dd>
  <dt>Capsule</dt><dd>A clear round plastic case — best for proofs and valuable coins.</dd><dt>Flip</dt><dd>A folded plastic sleeve. Avoid old soft PVC flips — they can leave green residue over time.</dd>
  <dt>2x2 holder</dt><dd>A cardboard square with a clear window, stapled shut.</dd><dt>Slab</dt><dd>A sealed hard-plastic holder from a grading service, with a label and certificate number.</dd>
  <dt>Box / case</dt><dd>A presentation box or case, often with a certificate — e.g. boxed sets like the AC/DC collection.</dd><dt>Tin</dt><dd>A metal tin some mint sets come in.</dd><dt>Roll / tube</dt><dd>Mint rolls (wrapped coins) or plastic coin tubes.</dd>
  <dt>PNC</dt><dd>Philatelic Numismatic Cover — an envelope with stamps and a coin. Choose <b>Other…</b> and type "PNC" — MyMint remembers it for next time.</dd></dl>`},
 {id:"care",title:"Caring for your coins",color:"#15803D",icon:'<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',html:`
  <ul><li><b>Never clean a coin.</b> Even gentle polishing leaves hairline scratches and can halve its value.</li>
  <li>Hold coins <b>by the edges</b>, over a soft surface. Skin oils leave fingerprints that can etch in.</li>
  <li>Keep them <b>cool, dry and dark</b>. Damp causes spots; sunlight fades coloured coins and cards.</li>
  <li>Use <b>archival, PVC-free</b> holders, capsules and albums.</li>
  <li>Leave carded and boxed coins <b>in their original packaging</b>, with any certificate.</li>
  <li>Record where each coin is kept (Storage location) — it makes insurance claims and finding coins much easier.</li></ul>`},
 {id:"glossary",title:"Glossary",color:"#475569",icon:'<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',html:`
  <dl class="gd"><dt>Obverse</dt><dd>The "heads" side — the monarch's portrait.</dd><dt>Reverse</dt><dd>The "tails" side — the design.</dd>
  <dt>Effigy</dt><dd>The monarch's portrait, named by its designer (e.g. Jody Clark, 2019–2023).</dd><dt>Legend</dt><dd>The lettering around the coin.</dd>
  <dt>Field</dt><dd>The flat background around the design.</dd><dt>Rim</dt><dd>The raised border.</dd>
  <dt>Edge</dt><dd>The side of the coin — reeded (milled), plain or interrupted.</dd><dt>Mintage</dt><dd>How many were made. Lower mintage usually means scarcer.</dd>
  <dt>NCLT</dt><dd>Non-circulating legal tender — made for collectors, not for change.</dd><dt>Noodling</dt><dd>Searching change, rolls or bags for keepers.</dd>
  <dt>Lustre</dt><dd>The original "cartwheel" shine from striking. Once rubbed off, it never returns.</dd><dt>Toning</dt><dd>Natural colour that develops on metal over time.</dd>
  <dt>Strike</dt><dd>How fully the design was pressed into the coin.</dd><dt>Variety</dt><dd>A recognised difference in a die (e.g. a doubled design).</dd>
  <dt>Error</dt><dd>A minting mistake — off-centre, wrong planchet, mule (mismatched sides).</dd><dt>Key date</dt><dd>A scarce year that a series collection is hard to complete without.</dd></dl>`}
];
function guideBody(open){ return GUIDE.map(g=>`<details class="fsec gsec" id="g_${g.id}" ${open===g.id?"open":""}><summary><span class="ico" style="background:${g.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${g.icon}</svg></span>${esc(g.title)}<span class="sp"></span></summary><div class="gtext">${g.html}</div></details>`).join(""); }
function viewGuide(){ return `<section class="view">${backMore}<div class="hero" style="padding-top:12px;margin-top:0;border-radius:18px;margin-left:0;margin-right:0"><h1 style="color:#fff;font-size:22px">Collector's guide</h1><p class="m0" style="color:var(--on-indigo);font-size:13px">Grades, finishes, mint marks and coin care — always available, even offline.</p></div>${guideBody(S.guideOpen||"grades")}</section>`; }
function guideHTML(d){ return `<div class="shead"><div class="wrap">${backBtn("Back")}<h2>Guide</h2></div></div><div class="wrap sbody">${guideBody(d.open)}</div>`; }
const infoBtn=id=>`<button type="button" class="infob" data-guide="${id}" aria-label="What does this mean?">?</button>`;

/* ================= Numista settings screen ================= */
function viewNumista(){ const s=nsSet();
  return `<section class="view">${backMore}<div class="panel"><h3>Numista lookups</h3>
  <p class="m0">With a free Numista API key, adding a coin can fill in its specifications, designers, mintage and reference photos for you. The key is kept in this app and its backups only — never in the public GitHub files.</p>
  <div class="field"><label for="nsKeyIn">Numista API key</label><input id="nsKeyIn" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.key||"")}" placeholder="paste your key here"></div>
  <label class="check-inline"><input type="checkbox" id="nsAusSet" ${s.ausOnly!==false?"checked":""}><span>Search Australian coins only by default</span></label>
  <div class="row"><button type="button" class="btn primary" data-nssave>Save key</button><button type="button" class="btn" data-nstest ${s.key?"":"disabled"}>Test it</button><span class="muted small" id="nsStat">${s.key?esc(nsUsage()):""}</span></div></div>
  <div class="panel"><h3>Getting a key (once, free)</h3><ol class="m0" style="padding-left:20px;display:flex;flex-direction:column;gap:6px">
    <li>Sign in (or join free) at <b>en.numista.com</b>.</li><li>Open <b>en.numista.com/api</b> and choose the <b>Free plan</b> (2,000 lookups a month).</li><li>Copy the API key it shows, paste it above and tap <b>Save key</b>.</li></ol>
    <p class="m0 muted small">Numista asks apps to show its N# numbers and say the data comes from Numista — MyMint does both.</p></div></section>`; }

/* ================= events ================= */
document.addEventListener("click",async e=>{
  const z=e.target.closest("#zoom"); if(z){ z.remove(); return; }
  const b=e.target.closest("button,a[data-dlbk],img[data-zoom]"); if(!b) return; const d=b.dataset;
  if("zoom" in d){ const el=document.createElement("div"); el.id="zoom"; el.innerHTML=`<img src="${b.src}" alt=""><button type="button" class="btn">Close</button>`; document.body.appendChild(el); return; }
  if("back" in d){ await popView(); return; }
  if(d.guide){ e.preventDefault(); if(topV()&&topV().kind==="edit") readForm(); openView({kind:"guide",open:d.guide}); return; }
  if(d.tab){ S.tab=d.tab; if(d.tab==="more") S.moreView=null; render(); scrollTo(0,0); return; }
  if("add" in d){ if(S.readOnly){ toast(RO_MSG); return; } openView({kind:"add"}); return; }
  if(d.open){ openView({kind:"detail",id:d.open}); return; }
  if(d.mode){ view().mode=d.mode; saveMeta(); render(); return; }
  if(d.size){ view().size=d.size; saveMeta(); render(); return; }
  if(d.grp){ const g=S.f.grp; S.f.grp=g.includes(d.grp)?g.filter(x=>x!==d.grp):[...g,d.grp]; if(topV()&&topV().kind==="filters"){ b.setAttribute("aria-pressed",String(S.f.grp.includes(d.grp))); updFilterCount(); return; } render(); return; }
  if(d.qf){ S.f[d.qf]=!S.f[d.qf]; render(); return; }
  if(d.unf){ clearFilter(d.unf); render(); return; }
  if("clearall" in d){ S.f=clone(FDEF); S.q=""; if(topV()&&topV().kind==="filters"){ drawTop(); return; } render(); return; }
  if("clearq" in d){ S.q=""; render(); $("#q").focus(); return; }
  if("filters" in d){ openView({kind:"filters"}); return; }
  if("showtodo" in d){ S.f=clone(FDEF); S.f.todo=true; S.tab="coins"; render(); scrollTo(0,0); return; }
  if(d.album){ openView({kind:"album",key:d.album}); return; }
  if(d.tlist){ openView({kind:"tlist",id:d.tlist}); return; }
  if(d.more!=null){ S.moreView=d.more||null; render(); scrollTo(0,0); if(d.more==="about") fillStoreInfo(); return; }
  if(d.moreGo){ while(S.stack.length){ const x=S.stack.pop(); await cleanupView(x); } if($("#sheet").hidden===false){ S._ignorePop=true; history.back(); } $("#sheet").hidden=true; document.body.style.overflow=""; S.tab="more"; S.moreView=d.moreGo; render(); scrollTo(0,0); return; }
  /* coin record */
  if(d.sel!=null){ const t=topV(); t.sel=+d.sel; drawTop(); return; }
  if(d.cover){ const c=clone(S.coins.find(x=>x.id===topV().id)); c.coverId=d.cover; c.updatedAt=new Date().toISOString(); await dbPut("coins",c); await reload(); topV().sel=0; drawTop(); toast("Cover photo set"); return; }
  if(d.edit){ const c=S.coins.find(x=>x.id===d.edit); openView({kind:"edit",id:c.id,draft:clone(c),newFiles:[],removedFiles:[]}); return; }
  if(d.addphoto){ const c=S.coins.find(x=>x.id===d.addphoto); openView({kind:"edit",id:c.id,draft:clone(c),newFiles:[],removedFiles:[]}); setTimeout(()=>{ const el=$("#phSec"); if(el) el.scrollIntoView({block:"start"}); },50); return; }
  if(d.dup){ const c=clone(S.coins.find(x=>x.id===d.dup)); for(const k of ["id","addedAt","updatedAt","photos","coverId","serial","price","priceAud","priceRate","acqDate","source","value","valueDate","notes","status","qty","receiptIds"]) delete c[k]; c.photos=[]; c.qty=1; c.acqDate=todayISO(); c.status="In collection"; openView({kind:"edit",id:null,draft:c,newFiles:[],removedFiles:[]}); toast("Copied — change what's different and Save"); return; }
  if(d.sold){ const c=clone(S.coins.find(x=>x.id===d.sold)); c.status=isOwned(c)?"Sold":"In collection"; c.updatedAt=new Date().toISOString(); await dbPut("coins",c); await reload(); drawTop(); toast(isOwned(c)?"Back in your collection":"Marked as sold"); return; }
  if(d.delcoin){ const t=topV(); if(!t.confirmDel){ t.confirmDel=true; drawTop(); return; } await deleteCoin(d.delcoin); return; }
  if(d.nsrefresh){ await nsRefresh(d.nsrefresh); return; }
  /* add */
  if("manual" in d){ replaceView({kind:"edit",id:null,draft:blankCoin(),newFiles:[],removedFiles:[]}); return; }
  if("copyfrom" in d){ const t=topV(); t.copy=!t.copy; drawTop(); return; }
  if(d.copy){ const c=clone(S.coins.find(x=>x.id===d.copy)); for(const k of ["id","addedAt","updatedAt","photos","coverId","serial","price","priceAud","priceRate","acqDate","source","value","valueDate","notes","status","qty","year","mintage","receiptIds"]) delete c[k]; c.photos=[]; c.qty=1; c.acqDate=todayISO(); c.status="In collection"; replaceView({kind:"edit",id:null,draft:c,newFiles:[],removedFiles:[]}); toast("Copied — fill in the year and what's different"); return; }
  if(d.nspick){ await nsPick(topV(),d.nspick); return; }
  if(d.issue!=null){ const t=topV(); const is=+d.issue<0?null:t.issues[+d.issue]; if(t.kind==="nsfind") await nsLink(t,is); else if(t.kind==="setfind") await siLink(t,is); else await nsBuild(t,is); return; }
  if(d.nsfind!=null){ if(d.nsfind==="edit"){ readForm(); const tg=topV(); const v={kind:"nsfind",target:tg,q:nsQueryFor(tg.draft)}; openView(v); if(nsKey()) nsSearch(v); return; }
    const c=S.coins.find(x=>x.id===d.nsfind); const ed={kind:"edit",id:c.id,draft:clone(c),newFiles:[],removedFiles:[]}; openView(ed); const v={kind:"nsfind",target:ed,q:nsQueryFor(ed.draft)}; openView(v); if(nsKey()) nsSearch(v); return; }
  /* edit form */
  if(d.pk){ const t=topV(); const c=t.draft; let v=d.pv; const on=b.getAttribute("aria-pressed")==="true";
    if(d.pk==="status"&&on) return;
    b.parentElement.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed","false"));
    if(on){ v=""; } else b.setAttribute("aria-pressed","true");
    if(d.pk==="colourised") c.colourised=v==="yes"?true:v==="no"?false:null; else c[d.pk]=v;
    if(d.pk==="packaging"){ const po=$("#f_packOther"); if(v===PACK_OTHER){ t.packOther=true; c.packaging=""; if(po){ po.hidden=false; po.focus(); } } else { t.packOther=false; if(po) po.hidden=true; } }
    if(d.pk==="grade"){ const h=$("#gradeHint"); if(h) h.textContent=c.grade?GRADE_HINTS[c.grade]||"":"Not sure? Tap ? for what each grade looks like."; }
    if(d.pk==="denom"){ const ti=$("#f_title"); if(ti){ readForm(); ti.placeholder=autoTitle(c)||"e.g. 2022 $2 Honey Bee"; } if(!c.collection){} }
    return; }
  if(d.qty){ const i=$("#f_qty"); i.value=Math.max(1,(parseInt(i.value,10)||1)+(+d.qty)); return; }
  if("cam" in d){ $("#camIn").click(); return; }
  if("pickph" in d){ $("#phIn").click(); return; }
  if(d.whose){ readForm(); const [i,w]=d.whose.split(":"); const p=topV().draft.photos[+i]; p.mine=w==="mine"; if(!p.mine&&!p.source) p.source="Royal Australian Mint"; drawPhotos(); return; }
  if(d.pcover!=null){ readForm(); const c=topV().draft; c.coverId=c.photos[+d.pcover].id; drawPhotos(); return; }
  if(d.prm!=null){ readForm(); const t=topV(); const [p]=t.draft.photos.splice(+d.prm,1); if(!p.url){ if(t.newFiles.includes(p.id)){ t.newFiles=t.newFiles.filter(x=>x!==p.id); await dbDel("files",p.id); } else t.removedFiles.push(p.id); } if(t.draft.coverId===p.id) delete t.draft.coverId; drawPhotos(); return; }
  if("save" in d){ b.disabled=true; try{ await saveCoin(); }catch(err){ toast("Couldn't save: "+(err&&err.message||err)); } b.disabled=false; return; }
  if("nslink" in d){ const id=($("#f_nsid").value||"").trim(); if(!/^\d+$/.test(id)){ toast("Type the Numista number first"); return; } readForm(); const t=topV(); toast("Getting details from Numista…");
    try{ const ty=await nsFetch(`/types/${id}`); let issues=[]; try{ issues=asList(await nsFetch(`/types/${id}/issues`)); }catch{} const c=t.draft; const issue=issues.find(i=>String(i.year)===String(yearNum(c))&&(i.mint_letter||"")===((c.mint&&c.mint!=="None")?c.mint:""))||null; applyNs(c,fromNumista(ty,issue),false); c.ns=nsInfo(ty,issues);
      if(!(c.photos||[]).some(p=>!p.mine&&p.source==="Numista")) for(const [side,obj] of [["Obverse",ty.obverse],["Reverse",ty.reverse]]){ const pic=obj&&(obj.picture||obj.thumbnail); if(!pic) continue; const r=await nsImage(pic); if(!r) continue; if(!r.url) t.newFiles.push(r.id); c.photos.push({id:r.id,url:r.url,mine:false,side,source:"Numista",link:c.ns.url}); }
      drawTop(); toast("Filled from Numista — your own entries were kept"); }catch(err){ toast(err.message||String(err)); } return; }
  /* sets */
  if("siadd" in d){ readForm(); const tg=topV(); const v={kind:"setfind",target:tg,q:tg.lastSetQ||nsQueryFor(tg.draft)}; openView(v); if(nsKey()) nsSearch(v); return; }
  if("siman" in d){ readForm(); const t=topV(); t.siManual=!t.siManual; drawSet(); if(t.siManual){ const i=$("#si_title"); if(i) i.focus(); } return; }
  if("siok" in d){ readForm(); const t=topV(); const title=($("#si_title").value||"").trim(); if(!title){ toast("Give the coin a name first"); return; }
    const it={id:uid("si"),...pickKeys({title,year:($("#si_year").value||"").trim(),mint:($("#si_mint").value||"").trim(),denom:$("#si_denom").value},["title","year","mint","denom"]),photos:[]};
    t.draft.setItems=[...(t.draft.setItems||[]),it]; t.siManual=false; drawSet(); toast(`Added — ${t.draft.setItems.length} coin${t.draft.setItems.length===1?"":"s"} in the set`); return; }
  if(d.sirm!=null){ readForm(); const t=topV(); const [it]=t.draft.setItems.splice(+d.sirm,1); for(const p of ((it&&it.photos)||[])) if(!p.url&&t.newFiles.includes(p.id)){ t.newFiles=t.newFiles.filter(x=>x!==p.id); await dbDel("files",p.id); } drawSet(); return; }
  /* receipts */
  if("rcnew" in d){ readForm(); S._rcMode="edit"; $("#rcIn").click(); return; }
  if("rcnewstd" in d){ S._rcMode="std"; $("#rcIn").click(); return; }
  if("rcuse" in d){ readForm(); openView({kind:"rcpick",target:topV()}); return; }
  if(d.rcpick){ const t=topV(); const tgt=t.target; tgt.draft.receiptIds=[...(tgt.draft.receiptIds||[]),d.rcpick]; await popView(); toast("Receipt linked — tap “Fill empty date & source” to copy its details"); return; }
  if(d.rcun){ readForm(); const t=topV(); const c=t.draft; c.receiptIds=(c.receiptIds||[]).filter(x=>x!==d.rcun); const nr=(t.newReceipts||[]).find(x=>x.id===d.rcun);
    if(nr){ t.newReceipts=t.newReceipts.filter(x=>x!==nr); if(nr.fromPhoto){ c.photos=[...(c.photos||[]),nr.fromPhoto]; } else if(t.newFiles.includes(nr.fileId)){ t.newFiles=t.newFiles.filter(x=>x!==nr.fileId); await dbDel("files",nr.fileId); } }
    drawPhotos(); drawRc(); toast(nr&&nr.fromPhoto?"Moved back to photos":"Receipt unlinked from this coin"); return; }
  if(d.rcview){ await viewReceiptFile(rcFind(d.rcview)); return; }
  if("rcfill" in d){ readForm(); const t=topV(); const c=t.draft; const r=(c.receiptIds||[]).map(rcFind).find(x=>x&&(x.date||x.seller)); if(!r){ toast("Add the receipt's date or seller first"); return; } const n=fillFromReceipt(c,r,!t.id); drawTop(); toast(n?"Filled from the receipt":"Nothing to fill — those fields already have values"); return; }
  if(d.ptorc!=null){ readForm(); const t=topV(); const c=t.draft; const [p]=c.photos.splice(+d.ptorc,1); if(!p) return; if(c.coverId===p.id) delete c.coverId; t.newReceipts=t.newReceipts||[]; const r={id:uid("rc"),fileId:p.id,type:"image/jpeg",name:"",addedAt:new Date().toISOString(),fromPhoto:p}; t.newReceipts.push(r); c.receiptIds=[...(c.receiptIds||[]),r.id]; drawPhotos(); drawRc(); toast("Moved to receipts — tap Save to keep it"); return; }
  if(d.rcopen){ openView({kind:"receipt",id:d.rcopen}); return; }
  if(d.rcfile){ await viewReceiptFile(S.receipts.find(r=>r.id===d.rcfile)); return; }
  if(d.rcdl){ const r=S.receipts.find(x=>x.id===d.rcdl); if(r) await saveReceiptFile(r); return; }
  if(d.rcsave){ const r={...S.receipts.find(x=>x.id===d.rcsave)}; const num=id=>{ const v=($(id).value||"").replace(/[$,\s]/g,""); return v===""||isNaN(+v)?null:+v; };
    Object.assign(r,{date:$("#rv_date").value,seller:($("#rv_seller").value||"").trim(),orderNo:($("#rv_order").value||"").trim(),notes:($("#rv_notes").value||"").trim(),total:num("#rv_total"),postage:num("#rv_post"),updatedAt:new Date().toISOString()});
    if(r.total!=null&&r.postage!=null&&r.postage>r.total){ toast("Postage can't be more than the receipt total"); return; }
    for(const k of Object.keys(r)) if(r[k]===""||r[k]==null) delete r[k]; await dbPut("receipts",r); await reload(); drawTop(); toast("Receipt details saved"); return; }
  if("rclink" in d){ const t=topV(); t.linking=true; t.sel=new Set(rcCoins(t.id).map(c=>c.id)); t.fill=true; t.lq=""; drawTop(); return; }
  if("rclcancel" in d){ const t=topV(); t.linking=false; drawTop(); return; }
  if("rclsave" in d){ const t=topV(); const r=S.receipts.find(x=>x.id===t.id); let added=0, removed=0;
    for(const c0 of S.coins){ const has=(c0.receiptIds||[]).includes(r.id), want=t.sel.has(c0.id); if(has===want) continue; const c=clone(c0);
      if(want){ c.receiptIds=[...(c.receiptIds||[]),r.id]; if(t.fill!==false) fillFromReceipt(c,r,false); added++; } else { c.receiptIds=(c.receiptIds||[]).filter(x=>x!==r.id); if(!c.receiptIds.length) delete c.receiptIds; if(c.receiptCover){ delete c.receiptCover[r.id]; if(!Object.keys(c.receiptCover).length) delete c.receiptCover; } removed++; }
      c.updatedAt=new Date().toISOString(); await dbPut("coins",c); }
    await reload(); t.linking=false; drawTop(); toast(added||removed?`Linked ${added}, unlinked ${removed}`:"No changes"); return; }
  if(d.rcunc){ const t=topV(); const c=clone(S.coins.find(x=>x.id===d.rcunc)); c.receiptIds=(c.receiptIds||[]).filter(x=>x!==t.id); if(c.receiptCover){ delete c.receiptCover[t.id]; if(!Object.keys(c.receiptCover).length) delete c.receiptCover; } if(!c.receiptIds.length) delete c.receiptIds; c.updatedAt=new Date().toISOString(); await dbPut("coins",c); await reload(); drawTop(); toast("Unlinked from this receipt"); return; }
  if(d.rcfillall){ const r=S.receipts.find(x=>x.id===d.rcfillall); let n=0; for(const c0 of rcCoins(r.id)){ const c=clone(c0); if(fillFromReceipt(c,r,false)){ c.updatedAt=new Date().toISOString(); await dbPut("coins",c); n++; } } await reload(); drawTop(); toast(n?`Filled ${n} coin${n===1?"":"s"}`:"Nothing to fill — those fields already have values"); return; }
  if(d.rcsplit){ const t=topV(); const r=S.receipts.find(x=>x.id===d.rcsplit); const si=splitInfo(r); if(!si||si.mode==="match") return;
    let each, targets;
    if(si.mode==="fill"){ if(si.each<=0) return; each=si.each; targets=si.targets; } else { if(!t.confirmSplit){ t.confirmSplit=true; drawTop(); return; } each=si.even; targets=si.targets; }
    for(const c0 of targets){ const c=clone(c0); c.price=each; c.priceCur="AUD"; delete c.priceAud; delete c.priceRate; if(blank(c.acqHow)) c.acqHow="Bought"; c.updatedAt=new Date().toISOString(); await dbPut("coins",c); }
    t.confirmSplit=false; await reload(); drawTop(); toast(`${targets.length} price${targets.length===1?"":"s"} set to ${aud(each)} each`); return; }
  if(d.rccov){ const t=topV(); const [cid,dl]=d.rccov.split("|"); const c=clone(S.coins.find(x=>x.id===cid)); const q=qtyOf(c); const n=Math.min(q,Math.max(1,covOf(c,t.id)+(+dl))); c.receiptCover={...(c.receiptCover||{})}; if(n===q) delete c.receiptCover[t.id]; else c.receiptCover[t.id]=n; if(!Object.keys(c.receiptCover).length) delete c.receiptCover; c.updatedAt=new Date().toISOString(); await dbPut("coins",c); await reload(); t.confirmSplit=false; drawTop(); return; }
  if(d.rcdel){ const t=topV(); if(rcCoins(d.rcdel).length) return; if(!t.confirmDel){ t.confirmDel=true; drawTop(); return; } const r=S.receipts.find(x=>x.id===d.rcdel); await dbDel("receipts",r.id); await reload(); await dropUnused([r.fileId]); toast("Receipt deleted"); await popView(); return; }
  if("shownophoto" in d){ S.f=clone(FDEF); S.f.photos="none"; if(S.rep&&S.rep.sold) S.f.status="all"; S.tab="coins"; render(); scrollTo(0,0); return; }
  /* wants */
  if(d.wgot){ const w=S.wanted.find(x=>x.id===d.wgot); const draft=blankCoin(); draft.denom=w.denom||""; draft.year=w.year||""; draft.series=w.series||""; draft.title=w.title||""; openView({kind:"edit",id:null,draft,newFiles:[],removedFiles:[],fromWant:w.id}); return; }
  if(d.wdel){ await dbDel("wanted",d.wdel); await reload(); render(); toast("Removed from want list"); return; }
  if(d.addwant!=null){ const had=S.stack.length; while(S.stack.length){ const x=S.stack.pop(); await cleanupView(x); } if(had){ S._ignorePop=true; history.back(); } $("#sheet").hidden=true; document.body.style.overflow=""; S.tab="wants"; render(); scrollTo(0,0); const det=document.querySelector("details.fsec"); if(det) det.open=true; const sr=$("#w_series"); if(sr){ sr.value=d.addwant; $("#w_title").focus(); } return; }
  if(d.wantissue){ const [id,yr,mt]=d.wantissue.split("|"); const t=typeLists().find(x=>String(x.id)===id); const c0=t.units[0]; await dbPut("wanted",{id:uid("w"),title:`${yr} ${c0.denom||""} ${t.title}${mt?" ("+mt+")":""}`.replace(/\s+/g," ").trim(),denom:c0.denom||"",year:yr,series:c0.series||"",got:false,addedAt:new Date().toISOString()}); await reload(); toast("Added to your want list"); drawTop(); return; }
  /* numista settings */
  if("nssave" in d){ const s={...nsSet(),key:$("#nsKeyIn").value.trim(),ausOnly:$("#nsAusSet").checked}; await dbPut("settings",s); await reload(); render(); toast(s.key?"Numista key saved":"Numista key removed"); return; }
  if("nstest" in d){ $("#nsStat").textContent="Testing…"; try{ const code=await nsAusCode(); const j=await nsFetch(`/types?q=${encodeURIComponent("2 dollars")}&category=coin&count=1${code?"&issuer="+encodeURIComponent(code):""}`); $("#nsStat").textContent=`Working ✓ — Numista found ${fmtNum(j.count||0)} ${code?"Australian ":""}matches for "2 dollars"${code?"":" (Australia filter not found — results are filtered in the app instead)"}. ${nsUsage()}`; }catch(err){ $("#nsStat").textContent=err.message||String(err); } return; }
  /* more */
  if("mkreport" in d){ S.rep.photos=$("#rPhotos").checked; S.rep.two=$("#rTwo").checked; S.rep.ref=$("#rRef").checked; S.rep.sold=$("#rSold").checked; S.rep.by=$("#rBy").value.trim(); b.disabled=true; try{ await makeReport(); }catch(err){ toast("Couldn't create the report: "+(err&&err.message||err)); } b.disabled=false; return; }
  if("mkck" in d){ b.disabled=true; try{ await makeChecklist(); }catch(err){ toast("Couldn't create the checklist: "+(err&&err.message||err)); } b.disabled=false; return; }
  if("sharerep" in d){ try{ await navigator.share({files:[S._repFile],title:"Coin collection report"}); }catch(err){ if(err&&err.name!=="AbortError") toast("Couldn't share: "+(err.message||err)); } return; }
  if("copycsv" in d){ const ta=$("#csvText"); try{ await navigator.clipboard.writeText(ta.value); toast("CSV copied"); }catch{ ta.focus(); ta.select(); toast("Text selected — copy it from here"); } return; }
  if("backup" in d){ b.disabled=true; try{ await makeBackup(); }catch(err){ toast("Backup failed: "+(err&&err.message||err)); } b.disabled=false; return; }
  if("dlbk" in d){ setTimeout(markBackedUp,500); toast("Backup saved — check your Downloads"); return; }
  if("dbxconnect" in d){ b.disabled=true; try{ await dbxConnect(); }catch(err){ toast("Couldn't start Dropbox sign-in: "+(err.message||err)); } b.disabled=false; return; }
  if("dbxsync" in d){ await syncNow({manual:true}); return; }
  if("dbxcheck" in d){ await syncNow({check:true}); const v=S.meta.verify; if(v&&!S.meta.dbx.lastError) toast(v.fixed?`Checked: fixed ${v.fixed} item${v.fixed===1?"":"s"} in Dropbox`:`Checked: ${v.coins} coins and ${v.files} photos all match ✓`); return; }
  if("dbxsnap" in d){ b.disabled=true; try{ await maybeSnapshot(true); }catch(err){ toast("Snapshot failed: "+(err.message||err)); } b.disabled=false; return; }
  if("dbxtake" in d){ if(!b.dataset.sure){ b.dataset.sure="1"; b.textContent="Tap again to download and take over"; return; } b.disabled=true; try{ await dbxTakeOver(); }catch(err){ toast("Couldn't take over: "+(err.message||err)); b.disabled=false; } return; }
  if("dbxoff" in d){ if(!b.dataset.sure){ b.dataset.sure="1"; b.textContent="Tap again to disconnect"; return; } await dbxDisconnect(); return; }
  if("dbxlist" in d){ await dbxListBackups(); return; }
  if(d.dbxget){ b.disabled=true; b.textContent="Downloading…"; try{ const blob=await dbxDownload(d.dbxget); $("#dbxList").innerHTML=""; await readRestore(new File([blob],d.dbxget.split("/").pop(),{type:"application/zip"})); }catch(err){ toast("Download failed: "+(err.message||err)); b.disabled=false; b.textContent="Use this"; } return; }
  if("restore" in d){ $("#restoreIn").click(); return; }
  if("rsyes" in d){ b.disabled=true; try{ await doRestore(); }catch(err){ toast("Restore failed: "+(err&&err.message||err)); } return; }
  if("rsno" in d){ _restore=null; $("#rsConfirm").innerHTML=""; return; }
});
let _qT=null;
document.addEventListener("input",e=>{
  const el=e.target;
  if(el.id==="q"){ S.q=el.value; const cb=document.querySelector("[data-clearq]"); if(cb) cb.hidden=!S.q; clearTimeout(_qT); _qT=setTimeout(()=>{ const r=$("#results"); if(r){ r.innerHTML=resultsHTML(); hydrateImages(r); } },120); return; }
  if(el.id==="nsq"){ topV().q=el.value; return; }
  if(el.dataset.rnf){ const t=topV(); const r=((t&&t.newReceipts)||[]).find(x=>x.id===el.dataset.rid); if(r) r[el.dataset.rnf]=el.value; return; }
  if(el.id==="rlq"){ const t=topV(); t.lq=el.value; const l=$("#rlList"); if(l){ l.innerHTML=linkRows(t,linkList(t)); hydrateImages(l); } return; }
  if(el.id==="cpq"){ const t=topV(); t.cq=el.value; const l=$("#cpList"); if(l){ l.innerHTML=copyList(el.value); hydrateImages(l); } return; }
  if(el.dataset.ff){ const k=el.dataset.ff; S.f[k]=el.value.trim(); updFilterCount(); return; }
  if(el.dataset.plink!=null){ topV().draft.photos[+el.dataset.plink].link=el.value; return; }
  if(["f_year","f_series"].includes(el.id)){ const c=readForm(); const ti=$("#f_title"); if(ti) ti.placeholder=autoTitle(c)||"e.g. 2022 $2 Honey Bee"; return; }
  if(el.id==="f_price"){ const c=readForm(); delete c.priceAud; const n=$("#audNote"); if(n&&curOf(c.priceCur)!=="AUD") n.textContent="Converted to AUD when you save (needs internet)"; return; }
});
document.addEventListener("change",async e=>{
  const el=e.target;
  if(el.dataset.rck){ const t=topV(); if(el.checked) t.sel.add(el.dataset.rck); else t.sel.delete(el.dataset.rck); return; }
  if(el.id==="rlFill"){ topV().fill=el.checked; return; }
  if(el.dataset.rnf){ const t=topV(); const r=((t&&t.newReceipts)||[]).find(x=>x.id===el.dataset.rid); if(r) r[el.dataset.rnf]=el.value; return; }
  if(el.dataset.ckd!=null){ const o=ckOpts(), k=el.dataset.ckd; o.off=o.off.filter(x=>x!==k); if(!el.checked) o.off.push(k); return; }
  if(["ckSplit","ckWants","ckMoney","ckPhotos","ckSold"].includes(el.id)){ ckOpts()[{ckSplit:"split",ckWants:"wants",ckMoney:"money",ckPhotos:"photos",ckSold:"sold"}[el.id]]=el.checked; const sy=scrollY; render(); scrollTo(0,sy); return; }
  if(["rPhotos","rTwo","rRef","rSold"].includes(el.id)){ S.rep[{rPhotos:"photos",rTwo:"two",rRef:"ref",rSold:"sold"}[el.id]]=el.checked; const by=$("#rBy"); if(by) S.rep.by=by.value.trim(); render(); return; }
  if(el.id==="rcIn"&&el.files.length){ const fs=[...el.files]; el.value=""; if(S._rcMode==="edit") await addReceiptToEdit(fs); else await createStdReceipt(fs[0]); return; }
  if(el.id==="dbxWifi"){ await setDbx({wifiOnly:el.checked}); refreshDbxPanel(); return; }
  if(el.id==="sortSel"){ view().sort=el.value; saveMeta(); const r=$("#results"); r.innerHTML=resultsHTML(); hydrateImages(r); return; }
  if(el.id==="groupSel"){ view().group=el.value; saveMeta(); const r=$("#results"); r.innerHTML=resultsHTML(); hydrateImages(r); return; }
  if(el.dataset.ff){ const k=el.dataset.ff; if(k==="status") S.f.status=el.value||"owned"; else S.f[k]=el.value.trim(); updFilterCount(); return; }
  if(el.dataset.ffc){ S.f[el.dataset.ffc]=el.checked; updFilterCount(); return; }
  if(el.id==="f_isSet"){ $("#setFields").hidden=!el.checked; topV().draft.isSet=el.checked; return; }
  if(el.id==="f_priceCur"){ const c=readForm(); delete c.priceAud; const n=$("#audNote"); if(n) n.textContent=curOf(c.priceCur)!=="AUD"?"Converted to AUD when you save (needs internet)":""; return; }
  if(el.dataset.pside!=null){ readForm(); topV().draft.photos[+el.dataset.pside].side=el.value; return; }
  if(el.dataset.psrc!=null){ readForm(); topV().draft.photos[+el.dataset.psrc].source=el.value; drawPhotos(); return; }
  if(el.id==="nsAus"){ await dbPut("settings",{...nsSet(),ausOnly:el.checked}); await reload(); return; }
  if((el.id==="camIn"||el.id==="phIn")&&el.files.length){ const fs=[...el.files]; el.value=""; await addPhotoFiles(fs); return; }
  if(el.id==="restoreIn"&&el.files.length){ await readRestore(el.files[0]); el.value=""; return; }
});
document.addEventListener("submit",async e=>{
  e.preventDefault();
  if(e.target.id==="nsForm"){ const t=topV(); t.q=$("#nsq").value; $("#nsq").blur(); await nsSearch(t); return; }
  if(e.target.id==="wantForm"){ const fd=new FormData(e.target); const title=(fd.get("title")||"").trim(); if(!title) return; const tg=String(fd.get("target")||"").replace(/[$,\s]/g,"");
    await dbPut("wanted",{id:uid("w"),title,denom:fd.get("denom")||"",year:(fd.get("year")||"").trim(),series:(fd.get("series")||"").trim(),target:tg===""||isNaN(+tg)?null:+tg,notes:(fd.get("notes")||"").trim(),got:false,addedAt:new Date().toISOString()});
    await reload(); render(); toast("Added to want list"); }
});
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ const z=$("#zoom"); if(z){ z.remove(); return; } if(S.stack.length) popView(); } });
window.addEventListener("unhandledrejection",e=>{ if(e.reason&&e.reason.message===RO_MSG){ e.preventDefault(); toast(RO_MSG); } });

/* ================= boot ================= */
async function reload(){ [S.coins,S.wanted,S.settings,S.receipts]=await Promise.all(["coins","wanted","settings","receipts"].map(dbAll)); const m=await dbGet("meta","main"); S.meta=m?(({id,...r})=>r)(m):{}; view(); }
let _converting=false;
async function convertPending(){ if(S.readOnly||_converting||navigator.onLine===false) return; _converting=true; let n=0;
  try{ for(const c of S.coins.filter(pendingConv)){ const x=clone(c); if(await convertCoin(x)){ await dbPut("coins",x); n++; } } }finally{ _converting=false; }
  if(n){ await reload(); if(!S.stack.length) render(); toast(`${n} foreign-currency price${n===1?"":"s"} converted to AUD`); } }
(async()=>{
  try{ _dbP=openDB(); await _dbP; }catch(e){ $("#main").innerHTML=`<section class="view"><div class="empty">This browser can't store data for the app (private mode or storage blocked). Open it in normal Chrome.</div></section>`; return; }
  await reload();
  S.readOnly=!!S.meta.readOnly; if(!S.meta.deviceSince){ S.meta.deviceSince=todayStr(); await saveMeta(); } deviceId();
  render();
  await dbxFinish();
  convertPending();
  if(dbxOn()) scheduleSync(1500);
  document.addEventListener("visibilitychange",()=>{ if(!dbxOn()) return; if(document.visibilityState==="hidden"){ if(S.meta.changes) syncNow(); } else scheduleSync(1500); });
  window.addEventListener("pagehide",()=>{ if(dbxOn()&&S.meta.changes) syncNow(); });
  window.addEventListener("online",()=>{ convertPending(); if(dbxOn()) scheduleSync(2000); });
  if("serviceWorker" in navigator && location.protocol!=="file:"){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
})();
