import {
  esc, ku, t12, CITIES, PRAYERS, METHODS, prayerTimes, iraqNow, firebaseReady, fb,
  DEFAULT_ADHKAR, DEFAULT_DUAS, DEFAULT_TIMES
} from "./core.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const show = (id, on) => { $(id).hidden = !on; };
let F, data = {duas:[], adhkar:[], times:Object.assign({}, DEFAULT_TIMES), sugg:[]};

function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800); }
const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999);

/* ---------- auth ---------- */
if(!firebaseReady) show("#noConfig", true);
else fb().then(f => {
  F = f;
  F.auth.onAuthStateChanged(F.au, async user => {
    show("#login", !user); show("#logout", !!user); show("#notAdmin", false); show("#dash", false);
    $("#who").textContent = user ? user.email : "";
    if(!user) return;
    const isAdmin = await F.fs.getDoc(F.fs.doc(F.db, "admins", user.uid)).then(d => d.exists()).catch(() => false);
    if(!isAdmin){ $("#uid").textContent = user.uid; show("#notAdmin", true); return; }
    show("#dash", true); loadAll();
  });
}).catch(() => { show("#noConfig", true); $("#noConfig p").textContent = "پەیوەندی بە Firebase نەکرا. ئینتەرنێتەکەت بپشکنە."; });

$("#loginForm").onsubmit = async e => {
  e.preventDefault(); $("#lMsg").textContent = "چاوەڕێ بکە…";
  try{ await F.auth.signInWithEmailAndPassword(F.au, $("#lEmail").value.trim(), $("#lPass").value); $("#lMsg").textContent = ""; }
  catch(err){ $("#lMsg").textContent = /invalid|wrong|not-found|credential/.test(err.code || "") ? "ئیمەیڵ یان وشەی نهێنی هەڵەیە." : "چوونەژوورەوە سەرکەوتوو نەبوو. ئینتەرنێتەکەت بپشکنە."; }
};
$("#logout").onclick = () => F.auth.signOut(F.au);
$("#copyUid").onclick = () => navigator.clipboard.writeText($("#uid").textContent).then(() => toast("کۆپی کرا"), () => {});

/* ---------- load ---------- */
async function loadAll(){
  const {fs, db} = F;
  const [d, a, t] = await Promise.all([fs.getDocs(fs.collection(db, "duas")), fs.getDocs(fs.collection(db, "adhkar")), fs.getDoc(fs.doc(db, "config", "times"))]);
  data.duas = d.docs.map(x => Object.assign({id:x.id}, x.data())).sort(byOrder);
  data.adhkar = a.docs.map(x => Object.assign({id:x.id}, x.data())).sort(byOrder);
  data.times = Object.assign({}, DEFAULT_TIMES, t.exists() ? t.data() : {});
  show("#seed", !data.duas.length || !data.adhkar.length || !t.exists());
  renderDuas(); renderAdhkar(); renderTimes(); loadSugg();
}
$("#seedBtn").onclick = async () => {
  const {fs, db} = F, b = fs.writeBatch(db);
  if(!data.duas.length) DEFAULT_DUAS.forEach(x => { const {id, ...rest} = x; b.set(fs.doc(db, "duas", id), rest); });
  if(!data.adhkar.length) DEFAULT_ADHKAR.forEach(x => { const {id, ...rest} = x; b.set(fs.doc(db, "adhkar", id), rest); });
  b.set(fs.doc(db, "config", "times"), Object.assign({}, DEFAULT_TIMES, data.times), {merge:true});
  $("#seedBtn").disabled = true;
  try{ await b.commit(); toast("ناوەڕۆکی بنەڕەتی بارکرا"); await loadAll(); }catch(e){ toast("نەکرا: " + (e.code || "هەڵە")); }
  $("#seedBtn").disabled = false;
};

/* ---------- tabs ---------- */
$$("[data-t]").forEach(b => b.onclick = () => {
  $$("[data-t]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  $$(".tabp").forEach(p => p.hidden = p.id !== "t-" + b.dataset.t);
});

/* ---------- lists ---------- */
const MODE = {me:"بەیانی و ئێوارە", m:"تەنها بەیانی", e:"تەنها ئێوارە", p:"دوای نوێژ"};
let dcat = "all";
function renderDuas(){
  const cats = [...new Set(data.duas.map(d => d.cat).filter(Boolean))];
  if(dcat !== "all" && !cats.includes(dcat)) dcat = "all";
  $("#catChips").innerHTML = [["all", "هەموو", data.duas.length], ...cats.map(c => [c, c, data.duas.filter(d => d.cat === c).length])]
    .map(([v, n, k]) => `<button aria-pressed="${v === dcat}" data-cat="${esc(v)}">${esc(n)} (${ku(k)})</button>`).join("");
  show("#catBar", dcat !== "all"); $("#catName").value = dcat === "all" ? "" : dcat;
  $("#duaRows").innerHTML = data.duas.filter(d => dcat === "all" || d.cat === dcat).map(d => `<div class="row"><span class="ord">${ku(d.order ?? "")}</span><div class="body">
    <b>${esc(d.title)} <span class="tag">${esc(d.cat || "")}</span></b><div class="ar">${esc(d.ar)}</div><small>${esc(d.src || "")}</small></div>
    <div class="acts"><button class="btn sm" data-edit="duas" data-id="${esc(d.id)}">دەستکاری</button></div></div>`).join("") || '<div class="empty">هیچ دوعایەک نییە.</div>';
}
$("#catChips").onclick = e => { const b = e.target.closest("[data-cat]"); if(b){ dcat = b.dataset.cat; renderDuas(); } };
$("#catSave").onclick = async () => {
  const name = $("#catName").value.trim(); if(!name || name === dcat) return;
  const {fs, db} = F, b = fs.writeBatch(db);
  data.duas.filter(d => d.cat === dcat).forEach(d => b.update(fs.doc(db, "duas", d.id), {cat:name}));
  try{ await b.commit(); dcat = name; toast("ناوی پۆل گۆڕدرا"); await loadAll(); }catch(err){ toast("نەکرا: " + (err.code || "هەڵە")); }
};
let adhF = "all";
function renderAdhkar(){
  $("#adhRows").innerHTML = data.adhkar.filter(x => adhF === "all" || x.mode === adhF).map(x => `<div class="row"><span class="ord">${ku(x.order ?? "")}</span><div class="body">
    <b><span class="tag">${MODE[x.mode] || x.mode}</span><span class="tag">${ku(x.n)} جار</span>${x.quran ? '<span class="tag">قورئان</span>' : ""}</b>
    <div class="ar">${esc(x.ar)}</div><small>${esc(x.src || "")}</small></div>
    <div class="acts"><button class="btn sm" data-edit="adhkar" data-id="${esc(x.id)}">دەستکاری</button></div></div>`).join("") || '<div class="empty">هیچ زیکرێک نییە.</div>';
}
$$("#adhFilter button").forEach(b => b.onclick = () => { adhF = b.dataset.f; $$("#adhFilter button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderAdhkar(); });

/* ---------- editor ---------- */
const FIELDS = {
  duas:[["title","ناونیشان","text",true],["cat","پۆل","cat",true],["ar","دەقی عەرەبی","ar",true],["ku","واتای کوردی","area",true],["src","سەرچاوە (بۆ نموونە: بوخاری)","text",false],["order","ڕیزبەندی","num",false]],
  adhkar:[["mode","کاتی خوێندن","mode",true],["n","ژمارەی دووبارەکردنەوە","num",true],["quran","دەقی قورئانییە (بە فۆنتی موسحەف نیشان بدرێت)","bool",false],
    ["ar","دەقی عەرەبی","ar",true],["arE","دەقی عەرەبی بۆ ئێواران (ئەگەر جیاوازە)","ar",false],["ku","واتای کوردی","area",false],["kuE","واتای کوردی بۆ ئێواران (ئەگەر جیاوازە)","area",false],
    ["fadl","فەزڵ و پاداشت","area",false],["src","سەرچاوە","text",false],["order","ڕیزبەندی","num",false]]
};
let ed = null;
function openEditor(col, id, prefill){
  const item = id ? data[col].find(x => x.id === id) : Object.assign({order:(data[col].length ? Math.max(...data[col].map(x => +x.order || 0)) : 0) + 1, n:1, mode:"me"}, prefill || {});
  ed = {col, id};
  $("#edTitle").textContent = (id ? "دەستکاریکردنی " : "زیادکردنی ") + (col === "duas" ? "دوعا" : "زیکر");
  const cats = [...new Set(data.duas.map(d => d.cat).filter(Boolean))];
  $("#edFields").innerHTML = FIELDS[col].map(([k, label, type, req]) => {
    const v = item[k] ?? "", fid = "f-" + k, r = req ? " required" : "";
    if(type === "area" || type === "ar") return `<label class="field" for="${fid}">${label}<textarea id="${fid}" class="${type === "ar" ? "ar" : ""}" rows="${type === "ar" ? 4 : 3}"${r}>${esc(v)}</textarea></label>`;
    if(type === "num") return `<label class="field" for="${fid}">${label}<input id="${fid}" type="number" min="${k === "n" ? 1 : 0}" max="1000" value="${esc(v)}"${r}></label>`;
    if(type === "bool") return `<label class="check" for="${fid}"><input id="${fid}" type="checkbox"${v ? " checked" : ""}>${label}</label>`;
    if(type === "mode") return `<label class="field" for="${fid}">${label}<select id="${fid}">${Object.entries(MODE).map(([m, n]) => `<option value="${m}"${m === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
    if(type === "cat") return `<label class="field" for="${fid}">${label}<input id="${fid}" list="catList" value="${esc(v)}"${r}><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>`;
    return `<label class="field" for="${fid}">${label}<input id="${fid}" value="${esc(v)}"${r}></label>`;
  }).join("");
  show("#edDelete", !!id); $("#edMsg").textContent = "";
  $("#editor").showModal();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-edit],[data-new]"); if(!b) return;
  if(b.dataset.new === "duas") openEditor("duas", null, dcat !== "all" ? {cat:dcat} : {});
  else if(b.dataset.new === "adhkar") openEditor("adhkar", null, adhF !== "all" ? {mode:adhF} : {});
  else openEditor(b.dataset.edit, b.dataset.id);
});
$("#edClose").onclick = () => $("#editor").close();
$("#edForm").onsubmit = async e => {
  e.preventDefault();
  const {fs, db} = F, out = {};
  for(const [k, , type] of FIELDS[ed.col]){
    const el = $("#f-" + k);
    out[k] = type === "num" ? (+el.value || 0) : type === "bool" ? el.checked : el.value.trim();
  }
  if(ed.col === "adhkar" && out.n < 1) out.n = 1;
  out.updatedAt = fs.serverTimestamp();
  $("#edSave").disabled = true; $("#edMsg").textContent = "پاشەکەوت دەکرێت…";
  try{
    if(ed.id) await fs.setDoc(fs.doc(db, ed.col, ed.id), out);
    else await fs.addDoc(fs.collection(db, ed.col), out);
    $("#editor").close(); toast("پاشەکەوت کرا. لە ئەپەکەدا دوای نوێکردنەوە دەردەکەوێت."); await loadAll();
  }catch(err){ $("#edMsg").textContent = "پاشەکەوت نەکرا: " + (err.code || "هەڵە"); }
  $("#edSave").disabled = false;
};
let delArm = 0;
$("#edDelete").onclick = async () => {
  if(Date.now() - delArm > 4000){ delArm = Date.now(); $("#edMsg").textContent = "بۆ دڵنیابوون دووبارە «سڕینەوە» دابگرە."; return; }
  try{ await F.fs.deleteDoc(F.fs.doc(F.db, ed.col, ed.id)); $("#editor").close(); toast("سڕایەوە"); await loadAll(); }
  catch(err){ $("#edMsg").textContent = "نەسڕایەوە: " + (err.code || "هەڵە"); }
};

/* ---------- times ---------- */
function renderTimes(){
  const t = data.times;
  $("#tMethod").innerHTML = Object.entries(METHODS).map(([k, m]) => `<option value="${k}">${m.n}</option>`).join("");
  $("#tMethod").value = t.method; $("#tAsr").value = String(t.asr); $("#tHijri").value = t.hijriOffset || 0; $("#tNote").value = t.note || "";
  $("#offRows").innerHTML = CITIES.map(c => `<tr><td>${c.n}</td>${PRAYERS.map(p => `<td><input type="number" min="-30" max="30" step="1" data-c="${c.id}" data-p="${p.k}" value="${(t.offsets?.[c.id]?.[p.k]) || 0}" aria-label="${c.n} ${p.n}"></td>`).join("")}</tr>`).join("");
  preview();
}
function readTimes(){
  const offsets = {};
  $$("#offRows input").forEach(i => { const v = Math.max(-30, Math.min(30, +i.value || 0)); if(v){ (offsets[i.dataset.c] ||= {})[i.dataset.p] = v; } });
  return {method:$("#tMethod").value, asr:+$("#tAsr").value, hijriOffset:Math.max(-2, Math.min(2, +$("#tHijri").value || 0)), note:$("#tNote").value.trim(), offsets};
}
function preview(){
  const cfg = readTimes(), c = CITIES[0], t = prayerTimes(iraqNow(), Object.assign({offId:c.id}, c), cfg);
  $("#tPreview").innerHTML = `<b>پێشبینینی ئەمڕۆ بۆ ${c.n}:</b> ` + PRAYERS.map(p => `${p.n} ${t12(t[p.k], false)}`).join(" · ");
}
$("#t-times").addEventListener("input", preview);
$("#t-times").addEventListener("change", preview);
$("#saveTimes").onclick = async () => {
  const {fs, db} = F;
  $("#saveTimes").disabled = true; $("#tMsg").textContent = "پاشەکەوت دەکرێت…";
  try{ await fs.setDoc(fs.doc(db, "config", "times"), Object.assign(readTimes(), {updatedAt:fs.serverTimestamp()})); $("#tMsg").textContent = "پاشەکەوت کرا ✓"; data.times = readTimes(); }
  catch(err){ $("#tMsg").textContent = "پاشەکەوت نەکرا: " + (err.code || "هەڵە"); }
  $("#saveTimes").disabled = false;
};

/* ---------- suggestions ---------- */
let sgF = "new";
async function loadSugg(){
  const {fs, db} = F;
  const snap = await fs.getDocs(fs.query(fs.collection(db, "suggestions"), fs.orderBy("createdAt", "desc"), fs.limit(300)));
  data.sugg = snap.docs.map(x => Object.assign({id:x.id}, x.data()));
  renderSugg();
}
function renderSugg(){
  const n = data.sugg.filter(s => s.status === "new").length;
  $("#sgCount").hidden = !n; $("#sgCount").textContent = ku(n);
  $("#sgRows").innerHTML = data.sugg.filter(s => sgF === "all" || s.status === sgF).map(s => {
    const when = s.createdAt?.toDate ? s.createdAt.toDate() : null;
    return `<div class="row"><div class="body"><b><span class="tag">${esc(s.type)}</span>${s.status === "new" ? '<span class="tag">نوێ</span>' : ""}</b>
      <p>${esc(s.text)}</p><small>${esc(s.name || "بێناو")}${s.contact ? " · " + esc(s.contact) : ""}${when ? " · " + ku(when.toLocaleString("en-GB", {dateStyle:"short", timeStyle:"short"})) : ""}</small></div>
      <div class="acts">${s.type.startsWith("دوعا") ? `<button class="btn sm" data-todua="${esc(s.id)}">بیکە بە دوعا</button>` : ""}
      ${s.status === "new" ? `<button class="btn sm" data-seen="${esc(s.id)}">بینرا</button>` : ""}<button class="btn sm danger" data-del="${esc(s.id)}">سڕینەوە</button></div></div>`;
  }).join("") || '<div class="empty">هیچ پێشنیارێک نییە.</div>';
}
$$("#sgFilter button").forEach(b => b.onclick = () => { sgF = b.dataset.f; $$("#sgFilter button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderSugg(); });
$("#sgRows").onclick = async e => {
  const {fs, db} = F, b = e.target.closest("button"); if(!b) return;
  try{
    if(b.dataset.seen){ await fs.updateDoc(fs.doc(db, "suggestions", b.dataset.seen), {status:"done"}); }
    else if(b.dataset.del){
      if(b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "دڵنیایت؟"; return; }
      await fs.deleteDoc(fs.doc(db, "suggestions", b.dataset.del));
    } else if(b.dataset.todua){
      const s = data.sugg.find(x => x.id === b.dataset.todua);
      openEditor("duas", null, {ar:s.text, src:""}); return;
    }
    await loadSugg();
  }catch(err){ toast("نەکرا: " + (err.code || "هەڵە")); }
};
