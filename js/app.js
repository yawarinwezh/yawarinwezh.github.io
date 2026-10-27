import {
  store, ku, fromKu, pad, esc, t12, gdate, hijri, CITIES, PRAYERS, METHODS, place, iraqNow, prayerTimes, nextPrayer,
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
  }
  // countdown
  let s = Math.max(0, Math.floor((n.at - now) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600; const mi = Math.floor(s / 60); s -= mi * 60;
  $("#countdown").textContent = ku(`${pad(h)}:${pad(mi)}:${pad(s)}`);
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
let qtab = "surah";
function renderIndex(){
  const qs = $("#qSearch").value.trim(), n = +fromKu(qs);
  let rows = "";
  if(n && n >= 1 && n <= 604) rows += `<button class="srow" data-page="${n}"><span class="sno num">${ku(n)}</span><span class="smid"><b>بڕۆ بۆ لاپەڕەی ${ku(n)}</b><small>${esc(Q[surahOf(META.pages[n - 1])][0])}</small></span></button>`;
  if(qtab === "surah"){
    const nq = norm(qs);
    rows += Q.map((s, i) => ({s, i})).filter(({s, i}) => !qs || n === i + 1 || norm(s[0]).includes(nq) || s[1].toLowerCase().includes(nq))
      .map(({s, i}) => `<button class="srow" data-page="${pageOf(START[i])}" data-sura="${i}"><span class="sno num">${ku(i + 1)}</span><span class="smid"><b>${esc(s[0])}</b><small>${s[2] ? "مەککی" : "مەدەنی"} · ${ku(s[3].length)} ئایەت · لاپەڕە ${ku(pageOf(START[i]))}</small></span></button>`).join("");
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
  $("#qkQuranSub").textContent = last ? `لاپەڕە ${ku(last)} · ${Q[surahOf(META.pages[last - 1])][0]}` : "دەست بە خوێندنەوە بکە";
}
$$("[data-qtab]").forEach(b => b.onclick = () => { qtab = b.dataset.qtab; $$("[data-qtab]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderIndex(); });
$("#qSearch").oninput = () => Q && renderIndex();
$("#slist").onclick = e => { const b = e.target.closest("[data-page]"); if(b) openReader(+b.dataset.page, b.dataset.sura != null ? START[+b.dataset.sura] : null); };
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
    run.push(`<span class="v${id === hl ? " hl" : ""}" data-id="${id}">${Q[s][3][a - 1]} ${ku(a)}</span>`);
  }
  flush();
  const s0 = surahOf(from);
  $("#rPage").innerHTML = `<div class="page-in"><div class="page-h"><span>${esc(Q[s0][0])}</span><span>جوزئی ${ku(juzOf(from))}</span></div>${html}<div class="page-f">${ku(page)}</div></div>`;
  $("#rSurah").textContent = Q[s0][0];
  $("#rJuz").textContent = `جوزئی ${ku(juzOf(from))} · لاپەڕە ${ku(page)}`;
  $("#rPg").value = ku(page);
  $("#rPrev").disabled = page <= 1; $("#rNext").disabled = page >= 604;
  store.set("q.page", page);
  if(hl){ const el = $("#rPage .v.hl"); if(el){ setTimeout(() => el.scrollIntoView({block:"center"}), 30); setTimeout(() => el.classList.remove("hl"), 1800); } } else $("#rStage").scrollTop = 0;
}
function go(p, hl){ page = Math.max(1, Math.min(604, p)); renderPage(hl); }
async function openReader(p, hl){
  await loadQuran();
  $("#reader").hidden = false; document.body.style.overflow = "hidden";
  if(location.hash !== "#read") history.pushState(null, "", "#read");
  go(p || store.get("q.page", 1), hl);
  try{ wake = await navigator.wakeLock?.request("screen"); }catch(_){ wake = null; }
}
function closeReader(){
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
    <div class="foot"><span class="src">${esc(d.src || "")}</span><button class="mini share">${navigator.share ? "ناردن" : "کۆپی"}</button></div></article>`).join("")
    || '<div class="empty">هیچ دوعایەک نەدۆزرایەوە.</div>';
}
$("#dCats").onclick = e => { const b = e.target.closest("button"); if(b){ dcat = b.dataset.c; renderDuas(); } };
$("#dSearch").oninput = renderDuas;
$("#dList").onclick = async e => {
  const b = e.target.closest(".share"); if(!b) return;
  const d = content.duas.find(x => x.id === b.closest(".card").dataset.id); if(!d) return;
  const text = `${d.title}\n\n${d.ar}\n\n${d.ku}\n\n(${d.src || ""}) · یاوەری نوێژ`;
  if(navigator.share){ try{ await navigator.share({text}); }catch(_){} return; }
  try{ await navigator.clipboard.writeText(text); toast("کۆپی کرا"); }catch(_){ toast("کۆپی نەکرا"); }
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
const VIEWS = ["home", "quran", "qibla", "adhkar", "duas"];
function route(){
  const h = location.hash.slice(1);
  if(h === "read"){ if($("#reader").hidden) openReader(); return; }
  if(!$("#reader").hidden) closeReader();
  const v = VIEWS.includes(h) ? h : "home";
  $$(".view").forEach(s => s.hidden = s.dataset.view !== v);
  $$("[data-nav]").forEach(a => { if(a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if(v === "quran") loadQuran().then(renderIndex).catch(() => $("#slist").innerHTML = '<div class="empty">قورئان بار نەبوو. پەڕەکە نوێ بکەرەوە.</div>');
  if(v === "qibla") renderQibla();
  scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ================= BOOT ================= */
applyTheme(store.get("theme", "auto"));
buildRose();
renderHome(true); renderAdhkar(); renderDuas(); renderQibla(); route();
setInterval(() => renderHome(false), 1000);
loadQuran().then(() => { $("#qkQuranSub").textContent = store.get("q.page", 0) ? `لاپەڕە ${ku(store.get("q.page", 0))} · ${Q[surahOf(META.pages[store.get("q.page", 1) - 1])][0]}` : "دەست بە خوێندنەوە بکە"; }).catch(() => {});

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
