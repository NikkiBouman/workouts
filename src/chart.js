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
// opts: { colLeft, colRight, speedUnit, kmhToPace } (speed bits only used for cardio).
export function sessionSetTableHtml(ex, sets, opts = {}) {
  sets = sets || [];
  const { colLeft = '#3b82f6', colRight = '#f59e0b', speedUnit = 'kmh', kmhToPace = v => String(v) } = opts;
  const num = v => (v == null || v === '') ? '' : String(v).replace('.', ',');
  const favg = v => (v == null) ? '' : num(Math.round(v * 10) / 10);
  const thBase = 'font-weight:700;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.03em;padding:0.1rem 0.4rem;text-align:center;';
  const th = (t, { color, span } = {}) => `<th${span ? ` colspan="${span}"` : ''} style="${thBase}color:${color || 'var(--muted)'};">${t}</th>`;
  const td = t => `<td style="padding:0.1rem 0.4rem;text-align:center;font-family:var(--mono);">${t === '' ? '–' : t}</td>`;
  const table = (head, body) => `<table style="width:100%;border-collapse:collapse;font-size:0.76rem;"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  const isDur = ex.measureBy === 'duration';

  // Bold min/gem/max summary rows. Each column's stat object comes from statFor; the
  // label sits in the '#' column and the first row carries a divider above it.
  const summary = cols => ['min', 'avg', 'max'].map((k, i) => {
    const bt = i === 0 ? 'border-top:2px solid var(--border);' : '';
    const lbl = k === 'avg' ? 'gem' : k;
    const base = `padding:0.12rem 0.4rem;text-align:center;font-weight:700;${bt}`;
    const cells = cols.map(c => {
      const v = c ? (k === 'avg' ? favg(c.avg) : num(c[k])) : '';
      return `<td style="${base}font-family:var(--mono);">${v === '' ? '–' : v}</td>`;
    }).join('');
    return `<tr><td style="${base}color:var(--muted);">${lbl}</td>${cells}</tr>`;
  }).join('');

  if (ex.type === 'cardio') {
    const hasSpeed = sets.some(s => s.speed != null);
    const head = `<tr>${th('#')}${th('min')}${hasSpeed ? th(speedUnit === 'pace' ? 'min/km' : 'km/h') : ''}</tr>`;
    const body = sets.map((x, i) => `<tr>${td(i + 1)}${td(Math.round((x.duration || 0) / 60))}${hasSpeed ? td(x.speed != null ? (speedUnit === 'pace' ? kmhToPace(x.speed) : num(x.speed)) : '') : ''}</tr>`).join('');
    return table(head, body);
  }

  if (ex.perSide) {
    const L = [], R = [];
    sets.forEach((x, i) => { const side = (x.side === 0 || x.side === 1) ? x.side : i % 2; (side === 0 ? L : R).push(x); });
    const n = Math.max(L.length, R.length);
    const bodyRows = cells => Array.from({ length: n }, (_, i) => `<tr>${td(i + 1)}${cells(L[i], R[i])}</tr>`).join('');

    if (ex.weighted && !isDur) {
      const head =
        `<tr><th rowspan="2" style="${thBase}color:var(--muted);vertical-align:bottom;">#</th>` +
        `${th('Links', { color: colLeft, span: 2, center: true })}${th('Rechts', { color: colRight, span: 2, center: true })}</tr>` +
        `<tr>${th('kg', { color: colLeft })}${th('reps', { color: colLeft })}${th('kg', { color: colRight })}${th('reps', { color: colRight })}</tr>`;
      const body = bodyRows((l, r) => td(num(l && l.weight)) + td(num(l && l.reps)) + td(num(r && r.weight)) + td(num(r && r.reps)))
        + summary([statFor(L, 'weight'), statFor(L, 'reps'), statFor(R, 'weight'), statFor(R, 'reps')]);
      return table(head, body);
    }
    const pick = isDur ? (s => s && s.duration) : (s => s && s.reps);
    const mk = isDur ? 'duration' : 'reps';
    const unit = isDur ? ' (s)' : '';
    const head = `<tr>${th('#')}${th('Links' + unit, { color: colLeft })}${th('Rechts' + unit, { color: colRight })}</tr>`;
    const body = bodyRows((l, r) => td(num(pick(l))) + td(num(pick(r)))) + summary([statFor(L, mk), statFor(R, mk)]);
    return table(head, body);
  }

  const rows1 = cells => sets.map((x, i) => `<tr>${td(i + 1)}${cells(x)}</tr>`).join('');
  if (isDur) return table(`<tr>${th('#')}${th('duur (s)')}</tr>`, rows1(x => td(num(x.duration))) + summary([statFor(sets, 'duration')]));
  if (ex.weighted) return table(`<tr>${th('#')}${th('kg')}${th('reps')}</tr>`, rows1(x => td(num(x.weight)) + td(num(x.reps))) + summary([statFor(sets, 'weight'), statFor(sets, 'reps')]));
  return table(`<tr>${th('#')}${th('reps')}</tr>`, rows1(x => td(num(x.reps))) + summary([statFor(sets, 'reps')]));
}
