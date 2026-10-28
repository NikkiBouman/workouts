// Pure aggregation over sessions. No Firebase, no DOM — importable by node:test.

export function metricForExercise(ex) {
  if (ex.weighted) return 'weight';
  if (ex.type === 'cardio' && ex.bleConnectable) return 'speed';
  if (ex.measureBy === 'duration') return 'duration';
  if (ex.measureBy === 'reps') return 'reps';
  return 'duration';
}

function entriesFor(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    const e = (s.exercises || []).find(x => x.exerciseId === exerciseId);
    if (e) out.push({ date: s.date, sets: e.sets || [] });
  }
  return out;
}

export function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// The metric value of a single set (weight / duration / reps).
function setMetric(set, metricKey) {
  if (metricKey === 'weight') return set.weight || 0;
  if (metricKey === 'duration') return set.duration || 0;
  if (metricKey === 'speed') return set.speed || 0;
  return set.reps || 0;
}

// Which side a set belongs to: explicit set.side when present (0=left, 1=right);
// otherwise inferred from capture order (L,R,L,R…) for per-side exercises.
function sideOf(set, index, perSide) {
  if (!perSide) return 0;
  if (set.side === 0 || set.side === 1) return set.side;
  return index % 2;
}

// Per-session summary for one exercise. For a per-side exercise the sets are
// split into left/right and each series plots that side's average; otherwise a
// single average over all sets. Raw per-side value lists are kept for tooltips.
export function seriesForExercise(sessions, exerciseId, perSide = false, metricKey = 'reps') {
  const out = [];
  for (const s of sessions) {
    const e = (s.exercises || []).find(x => x.exerciseId === exerciseId);
    if (!e) continue;
    const sets = e.sets || [];
    const isPerSide = perSide || !!e.perSide;
    const leftVals = [], rightVals = [], allVals = [];
    const repsAll = [], weightAll = [], durAll = [];
    sets.forEach((set, i) => {
      const v = setMetric(set, metricKey);
      allVals.push(v);
      repsAll.push(set.reps || 0);
      weightAll.push(set.weight || 0);
      durAll.push(set.duration || 0);
      if (isPerSide) (sideOf(set, i, true) === 0 ? leftVals : rightVals).push(v);
    });
    const durTotal = durAll.reduce((a, b) => a + b, 0);
    // For speed (cardio), the session's overall value is the duration-weighted
    // average speed (= total distance / total time), not a plain mean of segments.
    // speedMax is the fastest segment; speedMaxDur is how long was spent at it.
    let avgAllVal = avg(allVals);
    let speedMax = 0, speedMaxDur = 0;
    if (metricKey === 'speed') {
      if (durTotal > 0) avgAllVal = sets.reduce((acc, st) => acc + (st.speed || 0) * (st.duration || 0), 0) / durTotal;
      speedMax = allVals.length ? Math.max(...allVals) : 0;
      speedMaxDur = sets.reduce((acc, st) => acc + ((st.speed || 0) === speedMax ? (st.duration || 0) : 0), 0);
    }
    out.push({
      id: s.id,
      date: s.date,
      perSide: isPerSide,
      leftVals, rightVals, allVals,
      avgLeft: avg(leftVals), avgRight: avg(rightVals), avgAll: avgAllVal,
      repsAvg: avg(repsAll), weightAvg: avg(weightAll), durAvg: avg(durAll), durTotal,
      speedMax, speedMaxDur,
    });
  }
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function statsForExercise(sessions, exerciseId) {
  const entries = entriesFor(sessions, exerciseId);
  if (!entries.length) return { count: 0, lastDate: null, prWeight: 0, currentWeight: 0 };
  const byDate = entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = byDate[byDate.length - 1];
  return {
    count: entries.length,
    lastDate: last.date,
    prWeight: entries.reduce((m, e) => Math.max(m, e.sets.reduce((mm, s) => Math.max(mm, s.weight || 0), 0)), 0),
    currentWeight: last.sets.reduce((m, s) => Math.max(m, s.weight || 0), 0),
  };
}
