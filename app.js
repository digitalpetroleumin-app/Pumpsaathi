(function(){
"use strict";
const KEY = "pumpsaathi.db.v1";
const $ = s => document.querySelector(s);
const today = () => new Date().toISOString().slice(0,10);
const uid = () => Math.random().toString(36).slice(2,10);
const money = n => "₹" + (Math.round((+n||0)*100)/100).toLocaleString("en-IN");

let db = load();
let session = JSON.parse(sessionStorage.getItem("ps.session") || "null");
let tab = "dashboard";

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || blank(); } catch(e){ return blank(); }
}
function blank(){
  return {setup:false, users:[], pump:{name:"",address:"",gst:"",fssai:"",plan:"basic",skills:{}},
    nozzles:[], tanks:[], rates:{}, rateReq:[], rateHist:[], parties:[], sales:[], cash:[],
    expenses:[], dips:[], locks:{}, audit:[]};
}
function save(){ localStorage.setItem(KEY, JSON.stringify(db)); }
function audit(text){ db.audit.unshift({at:new Date().toISOString(), by:session?session.email:"-", text}); db.audit = db.audit.slice(0,500); }

async function hash(pw, salt){
  const buf = new TextEncoder().encode(salt + ":" + pw);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ---- plan gating ----
function planAllows(f){
  if (!f) return false;
  if (f.plan === "free") return true;
  if (f.plan === "pro") return db.pump.plan === "pro";
  if (f.plan.startsWith("skill:")){
    const id = f.plan.split(":")[1];
    const s = db.pump.skills[id];
    return !!s && s.until >= today();
  }
  return false;
}
function can(featureId){
  const f = FEATURES.find(x=>x.id===featureId);
  return planAllows(f) && f.status === "built";
}
const role = () => session ? session.role : "";
const isOwnerish = () => ["superadmin","owner"].includes(role());
const canManage = () => ["superadmin","owner","manager"].includes(role());

// ---- screens ----
function render(){
  $("#who").textContent = session ? (session.name + " · " + role()) : "";
  const nav = $("#tabs");
  if (!db.setup) return renderSetup();
  if (!session) return renderLogin();
  const tabs = [["dashboard","Dashboard"],["shift","Shift"],["cash","Cash"],["party","Udhaar"],["expense","Kharcha"],["tank","Tank"],["rates","Rates"],["reports","Reports"],["staff","Staff"],["skills","Skills"],["settings","Settings"],["support","Support"]];
  nav.hidden = false;
  nav.innerHTML = tabs.map(([k,l])=>`<button data-t="${k}" class="${tab===k?"on":""}">${l}</button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
  const views = {dashboard, shift, cash, party, expense, tank, rates, reports, staff, skills, settings, support};
  (views[tab]||dashboard)();
}

function renderSetup(){
  $("#tabs").hidden = true;
  $("#app").innerHTML = `<div class="card"><h2>Pehli baar setup</h2>
   <p>Super admin account banayein. Ye email aur password sirf is device par save hoga.</p>
   <label>Super admin email</label><input id="se" value="Neerajdevnik@gmail.com">
   <label>Password (kam se kam 8 characters)</label><input id="sp" type="password">
   <label>Pump ka naam</label><input id="sn" placeholder="Mazda Filling Station">
   <button id="sb">Setup complete karein</button><div id="sm"></div></div>`;
  $("#sb").onclick = async ()=>{
    const e=$("#se").value.trim().toLowerCase(), p=$("#sp").value, n=$("#sn").value.trim();
    if(!e.includes("@")||p.length<8||!n) return msg("#sm","Sab fields sahi bharein","err");
    const salt = uid();
    db.users.push({id:uid(), email:e, name:"Super Admin", role:"superadmin", salt, hash: await hash(p,salt), pumpOwner:true});
    db.pump.name = n; db.setup = true; audit("Setup complete"); save(); render();
  };
}

function renderLogin(){
  $("#tabs").hidden = true;
  $("#app").innerHTML = `<div class="card"><h2>Login</h2>
   <label>Email</label><input id="le" type="email" autocomplete="username">
   <label>Password</label><input id="lp" type="password" autocomplete="current-password">
   <button id="lb">Login</button><div id="lm"></div>
   <p style="font-size:13px;color:#6b7280">Salesman ka login owner/manager banate hain. Kisi aur ka account nahi milta to pump owner se baat karein.</p></div>`;
  $("#lb").onclick = async ()=>{
    const e=$("#le").value.trim().toLowerCase(), p=$("#lp").value;
    const u = db.users.find(x=>x.email===e);
    if(!u) return msg("#lm","Email ya password galat hai","err");
    if(u.locked) return msg("#lm","Account locked. Owner se baat karein.","err");
    if((await hash(p,u.salt)) !== u.hash){
      u.fails=(u.fails||0)+1; if(u.fails>=5) u.locked=true; save();
      return msg("#lm","Email ya password galat hai","err");
    }
    u.fails=0; session={id:u.id,email:u.email,name:u.name,role:u.role};
    sessionStorage.setItem("ps.session", JSON.stringify(session));
    audit("Login"); save(); render();
  };
}

function msg(sel, text, kind){ const el=$(sel); if(el) el.innerHTML = `<div class="msg ${kind||"ok"}">${text}</div>`; }
function logout(){ session=null; sessionStorage.removeItem("ps.session"); render(); }

// ---- dashboard ----
function dashboard(){
  const d = today();
  const gs = can("search_global") ? `<div class="card"><label>Search (party / gaadi / date)</label><input id="gq" placeholder="naam, gaadi no., 2026-11-16"><div id="gr" style="margin-top:8px;font-size:14px"></div></div>` : "";
  const s = db.sales.filter(x=>x.date===d);
  const liters = s.reduce((a,x)=>a+x.liters,0), amt = s.reduce((a,x)=>a+x.amount,0);
  const ex = db.expenses.filter(x=>x.date===d).reduce((a,x)=>a+x.amount,0);
  const pend = db.rateReq.filter(x=>x.status==="pending").length;
  setTimeout(()=>{ const el=$("#gq"); if(!el) return; el.oninput=()=>{
    const q=el.value.trim().toLowerCase(); if(!q){ $("#gr").innerHTML=""; return; }
    const ps=db.parties.filter(p=>p.name.toLowerCase().includes(q)||(p.vehicle||"").toLowerCase().includes(q)||(p.phone||"").includes(q))
      .map(p=>`<div>👤 <a href="#" data-pl="${p.id}">${p.name}</a> · ${p.vehicle||""} · bakaya ${money(balance(p.id))}</div>`);
    const ss=db.sales.filter(x=>x.date.includes(q)).slice(-10).map(x=>`<div>⛽ ${x.date} ${x.fuel} ${x.liters}L ${money(x.amount)}</div>`);
    $("#gr").innerHTML=[...ps,...ss].join("")||"Kuch nahi mila";
    document.querySelectorAll("[data-pl]").forEach(a=>a.onclick=e=>{e.preventDefault(); partyLedger(a.dataset.pl);});
  };},0);
  $("#app").innerHTML = `<h2>${db.pump.name||"Pump"} — aaj (${d})</h2>
   <div class="kpi"><div>Litre<b>${liters.toFixed(2)}</b></div><div>Sale<b>${money(amt)}</b></div>
   <div>Kharcha<b>${money(ex)}</b></div><div>Udhaar bakaya<b>${money(db.parties.reduce((a,p)=>a+balance(p.id),0))}</b></div></div>
   ${gs}
   ${pend&&isOwnerish()?`<div class="card" style="margin-top:12px">⚠️ ${pend} rate change request approval ke liye pending hai.</div>`:""}
   <div class="card"><h3>Pump plan</h3><p>${db.pump.plan==="pro"?"Pro (₹2,199/mo)":"Basic (₹999/mo)"} · Skills active: ${activeSkills().length}</p></div>`;
}
const activeSkills = ()=>Object.entries(db.pump.skills||{}).filter(([k,v])=>v.until>=today()).map(([k])=>k);

// ---- shift / nozzle sale ----
function shift(){
  if(!db.nozzles.length) return $("#app").innerHTML = `<div class="card"><h2>Shift</h2><p>Pehle Settings mein nozzle add karein.</p></div>`;
  const opts = db.nozzles.map(n=>`<option value="${n.id}">${n.name} (${n.fuel})</option>`).join("");
  const parties = db.parties.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
  $("#app").innerHTML = `<h2>Nozzle reading</h2>
   <div class="card"><label>Nozzle</label><select id="nz">${opts}</select>
   <div class="row"><div><label>Pichla reading</label><input id="pr" disabled></div>
   <div><label>Abhi ka reading</label><input id="cr" type="number" step="0.01"></div></div>
   <div class="row"><div><label>Rate (₹/L)</label><input id="rt" disabled></div>
   <div><label>Payment</label><select id="pm"><option>cash</option><option>upi</option><option>card</option><option value="udhaar">udhaar</option></select></div></div>
   <label>Udhaar party (sirf udhaar ke liye)</label><select id="pt"><option value="">--</option>${parties}</select>
   <div id="pv" style="margin-top:10px;font-weight:700"></div>
   <button id="sv">Sale save karein</button><div id="sm"></div></div>
   <div class="card"><h3>Aaj ki entries</h3>${salesTable(today())}</div>`;
  const refresh=()=>{
    const n = db.nozzles.find(x=>x.id===$("#nz").value);
    const last = lastReading(n.id);
    $("#pr").value = last; $("#rt").value = rateOf(n.fuel);
    const c=+$("#cr").value; const l=c-last; $("#pv").textContent = c>0 && l>0 ? `${l.toFixed(2)} L × ₹${rateOf(n.fuel)} = ${money(l*rateOf(n.fuel))}` : "";
  };
  ["#nz","#cr"].forEach(s=>$(s).oninput=$(s).onchange=refresh); refresh();
  $("#sv").onclick=()=>{
    const n = db.nozzles.find(x=>x.id===$("#nz").value);
    const last=lastReading(n.id), c=+$("#cr").value, rate=rateOf(n.fuel);
    if(n.last==null){ // pehli baar: sirf opening meter save, sale nahi
      n.last=c; audit("Opening reading "+n.name+" "+c); save(); msg("#sm","Opening reading save ho gaya (sale abhi nahi)"); return shift();
    }
    if(!(c>last)) return msg("#sm","Abhi ka reading pichle se bada hona chahiye","err");
    const liters=+(c-last).toFixed(2), amount=+(liters*rate).toFixed(2), pm=$("#pm").value, pid=$("#pt").value;
    if(pm==="udhaar" && !pid) return msg("#sm","Udhaar ke liye party select karein","err");
    db.sales.push({id:uid(),date:today(),time:new Date().toLocaleTimeString("en-IN"),nozzle:n.id,fuel:n.fuel,
      from:last,to:c,liters,rate,amount,mode:pm,party:pm==="udhaar"?pid:null,by:session.email});
    db.nozzles.find(x=>x.id===n.id).last = c;
    audit(`Sale ${liters}L ${n.fuel} ${money(amount)}`); save();
    if(can("print_slip")) printSlip(db.sales[db.sales.length-1]);
    msg("#sm","Sale save ho gayi"); shift();
  };
}
function printSlip(x){
  const gst = can("fssai_gst_show") ? `<div>GSTIN: ${db.pump.gst||"-"} · FSSAI: ${db.pump.fssai||"-"}</div>` : "";
  const w=window.open("","_blank","width=300,height=500"); if(!w) return;
  w.document.write(`<html><body style="font-family:monospace;width:260px"><h3>${db.pump.name||"Pump"}</h3><div>${db.pump.address||""}</div>${gst}<hr>
  <div>${x.date} ${x.time}</div><div>Fuel: ${x.fuel}</div><div>Litre: ${x.liters}</div><div>Rate: ${money(x.rate)}</div>
  <div><b>Amount: ${money(x.amount)}</b></div><div>Mode: ${x.mode}</div><hr><div>Dhanyavaad!</div><script>print()<\/script></body></html>`);
  w.document.close();
}
function lastReading(nid){
  const n=db.nozzles.find(x=>x.id===nid); return n&&n.last!=null ? n.last : 0;
}
function rateOf(fuel){ return db.rates[fuel] || 0; }
function salesTable(d){
  const rows = db.sales.filter(x=>x.date===d).map(x=>`<tr><td>${x.time}</td><td>${x.fuel}</td><td>${x.liters}</td><td>${money(x.amount)}</td><td>${x.mode}</td></tr>`).join("");
  return `<table><tr><th>Time</th><th>Fuel</th><th>L</th><th>Amount</th><th>Mode</th></tr>${rows||"<tr><td colspan=5>Koi entry nahi</td></tr>"}</table>`;
}

// ---- cash tally ----
function cash(){
  const d = today(); const locked = !!db.locks[d];
  const sale = db.sales.filter(x=>x.date===d && x.mode!=="udhaar").reduce((a,x)=>a+x.amount,0);
  const ent = db.cash.find(x=>x.date===d);
  $("#app").innerHTML = `<h2>Cash tally (${d})</h2><div class="card">
   <p>Expected (cash+UPI+card, udhaar chhodkar): <b>${money(sale)}</b></p>
   <div class="row"><div><label>Cash</label><input id="c1" type="number" value="${ent?ent.cash:""}" ${locked?"disabled":""}></div>
   <div><label>UPI</label><input id="c2" type="number" value="${ent?ent.upi:""}" ${locked?"disabled":""}></div></div>
   <label>Card</label><input id="c3" type="number" value="${ent?ent.card:""}" ${locked?"disabled":""}>
   <div id="cd" style="margin-top:10px"></div>
   ${locked?`<p>🔒 Day locked</p>`:`<button id="cs">Save tally</button>${can("day_lock")&&canManage()?`<button class="sec" id="cl">Day lock karein</button>`:""}`}
   ${ent&&can("day_lock")&&role()==="superadmin"||isOwnerish()&&locked?`<button class="sec" id="cu">Unlock (owner)</button>`:""}
   <div id="cm"></div></div>`;
  const calc=()=>{const t=(+$("#c1").value||0)+(+$("#c2").value||0)+(+$("#c3").value||0); const diff=t-sale;
    $("#cd").innerHTML = `Total: <b>${money(t)}</b> · Difference: <b style="color:${Math.abs(diff)<1?"#16a34a":"#dc2626"}">${money(diff)}</b> ${Math.abs(diff)>=1?(diff<0?"⚠️ Shortage":"⚠️ Excess"):""}`;};
  ["#c1","#c2","#c3"].forEach(s=>{const el=$(s); if(el) el.oninput=calc;}); calc();
  if($("#cs")) $("#cs").onclick=()=>{
    const row={date:d,cash:+$("#c1").value||0,upi:+$("#c2").value||0,card:+$("#c3").value||0,by:session.email};
    db.cash=db.cash.filter(x=>x.date!==d); db.cash.push(row); audit("Cash tally "+d); save(); msg("#cm","Tally save ho gaya"); cash();
  };
  if($("#cl")) $("#cl").onclick=()=>{ db.locks[d]=session.email; audit("Day lock "+d); save(); cash(); };
  if($("#cu")) $("#cu").onclick=()=>{ delete db.locks[d]; audit("Day unlock "+d); save(); cash(); };
}

// ---- udhaar parties ----
function balance(pid){
  const sales = db.sales.filter(x=>x.party===pid).reduce((a,x)=>a+x.amount,0);
  const pay = (db.parties.find(p=>p.id===pid)||{payments:[]}).payments.reduce((a,x)=>a+x.amount,0);
  return sales - pay;
}
function churnList(){
  if(!can("churn_list")) return "";
  const cut = new Date(); cut.setDate(cut.getDate()-30); const c = cut.toISOString().slice(0,10);
  const rows = db.parties.filter(p=>{
    const last = db.sales.filter(x=>x.party===p.id).map(x=>x.date).sort().pop();
    const total = db.sales.filter(x=>x.party===p.id).length;
    return total>=3 && last && last < c;
  }).map(p=>{const last=db.sales.filter(x=>x.party===p.id).map(x=>x.date).sort().pop(); return `<tr><td>${p.name}</td><td>${p.phone||"-"}</td><td>${last}</td></tr>`;}).join("");
  return `<div class="card"><h3>Churn list: 30 din se nahi aaye (pro)</h3><table><tr><th>Naam</th><th>Phone</th><th>Last</th></tr>${rows||"<tr><td colspan=3>Sab regular aa rahe hain</td></tr>"}</table></div>`;
}
function party(){
  const q = (window.__pq||"").toLowerCase();
  const list = db.parties.filter(p=>!q||p.name.toLowerCase().includes(q)||(p.phone||"").includes(q));
  const rows = list.map(p=>`<tr><td>${p.name}</td><td>${p.vehicle||""}</td><td>${money(balance(p.id))}</td><td><button class="sec" data-p="${p.id}" style="width:auto;margin:0;padding:6px 10px">Khol</button></td></tr>`).join("");
  $("#app").innerHTML = `<h2>Udhaar parties</h2>
   <div class="card"><label>Search (naam / phone)</label><input id="ps" value="${window.__pq||""}">
   <table><tr><th>Naam</th><th>Gaadi</th><th>Bakaya</th><th></th></tr>${rows||"<tr><td colspan=4>Koi party nahi</td></tr>"}</table></div>
   ${churnList()}
   <div class="card"><h3>Nayi party</h3>
   <label>Naam</label><input id="pn"><label>Phone</label><input id="pp" type="tel">
   <label>Gaadi number (fleet ke liye)</label><input id="pv2"><label>Credit limit (₹)</label><input id="pl" type="number">
   <button id="pa">Party add karein</button><div id="pm"></div></div>`;
  $("#ps").oninput=e=>{window.__pq=e.target.value; party();};
  $("#pa").onclick=()=>{
    const name=$("#pn").value.trim(); if(!name) return msg("#pm","Naam zaroori hai","err");
    db.parties.push({id:uid(),name,phone:$("#pp").value.trim(),vehicle:$("#pv2").value.trim().toUpperCase(),limit:+$("#pl").value||0,payments:[]});
    audit("Party add "+name); save(); party();
  };
  document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>partyLedger(b.dataset.p));
}
function partyLedger(pid){
  const p = db.parties.find(x=>x.id===pid); if(!p) return;
  const sales = db.sales.filter(x=>x.party===pid).map(x=>({d:x.date,t:`${x.fuel} ${x.liters}L`,dr:x.amount,cr:0}));
  const pays = p.payments.map(x=>({d:x.date,t:"Payment "+x.mode,dr:0,cr:x.amount}));
  const all = [...sales,...pays].sort((a,b)=>a.d.localeCompare(b.d));
  let run=0; const rows = all.map(r=>{run+=r.dr-r.cr; return `<tr><td>${r.d}</td><td>${r.t}</td><td>${money(r.dr)}</td><td>${money(r.cr)}</td><td>${money(run)}</td></tr>`;}).join("");
  $("#app").innerHTML = `<h2>${p.name} — ledger</h2><div class="card">
   <p>Phone: ${p.phone||"-"} · Gaadi: ${p.vehicle||"-"} · Limit: ${money(p.limit)}</p>
   <table><tr><th>Date</th><th>Detail</th><th>Dr</th><th>Cr</th><th>Bal</th></tr>${rows||"<tr><td colspan=5>Koi entry nahi</td></tr>"}</table>
   <h3>Payment receive</h3><label>Amount</label><input id="pay" type="number"><label>Mode</label><select id="pmode"><option>cash</option><option>upi</option><option>card</option></select>
   <button id="pr2">Payment save</button><button class="sec" id="back">Wapas</button><div id="lm"></div></div>`;
  $("#pr2").onclick=()=>{const a=+$("#pay").value; if(!(a>0)) return msg("#lm","Amount daalein","err");
    p.payments.push({date:today(),amount:a,mode:$("#pmode").value}); audit(`Payment ${money(a)} from ${p.name}`); save(); partyLedger(pid);};
  $("#back").onclick=()=>{tab="party";render();};
}

// ---- expenses ----
function expense(){
  const list = db.expenses.filter(x=>x.date===today()).map(x=>`<tr><td>${x.cat}</td><td>${x.note||""}</td><td>${money(x.amount)}</td></tr>`).join("");
  $("#app").innerHTML = `<h2>Kharcha</h2><div class="card">
   <label>Category</label><select id="ec"><option>Bijli</option><option>Salary</option><option>Maintenance</option><option>Chai/Pani</option><option>Other</option></select>
   <label>Amount</label><input id="ea" type="number"><label>Note</label><input id="en">
   <button id="es">Kharcha save</button><div id="em"></div></div>
   <div class="card"><h3>Aaj ka kharcha</h3><table>${list||"<tr><td>Koi entry nahi</td></tr>"}</table></div>`;
  $("#es").onclick=()=>{const a=+$("#ea").value; if(!(a>0)) return msg("#em","Amount daalein","err");
    db.expenses.push({id:uid(),date:today(),cat:$("#ec").value,amount:a,note:$("#en").value,by:session.email}); audit("Kharcha "+money(a)); save(); expense();};
}

// ---- tank ----
function tank(){
  const opts = db.tanks.map(t=>`<option value="${t.id}">${t.name} (${t.fuel})</option>`).join("");
  const dipRows = db.dips.slice(-20).reverse().map(d=>`<tr><td>${d.date}</td><td>${d.tank}</td><td>${d.cm} cm</td><td>${d.liters} L</td></tr>`).join("");
  let variance = "";
  if(can("tank_variance") && db.tanks.length){
    variance = `<div class="card"><h3>Stock variance (pro)</h3>` + db.tanks.map(t=>{
      const ds = db.dips.filter(d=>d.tank===t.id);
      if(ds.length<2) return `${t.name}: 2 dip chahiye`;
      const a=ds[ds.length-2], b=ds[ds.length-1];
      const sold = db.sales.filter(s=>s.fuel===t.fuel && s.date>=a.date && s.date<=b.date).reduce((x,s)=>x+s.liters,0);
      const expect = a.liters - sold, v = b.liters - expect;
      return `${t.name}: sale ${sold.toFixed(1)} L, expected ${expect.toFixed(1)} L, actual ${b.liters} L, variance <b style="color:${Math.abs(v)>50?"#dc2626":"#16a34a"}">${v.toFixed(1)} L</b>`;
    }).join("<br>") + `</div>`;
  }
  $("#app").innerHTML = `<h2>Tank dip</h2><div class="card">
   <label>Tank</label><select id="tk">${opts||"<option>Settings mein tank add karein</option>"}</select>
   <label>Dip (cm)</label><input id="dc" type="number" step="0.1">
   <button id="ds">Dip save</button><div id="dm"></div></div>${variance}
   <div class="card"><h3>History</h3><table><tr><th>Date</th><th>Tank</th><th>Dip</th><th>Litre</th></tr>${dipRows||"<tr><td colspan=4>Koi dip nahi</td></tr>"}</table></div>`;
  $("#ds").onclick=()=>{const t=db.tanks.find(x=>x.id===$("#tk").value); if(!t) return msg("#dm","Tank select karein","err");
    const cm=+$("#dc").value; const liters=Math.round(cm*t.lpc*10)/10;
    db.dips.push({date:today(),tank:t.id,cm,liters}); audit(`Dip ${t.name} ${cm}cm`); save(); tank();};
}

// ---- rates (pro approval) ----
function rates(){
  const fuels = [...new Set(db.nozzles.map(n=>n.fuel))];
  const cur = fuels.map(f=>`<tr><td>${f}</td><td>${money(rateOf(f))}</td></tr>`).join("");
  const pend = db.rateReq.filter(r=>r.status==="pending").map(r=>`<tr><td>${r.fuel}</td><td>${money(r.rate)}</td><td>${r.by}</td><td>${isOwnerish()?`<button data-ok="${r.id}" style="width:auto;margin:0;padding:6px 10px">Approve</button>`:"Pending"}</td></tr>`).join("");
  const hist = db.rateHist.slice(-20).reverse().map(h=>`<tr><td>${h.at.slice(0,10)}</td><td>${h.fuel}</td><td>${money(h.rate)}</td><td>${h.by}</td></tr>`).join("");
  $("#app").innerHTML = `<h2>Rates</h2>
   <div class="card"><h3>Current</h3><table>${cur||"<tr><td>Nozzle add karein</td></tr>"}</table></div>
   ${can("rate_request")?`<div class="card"><h3>Rate change request</h3>
     <label>Fuel</label><input id="rf" list="fl" value="${fuels[0]||""}"><datalist id="fl">${fuels.map(f=>`<option>${f}</option>`).join("")}</datalist>
     <label>Nayi rate (₹/L)</label><input id="rr" type="number" step="0.01">
     <button id="rq">${isOwnerish()?"Rate turant badlein":"Owner ko request bhejein"}</button><div id="rm"></div></div>`:""}
   ${can("rate_approve")?`<div class="card"><h3>Pending approval</h3><table>${pend||"<tr><td>Koi request nahi</td></tr>"}</table></div>`:""}
   ${can("rate_history")?`<div class="card"><h3>History</h3><table>${hist||"<tr><td>Koi history nahi</td></tr>"}</table></div>`:""}`;
  const apply=(fuel,rate,by)=>{db.rates[fuel]=rate; db.rateHist.push({at:new Date().toISOString(),fuel,rate,by}); audit(`Rate ${fuel}=${rate}`);};
  if($("#rq")) $("#rq").onclick=()=>{const f=$("#rf").value.trim(), r=+$("#rr").value; if(!f||!(r>0)) return msg("#rm","Fuel aur rate sahi daalein","err");
    if(isOwnerish()) apply(f,r,session.email); else db.rateReq.push({id:uid(),fuel:f,rate:r,by:session.email,status:"pending"});
    save(); rates();};
  document.querySelectorAll("[data-ok]").forEach(b=>b.onclick=()=>{const r=db.rateReq.find(x=>x.id===b.dataset.ok); apply(r.fuel,r.rate,session.email); r.status="approved"; save(); rates();});
}

// ---- reports ----
function reports(){
  const d=today();
  const s=db.sales.filter(x=>x.date===d);
  const byFuel = {}; s.forEach(x=>{byFuel[x.fuel]=byFuel[x.fuel]||{l:0,a:0}; byFuel[x.fuel].l+=x.liters; byFuel[x.fuel].a+=x.amount;});
  const rows = Object.entries(byFuel).map(([f,v])=>`<tr><td>${f}</td><td>${v.l.toFixed(2)}</td><td>${money(v.a)}</td></tr>`).join("");
  $("#app").innerHTML = `<h2>Daily Sales Report (${d})</h2><div class="card">
   <table><tr><th>Fuel</th><th>L</th><th>Sale</th></tr>${rows||"<tr><td colspan=3>Koi sale nahi</td></tr>"}</table>
   <button id="ex1">Sales CSV download</button><button class="sec" id="ex2">Udhaar CSV download</button>
   <button class="sec" id="ex3">Monthly summary dekhein</button></div><div id="rm"></div>`;
  $("#ex1").onclick=()=>csv("sales.csv",["date","time","fuel","liters","rate","amount","mode","by"],db.sales);
  $("#ex2").onclick=()=>csv("udhaar.csv",["name","phone","vehicle","balance"],db.parties.map(p=>({name:p.name,phone:p.phone,vehicle:p.vehicle,balance:balance(p.id)})));
  $("#ex3").onclick=()=>{const m=d.slice(0,7); const ms=db.sales.filter(x=>x.date.startsWith(m)); const L=ms.reduce((a,x)=>a+x.liters,0), A=ms.reduce((a,x)=>a+x.amount,0);
    $("#rm").innerHTML=`<div class="card">${m}: ${L.toFixed(2)} L, ${money(A)} sale, ${ms.length} entries</div>`;};
}
function csv(name, cols, rows){
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const body=[cols.join(","), ...rows.map(r=>cols.map(c=>esc(r[c])).join(","))].join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff"+body],{type:"text/csv"})); a.download=name; a.click();
}

// ---- staff ----
function staff(){
  if(!canManage()) return $("#app").innerHTML=`<div class="card">Ye section aapke role ke liye nahi hai.</div>`;
  const allowed = role()==="superadmin"?["owner","manager","salesman"]:(role()==="owner"?["manager","salesman"]:["salesman"]);
  const list = db.users.filter(u=>u.pumpOwner!==true).map(u=>`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${u.locked?"🔒":""}</td></tr>`).join("");
  $("#app").innerHTML = `<h2>Staff</h2><div class="card"><table><tr><th>Naam</th><th>Email</th><th>Role</th><th></th></tr>${list||"<tr><td colspan=4>Koi staff nahi</td></tr>"}</table></div>
   <div class="card"><h3>Naya user</h3>
   <label>Naam</label><input id="sn"><label>Email (login id)</label><input id="se" type="email">
   <label>Temporary password (8+)</label><input id="sp" type="password">
   <label>Role</label><select id="sr">${allowed.map(r=>`<option>${r}</option>`).join("")}</select>
   <button id="sa">User add karein</button><div id="sm"></div></div>`;
  $("#sa").onclick=async ()=>{
    const e=$("#se").value.trim().toLowerCase(), p=$("#sp").value, n=$("#sn").value.trim(), r=$("#sr").value;
    if(!n||!e.includes("@")||p.length<8) return msg("#sm","Naam, email aur 8+ char password zaroori hain","err");
    if(db.users.some(u=>u.email===e)) return msg("#sm","Ye email pehle se hai","err");
    const salt=uid(); db.users.push({id:uid(),email:e,name:n,role:r,salt,hash:await hash(p,salt)});
    audit(`User add ${e} as ${r}`); save(); staff();
  };
}

// ---- skills store (AI avatars) ----
function skills(){
  const cards = AVATARS.map(a=>{
    const s = db.pump.skills[a.id]; const active = s && s.until>=today();
    return `<div class="card"><h3>${a.name}</h3><p>${a.role} · ₹${a.price}/mo</p>
      <p>${active?`✅ Active till ${s.until}`:"Locked"}</p>
      ${isOwnerish()?`<button ${active?"class=sec":""} data-buy="${a.id}">${active?"30 din aur badhayein":"Buy (30 din)"}</button>`:""}
      <button class="sec" data-speak="${a.id}">🔊 Sunein: kaam kya hai</button></div>`;
  }).join("");
  $("#app").innerHTML = `<h2>Skill store</h2><p style="font-size:13px;color:#6b7280">Purchase ka payment gateway abhi connect nahi hai. Yahan se "Buy" demo activation hai, real payment Razorpay/Cashfree/Pine Labs ke baad.</p>${cards}`;
  document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{
    const d=new Date(); d.setDate(d.getDate()+30); db.pump.skills[b.dataset.buy]={until:d.toISOString().slice(0,10)};
    audit("Skill activate "+b.dataset.buy); save(); skills();});
  document.querySelectorAll("[data-speak]").forEach(b=>b.onclick=()=>{
    const a=AVATARS.find(x=>x.id===b.dataset.speak);
    const u=new SpeechSynthesisUtterance(`${a.name}. Mera kaam hai: ${a.role}.`); u.lang="hi-IN"; speechSynthesis.cancel(); speechSynthesis.speak(u);});
}

// ---- settings ----
function settings(){
  if(!isOwnerish()) return $("#app").innerHTML=`<div class="card">Settings owner ke liye hai.</div>`;
  const nz = db.nozzles.map(n=>`<tr><td>${n.name}</td><td>${n.fuel}</td><td><button class="sec" data-dn="${n.id}" style="width:auto;margin:0;padding:4px 8px">X</button></td></tr>`).join("");
  const tk = db.tanks.map(t=>`<tr><td>${t.name}</td><td>${t.fuel}</td><td>${t.lpc} L/cm</td></tr>`).join("");
  const audits = can("audit_log") ? `<div class="card"><h3>Audit log</h3><table>${db.audit.slice(0,30).map(a=>`<tr><td>${a.at.slice(0,16).replace("T"," ")}</td><td>${a.by}</td><td>${a.text}</td></tr>`).join("")}</table></div>` : `<div class="card lock">Audit log: Pro plan mein milega</div>`;
  $("#app").innerHTML = `<h2>Settings</h2>
   <div class="card"><h3>Pump profile</h3>
   <label>Naam</label><input id="pn2" value="${db.pump.name}"><label>Address</label><input id="pa2" value="${db.pump.address}">
   <div class="row"><div><label>GSTIN</label><input id="pg" value="${db.pump.gst}"></div><div><label>FSSAI</label><input id="pf" value="${db.pump.fssai}"></div></div>
   <label>Plan</label><select id="pl2"><option value="basic" ${db.pump.plan==="basic"?"selected":""}>Basic ₹999</option><option value="pro" ${db.pump.plan==="pro"?"selected":""}>Pro ₹2,199</option></select>
   <button id="psv">Profile save</button></div>
   <div class="card"><h3>Nozzle add</h3><table>${nz||"<tr><td>Koi nozzle nahi</td></tr>"}</table>
   <label>Naam (e.g. N1)</label><input id="nn"><label>Fuel</label><input id="nf" placeholder="Diesel / Petrol">
   <button id="na">Nozzle add</button></div>
   <div class="card"><h3>Tank add</h3><table>${tk||"<tr><td>Koi tank nahi</td></tr>"}</table>
   <label>Naam</label><input id="tn"><label>Fuel</label><input id="tf"><label>Litre per cm (chart se)</label><input id="tl" type="number" step="0.1">
   <button id="ta">Tank add</button></div>
   <div class="card"><h3>Backup</h3><button id="bx">Backup download (JSON)</button><input type="file" id="bi" accept="application/json"></div>
   ${audits}<div id="sm"></div>`;
  $("#psv").onclick=()=>{db.pump.name=$("#pn2").value; db.pump.address=$("#pa2").value; db.pump.gst=$("#pg").value; db.pump.fssai=$("#pf").value; db.pump.plan=$("#pl2").value; audit("Profile update"); save(); msg("#sm","Profile save ho gaya"); render();};
  $("#na").onclick=()=>{const n=$("#nn").value.trim(), f=$("#nf").value.trim(); if(!n||!f) return msg("#sm","Naam aur fuel dono bharein","err"); db.nozzles.push({id:uid(),name:n,fuel:f,last:null}); if(!db.rates[f]) db.rates[f]=0; audit("Nozzle "+n); save(); settings();};
  $("#ta").onclick=()=>{const n=$("#tn").value.trim(), f=$("#tf").value.trim(), l=+$("#tl").value; if(!n||!f||!(l>0)) return msg("#sm","Tank ki sab details bharein","err"); db.tanks.push({id:uid(),name:n,fuel:f,lpc:l}); audit("Tank "+n); save(); settings();};
  document.querySelectorAll("[data-dn]").forEach(b=>b.onclick=()=>{db.nozzles=db.nozzles.filter(n=>n.id!==b.dataset.dn); save(); settings();});
  $("#bx").onclick=()=>{const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:"application/json"})); a.download="pumpsaathi-backup-"+today()+".json"; a.click();};
  $("#bi").onchange=async e=>{const f=e.target.files[0]; if(!f) return; try{ db=JSON.parse(await f.text()); save(); msg("#sm","Restore ho gaya"); render(); }catch(err){ msg("#sm","File sahi nahi hai","err"); }};
}

function support(){
  $("#app").innerHTML=`<h2>Support</h2><div class="card"><p>24/7 chat support: WhatsApp par message karein.</p>
  <button onclick="window.open('https://wa.me/910000000000?text=Pump%20Saathi%20support','_blank')">WhatsApp chat khole</button>
  <p style="font-size:13px;color:#6b7280">Number ko apne WhatsApp Business number se replace karein. Call aur site visit support paid add-on hai.</p></div>`;
}

// ---- install prompt ----
let deferred=null;
window.addEventListener("beforeinstallprompt", e=>{e.preventDefault(); deferred=e;});

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});

// topbar logout
const who=$("#who"); who.style.cursor="pointer"; who.onclick=()=>{ if(session && confirm("Logout karein?")) logout(); };

render();
})();
