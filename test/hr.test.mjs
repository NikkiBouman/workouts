import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrStats, combineHr, makeSetHr, manualHr, buildHrCurve } from '../src/hr.js';

test('hrStats returns rounded avg, max, min', () => {
  const s = hrStats([[0, 120], [2, 130], [4, 141]]);
  assert.equal(s.avg, 130); // (120+130+141)/3 = 130.33 -> 130
  assert.equal(s.max, 141);
  assert.equal(s.min, 120);
});

test('hrStats returns null for empty/missing samples', () => {
  assert.equal(hrStats([]), null);
  assert.equal(hrStats(null), null);
  assert.equal(hrStats(undefined), null);
});

test('combineHr pools samples (weighted mean), ignores null entries', () => {
  const a = { samples: [[0, 100], [2, 100]] };        // two at 100
  const b = { samples: [[0, 160]] };                  // one at 160
  const c = combineHr([a, null, b, undefined]);
  assert.equal(c.avg, 120); // (100+100+160)/3 = 120
  assert.equal(c.max, 160);
  assert.equal(c.min, 100);
});

test('combineHr returns null when nothing to combine', () => {
  assert.equal(combineHr([null, { samples: [] }]), null);
  assert.equal(combineHr([]), null);
});

test('makeSetHr embeds stats, offset and samples; null when empty', () => {
  const samples = [[0, 110], [2, 120]];
  const hr = makeSetHr(samples, 90);
  assert.equal(hr.avg, 115);
  assert.equal(hr.max, 120);
  assert.equal(hr.min, 110);
  assert.equal(hr.startOffsetSec, 90);
  assert.deepEqual(hr.samples, samples);
  assert.equal(makeSetHr([], 5), null);
});

test('manualHr builds a flat cardio segment with offset + duration', () => {
  const hr = manualHr(120, { startOffsetSec: 60, durationSec: 120 });
  assert.equal(hr.avg, 120);
  assert.equal(hr.max, 120);
  assert.equal(hr.min, 120);
  assert.equal(hr.startOffsetSec, 60);
  assert.deepEqual(hr.samples, [[0, 120], [120, 120]]); // flat line over the block
});

test('manualHr for strength omits samples and offset (feeds avg/max, not the curve)', () => {
  const hr = manualHr(110);
  assert.deepEqual(hr, { avg: 110, max: 110, min: 110 });
  assert.equal(hr.samples, undefined);
  assert.equal(hr.startOffsetSec, undefined);
});

test('manualHr rounds and rejects empty/invalid input', () => {
  assert.equal(manualHr(120.6).avg, 121);
  assert.equal(manualHr(0), null);
  assert.equal(manualHr(null), null);
  assert.equal(manualHr(undefined), null);
  assert.equal(manualHr(NaN), null);
  assert.equal(manualHr(-5), null);
});

test('combineHr counts sample-less manual values as one point each', () => {
  const c = combineHr([{ avg: 100, max: 100, min: 100 }, { avg: 160, max: 160, min: 160 }]);
  assert.equal(c.avg, 130); // (100+160)/2
  assert.equal(c.max, 160);
  assert.equal(c.min, 100);
});

test('combineHr mixes sampled and sample-less entries', () => {
  const sampled = { samples: [[0, 120], [2, 120]] }; // two points at 120
  const manual = { avg: 60, max: 60, min: 60 };      // one point at 60
  const c = combineHr([sampled, manual]);
  assert.equal(c.avg, 100); // (120+120+60)/3 = 100
  assert.equal(c.max, 120);
  assert.equal(c.min, 60);
});

test('buildHrCurve stitches sets into absolute-time segments, sorted', () => {
  const exercises = [
    { sets: [
      { hr: makeSetHr([[0, 120], [2, 125]], 100) },
      { hr: null },
      { hr: makeSetHr([[0, 130], [2, 135]], 40) },
    ] },
  ];
  const segs = buildHrCurve(exercises);
  assert.equal(segs.length, 2);
  // sorted by startOffsetSec ascending -> the offset-40 segment first
  assert.equal(segs[0].startOffsetSec, 40);
  assert.deepEqual(segs[0].points, [[40, 130], [42, 135]]);
  assert.deepEqual(segs[1].points, [[100, 120], [102, 125]]);
});

test('buildHrCurve includes an optional session-level hr (cardio)', () => {
  const segs = buildHrCurve([], makeSetHr([[0, 150], [3, 160]], 0));
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0].points, [[0, 150], [3, 160]]);
});

test('buildHrCurve is empty when no hr present', () => {
  assert.deepEqual(buildHrCurve([{ sets: [{ hr: null }, {}] }]), []);
  assert.deepEqual(buildHrCurve(null), []);
});
