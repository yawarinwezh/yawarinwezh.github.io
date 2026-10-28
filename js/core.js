// Shared logic: prayer-time astronomy, Kurdish formatting, local storage, and the Firebase data layer.
import { FIREBASE_CONFIG } from "../firebase-config.js";
import { DEFAULT_ADHKAR, DEFAULT_DUAS, DEFAULT_TIMES } from "./defaults.js";
import { OFFICIAL } from "./official-data.js";

/* ---------- storage ---------- */
export const store = {
  get(k, d){ try{ const v = localStorage.getItem("yn." + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem("yn." + k, JSON.stringify(v)); }catch(e){} }
};

/* ---------- Kurdish formatting ---------- */
const KD = "٠١٢٣٤٥٦٧٨٩";
export const ku = x => String(x).replace(/\d/g, d => KD[d]);
export const fromKu = s => String(s).replace(/[٠-٩]/g, d => KD.indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
export const pad = n => String(n).padStart(2, "0");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const GM = ["کانوونی دووەم","شوبات","ئازار","نیسان","ئایار","حوزەیران","تەممووز","ئاب","ئەیلوول","تشرینی یەکەم","تشرینی دووەم","کانوونی یەکەم"];
export const WD = ["یەکشەممە","دووشەممە","سێشەممە","چوارشەممە","پێنجشەممە","هەینی","شەممە"];
export const HM = ["موحەڕڕەم","سەفەر","ڕەبیعولئەووەل","ڕەبیعولئاخیر","جومادەلئوولا","جومادەلئاخیرە","ڕەجەب","شەعبان","ڕەمەزان","شەووال","زولقەعدە","زولحیججە"];
export function t12(d, html = true){
  let h = d.getHours(); const m = d.getMinutes(), sfx = h < 12 ? "پ.ن" : "د.ن";
  h = h % 12 || 12;
  return html ? `${ku(h)}:${ku(pad(m))}<small>${sfx}</small>` : `${ku(h)}:${ku(pad(m))}`;
}
export const gdate = d => `${WD[d.getDay()]}، ${ku(d.getDate())}ی ${GM[d.getMonth()]} ${ku(d.getFullYear())}`;
// Umm al-Qura date {d, m, y} (m is 1..12); offset shifts it by whole days for local moon sighting.
let hfmt = null;
export function hijriYMD(d, offset = 0){
  try{
    hfmt = hfmt || new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {day:"numeric", month:"numeric", year:"numeric", timeZone:"UTC"});
    const parts = hfmt.formatToParts(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + (+offset || 0), 12)));
    const g = t => +parts.find(p => p.type === t).value;
    return {d:g("day"), m:g("month"), y:g("year")};
  }catch(e){ return null; }
}
export function hijri(d, offset = 0){
  const h = hijriYMD(d, offset);
  return h ? `${ku(h.d)}ی ${HM[h.m - 1]} ${ku(h.y)}ی کۆچی` : "";
}

/* ---------- places ---------- */
export const TZ = 3; // Iraq and the Kurdistan Region: UTC+3 all year
export const CITIES = [
  {id:"erbil", n:"هەولێر", lat:36.1911, lng:44.0092, el:415},
  {id:"sulaymaniyah", n:"سلێمانی", lat:35.5613, lng:45.4306, el:880},
  {id:"duhok", n:"دهۆک", lat:36.8669, lng:42.9503, el:565},
  {id:"halabja", n:"هەڵەبجە", lat:35.1778, lng:45.9861, el:700},
  {id:"kirkuk", n:"کەرکووک", lat:35.4681, lng:44.3922, el:350},
  {id:"zakho", n:"زاخۆ", lat:37.1440, lng:42.6820, el:440},
  {id:"soran", n:"سۆران", lat:36.6530, lng:44.5440, el:650},
  {id:"ranya", n:"ڕانیە", lat:36.2550, lng:44.8830, el:530},
  {id:"koya", n:"کۆیە", lat:36.0828, lng:44.6283, el:620},
  {id:"akre", n:"ئاکرێ", lat:36.7414, lng:43.8936, el:550},
  {id:"chamchamal", n:"چەمچەماڵ", lat:35.5330, lng:44.8340, el:700},
  {id:"kalar", n:"کەلار", lat:34.6270, lng:45.3220, el:220},
  {id:"penjwen", n:"پێنجوێن", lat:35.6230, lng:45.9440, el:1300},
  {id:"shaqlawa", n:"شەقڵاوە", lat:36.4040, lng:44.3170, el:980}
];
export const KAABA = {lat:21.4225, lng:39.8262};
// The place the user picked, or their GPS fix (offsets then follow the nearest city).
export function place(){
  const sel = store.get("place", {id:"erbil"});
  if(sel.id === "gps" && sel.lat != null){
    const near = nearestCity(sel.lat, sel.lng);
    const km = Math.hypot(near.lat - sel.lat, (near.lng - sel.lng) * Math.cos(sel.lat * Math.PI / 180)) * 111.2;
    return {id:"gps", n:"شوێنی ئێستام", lat:sel.lat, lng:sel.lng, el:sel.el || near.el, offId:near.id, near:near.n, nearKm:km};
  }
  const c = CITIES.find(c => c.id === sel.id) || CITIES[0];
  return Object.assign({offId:c.id}, c);
}
export function nearestCity(lat, lng){
  let best = CITIES[0], bd = 1e9;
  for(const c of CITIES){ const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos(lat * Math.PI / 180)) ** 2; if(d < bd){ bd = d; best = c; } }
  return best;
}

/* ---------- astronomy (PrayTimes.org algorithm) ---------- */
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const sin = d => Math.sin(rad(d)), cos = d => Math.cos(rad(d)), tan = d => Math.tan(rad(d));
const asin = x => deg(Math.asin(x)), acos = x => deg(Math.acos(Math.max(-1, Math.min(1, x)))), atan2 = (y, x) => deg(Math.atan2(y, x));
const acot = x => deg(Math.atan(1 / x));
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
function julian(y, m, d){ if(m <= 2){ y -= 1; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function sunPos(jd){
  const D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
  return {decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24)};
}
export const METHODS = {
  MWL:{n:"یەکێتی جیهانی ئیسلامی (فەجر ١٨° · عیشا ١٧°)", f:18, i:17},
  Egypt:{n:"دەستەی ڕووپێوی میسری (١٩٫٥° · ١٧٫٥°)", f:19.5, i:17.5},
  Karachi:{n:"زانکۆی کەراچی (١٨° · ١٨°)", f:18, i:18},
  Makkah:{n:"ئوم ئەلقوڕا، مەککە (١٨٫٥° · ٩٠ خولەک)", f:18.5, i:"90"},
  ISNA:{n:"ئەمریکای باکوور ISNA (١٥° · ١٥°)", f:15, i:15}
};
export const PRAYERS = [
  {k:"fajr", n:"بەیانی", ar:"الفجر"},
  {k:"sunrise", n:"خۆرهەڵاتن", ar:"الشروق", sun:true},
  {k:"dhuhr", n:"نیوەڕۆ", ar:"الظهر"},
  {k:"asr", n:"عەسر", ar:"العصر"},
  {k:"maghrib", n:"ئێوارە", ar:"المغرب"},
  {k:"isha", n:"خەوتنان", ar:"العشاء"}
];
// Published city timetables (js/official-data.js). A GPS position uses its nearest city's table within 15 km.
const tables = {};
export function tableId(c){
  const id = c.id === "gps" ? (c.nearKm <= 15 ? c.offId : null) : c.id;
  return id && OFFICIAL[id] ? id : null;
}
function fromTable(id, date){
  const t = tables[id] || (tables[id] = OFFICIAL[id].split(",").map(Number));
  const m = date.getMonth(), d = (m === 1 && date.getDate() === 29) ? 28 : date.getDate();
  const doy = Math.round((Date.UTC(2026, m, d) - Date.UTC(2026, 0, 1)) / 864e5);
  return t.slice(doy * 6, doy * 6 + 6);
}
export function prayerTimes(date, c, cfg){
  const tid = tableId(c);
  if(tid){
    const v = fromTable(tid, date), off = (cfg.offsets && cfg.offsets[c.offId || c.id]) || {}, out = {};
    ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].forEach((k, i) => {
      out[k] = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, v[i] + (+(off[k] || 0)), 0);
    });
    return out;
  }
  const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - c.lng / (15 * 24);
  const lat = c.lat, m = METHODS[cfg.method] || METHODS.MWL;
  const mid = t => fix(12 - sunPos(jd + t).eqt, 24);
  const angleT = (a, t, ccw) => { const d = sunPos(jd + t).decl, n = mid(t);
    const T = acos((-sin(a) - sin(d) * sin(lat)) / (cos(d) * cos(lat))) / 15; return n + (ccw ? -T : T); };
  const asrT = (f, t) => { const d = sunPos(jd + t).decl; return angleT(-acot(f + tan(Math.abs(lat - d))), t); };
  const rise = 0.833 + 0.0347 * Math.sqrt(c.el || 0);
  let t = {fajr:5, sunrise:6, dhuhr:12, asr:13, maghrib:18, isha:18};
  for(let i = 0; i < 2; i++){
    const p = {}; for(const k in t) p[k] = t[k] / 24;
    t = {fajr:angleT(m.f, p.fajr, true), sunrise:angleT(rise, p.sunrise, true), dhuhr:mid(p.dhuhr),
         asr:asrT(+cfg.asr || 1, p.asr), maghrib:angleT(rise, p.maghrib), isha:typeof m.i === "string" ? null : angleT(m.i, p.isha)};
  }
  if(t.isha == null) t.isha = t.maghrib + (+m.i) / 60;
  const adj = TZ - c.lng / 15, safety = {dhuhr:1, maghrib:1};
  const off = (cfg.offsets && cfg.offsets[c.offId || c.id]) || {};
  const out = {};
  for(const k in t){
    const mins = Math.round((t[k] + adj) * 60 + (safety[k] || 0) + (+(off[k] || 0)));
    out[k] = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, mins, 0);
  }
  return out;
}
// Wall-clock time in Iraq, whatever time zone the phone is set to.
export function iraqNow(){ const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + TZ * 60) * 60000); }
export function nextPrayer(now, c, cfg){
  const t = prayerTimes(now, c, cfg);
  for(const p of PRAYERS){ if(!p.sun && t[p.k] > now) return {k:p.k, n:p.n, at:t[p.k], day:0, today:t}; }
  const tm = new Date(now); tm.setDate(tm.getDate() + 1);
  return {k:"fajr", n:"بەیانی", at:prayerTimes(tm, c, cfg).fajr, day:1, today:t};
}
export function sunAltAz(date, c){
  const h = date.getHours() + date.getMinutes() / 60;
  const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - c.lng / (15 * 24);
  const sp = sunPos(jd + (h - TZ) / 24);
  const H = 15 * (h - (12 + TZ - c.lng / 15 - sp.eqt));
  const alt = asin(sin(c.lat) * sin(sp.decl) + cos(c.lat) * cos(sp.decl) * cos(H));
  const az = fix(atan2(sin(H), cos(H) * sin(c.lat) - tan(sp.decl) * cos(c.lat)) + 180, 360);
  return {alt, az};
}
export function qiblaBearing(c){
  const dl = KAABA.lng - c.lng;
  return fix(atan2(sin(dl), cos(c.lat) * tan(KAABA.lat) - sin(c.lat) * cos(dl)), 360);
}
export function distKm(c){
  const dLat = rad(KAABA.lat - c.lat), dLng = rad(KAABA.lng - c.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(c.lat)) * Math.cos(rad(KAABA.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// The minute today when the sun stands exactly over the qibla direction (null if it never does).
export function sunQiblaTime(c, qb){
  const d = iraqNow(); let best = null;
  for(let m = 5 * 60; m <= 20 * 60; m++){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m);
    const s = sunAltAz(x, c); if(s.alt < 5) continue;
    const diff = Math.abs(((s.az - qb + 540) % 360) - 180);
    if(!best || diff < best.diff) best = {diff, x};
  }
  return best && best.diff <= 1.5 ? best.x : null;
}

/* ---------- Firebase (optional: only when firebase-config.js is filled in) ---------- */
const FB_VER = "10.12.2";
export const firebaseReady = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !/^YOUR_|^PASTE/.test(FIREBASE_CONFIG.apiKey));
let fbPromise = null;
export function fb(){
  if(!firebaseReady) return Promise.reject(new Error("not-configured"));
  if(!fbPromise){
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    fbPromise = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js"), import(base + "firebase-auth.js")])
      .then(([app, fs, auth]) => {
        const a = app.initializeApp(FIREBASE_CONFIG);
        return {fs, auth, db:fs.getFirestore(a), au:auth.getAuth(a)};
      })
      .catch(e => { fbPromise = null; throw e; });
  }
  return fbPromise;
}
const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999);
export function cachedContent(){
  return {
    adhkar: store.get("c.adhkar", null) || DEFAULT_ADHKAR,
    duas: store.get("c.duas", null) || DEFAULT_DUAS,
    times: Object.assign({}, DEFAULT_TIMES, store.get("c.times", null) || {})
  };
}
// Fetch the admin's latest content; cache it so the app keeps working offline.
export async function refreshContent(){
  if(!navigator.onLine) throw new Error("offline");
  const {fs, db} = await fb();
  const [a, d, t] = await Promise.all([
    fs.getDocs(fs.collection(db, "adhkar")), fs.getDocs(fs.collection(db, "duas")), fs.getDoc(fs.doc(db, "config", "times"))
  ]);
  const adhkar = a.docs.map(x => Object.assign({id:x.id}, x.data())).sort(byOrder);
  const duas = d.docs.map(x => Object.assign({id:x.id}, x.data())).sort(byOrder);
  if(adhkar.length) store.set("c.adhkar", adhkar);
  if(duas.length) store.set("c.duas", duas);
  if(t.exists()) store.set("c.times", t.data());
  store.set("c.at", Date.now());
  return cachedContent();
}
export async function sendSuggestion(s){
  const {fs, db} = await fb();
  return fs.addDoc(fs.collection(db, "suggestions"), {
    type:String(s.type).slice(0, 40), text:String(s.text).slice(0, 2000), name:String(s.name || "").slice(0, 80),
    contact:String(s.contact || "").slice(0, 120), status:"new", createdAt:fs.serverTimestamp()
  });
}
export { DEFAULT_ADHKAR, DEFAULT_DUAS, DEFAULT_TIMES };
