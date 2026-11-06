// Geometry helpers for the live treadmill "run" chart rendered inline in index.html
// (renderRunChart / updateRunUI). Kept pure and importable so the position-line
// placement can be unit-tested.

// Seconds elapsed WITHIN the current cardio entry: the full duration of every
// segment already finished, plus the time into the active one.
//
// The red position line must use THIS — not runTotalElapsed, which counts the whole
// workout across all entries. The bars are scaled to one entry's runTotalDuration, so
// feeding them whole-workout elapsed made the line start partway in and run ahead
// whenever another entry (e.g. a 5-min cycling block) preceded the run. Deriving the
// figure from the segments keeps the line locked to the same timeline as the bars.
export function entryElapsedSec(steps, index, segElapsed) {
  const s = steps || [];
  let done = 0;
  for (let i = 0; i < index && i < s.length; i++) done += s[i].duration || 0;
  return done + (segElapsed || 0);
}
