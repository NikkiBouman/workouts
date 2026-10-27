// Pure aggregation over sessions. No Firebase, no DOM — importable by node:test.

export function metricForExercise(ex) {
  if (ex.weighted) return 'weight';
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

export function seriesForExercise(sessions, exerciseId) {
  return entriesFor(sessions, exerciseId)
    .map(({ date, sets }) => ({
      date,
      topWeight: sets.reduce((m, s) => Math.max(m, s.weight || 0), 0),
      volume: sets.reduce((v, s) => v + (s.weight || 0) * (s.reps || 0), 0),
      maxReps: sets.reduce((m, s) => Math.max(m, s.reps || 0), 0),
      maxDuration: sets.reduce((m, s) => Math.max(m, s.duration || 0), 0),
    }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
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
