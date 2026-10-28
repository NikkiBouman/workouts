// Firebase data layer for WorkoutCtrl. Public web config (not a secret).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, setDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAeKL6JrCIB6f188RZLWzFzbs-J3tCy8PY",
  authDomain: "workouts-347af.firebaseapp.com",
  projectId: "workouts-347af",
  storageBucket: "workouts-347af.firebasestorage.app",
  messagingSenderId: "39166195519",
  appId: "1:39166195519:web:16e1a81bc5d1a632f8c58a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
export function signIn() { return signInWithPopup(auth, new GoogleAuthProvider()); }
export function signOut() { return fbSignOut(auth); }
export function currentUser() { return auth.currentUser; }

let uid = null;
let changeCb = () => {};
const cache = { exercises: [], workouts: [], sessions: [] };
let unsub = [];

export function onChange(cb) { changeCb = cb; }
export function exercises() { return cache.exercises; }
export function workouts() { return cache.workouts; }
export function sessions() { return cache.sessions; }

function colRef(name) { return collection(db, `users/${uid}/${name}`); }
function docRef(name, id) { return doc(db, `users/${uid}/${name}/${id}`); }

function listen(name, transform) {
  return new Promise((resolve) => {
    let first = true;
    const u = onSnapshot(colRef(name), (snap) => {
      cache[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (transform) cache[name] = transform(cache[name]);
      changeCb();
      if (first) { first = false; resolve(); }
    });
    unsub.push(u);
  });
}

async function seedDefaults(defaults, version) {
  const flags = await getDoc(docRef('meta', 'flags'));
  const seeded = flags.exists() ? (flags.data().seededDefaultsVersion || 0) : 0;
  if (seeded >= version) return;
  await Promise.all(defaults.map(ex => setDoc(docRef('exercises', ex.id), ex, { merge: true })));
  await setDoc(docRef('meta', 'flags'), { seededDefaultsVersion: version }, { merge: true });
}

export async function start(user, defaults, defaultsVersion) {
  uid = user.uid;
  // Sort sessions newest-first so loadHistory() keeps its existing ordering.
  await Promise.all([
    listen('exercises'),
    listen('workouts'),
    listen('sessions', arr => arr.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))),
  ]);
  await seedDefaults(defaults, defaultsVersion);
}

export function stop() {
  unsub.forEach(fn => fn()); unsub = [];
  cache.exercises = []; cache.workouts = []; cache.sessions = [];
  uid = null;
}

// Optimistic cache update so a synchronous render right after a write sees the change;
// the onSnapshot listener reconciles immediately after (local cache is instant).
function putLocal(name, item) {
  const i = cache[name].findIndex(x => x.id === item.id);
  if (i >= 0) cache[name][i] = item; else cache[name].push(item);
}
function removeLocal(name, id) {
  cache[name] = cache[name].filter(x => x.id !== id);
}

export function upsertExercise(ex) { putLocal('exercises', ex); return setDoc(docRef('exercises', ex.id), ex); }
export function deleteExercise(id) { removeLocal('exercises', id); return deleteDoc(docRef('exercises', id)); }
export function upsertWorkout(w)   { putLocal('workouts', w);  return setDoc(docRef('workouts', w.id), w); }
export function deleteWorkout(id)  { removeLocal('workouts', id); return deleteDoc(docRef('workouts', id)); }
export function addSession(s)      { putLocal('sessions', s); cache.sessions.sort((a,b)=>(b.date||'').localeCompare(a.date||'')); return setDoc(docRef('sessions', s.id), s); }
export function deleteSession(id)  { removeLocal('sessions', id); return deleteDoc(docRef('sessions', id)); }
