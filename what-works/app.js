'use strict';
/* What Works: renders data/trends.json (trends_collect.py). Every number on the page comes from that file.
   Charts are plain HTML on a log scale (sharp at any width); every chart has a table view and hover/focus details. */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtV = v => v == null ? '–' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v));
/* "×" numbers: one decimal under 10, none from 10, plus `extra`; toFixed rounds ties up, as trends.x_txt does */
const fmtX = (x, extra = 0) => {
  if (x == null) return '–';
  const s = x.toFixed(1 + extra);
  return (parseFloat(s) < 10 ? s : x.toFixed(extra)) + '×';
};
/* 1 when two different numbers of one family, or one and the usual (1×) they are read against, would read alike at the
   plain precision (trends.x_extra). The families the brief writes too come decided in D.xp; this is for the rest. */
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
/* a family's extra decimals as trends.precisions decided them (trends.json "xp"); 0 for an older file */
const xpOf = (fam, view) => { const v = ((D && D.xp) || {})[fam]; return (view == null ? v : v && v[view]) || 0; };
const pct = x => x == null ? '–' : Math.round(100 * x) + '%';
const yt = id => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
const when = (iso, opts) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const dur = s => { if (!s) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
/* the numbers in a written sentence, in bold (escaped first) */
const U = '(?:×|%|K(?![A-Za-z])|M(?![A-Za-z])|min\\b)';
const NUM = new RegExp(`(\\d[\\d.,]*(?:\\s?${U})?\\s?(?:→|–)\\s?\\d[\\d.,]*\\s?${U}|\\d[\\d.,]*\\s?${U})`);
const hl = s => String(s == null ? '' : s).split(NUM).map((part, i) => i % 2 ? `<b>${esc(part)}</b>` : esc(part)).join('');

/* thumbnails: mqdefault (16:9); YouTube sometimes answers with a 120×90 grey placeholder, then hqdefault */
const thumb = id => id ? `<img class="thumb" loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg" data-id="${esc(id)}">` : '';
const swap = img => { if (!img.dataset.f) { img.dataset.f = '1'; img.src = `https://i.ytimg.com/vi/${encodeURIComponent(img.dataset.id)}/hqdefault.jpg`; } };
document.addEventListener('load', e => { const t = e.target; if (t.classList && t.classList.contains('thumb') && t.naturalWidth && t.naturalWidth <= 120) swap(t); }, true);
document.addEventListener('error', e => { const t = e.target; if (t.classList && t.classList.contains('thumb')) swap(t); }, true);

let D = null, view = 'all';
const STATIC = document.documentElement.dataset.static === '1';   // the read-only copy (publish.py): files, no API
const DIR = r => !r || r.n < 20 || r.chans < 3 ? null : r.lo > 1 ? 'up' : r.hi < 1 ? 'down' : null;
const COL = d => d === 'up' ? 'var(--up)' : d === 'down' ? 'var(--down)' : 'var(--neutral)';

/* ---------- tooltips (labels go in with textContent) */
const TIPS = new Map();
let tipN = 0;
const addTip = (value, label, lines) => { const id = 't' + (++tipN); TIPS.set(id, { value, label, lines: lines || [] }); return id; };
function showTip(el, x, y) {
  const t = TIPS.get(el.dataset.tip);
  if (!t) return;
  const box = $('#tip');
  box.replaceChildren();
  for (const [cls, txt] of [['tv', t.value], ['tl', t.label], ...t.lines.map(l => ['', l])]) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = txt;
    box.appendChild(d);
  }
  box.hidden = false;
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
  box.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 14)) + 'px';
}
const hideTip = () => { $('#tip').hidden = true; };
document.addEventListener('pointermove', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else hideTip();
});
document.addEventListener('focusin', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + Math.min(r.width, 280) / 2, r.bottom - 8); }
});
document.addEventListener('focusout', hideTip);
window.addEventListener('scroll', hideTip, { passive: true });

/* ---------- log-scale rows */
const pos = (x, lo, hi) => {
  const v = Math.min(Math.max(x, lo), hi);
  return (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * 100;
};
const XLO = 0.25, XHI = 4;
function ticksRow(ticks, lo, hi, heads) {
  const sp = ticks.map((t, i) => {
    const p = pos(t[0], lo, hi);
    const tr = i === 0 ? 'translateX(0)' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)';
    return `<span style="left:${p}%;transform:${tr}">${t[1]}</span>`;
  }).join('');
  return `<div class="crow axis" aria-hidden="true"><div class="lab">${heads[0] || ''}</div><div class="ticks">${sp}</div>`
    + `<div class="val">${heads[1] || ''}</div><div class="aux">${heads[2] || ''}</div><div class="aux">${heads[3] || ''}</div></div>`;
}
function barRow(label, r, aux1, aux2, tip, e = 0) {
  if (!r) return '';
  const c = pos(1, XLO, XHI), m = pos(r.med, XLO, XHI), lo = pos(r.lo, XLO, XHI), hi = pos(r.hi, XLO, XHI);
  const d = DIR(r);
  return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="${esc(label)}: ${fmtX(r.med, e)} the channel's usual">`
    + `<div class="lab">${esc(label)}</div><div class="track"><div class="base"></div>`
    + `<div class="whisk" style="left:${lo}%;width:${Math.max(0.6, hi - lo)}%"></div>`
    + `<div class="bar ${m < c ? 'neg' : ''}" style="left:${Math.min(c, m)}%;width:${Math.max(0.8, Math.abs(m - c))}%;background:${COL(d)}"></div>`
    + `<div class="one" style="left:${c}%"></div></div>`
    + `<div class="val num">${fmtX(r.med, e)}</div><div class="aux num">${aux1 || ''}</div><div class="aux num">${aux2 || ''}</div></div>`;
}
const legendBars = () => '<div class="legend"><span><i style="background:var(--up)"></i>beats the usual (whole range above 1×)</span>'
  + '<span><i style="background:var(--down)"></i>below the usual</span><span><i style="background:var(--neutral)"></i>not clear either way</span>'
  + '<span><i class="l" style="width:18px;background:rgba(209,212,220,.55)"></i>90 % range</span></div>';
function table(heads, rows) {
  return `<details class="tbl"><summary>Show as a table</summary><div class="tablewrap"><table class="grid"><tr>`
    + heads.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('') + '</tr>'
    + rows.map(r => '<tr>' + r.map((c, i) => `<td class="${i ? 'n' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('')
    + '</table></div></details>';
}

/* ---------- hero */
function tile(label, value, sub) {
  return `<div class="kpi"><p class="label">${esc(label)}</p><div class="value">${esc(value)}</div><div class="sub">${sub}</div></div>`;
}
function renderHero() {
  $('#eyebrow').textContent = 'This week in fight videos · ' + when(D.built, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#headline').innerHTML = hl(D.headline || '');
  const gm = D.group_momentum || {}, tiles = [], em = xpOf('momentum');     // as the brief and headline write them
  for (const [g, name] of [['Story', 'Story channels'], ['Technical', 'Technical channels']]) {
    const r = gm[g];
    if (r) tiles.push(tile(name, fmtX(r.ratio, em),`<span class="${r.ratio >= 1 ? 'up' : 'down'}" aria-hidden="true">${r.ratio >= 1 ? '▲' : '▼'}</span> `
      + `views vs the year before · ${r.up} of ${r.chans} up`));
  }
  const sh = D.shape || {}, ls = ((D.lengths || {}).Story || {}).now || {};
  if (sh.lengths && sh.lengths.length) {
    const k = sh.lengths[0];
    tiles.push(tile('Length that wins', k, `${fmtX(ls[k] && ls[k].med, xpOf('lengths', 'Story'))} the usual on story channels`));
  }
  const h = (D.habits || []).find(x => x.better), eh = xpOf('habits');
  if (h) tiles.push(tile('Strongest title habit', fmtX(h.yes, eh), `titles that ${esc(h.phrase)} (rest ${fmtX(h.no, eh)})`));
  const y = D.you;
  if (y && y.recent_med) tiles.push(tile('Your last ' + y.n_recent + ' uploads', fmtV(y.recent_med),
    `median views${y.best ? ' · best ' + fmtX(y.best.out) + ' your usual' : ''}`));
  $('#kpis').innerHTML = tiles.join('');
  const p = (D.picks || [])[0];
  if (!p) { $('#feature').innerHTML = ''; return; }
  const img = (p.others && p.others[0] && p.others[0].id) || (p.top_fight && p.top_fight.id);
  const d = (p.drafts || [])[0];
  $('#feature').innerHTML = `<div class="feature"><div class="media">${thumb(img)}<div class="over"><span class="tag">Make next</span>`
    + `<div class="who">${esc(p.name)}</div></div></div><div class="body">`
    + (d ? `<p class="draft">${esc(d.t)}</p>` : '')
    + `<div class="row"><span class="muted small">${esc(p.group || '')}${p.half ? ` · usually ${fmtV(p.half[0])}–${fmtV(p.half[1])}` : ''}</span>`
    + `<span>${d ? `<button type="button" class="copy" data-t="${esc(d.t)}">Copy title</button> ` : ''}<a class="copy" href="#pick-1">See the pick ↓</a></span></div></div></div>`;
}

/* ---------- brief */
function renderBrief() {
  const c = D.counts || {};
  $('#brief-lede').textContent = `Written from ${(c.uploads || 0).toLocaleString()} videos on ${c.channels || 0} comparable channels; `
    + `${(c.scored_now || 0).toLocaleString()} of them from the last 12 months.`;
  $('#brief-body').innerHTML = (D.brief || []).map(b => `<article class="note"><h3>${esc(b.h)}</h3><p>${hl(b.p)}</p></article>`).join('');
}

/* ---------- picks */
function rangeBar(p) {
  if (!p.half) return '';
  const LO = 3e3, HI = 1e6, a = pos(p.half[0], LO, HI), b = pos(p.half[1], LO, HI), t = p.typical ? pos(p.typical, LO, HI) : null;
  const g = p.group || '';
  const gp = /^Other/.test(g) ? g[0].toLowerCase() + g.slice(1) : g;
  return `<div class="range"><div class="txt">Your videos on ${esc(gp)}: half land <b>${fmtV(p.half[0])}–${fmtV(p.half[1])}</b>`
    + `${p.typical ? `, typical <b>${fmtV(p.typical)}</b>` : ''}${p.factor ? ` (${fmtX(p.factor)} your usual)` : ''}</div>`
    + `<div class="rtrack" aria-hidden="true"><div class="rband" style="left:${a}%;width:${Math.max(1, b - a)}%"></div>`
    + (t != null ? `<div class="rmark" style="left:calc(${t}% - 1.5px)"></div>` : '') + '</div></div>';
}
function xb(out) {
  if (out == null) return '';
  return `<span class="xb ${out >= 2 ? 'up' : out < 0.5 ? 'down' : ''}">${fmtX(out)}</span>`;
}
function pickCard(p, i) {
  const img = (p.others && p.others[0] && p.others[0].id) || (p.top_fight && p.top_fight.id);
  const badges = (p.badges || []).map(b => `<span class="pill ${b[0] === 'fresh' ? 'fresh' : ''}">${esc(b[1])}</span>`).join('');
  const label = { profile: 'Profile', story: 'Story', technique: 'Technique' };
  const drafts = (p.drafts || []).map(d => `<li><span class="chip">${esc(label[d.formula] || d.formula)}</span>`
    + `<span class="t">${esc(d.t)}</span><button type="button" class="copy" data-t="${esc(d.t)}" aria-label="Copy: ${esc(d.t)}">Copy</button></li>`).join('');
  const others = (p.others || []).map(o => `<a class="mini" href="${yt(o.id)}" target="_blank" rel="noopener">${thumb(o.id)}`
    + `<span><span class="mt">${esc(o.t)}</span><span class="mm">${esc(o.ch)} · ${fmtV(o.v)}${xb(o.out)}</span></span></a>`).join('');
  const last = p.you && p.you.last && (!p.you.best || p.you.last.id !== p.you.best.id) ? p.you.last : null;
  const ey = p.you ? xExtra([p.you.best && p.you.best.out, last && last.out]) : 0;
  const you = p.you && p.you.n
    ? `<span><b>You:</b> ${p.you.n} video${p.you.n > 1 ? 's' : ''}${p.you.best ? `, best <a href="${yt(p.you.best.id)}" target="_blank" rel="noopener">${fmtX(p.you.best.out, ey)}</a>` : ''}`
      + `${last ? `, last ${fmtX(last.out, ey)}` : ''}</span>`
    : '<span><b>You:</b> new to your channel</span>';
  const ft = p.footage || {}, top = p.top_fight, b = p.board || {};
  const facts = [you,
    `<span><b>Footage:</b> ${ft.fights || 0} fights${top ? `, top <a href="${yt(top.id)}" target="_blank" rel="noopener">${fmtV(top.v)}</a>` : ''}</span>`,
    b.heat ? `<span><b>Heat:</b> ${fmtV(b.heat)} views a day</span>` : '',
    p.cover ? `<span><b>Out this month:</b> ${p.cover.n} breakdown${p.cover.n === 1 ? '' : 's'}</span>` : ''].join('');
  return `<article class="pick" id="pick-${i + 1}"><div class="media">${thumb(img)}<span class="rank">#${i + 1}</span>`
    + `<div class="badges">${badges}</div><div class="name"><strong>${esc(p.name)}</strong><span>${esc((p.sports || []).join(' · '))}</span></div></div>`
    + `<div class="body">${rangeBar(p)}<ul class="drafts">${drafts}</ul>`
    + (others ? `<div><p class="ev-title">What other creators did with them</p><div class="minis">${others}</div></div>`
      : '<p class="muted small">No profile, story or breakdown about them in the comparison channels yet.</p>')
    + `<div class="facts">${facts}</div></div></article>`;
}
function renderPicks() {
  const picks = D.picks || [];
  $('#picks-body').innerHTML = picks.length ? picks.map(pickCard).join('')
    : '<p class="muted">No picks: the screener\'s Next video list was not found.</p>';
}

/* ---------- what's working */
function renderFormats() {
  const tab = (D.formats || {})[view] || {}, now = tab.now || {}, th = tab.then || {}, yr = tab.year || {};
  const keys = (D.format_order || []).filter(k => now[k]).sort((a, b) => now[b].med - now[a].med);
  const help = (D.help && D.help.formats) || {}, e = xpOf('formats', view);    // one precision for the whole view
  const ticks = [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']];
  $('#c-formats').innerHTML = ticksRow(ticks, XLO, XHI, ['', 'Usual', 'Doubled', 'Share then → now'])
    + keys.map(k => {
      const r = now[k];
      const tip = addTip(fmtX(r.med, e) + ' the channel\'s usual', k, [help[k] || '', `90 % range ${fmtX(r.lo, e)}–${fmtX(r.hi, e)}`,
        `${pct(r.hit)} doubled their channel's usual`, `${r.n} videos on ${r.chans} channels`,
        `A year before ${yr[k] ? fmtX(yr[k].med, e) : '–'} · 3–4 years ago ${th[k] ? fmtX(th[k].med, e) : '–'}`]);
      return barRow(k, r, pct(r.hit), `${pct(th[k] && th[k].share)} → ${pct(r.share)}`, tip, e);
    }).join('');
  $('#l-formats').innerHTML = legendBars() + table(['Format', 'Usual (12 mo)', '90 % range', 'Doubled', 'Videos', 'Channels', 'Share then', 'Share now', 'A year before', '3–4 yrs ago'],
    keys.map(k => { const r = now[k]; return [k, fmtX(r.med, e), `${fmtX(r.lo, e)}–${fmtX(r.hi, e)}`, pct(r.hit), r.n, r.chans, pct(th[k] && th[k].share), pct(r.share),
      yr[k] ? fmtX(yr[k].med, e) : '–', th[k] ? fmtX(th[k].med, e) : '–']; }));
}
function renderLengths() {
  const tab = (D.lengths || {})[view] || {}, now = tab.now || {}, th = tab.then || {};
  const keys = (D.lengths_order || []).filter(k => now[k]), e = xpOf('lengths', view);
  const ticks = [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']];
  $('#c-lengths').innerHTML = ticksRow(ticks, XLO, XHI, ['', 'Usual', 'Doubled', 'Share then → now'])
    + keys.map(k => {
      const r = now[k];
      const tip = addTip(fmtX(r.med, e) + ' the channel\'s usual', k + ' videos', [`90 % range ${fmtX(r.lo, e)}–${fmtX(r.hi, e)}`,
        `${pct(r.hit)} doubled their channel's usual`, `${r.n} videos on ${r.chans} channels`]);
      return barRow(k, r, pct(r.hit), `${pct(th[k] && th[k].share)} → ${pct(r.share)}`, tip, e);
    }).join('')
    + table(['Length', 'Usual (12 mo)', '90 % range', 'Doubled', 'Videos', 'Share then', 'Share now'],
      keys.map(k => { const r = now[k]; return [k, fmtX(r.med, e), `${fmtX(r.lo, e)}–${fmtX(r.hi, e)}`, pct(r.hit), r.n, pct(th[k] && th[k].share), pct(r.share)]; }));
}
const SHORT = { named: 'Names a fighter', ends_name: 'Ends with the name', shout: 'Opens with a shout', question: 'Asks a question',
  women: 'About a woman fighter', current: 'Current hook', legend: 'Legend hook', versus: '"X vs Y"', number: 'Has a number', caps: 'A word in CAPS' };
function renderHabits() {
  const f = (D.features || {}).now || {}, fh = (D.help && D.help.features) || {}, e = xpOf('habits');
  const ticks = [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']];
  const rows = Object.keys(fh).map(k => {
    const y = f[k] && f[k].yes, n = f[k] && f[k].no;
    if (!y || !n) return '';
    const a = pos(n.med, XLO, XHI), b = pos(y.med, XLO, XHI);
    const ok = y.n >= 20 && y.chans >= 3 && n.n >= 20;
    const d = ok && y.lo > n.hi ? 'up' : ok && y.hi < n.lo ? 'down' : null;
    const share = y.n / (y.n + n.n);
    const ym = fmtX(y.med, e), nm = fmtX(n.med, e);
    const tip = addTip(`${ym} with · ${nm} without`, 'Titles that ' + fh[k], [
      `with: range ${fmtX(y.lo, e)}–${fmtX(y.hi, e)}, ${y.n} videos`, `without: range ${fmtX(n.lo, e)}–${fmtX(n.hi, e)}, ${n.n} videos`,
      d ? (d === 'up' ? 'Clearly better: the ranges do not overlap' : 'Clearly worse: the ranges do not overlap') : 'Not clear: the ranges overlap']);
    return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="Titles that ${esc(fh[k])}: ${ym} against ${nm}">`
      + `<div class="lab" title="${esc(fh[k])}">${esc(SHORT[k] || fh[k])}</div><div class="track"><div class="base"></div>`
      + `<div class="one" style="left:${pos(1, XLO, XHI)}%"></div>`
      + `<div class="link" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></div>`
      + `<div class="pt" style="left:${a}%;background:#8A8E99"></div><div class="pt" style="left:${b}%;background:${d ? COL(d) : '#D1D4DC'}"></div></div>`
      + `<div class="val num">${ym}</div><div class="aux num">vs ${nm}</div><div class="aux num">${pct(share)} of titles</div></div>`;
  }).join('');
  $('#c-habits').innerHTML = ticksRow(ticks, XLO, XHI, ['', 'With', 'Without', 'How common'])
    + rows + '<div class="legend"><span><i class="c" style="background:#8A8E99"></i>titles without the habit</span>'
    + '<span><i class="c" style="background:var(--up)"></i>with it, clearly better</span><span><i class="c" style="background:var(--down)"></i>with it, clearly worse</span>'
    + '<span><i class="c" style="background:#D1D4DC"></i>with it, not clear</span></div>'
    + table(['Title habit', 'With', 'Without', 'Videos with', 'Videos without'],
      Object.keys(fh).filter(k => f[k] && f[k].yes && f[k].no).map(k => [fh[k], fmtX(f[k].yes.med, e), fmtX(f[k].no.med, e), f[k].yes.n, f[k].no.n]));
}

/* ---------- breakouts + fighters */
function renderBreakouts() {
  $('#breakouts-body').innerHTML = (D.breakouts || []).map(b => `<a class="vcard" href="${yt(b.id)}" target="_blank" rel="noopener">`
    + `<div class="media">${thumb(b.id)}<span class="big">${fmtX(b.out)}</span>${b.dur ? `<span class="dur">${dur(b.dur)}</span>` : ''}</div>`
    + `<div class="vb"><div class="vt">${esc(b.t)}</div><div class="vm">${esc(b.ch)} · ${fmtV(b.v)} views · ${b.age} days ago</div>`
    + `<div class="chips"><span>${esc(b.fmt)}</span><span>${esc(b.len)}</span></div></div></a>`).join('')
    || '<p class="muted">None yet.</p>';
  $('#subjects-body').innerHTML = (D.subjects || []).map(s => `<a class="fcard" href="${yt(s.best.id)}" target="_blank" rel="noopener">${thumb(s.best.id)}`
    + `<span><span class="fn">${esc(s.name)}</span><br><span class="fx">${fmtX(s.med, xpOf('subjects'))}</span> <span class="fs">median over ${s.n} videos</span>`
    + `<br><span class="fs">Most viewed: ${esc(s.best.ch)}, ${fmtV(s.best.v)}</span></span></a>`).join('')
    || '<p class="muted">None yet.</p>';
}

/* ---------- channels: dumbbells, the year before -> the last 12 months */
function renderChannels() {
  const LO = 1e3, HI = 2e7;
  const ticks = [[1e3, '1K'], [1e4, '10K'], [1e5, '100K'], [1e6, '1M'], [1e7, '10M']];
  const rows = (D.channels || []).filter(c => c.now || c.year).map(c => {
    const a = c.year ? pos(c.year, LO, HI) : null, b = c.now ? pos(c.now, LO, HI) : null;
    const d = c.ratio == null ? null : c.ratio >= 1.1 ? 'up' : c.ratio <= 0.8 ? 'down' : null;
    const tip = addTip(`${fmtV(c.year)} → ${fmtV(c.now)}`, c.name, [`${c.group} · ${fmtV(c.subs)} subscribers`,
      `Typical views: 3–4 years ago ${fmtV(c.then)}, a year before ${fmtV(c.year)}, last 12 months ${fmtV(c.now)}`,
      `${c.per_month} uploads a month now`]);
    const arrow = d === 'up' ? '<span style="color:var(--up)" aria-hidden="true">▲</span> ' : d === 'down' ? '<span style="color:var(--down)" aria-hidden="true">▼</span> ' : '';
    return `<div class="crow" tabindex="0" data-tip="${tip}" aria-label="${esc(c.name)}: ${fmtV(c.year)} to ${fmtV(c.now)}">`
      + `<div class="lab">${esc(c.name)}<span class="gchip">${esc(c.group === 'Yours' ? 'You' : c.group)}</span></div>`
      + `<div class="track"><div class="base"></div>`
      + (a != null && b != null ? `<div class="link" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></div>` : '')
      + (a != null ? `<div class="pt" style="left:${a}%;background:#8A8E99"></div>` : '')
      + (b != null ? `<div class="pt" style="left:${b}%;background:${COL(d)}"></div>` : '') + '</div>'
      + `<div class="val num">${fmtV(c.now)}</div><div class="aux num">${arrow}${c.ratio == null ? '–' : fmtX(c.ratio)}</div>`
      + `<div class="aux num">${c.per_month} a month</div></div>`;
  }).join('');
  $('#c-channels').innerHTML = ticksRow(ticks, LO, HI, ['', 'Now', 'vs before', 'Uploads']) + rows;
  $('#l-channels').innerHTML = '<div class="legend"><span><i class="c" style="background:#8A8E99"></i>the year before</span>'
    + '<span><i class="c" style="background:var(--up)"></i>last 12 months, up 10 %+</span><span><i class="c" style="background:var(--down)"></i>down 20 %+</span>'
    + '<span><i class="c" style="background:var(--neutral)"></i>about the same</span></div>'
    + table(['Channel', 'Group', '3–4 yrs ago', 'A year before', 'Last 12 months', 'Now ÷ before', 'Uploads a month'],
      (D.channels || []).map(c => [c.name, c.group, fmtV(c.then), fmtV(c.year), fmtV(c.now), c.ratio == null ? '–' : fmtX(c.ratio), c.per_month]));
}

/* ---------- how it works + status */
function renderHow() {
  const fh = (D.help && D.help.formats) || {};
  const c = D.counts || {};
  const items = [
    ['The channels', `${c.configured || 0} comparable channels: story (narrated fighter profiles and stories), technical (breakdowns, film study, technique explainers), personality, recap, and yours (kept out of the niche numbers). Each is read once a week, 80 uploads (500 when new or every 4 weeks).`],
    ['Against the channel\'s usual', 'Each video\'s views ÷ the median of the 10 uploads either side on its own channel. Videos under 3 weeks old are left out (still collecting views). The 90 % range re-draws the channels at random, so one big channel cannot carry a result; the brief only states what clears it.'],
    ['Windows', 'Last 12 months = 3 weeks to 1 year old; a year before = 1–2 years old; 3–4 years ago = 3–5 years old. YouTube\'s listing says "N months / years ago"; each video sits in the middle of what that allows.'],
    ['Formats (from titles)', Object.entries(fh).map(([k, v]) => `${k}: ${v}`).join('. ') + '.'],
    ['One-format channels', 'A channel that makes one format cannot show that format beating its own usual, so the brief also compares channels: typical views now against the year before, and what the growing channels make.'],
    ['Picks', 'Your Next video list in its order: Thai legends first (the order tested on your channel), then other fighters in your lane. Title drafts follow three formulas; the opponent in the story draft comes from the fighter\'s most-viewed footage.'],
    ['Updates', 'Once a day the channels that are due are read (each about once a week), and the picks are rebuilt after each screener update. The line at the top says when the next read is, in your own time.'],
  ];
  $('#how-body').innerHTML = items.map(([h, t]) => `<div><b class="h">${esc(h)}</b>${esc(t)}</div>`).join('');
  const unread = c.unread && c.unread.length ? ` · ${c.unread.length} channels not read yet: ${esc(c.unread.join(', '))}` : '';
  $('#foot').innerHTML = `Built ${esc(when(D.built))} · channels read ${esc(when(D.last_read))} · picks from the screener's update of `
    + `${esc(when(D.screener_built))} · ${(c.uploads || 0).toLocaleString()} videos${unread}`;
}
async function status() {
  let st = null;
  try { st = await (await fetch(STATIC ? 'data/status.json' : 'api/status', { cache: 'no-store' })).json(); } catch (e) { /* no status: the build time alone */ }
  const age = D && D.built_ts ? (Date.now() / 1000 - D.built_ts) / 3600 : null;
  let dot = '', txt = 'Updated ' + when(D && D.built, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (st && st.ok === false && st.error) { dot = 'red'; txt = 'Last update failed'; }
  else if (age != null && age > 30) { dot = 'amber'; txt = `Updated ${Math.round(age)} h ago`; }
  if (st && st.running) txt = 'Updating…';
  if (st && st.next_read) txt += ' · next read ' + when(st.next_read, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  $('#updated').innerHTML = `<span class="dot ${dot}"></span><span>${esc(txt)}</span>`;
}

/* ---------- wiring */
function copyText(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); };
  const fallback = () => {                      // plain http on the LAN: no clipboard API there
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* the text stays selectable */ }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
document.addEventListener('click', e => {
  const c = e.target.closest('button.copy');
  if (c && c.dataset.t) { copyText(c.dataset.t, c); return; }
  const v = e.target.closest('#view-seg button');
  if (v) {
    view = v.dataset.v;
    document.querySelectorAll('#view-seg button').forEach(b => b.setAttribute('aria-pressed', String(b === v)));
    renderFormats(); renderLengths();
  }
});
function navSpy() {
  const tabs = [...document.querySelectorAll('.tab')];
  const io = new IntersectionObserver(es => {
    es.forEach(en => {
      if (en.isIntersecting) tabs.forEach(t => t.classList.toggle('on', t.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section.block').forEach(s => io.observe(s));
}
(async () => {
  try {
    const r = await fetch('data/trends.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    D = await r.json();
    renderHero(); renderBrief(); renderPicks(); renderFormats(); renderLengths(); renderHabits();
    renderBreakouts(); renderChannels(); renderHow(); navSpy();
    let target = null;           // a link to a section lands on it once the page has drawn
    try { target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e2) { /* a malformed link */ }
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  } catch (e) {
    $('#headline').textContent = 'No data yet: the first update writes it.';
    console.error(e);
  }
  status();
})();
