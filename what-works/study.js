'use strict';
/* Channel Study, the second page of What Works: one channel in depth (VoteSport first), every channel compared, and the
   VoteSport study. Renders data/study.json and data/study/<cid>.json (study.py, written by What Works' own build) and
   What Works' data/trends.json for the niche in short. Every number on the page comes from those files. Titles are
   untrusted text: escaped wherever they go into HTML, set as text in tooltips. Same family as What Works (app.css):
   log-scale HTML bar rows, video cards, table views, hover / focus details; the two time charts are SVG with a
   nearest-point hover layer. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* What Works' number formats (app.js), so the two pages read alike */
const fmtV = v => v == null ? '–' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v));
const fmtX = (x, extra = 0) => {
  if (x == null) return '–';
  const s = x.toFixed(1 + extra);
  return (parseFloat(s) < 10 ? s : x.toFixed(extra)) + '×';
};
/* 1 when two different numbers of one family, or one and the usual (1×), would read alike at the plain precision */
const xExtra = (xs, ref = 1) => {
  const seen = {};
  for (const x of ref == null ? xs : xs.concat([ref])) {
    if (x == null) continue;
    const p = fmtX(x), f = fmtX(x, 1);
    if (p in seen && seen[p] !== f) return 1;
    seen[p] = f;
  }
  return 0;
};
/* one upload's ratio: as fmtX, but a tiny one keeps two decimals instead of reading "0.0×" */
const fmtO = x => x == null ? '–' : x >= 0.095 ? fmtX(x) : x >= 0.01 ? x.toFixed(2) + '×' : '<0.01×';
/* a family's median or range end: as fmtX with its extra decimal, but under 0.095× as fmtO ("0.04×", not "0.0×") */
const fmtXs = (x, e) => x != null && x < 0.095 ? fmtO(x) : fmtX(x, e);
/* a What Works family's extra decimals as its build decided them (trends.json "xp") */
const xpOf = (fam, view) => { const v = ((W && W.xp) || {})[fam]; return (view == null ? v : v && v[view]) || 0; };
const pct = x => x == null ? '–' : Math.round(100 * x) + '%';
const yt = id => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
const ytc = cid => 'https://www.youtube.com/channel/' + encodeURIComponent(cid);
const when = (iso, opts) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d) ? '–' : d.toLocaleString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const dur = s => { if (!s) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const DAY = 86400;
const median = xs => {
  const a = xs.filter(x => x != null).sort((p, q) => p - q), n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null;
};
const sum = xs => xs.reduce((a, b) => a + (b || 0), 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const poss = name => /s$/i.test(name) ? name + "'" : name + "'s";
const fmtMin = m => !m ? '–' : (m < 10 ? String(m) : String(Math.round(m))) + ' min';
const fmtR = x => x == null ? '–' : x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3);
const B = s => `<b>${s}</b>`;              // a number in a written sentence (already formatted or escaped)
/* a calendar day or month from the data ("2026-11-07", "2026-11") in the viewer's own calendar, never shifted a day */
const ymd = s => { const m = /^(\d{4})-(\d\d)(?:-(\d\d))?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null; };
const dayTxt = (s, o) => { const d = ymd(s); return d ? d.toLocaleDateString(undefined, o || { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; };
const daysApart = (a, b) => Math.round((ymd(b) - ymd(a)) / 864e5);

/* an upload's date: exact (w = 0) or the middle of the range YouTube's "N units ago" allows, ± half its width */
const pmOf = w => {
  const h = w / 2;
  return h >= 120 ? [Math.round(h / 30.44), 'month', 'mo'] : h >= 10 ? [Math.round(h / 7), 'week', 'wk']
    : h >= 1 ? [+h.toFixed(1), 'day', 'd'] : [Math.round(h * 24), 'hour', 'h'];
};
function upDate(u, long) {
  const d = new Date(u.ts * 1000), o = { day: 'numeric', month: 'short', year: 'numeric' };
  if (!u.w) return d.toLocaleDateString(undefined, o);
  const [n, unit, ab] = pmOf(u.w);
  const txt = d.toLocaleDateString(undefined, unit === 'month' ? { month: 'short', year: 'numeric' } : o);
  return long ? `About ${txt} (± ${n} ${unit}${n === 1 ? '' : 's'})` : `~${txt} ±${n} ${ab}`;
}
const agoTxt = (days, exact) => exact ? `${plural(days, 'day')} ago`
  : days < 45 ? `about ${plural(Math.max(1, Math.round(days / 7)), 'week')} ago` : `about ${plural(Math.round(days / 30.44), 'month')} ago`;

/* thumbnails: mqdefault (16:9); YouTube sometimes answers with a 120×90 grey placeholder, then hqdefault */
const thumb = id => id ? `<img class="thumb" loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg" data-id="${esc(id)}">` : '';
const swap = img => { if (!img.dataset.f) { img.dataset.f = '1'; img.src = `https://i.ytimg.com/vi/${encodeURIComponent(img.dataset.id)}/hqdefault.jpg`; } };
document.addEventListener('load', e => { const t = e.target; if (t.classList && t.classList.contains('thumb') && t.naturalWidth && t.naturalWidth <= 120) swap(t); }, true);
document.addEventListener('error', e => { const t = e.target; if (t.classList && t.classList.contains('thumb')) swap(t); }, true);

/* a 90 % range for a median: the values re-drawn at random (seeded, so every load draws the same), as What Works does */
const rng = seed => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const REPS = 400, MIN_CLEAR = 5;
function range90(xs, key) {
  if (xs.length < 2) return null;
  const r = rng(hash(key)), meds = [], n = xs.length;
  for (let i = 0; i < REPS; i++) {
    const s = new Array(n);
    for (let j = 0; j < n; j++) s[j] = xs[Math.floor(r() * n)];
    meds.push(median(s));
  }
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(0.05 * REPS)], meds[Math.floor(0.95 * REPS) - 1]];
}
const clearOf = x => x.n >= MIN_CLEAR && x.rg ? (x.rg[0] > 1 ? 'up' : x.rg[1] < 1 ? 'down' : null) : null;

const STATIC = document.documentElement.dataset.static === '1';   // the read-only copy (publish.py): files, no API
let S = null, W = null, C = null, cur = null, topKey = 'out';
const FILES = new Map();
const GKEY = { Story: 'story', Technical: 'technical', Personality: 'personality', Recap: 'recap', Yours: 'yours' };
const gcol = g => `var(--g-${GKEY[g] || 'yours'})`;
const gName = g => g === 'Yours' ? 'You' : g;
const gLong = g => g === 'Yours' ? 'Your channel' : g + ' channels';
const COL = d => d === 'up' ? 'var(--up)' : d === 'down' ? 'var(--down)' : 'var(--neutral)';
const ARROW = d => d === 'up' ? '<span class="up" aria-hidden="true">▲</span> ' : d === 'down' ? '<span class="down" aria-hidden="true">▼</span> ' : '';
const trendDir = x => x == null ? null : x >= 1.1 ? 'up' : x <= 0.8 ? 'down' : null;   // What Works' channel chart
const rowOf = cid => ((S && S.channels) || []).find(c => c.cid === cid) || null;
const mx = () => xExtra(((S && S.channels) || []).map(c => c.ratio).filter(x => x != null));   // momentum's decimals
const fmtM = x => x == null ? '–' : fmtX(x, mx());
const ranked = () => S.channels.filter(c => c.rank).length;

/* ---------- tooltips (text goes in with textContent) */
const TIPS = new Map();
let tipN = 0;
const addTip = (value, label, lines) => { const id = 't' + (++tipN); TIPS.set(id, { value, label, lines: lines || [] }); return id; };
function tipAt(t, x, y) {
  const box = $('#tip');
  box.replaceChildren();
  for (const [cls, txt] of [['tv', t.value], ['tl', t.label], ...t.lines.map(l => ['', l])]) {
    if (!txt) continue;
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = txt;
    box.appendChild(d);
  }
  box.hidden = false;
  // beside the pointer, flipped to its other side near an edge, and always on screen
  const w = box.offsetWidth, h = box.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  const left = x + 14 + w > vw - 8 ? x - w - 14 : x + 14, top = y + 14 + h > vh - 8 ? y - h - 14 : y + 14;
  box.style.left = Math.max(8, Math.min(vw - w - 8, left)) + 'px';
  box.style.top = Math.max(8, Math.min(vh - h - 8, top)) + 'px';
}
const showTip = (el, x, y) => { const t = TIPS.get(el.dataset.tip); if (t) tipAt(t, x, y); };
const hideTip = () => { $('#tip').hidden = true; };
document.addEventListener('pointermove', e => {
  if (e.target.closest && e.target.closest('.hover-layer')) return;           // the SVG charts run their own
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else hideTip();
});
document.addEventListener('pointerdown', e => {
  if (e.target.closest && (e.target.closest('.hover-layer') || e.target.closest('[data-tip]'))) return;
  hideTip(); clearHovers();
});
document.addEventListener('focusin', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + Math.min(r.width, 280) / 2, r.bottom - 8); }
});
document.addEventListener('focusout', hideTip);
window.addEventListener('scroll', () => { hideTip(); clearHovers(); }, { passive: true });

/* ---------- scales and HTML bar rows (app.css .crow / .track) */
const pos = (x, lo, hi) => {
  const v = Math.min(Math.max(x, lo), hi);
  return (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * 100;
};
const isPow10 = v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9;
const niceDown = x => { const p = Math.pow(10, Math.floor(Math.log10(x))); return [5, 2, 1].map(k => k * p).find(v => v <= x * 1.000001) || p; };
const niceUp = x => { const p = Math.pow(10, Math.floor(Math.log10(x))); return [1, 2, 5, 10].map(k => k * p).find(v => v >= x * 0.999999); };
/* log ticks between two 1-2-5 bounds: 1, 2, 5 steps over two decades or less, else powers of ten, thinned to maxN */
function logTicks(lo, hi, maxN) {
  const dec = Math.log10(hi / lo), mult = dec <= 2.01 ? [1, 2, 5] : [1];
  let ts = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of mult) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) ts.push(v); }
  }
  if (ts.length > maxN) ts = ts.filter(isPow10);
  while (ts.length > maxN) ts = ts.filter((v, i) => i % 2 === 0);
  return ts.map(v => [v, fmtV(v)]);
}
/* a linear axis from 0: a round step for about n ticks */
function niceTop(max, n = 4) {
  const raw = Math.max(max, 1) / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw * 0.999);
  return { step, top: Math.ceil(max / step - 1e-9) * step };
}
/* the axis row over a chart: ticks [[value, label, hide on phones]], p(value) -> %, heads for the columns */
function axisRow(ticks, p, heads) {
  const sp = ticks.map(t => {
    const x = p(t[0]), tr = x <= 0.5 ? 'translateX(0)' : x >= 99.5 ? 'translateX(-100%)' : 'translateX(-50%)';
    return `<span class="${t[2] ? 'mn' : ''}" style="left:${x}%;transform:${tr}">${esc(t[1])}</span>`;
  }).join('');
  return `<div class="crow axis" aria-hidden="true"><div class="lab">${esc(heads[0] || '')}</div><div class="ticks">${sp}</div>`
    + heads.slice(1).map((h, i) => `<div class="${i ? 'aux' : 'val'}">${esc(h || '')}</div>`).join('') + '</div>';
}
const XLO = 0.25, XHI = 4, XT = [[0.25, '¼×', true], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×', true]];   // ends hidden on phones
const px = x => pos(x, XLO, XHI);
/* one row of a family against the usual (1×): bar from 1× to the median, whisker = 90 % range */
function ratioRow(label, r, e, tip, aux) {
  const c = px(1), m = px(r.med);
  return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="${esc(label)}: ${fmtXs(r.med, e)} the channel's usual, ${plural(r.n, 'upload')}">`
    + `<div class="lab">${esc(label)}</div><div class="track"><div class="base"></div>`
    + (r.rg ? `<div class="whisk" style="left:${px(r.rg[0])}%;width:${Math.max(0.6, px(r.rg[1]) - px(r.rg[0]))}%"></div>` : '')
    + `<div class="bar ${m < c ? 'neg' : ''}" style="left:${Math.min(c, m)}%;width:${Math.max(0.8, Math.abs(m - c))}%;background:${COL(r.dir)}"></div>`
    + `<div class="one" style="left:${c}%"></div></div>`
    + `<div class="val num">${fmtXs(r.med, e)}</div><div class="aux num">${aux || ''}</div></div>`;
}
const legendBars = () => '<div class="legend"><span><i style="background:var(--up)"></i>above its usual (whole range above 1×)</span>'
  + '<span><i style="background:var(--down)"></i>below its usual</span><span><i style="background:var(--neutral)"></i>not clear either way</span>'
  + '<span><i class="l" style="width:18px;background:rgba(209,212,220,.55)"></i>90 % range</span></div>';
function tile(label, value, sub) {
  return `<div class="kpi"><p class="label">${esc(label)}</p><div class="value">${esc(value)}</div><div class="sub">${sub}</div></div>`;
}

/* ---------- tables that sort on their headers and, with o.search, filter on a text box (state kept across redraws) */
function sortTable(host, o) {
  const old = host.querySelector('details'), st = host._st || (host._st = { si: o.sort || 0, dir: o.dir || -1, q: '' });
  if (old) { st.open = old.open; const i = old.querySelector('input'); if (i) st.q = i.value; }
  if (o.reset) { st.si = o.sort || 0; st.dir = o.dir || -1; st.q = ''; }       // a new channel: its own table
  host.innerHTML = `<details class="tbl"${st.open ? ' open' : ''}><summary>${esc(o.label)}</summary><div class="tbl-tools">`
    + (o.search ? `<input type="search" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.placeholder)}" value="${esc(st.q)}">` : '')
    + `<span class="cnt"></span></div><div class="tablewrap${o.tall ? ' tall' : ''}"><table class="grid"><thead><tr>`
    + o.cols.map((c, i) => `<th class="${c.n ? 'n' : ''}"><button type="button" data-i="${i}">${esc(c.h)}</button></th>`).join('')
    + '</tr></thead><tbody></tbody></table></div></details>';
  const tb = host.querySelector('tbody'), inp = host.querySelector('input'), cnt = host.querySelector('.cnt'), ths = $$('th', host);
  const draw = () => {
    const q = inp ? inp.value.trim().toLowerCase() : '', c = o.cols[st.si];
    const rows = o.rows.filter(r => !q || o.search(r).toLowerCase().includes(q)).map((r, i) => [r, c.k(r), i]).sort((a, b) => {
      const x = a[1], y = b[1];
      if (x == null || y == null) return x == null && y == null ? a[2] - b[2] : x == null ? 1 : -1;   // blanks last
      return ((typeof x === 'string' ? x.localeCompare(y) : x - y) || a[2] - b[2]) * st.dir;
    });
    tb.innerHTML = !rows.length && q ? `<tr><td class="muted" colspan="${o.cols.length}">No ${esc(o.unit)} matches “${esc(q)}”.</td></tr>`
      : rows.map(([r]) => `<tr${o.attr ? ' ' + o.attr(r) : ''}${o.rowCls && o.rowCls(r) ? ` class="${o.rowCls(r)}"` : ''}>`
        + o.cols.map(c => `<td class="${c.n ? 'n' : ''}${c.cls ? ' ' + c.cls : ''}">${c.v(r)}</td>`).join('') + '</tr>').join('');
    ths.forEach((th, i) => th.setAttribute('aria-sort', i === st.si ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'));
    cnt.textContent = q ? `${rows.length} of ${plural(o.rows.length, o.unit)}` : plural(o.rows.length, o.unit);
  };
  host.querySelector('thead').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const i = +b.dataset.i;
    if (i === st.si) st.dir = -st.dir; else { st.si = i; st.dir = o.cols[i].d || (o.cols[i].n ? -1 : 1); }
    draw();
  });
  if (inp) inp.addEventListener('input', () => { st.q = inp.value; draw(); });
  draw();
}

/* ---------- data */
const getJSON = async url => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return r.json();
};
function channelFile(cid) {
  if (!FILES.has(cid)) FILES.set(cid, getJSON(`data/study/${encodeURIComponent(cid)}.json`).catch(e => { FILES.delete(cid); throw e; }));
  return FILES.get(cid);
}

/* ---------- the picker (in the URL as ?c=<cid>, so a link opens that channel) */
function buildPicker() {
  const sel = $('#pick'), known = S.groups || [];
  const groups = known.concat([...new Set(S.channels.map(c => c.group))].filter(g => !known.includes(g)));
  sel.innerHTML = groups.map(g => {
    const cs = S.channels.filter(c => c.group === g).sort((a, b) => (b.now || 0) - (a.now || 0) || a.name.localeCompare(b.name));
    return cs.length ? `<optgroup label="${esc(gLong(g))}">` + cs.map(c => `<option value="${esc(c.cid)}">${esc(c.name)}</option>`).join('') + '</optgroup>' : '';
  }).join('');
  sel.disabled = false;
  sel.addEventListener('change', () => pick(sel.value));
}
function setURL(cid) {
  const q = new URLSearchParams(location.search);
  if (cid) q.set('c', cid); else q.delete('c');
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
}
async function pick(cid, initial) {
  const r = rowOf(cid);
  if (!r) return;
  cur = r;
  if (!initial) setURL(cid);
  $('#pick').value = cid;
  renderHero(); markPicked();
  const sec = $('#uploads');
  sec.classList.add('loading');
  let f = null;
  try { f = await channelFile(cid); } catch (e) { console.error(e); }
  if (cur !== r) return;                                  // a later pick won
  sec.classList.remove('loading');
  C = f;
  renderUploads();
}

/* ---------- hero */
/* a channel back from a long break within the last 12 months (so no year before to compare), from its uploads file */
function comeback(r) {
  if (!C || C.cid !== r.cid) return null;
  const seq = C.ups.filter(u => u.v && u.run != null), last = seq.length ? seq[seq.length - 1].run : null;
  const k = seq.findIndex((u, i) => i > 0 && u.run !== seq[i - 1].run && u.run === last);
  if (k < 1) return null;
  const a = seq[k - 1], b = seq[k], start = b.ts - (b.w || 0) * DAY / 2;
  if ((S.built_ts - start) / DAY > 365) return null;
  return { when: new Date(b.ts * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    months: Math.round((start - a.ts - (a.w || 0) * DAY / 2) / DAY / 30.44) };
}
function headline(r) {
  const f = S.focus_vs_story, name = esc(poss(r.name));
  if (f && r.name === f.name && r.now) {
    return `${name} typical video gets ${B(fmtV(f.now))} views: ${B(fmtX(f.times))} the typical other story channel `
      + `(${B(fmtV(f.other_story))}, the median of ${f.n_other}), and ${B(pct(f.hit))} of its uploads from the last 24 months passed ${B('1M')} views.`;
  }
  if (!r.now) {
    return `${esc(r.name)} has too few uploads from the last 12 months (${r.n_now}) for a typical figure`
      + (r.year ? `; a year before, its typical video got ${B(fmtV(r.year))} views.` : '.');
  }
  const d = trendDir(r.ratio), cb = r.ratio == null ? comeback(r) : null;
  const trend = cb ? `; it came back in ${esc(cb.when)} after a break of ${B(cb.months + ' months')}, so there is no year before to compare`
    : r.ratio == null ? `, with too few uploads a year before (${r.n_year}) to say which way it is going`
      : d === 'up' ? `, up to ${B(fmtM(r.ratio))} what it got a year before (${B(fmtV(r.year))})`
        : d === 'down' ? `, down to ${B(fmtM(r.ratio))} what it got a year before (${B(fmtV(r.year))})`
          : `, about level with a year before (${B(fmtM(r.ratio))}, ${B(fmtV(r.year))} then)`;
  return `${name} typical video gets ${B(fmtV(r.now))} views, ${B('#' + r.rank)} of ${ranked()} channels here${trend}.`;
}
function heroTiles(r) {
  const d = trendDir(r.ratio), hits = r.hit == null ? null : Math.round(r.hit * r.n_24), cb = r.ratio == null ? comeback(r) : null;
  return [
    tile('Typical views', fmtV(r.now), r.now ? `per video, last 12 months · <b>#${r.rank}</b> of ${ranked()}`
      : `${plural(r.n_now, 'upload')} in the last 12 months: too few`),
    tile('Against the year before', fmtM(r.ratio), r.ratio != null ? `${ARROW(d)}typical ${B(fmtV(r.year))} a year before`
      : cb ? `back in ${esc(cb.when)} after a ${cb.months}-month break: no year before`
        : r.year ? `typical ${B(fmtV(r.year))} a year before` : `${plural(r.n_year, 'upload')} a year before: too few`),
    tile('Past 1M views', pct(r.hit), r.n_24 ? `${hits} of ${plural(r.n_24, 'upload')}, last 24 months` : 'no uploads in the last 24 months'),
    tile('Uploads a month', r.per_month == null ? '–' : String(r.per_month), `${plural(r.n_now, 'upload')} in the last 12 months`),
    tile('Typical length', fmtMin(r.len_now), 'median, last 12 months'),
    tile('Subscribers', fmtV(r.subs), r.vps != null ? `${B(fmtR(r.vps))} views per subscriber on a typical video` : 'views per subscriber: –'),
  ].join('');
}
function feature(r) {
  const b = r.best;
  if (!b) return `<div class="feature"><div class="empty">No upload from the last 12 months is old enough yet to measure against ${esc(poss(r.name))} usual.</div></div>`;
  const href = yt(b.id);
  return `<div class="feature"><a class="media" href="${href}" target="_blank" rel="noopener" aria-label="Watch on YouTube">${thumb(b.id)}`
    + `<div class="over"><span class="tag">${r.n_now === 1 ? 'Its one upload of the last 12 months' : 'Best of the last 12 months'}</span>`
    + `<div class="who">${fmtO(b.out)} its usual</div></div></a>`
    + `<div class="body"><p class="draft"><a href="${href}" target="_blank" rel="noopener">${esc(b.t)}</a></p>`
    + `<div class="row"><span class="muted small">${fmtV(b.v)} views · ${agoTxt(b.age, r.group === 'Yours')}${b.dur ? ' · ' + dur(b.dur) : ''}</span>`
    + `<a class="copy" href="${href}" target="_blank" rel="noopener">Watch on YouTube ↗</a></div></div></div>`;
}
function renderHero() {
  const r = cur;
  document.title = r.name + ' · Channel Study';
  $('#eyebrow').textContent = 'Channel study · ' + when(S.built, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#pickmeta').innerHTML = `<span class="gchip"><span class="gsw" style="background:${gcol(r.group)}"></span>${esc(gName(r.group))}</span>`
    + (r.subs ? `<span>${fmtV(r.subs)} subscribers</span>` : '')
    + `<a href="${ytc(r.cid)}" target="_blank" rel="noopener">Channel on YouTube ↗</a>`;
  $('#headline').innerHTML = headline(r);
  $('#kpis').innerHTML = heroTiles(r);
  $('#feature').innerHTML = feature(r);
}

/* ---------- uploads */
const lenBand = m => { const o = S.lengths_order || []; return o[!m || m < 10 ? 0 : m < 20 ? 1 : m < 40 ? 2 : 3]; };
const bandOf = u => u.l || lenBand(u.m);          // the band What Works counted (older files: from the rounded minutes)
const ratioCls = out => out == null ? 'none' : out >= 2 ? 'up' : out <= 0.5 ? 'down' : 'mid';
const runsOf = ups => 1 + Math.max(0, ...ups.map(u => u.run || 0));
function renderUploads() {
  const r = cur, ups = C ? C.ups : [];
  if (!C) {
    $('#uploads-lede').textContent = `${r.name}'s uploads did not load.`;
    ['#scatter', '#sc-legend', '#c-fmt', '#l-bars', '#c-len', '#c-named', '#top-body', '#t-uploads', '#sc-cap', '#top-lede'].forEach(s => { $(s).innerHTML = ''; });
    return;
  }
  const scored = ups.filter(u => u.out != null).length, ts = ups.map(u => u.ts);
  const y0 = ups.length ? new Date(Math.min(...ts) * 1000).getFullYear() : null, y1 = ups.length ? new Date(Math.max(...ts) * 1000).getFullYear() : null;
  $('#uploads-lede').innerHTML = ups.length
    ? `${esc(r.name)}: ${plural(ups.length, 'upload')} from ${y0}${y1 !== y0 ? '–' + y1 : ''}, ${scored} of them measured against the channel's usual.`
    : `${esc(r.name)}: no uploads read yet.`;
  if (r.ratio == null && comeback(r)) { $('#headline').innerHTML = headline(r); $('#kpis').innerHTML = heroTiles(r); }   // the break, now known
  drawScatter(); renderBreakdowns(); renderTop(); renderTable();
}

/* the scatter: where each upload sits in time. Exact dates as they are; uploads that share one YouTube range ("2 years
   ago") are spread evenly across it in upload order, so a stack of them reads as the run of uploads it is. */
function place(ups, now) {
  const t = ups.map(u => u.ts), groups = new Map();
  ups.forEach((u, i) => { if (u.w > 0) { const k = u.ts + '|' + u.w; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); } });
  for (const idx of groups.values()) {
    const w = ups[idx[0]].w * DAY, lo = ups[idx[0]].ts - w / 2;
    idx.forEach((i, k) => { t[i] = Math.min(now, lo + (k + 0.5) / idx.length * w); });
  }
  return t;
}
/* each upload's usual, as trends.score has it: the median views of up to 10 uploads either side within its run (5+
   needed). Uploads under 3 weeks old or without views are not in the sequence (their run is null). */
function usuals(ups) {
  const out = new Array(ups.length).fill(null), runs = new Map();
  ups.forEach((u, i) => { if (u.v && u.run != null) { if (!runs.has(u.run)) runs.set(u.run, []); runs.get(u.run).push(i); } });
  for (const idx of runs.values()) {
    idx.forEach((i, k) => {
      const near = idx.slice(Math.max(0, k - 10), k).concat(idx.slice(k + 1, k + 11)).map(j => ups[j].v);
      if (near.length >= 5) out[i] = median(near);
    });
  }
  return out;
}
function timeTicks(t0, t1, width) {
  const d0 = new Date(t0 * 1000), d1 = new Date(t1 * 1000), maxN = Math.max(2, Math.floor(width / 70)), out = [];
  if ((t1 - t0) / DAY > 2.2 * 365) {
    const ya = d0.getFullYear() + 1, yb = d1.getFullYear();
    const step = [1, 2, 5, 10].find(s => Math.floor(yb / s) - Math.floor((ya - 1) / s) <= maxN) || 10;
    for (let y = ya; y <= yb; y++) if (y % step === 0) out.push([new Date(y, 0, 1).getTime() / 1000, String(y)]);
    return out;
  }
  const months = (d1.getFullYear() - d0.getFullYear()) * 12 + d1.getMonth() - d0.getMonth();
  const step = [1, 2, 3, 6, 12].find(s => months / s <= maxN) || 12;
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); d <= d1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    if (d.getMonth() % step) continue;
    out.push([d.getTime() / 1000, d.getMonth() === 0 || !out.length
      ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : d.toLocaleDateString(undefined, { month: 'short' })]);
  }
  return out;
}
const SC = { pts: [], w: 0 };
function drawScatter() {
  const box = $('#scatter'), cap = $('#sc-cap'), leg = $('#sc-legend');
  SC.pts = [];
  if (!C || !cur || C.cid !== cur.cid) { box.innerHTML = ''; return; }
  const ups = C.ups, now = S.built_ts || Date.now() / 1000;
  const live = ups.map((u, i) => i).filter(i => ups[i].v > 0), runs = runsOf(ups);
  const approx = ups.some(u => u.w > 0), noViews = ups.length - live.length;
  cap.textContent = 'Views (log scale) by upload date. Each dot is one upload, coloured by how it did against the channel\'s usual at the time; the line is that usual.'
    + (approx ? ' YouTube dates most uploads only as "N months / years ago": uploads that share one are spread across its range in upload order (hover or tap a dot for its range).'
      : ' Dates are exact.')
    + (noViews ? ` ${plural(noViews, 'upload')} without a view count ${noViews === 1 ? 'is' : 'are'} left out.` : '');
  leg.innerHTML = '<div class="legend"><span><i class="c" style="background:var(--up)"></i>2× its usual or more</span>'
    + '<span><i class="c" style="background:var(--mid)"></i>between ½× and 2×</span><span><i class="c" style="background:var(--down)"></i>½× or less</span>'
    + '<span><i class="c h"></i>not measured (under 3 weeks old, or too few uploads around it)</span>'
    + '<span><i class="l" style="width:18px;background:rgba(209,212,220,.5)"></i>its usual</span>'
    + (runs > 1 ? '<span><i class="d"></i>new run after a long break</span>' : '') + '</div>';
  if (!live.length) { box.innerHTML = '<p class="muted">No upload with a view count yet.</p>'; return; }
  const Wd = Math.max(280, Math.round(box.clientWidth || 800)), phone = Wd < 600;
  const H = phone ? 270 : 360, L = phone ? 38 : 48, R = phone ? 8 : 14, T = 28, Bm = 26, rad = 4;
  const t = place(ups, now), us = usuals(ups);
  let t0 = Infinity;
  for (const i of live) t0 = Math.min(t0, t[i], ups[i].ts - (ups[i].w || 0) * DAY / 2);
  const t1 = now, span = Math.max(t1 - t0, 30 * DAY);      // the right edge is the build: no ticks in the future
  t0 -= span * 0.015;
  const vs = live.map(i => ups[i].v).concat(us.filter(x => x > 0));
  const ylo = niceDown(Math.min(...vs)), yhi = niceUp(Math.max(...vs));
  const X = s => L + (s - t0) / (t1 - t0) * (Wd - L - R);
  const Y = v => T + (1 - (Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo))) * (H - T - Bm);
  const f1 = n => n.toFixed(1), parts = [];
  for (const [v, lab] of logTicks(ylo, yhi, phone ? 5 : 7)) {
    const y = f1(Y(v));
    parts.push(`<line class="sc-grid" x1="${L}" x2="${Wd - R}" y1="${y}" y2="${y}"/><text x="${L - 7}" y="${y}" dy="0.32em" text-anchor="end">${lab}</text>`);
  }
  for (const [s, lab] of timeTicks(t0, t1, Wd - L - R)) {
    const x = X(s), anchor = x < L + 16 ? 'start' : x > Wd - R - 16 ? 'end' : 'middle';
    parts.push(`<line class="sc-grid" x1="${f1(x)}" x2="${f1(x)}" y1="${H - Bm}" y2="${H - Bm + 4}"/><text x="${f1(x)}" y="${H - 7}" text-anchor="${anchor}">${esc(lab)}</text>`);
  }
  parts.push(`<line class="sc-grid" x1="${L}" x2="${Wd - R}" y1="${H - Bm}" y2="${H - Bm}"/>`);
  // the usual, one line per run
  const seq = live.filter(i => ups[i].run != null), byRun = new Map();
  for (const i of seq) if (us[i]) { if (!byRun.has(ups[i].run)) byRun.set(ups[i].run, []); byRun.get(ups[i].run).push(i); }
  for (const idx of byRun.values()) {
    if (idx.length > 1) parts.push(`<path class="sc-usual" d="M${idx.map(i => f1(X(t[i])) + ',' + f1(Y(us[i]))).join(' L')}"/>`);
  }
  // a new run after a long break: the dashed line sits in the middle of the gap
  let lastLab = -Infinity;
  for (let k = 1; k < seq.length; k++) {
    const a = ups[seq[k - 1]], b = ups[seq[k]];
    if (a.run === b.run) continue;
    const hiA = a.ts + (a.w || 0) * DAY / 2, loB = b.ts - (b.w || 0) * DAY / 2, x = X((hiA + loB) / 2), gap = (loB - hiA) / DAY;
    parts.push(`<line class="sc-break" x1="${f1(x)}" x2="${f1(x)}" y1="${T - 6}" y2="${H - Bm}"/>`);
    if (x - lastLab > 150) {
      const right = x > Wd - R - 150;
      parts.push(`<text x="${f1(right ? x - 5 : x + 5)}" y="${T - 10}" text-anchor="${right ? 'end' : 'start'}">new run after a ${gap >= 60 ? Math.round(gap / 30.44) + '-month' : Math.round(gap) + '-day'} break</text>`);
      lastLab = x;
    }
  }
  // the uploads: grey first, the clear ones on top
  const order = { mid: 0, none: 1, down: 2, up: 3 };
  const dots = live.map(i => ({ i, x: X(t[i]), y: Y(ups[i].v), c: ratioCls(ups[i].out) })).sort((a, b) => order[a.c] - order[b.c] || a.i - b.i);
  parts.push(dots.map(d => `<circle class="sc-dot ${d.c}" cx="${f1(d.x)}" cy="${f1(d.y)}" r="${rad}"/>`).join(''));
  Object.assign(SC, { pts: dots, w: Wd, X, ups, us, runs, now, hover: null });
  box.innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="${esc(`Views of ${plural(live.length, 'upload')} by upload date, log scale; the table below lists every upload`)}">`
    + parts.join('') + '<g class="sc-hover"></g></svg>';
}
function upTip(u, usual, mouse) {
  return {
    value: `${fmtV(u.v)} views` + (u.out != null ? ` · ${fmtO(u.out)} its usual` : ''), label: u.t,
    lines: [upDate(u, true), [u.m ? fmtMin(u.m) : '', u.f].filter(Boolean).join(' · '),
      u.out != null ? (usual ? `Its usual then: ${fmtV(usual)}` : '')
        : u.run == null ? 'Not measured yet: under 3 weeks old' : 'Not measured: too few uploads around it in its run',
      SC.runs > 1 && u.run != null ? `Run ${u.run + 1} of ${SC.runs}` : '', mouse ? 'Click to watch on YouTube' : ''],
  };
}
function scHover(e) {
  const svg = $('#scatter svg');
  if (!svg || !SC.pts.length) return;
  const b = svg.getBoundingClientRect(), k = SC.w / b.width, x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
  let best = null, bd = 22 * 22;
  for (const p of SC.pts) { const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = p; } }
  const g = svg.querySelector('.sc-hover');
  SC.hover = best;
  if (!best) { g.innerHTML = ''; hideTip(); return; }
  const u = SC.ups[best.i];
  let h = '';
  if (u.w > 0) {
    const x0 = SC.X(u.ts - u.w * DAY / 2), x1 = SC.X(Math.min(SC.now, u.ts + u.w * DAY / 2));
    h += `<line class="sc-range" x1="${x0.toFixed(1)}" x2="${x1.toFixed(1)}" y1="${best.y.toFixed(1)}" y2="${best.y.toFixed(1)}"/>`;
  }
  g.innerHTML = h + `<circle class="sc-hl" cx="${best.x.toFixed(1)}" cy="${best.y.toFixed(1)}" r="7.5"/>`;
  tipAt(upTip(u, SC.us[best.i], e.pointerType === 'mouse'), e.clientX, e.clientY);
}
function clearHovers() {
  const g = $('#scatter .sc-hover');
  if (g) g.innerHTML = '';
  SC.hover = null;
  monthlyOff();
}

/* by title format, by length, and titles that name a fighter: the channel's measured uploads in each against 1× */
function famRows(items, total, label, help) {
  if (!items.length) return '<p class="muted small">No measured uploads yet.</p>';
  const e = xExtra(items.map(x => x.med));
  return axisRow(XT, px, ['', 'Usual', 'Uploads']) + items.map(x => {
    x.dir = clearOf(x);
    const tip = addTip(`${fmtXs(x.med, e)} the channel's usual`, label(x), [help ? help(x) : '',
      x.rg ? `90 % range ${fmtXs(x.rg[0], e)}–${fmtXs(x.rg[1], e)}` : '',
      `${plural(x.n, 'upload')}, ${pct(x.n / total)} of its measured uploads`,
      x.dir === 'up' ? 'Clearly above its usual' : x.dir === 'down' ? 'Clearly below its usual' : 'Not clear either way']);
    return ratioRow(label(x), x, e, tip, String(x.n));
  }).join('');
}
function renderBreakdowns() {
  const r = cur;
  if (!C || C.cid !== r.cid) return;
  const sc = C.ups.filter(u => u.out != null), total = sc.length, help = (W && W.help && W.help.formats) || {};
  const outs = pred => sc.filter(pred).map(u => u.out);
  const fm = ((S.by_format || {})[r.cid] || []).map(x => ({ key: x.fmt, n: x.n, med: x.med, rg: range90(outs(u => u.f === x.fmt), r.cid + '|f|' + x.fmt) }));
  $('#c-fmt').innerHTML = famRows(fm, total, x => x.key, x => help[x.key] || '');
  $('#l-bars').innerHTML = fm.length ? legendBars() : '';
  const lo = S.lengths_order || [], lm = {};
  for (const x of (S.by_length || {})[r.cid] || []) lm[x.len] = x;
  const ln = lo.filter(k => lm[k]).map(k => ({ key: k, n: lm[k].n, med: lm[k].med, rg: range90(outs(u => bandOf(u) === k), r.cid + '|l|' + k) }));
  $('#c-len').innerHTML = famRows(ln, total, x => x.key);
  const nm = [[true, 'Names a fighter'], [false, 'No fighter']].map(([v, lab]) => {
    const xs = outs(u => !!u.named === v);
    return xs.length ? { key: lab, n: xs.length, med: median(xs), rg: range90(xs, r.cid + '|n|' + v) } : null;
  }).filter(Boolean);
  $('#c-named').innerHTML = famRows(nm, total, x => x.key);
}

/* the top uploads as video cards, by how far above the channel's usual or by views */
function vcard(u) {
  const c = ratioCls(u.out);
  return `<a class="vcard" href="${yt(u.id)}" target="_blank" rel="noopener"><div class="media">${thumb(u.id)}`
    + (u.out != null ? `<span class="big ${c === 'up' ? '' : c}">${fmtO(u.out)}</span>` : '')
    + (u.m ? `<span class="dur">${fmtMin(u.m)}</span>` : '') + '</div>'
    + `<div class="vb"><div class="vt">${esc(u.t)}</div><div class="vm">${fmtV(u.v)} views · ${esc(upDate(u))}</div>`
    + `<div class="chips"><span>${esc(u.f)}</span>${u.l || u.m ? `<span>${esc(bandOf(u))}</span>` : ''}</div></div></a>`;
}
function renderTop() {
  if (!C || C.cid !== cur.cid) return;
  const k = topKey;
  const list = C.ups.filter(u => k === 'out' ? u.out != null : u.v > 0).sort((a, b) => b[k] - a[k]).slice(0, 8);
  $('#top-lede').textContent = !list.length ? '' : k === 'out'
    ? `The ${list.length} uploads furthest above ${poss(cur.name)} usual at the time (badge: × its usual).`
    : `${poss(cur.name)} ${list.length} most-viewed uploads (badge: × its usual).`;
  $('#top-body').innerHTML = list.map(vcard).join('') || '<p class="muted">None yet.</p>';
}
function renderTable() {
  const ups = C.ups, runs = runsOf(ups);
  const cols = [
    { h: 'Date', k: u => u.ts, v: u => esc(upDate(u)), d: -1 },
    { h: 'Title', k: u => u.t.toLowerCase(), v: u => `<a href="${yt(u.id)}" target="_blank" rel="noopener">${esc(u.t)}</a>`, cls: 't' },
    { h: 'Views', k: u => u.v, v: u => fmtV(u.v), n: true },
    { h: '× its usual', k: u => u.out, v: u => u.out == null ? '–' : `<span class="x ${u.out >= 2 ? 'up' : u.out <= 0.5 ? 'down' : ''}">${fmtO(u.out)}</span>`, n: true },
    { h: 'Minutes', k: u => u.m || null, v: u => u.m ? esc(u.m) : '–', n: true },
    { h: 'Format', k: u => u.f, v: u => esc(u.f) },
    { h: 'Names a fighter', k: u => u.named ? 1 : 0, v: u => u.named ? 'Yes' : '', d: -1 },
  ];
  if (runs > 1) cols.push({ h: 'Run', k: u => u.run, v: u => u.run == null ? '–' : String(u.run + 1), n: true });
  sortTable($('#t-uploads'), { label: `Every upload as a table (${ups.length})`, cols, rows: ups, sort: 0, dir: -1, reset: true,
    search: u => u.t + ' ' + u.f, placeholder: 'Search titles or formats', tall: true, unit: 'upload' });
}

/* ---------- compare: every channel's typical views per video now */
function renderCompare() {
  const rows = S.channels.slice().sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || a.name.localeCompare(b.name));   // study.py's rank
  const vals = rows.flatMap(r => [r.now, r.year]).filter(v => v > 0);
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...vals)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...vals))));
  const p = v => pos(v, lo, hi), ticks = [];
  for (let v = lo, i = 0; v <= hi * 1.001; v *= 10, i++) ticks.push([v, fmtV(v), i % 2 === 1]);
  $('#compare-lede').textContent = `Typical views per video (the median of each channel's uploads from the last 12 months) on all ${S.channels.length} `
    + 'channels, log scale; the white tick is the year before. Click a channel to study it.';
  $('#c-compare').innerHTML = axisRow(ticks, p, ['', 'Typical', 'Rank', 'vs before']) + rows.map(r => {
    const b = r.now ? p(r.now) : null, y = r.year ? p(r.year) : null, d = trendDir(r.ratio);
    const tip = addTip(r.now ? `${fmtV(r.now)} typical views` : 'Too few uploads in the last 12 months', r.name, [
      `${gName(r.group)} · ${fmtV(r.subs)} subscribers`, `A year before ${fmtV(r.year)}${r.ratio == null ? '' : ' · now ' + fmtM(r.ratio)}`,
      r.n_24 ? `${pct(r.hit)} of ${plural(r.n_24, 'upload')} past 1M views (24 months)` : '',
      r.top10 != null ? `Its top tenth of uploads hold ${pct(r.top10)} of its views` : '',
      `${r.per_month} uploads a month · typical ${fmtMin(r.len_now)}`, 'Click to study it']);
    return `<div class="crow on-click" role="button" tabindex="0" aria-pressed="false" data-cid="${esc(r.cid)}" data-tip="${tip}" aria-label="${esc(r.name)}: ${fmtV(r.now)} typical views">`
      + `<div class="lab"><span class="gsw" style="background:${gcol(r.group)}"></span>${esc(r.name)}<span class="gchip">${esc(gName(r.group))}</span></div>`
      + '<div class="track"><div class="base"></div>'
      + (b != null ? `<div class="bar" style="left:0;width:${Math.max(0.8, b)}%;background:${gcol(r.group)}"></div>` : '')
      + (y != null ? `<div class="yb" style="left:${y}%"></div>` : '') + '</div>'
      + `<div class="val num">${fmtV(r.now)}</div><div class="aux num">${r.rank ? '#' + r.rank : '–'}</div>`
      + `<div class="aux num">${ARROW(d)}${fmtM(r.ratio)}</div></div>`;
  }).join('');
  const groups = (S.groups || []).filter(g => S.channels.some(c => c.group === g));
  $('#l-compare').innerHTML = '<div class="legend">' + groups.map(g => `<span><i style="background:${gcol(g)}"></i>${esc(gLong(g))}</span>`).join('')
    + '<span><i class="t" style="background:rgba(255,255,255,.8)"></i>the year before</span>'
    + '<span><i style="background:rgba(126,87,194,.5)"></i>the channel shown above</span></div><div id="t-compare"></div>';
  sortTable($('#t-compare'), { label: 'Show as a table', rows, sort: 3, dir: -1, unit: 'channel',
    attr: r => `data-cid="${esc(r.cid)}"`, rowCls: r => (cur && r.cid === cur.cid ? 'picked' : ''), cols: [
      { h: 'Channel', k: r => r.name.toLowerCase(), v: r => `<a href="?c=${encodeURIComponent(r.cid)}" data-pick="${esc(r.cid)}">${esc(r.name)}</a>` },
      { h: 'Group', k: r => r.group, v: r => esc(gName(r.group)) },
      { h: 'Subscribers', k: r => r.subs, v: r => fmtV(r.subs), n: true },
      { h: 'Typical now', k: r => r.now, v: r => fmtV(r.now), n: true },
      { h: 'A year before', k: r => r.year, v: r => fmtV(r.year), n: true },
      { h: 'Now ÷ before', k: r => r.ratio, v: r => r.ratio == null ? '–' : fmtX(r.ratio), n: true },
      { h: 'Uploads a month', k: r => r.per_month, v: r => r.per_month == null ? '–' : String(r.per_month), n: true },
      { h: 'Past 1M (24 mo)', k: r => r.n_24 ? r.hit : null, v: r => r.n_24 ? `${pct(r.hit)} of ${r.n_24}` : '–', n: true },
      { h: 'Views per sub', k: r => r.vps, v: r => fmtR(r.vps), n: true },
      { h: 'Typical min', k: r => r.len_now, v: r => r.len_now == null ? '–' : String(r.len_now), n: true },
      { h: 'Rank', k: r => r.rank, v: r => r.rank ? '#' + r.rank : '–', n: true, d: 1 },
    ] });
}
function markPicked() {
  $$('#c-compare .crow[data-cid]').forEach(el => { const on = el.dataset.cid === cur.cid; el.classList.toggle('picked', on); el.setAttribute('aria-pressed', String(on)); });
  $$('#t-compare tr[data-cid]').forEach(tr => tr.classList.toggle('picked', tr.dataset.cid === cur.cid));
}

/* ---------- VoteSport and ERA MMA (study.static: read once from outside the screener) */
function renderPair() {
  const st = S.static || {}, P = st.pairs || [], M0 = st.monthly || [], Y0 = st.yearly || [];
  if (!P.length && !M0.length && !Y0.length) { $('#pair').hidden = true; $('#tab-pair').hidden = true; return; }
  const en = st.focus || S.focus, ru = st.parent || '';
  $('#tab-pair').textContent = `${en} & ${ru}`;
  $('#h-pair').textContent = `${en} and ${ru}`;
  const rat = P.map(p => p.en_views / p.ru_views), days = P.map(p => daysApart(p.ru_date, p.en_date)), e = xExtra(rat);
  const medR = median(rat), wins = P.filter(p => p.en_views > p.ru_views).length, medD = median(days);
  const dates = P.flatMap(p => [p.ru_date, p.en_date]).filter(Boolean).sort();
  const mon = s => dayTxt(s, { month: 'short', year: 'numeric' });
  $('#pair-lede').innerHTML = P.length
    ? `The same fighter story on both channels: ${esc(ru)} in Russian, ${esc(en)} in English. ${P.length} pairs from ${mon(dates[0])} to ${mon(dates[dates.length - 1])}, `
      + `read once from outside the screener on ${esc(dayTxt(st.read))} (this part changes only by hand).`
    : `Read once from outside the screener on ${esc(dayTxt(st.read))} (this part changes only by hand).`;
  $('#pair-kpis').innerHTML = P.length ? [
    tile('English ÷ Russian views', fmtX(medR, e), `median of the ${P.length} pairs`),
    tile('English ahead', `${wins} of ${P.length}`, `pairs where ${esc(en)} got more views`),
    tile('Days apart', plural(Math.abs(medD), 'day'), medD >= 0 ? `median: ${esc(en)} after ${esc(ru)}` : `median: ${esc(en)} first`),
    tile('Views, all pairs', fmtV(sum(P.map(p => p.en_views))), `on ${esc(en)}, against ${B(fmtV(sum(P.map(p => p.ru_views))))} on ${esc(ru)}`),
  ].join('') : '';
  if (P.length) {
    const all = P.flatMap(p => [p.en_views, p.ru_views]), lo = niceDown(Math.min(...all)), hi = niceUp(Math.max(...all)), pp = v => pos(v, lo, hi);
    const ticks = logTicks(lo, hi, 8).map(([v, l]) => [v, l, !isPow10(v)]);
    $('#pairs-cap').textContent = `Views of each pair on ${en} (English) and ${ru} (Russian), log scale, from ${st.pairs_source} on ${dayTxt(st.read)}; oldest first.`;
    $('#c-pairs').innerHTML = axisRow(ticks, pp, ['', 'EN ÷ RU', en, ru]) + P.map((p, i) => {
      const a = pp(p.ru_views), b = pp(p.en_views), x = rat[i], dd = days[i];
      const tip = addTip(`${fmtX(x, e)} · ${fmtV(p.en_views)} against ${fmtV(p.ru_views)}`, p.subject, [
        `${en} (English), ${dayTxt(p.en_date)}: ${fmtV(p.en_views)} views`, `${ru} (Russian), ${dayTxt(p.ru_date)}: ${fmtV(p.ru_views)} views`,
        dd === 0 ? 'Out the same day' : dd > 0 ? `${en} ${plural(dd, 'day')} later` : `${en} ${plural(-dd, 'day')} earlier`]);
      return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="${esc(p.subject)}: ${fmtV(p.en_views)} in English against ${fmtV(p.ru_views)} in Russian">`
        + `<div class="lab">${esc(p.subject)}</div><div class="track"><div class="base"></div>`
        + `<div class="link" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></div>`
        + `<div class="pt" style="left:${a}%;background:var(--ref)"></div><div class="pt" style="left:${b}%;background:var(--g-story)"></div></div>`
        + `<div class="val num">${ARROW(x >= 1 ? 'up' : 'down')}${fmtX(x, e)}</div><div class="aux num">${fmtV(p.en_views)}</div><div class="aux num">${fmtV(p.ru_views)}</div></div>`;
    }).join('');
    $('#l-pairs').innerHTML = `<div class="legend"><span><i class="c" style="background:var(--g-story)"></i>${esc(en)} (English)</span>`
      + `<span><i class="c" style="background:var(--ref)"></i>${esc(ru)} (Russian)</span>`
      + '<span><span class="up">▲</span> English ahead · <span class="down">▼</span> behind</span></div>';
  } else $('#p-pairs').hidden = true;
  $('#m-title').textContent = `${en} month by month`;
  $('#m-cap').textContent = M0.length ? `Views gained each month and the subscriber count, from ${st.monthly_source} (read ${dayTxt(st.read)}); two charts on one month axis. Hover for the month.` : '';
  drawMonthly();
  if (Y0.length) {
    const vk = 'votesport', rk = 'era_mma', top = niceTop(Math.max(...Y0.flatMap(y => [y[vk] || 0, y[rk] || 0])), 3), py = v => v / top.top * 100;
    const ticks = [];
    for (let v = 0; v <= top.top + 1e-6; v += top.step) ticks.push([v, v ? fmtV(v) : '0', ticks.length % 2 === 1]);
    const ey = xExtra(Y0.map(y => y[rk] ? y[vk] / y[rk] : null));
    $('#y-cap').textContent = `${st.yearly_source}.`;
    $('#c-yearly').innerHTML = axisRow(ticks, py, ['', en, ru, 'EN ÷ RU']) + Y0.map(y => {
      const tip = addTip(`${fmtV(y[vk])} against ${fmtV(y[rk])}`, `${y.year}: average views a month`, [`${en} ${fmtV(y[vk])}`, `${ru} ${fmtV(y[rk])}`]);
      return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="${esc(y.year)}: ${esc(en)} ${fmtV(y[vk])}, ${esc(ru)} ${fmtV(y[rk])} a month">`
        + `<div class="lab">${esc(y.year)}</div><div class="track two"><div class="zero"></div>`
        + `<div class="bar a" style="left:0;width:${Math.max(0.8, py(y[vk] || 0))}%;background:var(--g-story)"></div>`
        + `<div class="bar b" style="left:0;width:${Math.max(0.8, py(y[rk] || 0))}%;background:var(--ref)"></div></div>`
        + `<div class="val num">${fmtV(y[vk])}</div><div class="aux num">${fmtV(y[rk])}</div><div class="aux num">${y[rk] ? fmtX(y[vk] / y[rk], ey) : '–'}</div></div>`;
    }).join('');
    $('#l-yearly').innerHTML = `<div class="legend"><span><i style="background:var(--g-story)"></i>${esc(en)}</span><span><i style="background:var(--ref)"></i>${esc(ru)}</span></div>`;
    const a = Y0[0], z = Y0[Y0.length - 1];
    $('#caveat').innerHTML = `<p>Russia's YouTube slowdown and block hold ${esc(poss(ru))} Russian views down, so every English ÷ Russian gap on this page is `
      + 'inflated: read it as the two channels\' reach on YouTube, not as how much more the English versions are wanted.</p>'
      + (a !== z ? `<p>${esc(poss(ru))} average views a month went from ${B(fmtV(a[rk]))} in ${esc(a.year)} to ${B(fmtV(z[rk]))} in ${esc(z.year)}; `
        + `${esc(poss(en))} from ${B(fmtV(a[vk]))} to ${B(fmtV(z[vk]))}.</p>` : '');
  } else {
    $('#p-yearly').hidden = true;
    $('#caveat').innerHTML = `<p>Russia's YouTube slowdown and block hold ${esc(poss(ru))} Russian views down, so every English ÷ Russian gap on this page is inflated.</p>`;
  }
}
/* the monthly chart: views gained (columns) over subscribers (a line), two plots on one month axis, never two scales on one */
const MC = {};
const barPath = (x, y, w, h, r) => {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}`
    + `H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
};
function drawMonthly() {
  const st = (S && S.static) || {}, M0 = st.monthly || [], box = $('#c-monthly');
  if (!M0.length) { $('#p-monthly').hidden = true; return; }
  const Wd = Math.max(280, Math.round(box.clientWidth || 800)), phone = Wd < 600;
  const L = phone ? 40 : 52, R = phone ? 10 : 16, T1 = 28, H1 = phone ? 120 : 160, G = 50, H2 = phone ? 92 : 118, Bm = 26;
  const T2 = T1 + H1 + G, H = T2 + H2 + Bm, n = M0.length, band = (Wd - L - R) / n, bw = Math.max(2, Math.min(24, band - 2));
  const vt = niceTop(Math.max(...M0.map(m => m.views_gained || 0))), stp = niceTop(Math.max(...M0.map(m => m.subs || 0)));
  const xc = i => L + (i + 0.5) * band, yv = v => T1 + H1 - v / vt.top * H1, ys = v => T2 + H2 - v / stp.top * H2;
  const f1 = v => v.toFixed(1), parts = [`<text class="ttl" x="${L}" y="${T1 - 12}">Views gained a month</text>`, `<text class="ttl" x="${L}" y="${T2 - 12}">Subscribers</text>`];
  for (const [t, top, y] of [[vt, T1, yv], [stp, T2, ys]]) {
    for (let v = 0; v <= t.top + 1e-6; v += t.step) {
      parts.push(`<line class="sc-grid" x1="${L}" x2="${Wd - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${L - 7}" y="${f1(y(v))}" dy="0.32em" text-anchor="end">${v ? fmtV(v) : '0'}</text>`);
    }
  }
  M0.forEach((m, i) => { const h = (m.views_gained || 0) / vt.top * H1; parts.push(`<path class="m-bar" data-i="${i}" d="${barPath(xc(i) - bw / 2, T1 + H1 - h, bw, h, 4)}"/>`); });
  const pts = M0.map((m, i) => [xc(i), ys(m.subs || 0)]), line = pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' L');
  parts.push(`<path class="m-area" d="M${f1(pts[0][0])},${T2 + H2} L${line} L${f1(pts[n - 1][0])},${T2 + H2} Z"/><path class="m-line" d="M${line}"/>`);
  const step = [1, 2, 3, 6, 12].find(s => n / s * (phone ? 46 : 60) <= Wd - L - R) || 12;
  M0.forEach((m, i) => {
    const d = ymd(m.month);
    if (!d || d.getMonth() % step) return;
    const x = xc(i), anchor = x < L + 14 ? 'start' : x > Wd - R - 14 ? 'end' : 'middle';
    parts.push(`<text x="${f1(x)}" y="${H - 7}" text-anchor="${anchor}">${esc(d.getMonth() === 0 ? String(d.getFullYear()) : d.toLocaleDateString(undefined, { month: 'short' }))}</text>`);
  });
  const lm = M0[n - 1], lp = pts[n - 1];
  parts.push(`<text class="lbl" x="${f1(xc(n - 1) + bw / 2)}" y="${f1(yv(lm.views_gained || 0) - 7)}" text-anchor="end">${fmtV(lm.views_gained)}</text>`);
  parts.push(`<circle class="m-dot" cx="${f1(lp[0])}" cy="${f1(lp[1])}" r="4"/><text class="lbl" x="${f1(lp[0] - 6)}" y="${f1(lp[1] - 10)}" text-anchor="end">${fmtV(lm.subs)}</text>`);
  Object.assign(MC, { w: Wd, n, L, band, xc, pts, top: T1 - 4, bottom: T2 + H2, rows: M0 });
  box.innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="${esc(`${st.focus || ''} views gained a month and subscribers, ${M0.length} months`)}">`
    + parts.join('') + '<g class="m-hover"></g></svg>';
}
function monthlyHover(e) {
  const svg = $('#c-monthly svg');
  if (!svg || !MC.n) return;
  const b = svg.getBoundingClientRect(), x = (e.clientX - b.left) * MC.w / b.width;
  const i = Math.max(0, Math.min(MC.n - 1, Math.floor((x - MC.L) / MC.band)));
  $$('#c-monthly .m-bar').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
  const p = MC.pts[i], m = MC.rows[i];
  svg.querySelector('.m-hover').innerHTML = `<line class="m-cross" x1="${MC.xc(i).toFixed(1)}" x2="${MC.xc(i).toFixed(1)}" y1="${MC.top}" y2="${MC.bottom}"/>`
    + `<circle class="m-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5"/>`;
  tipAt({ value: `${fmtV(m.views_gained)} views gained`, label: dayTxt(m.month, { month: 'long', year: 'numeric' }),
    lines: [`${fmtV(m.subs)} subscribers (+${fmtV(m.subs_gained)})`, `${fmtV(m.views)} views in all`] }, e.clientX, e.clientY);
}
function monthlyOff() {
  const g = $('#c-monthly .m-hover');
  if (g) g.innerHTML = '';
  $$('#c-monthly .m-bar.on').forEach(el => el.classList.remove('on'));
}

/* ---------- the niche in short: What Works' own numbers at What Works' precision, each card opening its chart */
const DIRW = r => !r || r.n < 20 || r.chans < 3 ? null : r.lo > 1 ? 'up' : r.hi < 1 ? 'down' : null;   // app.js DIR
function renderNiche() {
  const body = $('#niche-body');
  $('#niche-lede').textContent = 'What works across the whole niche is What Works\' job. Here it is in short, with its own numbers; each card opens the chart there.';
  const card = (h, sub, items, href, go) => `<a class="ncard" href="${href}"><h3>${esc(h)}</h3>${sub ? `<div class="ns">${esc(sub)}</div>` : ''}`
    + (items.length ? `<ul>${items.join('')}</ul>` : '') + `<span class="go">${esc(go || 'See it in What Works')} →</span></a>`;
  if (!W) {
    body.innerHTML = card('Formats', '', [], 'index.html#working') + card('Length', '', [], 'index.html#working')
      + card('Title habits', '', [], 'index.html#working') + card('Channels', '', [], 'index.html#channels');
    return;
  }
  const li = (x, cls, txt) => `<li><span class="xb ${cls}">${x}</span>${txt}</li>`;
  const fnow = ((W.formats || {}).all || {}).now || {}, ef = xpOf('formats', 'all');
  const keys = (W.format_order || Object.keys(fnow)).filter(k => fnow[k]);
  const fup = keys.filter(k => DIRW(fnow[k]) === 'up').sort((a, b) => fnow[b].med - fnow[a].med);
  const fdn = keys.filter(k => DIRW(fnow[k]) === 'down').sort((a, b) => fnow[a].med - fnow[b].med);
  const fItems = (fup.length ? fup.map(k => li(fmtX(fnow[k].med, ef), 'up', esc(k))) : ['<li>No format clearly beats the usual</li>'])
    .concat(fdn.map(k => li(fmtX(fnow[k].med, ef), 'down', `${esc(k)}: clearly below`)));
  const ls = (((W.lengths || {}).Story || {}).now) || {}, el = xpOf('lengths', 'Story'), win = (W.shape || {}).lengths || [];
  const lItems = win.length ? win.map(k => li(fmtX(ls[k] && ls[k].med, el), 'up', `${esc(k)} on story channels`)) : ['<li>No length clearly beats the usual on story channels</li>'];
  const eh = xpOf('habits'), hb = W.habits || [];
  const hItems = hb.filter(h => h.better).slice(0, 3).map(h => li(fmtX(h.yes, eh), 'up', `titles that ${esc(h.phrase)} (rest ${fmtX(h.no, eh)})`))
    .concat(hb.filter(h => !h.better).slice(0, 2).map(h => li(fmtX(h.yes, eh), 'down', `titles that ${esc(h.phrase)} (rest ${fmtX(h.no, eh)})`)));
  const gm = W.group_momentum || {}, em = xpOf('momentum');
  const gItems = (S.groups || []).filter(g => gm[g]).map(g => li(fmtX(gm[g].ratio, em), gm[g].ratio >= 1 ? 'up' : 'down',
    `${esc(g.toLowerCase())} channels (${gm[g].up} of ${gm[g].chans} up)`));
  body.innerHTML = card('Formats', 'Against their channel\'s usual · all channels, last 12 months', fItems, 'index.html#working')
    + card('Length', 'The length that wins', lItems, 'index.html#working')
    + card('Title habits', 'With the habit against without · all channels', hItems.length ? hItems : ['<li>No title habit clearly differs</li>'], 'index.html#working')
    + card('Channels', 'Typical views now against the year before', gItems, 'index.html#channels');
}

/* ---------- how it works, footer, status */
function renderHow() {
  const st = S.static || {}, en = st.focus || S.focus, ru = st.parent || '';
  const items = [
    ['The ratio', 'Each upload\'s views ÷ the median of the 10 uploads either side on its own channel: its usual at the time, so a big channel and a small one read alike. Uploads under 3 weeks old are left out while they still collect views. These are What Works\' own numbers: the same uploads, the same analysis, the same build.'],
    ['Windows', 'Typical = the median. Last 12 months = 3 weeks to 1 year old; the year before = 1–2 years old; past 1M counts the uploads from 3 weeks to 2 years old. Uploads a month and typical length are the last 12 months\'.'],
    ['Upload dates', 'YouTube\'s listing says "N months / years ago", so most dates are ranges: each upload sits in the middle of what its wording allows (the ± is half the range), and in the chart the uploads that share a range are spread across it in upload order. Your own channel\'s uploads have exact dates (the screener\'s).'],
    ['Runs', 'A break of more than 180 days starts a new run (the dashed line in the chart), and an upload is compared only within its run: after a long break the audience is not the one before it. A break counts only when the date ranges make it certain.'],
    ['Formats, lengths, names', `Formats come from titles (What Works' rules). Each bar is the median ratio of the channel's measured uploads in it; the thin line is its 90 % range (those uploads re-drawn at random), and a bar is teal or red only when that whole range is above or below 1× with ${MIN_CLEAR}+ uploads. "Names a fighter" is What Works' title habit of that name.`],
    ['Compare', 'Typical views per video in the last 12 months (channels with 3+ uploads in it), ranked, against the year before. Views per subscriber = typical views ÷ subscribers. The group colours only tell the groups apart.'],
    ['Sources', `Uploads, views, lengths and subscribers: the screener's What Works store, ${S.channels.length} channels' public YouTube listings read about once a week, rebuilt with every What Works build. The ${en} and ${ru} part: ${st.pairs_source || '–'}, ${st.monthly_source || '–'} and ${st.yearly_source || '–'}, read on ${dayTxt(st.read)}; it changes only by hand.`],
    ['Not public', 'Click-through rate, watch time, retention and where viewers come from are only in each channel\'s own YouTube Studio, so none of them is here.'],
  ];
  $('#how-body').innerHTML = items.map(([h, t]) => `<div><b class="h">${esc(h)}</b>${esc(t)}</div>`).join('');
  $('#foot').innerHTML = `Built ${esc(when(S.built))} with What Works · ${S.channels.length} channels · ${sum(S.channels.map(c => c.n)).toLocaleString()} uploads`
    + (st.read ? ` · ${esc(en)} study figures read ${esc(dayTxt(st.read))}` : '');
}
async function status() {
  let st = null;
  try { st = await (await fetch(STATIC ? 'data/status.json' : 'api/status', { cache: 'no-store' })).json(); } catch (e) { /* no status: the build time alone */ }
  const age = S && S.built_ts ? (Date.now() / 1000 - S.built_ts) / 3600 : null;
  let dot = '', txt = 'Updated ' + when(S && S.built, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (st && st.ok === false && st.error) { dot = 'red'; txt = 'Last update failed'; }
  else if (age != null && age > 30) { dot = 'amber'; txt = `Updated ${Math.round(age)} h ago`; }
  if (st && st.running) txt = 'Updating…';
  if (st && st.next_read) txt += ' · next read ' + when(st.next_read, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  $('#updated').innerHTML = `<span class="dot ${dot}"></span><span>${esc(txt)}</span>`;
}

/* ---------- wiring */
/* pick from further down the page, then go up to it: after the redraw is laid out, since the browser's scroll anchoring
   would otherwise cancel a smooth scroll that starts while the content above moves */
async function choose(cid, focusPicker) {
  if (!cur || cid !== cur.cid) await pick(cid);
  if (focusPicker) $('#pick').focus({ preventScroll: true });
  void document.body.offsetHeight;
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
}
document.addEventListener('click', e => {
  const s = e.target.closest('#top-seg button');
  if (s) {
    topKey = s.dataset.k;
    $$('#top-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === s)));
    renderTop();
    return;
  }
  const a = e.target.closest('a[data-pick]');
  if (a) {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); choose(a.dataset.pick); }
    return;
  }
  const row = e.target.closest('#c-compare .crow[data-cid]');
  if (row) choose(row.dataset.cid);
});
document.addEventListener('keydown', e => {
  const row = e.target.closest && e.target.closest('#c-compare .crow[data-cid]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(row.dataset.cid, true); }
});
function hoverLayer(sel, move, off) {
  const el = $(sel);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', e => { SC.ptype = e.pointerType; move(e); });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { off(); hideTip(); } });
}
hoverLayer('#scatter', scHover, clearHovers);
hoverLayer('#c-monthly', monthlyHover, monthlyOff);
$('#scatter').addEventListener('click', e => {
  if (SC.ptype !== 'mouse') return;                 // a tap shows the details; a mouse click opens the video
  scHover(Object.assign({}, { clientX: e.clientX, clientY: e.clientY, pointerType: 'mouse' }));
  if (SC.hover) window.open(yt(SC.ups[SC.hover.i].id), '_blank', 'noopener');
});
function navSpy() {
  const tabs = $$('.tabs .tab');
  const io = new IntersectionObserver(es => {
    es.forEach(en => { if (en.isIntersecting) tabs.forEach(t => t.classList.toggle('on', t.getAttribute('href') === '#' + en.target.id)); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('section.block').forEach(s => io.observe(s));
}
const widths = new Map();
const ro = new ResizeObserver(es => {
  for (const en of es) {
    const w = Math.round(en.contentRect.width);
    if (widths.get(en.target) === w) continue;
    const first = !widths.has(en.target);
    widths.set(en.target, w);
    if (first || !S) continue;
    if (en.target.id === 'scatter') drawScatter(); else drawMonthly();
  }
});
(async () => {
  try {
    S = await getJSON('data/study.json');
    if (!S || !S.channels || !S.channels.length) throw new Error('no channels in data/study.json');
  } catch (e) {
    $('#headline').textContent = 'No data yet: the first update writes it.';
    $('#pick').innerHTML = '<option>No data yet</option>';
    document.body.classList.add('nodata');
    console.error(e);
    S = null;
    await status();
    $('#updated').innerHTML = '<span class="dot amber"></span><span>No data yet</span>';
    return;
  }
  getJSON('data/trends.json').then(d => { W = d; renderNiche(); if (C) renderBreakdowns(); }).catch(e => console.warn('What Works data:', e.message));
  buildPicker(); renderCompare(); renderPair(); renderNiche(); renderHow(); navSpy();
  const want = new URLSearchParams(location.search).get('c');
  const first = rowOf(want) || S.channels.find(c => c.name === S.focus) || S.channels[0];
  if (want && !rowOf(want)) setURL(null);
  ro.observe($('#scatter')); ro.observe($('#c-monthly'));
  status();
  await pick(first.cid, true);
  let target = null;
  try { target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* a malformed link */ }
  if (target) requestAnimationFrame(() => target.scrollIntoView());
})();
