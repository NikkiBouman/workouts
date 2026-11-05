import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHT_STEP, targetFor, sideBadgeHtml, prevSessionPanelHtml, primaryMetric } from '../src/strength-ui.js';

const COL = { colLeft: '#3b82f6', colRight: '#f59e0b' };

const perSideTargets = {
  date: '2026-08-08T08:00:00.000Z', perSide: true,
  sets: [ { side: 0, weight: 25, reps: 6, duration: 0 }, { side: 0, weight: 26, reps: 5, duration: 0 },
          { side: 1, weight: 24, reps: 6, duration: 0 }, { side: 1, weight: 25, reps: 5, duration: 0 } ],
  maxWeight: 26, maxWeightL: 26, maxWeightR: 25, maxReps: 6, maxRepsL: 6, maxRepsR: 6, maxDur: 0, maxDurL: 0, maxDurR: 0,
};
const weightedEx = { weighted: true, measureBy: 'reps', perSide: true };

test('WEIGHT_STEP is 2.5 kg', () => {
  assert.equal(WEIGHT_STEP, 2.5);
});

test('primaryMetric: weight when weighted, else measured metric', () => {
  assert.equal(primaryMetric({ weighted: true, measureBy: 'reps' }), 'weight');
  assert.equal(primaryMetric({ weighted: true, measureBy: 'duration' }), 'weight');
  assert.equal(primaryMetric({ weighted: false, measureBy: 'reps' }), 'reps');
  assert.equal(primaryMetric({ weighted: false, measureBy: 'duration' }), 'duration');
});

test('targetFor: per-side weighted exercise picks that leg max', () => {
  assert.deepEqual(targetFor(perSideTargets, 0, weightedEx), { weight: 26, reps: 6, duration: 0 });
  assert.deepEqual(targetFor(perSideTargets, 1, weightedEx), { weight: 25, reps: 6, duration: 0 });
});

test('targetFor: bodyweight reps exercise has no weight target', () => {
  const t = { maxWeightL: 0, maxWeightR: 0, maxRepsL: 6, maxRepsR: 6, maxDurL: 0, maxDurR: 0 };
  assert.deepEqual(targetFor(t, 0, { weighted: false, measureBy: 'reps', perSide: true }), { weight: 0, reps: 6, duration: 0 });
});

test('targetFor: no history returns zeros', () => {
  assert.deepEqual(targetFor(null, 0, weightedEx), { weight: 0, reps: 0, duration: 0 });
});

test('sideBadgeHtml: blue Links / orange Rechts, empty when not per-side', () => {
  const l = sideBadgeHtml(0, true, COL);
  const r = sideBadgeHtml(1, true, COL);
  assert.ok(l.includes('Links') && l.includes('#3b82f6'));
  assert.ok(r.includes('Rechts') && r.includes('#f59e0b'));
  assert.equal(sideBadgeHtml(0, false, COL), '');
});

test('prevSessionPanelHtml: reuses the exercise set table (Links/Rechts, kg values, max row)', () => {
  const html = prevSessionPanelHtml(perSideTargets, weightedEx, COL);
  assert.ok(html.includes('Vorige keer'));
  assert.ok(html.includes('Links') && html.includes('Rechts') && html.includes('Verschil'));
  assert.ok(html.includes('26') && html.includes('24')); // set weights from the fixture
  assert.ok(html.includes('max'));  // min/gem/max summary rows
  // per-side colours from the shared table
  assert.ok(html.includes('#3b82f6') && html.includes('#f59e0b'));
});

test('prevSessionPanelHtml: null history shows a friendly note', () => {
  const html = prevSessionPanelHtml(null, weightedEx, COL);
  assert.ok(html.toLowerCase().includes('geen vorige sessie'));
});

test('prevSessionPanelHtml: non-per-side renders a plain kg/reps table', () => {
  const t = { date: '2026-01-05T10:00:00.000Z', perSide: false,
    sets: [ { side: null, weight: 40, reps: 10, duration: 0 }, { side: null, weight: 45, reps: 8, duration: 0 } ],
    maxWeight: 45, maxWeightL: 45, maxWeightR: 45, maxReps: 10, maxRepsL: 10, maxRepsR: 10, maxDur: 0, maxDurL: 0, maxDurR: 0 };
  const html = prevSessionPanelHtml(t, { weighted: true, measureBy: 'reps', perSide: false }, COL);
  assert.ok(html.includes('40') && html.includes('45'));
  assert.ok(html.includes('kg') && html.includes('reps'));
  assert.ok(!html.includes('Links')); // no per-side grouping
});
