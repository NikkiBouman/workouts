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
  cache.sessions = [];
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
