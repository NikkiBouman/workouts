import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatChart } from '../src/chart.js';
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
  assert.equal(count(svg, '<polygon'), 0);          // band needs both min and max
  assert.equal(count(svg, '<polyline'), 2);         // avg only, both sides
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

test('empty series yields empty svg', () => {
  const r = buildStatChart([], { perSide: false, colors: COLORS });
  assert.equal(r.svg, '');
});

test('custom onPointClick name is wired into the hit areas', () => {
  const { svg } = build({ onPointClick: 'demoTap' });
  assert.ok(svg.includes('onclick="demoTap(0)"'));
  assert.ok(svg.includes('onclick="demoTap(1)"'));
});
