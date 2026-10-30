import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatChart, sessionSetTableHtml, comparisonTableHtml, comparisonColumns } from '../src/chart.js';
import { seriesForExercise } from '../src/progress.js';

const COLORS = { left: '#3b82f6', right: '#f59e0b', single: '#8b5cf6', grid: '#eee', label: '#999', bg: '#fff' };

const perSideSessions = [
  { date: '2026-05-01T08:00:00.000Z', exercises: [ { exerciseId: 'sle', weighted: true, measureBy: 'reps', perSide: true,
    sets: [ { weight: 15, reps: 10, side: 0 }, { weight: 20, reps: 6, side: 0 }, { weight: 12, reps: 8, side: 1 } ] } ] },
  { date: '2026-05-08T08:00:00.000Z', exercises: [ { exerciseId: 'sle', weighted: true, measureBy: 'reps', perSide: true,
    sets: [ { weight: 17, reps: 10, side: 0 }, { weight: 22, reps: 6, side: 0 }, { weight: 14, reps: 8, side: 1 } ] } ] },
];

function build(opts = {}) {
  const series = seriesForExercise(perSideSessions, 'sle', true, 'weight');
  return buildStatChart(series, { perSide: true, colors: COLORS, unit: ' kg', ...opts });
}

const count = (s, needle) => s.split(needle).length - 1;

test('all sides + all stats: two bands (L/R) and avg/min/max lines per side', () => {
  const { svg, xs } = build();
  assert.equal(xs.length, 2);
  assert.equal(count(svg, '<polygon'), 2);          // one min-max band per side
  // per side: min line + max line + avg line = 3 polylines; two sides = 6
  assert.equal(count(svg, '<polyline'), 6);
});

test('hiding the right side drops its band and lines', () => {
  const { svg } = build({ hidden: { right: true } });
  assert.equal(count(svg, '<polygon'), 1);
  assert.equal(count(svg, '<polyline'), 3);
});

test('showing only avg draws no band and one line per side', () => {
  const { svg } = build({ statHidden: { min: true, max: true } });
  assert.equal(count(svg, '<polygon'), 0);          // band needs >=2 visible lines
  assert.equal(count(svg, '<polyline'), 2);         // avg only, both sides
});

test('hiding min still fills a band (avg..max) per side', () => {
  const { svg } = build({ statHidden: { min: true } });
  assert.equal(count(svg, '<polygon'), 2);          // one avg..max band per side
  assert.equal(count(svg, '<polyline'), 4);         // avg + max lines, both sides
});

test('coincident min=avg=max draws a filled dot, not a hollow one', () => {
  // one session, one set -> min = avg = max = 20 for all three stats
  const sessions = [ { date: '2026-06-01T08:00:00.000Z', exercises: [
    { exerciseId: 'sq', weighted: true, measureBy: 'reps', perSide: false, sets: [ { weight: 20, reps: 10 } ] } ] } ];
  const series = seriesForExercise(sessions, 'sq', false, 'weight');
  const { svg } = buildStatChart(series, { perSide: false, colors: COLORS, unit: ' kg' });
  assert.equal(count(svg, 'stroke-width="1.2"'), 0);         // no hollow marker
  assert.ok(count(svg, `fill="${COLORS.single}"`) >= 1);     // a solid dot is present
});

test('left and right coinciding -> one purple filled dot at the shared avg', () => {
  // L: min10 max20 avg15 ; R: min14 max16 avg15 -> only the avgs overlap, at 15.
  const sessions = [ { date: '2026-07-01T08:00:00.000Z', exercises: [
    { exerciseId: 'sle', weighted: true, measureBy: 'reps', perSide: true,
      sets: [ { weight: 10, reps: 10, side: 0 }, { weight: 20, reps: 10, side: 0 },
              { weight: 14, reps: 10, side: 1 }, { weight: 16, reps: 10, side: 1 } ] } ] } ];
  const series = seriesForExercise(sessions, 'sle', true, 'weight');
  const { svg } = buildStatChart(series, { perSide: true, colors: COLORS, unit: ' kg' });
  assert.equal(count(svg, '<circle'), 5);                    // 10,20 (L) + 14,16 (R) + 15 (shared)
  assert.equal(count(svg, `fill="${COLORS.single}"`), 1);    // the shared avg is purple + filled
});

test('y-axis labels are whole numbers', () => {
  const series = seriesForExercise(perSideSessions, 'sle', true, 'weight'); // rep-weighted avgs are fractional
  const { svg } = buildStatChart(series, { perSide: true, colors: COLORS, unit: ' kg' });
  const labels = [...svg.matchAll(/text-anchor="end">([0-9.]+)<\/text>/g)].map(m => m[1]);
  assert.ok(labels.length >= 2);
  labels.forEach(l => assert.ok(!l.includes('.'), `y-label "${l}" is not a whole number`));
});

test('sessionSetTableHtml: per-side weighted has grouped Links/Rechts header + min/gem/max summary', () => {
  const ex = { type: 'strength', perSide: true, weighted: true, measureBy: 'reps' };
  const sets = [ { weight: 15, reps: 10, side: 0 }, { weight: 12, reps: 8, side: 1 },
                 { weight: 17, reps: 10, side: 0 }, { weight: 13, reps: 8, side: 1 } ];
  const html = sessionSetTableHtml(ex, sets, { colLeft: '#00f', colRight: '#f80' });
  assert.ok(html.includes('Links') && html.includes('Rechts'));
  assert.ok(html.includes('>kg</th>') && html.includes('>reps</th>'));
  assert.ok(html.includes('>min<') && html.includes('>gem<') && html.includes('>max<'));
  assert.equal((html.match(/<tr>/g) || []).length, 7); // 2 header + 2 set + 3 summary
  assert.ok(html.includes('>15<') && html.includes('>12<'));
});

test('sessionSetTableHtml: single weighted has kg + reps columns and a summary', () => {
  const html = sessionSetTableHtml({ type: 'strength', perSide: false, weighted: true, measureBy: 'reps' },
    [ { weight: 40, reps: 10 }, { weight: 45, reps: 8 } ]);
  assert.ok(html.includes('>kg</th>') && html.includes('>reps</th>'));
  assert.ok(html.includes('>min<') && html.includes('>max<'));
  assert.equal((html.match(/<tr>/g) || []).length, 6); // 1 header + 2 set + 3 summary
});

test('comparisonTableHtml: tapped point is the pivot; refs show % vs it, chronologically', () => {
  const series = [
    { date: '2026-09-01T08:00:00.000Z', statAll: { avg: 10 }, repsAvg: 8 },
    { date: '2026-09-08T08:00:00.000Z', statAll: { avg: 12 }, repsAvg: 10 },
    { date: '2026-09-15T08:00:00.000Z', statAll: { avg: 15 }, repsAvg: 9 },
  ];
  const cols = [{ label: 'gewicht', value: p => p.statAll.avg }, { label: 'reps', value: p => p.repsAvg }];
  const html = comparisonTableHtml(series, 1, cols); // tap the middle (12 kg)
  assert.ok(!html.includes('Dit punt')); // text labels replaced by session numbers
  assert.ok(html.includes('box-shadow:inset 3px 0 0')); // chosen point highlighted
  assert.ok(html.includes('+25%'));   // later weight: (15-12)/12 = +25 (green, future)
  assert.ok(html.includes('var(--green)') && html.includes('var(--red)'));
  // first column shows the session ordinals 1,2,3 in chronological order
  assert.ok(html.includes('>1</td>') && html.includes('>2</td>') && html.includes('>3</td>'));
  assert.ok(html.indexOf('>1</td>') < html.indexOf('>2</td>'));
  assert.ok(html.indexOf('>2</td>') < html.indexOf('>3</td>'));
});

test('comparisonTableHtml: first column shows session ordinals (1..5) when tapping a middle session', () => {
  const series = [10, 11, 12, 13, 14].map((w, k) => ({ date: `2026-09-0${k + 1}T08:00:00.000Z`, statAll: { avg: w }, repsAvg: 8 }));
  const cols = [{ label: 'gewicht', value: p => p.statAll.avg }];
  const html = comparisonTableHtml(series, 2, cols); // tap the 3rd of 5
  ['>1</td>', '>2</td>', '>3</td>', '>4</td>', '>5</td>'].forEach(nr => assert.ok(html.includes(nr), nr));
});

test('comparisonColumns: per-side weighted yields 4 columns grouped Links/Rechts', () => {
  const { cols, groups } = comparisonColumns({ perSide: true, weighted: true }, { colLeft: '#00f', colRight: '#f80', metric: 'weight' });
  assert.equal(cols.length, 4);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => g.label), ['Links', 'Rechts']);
  const series = [
    { date: '2026-09-01T08:00:00.000Z', statLeft: { avg: 15 }, statRight: { avg: 12 }, repsAvgLeft: 10, repsAvgRight: 10 },
    { date: '2026-09-08T08:00:00.000Z', statLeft: { avg: 17 }, statRight: { avg: 13 }, repsAvgLeft: 10, repsAvgRight: 8 },
  ];
  const html = comparisonTableHtml(series, 1, cols, { groups });
  assert.ok(html.includes('Links') && html.includes('Rechts'));
  assert.ok(html.includes('>kg</th>') && html.includes('>reps</th>'));
  assert.ok(html.includes('var(--red)')); // Eerste keer L kg (15 vs 17) is lower
});

test('comparisonTableHtml: empty when fewer than two sessions', () => {
  assert.equal(comparisonTableHtml([{ date: 'x', statAll: { avg: 1 } }], 0, [{ label: 'g', value: p => p.statAll.avg }]), '');
});

test('empty series yields empty svg', () => {
  const r = buildStatChart([], { perSide: false, colors: COLORS });
  assert.equal(r.svg, '');
});

test('custom onPointClick name is wired into the hit areas', () => {
  const { svg } = build({ onPointClick: 'demoTap' });
  assert.ok(svg.includes('onclick="demoTap(0)"'));
  assert.ok(svg.includes('onclick="demoTap(1)"'));
});
