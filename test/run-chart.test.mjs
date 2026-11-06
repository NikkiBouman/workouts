import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryElapsedSec } from '../src/run-chart.js';

// The live treadmill chart lays its segment bars out by cumulative duration within
// the CURRENT cardio entry. The red position line must track the same per-entry
// timeline — not runTotalElapsed, which counts the whole workout across entries and
// made the line "run ahead" (it started 1/3 in when a 5-min cycling entry preceded
// the run). entryElapsedSec is that per-entry elapsed figure.

const steps = [
  { duration: 60 },   // 0..60
  { duration: 60 },   // 60..120
  { duration: 180 },  // 120..300
];

test('entryElapsedSec is 0 at the very start of an entry (line sits at the left edge)', () => {
  assert.equal(entryElapsedSec(steps, 0, 0), 0);
});

test('entryElapsedSec adds time into the active segment', () => {
  assert.equal(entryElapsedSec(steps, 0, 30), 30);
  assert.equal(entryElapsedSec(steps, 2, 90), 120 + 90); // 210
});

test('entryElapsedSec at a segment boundary equals the cumulative bar offset', () => {
  // Mirror renderRunChart's bar layout: xOff accumulates each segment's duration.
  let xOff = 0;
  steps.forEach((s, i) => {
    assert.equal(entryElapsedSec(steps, i, 0), xOff,
      `start of bar ${i} must align with cumulative duration ${xOff}`);
    xOff += s.duration;
  });
  // End of the last segment == total entry duration (line reaches the right edge).
  assert.equal(entryElapsedSec(steps, steps.length, 0), xOff);
});

test('entryElapsedSec depends only on this entry, never on prior-entry time', () => {
  // No parameter carries whole-workout elapsed in, so a preceding 5-min cycling
  // block cannot push the line forward. Same inputs -> same (small) result.
  assert.equal(entryElapsedSec(steps, 0, 5), 5);
});

test('entryElapsedSec tolerates empty / missing input', () => {
  assert.equal(entryElapsedSec([], 0, 0), 0);
  assert.equal(entryElapsedSec(null, 0, 0), 0);
  assert.equal(entryElapsedSec(steps, 0, undefined), 0);
});
