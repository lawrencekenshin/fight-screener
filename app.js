/* Fight Video Screener page. Reads /data/screen.json (collect.py), /api/status (the daily run) and /api/marks (saved /
   hidden, shared by every browser that opens the page). UI state (tab, filters) is per browser in localStorage. */
'use strict';
// The read-only copy for your editor (publish.py: GitHub Pages) marks <html data-static="1">: plain files, no writes.
const STATIC = document.documentElement.dataset.static === '1';
const URLS = STATIC ? { screen: 'data/screen.json', status: 'data/status.json', marks: 'data/marks.json' }
  : { screen: '/data/screen.json', status: '/api/status', marks: '/api/marks' };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('fvs.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fvs.' + k, JSON.stringify(v)); } catch (e) { /* private window */ } },
};
const DEF = {
  tab: 'today', rank: 'score', win: 'month', sport: 'All', type: 'footage', len: 'any', lang: 'en', q: '', subj: '',
  ufcDesc: false, hideUfcNames: false, realThumbs: false,
  rxRank: 'out', rxWin: 'year', rxType: 'all', rxSport: 'All',
  sjSort: 'opp', sjQ: '', sjSport: 'All', meSort: 'out', nxMma: false, nxNew: false, nxRecent: false,
};
const S = Object.assign({}, DEF, store.get('state', {}));
const PAGE = 40;
const shown = { screener: PAGE, remixes: PAGE, subjects: 60, mine: PAGE };
const WIN = { today: 1, week: 7, month: 31, year: 366, all: Infinity };
const TYPE_SETS = {
  footage: ['Full fight', 'Fight', 'Knockouts', 'Sparring', 'Street/viral', 'Other', 'Event stream'],
  fights: ['Full fight', 'Fight', 'Knockouts'], street: ['Street/viral'], sparring: ['Sparring'],
  events: ['Event stream'], training: ['Training/tech'], talk: ['Talk/news'],
  remix: ['Breakdown', 'Story', 'Reaction'], all: null,
};
const MIN_VIEWS_OUTLIER = 10000;
let D = null;
let STATUS = null;
let MARKS = { saved: {}, hidden: {}, ideas: {} };
const VID = new Map();
const opened = new Set();            // Today rows expanded to their uploads

/* ---------- formatting */
function fmt(x) {
  if (x == null) return '—';
  const a = Math.abs(x);
  const cut = (y, d) => y.toFixed(d).replace(/\.0$/, '');
  if (a >= 1e9) return cut(x / 1e9, 1) + 'B';
  if (a >= 1e6) return cut(x / 1e6, a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return cut(x / 1e3, a >= 1e4 ? 0 : 1) + 'K';
  return String(Math.round(x));
}
const ox = x => x == null ? '—' : (x >= 10 ? Math.round(x) : x.toFixed(1)) + '×';
function ago(d) {
  if (d == null) return '';
  if (d < 1) return Math.max(1, Math.round(d * 24)) + ' h';
  if (d < 45) return Math.round(d) + ' d';
  if (d < 365) return Math.round(d / 30.4) + ' mo';
  return (d / 365).toFixed(d < 3650 ? 1 : 0).replace(/\.0$/, '') + ' y';
}
function dur(s) {
  if (!s) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nm = k => (D && D.names && D.names[k]) || String(k).replace(/\b\w/g, c => c.toUpperCase());
const yt = id => 'https://www.youtube.com/watch?v=' + id;
const thumb = id => S.realThumbs ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : `https://i.ytimg.com/vi/${id}/hq2.jpg`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const save = () => store.set('state', S);
const resetPages = () => { shown.screener = shown.remixes = shown.mine = PAGE; shown.subjects = 60; };
const isoDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shiftDay = (day, n) => isoDay(new Date(day + 'T12:00:00').getTime() + n * 864e5);
const hhmm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
function when(t) {                     // 'today HH:MM', 'yesterday HH:MM', 'Tue HH:MM', in the viewer's time
  if (t == null) return '';
  const ms = typeof t === 'number' ? t * 1000 : Date.parse(t);
  const d = isoDay(ms), today = isoDay(Date.now());
  const word = d === today ? 'today' : d === shiftDay(today, -1) ? 'yesterday' : d === shiftDay(today, 1) ? 'tomorrow'
    : new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return word + ' ' + hhmm(ms);
}
const weekday = day => new Date(day + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });

/* ---------- data */
async function load() {
  let d;
  try {
    const r = await fetch(URLS.screen, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    d = await r.json();
  } catch (e) {
    if (!D) statusLine();               // a board already on screen stays up; with none, the status line says why
    return false;
  }
  try { MARKS = await (await fetch(URLS.marks, { cache: 'no-store' })).json(); } catch (e) { /* keep */ }
  D = d;
  prep();
  render();
  return true;
}

function prep() {
  VID.clear();
  NXRX = null;
  for (const v of D.videos) {
    v.ageD = v.ts ? (D.built_ts - v.ts) / 86400 : null;
    v.heat = v.vm != null ? v.vm : v.gs === 'u' ? v.g24 : null;        // measured, or "since upload" for day-old uploads
    v.hay = [v.t, v.ch, ...v.subj.map(nm)].join(' ').toLowerCase();
    VID.set(v.id, v);
  }
  D.subjMap = new Map(D.subjects.map(s => [s.key, s]));
  $('#fitList').textContent = Object.entries(D.fit).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${x}`).join(' · ');
  const st = D.stats;
  $('#srcLine').textContent = `YouTube search sorted by view count, as a ${D.region} English viewer sees it: ` +
    `${st.searches} searches (${D.sports.length} sports × upload windows), ` +
    `${st.channels} channels checked for their usual views, ${st.details} watch pages read for exact dates, ` +
    `${st.rechecked || 0} tracked videos re-read. Off-topic removed: ${fmt(st.off_topic)} (films, music, games, wrestling). ` +
    `UFC removed: ${fmt(st.ufc_dropped)}.`;
  statusLine();
}

/* ---------- the status line: one line, a coloured dot, never a banner */
function statusLine() {
  const st = STATUS || {};
  const now = Date.now() / 1000;
  const today = isoDay(Date.now());
  let cls, text;
  const builtTs = D ? D.built_ts : st.built_ts;
  const showing = builtTs ? ' · showing ' + when(builtTs) : '';
  if (!STATUS) {
    text = (STATIC ? "Can't load this copy's status" : "Can't reach the Studio") + showing;
  } else if (st.refreshing) {
    cls = 'run';
    text = 'Updating now' + (st.running && st.running.started ? ' · started ' + hhmm(Date.parse(st.running.started)) : '');
  } else if (st.ok === false) {
    const fd = st.failed ? isoDay(Date.parse(st.failed)) : today;
    const whose = fd === today ? "Today's" : fd === shiftDay(today, -1) ? "Yesterday's" : weekday(fd) + "'s";
    cls = st.retry_at ? 'warn' : 'bad';
    text = whose + (st.retry_at || (st.consecutive_failures || 1) < 2 ? ' update failed' : ' updates failed') + showing +
      (st.retry_at ? ' · retry ' + st.retry_at : st.next_run ? ' · next ' + when(st.next_run) : '');
  } else if (D) {
    const due = Date.parse(st.next_run || D.next_run) / 1000;
    if (D.day === today) {
      cls = 'ok';
      text = `Updated ${when(D.built_ts)} · next ${when(D.next_run)} · day ${D.days || 1} of tracking`;
    } else if (now < due + 1800) {
      cls = 'ok';
      text = `Updated ${when(D.built_ts)} · next ${when(st.next_run || D.next_run)}`;
    } else {
      cls = 'bad';
      text = `Last update ${when(D.built_ts)} · the daily run has not run since`;
    }
  } else if (st.ok == null) {
    text = 'No data yet: the first run starts at the next daily slot, or press Run now.';
  } else if (STATIC) {
    cls = 'bad';
    text = 'The board did not load: reload the page in a minute.';
  }
  const why = st.ok === false && (st.error || st.reason) ? ` title="${esc(st.error || st.reason)}"` : '';
  const part = D && D.partial && D.partial.length && st.ok !== false
    ? ` <span class="muted" title="${esc(D.partial.join('; '))}">· ${esc(D.partial[0])}</span>` : '';
  $('#asof').innerHTML = `<i class="dot ${cls || ''}"></i><span${why}>${esc(text || '')}</span>${part}`;
  const noGoodRun = st.ok === false || cls === 'bad' || (!D && !st.refreshing);
  $('#refresh').hidden = !STATUS || !noGoodRun || !!st.refreshing;
}

/* ---------- small pieces */
function bars(arr) {
  if (!arr || !arr.some(x => x != null)) return '';
  const bw = 3, gap = 2, H = 18, W = arr.length * (bw + gap) - gap;
  const max = Math.max(1, ...arr.filter(x => x != null));
  const cols = arr.map((g, i) => {
    const x = i * (bw + gap);
    if (g == null) return `<rect x="${x}" y="${H - 1}" width="${bw}" height="1" class="nil"/>`;
    const h = Math.max(1, Math.round(g / max * (H - 1)));
    return `<rect x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="1" class="${i === arr.length - 1 ? 'cur' : 'old'}"/>`;
  }).join('');
  const last = arr[arr.length - 1];
  return `<svg class="bars" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>Views gained per day, last ${arr.length} days${last != null ? ' · today +' + fmt(last) : ''}</title>${cols}</svg>`;
}
function sumBars(ids) {
  const arrs = ids.map(i => (VID.get(i) || {}).sp).filter(Boolean);
  if (!arrs.length) return null;
  return arrs[0].map((_, k) => { const xs = arrs.map(a => a[k]).filter(x => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; });
}
const isNew = v => v.first && D.day && v.first === D.day && D.first_day !== D.day;
function gainText(g, span, day = 'in 24 h') {   // a measured gain over `span` days (back to the previous reading)
  const d = span == null || (span >= 0.8 && span <= 1.2) ? null : span;
  return d ? ['+' + fmt(g) + '/day', `last ${d} d`] : ['+' + fmt(g), day];
}
function gainCell(v) {                 // what the daily number IS, in words
  if (v.vm != null) return [...gainText(v.vm, v.d1d, 'last 24 h'), ''];
  if (v.gs === 'u') return ['+' + fmt(v.g24), 'since upload', ''];
  return [v.vpd != null ? '~' + fmt(v.vpd) : '—', 'avg/day', 'dim'];
}
function stateBadges(v) {
  const b = [];
  if (isNew(v)) b.push('<span class="b new" title="First seen by the screener today; the upload age is shown above">New</span>');
  if (v.st === 'climbing') b.push(`<span class="b up" title="Views gained in the last day against its own pace, compared with videos of the same age: ${v.tr}×">▲ climbing</span>`);
  if (v.st === 'fading') b.push(`<span class="b dim" title="Gaining slower than videos of the same age usually do (${v.tr}×)">▼ cooling</span>`);
  if ((v.fl || []).includes('resurging')) b.push('<span class="b up" title="An older video suddenly gaining 5× its usual pace">Resurging</span>');
  if ((v.fl || []).includes('tracked')) b.push('<span class="b" title="No longer in today\'s search results; its watch page was re-read so its line keeps going">Tracked</span>');
  if ((v.fl || []).includes('promoted')) b.push('<span class="b" title="Found in its channel\'s newest uploads, already 5×+ the channel\'s usual">Fresh from channel</span>');
  return b.join('');
}

/* ---------- filters */
function screenerFilter(ignoreSport, back = 0) {    // back = 1: the upload window as it stood a day earlier
  const set = TYPE_SETS[S.type];
  const q = S.q.trim().toLowerCase();
  return D.videos.filter(v =>
    !MARKS.hidden[v.id] &&
    (ignoreSport || S.sport === 'All' || v.sport === S.sport) &&
    (S.subj ? v.subj.includes(S.subj)
      : (!set || set.includes(v.type)) && (S.win === 'all' || (v.ageD != null && v.ageD - back <= WIN[S.win]))) &&
    (S.len === 'any' || v.len === S.len) &&
    (S.lang === 'all' || v.lang === 'en') &&
    (S.ufcDesc || v.ufc === 0) &&
    (!S.hideUfcNames || !v.un) &&
    (!q || v.hay.includes(q)) &&
    (S.rank !== 'out' || (v.out != null && v.v >= MIN_VIEWS_OUTLIER)));
}
const sorters = {
  score: (a, b) => b.sc - a.sc,
  out: (a, b) => (b.out || 0) - (a.out || 0),
  heat: (a, b) => (b.heat || 0) - (a.heat || 0),
  views: (a, b) => (b.v || 0) - (a.v || 0),
};

function remixFilter(ignoreSport) {
  return D.videos.filter(v =>
    v.rx && !MARKS.hidden[v.id] &&
    (ignoreSport || S.rxSport === 'All' || v.sport === S.rxSport) &&
    (S.rxType === 'all' || v.type === S.rxType) &&
    (S.rxWin === 'all' || (v.ageD != null && v.ageD <= WIN[S.rxWin])) &&
    (S.lang === 'all' || v.lang === 'en') &&
    (S.ufcDesc || v.ufc === 0) &&
    (S.rxRank !== 'out' || (v.out != null && v.v >= MIN_VIEWS_OUTLIER)));
}

/* ---------- pieces */
function chips(box, key, rowsAll) {
  const counts = {};
  for (const v of rowsAll) counts[v.sport] = (counts[v.sport] || 0) + 1;
  const opts = ['All', ...D.sports];
  box.innerHTML = opts.map(s => `<button type="button" class="chip${S[key] === s ? ' on' : ''}" data-v="${esc(s)}">${esc(s)}` +
    `<span class="n">${fmt(s === 'All' ? rowsAll.length : counts[s] || 0)}</span></button>`).join('');
}

function supplyFor(v) {
  let best = null;
  for (const k of v.subj) {
    const s = D.subjMap.get(k);
    if (s && s.supply && (!best || s.supply.n > best.n)) best = { n: s.supply.n, name: s.name, top: s.supply.top };
  }
  return best;
}

function bar(v) {
  const fit = D.fit[v.type] != null ? D.fit[v.type] : 0.6;
  const segs = ['demand', 'outlier', 'heat', 'proven']
    .map(k => `<i class="s-${k}" style="width:${(100 * fit * D.weights[k] * v.p[k]).toFixed(1)}%"></i>`).join('');
  const tip = `demand ${v.p.demand} · outlier ${v.p.outlier} · heat ${v.p.heat} · proven ${v.p.proven} · footage fit ${fit}`;
  return `<div class="bar" title="${tip}">${segs}</div>`;
}

function card(v, rank, hl, pill) {
  const saved = !!MARKS.saved[v.id];
  const b = [];
  b.push(`<span class="b type">${esc(v.type)}</span>`);
  b.push(stateBadges(v));
  if (v.mine) b.push('<span class="b mine">Yours</span>');
  if (v.len === 'short') b.push('<span class="b">Short</span>');
  if (v.lang !== 'en') b.push(`<span class="b">${esc(v.lang.toUpperCase())}</span>`);
  if (v.un) b.push(`<span class="b warn" title="A current UFC fighter or a past UFC title fighter is named in the title. Check where the footage is from.">UFC name · ${esc(nm(v.un))}</span>`);
  if (v.ufc === 1) b.push('<span class="b warn" title="UFC is mentioned in the description only">UFC in description</span>');
  const pv = v.pv;
  if (pv && pv.o >= 1.5) b.push(`<a class="b good" href="${yt(pv.oid)}" target="_blank" rel="noopener" title="${esc((VID.get(pv.oid) || {}).t || 'A remix about ' + nm(pv.s))}">Remix did ${ox(pv.o)} · ${esc(nm(pv.s))}</a>`);
  if (pv && pv.m >= 1.2) b.push(`<a class="b mine" href="${yt(pv.mid)}" target="_blank" rel="noopener" title="Your upload about ${esc(nm(pv.s))} did ${ox(pv.m)} your usual views">Worked for you ${ox(pv.m)}</a>`);
  const sup = supplyFor(v);
  if (sup) b.push(`<span class="b" title="Breakdowns, stories or reactions about ${esc(sup.name)} uploaded in the last 30 days${sup.top ? ': biggest ' + esc(sup.top.t) + ' (' + fmt(sup.top.v) + ' views)' : ''}">${sup.n} breakdown${sup.n === 1 ? '' : 's'}, 30 d</span>`);
  const subj = v.subj.map(k => `<button type="button" class="chip subj" data-subj="${esc(k)}">${esc(nm(k))}</button>`).join('');
  const whenUp = v.ageD != null ? (v.exact ? '' : '~') + ago(v.ageD) + ' ago' : '';
  const meta = [esc(v.ch), v.subs ? fmt(v.subs) + ' subs' : '', whenUp, esc(v.sport)].filter(Boolean).join(' · ');
  const [gv, gl, gc] = gainCell(v);
  const cell = (k, val, lab, cls) => `<div class="${hl === k ? 'hl ' : ''}${cls || ''}"><b>${val}</b><span>${lab}</span></div>`;
  return `<article class="card${v.mine ? ' mine' : ''}">
  <a class="thumb" href="${yt(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt="">` +
    (v.d ? `<span class="dur">${dur(v.d)}</span>` : '') + (rank ? `<span class="rank">${rank}${pill || ''}</span>` : '') + `</a>
  <div class="body"><a class="title" href="${yt(v.id)}" target="_blank" rel="noopener">${esc(v.t)}</a>
    <div class="meta">${meta}</div><div class="badges">${b.join('')}${subj}</div></div>
  <div class="nums">
    ${cell('score', Math.round(v.sc), 'remix score')}${cell('views', fmt(v.v), 'views')}${cell('heat', gv, gl, gc)}${cell('out', ox(v.out), v.base ? 'vs usual ' + fmt(v.base) : 'vs channel')}
    <div class="scorebox">${bar(v)}${bars(v.sp)}</div>
  </div>
  <div class="acts">
    <button type="button" class="icon${saved ? ' on' : ''}" data-act="${saved ? 'unsave' : 'save'}" data-id="${v.id}" title="${saved ? 'Remove from saved' : 'Save'}">${saved ? '★' : '☆'}</button>
    <button type="button" class="icon" data-act="hide" data-id="${v.id}" title="Hide everywhere">✕</button>
  </div>
</article>`;
}

const empty = msg => `<div class="empty">${esc(msg)}</div>`;
const note = msg => `<div class="note">${esc(msg)}</div>`;

function moreBtn(name, total) {
  $(`[data-more="${name}"]`).hidden = total <= shown[name];
}

/* ---------- Today */
function groupRow(g, kind) {
  const ids = g.ids.filter(i => !MARKS.hidden[i]);
  if (!ids.length) return '';
  const best = VID.get(ids[0]) || { id: ids[0], t: g.name };
  const gone = g.ids.filter(i => MARKS.hidden[i]).map(i => VID.get(i)).filter(Boolean);    // hidden since the build
  const n = g.n - gone.length, views = g.views - gone.reduce((a, v) => a + (v.v || 0), 0);
  const g24 = g.g24 == null ? null : g.g24 - gone.reduce((a, v) => a + (v.g24 || 0), 0);
  let out = g.out, outAge = g.out_age;
  if (g.out_id && MARKS.hidden[g.out_id]) {
    const top = ids.map(i => VID.get(i)).filter(v => v && v.out != null).sort((a, b) => b.out - a.out)[0];
    out = top ? top.out : null; outAge = top ? top.ageD : null;
  }
  let big, lab;
  if (kind === 'breakouts') { big = ox(out); lab = `its channel's usual · ${ago(outAge != null ? outAge : g.age)} old`; }
  else if (kind === 'top24') { [big, lab] = g.gs === 'm' ? gainText(g24, g.g24d) : ['+' + fmt(g24), 'since upload']; }
  else { big = String(Math.round(g.sc)); lab = 'remix score'; }
  const info = [`${n} upload${n === 1 ? '' : 's'}`, fmt(views) + ' views', out != null ? 'best ' + ox(out) : '',
    g.supply ? `${g.supply.n} breakdown${g.supply.n === 1 ? '' : 's'} out` : ''].filter(Boolean).join(' · ');
  const isOpen = opened.has(kind + g.key);
  const first = g.key.startsWith('p:') || g.key.startsWith('s:') ? g.key.slice(2).split('+')[0] : null;
  const saved = !!MARKS.saved[best.id];
  return `<article class="grow${isOpen ? ' open' : ''}">
  <div class="mini">
    <a class="thumb" href="${yt(best.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(best.id)}" alt="">${best.d ? `<span class="dur">${dur(best.d)}</span>` : ''}</a>
    <div class="body">
      <button type="button" class="gname" data-open="${esc(kind + g.key)}" aria-expanded="${isOpen}" title="${esc(best.t)}">${esc(g.name)}</button>
      <div class="gline"><b>${big}</b><span>${esc(lab)}</span>${bars(sumBars(ids))}${g.new ? '<span class="b new">New</span>' : ''}</div>
      <div class="meta" title="${esc(info)}">${esc(info)}</div>
    </div>
    <div class="acts"><button type="button" class="icon${saved ? ' on' : ''}" data-act="${saved ? 'unsave' : 'save'}" data-id="${best.id}" title="${saved ? 'Remove from saved' : 'Save the best upload'}">${saved ? '★' : '☆'}</button></div>
  </div>
  ${isOpen ? `<div class="gmembers">${ids.map(i => VID.get(i)).filter(Boolean).map(v => card(v, 0, '')).join('')}` +
    (first ? `<button type="button" class="btn small" data-subj="${esc(first)}">All ${esc(nm(first))} videos in Screener</button>` : '') + '</div>' : ''}
</article>`;
}

function renderToday() {
  const T = D.today || { breakouts: [], top24: [], fresh: [], rising: [], counts: {} };
  const c = T.counts || {};
  const st = STATUS || {};
  const overdue = Date.now() / 1000 > Date.parse(st.next_run || D.next_run) / 1000 + 1800;
  const tag = (st.ok === false || overdue) && D.day !== isoDay(Date.now()) ? ` <span class="tag">from ${esc(weekday(D.day))}</span>` : '';
  $$('.tsec h3 .from').forEach(x => { x.innerHTML = tag; });
  const top = T.top_mover || T.top24[0];
  const [topG, topL] = top ? (top.gs === 'm' ? gainText(top.g24, top.g24d) : ['+' + fmt(top.g24), 'since upload']) : ['—', 'in 24 h'];
  const topWord = topL === 'in 24 h' || topL === 'since upload' ? 'most ' + topL : 'most a day, ' + topL;
  $('#today-head').innerHTML = [
    [String(c.breakouts || 0), 'breakouts (5×+ in 7 days)'],
    [topG, topWord + (top ? ' · ' + esc(top.name) : '')],
    [D.first_day === D.day ? '—' : String(c.fresh || 0), 'new uploads'],
  ].map(([x, l]) => `<div><b>${x}</b><span>${l}</span></div>`).join('');
  const me = D.me && D.me.videos.find(u => u.latest);
  $('#t-mine-sec').hidden = !me;
  if (me) {
    const vs = D.me.base_next ? ` · ${ox(me.v / D.me.base_next)} your usual ${fmt(D.me.base_next)}` : '';
    $('#t-mine').innerHTML = `<div class="mini mine"><a class="thumb" href="${yt(me.id)}" target="_blank" rel="noopener"><img loading="lazy" src="https://i.ytimg.com/vi/${me.id}/mqdefault.jpg" alt=""></a>
      <div class="body"><a class="title" href="${yt(me.id)}" target="_blank" rel="noopener">${esc(me.t)}</a>
      <div class="gline"><b>${fmt(me.v)}</b><span>views${vs}</span>${me.g24 != null ? (([a, b]) => `<b>${a}</b><span>${b}</span>`)(gainText(me.g24, me.g24d)) : ''}${bars(me.sp)}</div></div><div></div></div>`;
  }
  const list = (sel, kind, rows, startsMsg) => {
    $(sel).innerHTML = rows.length ? rows.map(g => groupRow(g, kind)).join('') : note(startsMsg);
  };
  list('#t-breakouts', 'breakouts', T.breakouts, 'No upload from the last 7 days is at 5× its channel with 20K+ views.');
  $('#t-breakouts-all').textContent = c.breakouts > T.breakouts.length ? `All ${c.breakouts}` : '';
  list('#t-top24', 'top24', T.top24, D.days < 2 ? 'Starts with the next daily update: it compares two days.' : 'Nothing measured in the last day.');
  list('#t-fresh', 'fresh', T.fresh, D.first_day === D.day ? `Starts ${weekday(shiftDay(D.day, 1))}: the first day has nothing to compare with.` : 'No new upload from the last 3 days on this update.');
  const rising = (T.rising || []).map(k => D.subjMap.get(k)).filter(s => s && !(S.hideUfcNames && s.ufc));
  const anyDays = Math.max(0, ...D.subjects.map(s => s.tr_days || 0));
  $('#t-subjects').innerHTML = rising.length ? rising.map(s =>
    `<button type="button" class="riser" data-subj="${esc(s.key)}"><span class="x">▲ ${ox(s.trend)}</span><b>${esc(s.name)}</b>${s.ufc ? '<span class="utag">UFC</span>' : ''}
      <span class="s">${gainText(s.gain, s.g24d).join(' ')}${s.supply ? ` · ${s.supply.n} out` : ''}</span></button>`).join('')
    : note(anyDays >= 2 ? 'No fighter is gaining faster than over their last days.'
      : D.day < shiftDay(D.first_day, 3) ? `Starts ${weekday(shiftDay(D.first_day, 3))}: it needs four daily updates.`
      : 'It needs two earlier days with a measured gain.');
  const saved = Object.keys(MARKS.saved).map(id => VID.get(id)).filter(Boolean)
    .sort((x, y) => (y.g24 || 0) - (x.g24 || 0)).slice(0, 10);
  $('#t-saved').innerHTML = saved.length ? saved.map(v => {
    const [gv, gl] = gainCell(v);
    return `<div class="mini"><a class="thumb" href="${yt(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>
      <div class="body"><a class="title" href="${yt(v.id)}" target="_blank" rel="noopener">${esc(v.t)}</a>
      <div class="gline"><b>${gv}</b><span>${gl}</span>${bars(v.sp)}${stateBadges(v)}</div><div class="meta">${esc(v.ch)} · ${fmt(v.v)} views</div></div>
      <div class="acts"><button type="button" class="icon on" data-act="unsave" data-id="${v.id}" title="Remove from saved">★</button></div></div>`;
  }).join('') : note('Tap ☆ on any video to follow it here.');
}

/* ---------- Next video */
const NX_REASONS = ['Covered recently', 'Footage not usable', 'Not my style', 'Other'];
const NX_KIND = { thai_legend: 'Thai legend', thai_star: 'Thai star', kickboxer: 'Kickboxer', karate: 'Karate',
  taekwondo: 'Taekwondo', boxer: 'Boxer', mma: 'MMA' };
const NX_TECH = /\b(how to|techniques?|drills?|tutorial|tips|lesson|footwork|explained|guide)\b/i;   // nextvideo.py
const NX_GUEST = /\b(q ?& ?a|podcast|interview|channel update|announcement|giveaway|vlog|livestream)\b/i;
let nxWhy = null;                       // the row whose "Not for us" reasons are open
let NXRX = null, NXMAP = null, NXNOT = null;
const nxEsc = a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nxNorm = s => s.replace(/[’‘]/g, "'").normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
function nxMatch(title) {               // roster fighters a title names, as nextvideo.match does
  const N = D.next;
  if (!N || !title) return [];
  if (!NXRX) {
    NXMAP = new Map(N.aliases);
    const pats = N.aliases.map(a => a[0]).sort((a, b) => b.length - a.length).map(nxEsc);
    NXRX = new RegExp(`(?<!\\w)(?<!\\w')(${pats.join('|')})(?!\\w)`, 'g');
    NXNOT = new Map(Object.entries(N.not_after || {}).map(([k, bad]) =>
      [k, new RegExp(`(?:^|[\\s(|/\\-])(?:${bad.map(b => nxEsc(nxNorm(b))).join('|')}) ?$`)]));
  }
  const t = nxNorm(title), out = [];
  for (const m of t.matchAll(NXRX)) {
    const k = NXMAP.get(m[1]);
    if (!k || out.includes(k) || (NXNOT.get(k) && NXNOT.get(k).test(t.slice(0, m.index)))) continue;
    out.push(k);
  }
  return out;
}
const nxGroupOf = k => D.next.kinds[k] === 'thai_legend' ? 'thai_legend' : 'named';
const nxDay = day => day ? new Date(day + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
const nxSince = day => day ? new Date(day + 'T12:00:00').toLocaleDateString([], { month: 'short', year: 'numeric' }) : '';
function nxNone() {                     // titles with no fighter named, for Check an idea
  const N = D.next, g = N.none;
  if (!g || !N.usual) return null;
  const typical = Math.round(g.factor * N.usual), b = N.bands || {};
  return { key: 'none', name: 'No fighter named', n: g.n, median: g.median, factor: g.factor, typical,
    half: b.half && b.half[0] ? b.half.map(x => Math.round(x * typical)) : null };
}
function nxRange(g) {
  if (!g || !g.typical) return 'not enough of your uploads yet';
  const since = D.me && D.me.angles_from ? ' since ' + nxSince(D.me.angles_from) : '';
  return `typical ~${fmt(g.typical)} (${ox(g.factor)} your usual, ${g.n} uploads${since})` +
    (g.half ? ` · half land ${fmt(g.half[0])}–${fmt(g.half[1])}` : '') + (g.most ? `, 80% ${fmt(g.most[0])}–${fmt(g.most[1])}` : '');
}
function nxRows(g) {
  const ideas = MARKS.ideas || {};
  const recent = D.built_ts - 182 * 86400;
  return g.rows.filter(r => !(ideas[r.key] && ideas[r.key].state) && (S.nxMma || r.lane) && (!S.nxNew || !r.you.n) &&
    (!S.nxRecent || !(r.you.last && r.you.last.ts && r.you.last.ts > recent)));
}
function nxFacts(r) {
  const f = r.footage;
  const foot = f ? [`${f.n} footage video${f.n === 1 ? '' : 's'}`, `${f.fights} fight${f.fights === 1 ? '' : 's'} of 8–60 min`,
    `longest ${Math.round(f.longest / 60)} min`, `${fmt(r.views)} views`, f.official ? 'official upload' : `${f.channels} channel${f.channels === 1 ? '' : 's'}`].join(' · ')
    : 'No usable footage found on YouTube: your archive';
  const cov = !r.cover ? '' : r.cover.n
    ? `${r.cover.n} breakdown${r.cover.n === 1 ? '' : 's'} with ${fmt(10000)}+ views in the last 30 days`
    : `no breakdown with ${fmt(10000)}+ views in the last 30 days`;
  const you = r.you.n
    ? `your videos on them: ${r.you.n}` + (r.you.last && r.you.last.out != null ? ` · last one ${ox(r.you.last.out)} your usual` : '')
    : '';
  const b = r.board || {};
  const board = [b.heat ? `heat ${fmt(b.heat)} views a day` : '', b.opp ? `Opportunity ${Math.round(b.opp)}` : '',
    r.g24 ? `footage +${fmt(r.g24)} in 24 h` : ''].filter(Boolean).join(' · ');
  return [foot, [cov, you].filter(Boolean).join(' · '), board ? 'On the board: ' + board : ''];
}
function nxRow(r, g) {
  const best = r.pack[0];
  const isOpen = opened.has('nx:' + r.key);
  const [foot, more, board] = nxFacts(r);
  const badges = r.badges.map(([c, t]) => `<span class="b${c === 'fresh' ? ' good' : c === 'new' ? ' mine' : ''}">${esc(t)}</span>`).join('');
  const kind = [NX_KIND[r.kind] || '', (r.sports || []).join(', ')].filter(Boolean).join(' · ');
  const why = nxWhy === r.key ? `<div class="reasons">${NX_REASONS.map(x => `<button type="button" class="chip" data-idea="not" data-key="${esc(r.key)}" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
  return `<article class="grow nx${isOpen ? ' open' : ''}">
  <div class="mini">
    ${best ? `<a class="thumb" href="${yt(best.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(best.id)}" alt="">${best.d ? `<span class="dur">${dur(best.d)}</span>` : ''}</a>`
      : '<div class="thumb arch"><span>Archive</span></div>'}
    <div class="body">
      <button type="button" class="gname" data-open="nx:${esc(r.key)}" aria-expanded="${isOpen}">${esc(r.name)}</button>
      <div class="gline">${badges}<span>${esc(kind)}</span></div>
      <div class="meta">${esc(foot)}</div>
      ${more ? `<div class="meta">${esc(more)}</div>` : ''}${board ? `<div class="meta">${esc(board)}</div>` : ''}
    </div>
    <div class="acts nxacts">
      <button type="button" class="btn small" data-idea="picked" data-key="${esc(r.key)}">Pick</button>
      <button type="button" class="btn small" data-why="${esc(r.key)}" aria-expanded="${nxWhy === r.key}">Not for us</button>
    </div>
  </div>${why}${isOpen ? nxDetail(r) : ''}
</article>`;
}
function nxDetail(r) {
  const ago2 = ts => ts ? ago((D.built_ts - ts) / 86400) + ' ago' : '';
  const pack = r.pack.map(p => `<li><a href="${yt(p.id)}" target="_blank" rel="noopener">${esc(p.t)}</a>
    <span class="muted">${[esc(p.ch || ''), p.d ? dur(p.d) : '', fmt(p.v) + ' views', ago2(p.ts)].filter(Boolean).join(' · ')}</span>${p.off ? ' <span class="b good">Official</span>' : ''}</li>`).join('');
  const cov = r.cover && r.cover.top.length ? `<h4>Already broken down (last 30 days)</h4><ul>${r.cover.top.map(c =>
    `<li><a href="${yt(c.id)}" target="_blank" rel="noopener">${esc(c.t)}</a> <span class="muted">${esc(c.ch || '')} · ${fmt(c.v)} views</span></li>`).join('')}</ul>` : '';
  const yours = [r.you.last, r.you.best].filter((u, i, a) => u && a.findIndex(x => x && x.id === u.id) === i);
  const mine = yours.length ? `<h4>Your videos on ${esc(r.name)}</h4><ul>${yours.map(u =>
    `<li><a href="${yt(u.id)}" target="_blank" rel="noopener">${esc(u.t)}</a> <span class="muted">${fmt(u.v)} views${u.out != null ? ' · ' + ox(u.out) + ' your usual then' : ''}</span></li>`).join('')}</ul>` : '';
  const q = encodeURIComponent(r.name + ' full fight');
  return `<div class="nxdetail"><h4>Footage, official uploads first</h4>
    <ul class="pack">${pack || '<li class="muted">None on YouTube that names them: use your archive.</li>'}</ul>
    <div class="crow"><a class="btn small" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Search YouTube: ${esc(r.name)} full fight</a>
      <button type="button" class="btn small" data-copy-pack="${esc(r.key)}">Copy footage pack</button></div>${cov}${mine}</div>`;
}
function nxProgress() {
  const N = D.next, ideas = MARKS.ideas || {};
  const built = new Map((N.progress || []).map(p => [p.key, p]));
  return Object.entries(ideas).filter(([, i]) => i.state === 'picked' || i.state === 'made').map(([k, i]) => {
    const p = built.get(k) || { key: k, name: i.name || N.names[k] || k, new_footage: 0, new: [], upload: null, verdict: null };
    return Object.assign({}, p, { state: i.state, at: i.at, made_at: i.made_at, range: i.range || p.range || {} });
  }).sort((a, b) => b.at - a.at);
}
function nxProgressRow(p) {
  const rg = p.range || {};
  const range = rg.typical ? `range at Pick: typical ~${fmt(rg.typical)}${rg.half ? `, half land ${fmt(rg.half[0])}–${fmt(rg.half[1])}` : ''}${rg.most ? `, 80% ${fmt(rg.most[0])}–${fmt(rg.most[1])}` : ''}` : '';
  const where = { above: 'above the middle half', inside: 'inside the middle half', below: 'below the middle half' }[p.verdict];
  const verdict = where && (p.early ? 'on track for ' + where : where);
  const up = p.upload ? `Your upload: <a href="${yt(p.upload.id)}" target="_blank" rel="noopener">${esc(p.upload.t)}</a> · ${fmt(p.upload.v)} views` +
    (p.upload.age != null ? ` at ${ago(p.upload.age)}` : '') + (verdict ? ` · ${verdict}` : '') : `No upload naming ${esc(p.name)} yet.`;
  const news = p.new_footage ? ` · ${p.new_footage} new footage video${p.new_footage === 1 ? '' : 's'} since` : '';
  const acts = p.state === 'picked'
    ? `<button type="button" class="btn small" data-idea="made" data-key="${esc(p.key)}">Made it</button><button type="button" class="btn small" data-idea="clear" data-key="${esc(p.key)}">Drop</button>`
    : `<button type="button" class="btn small" data-idea="clear" data-key="${esc(p.key)}">Clear</button>`;
  return `<article class="grow nx"><div class="mini nxprog"><div class="body">
    <b class="pname">${esc(p.name)}</b> <span class="b${p.state === 'made' ? ' good' : ' mine'}">${p.state === 'made' ? 'Made ' + esc(when(p.made_at || p.at)) : 'Picked ' + esc(when(p.at))}</span>
    <div class="meta">${esc(range)}${esc(news)}</div><div class="meta">${up}</div></div>
    <div class="acts nxacts">${acts}</div></div></article>`;
}
const NX_ORDERS = [['R0', "This tab's list"], ['R1', 'Footage views'], ['R1g', 'Footage 24-hour gain'],
  ['R2', 'Footage views per breakdown out'], ['R3', 'Board Opportunity'], ['N0', 'Random (control)'], ['N1', 'Most-viewed video (control)']];
const NX_STATUS = { collecting: 'waiting for the first check', 'too few': 'too few uploads at the check', 'no edge': 'no edge',
  passed: 'passed: can enter the order', dropped: 'dropped' };
const x2 = x => x == null ? '—' : x.toFixed(2) + '×';      // two decimals: the rule's lines are 1×, 1.25× and 1.3×
function nxRecordTable(res, status, deciding) {
  if (!res) return '';
  const o7 = res.o7 || {}, o28 = res.o28 || {};
  const rng = s => s && s.ratio != null ? `${x2(s.ratio)}${s.lo != null ? ` <span class="muted">${x2(s.lo)}–${x2(s.hi)}</span>` : ''}` : '—';
  return `<div class="tablewrap"><table class="tbl nxrec"><thead><tr><th>Order</th><th>Uploads about its top fighters</th>
    <th>Their median vs their channel</th><th>Uploads about the rest</th><th>Top vs rest, 7 days</th><th>Halves</th>
    <th>28 days <span class="muted">(context)</span></th><th>${deciding ? 'Verdict' : ''}</th></tr></thead><tbody>` +
    NX_ORDERS.map(([k, name]) => {
      const a = o7[k] || {}, b = o28[k] || {};
      const st = deciding ? (status[k] ? NX_STATUS[status[k]] || status[k] : k === 'R0' ? 'reference' : 'control') : 'context';
      const top = a.top != null ? x2(a.top) + (a.top_lo != null ? ` <span class="muted">${x2(a.top_lo)}–${x2(a.top_hi)}</span>` : '') : '—';
      const halves = (a.halves || []).some(h => h != null) ? a.halves.map(x2).join(' · ') : '—';
      return `<tr><td>${esc(name)}</td><td>${a.n_top || 0}</td><td>${top}</td><td>${a.n_rest || 0}</td>
        <td>${rng(a)}</td><td>${halves}</td><td>${rng(b)} <span class="muted">(${(b.n_top || 0) + (b.n_rest || 0)})</span></td><td>${esc(st)}</td></tr>`;
    }).join('') + '</tbody></table></div>';
}
function nxCalib(C) {
  if (!C || !C.n) return '';
  return `<p class="lead">Your uploads against the range frozen at Pick, by their views at 28 days: ${C.n} graded · inside the middle half ${C.inside}, below ${C.below}, above ${C.above} · inside the 80% range ${C.in_most}.` +
    (C.reset ? ` ${C.reset_below} of your first five landed below the middle half, so the usual is now ${fmt(C.reset)}: what those uploads imply (their views ÷ their group's factor).` : '') +
    (C.ranges_off ? ' Fewer than 6 of your last 10 landed inside the 80% range: the ranges need refitting.' : '') + '</p>';
}
function renderRecord(N) {
  const R = N.record, C = N.calibration;
  if (R && R.error) {
    $('#nx-record').innerHTML = note('The forward test failed on the last update: ' + R.error) + nxCalib(C);
    return;
  }
  if (!R || !R.panel) {
    $('#nx-record').innerHTML = note('The panel of channels that grades these lists is chosen from the cache on the next update and read from then on.') + nxCalib(C);
    return;
  }
  const P = R.panel, seen = P.seen || {}, n = R.n || {};
  const seenN = k => (seen[k] || {}).seen || 0;
  const head = `<p class="lead">Every published update logs this list next to six other orders${R.start ? ` (since ${esc(nxDay(R.start))})` : ''}.
    A fixed panel grades them: ${P.remix} channels mostly making breakdowns, stories and reactions about fighters in your lane and ${P.footage} channels mostly posting fight footage
    (chosen ${esc(nxDay(P.created))}), each read every 3–4 days, up to 120 uploads deep. An upload first seen by day 4 is graded at 7 days (views projected to final) and at 28 days,
    against its channel's usual frozen when it was first seen (the median of its uploads 14+ days old; a channel without enough of those is not graded).
    Seen so far: ${fmt(seenN('remix') + seenN('footage'))} uploads; graded at 7 days: ${(n.remix || {}).o7 || 0} breakdowns from the remix channels and ${(n.footage || {}).o7 || 0} other uploads.</p>`;
  const lastCheck = R.verdicts && Object.keys(R.verdicts).length ? Object.keys(R.verdicts).sort().pop() : null;
  const checks = R.checks && R.checks.length ? `<p class="lead">Checks: ${R.checks.map((c, i) => `${esc(nxDay(c))} (${[6, 13, 26][i]} weeks)`).join(' · ')}${lastCheck ? ` · verdicts from ${esc(nxDay(lastCheck))}` : ''}${R.final ? ' · the test is over' : ''}.
    The rule, judged only at the checks on the uploads whose 7-day reading was in by then, on breakdowns, stories and reactions from the remix channels at 7 days:
    a demand order enters the tab only if it has 15+ uploads about its top fighters, uploads about its top fighters beat the rest with the whole 98% range above 1×,
    it beats this tab's own list, random and most viewed, its top fighters' uploads are 1.3×+ their channel's usual (that range above 1× too), and it holds in both halves of the period.
    At the 13- and 26-week checks an order whose best case is under 1.25× is dropped. A verdict of passed or dropped stays.</p>` : '';
  $('#nx-record').innerHTML = head +
    (R.start ? `<h4 class="nxh">Breakdowns, stories and reactions from the remix channels <span class="hint">this decides</span></h4>${nxRecordTable(R.remix, R.status, true)}
      <h4 class="nxh">Everything else the panel posts <span class="hint">context only</span></h4>${nxRecordTable(R.footage, null, false)}` : note('Grading starts once the list has been logged.')) +
    checks + nxCalib(C);
}

function renderNext() {
  const N = D.next;
  if (!N) {
    $('#nx-head').innerHTML = '';
    $('#nx-prog-sec').hidden = true;
    $('#nx-groups').innerHTML = empty('The Next video tab needs the fighter roster (roster.json) and your channel listing; it fills on the next update.');
    return;
  }
  const prog = nxProgress();
  $('#nx-head').innerHTML = [
    [fmt(N.usual), N.calibration && N.calibration.reset ? 'usual next upload (reset: your first five since picking)' : 'usual next upload (median of your last 10)'],
    [N.last_days != null ? ago(N.last_days) : '—', 'since your last upload'],
    [String(prog.filter(p => p.state === 'picked').length), 'picked'],
    N.log_from ? [nxDay(N.log_from), 'list logged daily since'] : ['—', 'logging starts with the next update'],
  ].map(([b, l]) => `<div><b>${esc(b)}</b><span>${esc(l)}</span></div>`).join('');
  $('#nx-prog-sec').hidden = !prog.length;
  $('#nx-prog').innerHTML = prog.map(nxProgressRow).join('');
  $('#nx-groups').innerHTML = N.groups.map(g => {
    const rows = nxRows(g);
    const k = 'nx-' + g.key;
    if (shown[k] == null) shown[k] = g.show;
    return `<div class="tsec nxgroup"><h3 class="h">${esc(g.name)} <span class="hint">${esc(nxRange(g))}</span></h3>
      <div class="list">${rows.length ? rows.slice(0, shown[k]).map(r => nxRow(r, g)).join('') : note('No fighter here passes the footage check with these switches.')}</div>
      ${rows.length > shown[k] ? `<button type="button" class="btn small more" data-more="${k}">Show ${rows.length - shown[k]} more</button>` : ''}</div>`;
  }).join('');
  const un = (N.unrostered || []).map(u => `<button type="button" class="chip" data-subj="${esc(u.key)}" title="${fmt(u.views30)} footage views on the board in 30 days">${esc(u.name)}</button>`).join('');
  const nots = Object.entries(MARKS.ideas || {}).filter(([, i]) => i.state === 'not');
  $('#nx-not').innerHTML = (nots.length ? `<div class="nxnot"><span class="muted">Not for us:</span> ${nots.map(([k, i]) => STATIC
    ? `<span class="chip" title="${esc(i.reason || '')}">${esc(i.name || N.names[k] || k)}</span>`
    : `<button type="button" class="chip" data-idea="clear" data-key="${esc(k)}" title="${esc(i.reason || '')} · tap to bring back">${esc(i.name || N.names[k] || k)} ↺</button>`).join('')}</div>` : '') +
    (un ? `<div class="nxnot"><span class="muted">On the board this month but not on the roster yet (add them to roster.json):</span> ${un}</div>` : '');
  renderRecord(N);
  const F = N.facts || {};
  const dd = (t, d) => `<dt>${esc(t)}</dt><dd>${d}</dd>`;
  $('#nx-how').innerHTML = [
    dd('Usual next upload', N.calibration && N.calibration.reset ? 'Reset from your uploads since picking: the usual they imply (their views at 28 days ÷ their group\'s factor).' : 'The median views of your last 10 uploads.'),
    dd('Groups', `A Thai Muay Thai legend named in the title (the roster's kind), or another fighter on the roster. A group's typical = its median against your usual since ${esc(nxSince(D.me && D.me.angles_from))}, pulled toward 1× with 10 uploads' weight, × your usual next upload. Half land / most land: where the middle half and 80% of your uploads fell around their group's median.`),
    dd('Your usual then', 'Each upload against the median of the 10 uploads before and after it in YouTube\'s order; a break of more than 6 months starts a new run.'),
    dd('Order inside a group', 'Views of the fighter\'s usable footage uploaded in the last 12 months (60%) and 30 days (40%); yesterday\'s rows stay while they are still near the top.'),
    dd('Usable footage', 'Fight videos of 8+ minutes that name the fighter (roster names, matched strictly) with no UFC in the title, channel or tags: 2+ fights of 8–60 minutes or 20+ minutes in all, from an official promotion channel or 2+ channels. Archive: Golden-Era legends you have footage of yourself.'),
    dd('Facts, not order', 'Breakdowns with 10K+ views in the last 30 days, the board\'s heat and Opportunity, and your own record on the fighter.'),
    dd('Record', 'Each logged order against a fixed panel of channels: uploads about its top fighters (the first ' + ((N.groups[0] || {}).show + (N.groups[1] || {}).show) + ', as many as the tab shows) against uploads about the other fighters on that day\'s list, each against its own channel\'s usual (median of the channel\'s uploads 14+ days old when the upload was first seen). 7 days = the reading nearest day 7, scaled to day 7 by the share of final views fight uploads have at that age. The range is a bootstrap 98% range.'),
  ].join('');
  nxCheck();
}
function nxCheck() {
  const N = D.next;
  if (!N) return;
  const t = $('#nx-title').value.trim(), len = +$('#nx-len').value || 0;
  if (!t && !len) { $('#nx-check').innerHTML = note('Type a working title to see its group, its range and what your history says about it.'); return; }
  const F = N.facts || {};
  const ks = nxMatch(t);
  const g = !ks.length ? nxNone() : N.groups.find(x => x.key === (ks.some(k => N.kinds[k] === 'thai_legend') ? 'thai_legend' : 'named'));
  const lines = [];
  if (t) lines.push(ks.length ? `Names: ${ks.map(k => `${N.names[k]} (${NX_KIND[N.kinds[k]] || '—'})`).join(', ')}` : 'No fighter on the roster named.');
  if (t && g) lines.push(`${g.name}: ${nxRange(g)}`);
  if (t && !ks.length && F.recent_named != null && F.recent_none != null)
    lines.push(`In your latest run, titles naming a fighter did ${ox(F.recent_named)} your usual and titles naming none ${ox(F.recent_none)} (${F.recent_n[0]} and ${F.recent_n[1]} uploads).`);
  if (t && !ks.length && NX_TECH.test(t) && F.technique != null && F.technique_n >= 5) lines.push(`Technique titles with no fighter did ${ox(F.technique)} your usual (${F.technique_n} uploads).`);
  if (t && NX_GUEST.test(t) && F.guest != null && F.guest_n >= 5) lines.push(`Q&A / channel videos did ${ox(F.guest)} your usual (${F.guest_n} uploads).`);
  if (len) {
    const b = (F.lengths || []).find(x => len >= x.lo && len < x.hi);
    if (b && b.median != null) lines.push(`${b.name}: ${ox(b.median)} your usual (${b.n} uploads) · ` +
      (F.lengths || []).filter(x => x.median != null).map(x => `${x.name} ${ox(x.median)}`).join(' · '));
  }
  $('#nx-check').innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join('');
}
async function idea(state, key, reason) {
  const N = D.next;
  if (STATIC) return;
  if (!N) return;
  const ideas = MARKS.ideas || (MARKS.ideas = {});
  const name = N.names[key] || key, old = ideas[key];
  let range = null;
  if (state === 'picked') {
    const g = N.groups.find(x => x.key === nxGroupOf(key));
    range = g && g.typical ? { typical: g.typical, half: g.half, most: g.most, group: g.key, factor: g.factor } : null;
  }
  if (state === 'clear') delete ideas[key];
  else ideas[key] = Object.assign({}, old, { state, name, reason: reason || '', range: range || (old && old.range),
    at: state === 'made' && old && old.at ? old.at : Date.now() / 1000 }, state === 'made' ? { made_at: Date.now() / 1000 } : {});
  nxWhy = null;
  render();
  if (state === 'picked') toast(`${name} moved to In progress.`, 'Undo', () => idea('clear', key));
  if (state === 'not') toast(`${name}: not for us.`, 'Undo', () => idea('clear', key));
  if (state === 'clear' && old) toast(`${name} cleared.`, 'Undo', () => ideaRestore(key, old));
  await postIdea({ op: 'idea', key, state: state === 'clear' ? null : state, name, reason: reason || '', range });
}
async function ideaRestore(key, old) {      // Undo of Drop / Clear: the record as it was, pick time and range included
  (MARKS.ideas || (MARKS.ideas = {}))[key] = old;
  render();
  await postIdea(Object.assign({ op: 'idea', key, restore: true }, old));
}
async function postIdea(body) {
  if (STATIC) return;
  try {
    const r = await fetch('/api/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { MARKS = await r.json(); render(); }
  } catch (e) { toast('Could not save that: is the server running?'); }
}
async function copyPack(key) {
  const r = D.next.groups.flatMap(g => g.rows).find(x => x.key === key);
  if (!r) return;
  const lines = [`${r.name}: footage pack`, ...r.pack.map(p => `${p.t} (${[p.ch, p.d ? dur(p.d) : '', fmt(p.v) + ' views', p.off ? 'official' : ''].filter(Boolean).join(', ')}) https://youtu.be/${p.id}`),
    `More: https://www.youtube.com/results?search_query=${encodeURIComponent(r.name + ' full fight')}`];
  toast(await copyText(lines.join('\n')) ? 'Footage pack copied.' : 'Copy blocked by the browser.');
}
// The clipboard API needs https or localhost, and the Studio's page is plain http on the LAN: copy through a hidden
// textarea there (it has to run inside the click, before anything is awaited).
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

/* ---------- other views */
// What a rank leaves out, on the count line: Outlier needs a checked channel and 10K+ views, Heat a measured gain.
const rankNote = (rank, unmeasured) => rank === 'out' ? ` · outlier needs ${fmt(MIN_VIEWS_OUTLIER)}+ views and a checked channel`
  : rank === 'heat' && unmeasured ? ` · ${unmeasured.toLocaleString()} not measured yet (gains start after two daily updates)` : '';

function renderScreener() {
  chips($('.chips[data-key="sport"]'), 'sport', screenerFilter(true));
  let rows = screenerFilter(false);
  let unmeasured = 0;
  if (S.rank === 'heat') {
    unmeasured = rows.filter(v => v.heat == null).length;
    rows = rows.filter(v => v.heat != null);
  }
  rows.sort(sorters[S.rank]);
  const pills = {};
  if (S.rank === 'score' && (D.days || 1) >= 2) {           // places moved in THIS list since the previous day
    const prev = screenerFilter(false, 1).filter(v => v.psc != null && !isNew(v)).sort((a, b) => b.psc - a.psc);
    const was = new Map(prev.map((v, i) => [v.id, i + 1]));
    const settled = shiftDay(D.day, -2);
    rows.forEach((v, i) => {
      if (isNew(v)) { pills[v.id] = ' <em class="pn">new</em>'; return; }
      const p = was.get(v.id);
      if (p && v.first && v.first <= settled && Math.abs(p - (i + 1)) >= 3) {
        const d = p - (i + 1);
        pills[v.id] = ` <em class="${d > 0 ? 'pu' : 'pd'}" title="Place ${p} in this list on the previous day">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>`;
      }
    });
  }
  const bar = $('.subjbar');
  bar.hidden = !S.subj;
  if (S.subj) $('b', bar).textContent = nm(S.subj);
  $('#count-screener').textContent = `${rows.length.toLocaleString()} videos${rankNote(S.rank, unmeasured)}`;
  $('#list-screener').innerHTML = rows.length
    ? rows.slice(0, shown.screener).map((v, i) => card(v, i + 1, S.rank, pills[v.id])).join('')
    : empty('Nothing matches these filters.');
  moreBtn('screener', rows.length);
}

function renderRemixes() {
  chips($('.chips[data-key="rxSport"]'), 'rxSport', remixFilter(true));
  let rows = remixFilter(false);
  let unmeasured = 0;
  if (S.rxRank === 'heat') {
    unmeasured = rows.filter(v => v.heat == null).length;
    rows = rows.filter(v => v.heat != null);
  }
  rows.sort(sorters[S.rxRank]);
  $('#count-remixes').textContent = `${rows.length.toLocaleString()} remixes${rankNote(S.rxRank, unmeasured)}`;
  $('#list-remixes').innerHTML = rows.length
    ? rows.slice(0, shown.remixes).map((v, i) => card(v, i + 1, S.rxRank)).join('')
    : empty('Nothing matches these filters.');
  moreBtn('remixes', rows.length);
}

function renderSubjects() {
  const q = S.sjQ.trim().toLowerCase();
  const all = D.subjects.filter(s => s.n + s.n_rx > 0 && (!q || s.name.toLowerCase().includes(q)));
  const box = $('.chips[data-key="sjSport"]');
  const counts = {};
  for (const s of all) for (const sp of s.sports) counts[sp] = (counts[sp] || 0) + 1;
  box.innerHTML = ['All', ...D.sports].map(sp => `<button type="button" class="chip${S.sjSport === sp ? ' on' : ''}" data-v="${esc(sp)}">${esc(sp)}<span class="n">${fmt(sp === 'All' ? all.length : counts[sp] || 0)}</span></button>`).join('');
  const key = { opp: s => s.opp, heat: s => s.gain || 0, proven: s => s.proven, n: s => s.n + s.n_rx }[S.sjSort];
  const rows = all.filter(s => (S.sjSport === 'All' || s.sports.includes(S.sjSport)) && !(S.hideUfcNames && s.ufc))
    .sort((a, b) => key(b) - key(a));
  const link = (o, label) => o ? `<a href="${yt(o.id)}" target="_blank" rel="noopener" title="${esc((VID.get(o.id) || {}).t || '')}">${label}</a>` : '—';
  const head = '<tr><th>#</th><th>Fighter / fight</th><th>Opportunity</th><th>24 h gain</th><th>vs earlier days</th>' +
    '<th>Views, 30 d</th><th>Best raw outlier</th><th>Best remix</th><th>Yours</th><th>Breakdowns, 30 d</th></tr>';
  const body = rows.slice(0, shown.subjects).map((s, i) => {
    const sup = s.supply ? (s.supply.top
      ? `<a href="${yt(s.supply.top.id)}" target="_blank" rel="noopener" title="${esc(s.supply.top.t)} · ${esc(s.supply.top.ch)} · ${fmt(s.supply.top.v)} views">${s.supply.n}</a>`
      : String(s.supply.n)) : '<span class="muted">not checked</span>';
    const tr = s.trend == null ? '<span class="muted">—</span>' : `<span class="${s.trend >= 1.5 ? 'up' : s.trend <= 0.67 ? 'dim' : ''}">${s.trend >= 1 ? '▲' : '▼'} ${ox(s.trend)}</span>`;
    return `<tr><td class="muted">${i + 1}</td>
      <td><button type="button" class="sname" data-subj="${esc(s.key)}">${esc(s.name)}</button>${s.ufc ? '<span class="utag" title="On the UFC roster or a past UFC title fighter: most of their footage is UFC">UFC</span>' : ''}
        <span class="sub">${esc(s.sports.join(', '))} · ${s.n} video${s.n === 1 ? '' : 's'}${s.n_rx ? ` · ${s.n_rx} remix${s.n_rx === 1 ? '' : 'es'}` : ''}</span></td>
      <td>${Math.round(s.opp)}<span class="oppbar"><i style="width:${Math.min(100, s.opp)}%"></i></span></td>
      <td>${s.gain ? gainText(s.gain, s.g24d, '').join(' ') : '—'}</td><td>${tr}</td><td>${s.views30 ? fmt(s.views30) : '—'}</td>
      <td>${ox(s.best_out)}</td><td>${link(s.rx_best, s.rx_best ? ox(s.rx_best.out) : '')}</td>
      <td>${link(s.mine_best, s.mine_best ? ox(s.mine_best.out) : '')}</td><td>${sup}</td></tr>`;
  }).join('');
  $('#tbl-subjects').innerHTML = `<thead>${head}</thead><tbody>${body || `<tr><td colspan="10">${empty('No subjects match.')}</td></tr>`}</tbody>`;
  moreBtn('subjects', rows.length);
}

function renderMine() {
  const me = D.me;
  if (!me) {
    $('#me-head').innerHTML = empty('Your channel could not be read on this run.');
    return;
  }
  const outs = me.videos.filter(u => u.out != null);
  const big = outs.filter(u => u.out >= 2).length;
  $('#me-head').innerHTML = [
    [esc(me.title), 'channel'], [fmt(me.subs), 'subscribers'], [fmt(me.base_next), 'bar for your next upload (median of your last 10)'],
    [me.last_upload_days != null ? ago(me.last_upload_days) : '—', 'since last upload'], [fmt(me.n), 'uploads'],
    [`${big}`, 'uploads at 2× usual or more'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  $('#me-angles-from').textContent = me.angles_from ? `uploads since ${nxSince(me.angles_from)} (the 2013–16 uploads followed other rules)` : '';
  const none = (me.angles || []).find(a => a.key === 'none');
  $('#me-angles').innerHTML = (me.angles || []).filter(a => a.key !== 'none').map(a => `<div class="angle${none && a.median > 1.5 * none.median ? ' hot' : ''}">
      <b>${esc(a.name)}</b><span class="big">${ox(a.median)}</span> <span class="muted">median · ${a.n} uploads · best ${ox(a.best)}</span>
      <a href="${yt(a.best_id)}" target="_blank" rel="noopener" title="${esc(a.best_t)}">Best: ${esc(a.best_t)}</a>
      <span class="muted small">Last one ${a.last_days != null ? ago(a.last_days) + ' ago' : '—'}</span></div>`).join('') +
    (none ? `<div class="angle"><b>No angle</b><span class="big">${ox(none.median)}</span> <span class="muted">median · ${none.n} uploads · best ${ox(none.best)}</span>
      <span class="muted small">Everything without a style clash, size / gender gap or legend in the title</span></div>` : '');
  const agg = {};
  for (const u of outs) for (const k of u.subj.filter(k => !k.startsWith('#'))) {
    const a = agg[k] || (agg[k] = { k, best: 0, n: 0 });
    a.best = Math.max(a.best, u.out); a.n++;
  }
  const top = Object.values(agg).sort((a, b) => b.best - a.best).slice(0, 30);
  $('#me-subj').innerHTML = top.length ? top.map(a => `<button type="button" class="chip" data-subj="${esc(a.k)}" title="${a.n} upload${a.n === 1 ? '' : 's'}">${esc(nm(a.k))}<b>${ox(a.best)}</b></button>`).join('') : empty('No named fighters found in your titles.');
  const key = { out: u => u.out || 0, views: u => u.v || 0, new: u => u.i != null ? u.i : u.ts || 0 }[S.meSort];
  const rows = me.videos.slice().sort((a, b) => key(b) - key(a));
  $('#list-mine').innerHTML = rows.slice(0, shown.mine).map((u, i) => {
    const d = u.ts ? (D.built_ts - u.ts) / 86400 : null;
    const subj = u.subj.map(k => `<button type="button" class="chip subj" data-subj="${esc(k)}">${esc(nm(k))}</button>`).join('');
    return `<article class="card mine">
      <a class="thumb" href="${yt(u.id)}" target="_blank" rel="noopener"><img loading="lazy" src="https://i.ytimg.com/vi/${u.id}/mqdefault.jpg" alt=""><span class="rank">${i + 1}</span></a>
      <div class="body"><a class="title" href="${yt(u.id)}" target="_blank" rel="noopener">${esc(u.t)}</a>
        <div class="meta">${d != null ? (u.exact ? '' : '~') + ago(d) + ' ago' : ''}</div><div class="badges">${subj}</div></div>
      <div class="nums">
        <div class="${S.meSort === 'views' ? 'hl' : ''}"><b>${fmt(u.v)}</b><span>views</span></div>
        <div><b>${fmt(u.base)}</b><span>usual then</span></div>
        <div class="${S.meSort === 'out' ? 'hl' : ''}"><b>${ox(u.out)}</b><span>vs usual</span></div>
        ${u.g24 != null ? (([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`)(gainText(u.g24, u.g24d, 'last 24 h')) : ''}
        <div class="scorebox">${bars(u.sp)}</div>
      </div><div class="acts"></div></article>`;
  }).join('');
  moreBtn('mine', rows.length);
  $('#me-shorts').innerHTML = me.shorts.slice().sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 24).map(u =>
    `<a class="short" href="https://www.youtube.com/shorts/${u.id}" target="_blank" rel="noopener"><img loading="lazy" src="https://i.ytimg.com/vi/${u.id}/hq2.jpg" alt=""><b>${fmt(u.v)}</b> · ${esc(u.t)}</a>`).join('');
}

function renderSaved() {
  const ids = Object.keys(MARKS.saved).sort((a, b) => (MARKS.saved[b].at || 0) - (MARKS.saved[a].at || 0));
  $('#list-saved').innerHTML = ids.length ? ids.map(id => VID.get(id) ? card(VID.get(id), 0, '')
    : lite(id, MARKS.saved[id], 'unsave', 'Remove', D.gone && D.gone[id])).join('')
    : empty('Nothing saved yet. Use ☆ on any video.');
  const hid = Object.keys(MARKS.hidden).sort((a, b) => (MARKS.hidden[b].at || 0) - (MARKS.hidden[a].at || 0));
  $('#list-hidden').innerHTML = hid.length ? hid.map(id => lite(id, MARKS.hidden[id], 'unhide', 'Unhide')).join('') : empty('Nothing hidden.');
}

function lite(id, m, act, label, gone) {
  return `<article class="card lite"><a class="thumb" href="${yt(id)}" target="_blank" rel="noopener"><img loading="lazy" src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt=""></a>
    <div class="body"><a class="title" href="${yt(id)}" target="_blank" rel="noopener">${esc(m.t || id)}</a><div class="meta">${esc(m.ch || '')}</div>
    ${gone ? `<div class="badges"><span class="b warn" title="${esc(gone)}">Gone from YouTube</span></div>` : ''}</div>
    <div class="acts"><button type="button" class="btn small" data-act="${act}" data-id="${id}">${label}</button></div></article>`;
}

function syncControls() {
  $$('.seg[data-key]').forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('on', S[seg.dataset.key] === b.dataset.v)));
  $$('select[data-key]').forEach(el => { el.value = S[el.dataset.key]; });
  $$('input[type=checkbox][data-key]').forEach(el => { el.checked = !!S[el.dataset.key]; });
  $$('input[type=search][data-key]').forEach(el => { if (document.activeElement !== el) el.value = S[el.dataset.key]; });
  $$('.tab').forEach(a => a.dataset.tab === S.tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $$('section[data-view]').forEach(sec => { sec.hidden = sec.dataset.view !== S.tab; });
  const n = Object.keys(MARKS.saved).length;
  $('#savedN').textContent = n ? String(n) : '';
  const cur = $('.tab[aria-current]');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function render() {
  syncControls();
  if (!D) return;
  ({ today: renderToday, next: renderNext, screener: renderScreener, remixes: renderRemixes, subjects: renderSubjects,
     mine: renderMine, saved: renderSaved }[S.tab] || renderToday)();
}

/* ---------- actions */
let toastTimer;
function toast(msg, action, fn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  t.hidden = false;
  if (action) $('button', t).onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

async function mark(op, id) {
  if (STATIC) return;
  const v = VID.get(id);
  const meta = v ? { t: v.t, ch: v.ch } : (MARKS.saved[id] || MARKS.hidden[id] || {});
  const box = op === 'save' || op === 'unsave' ? MARKS.saved : MARKS.hidden;
  if (op === 'save' || op === 'hide') box[id] = Object.assign({}, meta, { at: Date.now() / 1000 });
  else delete box[id];
  render();
  if (op === 'hide') toast('Hidden everywhere.', 'Undo', () => mark('unhide', id));
  try {
    const r = await fetch('/api/marks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, id, meta: { t: meta.t, ch: meta.ch } }) });
    if (r.ok) { MARKS = await r.json(); render(); }
  } catch (e) { toast('Could not save that: is the server running?'); }
}

async function refreshNow() {
  if (STATIC) return;
  $('#refresh').disabled = true;
  try {
    const r = await fetch('/api/refresh', { method: 'POST' });
    if (r.status === 409) { const j = await r.json(); toast(j.error || 'A run is already going or today is done.'); }
  } catch (e) { /* the next status poll shows the state */ }
  $('#refresh').disabled = false;
  setTimeout(poll, 3000);
}

let lastBuilt = null;
async function poll() {
  let st = null;
  try { st = await (await fetch(URLS.status, { cache: 'no-store' })).json(); } catch (e) { /* offline */ }
  STATUS = st;
  if (st && st.refreshing) {            // the board on disk stays valid during a run (it is replaced in one step)
    if (!D) await load();
    statusLine();
    setTimeout(poll, 10000);
    return;
  }
  const built = st && (st.built || st.built_ts);
  if (!D || (st && built !== lastBuilt)) {
    if (await load()) lastBuilt = built;
    else if (D) setTimeout(poll, 30000);  // the new build did not arrive: the old board stays up, try again soon
  } else {
    await refreshMarks();                 // picks and stars made in another browser
    statusLine();
  }
}
async function refreshMarks() {
  try {
    const m = await (await fetch(URLS.marks, { cache: 'no-store' })).json();
    if (JSON.stringify(m) !== JSON.stringify(MARKS)) { MARKS = m; render(); }
  } catch (e) { /* offline: keep */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
// YouTube answers a frame it has not made (hq2.jpg on new or long videos, sometimes mqdefault.jpg) with a 120×90 grey
// placeholder: fall back to hqdefault.jpg, which every video has.
const noFrame = e => {
  const i = e.target;
  if (i.tagName === 'IMG' && /\/(hq2|mqdefault)\.jpg$/.test(i.src) && (e.type === 'error' || i.naturalWidth <= 120)) {
    i.src = i.src.replace(/\/(hq2|mqdefault)\.jpg$/, '/hqdefault.jpg');
  }
};
document.addEventListener('load', noFrame, true);
document.addEventListener('error', noFrame, true);
setInterval(() => { if (!document.hidden) poll(); }, 5 * 60 * 1000);

async function copySaved() {
  const lines = Object.entries(MARKS.saved).map(([id, m]) => `${m.t || id} — https://youtu.be/${id}`).join('\n');
  $('#copyMsg').textContent = await copyText(lines) ? 'Copied.' : 'Copy blocked by the browser.';
  setTimeout(() => { $('#copyMsg').textContent = ''; }, 3000);
}

/* ---------- wiring */
function tabFromHash() {
  const h = location.hash.replace('#', '');
  return ['today', 'next', 'screener', 'remixes', 'subjects', 'mine', 'saved'].includes(h) ? h : S.tab;
}

function wire() {
  const set = (k, val) => { S[k] = val; resetPages(); save(); render(); };
  $$('.seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (b) set(seg.dataset.key, b.dataset.v);
  }));
  $$('.chips[data-key]').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (b) set(box.dataset.key, b.dataset.v);
  }));
  $$('select[data-key]').forEach(el => el.addEventListener('change', () => set(el.dataset.key, el.value)));
  $$('input[type=checkbox][data-key]').forEach(el => el.addEventListener('change', () => { S[el.dataset.key] = el.checked; save(); render(); }));
  $$('input[type=search][data-key]').forEach(el => el.addEventListener('input', debounce(() => set(el.dataset.key, el.value), 160)));
  document.addEventListener('click', e => {
    const op = e.target.closest('[data-open]');
    if (op) {
      const k = op.dataset.open;
      if (opened.has(k)) opened.delete(k); else opened.add(k);
      render();
      return;
    }
    const sj = e.target.closest('[data-subj]');
    if (sj) {
      S.subj = sj.dataset.subj; S.q = ''; S.sport = 'All'; S.len = 'any'; S.tab = 'screener'; resetPages(); save();
      if (location.hash !== '#screener') location.hash = 'screener'; else render();
      window.scrollTo(0, 0);
      return;
    }
    if (e.target.closest('[data-clear-subj]')) { set('subj', ''); return; }
    const all = e.target.closest('[data-all-breakouts]');
    if (all) {
      Object.assign(S, { subj: '', q: '', sport: 'All', len: 'any', win: 'week', rank: 'out', type: 'footage', tab: 'screener' });
      resetPages(); save(); location.hash = 'screener'; render(); return;
    }
    const more = e.target.closest('[data-more]');
    if (more) { shown[more.dataset.more] += PAGE; render(); return; }
    const why = e.target.closest('[data-why]');
    if (why) { nxWhy = nxWhy === why.dataset.why ? null : why.dataset.why; render(); return; }
    const id8 = e.target.closest('[data-idea]');
    if (id8) { idea(id8.dataset.idea, id8.dataset.key, id8.dataset.reason); return; }
    const cp = e.target.closest('[data-copy-pack]');
    if (cp) { copyPack(cp.dataset.copyPack); return; }
    const act = e.target.closest('[data-act]');
    if (act) mark(act.dataset.act, act.dataset.id);
  });
  $('#nx-title').addEventListener('input', debounce(() => { if (D) nxCheck(); }, 120));
  $('#nx-len').addEventListener('change', () => { if (D) nxCheck(); });
  window.addEventListener('hashchange', () => { S.tab = tabFromHash(); save(); render(); });
  $('#refresh').addEventListener('click', refreshNow);
  $('#copySaved').addEventListener('click', copySaved);
}

S.tab = tabFromHash();
wire();
syncControls();
poll();
