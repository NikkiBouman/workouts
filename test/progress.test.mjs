import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricForExercise, seriesForExercise, statsForExercise } from '../src/progress.js';

const sessions = [
  { date: '2026-01-02T10:00:00.000Z', exercises: [
    { exerciseId: 'a', weighted: true, measureBy: 'reps',
      sets: [ { weight: 10, reps: 10, duration: null }, { weight: 12, reps: 8, duration: null } ] } ] },
  { date: '2026-01-05T10:00:00.000Z', exercises: [
    { exerciseId: 'a', weighted: true, measureBy: 'reps',
      sets: [ { weight: 14, reps: 8, duration: null } ] } ] },
  { date: '2026-01-03T10:00:00.000Z', exercises: [
    { exerciseId: 'b', weighted: false, measureBy: 'duration',
      sets: [ { weight: null, reps: null, duration: 60 } ] } ] },
];

test('metricForExercise picks weight/duration/reps', () => {
  assert.equal(metricForExercise({ weighted: true, measureBy: 'reps' }), 'weight');
  assert.equal(metricForExercise({ weighted: false, measureBy: 'duration' }), 'duration');
  assert.equal(metricForExercise({ weighted: false, measureBy: 'reps' }), 'reps');
  assert.equal(metricForExercise({ weighted: false, measureBy: null, type: 'cardio' }), 'duration');
});

test('seriesForExercise is sorted ascending with topWeight + volume', () => {
  const s = seriesForExercise(sessions, 'a');
  assert.equal(s.length, 2);
  assert.equal(s[0].date, '2026-01-02T10:00:00.000Z');
  assert.equal(s[0].topWeight, 12);
  assert.equal(s[0].volume, 10 * 10 + 12 * 8);   // 196
  assert.equal(s[1].topWeight, 14);
});

test('statsForExercise returns count, lastDate, PR and current', () => {
  const st = statsForExercise(sessions, 'a');
  assert.equal(st.count, 2);
  assert.equal(st.lastDate, '2026-01-05T10:00:00.000Z');
  assert.equal(st.prWeight, 14);
  assert.equal(st.currentWeight, 14);
});

test('exercise with no sessions yields empty/zero', () => {
  assert.deepEqual(seriesForExercise(sessions, 'zzz'), []);
  assert.deepEqual(statsForExercise(sessions, 'zzz'), { count: 0, lastDate: null, prWeight: 0, currentWeight: 0 });
});
