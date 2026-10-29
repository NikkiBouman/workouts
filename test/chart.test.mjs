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

test('empty series yields empty svg', () => {
  const r = buildStatChart([], { perSide: false, colors: COLORS });
  assert.equal(r.svg, '');
});

test('custom onPointClick name is wired into the hit areas', () => {
  const { svg } = build({ onPointClick: 'demoTap' });
  assert.ok(svg.includes('onclick="demoTap(0)"'));
  assert.ok(svg.includes('onclick="demoTap(1)"'));
});
