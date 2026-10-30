// Pure SVG builder for the min/avg/max progress chart. No DOM — importable by
// node:test and reusable by both the app and the standalone demo page.
//
// Each session contributes a vertical slice with up to three points (min, avg, max)
// per visible side. Between sessions: a line min→min, a line max→max with the area
// between them lightly filled, and a solid avg→avg line.

import { statFor } from './progress.js';

const dLabel = d => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

// series: output of seriesForExercise (each point has statAll/statLeft/statRight).
// opts: { perSide, hidden:{left,right}, statHidden:{min,avg,max}, colors:{left,right,single,grid,label,bg}, unit, onPointClick }
// Returns { svg, xs, plotTop, plotBottom, lo, hi } (xs/plotTop/plotBottom let the caller move the selection line).
export function buildStatChart(series, opts) {
  const { perSide = false, hidden = {}, statHidden = {}, colors, onPointClick = 'showChartPoint' } = opts;

  const sides = perSide
    ? [{ name: 'left', statKey: 'statLeft', color: colors.left, dash: '' },
       { name: 'right', statKey: 'statRight', color: colors.right, dash: '4 3' }]
    : [{ name: 'single', statKey: 'statAll', color: colors.single, dash: '' }];
  const visSides = sides.filter(s => !hidden[s.name]);
  const visStats = ['min', 'avg', 'max'].filter(k => !statHidden[k]);

  const cW = 380, cH = 180, padL = 34, padR = 10, padT = 12, padB = 24;
  const plotW = cW - padL - padR, plotH = cH - padT - padB;

  const allVals = [];
  visSides.forEach(s => series.forEach(p => {
    const st = p[s.statKey];
    if (st) visStats.forEach(k => allVals.push(st[k]));
  }));

  const geom = { svg: '', xs: series.map((_, i) => 0), plotTop: padT, plotBottom: padT + plotH, lo: 0, hi: 1 };
  if (!allVals.length) return geom;

  let lo = Math.min(...allVals), hi = Math.max(...allVals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo = Math.max(0, Math.floor(lo - span * 0.1));
  hi = Math.ceil(hi + span * 0.1);
  // Whole-number gridlines: integer step, top extended to a multiple of it.
  const yStep = Math.max(1, Math.ceil((hi - lo) / 4));
  hi = lo + yStep * Math.ceil((hi - lo) / yStep);

  const x = i => padL + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = v => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const xs = series.map((_, i) => x(i));

  let svg = `<svg viewBox="0 0 ${cW} ${cH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">`;

  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = lo + ((hi - lo) / ySteps) * i, yy = y(val);
    svg += `<line x1="${padL}" y1="${yy}" x2="${padL + plotW}" y2="${yy}" stroke="${colors.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 4}" y="${yy + 3}" fill="${colors.label}" font-size="7" font-family="monospace" text-anchor="end">${Math.round(val * 10) / 10}</text>`;
  }

  svg += `<line id="chartSelLine" x1="0" y1="0" x2="0" y2="0" stroke="${colors.label}" stroke-width="1" stroke-dasharray="3 3" style="display:none;"/>`;

  const ptStr = (statKey, k) => series
    .map((p, i) => { const st = p[statKey]; return st ? `${x(i).toFixed(1)},${y(st[k]).toFixed(1)}` : null; })
    .filter(Boolean);

  visSides.forEach(s => {
    // Shaded band between the highest and lowest visible stat lines (min < avg < max).
    // With min hidden it fills avg↔max; with max hidden, min↔avg; needs ≥2 lines.
    if (visStats.length >= 2) {
      const top = ptStr(s.statKey, visStats[visStats.length - 1]);
      const bot = ptStr(s.statKey, visStats[0]).reverse();
      if (top.length) svg += `<polygon points="${top.concat(bot).join(' ')}" fill="${s.color}" fill-opacity="0.12" stroke="none"/>`;
    }
    // Min / max boundary lines: thin, dashed, faded.
    ['min', 'max'].forEach(k => {
      if (statHidden[k]) return;
      const pts = ptStr(s.statKey, k);
      if (pts.length) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="1" stroke-dasharray="3 2" opacity="0.55"/>`;
    });
    // Avg line: solid and prominent.
    if (!statHidden.avg) {
      const pts = ptStr(s.statKey, 'avg');
      if (pts.length) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash}"/>`;
    }
  });

  // Points per session: group every visible (side, stat) marker by value. Where left
  // and right coincide the dot turns purple; filled when the avg is in the group,
  // hollow when only a boundary (min/max) lands there.
  series.forEach((p, i) => {
    const byVal = new Map();
    visSides.forEach(s => {
      const st = p[s.statKey];
      if (!st) return;
      visStats.forEach(k => {
        const key = st[k].toFixed(3);
        if (!byVal.has(key)) byVal.set(key, { v: st[k], stats: new Set(), sides: new Set() });
        const g = byVal.get(key); g.stats.add(k); g.sides.add(s.name);
      });
    });
    byVal.forEach(({ v, stats, sides }) => {
      const color = sides.size > 1 ? colors.single
        : (sides.has('right') ? colors.right : (sides.has('left') ? colors.left : colors.single));
      svg += stats.has('avg')
        ? `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="${color}"/>`
        : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.2" fill="${colors.bg}" stroke="${color}" stroke-width="1.2"/>`;
    });
  });

  // Transparent full-height hit areas per session for tap-to-inspect.
  series.forEach((p, i) => {
    svg += `<rect x="${(x(i) - 14).toFixed(1)}" y="${padT}" width="28" height="${plotH}" fill="transparent" style="cursor:pointer;" onclick="${onPointClick}(${i})"/>`;
  });

  if (series.length) {
    svg += `<text x="${padL}" y="${cH - 6}" fill="${colors.label}" font-size="7" font-family="monospace">${dLabel(series[0].date)}</text>`;
    if (series.length > 1) svg += `<text x="${padL + plotW}" y="${cH - 6}" fill="${colors.label}" font-size="7" font-family="monospace" text-anchor="end">${dLabel(series[series.length - 1].date)}</text>`;
  }

  svg += '</svg>';
  return { svg, xs, plotTop: padT, plotBottom: padT + plotH, lo, hi };
}

// Readable HTML table of one logged exercise's sets. Single-leg exercises get a
// grouped two-row header — Links / Rechts, each spanning kg + reps; others a plain list.
// opts: { colLeft, colRight, speedUnit, kmhToPace, hidden:{left,right} }. A hidden side's
// columns are kept (visibility:hidden) so the table doesn't shift, just blanks out.
export function sessionSetTableHtml(ex, sets, opts = {}) {
  sets = sets || [];
  const { colLeft = '#3b82f6', colRight = '#f59e0b', speedUnit = 'kmh', kmhToPace = v => String(v), hidden = {}, statHidden = {} } = opts;
  const hL = !!hidden.left, hR = !!hidden.right;
  const num = v => (v == null || v === '') ? '' : String(v).replace('.', ',');
  const favg = v => (v == null) ? '' : num(Math.round(v * 10) / 10);
  const hide = h => h ? 'visibility:hidden;' : '';
  const thBase = 'font-weight:700;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.03em;padding:0.1rem 0.4rem;';
  // Data headers right-align (so numbers line up); group headers (span) stay centered.
  const th = (t, { color, span, h, align } = {}) => `<th${span ? ` colspan="${span}"` : ''} style="${thBase}text-align:${align || (span ? 'center' : 'right')};color:${color || 'var(--muted)'};${hide(h)}">${t}</th>`;
  const td = (t, h) => `<td style="padding:0.1rem 0.4rem;text-align:right;font-family:var(--mono);${hide(h)}">${t === '' ? '–' : t}</td>`;
  const tdIdx = t => `<td style="padding:0.1rem 0.4rem;text-align:center;font-family:var(--mono);color:var(--muted);">${t}</td>`;
  const blank = h => `<td style="padding:0.1rem 0.4rem;${hide(h)}"></td>`;
  // Left↔right imbalance as a percentage, relative to their average. Empty if either missing.
  const pctDiff = (a, b) => {
    if (a == null || b == null) return '';
    const m = (a + b) / 2;
    return m === 0 ? '' : num(Math.round(Math.abs(a - b) / m * 1000) / 10) + '%';
  };
  const table = (head, body) => `<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:0.76rem;"><colgroup><col style="width:2.8em;"></colgroup><thead>${head}</thead><tbody>${body}</tbody></table>`;
  const isDur = ex.measureBy === 'duration';

  // Bold min/gem/max summary rows (only the ones toggled on). cols: [{ stat, h }]; the
  // label sits in the '#' column and the first shown row carries a divider above it.
  const visStats = ['min', 'avg', 'max'].filter(k => !statHidden[k]);
  const summary = cols => visStats.map((k, i) => {
    const bt = i === 0 ? 'border-top:2px solid var(--border);' : '';
    const lbl = k === 'avg' ? 'gem' : k;
    const base = `padding:0.12rem 0.4rem;font-weight:700;${bt}`;
    const cells = cols.map(c => {
      const v = c.stat ? (k === 'avg' ? favg(c.stat.avg) : num(c.stat[k])) : '';
      return `<td style="${base}text-align:right;font-family:var(--mono);${hide(c.h)}">${v === '' ? '–' : v}</td>`;
    }).join('');
    return `<tr><td style="${base}text-align:center;color:var(--muted);">${lbl}</td>${cells}</tr>`;
  }).join('');

  if (ex.type === 'cardio') {
    const hasSpeed = sets.some(s => s.speed != null);
    const head = `<tr>${th('#', { align: 'center' })}${th('min')}${hasSpeed ? th(speedUnit === 'pace' ? 'min/km' : 'km/h') : ''}</tr>`;
    const body = sets.map((x, i) => `<tr>${tdIdx(i + 1)}${td(Math.round((x.duration || 0) / 60))}${hasSpeed ? td(x.speed != null ? (speedUnit === 'pace' ? kmhToPace(x.speed) : num(x.speed)) : '') : ''}</tr>`).join('');
    return table(head, body);
  }

  if (ex.perSide) {
    const L = [], R = [];
    sets.forEach((x, i) => { const side = (x.side === 0 || x.side === 1) ? x.side : i % 2; (side === 0 ? L : R).push(x); });
    const n = Math.max(L.length, R.length);
    const bodyRows = cells => Array.from({ length: n }, (_, i) => `<tr>${tdIdx(i + 1)}${cells(L[i], R[i])}</tr>`).join('');

    const hD = hL || hR; // the ± difference needs both sides, so hide it if either is off
    // One summary row (min/gem/max) with L / Verschil / R cells for the given per-column stats.
    const sumRow = (k, i, cellsFn) => {
      const bt = i === 0 ? 'border-top:2px solid var(--border);' : '';
      const base = `padding:0.12rem 0.4rem;font-weight:700;${bt}`;
      const cell = (v, h) => `<td style="${base}text-align:right;font-family:var(--mono);${hide(h)}">${v === '' ? '–' : v}</td>`;
      const fv = v => v == null ? '' : (k === 'avg' ? favg(v) : num(v));
      return `<tr><td style="${base}text-align:center;color:var(--muted);">${k === 'avg' ? 'gem' : k}</td>${cellsFn(k, cell, fv)}</tr>`;
    };

    if (ex.weighted && !isDur) {
      const head =
        `<tr><th rowspan="2" style="${thBase}text-align:center;color:var(--muted);vertical-align:bottom;">#</th>` +
        `${th('Links', { color: colLeft, span: 2, h: hL })}${th('Verschil', { span: 2, h: hD })}${th('Rechts', { color: colRight, span: 2, h: hR })}</tr>` +
        `<tr>${th('kg', { color: colLeft, h: hL })}${th('reps', { color: colLeft, h: hL })}${th('kg', { h: hD })}${th('reps', { h: hD })}${th('kg', { color: colRight, h: hR })}${th('reps', { color: colRight, h: hR })}</tr>`;
      const bodyData = bodyRows((l, r) => td(num(l && l.weight), hL) + td(num(l && l.reps), hL) + blank(hD) + blank(hD) + td(num(r && r.weight), hR) + td(num(r && r.reps), hR));
      const Lw = statFor(L, 'weight'), Lr = statFor(L, 'reps'), Rw = statFor(R, 'weight'), Rr = statFor(R, 'reps');
      const sumRows = visStats.map((k, i) => sumRow(k, i, (kk, cell, fv) => {
        const lw = Lw && Lw[kk], lr = Lr && Lr[kk], rw = Rw && Rw[kk], rr = Rr && Rr[kk];
        return cell(fv(lw), hL) + cell(fv(lr), hL) + cell(pctDiff(lw, rw), hD) + cell(pctDiff(lr, rr), hD) + cell(fv(rw), hR) + cell(fv(rr), hR);
      })).join('');
      return table(head, bodyData + sumRows);
    }
    const pick = isDur ? (s => s && s.duration) : (s => s && s.reps);
    const mk = isDur ? 'duration' : 'reps';
    const unit = isDur ? ' (s)' : '';
    const head = `<tr>${th('#', { align: 'center' })}${th('Links' + unit, { color: colLeft, h: hL })}${th('Verschil', { h: hD })}${th('Rechts' + unit, { color: colRight, h: hR })}</tr>`;
    const bodyData = bodyRows((l, r) => td(num(pick(l)), hL) + blank(hD) + td(num(pick(r)), hR));
    const Ls = statFor(L, mk), Rs = statFor(R, mk);
    const sumRows = visStats.map((k, i) => sumRow(k, i, (kk, cell, fv) => {
      const ls = Ls && Ls[kk], rs = Rs && Rs[kk];
      return cell(fv(ls), hL) + cell(pctDiff(ls, rs), hD) + cell(fv(rs), hR);
    })).join('');
    return table(head, bodyData + sumRows);
  }

  const rows1 = cells => sets.map((x, i) => `<tr>${tdIdx(i + 1)}${cells(x)}</tr>`).join('');
  if (isDur) return table(`<tr>${th('#', { align: 'center' })}${th('duur (s)')}</tr>`, rows1(x => td(num(x.duration))) + summary([{ stat: statFor(sets, 'duration') }]));
  if (ex.weighted) return table(`<tr>${th('#', { align: 'center' })}${th('kg')}${th('reps')}</tr>`, rows1(x => td(num(x.weight)) + td(num(x.reps))) + summary([{ stat: statFor(sets, 'weight') }, { stat: statFor(sets, 'reps') }]));
  return table(`<tr>${th('#', { align: 'center' })}${th('reps')}</tr>`, rows1(x => td(num(x.reps))) + summary([{ stat: statFor(sets, 'reps') }]));
}

// Comparison table around the tapped session (index i). Reference sessions —
// first, previous, next, most recent — plus the tapped point itself are listed in
// chronological order, so everything above the highlighted 'Dit punt' row is history
// and everything below is the future. Each reference shows its value as a % of the
// tapped point (green when higher, red when lower). cols: [{ label, value, color }];
// opts.groups: optional top header row [{ label, color, span }] to group columns
// (mirrors the per-leg set table above).
export function comparisonTableHtml(series, i, cols, opts = {}) {
  const n = (series || []).length;
  const sel = series && series[i];
  if (!sel || n < 2 || !cols || !cols.length) return '';
  const groups = opts.groups;

  const seen = new Set();
  const rows = [];
  const add = idx => { if (idx >= 0 && idx < n && !seen.has(idx)) { seen.add(idx); rows.push(idx); } };
  add(i); add(0); add(i - 1); add(i + 1); add(n - 1);
  if (rows.length < 2) return '';
  rows.sort((a, b) => a - b); // chronological: history on top, future below

  const pct = (c, r) => (r > 0) ? ((c - r) / r * 100) : null;
  const badge = v => {
    if (v == null || !isFinite(v)) return '<span style="color:var(--muted);">–</span>';
    if (Math.abs(v) < 0.05) return '<span style="color:var(--muted);">0%</span>';
    const col = v > 0 ? 'var(--green)' : 'var(--red)';
    return `<span style="color:${col};font-weight:700;">${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toString().replace('.', ',')}%</span>`;
  };
  const dLab = d => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const hidden = opts.hidden || {};
  const basis = opts.basis || 'gemiddelde';
  const hideFor = side => {
    if (side === 'diff') return (hidden.left || hidden.right) ? 'visibility:hidden;' : '';
    return (side && hidden[side]) ? 'visibility:hidden;' : '';
  };
  // Left↔right imbalance of one session (relative to their average), as a plain %.
  const diffPct = (a, b) => {
    if (a == null || b == null) return '–';
    const m = (a + b) / 2;
    return m === 0 ? '–' : (Math.round(Math.abs(a - b) / m * 1000) / 10).toString().replace('.', ',') + '%';
  };
  const thBase = 'font-weight:700;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.03em;padding:0.1rem 0.4rem;';
  const thC = (t, color, span, h, align) => `<th${span ? ` colspan="${span}"` : ''} style="${thBase}text-align:${align || (span ? 'center' : 'right')};color:${color || 'var(--muted)'};${h}">${t}</th>`;
  const head = (groups && groups.length)
    ? `<tr><th rowspan="2" style="${thBase}text-align:center;vertical-align:bottom;color:var(--muted);">punt</th>${groups.map(g => thC(g.label, g.color, g.span, hideFor(g.side))).join('')}</tr>`
      + `<tr>${cols.map(c => thC(c.label, c.color, null, hideFor(c.side))).join('')}</tr>`
    : `<tr>${thC('punt', null, null, '', 'center')}${cols.map(c => thC(c.label, c.color, null, hideFor(c.side))).join('')}</tr>`;
  const body = rows.map(idx => {
    const r = series[idx];
    const isSel = idx === i;
    const cells = cols.map(c => {
      if (c.kind === 'diff') {
        return `<td style="padding:0.12rem 0.4rem;text-align:right;color:var(--muted);${hideFor(c.side)}">${diffPct(c.valueL(r), c.valueR(r))}</td>`;
      }
      return isSel
        ? `<td style="padding:0.12rem 0.4rem;text-align:right;color:var(--muted);${hideFor(c.side)}">—</td>`
        : `<td style="padding:0.12rem 0.4rem;text-align:right;${hideFor(c.side)}">${badge(pct(c.value(r), c.value(sel)))}</td>`;
    }).join('');
    const rowStyle = isSel ? 'background:var(--s2);box-shadow:inset 3px 0 0 var(--text);' : '';
    const numStyle = isSel ? 'font-weight:800;color:var(--text);' : 'color:var(--muted);';
    return `<tr style="${rowStyle}"><td title="${dLab(r.date)}" style="padding:0.12rem 0.4rem;text-align:center;font-size:0.72rem;${numStyle}">${idx + 1}</td>${cells}</tr>`;
  }).join('');
  return `<div style="margin-top:0.5rem;border-top:1px solid var(--border);padding-top:0.35rem;">`
    + `<div style="font-weight:700;font-size:0.72rem;color:var(--text);margin-bottom:0.15rem;">Vergelijking <span style="font-weight:400;color:var(--muted);">(op basis van ${basis})</span></div>`
    + `<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:0.76rem;"><colgroup><col style="width:2.8em;"></colgroup><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// Column spec for the comparison table, matching the set table's shape for this
// exercise. The % is computed on the chosen stat (statKey: 'avg' | 'max' | 'min').
// Returns { cols, groups? } to pass to comparisonTableHtml.
// opts: { colLeft, colRight, metric, cardioMode, statKey }.
export function comparisonColumns(ex, opts = {}) {
  const { colLeft = '#3b82f6', colRight = '#f59e0b', metric = 'weight', cardioMode = 'avg', statKey = 'avg' } = opts;
  const stat = (obj) => obj ? obj[statKey] : 0;
  if (metric === 'speed') {
    return { cols: [{ label: 'snelheid', value: pt => (cardioMode === 'max' ? pt.speedMax : pt.avgAll) }] };
  }
  if (ex.perSide && ex.weighted && metric !== 'duration') {
    return {
      cols: [
        { label: 'kg', color: colLeft, side: 'left', value: pt => stat(pt.statLeft) },
        { label: 'reps', color: colLeft, side: 'left', value: pt => stat(pt.repsStatLeft) },
        { label: 'kg', kind: 'diff', side: 'diff', valueL: pt => stat(pt.statLeft), valueR: pt => stat(pt.statRight) },
        { label: 'reps', kind: 'diff', side: 'diff', valueL: pt => stat(pt.repsStatLeft), valueR: pt => stat(pt.repsStatRight) },
        { label: 'kg', color: colRight, side: 'right', value: pt => stat(pt.statRight) },
        { label: 'reps', color: colRight, side: 'right', value: pt => stat(pt.repsStatRight) },
      ],
      groups: [
        { label: 'Links', color: colLeft, side: 'left', span: 2 },
        { label: 'Verschil', side: 'diff', span: 2 },
        { label: 'Rechts', color: colRight, side: 'right', span: 2 },
      ],
    };
  }
  if (ex.perSide) {
    return { cols: [
      { label: 'Links', color: colLeft, side: 'left', value: pt => stat(pt.statLeft) },
      { label: 'Verschil', kind: 'diff', side: 'diff', valueL: pt => stat(pt.statLeft), valueR: pt => stat(pt.statRight) },
      { label: 'Rechts', color: colRight, side: 'right', value: pt => stat(pt.statRight) },
    ] };
  }
  if (ex.weighted) {
    return { cols: [
      { label: 'gewicht', value: pt => stat(pt.statAll) },
      { label: 'reps', value: pt => stat(pt.repsStatAll) },
    ] };
  }
  return { cols: [{ label: metric === 'duration' ? 'duur' : 'reps', value: pt => stat(pt.statAll) }] };
}
