// In-memory stand-in for db.js, used only in demo mode (index.html?demo).
// Same public interface as src/db.js, but no Firebase/auth: it fires a fake
// signed-in user immediately and seeds dummy data so the UI can be shown on a
// plain localhost. Production code paths (db.js) are untouched.

const FAKE_USER = { uid: 'demo', displayName: 'Demo' };

let changeCb = () => {};
const cache = { exercises: [], workouts: [], sessions: [] };

export function onChange(cb) { changeCb = cb; }
export function exercises() { return cache.exercises; }
export function workouts() { return cache.workouts; }
export function sessions() { return cache.sessions; }
export function currentUser() { return FAKE_USER; }

export function onAuthChange(cb) {
  // Resolve on a microtask so bootstrap listeners are attached first.
  Promise.resolve().then(() => cb(FAKE_USER));
  return () => {};
}
export function signIn() { return Promise.resolve(FAKE_USER); }
export function signOut() { return Promise.resolve(); }

export async function start(user, defaults /*, defaultsVersion */) {
  cache.exercises = (defaults || []).map(ex => ({ ...ex }));
  cache.workouts = demoWorkouts();
  cache.sessions = demoSessions();
  changeCb();
}

export function stop() {
  cache.exercises = []; cache.workouts = []; cache.sessions = [];
}

function put(name, item) {
  const i = cache[name].findIndex(x => x.id === item.id);
  if (i >= 0) cache[name][i] = item; else cache[name].push(item);
  changeCb();
}
function remove(name, id) {
  cache[name] = cache[name].filter(x => x.id !== id);
  changeCb();
}

export function upsertExercise(ex) { put('exercises', ex); return Promise.resolve(); }
export function deleteExercise(id) { remove('exercises', id); return Promise.resolve(); }
export function upsertWorkout(w)   { put('workouts', w);  return Promise.resolve(); }
export function deleteWorkout(id)  { remove('workouts', id); return Promise.resolve(); }
export function addSession(s) {
  put('sessions', s);
  cache.sessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return Promise.resolve();
}
export function deleteSession(id)  { remove('sessions', id); return Promise.resolve(); }

// --- dummy data ----------------------------------------------------------
// "Running program: Phase 1": one Cycling block (5 min) + a Hardlopen
// treadmill workout whose segments match the demo screenshot and sum to 15:00,
// so cycling (5) + running (15) = 20 minuten total.
function demoWorkouts() {
  return [{
    id: 'demo_running_phase1',
    name: 'Running program: Phase 1',
    entries: [
      { id: 'demo_e_cycling', exerciseId: 'ex_cycling', sets: 1, reps: null, duration: 300, weight: null },
      { id: 'demo_e_hardlopen', exerciseId: 'ex_hardlopen', blocks: [
        { type: 'segment', mode: 'time', duration: 60,  distance: 0, speed: 5,  incline: 0 },
        { type: 'segment', mode: 'time', duration: 60,  distance: 0, speed: 6,  incline: 0 },
        { type: 'superset', repeats: 4, segments: [
          { mode: 'time', duration: 60,  distance: 0, speed: 10, incline: 0 },
          { mode: 'time', duration: 120, distance: 0, speed: 6,  incline: 0 },
        ] },
        { type: 'segment', mode: 'time', duration: 60,  distance: 0, speed: 5,  incline: 0 },
      ] },
    ],
  }];
}

// One manually-logged treadmill run carrying a heart-rate value per block, so the
// history shows the ❤ avg/max and the stepped HR curve immediately on load. Each
// block's hr mirrors what the app's manualHr() builds: a flat [[0,bpm],[dur,bpm]]
// segment at its offset from the start. Also lets you re-open it via the ❤ to edit.
function demoSessions() {
  const seg = (dur, bpm, offset) => ({ avg: bpm, max: bpm, min: bpm, startOffsetSec: offset, samples: [[0, bpm], [dur, bpm]] });
  return [{
    id: 'demo_session_hr',
    date: '2026-10-29T18:30:00.000Z',
    workoutId: null,
    workoutName: 'Handmatig',
    totalSeconds: 660,
    hrAvg: 119, hrMax: 150,
    exercises: [{
      exerciseId: 'ex_hardlopen', name: 'Hardlopen', type: 'cardio',
      measureBy: null, weighted: false, perSide: false,
      hrAvg: 119, hrMax: 150,
      sets: [
        { weight: null, reps: null, duration: 300, speed: 5,  side: null, hr: seg(300, 95,  0) },
        { weight: null, reps: null, duration: 120, speed: 8,  side: null, hr: seg(120, 120, 300) },
        { weight: null, reps: null, duration: 60,  speed: 12, side: null, hr: seg(60,  150, 420) },
        { weight: null, reps: null, duration: 180, speed: 6,  side: null, hr: seg(180, 110, 480) },
      ],
    }],
  }];
}
