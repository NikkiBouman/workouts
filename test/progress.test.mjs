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

test('seriesForExercise: non-per-side gives per-session average, sorted ascending', () => {
  const s = seriesForExercise(sessions, 'a', false, 'weight');
  assert.equal(s.length, 2);
  assert.equal(s[0].date, '2026-01-02T10:00:00.000Z');
  assert.equal(s[0].avgAll, 11);   // (10+12)/2
  assert.equal(s[1].avgAll, 14);   // single set 14
  assert.equal(s[0].perSide, false);
  assert.equal(s[0].weightAvg, 11); // (10+12)/2
  assert.equal(s[0].repsAvg, 9);    // (10+8)/2
});

test('seriesForExercise: per-side splits left/right by capture order and averages each', () => {
  const ps = [
    { date: '2026-02-01T08:00:00.000Z', exercises: [
      { exerciseId: 'c', measureBy: 'reps', perSide: true,
        sets: [ {reps:10},{reps:10},{reps:12},{reps:10},{reps:10},{reps:12} ] } ] },
    { date: '2026-02-03T08:00:00.000Z', exercises: [
      { exerciseId: 'c', measureBy: 'reps', perSide: true,
        sets: [ {reps:12},{reps:12},{reps:12},{reps:12},{reps:12},{reps:12} ] } ] },
  ];
  const s = seriesForExercise(ps, 'c', true, 'reps');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].leftVals, [10, 12, 10]);    // indices 0,2,4
  assert.deepEqual(s[0].rightVals, [10, 10, 12]);   // indices 1,3,5
  assert.ok(Math.abs(s[0].avgLeft - 32 / 3) < 1e-9);
  assert.equal(s[1].avgLeft, 12);
  assert.equal(s[1].avgRight, 12);
  assert.equal(s[0].perSide, true);
});

test('seriesForExercise: explicit set.side overrides capture order', () => {
  const ps = [ { date: '2026-02-01T08:00:00.000Z', exercises: [
    { exerciseId: 'c', measureBy: 'reps', perSide: true,
      sets: [ {reps:8, side:1}, {reps:20, side:0} ] } ] } ];
  const s = seriesForExercise(ps, 'c', true, 'reps');
  assert.deepEqual(s[0].leftVals, [20]);   // side:0
  assert.deepEqual(s[0].rightVals, [8]);   // side:1
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
