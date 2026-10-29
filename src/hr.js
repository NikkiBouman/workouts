// Pure heart-rate math. No BLE, no DOM — importable by node:test.
// A "sample" is a [tRelSec, bpm] pair; tRelSec is seconds from its segment start.

// Aggregate a flat list of [t, bpm] samples into {avg, max, min} (bpm, rounded),
// or null when there is nothing to aggregate.
export function hrStats(samples) {
  if (!samples || !samples.length) return null;
  let sum = 0, max = -Infinity, min = Infinity;
  for (const s of samples) {
    const bpm = s[1];
    sum += bpm;
    if (bpm > max) max = bpm;
    if (bpm < min) min = bpm;
  }
  return { avg: Math.round(sum / samples.length), max, min };
}

// Pool the samples from several hr objects (each {samples} or null/undefined) and
// aggregate them together. Pooling raw samples — not averaging the averages — keeps
// the mean correctly weighted by how many samples each segment contributed.
export function combineHr(hrList) {
  const pooled = [];
  for (const h of hrList || []) {
    if (h && h.samples && h.samples.length) pooled.push(...h.samples);
  }
  return hrStats(pooled);
}

// Build a per-set hr object from a segment's samples. startOffsetSec = seconds from
// workout start when the segment began (used to stitch the workout curve later).
// Returns null when there are no samples, so empty HR is never stored.
export function makeSetHr(samples, startOffsetSec = 0) {
  const stats = hrStats(samples);
  if (!stats) return null;
  return { ...stats, startOffsetSec, samples };
}

// Stitch a workout-wide HR curve from its exercises' set.hr objects (and an optional
// session-level hr, e.g. cardio). Returns segments [{startOffsetSec, points}] sorted
// by start, where points are [absSecFromWorkoutStart, bpm]. Rest gaps between segments
// show up as gaps on the time axis.
export function buildHrCurve(exercises, sessionHr = null) {
  const segs = [];
  const addSeg = (hr) => {
    if (!hr || !hr.samples || !hr.samples.length) return;
    const base = hr.startOffsetSec || 0;
    segs.push({ startOffsetSec: base, points: hr.samples.map(([t, bpm]) => [base + t, bpm]) });
  };
  for (const ex of exercises || []) {
    for (const set of ex.sets || []) addSeg(set.hr);
  }
  addSeg(sessionHr);
  return segs.sort((a, b) => a.startOffsetSec - b.startOffsetSec);
}
