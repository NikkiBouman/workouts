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

// {min, avg, max} of a set list for a metric, or null when empty. For weight the
// average is rep-weighted (Σ weight·reps / Σ reps) so heavier high-rep sets count
// more; for speed it is duration-weighted; otherwise a plain mean.
export function statFor(sets, metricKey) {
  if (!sets || !sets.length) return null;
  const vals = sets.map(s => setMetric(s, metricKey));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let a = mean;
  if (metricKey === 'weight') {
    const totReps = sets.reduce((acc, s) => acc + (s.reps || 0), 0);
    if (totReps > 0) a = sets.reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0) / totReps;
  } else if (metricKey === 'speed') {
    const totDur = sets.reduce((acc, s) => acc + (s.duration || 0), 0);
    if (totDur > 0) a = sets.reduce((acc, s) => acc + (s.speed || 0) * (s.duration || 0), 0) / totDur;
  }
  return { min: Math.min(...vals), avg: a, max: Math.max(...vals) };
}

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
    const leftSets = [], rightSets = [];
    const repsAll = [], weightAll = [], durAll = [];
    sets.forEach((set, i) => {
      const v = setMetric(set, metricKey);
      allVals.push(v);
      repsAll.push(set.reps || 0);
      weightAll.push(set.weight || 0);
      durAll.push(set.duration || 0);
      if (isPerSide) {
        const side = sideOf(set, i, true);
        (side === 0 ? leftVals : rightVals).push(v);
        (side === 0 ? leftSets : rightSets).push(set);
      }
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
      statAll: statFor(sets, metricKey),
      statLeft: statFor(leftSets, metricKey),
      statRight: statFor(rightSets, metricKey),
      repsAvgLeft: avg(leftSets.map(s => s.reps || 0)),
      repsAvgRight: avg(rightSets.map(s => s.reps || 0)),
      repsStatLeft: statFor(leftSets, 'reps'),
      repsStatRight: statFor(rightSets, 'reps'),
      repsStatAll: statFor(sets, 'reps'),
    });
  }
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function statsForExercise(sessions, exerciseId) {
  const entries = entriesFor(sessions, exerciseId);
  const empty = { count: 0, lastDate: null, prWeight: 0, currentWeight: 0, prWeightLeft: 0, prWeightRight: 0, currentWeightLeft: 0, currentWeightRight: 0 };
  if (!entries.length) return empty;
  const byDate = entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = byDate[byDate.length - 1];
  // Max weight over a set list, optionally restricted to one side (0=left, 1=right);
  // side falls back to capture order (L,R,L,R…) when not explicit.
  const maxW = (sets, sidePick) => sets.reduce((m, s, i) => {
    const side = (s.side === 0 || s.side === 1) ? s.side : i % 2;
    if (sidePick != null && side !== sidePick) return m;
    return Math.max(m, s.weight || 0);
  }, 0);
  return {
    count: entries.length,
    lastDate: last.date,
    prWeight: entries.reduce((m, e) => Math.max(m, maxW(e.sets)), 0),
    currentWeight: maxW(last.sets),
    prWeightLeft: entries.reduce((m, e) => Math.max(m, maxW(e.sets, 0)), 0),
    prWeightRight: entries.reduce((m, e) => Math.max(m, maxW(e.sets, 1)), 0),
    currentWeightLeft: maxW(last.sets, 0),
    currentWeightRight: maxW(last.sets, 1),
  };
}
