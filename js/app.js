import {
  store, ku, fromKu, pad, esc, t12, gdate, hijri, hijriYMD, GM, HM, CITIES, PRAYERS, METHODS, place, iraqNow, prayerTimes, nextPrayer,
  qiblaBearing, distKm, sunQiblaTime, cachedContent, refreshContent, firebaseReady, sendSuggestion, WD, tableId
} from "./core.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let content = cachedContent();
const cfg = () => content.times;

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, action){
  const t = $("#toast");
  t.innerHTML = esc(msg) + (action ? ` <button>${esc(action.label)}</button>` : "");
  if(action) t.querySelector("button").onclick = action.run;
  t.hidden = false; clearTimeout(toastTimer);
  if(!action) toastTimer = setTimeout(() => t.hidden = true, 3200);
}

/* ---------- theme ---------- */
function applyTheme(v){
  if(v === "light" || v === "dark") document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  $$("#sTheme button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === (v || "auto"))));
}

/* ================= PRAYER TIMES ================= */
const PICON = {
  fajr:'<svg viewBox="0 0 24 24"><path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 8V5M5.6 11.6 4 10M18.4 11.6 20 10"/></svg>',
  sunrise:'<svg viewBox="0 0 24 24"><path d="M3 19h18M7 19a5 5 0 0 1 10 0"/><path d="M12 4v6m-3-3 3-3 3 3"/></svg>',
  dhuhr:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  asr:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="3.5"/><path d="M10 3v1.5M3 10h1.5M5 5l1 1M15 5l-1 1"/><path d="M8.5 19a3.5 3.5 0 0 1 .4-7 4.5 4.5 0 0 1 8.6 1.3A3 3 0 0 1 17 19Z"/></svg>',
  maghrib:'<svg viewBox="0 0 24 24"><path d="M3 18h18M7 18a5 5 0 0 1 10 0"/><path d="M12 4v6m-3-3 3 3 3-3"/></svg>',
  isha:'<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>'
};
let lastSig = "";
function renderHome(force){
  const now = iraqNow(), c = place(), n = nextPrayer(now, c, cfg()), t = n.today;
  const sig = c.n + n.k + n.day + now.getDate() + JSON.stringify(cfg());
  if(force || sig !== lastSig){
    lastSig = sig;
    $("#placeName").textContent = c.id === "gps" ? `${c.n} · نزیک ${c.near}` : c.n;
    $("#plist").innerHTML = PRAYERS.map(p => {
      const isNext = n.day === 0 && n.k === p.k, cls = [p.k];
      if(isNext) cls.push("next"); else if(t[p.k] < now || n.day) cls.push("past");
      return `<li class="${cls.join(" ")}"><span class="p-ic">${PICON[p.k]}</span><span class="p-n"><b>${p.n}${isNext ? '<span class="pill">داهاتوو</span>' : ""}</b><span>${p.ar}</span></span><span class="p-t num">${t12(t[p.k])}</span></li>`;
    }).join("");
    $("#greg").textContent = gdate(now);
    $("#hijri").textContent = hijri(now, cfg().hijriOffset);
    $("#nextName").textContent = n.n;
    $("#nextAt").innerHTML = `${n.day ? "سبەینێ، " : ""}کاتژمێر ${t12(n.at)}`;
    const m = METHODS[cfg().method] || METHODS.MWL;
    $("#methodNote").textContent = (tableId(c)
      ? `سەرچاوە: خشتەی کاتەکانی بانگی ${c.id === "gps" ? c.near : c.n} (کەناڵی ئامۆژگاری)`
      : `حیسابی ئەستێرەناسی: ${m.n} · عەسر: ${+cfg().asr === 2 ? "حەنەفی" : "شافیعی"}`) + ` · کاتی عێراق (UTC+3)${cfg().note ? " · " + cfg().note : ""}`;
    renderMonth();
    renderToolSubs();
    renderBanners(now, t);
    renderAotd();
  }
  // countdown
  let s = Math.max(0, Math.floor((n.at - now) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600; const mi = Math.floor(s / 60); s -= mi * 60;
  $("#countdown").textContent = ku(`${pad(h)}:${pad(mi)}:${pad(s)}`);
  tickRamadan(now, t);
  // sun/moon position on the arc
  const sky = $("#sky");
  const day = now >= t.sunrise && now < t.maghrib;
  sky.classList.toggle("night", !day);
  let f;
  if(day) f = (now - t.sunrise) / (t.maghrib - t.sunrise);
  else {
    const prevM = now >= t.maghrib ? t.maghrib : new Date(t.maghrib.getTime() - 864e5);
    const nextS = now >= t.maghrib ? new Date(t.sunrise.getTime() + 864e5) : t.sunrise;
    f = (now - prevM) / (nextS - prevM);
  }
  f = Math.min(1, Math.max(0, f));
  const u = 1 - f, x = u * u * 304 + 2 * u * f * 160 + f * f * 16, y = u * u * 112 + 2 * u * f * -26 + f * f * 112;
  $("#sunDot").setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
}
function renderMonth(){
  if(!$("#monthBox").open) return;
  const base = iraqNow(), c = place(); let html = "";
  for(let i = 0; i < 30; i++){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12), t = prayerTimes(d, c, cfg());
    html += `<tr${i === 0 ? ' class="today"' : ""}><td>${WD[d.getDay()]} ${ku(d.getDate())}/${ku(d.getMonth() + 1)}</td>${PRAYERS.map(p => `<td class="num">${t12(t[p.k], false)}</td>`).join("")}</tr>`;
  }
  $("#monthBody").innerHTML = html;
}
$("#monthBox").addEventListener("toggle", renderMonth);

/* ================= QURAN ================= */
let Q = null, META = null, START = [];
const BASM = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";
const norm = s => String(s).replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "").replace(/[ٱأإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ىی]/g, "ي").replace(/ک/g, "ك").toLowerCase();
function loadQuran(){
  if(Q) return Promise.resolve();
  return Promise.all([fetch("data/quran.json").then(r => r.json()), fetch("data/meta.json").then(r => r.json())]).then(([q, m]) => {
    Q = q; META = m; let acc = 1;
    START = Q.map(s => { const v = acc; acc += s[3].length; return v; }); START.push(acc);
  });
}
const surahOf = id => { let lo = 0, hi = 113; while(lo < hi){ const mid = (lo + hi + 1) >> 1; if(START[mid] <= id) lo = mid; else hi = mid - 1; } return lo; };
const pageOf = id => { let lo = 0, hi = 603; while(lo < hi){ const mid = (lo + hi + 1) >> 1; if(META.pages[mid] <= id) lo = mid; else hi = mid - 1; } return lo + 1; };
const juzOf = id => { let j = 0; while(j < 29 && META.juz[j + 1] <= id) j++; return j + 1; };
let qtab = "surah", NQ = null;
const verseRow = id => { const s = surahOf(id), a = id - START[s] + 1, t = Q[s][3][a - 1];
  return `<button class="srow" data-page="${pageOf(id)}" data-hl="${id}"><span class="sno num">${ku(a)}</span><span class="smid"><b>${esc(Q[s][0])} · ئایەتی ${ku(a)}</b><small class="vprev">${esc(t.length > 90 ? t.slice(0, 90) + "…" : t)}</small></span></button>`; };
function renderIndex(){
  const qs = $("#qSearch").value.trim(), n = +fromKu(qs);
  let rows = "";
  if(n && n >= 1 && n <= 604) rows += `<button class="srow" data-page="${n}"><span class="sno num">${ku(n)}</span><span class="smid"><b>بڕۆ بۆ لاپەڕەی ${ku(n)}</b><small>${esc(Q[surahOf(META.pages[n - 1])][0])}</small></span></button>`;
  if(qtab === "surah"){
    const nq = norm(qs);
    rows += Q.map((s, i) => ({s, i})).filter(({s, i}) => !qs || n === i + 1 || norm(s[0]).includes(nq) || s[1].toLowerCase().includes(nq))
      .map(({s, i}) => `<button class="srow" data-page="${pageOf(START[i])}" data-sura="${i}"><span class="sno num">${ku(i + 1)}</span><span class="smid"><b>${esc(s[0])}</b><small>${s[2] ? "مەککی" : "مەدەنی"} · ${ku(s[3].length)} ئایەت · لاپەڕە ${ku(pageOf(START[i]))}</small></span></button>`).join("");
    // word search through the whole Quran (diacritics ignored)
    if(nq.length >= 3 && !n){
      NQ = NQ || Q.flatMap(x => x[3].map(norm));
      const hits = []; NQ.forEach((t, i) => { if(t.includes(nq)) hits.push(i + 1); });
      rows += `<div class="shead">${hits.length ? `${ku(hits.length)} ئایەت ئەم وشەیەیان تێدایە${hits.length > 60 ? " (یەکەم ٦٠)" : ""}` : "لە ئایەتەکاندا نەدۆزرایەوە"}</div>`;
      rows += hits.slice(0, 60).map(verseRow).join("");
    }
  } else if(qtab === "marks"){
    rows += marks.length ? marks.map(verseRow).join("") : '<div class="empty">هیچ ئایەتێکت نیشان نەکردووە.<br><small>لە کاتی خوێندنەوەدا کلیک لە ئایەتێک بکە و «نیشانکردن» هەڵبژێرە.</small></div>';
  } else {
    rows += META.juz.map((id, j) => { const s = surahOf(id), a = id - START[s] + 1, p = pageOf(id);
      return `<button class="srow" data-page="${p}"><span class="sno num">${ku(j + 1)}</span><span class="smid"><b>جوزئی ${ku(j + 1)}</b><small>${esc(Q[s][0])}، ئایەتی ${ku(a)} · لاپەڕە ${ku(p)}</small></span></button>`; }).join("");
  }
  $("#slist").innerHTML = rows || '<div class="empty">هیچ ئەنجامێک نەدۆزرایەوە.</div>';
  const last = store.get("q.page", 0);
  const cont = $("#qContinue");
  if(last){ const s = surahOf(META.pages[last - 1]);
    cont.hidden = false; cont.dataset.page = last;
    cont.innerHTML = `<span><b>بەردەوامبوون لە خوێندنەوە</b><small>${esc(Q[s][0])} · لاپەڕە ${ku(last)} · جوزئی ${ku(juzOf(META.pages[last - 1]))}</small></span><span class="cn">${esc(Q[s][0])}</span>`;
  } else cont.hidden = true;
  quranSub();
  renderKhatm();
}
$$("[data-qtab]").forEach(b => b.onclick = () => { qtab = b.dataset.qtab; $$("[data-qtab]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderIndex(); });
$("#qSearch").oninput = () => Q && renderIndex();
$("#slist").onclick = e => { const b = e.target.closest("[data-page]"); if(b) openReader(+b.dataset.page, b.dataset.hl ? +b.dataset.hl : b.dataset.sura != null ? START[+b.dataset.sura] : null); };
$("#qContinue").onclick = () => openReader(+$("#qContinue").dataset.page);

let page = 1, wake = null;
function renderPage(hl){
  const from = META.pages[page - 1], to = page < 604 ? META.pages[page] - 1 : 6236;
  let html = "", run = [];
  const flush = () => { if(run.length){ html += `<div class="q">${run.join(" ")}</div>`; run = []; } };
  for(let id = from; id <= to; id++){
    const s = surahOf(id), a = id - START[s] + 1;
    if(a === 1){
      flush();
      html += `<div class="s-head">سُورَةُ ${esc(Q[s][0])}</div>`;
      if(s !== 0 && s !== 8) html += `<div class="basm">${BASM}</div>`;
    }
    run.push(`<span class="v${id === hl ? " hl" : ""}${marks.includes(id) ? " mk" : ""}" data-id="${id}">${Q[s][3][a - 1]} ${ku(a)}</span>`);
  }
  flush();
  const s0 = surahOf(from);
  $("#rPage").innerHTML = `<div class="page-in"><div class="page-h"><span>${esc(Q[s0][0])}</span><span>جوزئی ${ku(juzOf(from))}</span></div>${html}<div class="page-f">${ku(page)}</div></div>`;
  $("#rSurah").textContent = Q[s0][0];
  $("#rJuz").textContent = `جوزئی ${ku(juzOf(from))} · لاپەڕە ${ku(page)}`;
  $("#rPg").value = ku(page);
  $("#rPrev").disabled = page <= 1; $("#rNext").disabled = page >= 604;
  store.set("q.page", page);
  trackPage(page);
  if(hl){ const el = $("#rPage .v.hl"); if(el){ setTimeout(() => el.scrollIntoView({block:"center"}), 30); setTimeout(() => el.classList.remove("hl"), 1800); } } else $("#rStage").scrollTop = 0;
}
// Tap an ayah: bookmark it, share it as an image, or copy it.
let marks = store.get("q.marks", []), vsel = null;
$("#rPage").addEventListener("click", e => {
  const v = e.target.closest(".v"); if(!v) return;
  $$("#rPage .v.sel").forEach(x => x.classList.remove("sel")); v.classList.add("sel");
  vsel = +v.dataset.id; const s = surahOf(vsel), a = vsel - START[s] + 1;
  $("#vbTitle").textContent = `سورەتی ${Q[s][0]}، ئایەتی ${ku(a)}`;
  $("#vbMark").textContent = marks.includes(vsel) ? "لابردنی نیشان" : "نیشانکردن";
  $("#vbar").hidden = false;
});
function closeVbar(){ $("#vbar").hidden = true; $$("#rPage .v.sel").forEach(x => x.classList.remove("sel")); vsel = null; }
$("#vbar").onclick = async e => {
  const b = e.target.closest("[data-va]"); if(!b || vsel == null) return;
  const id = vsel, s = surahOf(id), a = id - START[s] + 1, act = b.dataset.va;
  if(act === "mark"){
    const on = !marks.includes(id);
    marks = on ? [...marks, id].sort((x, y) => x - y) : marks.filter(x => x !== id); store.set("q.marks", marks);
    $(`#rPage .v[data-id="${id}"]`)?.classList.toggle("mk", on); toast(on ? "ئایەتەکە نیشان کرا" : "نیشانەکە لابرا");
  } else if(act === "img") shareCard({title:`سورەتی ${Q[s][0]} · ئایەتی ${ku(a)}`, ar:`${Q[s][3][a - 1]} ﴿${ku(a)}﴾`, quran:true, src:"قورئانی پیرۆز"});
  else if(act === "copy"){ try{ await navigator.clipboard.writeText(`${Q[s][3][a - 1]} ﴿${a}﴾\n(سورەتی ${Q[s][0]}، ئایەتی ${a})`); toast("کۆپی کرا"); }catch(_){ toast("کۆپی نەکرا"); } }
  closeVbar();
};
function go(p, hl){ closeVbar(); page = Math.max(1, Math.min(604, p)); renderPage(hl); }
async function openReader(p, hl){
  await loadQuran();
  $("#reader").hidden = false; document.body.style.overflow = "hidden";
  if(location.hash !== "#read") history.pushState(null, "", "#read");
  go(p || store.get("q.page", 1), hl);
  try{ wake = await navigator.wakeLock?.request("screen"); }catch(_){ wake = null; }
}
function closeReader(){
  closeVbar();
  $("#reader").hidden = true; document.body.style.overflow = "";
  try{ wake?.release(); }catch(_){} wake = null;
  if(Q) renderIndex();
}
$("#rClose").onclick = () => { if(location.hash === "#read") history.back(); else { closeReader(); route(); } };
$("#rPrev").onclick = () => go(page - 1);
$("#rNext").onclick = () => go(page + 1);
$("#rPg").onchange = e => { const v = +fromKu(e.target.value); if(v) go(v); else e.target.value = ku(page); };
$("#rFont").onclick = () => $("#rFontBar").hidden = !$("#rFontBar").hidden;
const qsize = store.get("q.size", innerWidth < 420 ? 23 : 27);
document.documentElement.style.setProperty("--qsize", qsize + "px");
$("#rSize").value = qsize;
$("#rSize").oninput = e => { document.documentElement.style.setProperty("--qsize", e.target.value + "px"); store.set("q.size", +e.target.value); };
// Mushaf page turning: swipe right (finger moves toward the right) = next page, as in an Arabic book
let tx = 0, ty = 0;
$("#rStage").addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, {passive:true});
$("#rStage").addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(page + (dx > 0 ? 1 : -1));
}, {passive:true});
addEventListener("keydown", e => {
  if($("#reader").hidden || e.target.tagName === "INPUT") return;
  if(e.key === "ArrowLeft") go(page + 1); else if(e.key === "ArrowRight") go(page - 1);
});

/* ================= QIBLA ================= */
let heading = null, aligned = false, sensorOn = false;
function buildRose(){
  let s = `<circle r="150" class="rose-bg"/><circle r="143" class="rose-ring"/><circle r="100" fill="none" stroke="var(--line)" stroke-dasharray="2 6"/>`;
  for(let a = 0; a < 360; a += 5){
    const big = a % 30 === 0, r1 = big ? 126 : 133;
    s += `<line y1="-${r1}" y2="-141" stroke="${big ? "var(--ink)" : "var(--muted)"}" stroke-width="${big ? 2 : 1}" transform="rotate(${a})"/>`;
  }
  [["باکوور", 0], ["ڕۆژهەڵات", 90], ["باشوور", 180], ["ڕۆژئاوا", 270]].forEach(([t, a]) => {
    s += `<text transform="rotate(${a}) translate(0,-109) rotate(${-a})" text-anchor="middle" dominant-baseline="middle" font-size="${a ? 12 : 14}" font-weight="700" fill="${a ? "var(--muted)" : "#d0473a"}" stroke="none" font-family="IBM Plex Sans Arabic,sans-serif">${t}</text>`;
  });
  s += `<g id="kaaba"><line y1="0" y2="-74" stroke="var(--gold)" stroke-width="4" stroke-linecap="round"/>
        <g transform="translate(0,-90)"><rect x="-13" y="-13" width="26" height="26" rx="2.5" fill="#111" stroke="none"/><rect x="-13" y="-6.5" width="26" height="4" fill="var(--gold)" stroke="none"/></g></g>
        <circle r="8" fill="var(--gold)" stroke="none"/><circle r="3.2" fill="var(--surface)" stroke="none"/>`;
  $("#rose").innerHTML = s;
}
function renderQibla(){
  const c = place(), qb = qiblaBearing(c);
  $("#qibPlace").textContent = c.id === "gps" ? "بە پێی شوێنی ئێستات" : `بۆ ${c.n}`;
  $("#qDeg").innerHTML = ku(Math.round(qb)) + "<small>°</small>";
  $("#qDist").innerHTML = ku(Math.round(distKm(c)).toLocaleString("en")).replace(/,/g, "٬") + "<small> کم</small>";
  const st = sunQiblaTime(c, qb); $("#qSun").innerHTML = st ? t12(st) : "—";
  $("#kaaba")?.setAttribute("transform", `rotate(${qb})`);
  updateCompass();
}
function updateCompass(){
  const qb = qiblaBearing(place());
  $("#rose").style.transform = heading == null ? "" : `rotate(${-heading}deg)`;
  if(heading == null) return;
  const diff = ((qb - heading + 540) % 360) - 180, ok = Math.abs(diff) <= 4;
  $("#compass").classList.toggle("aligned", ok);
  $("#qStatus").textContent = ok ? "ڕووت لە قیبلەیە ✓" : diff > 0 ? `بە ئاراستەی کاتژمێر بسووڕێوە (${ku(Math.round(Math.abs(diff)))}°)` : `بە پێچەوانەی کاتژمێر بسووڕێوە (${ku(Math.round(Math.abs(diff)))}°)`;
  if(ok && !aligned) try{ navigator.vibrate?.(60); }catch(_){}
  aligned = ok;
}
let sx = 0, sy = 0, lastAbs = 0;
function onOrient(e){
  let h = null;
  if(typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
  else if(e.alpha != null && (e.absolute || e.type === "deviceorientationabsolute")){ h = 360 - e.alpha; lastAbs = Date.now(); }
  else return;
  if(e.type === "deviceorientation" && Date.now() - lastAbs < 1000 && e.webkitCompassHeading == null) return;
  h = (h + (screen.orientation?.angle || 0) + 360) % 360;
  // smooth on the unit circle so 359° → 1° does not spin
  sx = sx * .8 + Math.cos(h * Math.PI / 180) * .2; sy = sy * .8 + Math.sin(h * Math.PI / 180) * .2;
  heading = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
  sensorOn = true; updateCompass();
}
$("#qStart").onclick = async () => {
  try{
    if(typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function"){
      const r = await DeviceOrientationEvent.requestPermission();
      if(r !== "granted"){ $("#qStatus").textContent = "ڕێگەت نەدا بە هەستەوەر. لە ڕێکخستنی وێبگەڕەکە ڕێگەی Motion & Orientation بدە."; return; }
    }
  }catch(_){}
  addEventListener("deviceorientationabsolute", onOrient); addEventListener("deviceorientation", onOrient);
  $("#qStart").hidden = true; $("#qStatus").textContent = "چاوەڕێی هەستەوەری قیبلەنما…";
  setTimeout(() => { if(!sensorOn){ $("#qStatus").textContent = "ئەم مۆبایلە هەستەوەری قیبلەنمای نییە یان ڕێگەی پێنەدراوە. ژمارەی پلە یان کاتی خۆری قیبلە بەکاربهێنە."; $("#qStart").hidden = false; } }, 3500);
};

/* ================= ADHKAR ================= */
let mode = (() => { const n = iraqNow(), t = prayerTimes(n, place(), cfg()); return (n >= t.asr || n < t.fajr) ? "e" : "m"; })();
const dayKey = () => { const d = iraqNow(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let counts = store.get("counts", {}); if(counts.day !== dayKey()) counts = {day:dayKey()};
const items = () => content.adhkar.filter(x => mode === "p" ? x.mode === "p" : (x.mode === "me" || x.mode === mode));
const C = 2 * Math.PI * 14;
const ringHTML = (c, n) => `<svg class="ring" viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="14"/><circle class="fg" cx="17" cy="17" r="14" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - c / n)).toFixed(2)}" transform="rotate(-90 17 17)"/></svg>`;
function counterLabel(c, n){ return c >= n ? "✓ تەواو" : (n === 1 ? "یەک جار" : `${ku(n - c)} جار ماوە`); }
function renderAdhkar(){
  $$("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("#adhTitle").textContent = {m:"ئەزکاری بەیانیان", e:"ئەزکاری ئێواران", p:"ئەزکاری دوای نوێژ"}[mode];
  $("#adhList").innerHTML = items().map(x => {
    const key = mode + ":" + x.id, c = Math.min(counts[key] || 0, x.n), done = c >= x.n;
    const ar = (mode === "e" && x.arE) ? x.arE : x.ar, kt = (mode === "e" && x.kuE) ? x.kuE : x.ku;
    return `<article class="card${done ? " done" : ""}" data-key="${esc(key)}" data-n="${x.n}">
      <div class="ar${x.quran ? " quran" : ""}" lang="ar">${esc(ar)}</div>
      ${x.fadl ? `<div class="fadl">${esc(x.fadl)}</div>` : ""}
      ${kt ? `<div class="ku">${esc(kt)}</div>` : ""}
      <div class="foot"><span class="src">${esc(x.src || "")}</span>
        <button class="counter" aria-label="ژماردن">${ringHTML(c, x.n)}<span>${counterLabel(c, x.n)}</span></button></div></article>`;
  }).join("") || '<div class="empty">هیچ زیکرێک نییە.</div>';
  progress();
}
function progress(){
  const it = items(); const done = it.filter(x => (counts[mode + ":" + x.id] || 0) >= x.n).length;
  $("#adhProg").textContent = `${ku(done)} لە ${ku(it.length)} تەواو بووە`;
  $("#adhBar").style.width = (it.length ? done / it.length * 100 : 0) + "%";
  $("#qkAdhkarT").textContent = {m:"ئەزکاری بەیانیان", e:"ئەزکاری ئێواران", p:"ئەزکاری دوای نوێژ"}[mode];
  $("#qkAdhkarSub").textContent = `${ku(done)} لە ${ku(it.length)} تەواو بووە`;
}
$$("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; renderAdhkar(); });
$("#adhList").addEventListener("click", e => {
  const btn = e.target.closest(".counter"); if(!btn) return;
  const card = btn.closest(".card"), key = card.dataset.key, n = +card.dataset.n;
  if(counts.day !== dayKey()) counts = {day:dayKey()};
  const c = Math.min(n, (counts[key] || 0) + 1); counts[key] = c; store.set("counts", counts);
  try{ navigator.vibrate?.(c >= n ? [30, 50, 30] : 10); }catch(_){}
  btn.innerHTML = ringHTML(c, n) + `<span>${counterLabel(c, n)}</span>`;
  card.classList.toggle("done", c >= n); progress();
});
$("#adhReset").onclick = () => { Object.keys(counts).forEach(k => { if(k.startsWith(mode + ":")) delete counts[k]; }); store.set("counts", counts); renderAdhkar(); };

/* ================= DUAS ================= */
let dcat = "هەموو";
const nrm = s => String(s).replace(/[ً-ٰٟ]/g, "").toLowerCase();
function renderDuas(){
  const cats = ["هەموو", ...new Set(content.duas.map(d => d.cat).filter(Boolean))];
  if(!cats.includes(dcat)) dcat = "هەموو";
  $("#dCats").innerHTML = cats.map(c => `<button aria-pressed="${c === dcat}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  const q = nrm($("#dSearch").value.trim());
  const list = content.duas.filter(d => (dcat === "هەموو" || d.cat === dcat) && (!q || nrm(d.title + " " + d.ar + " " + d.ku).includes(q)));
  $("#dList").innerHTML = list.map(d => `<article class="card" data-id="${esc(d.id)}">
    <h3>${esc(d.title)}</h3><div class="ar" lang="ar">${esc(d.ar)}</div><div class="ku">${esc(d.ku)}</div>
    <div class="foot"><span class="src">${esc(d.src || "")}</span><span class="acts"><button class="mini img">وەک وێنە</button><button class="mini share">${navigator.share ? "ناردن" : "کۆپی"}</button></span></div></article>`).join("")
    || '<div class="empty">هیچ دوعایەک نەدۆزرایەوە.</div>';
}
$("#dCats").onclick = e => { const b = e.target.closest("button"); if(b){ dcat = b.dataset.c; renderDuas(); } };
$("#dSearch").oninput = renderDuas;
$("#dList").onclick = async e => {
  const b = e.target.closest(".share, .img"); if(!b) return;
  const d = content.duas.find(x => x.id === b.closest(".card").dataset.id); if(!d) return;
  if(b.classList.contains("img")){ shareCard({title:d.title, ar:d.ar, ku:d.ku, src:d.src}); return; }
  const text = `${d.title}\n\n${d.ar}\n\n${d.ku}\n\n(${d.src || ""}) · یاوەری نوێژ`;
  if(navigator.share){ try{ await navigator.share({text}); }catch(_){} return; }
  try{ await navigator.clipboard.writeText(text); toast("کۆپی کرا"); }catch(_){ toast("کۆپی نەکرا"); }
};

/* ================= TOOLS: shared helpers ================= */
const isoKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysBack = n => { const t = iraqNow(); return Array.from({length:n}, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - i, 12)); };
const dayLabel = (d, i) => i === 0 ? "ئەمڕۆ" : i === 1 ? "دوێنێ" : `${WD[d.getDay()]} ${ku(d.getDate())}`;
const fmt = (n, dp = 0) => ku(n.toLocaleString("en", {maximumFractionDigits:dp})).replace(/,/g, "٬").replace(/\./g, "٫");
const parseNum = s => +fromKu(String(s)).replace(/[,٬\s]/g, "").replace(/٫/g, ".") || 0;
const keepRecent = (log, days) => { const cut = isoKey(daysBack(days)[days - 1]); for(const k in log) if(k < cut) delete log[k]; return log; };
function renderToolSubs(){
  const tb = tbLog[isoKey(iraqNow())] || {}, total = Object.values(tb).reduce((a, b) => a + b, 0);
  $("#tkTasbih").textContent = total ? `ئەمڕۆ ${ku(total)}` : "ژمێرەری زیکر";
  const s = streak(), today = (lg[isoKey(iraqNow())] || []).filter(Boolean).length;
  $("#tkLog").textContent = s ? `زنجیرە: ${ku(s)} ڕۆژ` : `ئەمڕۆ ${ku(today)} لە ٥`;
}

/* ================= TASBIH ================= */
const DHIKR = [
  {ar:"سُبْحَانَ اللَّهِ", n:"سبحان الله"},
  {ar:"الْحَمْدُ لِلَّهِ", n:"الحمد لله"},
  {ar:"اللَّهُ أَكْبَرُ", n:"الله أكبر"},
  {ar:"لَا إِلَٰهَ إِلَّا اللَّهُ", n:"لا إله إلا الله"},
  {ar:"أَسْتَغْفِرُ اللَّهَ", n:"أستغفر الله"},
  {ar:"سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", n:"سبحان الله وبحمده"},
  {ar:"لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ", n:"لا حول ولا قوة إلا بالله"},
  {ar:"اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ", n:"صلوات"}
];
let tb = Object.assign({d:0, t:33, c:0, r:0}, store.get("tb", {}));
let tbLog = store.get("tb.log", {});
const TB_C = 2 * Math.PI * 54;
function renderTasbih(){
  if(!DHIKR[tb.d]) tb.d = 0;
  $("#tbDhikr").innerHTML = DHIKR.map((x, i) => `<button aria-pressed="${i === tb.d}" data-i="${i}">${esc(x.n)}</button>`).join("");
  $$("#tbTarget button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.t === tb.t)));
  $("#tbAr").textContent = DHIKR[tb.d].ar;
  renderTbCount(); renderTbLog();
}
function renderTbLog(){
  const days = daysBack(7), totals = days.map(d => Object.values(tbLog[isoKey(d)] || {}).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  $("#tbLog").innerHTML = days.map((d, i) => `<div class="row"><span>${dayLabel(d, i)}</span><i style="width:${(totals[i] / max * 100).toFixed(1)}%"></i><b class="num">${ku(totals[i])}</b></div>`).join("");
  $("#tbToday").textContent = `ئەمڕۆ ${ku(totals[0])} زیکر`;
}
function renderTbCount(){
  $("#tbN").textContent = ku(tb.c);
  $("#tbOf").textContent = tb.t ? `لە ${ku(tb.t)}` : "";
  $("#tbRounds").textContent = tb.r ? `${ku(tb.r)} خول تەواو بووە` : "";
  const ring = $("#tbRing");
  ring.setAttribute("stroke-dasharray", TB_C.toFixed(2));
  ring.setAttribute("stroke-dashoffset", (TB_C * (1 - (tb.t ? tb.c / tb.t : (tb.c % 100) / 100))).toFixed(2));
}
$("#tbDhikr").onclick = e => { const b = e.target.closest("button"); if(!b) return; tb.d = +b.dataset.i; tb.c = 0; tb.r = 0; store.set("tb", tb); renderTasbih(); };
$("#tbTarget").onclick = e => { const b = e.target.closest("button"); if(!b) return; tb.t = +b.dataset.t; tb.c = 0; tb.r = 0; store.set("tb", tb); renderTasbih(); };
$("#tbBtn").onclick = () => {
  if(tb.t && tb.c >= tb.t) tb.c = 0;
  tb.c++;
  const k = isoKey(iraqNow()), day = tbLog[k] || (tbLog[k] = {});
  day[tb.d] = (day[tb.d] || 0) + 1;
  const done = tb.t && tb.c === tb.t;
  if(done){ tb.r++; toast("خولێک تەواو بوو"); }
  try{ navigator.vibrate?.(done ? [40, 60, 40] : 12); }catch(_){}
  store.set("tb", tb); store.set("tb.log", keepRecent(tbLog, 60));
  renderTbCount(); renderTbLog(); renderToolSubs();
};
$("#tbReset").onclick = () => { tb.c = 0; tb.r = 0; store.set("tb", tb); renderTasbih(); };

/* ================= PRAYER LOG ================= */
const LP = PRAYERS.filter(p => !p.sun);
let lg = store.get("pray.log", {});
let qada = store.get("pray.qada", {});
const full = k => (lg[k] || []).filter(Boolean).length === 5;
// Consecutive days with all five prayers marked; today counts once it is complete.
function streak(){
  const days = daysBack(400); let i = full(isoKey(days[0])) ? 0 : 1, n = 0;
  while(i < days.length && full(isoKey(days[i]))){ n++; i++; }
  return n;
}
function toggleLog(k, i){
  const a = lg[k] || [0, 0, 0, 0, 0]; a[i] = a[i] ? 0 : 1; lg[k] = a;
  store.set("pray.log", keepRecent(lg, 400));
  try{ navigator.vibrate?.(10); }catch(_){}
  renderLog();
}
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function renderLog(){
  const days = daysBack(7), tk = isoKey(days[0]), today = lg[tk] || [];
  const s = streak();
  $("#lgStreak").innerHTML = `<span class="big num">${ku(s)}</span><span><b>ڕۆژ بە دوای یەکدا</b><small>${s ? "هەر پێنج نوێژەکەت کردووە. بەردەوام بە!" : "هەر پێنج نوێژی ئەمڕۆ نیشان بکە بۆ دەستپێکردنی زنجیرەکەت."}</small></span>`;
  $("#lgSub").textContent = `ئەمڕۆ ${ku(today.filter(Boolean).length)} لە ٥`;
  $("#lgToday").innerHTML = LP.map((p, i) => `<button class="lg-p" data-i="${i}" aria-pressed="${!!today[i]}"><span class="dot">${CHECK}</span>${p.n}</button>`).join("");
  $("#lgWeek").innerHTML = days.map((d, j) => { const k = isoKey(d), a = lg[k] || [];
    return `<tr${j === 0 ? ' class="today"' : ""}><td>${dayLabel(d, j)}</td>${LP.map((p, i) => `<td><button data-k="${k}" data-i="${i}" aria-pressed="${!!a[i]}" aria-label="${p.n}، ${dayLabel(d, j)}"></button></td>`).join("")}</tr>`; }).join("");
  const total = LP.reduce((a, p) => a + (qada[p.k] || 0), 0);
  $("#lgQada").innerHTML = LP.map(p => `<div class="qrow"><span>${p.n}</span><button data-q="${p.k}" data-d="-1" aria-label="کەمکردنەوە">−</button><b class="num">${ku(qada[p.k] || 0)}</b><button data-q="${p.k}" data-d="1" aria-label="زیادکردن">+</button></div>`).join("")
    + `<div class="qrow total"><span>کۆی قەزا</span><b class="num">${ku(total)}</b></div>`;
  renderToolSubs();
  renderNudge();
}
// Past days (since the log was first used) with prayers left unmarked: offer to move them to qada.
let settled = store.get("pray.settled", {});
function missed(){
  const first = Object.keys(lg).filter(k => (lg[k] || []).some(Boolean)).sort()[0], out = [];
  if(!first) return out;
  daysBack(8).slice(1).forEach(d => { const k = isoKey(d); if(k < first) return;
    const a = lg[k] || [], s = settled[k] || [];
    LP.forEach((p, i) => { if(!a[i] && !s.includes(i)) out.push([k, i]); }); });
  return out;
}
function renderNudge(){
  const m = missed(), el = $("#lgNudge"); el.hidden = !m.length; if(!m.length) return;
  el.innerHTML = `<b>${ku(m.length)} نوێژ لە ڕۆژانی ڕابردوودا نیشان نەکراون</b>
    <p class="fine">ئەگەر نەتکردوون، بیانخە سەر لیستی قەزا. ئەگەر کردووتن و تەنها نیشانت نەکردوون، وەک کراو تۆماریان بکە.</p>
    <div class="row2"><button class="btn primary" data-n="qada">بیانخە سەر قەزا</button><button class="btn" data-n="done">کردوومن</button></div>`;
}
$("#lgNudge").onclick = e => {
  const b = e.target.closest("[data-n]"); if(!b) return;
  const m = missed(), done = b.dataset.n === "done";
  m.forEach(([k, i]) => {
    if(done){ const a = lg[k] || [0, 0, 0, 0, 0]; a[i] = 1; lg[k] = a; }
    else { (settled[k] || (settled[k] = [])).push(i); qada[LP[i].k] = (qada[LP[i].k] || 0) + 1; }
  });
  store.set("pray.log", lg); store.set("pray.settled", keepRecent(settled, 30)); store.set("pray.qada", qada);
  toast(done ? "وەک کراو تۆمار کران" : `${ku(m.length)} نوێژ خرانە سەر قەزا`); renderLog();
};
$("#lgToday").onclick = e => { const b = e.target.closest("[data-i]"); if(b) toggleLog(isoKey(iraqNow()), +b.dataset.i); };
$("#lgWeek").onclick = e => { const b = e.target.closest("button"); if(b) toggleLog(b.dataset.k, +b.dataset.i); };
$("#lgQada").onclick = e => {
  const b = e.target.closest("[data-q]"); if(!b) return;
  qada[b.dataset.q] = Math.max(0, (qada[b.dataset.q] || 0) + +b.dataset.d);
  store.set("pray.qada", qada); renderLog();
};
$("#lgAddDays").onclick = () => {
  const n = Math.floor(parseNum($("#lgDays").value));
  if(n < 1 || n > 36500){ toast("ژمارەی ڕۆژەکان بنووسە"); return; }
  LP.forEach(p => qada[p.k] = (qada[p.k] || 0) + n);
  store.set("pray.qada", qada); $("#lgDays").value = ""; renderLog();
  toast(`${ku(n)} ڕۆژ زیاد کرا`);
};

/* ================= ZAKAT ================= */
const ZK = ["cur", "goldP", "silverP", "cash", "gold", "karat", "silver", "trade", "lent", "debt"];
const zkId = k => "#zk" + k[0].toUpperCase() + k.slice(1);
let zk = Object.assign({cur:"دینار", karat:"21", basis:"gold"}, store.get("zakat", {}));
function fillZakat(){
  ZK.forEach(k => { if(zk[k] != null) $(zkId(k)).value = zk[k]; });
  calcZakat();
}
function calcZakat(){
  const v = k => parseNum(zk[k] || 0), cur = zk.cur, dp = cur === "دینار" ? 0 : 2;
  $$("#zkBasis button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.b === zk.basis)));
  const goldVal = v("gold") * (+zk.karat || 24) / 24 * v("goldP"), silverVal = v("silver") * v("silverP");
  const total = v("cash") + goldVal + silverVal + v("trade") + v("lent") - v("debt");
  const price = zk.basis === "silver" ? v("silverP") : v("goldP");
  const nisab = zk.basis === "silver" ? 595 * price : 85 * price;
  const money = n => `${fmt(n, dp)} ${cur}`;
  let html = `<div class="line"><span>کۆی ماڵی زەکاتدار</span><b class="num">${money(Math.max(0, total))}</b></div>`;
  if(goldVal) html += `<div class="line"><span>بەهای زێڕ</span><b class="num">${money(goldVal)}</b></div>`;
  if(!price){
    html += `<div class="due"><small>بۆ زانینی نیساب، نرخی یەک گرام ${zk.basis === "silver" ? "زیو" : "زێڕی ٢٤"}ی ئەمڕۆ بنووسە.</small></div>`;
  } else {
    html += `<div class="line"><span>نیساب (${zk.basis === "silver" ? "٥٩٥ گرام زیو" : "٨٥ گرام زێڕ"})</span><b class="num">${money(nisab)}</b></div>`;
    html += total >= nisab && total > 0
      ? `<div class="due"><small>زەکاتەکەت (٢٫٥٪)</small><b class="num">${money(total * 0.025)}</b></div>`
      : `<div class="due"><small>ماڵەکەت نەگەیشتووەتە نیساب، بۆیە زەکاتت لەسەر نییە.</small></div>`;
  }
  $("#zkRes").innerHTML = html;
}
$("#zkForm").addEventListener("input", e => {
  const k = ZK.find(k => zkId(k) === "#" + e.target.id); if(!k) return;
  zk[k] = e.target.value; store.set("zakat", zk); calcZakat();
});
$("#zkForm").addEventListener("submit", e => e.preventDefault());
$("#zkBasis").onclick = e => { const b = e.target.closest("button"); if(!b) return; zk.basis = b.dataset.b; store.set("zakat", zk); calcZakat(); };

/* ================= KHATM PLAN ================= */
// A page counts as read after 15 seconds on screen; khatm.done maps page -> the day it was read.
let khatm = store.get("khatm", null), khSel = 30, readTimer;
const KH_DAYS = [7, 15, 30, 60];
function trackPage(p){
  clearTimeout(readTimer);
  if(!khatm || khatm.done[p]) return;
  readTimer = setTimeout(() => {
    if($("#reader").hidden || page !== p || !khatm) return;
    khatm.done[p] = isoKey(iraqNow());
    if(Object.keys(khatm.done).length >= 604 && !khatm.finished){
      khatm.finished = true; store.set("khatm.n", store.get("khatm.n", 0) + 1);
      toast("پیرۆزە! خەتمی قورئانت تەواو کرد");
    }
    store.set("khatm", khatm);
  }, 15000);
}
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
function khatmStats(){
  const k = isoKey(iraqNow()), done = Object.values(khatm.done), total = done.length;
  const today = done.filter(d => d === k).length, before = total - today;
  const day = dayDiff(khatm.start, k) + 1, left = Math.max(1, khatm.days - day + 1);
  return {total, today, target:Math.ceil((604 - before) / left), day, late:day > khatm.days};
}
const firstUnread = () => { for(let p = 1; p <= 604; p++) if(!khatm.done[p]) return p; return 1; };
function quranSub(){
  const last = store.get("q.page", 0);
  if(khatm && !khatm.finished){ const s = khatmStats(); $("#qkQuranSub").textContent = `خەتم: ئەمڕۆ ${ku(Math.min(s.today, s.target))} لە ${ku(s.target)} لاپەڕە`; }
  else $("#qkQuranSub").textContent = last && Q ? `لاپەڕە ${ku(last)} · ${Q[surahOf(META.pages[last - 1])][0]}` : "دەست بە خوێندنەوە بکە";
}
function renderKhatm(){
  const el = $("#khatm"), n = store.get("khatm.n", 0);
  const doneNote = n ? `<p class="fine">تا ئێستا ${ku(n)} جار قورئانت خەتم کردووە.</p>` : "";
  if(!khatm){
    el.innerHTML = `<b>پلانی خەتمی قورئان</b>
      <p class="fine">دیاری بکە لە چەند ڕۆژێکدا قورئان خەتم دەکەیت. ئەپەکە ڕۆژانە پێت دەڵێت چەند لاپەڕە بخوێنیت و ئەو لاپەڕانەی خوێندووتن خۆی دەژمێرێت.</p>
      <div class="seg" role="group" aria-label="ماوەی خەتم">${KH_DAYS.map(d => `<button data-kd="${d}" aria-pressed="${d === khSel}">${ku(d)} ڕۆژ</button>`).join("")}</div>
      <p class="fine">نزیکەی ${ku(Math.ceil(604 / khSel))} لاپەڕە لە ڕۆژێکدا.</p>
      <button class="btn primary wide" data-kh="start">دەستپێکردنی پلان</button>${doneNote}`;
  } else if(khatm.finished){
    el.innerHTML = `<b>پیرۆزە! خەتمەکەت تەواو بوو</b><p class="fine">خوای گەورە لێت وەربگرێت.</p>${doneNote}<button class="btn primary wide" data-kh="new">خەتمێکی نوێ</button>`;
  } else {
    const s = khatmStats(), tp = Math.min(1, s.today / s.target);
    el.innerHTML = `<div class="kh-h"><b>خەتم لە ${ku(khatm.days)} ڕۆژدا</b><span class="sub">ڕۆژی ${ku(Math.min(s.day, khatm.days))} لە ${ku(khatm.days)}</span></div>
      <div class="kh-today${tp >= 1 ? " ok" : ""}"><span>ئەمڕۆ</span><b class="num">${ku(s.today)} <small>لە ${ku(s.target)} لاپەڕە</small></b></div>
      <div class="pbar"><i style="width:${(tp * 100).toFixed(1)}%"></i></div>
      <div class="kh-all"><span>هەموو</span><span class="num">${ku(s.total)} لە ٦٠٤ لاپەڕە</span></div>
      <div class="pbar thin"><i style="width:${(s.total / 604 * 100).toFixed(1)}%"></i></div>
      ${s.late ? '<p class="fine">ماوەی پلانەکەت تێپەڕی. بەردەوام بە تا تەواوی دەکەیت.</p>' : ""}
      <button class="btn primary wide" data-kh="go">خوێندنەوە: لاپەڕە ${ku(firstUnread())}</button>
      <button class="btn ghost" data-kh="stop">هەڵوەشاندنەوەی پلان</button>`;
  }
}
$("#khatm").onclick = e => {
  const d = e.target.closest("[data-kd]"); if(d){ khSel = +d.dataset.kd; renderKhatm(); return; }
  const b = e.target.closest("[data-kh]"); if(!b) return;
  const a = b.dataset.kh;
  if(a === "start" || a === "new"){ khatm = {start:isoKey(iraqNow()), days:khSel, done:{}}; store.set("khatm", khatm); toast("پلانەکە دەستی پێکرد"); }
  else if(a === "go"){ openReader(firstUnread()); return; }
  else if(a === "stop"){ if(!confirm("پلانی خەتم هەڵبوەشێنرێتەوە؟")) return; khatm = null; store.set("khatm", null); }
  renderKhatm(); quranSub();
};

/* ================= SHARE AS IMAGE ================= */
const SITE = /\.github\.io$/.test(location.hostname) ? (location.host + location.pathname.replace(/index\.html$/, "")).replace(/\/$/, "") : "yawarinwezh.github.io";
function wrapText(ctx, text, maxW){
  const out = [];
  for(const para of String(text).split("\n")){
    let line = "";
    for(const w of para.split(/\s+/).filter(Boolean)){
      const t = line ? line + " " + w : w;
      if(line && ctx.measureText(t).width > maxW){ out.push(line); line = w; } else line = t;
    }
    if(line) out.push(line);
  }
  return out;
}
// Draw a 1080×1350 card (Instagram/WhatsApp friendly) and hand it to the share sheet, or download it.
async function shareCard(c){
  toast("وێنەکە ئامادە دەکرێت…");
  const W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), arF = c.quran ? '"KFGQPC Hafs"' : '"Amiri"', ui = '"IBM Plex Sans Arabic", sans-serif';
  const logo = new Image(); logo.src = "icons/icon-192.png";
  try{ await Promise.all([document.fonts.load(`40px ${arF}`, "بسم"), document.fonts.load(`600 40px ${ui}`, "بسم"),
    document.fonts.load(`400 40px ${ui}`, "بسم"), document.fonts.load(`400 26px ${ui}`, "abc"), logo.decode()]); }catch(_){}
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f5c4d"); g.addColorStop(1, "#082c25");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(201,162,74,.85)"; x.lineWidth = 3; x.strokeRect(44, 44, W - 88, H - 88);
  x.strokeStyle = "rgba(201,162,74,.35)"; x.lineWidth = 1.5; x.strokeRect(58, 58, W - 116, H - 116);
  if(logo.complete && logo.naturalWidth){ x.save(); x.beginPath(); x.roundRect?.(W / 2 - 42, 92, 84, 84, 20); x.clip(); x.drawImage(logo, W / 2 - 42, 92, 84, 84); x.restore(); }
  x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = "#e9d6a0"; x.font = `600 38px ${ui}`; x.fillText(c.title || "", W / 2, 222);
  // shrink the text until it fits between the title and the footer
  const top = 280, bottom = H - 220, maxW = W - 200, aLH = c.quran ? 1.95 : 1.8, kLH = 1.75;
  let as = c.quran ? 64 : 60, ks = 36, aL, kL, h;
  for(;;){
    x.font = `${as}px ${arF}`; aL = wrapText(x, c.ar, maxW);
    x.font = `400 ${ks}px ${ui}`; kL = c.ku ? wrapText(x, c.ku, maxW) : [];
    h = aL.length * as * aLH + kL.length * ks * kLH + (kL.length ? 60 : 0);
    if(h <= bottom - top || as <= 26) break;
    as -= 2; ks = Math.max(22, ks - 1);
  }
  let y = top + Math.max(0, (bottom - top - h) / 2);
  x.fillStyle = "#fdf8ea"; x.font = `${as}px ${arF}`;
  aL.forEach(l => { x.fillText(l, W / 2, y + as * aLH / 2); y += as * aLH; });
  if(kL.length){
    y += 30; x.fillStyle = "rgba(201,162,74,.6)"; x.fillRect(W / 2 - 60, y - 1, 120, 2); y += 30;
    x.fillStyle = "rgba(253,248,234,.82)"; x.font = `400 ${ks}px ${ui}`;
    kL.forEach(l => { x.fillText(l, W / 2, y + ks * kLH / 2); y += ks * kLH; });
  }
  if(c.src){ x.fillStyle = "#e9d6a0"; x.font = `400 30px ${ui}`; x.fillText(c.src, W / 2, H - 180); }
  x.fillStyle = "#fdf8ea"; x.font = `600 34px ${ui}`; x.fillText("یاوەری نوێژ", W / 2, H - 126);
  x.direction = "ltr"; x.fillStyle = "rgba(253,248,234,.7)"; x.font = `400 26px ${ui}`; x.fillText(SITE, W / 2, H - 86);
  const blob = await new Promise(r => cv.toBlob(r, "image/png"));
  $("#toast").hidden = true;
  if(!blob){ toast("وێنەکە دروست نەکرا"); return; }
  const file = new File([blob], "yawari-nwezh.png", {type:"image/png"});
  if(navigator.canShare?.({files:[file]})){ try{ await navigator.share({files:[file], text:`یاوەری نوێژ: https://${SITE}`}); }catch(_){} return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("وێنەکە دابەزێنرا");
}

/* ================= FASTING + ISLAMIC OCCASIONS ================= */
// 800 days around today with their Hijri dates; index HD0 is today.
const HD0 = 400;
let hCache = {key:"", days:[]};
function hDays(){
  const off = cfg().hijriOffset, key = isoKey(iraqNow()) + "|" + off;
  if(hCache.key !== key){
    const t = iraqNow();
    hCache = {key, days:Array.from({length:800}, (_, j) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + j - HD0, 12); return {d, k:isoKey(d), h:hijriYMD(d, off) || {d:0, m:0, y:0}}; })};
  }
  return hCache.days;
}
const OCC = [
  {m:9, d:1, n:"سەرەتای ڕەمەزان"},
  {m:9, d:21, n:"دە شەوی کۆتایی ڕەمەزان", s:"شەوی قەدر لە شەوە تاکەکانیدایە"},
  {m:10, d:1, n:"جەژنی ڕەمەزان"},
  {m:12, d:1, n:"دە ڕۆژەکەی زولحیججە"},
  {m:12, d:9, n:"ڕۆژی عەرەفە"},
  {m:12, d:10, n:"جەژنی قوربان"},
  {m:1, d:1, n:"سەری ساڵی کۆچی"},
  {m:1, d:10, n:"ڕۆژی عاشورا"}
];
const inDays = i => i === 0 ? "ئەمڕۆ" : i === 1 ? "سبەینێ" : `${ku(i)} ڕۆژی ماوە`;
const gShort = d => `${WD[d.getDay()]}، ${ku(d.getDate())}ی ${GM[d.getMonth()]}`;
function upcomingOcc(){
  const days = hDays(), out = [];
  for(const o of OCC){
    for(let i = HD0; i < days.length; i++){ const h = days[i].h; if(h.m === o.m && h.d === o.d){ out.push(Object.assign({i:i - HD0, date:days[i].d}, o)); break; } }
  }
  return out.sort((a, b) => a.i - b.i);
}
// Why a day is a recommended (sunnah) fast, or null. Ramadan, the Eids and the days of tashreeq are excluded.
function sunnahFast(x){
  const {m, d} = x.h, wd = x.d.getDay();
  if(m === 9 || (m === 10 && d === 1) || (m === 12 && d >= 10 && d <= 13)) return null;
  const why = [];
  if(m === 12 && d === 9) why.push("ڕۆژی عەرەفە");
  else if(m === 12 && d <= 8) why.push("ڕۆژانی سەرەتای زولحیججە");
  if(m === 1 && (d === 9 || d === 10)) why.push(d === 10 ? "ڕۆژی عاشورا" : "تاسوعا (پێش عاشورا)");
  if(m === 10 && d >= 2) why.push("شەش ڕۆژەکەی شەووال");
  if(d >= 13 && d <= 15) why.push("ڕۆژانی سپی");
  if(wd === 1) why.push("دووشەممە"); else if(wd === 4) why.push("پێنجشەممە");
  return why.length ? why.join(" · ") : null;
}
let fastLog = store.get("fast.log", {}), fastQada = store.get("fast.qada", 0);
function ramadanDays(){
  const days = hDays(), t = days[HD0].h, y = t.m <= 10 ? t.y : t.y + 1;
  return days.map((x, j) => Object.assign({i:j - HD0}, x)).filter(x => x.h.y === y && x.h.m === 9);
}
function renderFast(){
  const days = hDays(), today = days[HD0];
  $("#fsHijri").textContent = hijri(today.d, cfg().hijriOffset);
  const rd = ramadanDays();
  let html = `<b>ڕەمەزانی ${ku(rd[0]?.h.y || today.h.y)}</b>`;
  if(rd.length){
    const first = rd[0].i, done = rd.filter(x => fastLog[x.k] === 1).length;
    if(first > 0) html += `<p class="fine">${ku(first)} ڕۆژ ماوە بۆ ڕەمەزان (${gShort(rd[0].d)}).</p>`;
    else html += `<p class="fine">${ku(done)} لە ${ku(rd.length)} ڕۆژ بە ڕۆژوو بوویت. بۆ نیشانکردن کلیک لە ڕۆژەکە بکە.</p>`;
    html += `<div class="rgrid">${rd.map(x => `<button data-fk="${x.k}" aria-pressed="${fastLog[x.k] === 1}"${x.i > 0 ? " disabled" : ""} class="${x.i === 0 ? "today" : ""}${fastLog[x.k] === -1 ? " qz" : ""}" aria-label="ڕۆژی ${ku(x.h.d)}"><b>${ku(x.h.d)}</b><small>${ku(x.d.getDate())}/${ku(x.d.getMonth() + 1)}</small></button>`).join("")}</div>`;
    if(first <= 0 && rd[rd.length - 1].i < 0){
      const miss = rd.filter(x => !fastLog[x.k]).length;
      if(miss) html += `<button class="btn wide" data-fs="toqada">${ku(miss)} ڕۆژی نیشاننەکراو بخە سەر قەزا</button>`;
    }
  }
  $("#fsRamadan").innerHTML = html;
  $("#fsQada").textContent = ku(fastQada);
  const sun = days.slice(HD0, HD0 + 14).map((x, i) => ({x, i, why:sunnahFast(x)})).filter(r => r.why);
  $("#fsSunnah").innerHTML = sun.map(r => `<div class="orow${r.i === 0 ? " now" : ""}"><span><b>${gShort(r.x.d)}</b><small>${esc(r.why)}</small></span><em>${inDays(r.i)}</em></div>`).join("")
    || `<p class="fine">${today.h.m === 9 ? "لە ڕەمەزاندا هەموو ڕۆژێک ڕۆژووی فەرزە." : "هیچ ڕۆژێک نییە."}</p>`;
  $("#fsOcc").innerHTML = upcomingOcc().map(o => `<div class="orow${o.i <= 7 ? " now" : ""}"><span><b>${o.n}</b><small>${ku(o.d)}ی ${HM[o.m - 1]} · ${gShort(o.date)}${o.s ? " · " + o.s : ""}</small></span><em>${inDays(o.i)}</em></div>`).join("");
}
$("#fsRamadan").onclick = e => {
  const b = e.target.closest("[data-fk]");
  if(b){ const k = b.dataset.fk; if(fastLog[k] === 1) delete fastLog[k]; else { if(fastLog[k] === -1) fastQada = Math.max(0, fastQada - 1), store.set("fast.qada", fastQada); fastLog[k] = 1; } store.set("fast.log", fastLog); try{ navigator.vibrate?.(10); }catch(_){} renderFast(); return; }
  if(e.target.closest('[data-fs="toqada"]')){
    const rd = ramadanDays(), miss = rd.filter(x => !fastLog[x.k]);
    fastQada += miss.length; miss.forEach(x => fastLog[x.k] = -1);
    store.set("fast.qada", fastQada); store.set("fast.log", fastLog); toast(`${ku(miss.length)} ڕۆژ خرایە سەر قەزا`); renderFast();
  }
};
$("#v-fast").addEventListener("click", e => {
  const b = e.target.closest("[data-fq]"); if(!b) return;
  fastQada = Math.max(0, fastQada + +b.dataset.fq); store.set("fast.qada", fastQada); $("#fsQada").textContent = ku(fastQada);
});

/* ---------- home banners: Ramadan countdown, Friday, tomorrow's sunnah fast, near occasions ---------- */
function renderBanners(now, t){
  const days = hDays(), td = days[HD0], tm = days[HD0 + 1], out = [];
  if(td.h.m === 9){
    out.push(`<div class="bn rm"><span><b>ڕۆژی ${ku(td.h.d)}ی ڕەمەزان</b><small id="rmLab"></small></span><b class="num" id="rmCd"></b></div>`);
  }
  const fri = now.getDay() === 5 && now < t.maghrib, thuNight = now.getDay() === 4 && now >= t.maghrib;
  if(fri || thuNight){
    out.push(`<div class="bn fr"><span><b>${fri ? "ئەمڕۆ هەینییە" : "شەوی هەینییە"}</b><small>سورەتی کەهف بخوێنەرەوە و زۆر صلوات بدە.</small></span><span class="bn-acts"><button class="mini" data-bn="kahf">سورەتی کەهف</button><button class="mini" data-bn="salawat">صلوات</button></span></div>`);
  }
  const why = sunnahFast(tm);
  if(why) out.push(`<a class="bn" href="#fast"><span><b>سبەینێ ڕۆژووی سوننەتە</b><small>${esc(why)}</small></span><em>›</em></a>`);
  const occ = upcomingOcc().find(o => o.i > 0 && o.i <= 7 && !(o.m === 9 && td.h.m === 9));
  if(occ) out.push(`<a class="bn" href="#fast"><span><b>${occ.n}</b><small>${ku(occ.d)}ی ${HM[occ.m - 1]}</small></span><em>${inDays(occ.i)}</em></a>`);
  $("#hBanners").innerHTML = out.join("");
  const sub = why ? "سبەینێ ڕۆژووی سوننەتە" : (upcomingOcc()[0] ? `${upcomingOcc()[0].n}: ${inDays(upcomingOcc()[0].i)}` : "");
  $("#tkFast").textContent = td.h.m === 9 ? `ڕۆژی ${ku(td.h.d)}ی ڕەمەزان` : sub;
}
function tickRamadan(now, t){
  const cd = $("#rmCd"); if(!cd) return;
  let lab, at;
  if(now < t.fajr){ lab = "پارشێو تا بانگی بەیانی"; at = t.fajr; }
  else if(now < t.maghrib){ lab = "ماوە بۆ بەربانگ"; at = t.maghrib; }
  else { const tm = new Date(now); tm.setDate(tm.getDate() + 1); lab = "پارشێو تا بانگی بەیانی"; at = prayerTimes(tm, place(), cfg()).fajr; }
  let s = Math.max(0, Math.floor((at - now) / 1000)); const h = Math.floor(s / 3600); s -= h * 3600; const mi = Math.floor(s / 60); s -= mi * 60;
  $("#rmLab").textContent = `${lab} (${t12(at, false)})`;
  cd.textContent = ku(`${pad(h)}:${pad(mi)}:${pad(s)}`);
}
$("#hBanners").onclick = e => {
  const b = e.target.closest("[data-bn]"); if(!b) return;
  if(b.dataset.bn === "kahf") loadQuran().then(() => openReader(pageOf(START[17]), START[17]));
  else { tb.d = 7; tb.t = 100; tb.c = 0; tb.r = 0; store.set("tb", tb); location.hash = "#tasbih"; }
};

/* ================= AYAH OF THE DAY ================= */
const AOTD = ["2:152","2:153","2:186","2:201","2:216","2:286","3:8","3:139","3:173","3:200","7:23","7:56","9:51","11:115","12:87","13:28","14:7","15:99","16:97","16:128",
  "18:46","20:114","21:87","23:118","25:74","29:69","33:41","39:10","39:53","40:60","49:10","49:13","50:16","51:56","55:13","59:10","64:16","65:3","94:5","2:45",
  "3:92","4:110","6:162","17:80","28:24","71:10","2:155","3:159","13:11","2:222"];
function renderAotd(){
  if(!Q) return;
  const n = iraqNow(), doy = Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(n.getFullYear(), 0, 0)) / 864e5);
  const [s, a] = AOTD[(doy + n.getFullYear()) % AOTD.length].split(":").map(Number), text = Q[s - 1][3][a - 1];
  const el = $("#aotd"); el.hidden = false;
  el.dataset.id = START[s - 1] + a - 1;
  el.innerHTML = `<div class="kh-h"><b>ئایەتی ڕۆژ</b><span class="sub">سورەتی ${esc(Q[s - 1][0])} · ${ku(a)}</span></div>
    <div class="ao-ar" lang="ar">${text} ﴿${ku(a)}﴾</div>
    <div class="foot"><button class="mini" data-ao="read">لە موسحەفدا</button><button class="mini" data-ao="img">ناردن وەک وێنە</button></div>`;
}
$("#aotd").onclick = e => {
  const b = e.target.closest("[data-ao]"); if(!b) return;
  const id = +$("#aotd").dataset.id, s = surahOf(id), a = id - START[s] + 1;
  if(b.dataset.ao === "read") openReader(pageOf(id), id);
  else shareCard({title:`ئایەتی ڕۆژ · سورەتی ${Q[s][0]}`, ar:`${Q[s][3][a - 1]} ﴿${ku(a)}﴾`, quran:true, src:"قورئانی پیرۆز"});
};

/* ================= SETTINGS + SUGGESTIONS ================= */
function fillPlaces(){
  const sel = store.get("place", {id:"erbil"});
  $("#sPlace").innerHTML = (sel.id === "gps" ? `<option value="gps">شوێنی ئێستام (GPS)</option>` : "") + CITIES.map(c => `<option value="${c.id}">${c.n}</option>`).join("");
  $("#sPlace").value = sel.id;
  $("#sGpsNote").textContent = sel.id === "gps" ? `شوێن: ${ku(sel.lat.toFixed(3))}، ${ku(sel.lng.toFixed(3))}` : "";
  const at = store.get("c.at", 0);
  $("#sSync").textContent = !firebaseReady ? "ناوەڕۆکی بنەڕەتی بەکاردێت." : at ? `دوایین نوێکردنەوەی دوعا و کاتەکان: ${ku(new Date(at).toLocaleDateString("en-GB"))}` : "ناوەڕۆک هێشتا لە سێرڤەر وەرنەگیراوە.";
}
function placeChanged(){ renderHome(true); renderQibla(); fillPlaces(); }
$("#openSettings").onclick = $("#placeChip").onclick = () => { fillPlaces(); applyTheme(store.get("theme", "auto")); $("#settings").showModal(); };
$("#sPlace").onchange = e => { if(e.target.value !== "gps") store.set("place", {id:e.target.value}); placeChanged(); };
$("#sGps").onclick = () => {
  if(!navigator.geolocation){ $("#sGpsNote").textContent = "ئەم مۆبایلە GPS-ی نییە."; return; }
  $("#sGpsNote").textContent = "شوێنەکەت دەدۆزرێتەوە…";
  navigator.geolocation.getCurrentPosition(p => {
    store.set("place", {id:"gps", lat:p.coords.latitude, lng:p.coords.longitude, el:p.coords.altitude || null});
    placeChanged(); toast("شوێنەکەت دیاری کرا");
  }, () => { $("#sGpsNote").textContent = "شوێن نەدۆزرایەوە. ڕێگە بە Location بدە یان شارێک هەڵبژێرە."; }, {enableHighAccuracy:true, timeout:15000, maximumAge:6e5});
};
$$("#sTheme button").forEach(b => b.onclick = () => { store.set("theme", b.dataset.themeSet); applyTheme(b.dataset.themeSet); });
function openSuggest(){
  $("#settings").open && $("#settings").close();
  $("#sgMsg").textContent = !firebaseReady ? "ناردنی پێشنیار هێشتا چالاک نەکراوە." : (!navigator.onLine ? "بۆ ناردن پێویستت بە ئینتەرنێتە." : "");
  $("#sgSend").disabled = !firebaseReady;
  $("#suggest").showModal();
}
$("#openSuggest").onclick = $("#sSuggest").onclick = openSuggest;
$("#sgClose").onclick = () => $("#suggest").close();
$("#sgForm").onsubmit = async e => {
  e.preventDefault();
  const text = $("#sgText").value.trim(); if(text.length < 5){ $("#sgMsg").textContent = "تکایە پێشنیارەکەت بە تەواوی بنووسە."; return; }
  if(!navigator.onLine){ $("#sgMsg").textContent = "ئینتەرنێت نییە. کاتێک هێڵت هەبوو دووبارە بینێرە."; return; }
  $("#sgSend").disabled = true; $("#sgMsg").textContent = "دەنێردرێت…";
  try{
    await sendSuggestion({type:$("#sgType").value, text, name:$("#sgName").value.trim(), contact:$("#sgContact").value.trim()});
    $("#sgForm").reset(); $("#suggest").close(); toast("سوپاس! پێشنیارەکەت گەیشت.");
  }catch(err){ $("#sgMsg").textContent = "نەنێردرا. دواتر هەوڵ بدەرەوە."; }
  $("#sgSend").disabled = false;
};

/* ================= ROUTING ================= */
const VIEWS = ["home", "quran", "qibla", "adhkar", "duas", "tasbih", "log", "zakat", "fast"];
function route(){
  const h = location.hash.slice(1);
  if(h === "read"){ if($("#reader").hidden) openReader(); return; }
  if(!$("#reader").hidden) closeReader();
  const v = VIEWS.includes(h) ? h : "home";
  $$(".view").forEach(s => s.hidden = s.dataset.view !== v);
  $$("[data-nav]").forEach(a => { if(a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if(v === "quran") loadQuran().then(renderIndex).catch(() => $("#slist").innerHTML = '<div class="empty">قورئان بار نەبوو. پەڕەکە نوێ بکەرەوە.</div>');
  if(v === "qibla") renderQibla();
  if(v === "tasbih") renderTasbih();
  if(v === "log") renderLog();
  if(v === "zakat") fillZakat();
  if(v === "fast") renderFast();
  scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ================= BOOT ================= */
applyTheme(store.get("theme", "auto"));
buildRose();
renderHome(true); renderAdhkar(); renderDuas(); renderQibla(); route();
setInterval(() => renderHome(false), 1000);
loadQuran().then(() => { quranSub(); renderAotd(); }).catch(() => {});

if(firebaseReady){
  const sync = () => refreshContent().then(c => {
    const changed = JSON.stringify(c) !== JSON.stringify(content);
    content = c; if(changed){ renderHome(true); renderAdhkar(); renderDuas(); }
  }).catch(() => {});
  sync(); addEventListener("online", sync);
}

if("serviceWorker" in navigator && location.protocol === "https:"){
  navigator.serviceWorker.register("sw.js").then(reg => {
    const prompt = w => toast("وەشانێکی نوێ ئامادەیە", {label:"نوێکردنەوە", run:() => w.postMessage("skip")});
    if(reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener("updatefound", () => { const w = reg.installing; w?.addEventListener("statechange", () => { if(w.state === "installed" && navigator.serviceWorker.controller) prompt(w); }); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if(!reloaded){ reloaded = true; location.reload(); } });
}
