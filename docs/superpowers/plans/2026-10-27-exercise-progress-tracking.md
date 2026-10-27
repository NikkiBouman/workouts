# Exercise Progress Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move WorkoutCtrl off `localStorage` to Firebase so data syncs across devices, record the *actual* per-set weight/reps performed, and add a per-exercise progress chart.

**Architecture:** The app stays a single HTML file with inline classic JS. A new `<script type="module">` block loads the Firebase SDK + two local ES modules (`src/db.js`, `src/progress.js`) and exposes them as `window.DB` / `window.Progress`. The classic app code keeps calling the same `loadExercises()/loadWorkouts()/loadHistory()` functions, but their bodies now read synchronous in-memory caches that `src/db.js` hydrates from Firestore (with offline persistence) and keeps fresh via `onSnapshot`. Rendering is driven by an `onReady`/`onChange` handshake instead of running at parse time.

**Tech Stack:** Vanilla JS (no framework, no bundler), Firebase JS SDK v10 (modular, via gstatic CDN), Firestore + Firebase Auth (Google), inline SVG for charts, `node:test` for unit tests.

## Global Constraints

- **No build step.** Everything runs from static files served over HTTP/HTTPS. No bundler, no transpiler. `node:test` is built into Node ≥18 — no `npm install` required.
- **Firebase JS SDK version pinned to `10.12.2`** on every `https://www.gstatic.com/firebasejs/10.12.2/firebase-*.js` import. If any import 404s, bump all three imports to the same latest `10.x` shown at https://firebase.google.com/docs/web/setup and note it.
- **Firebase web config is public** and committed in `src/db.js` verbatim (keys are project identifiers, not secrets; data is protected by Firestore rules + auth). Do NOT add `databaseURL` or Analytics.
- **UI copy is Dutch** (match the existing app, e.g. "Inloggen met Google", "Workout loggen").
- **Firestore paths:** everything under `users/{uid}/…`. Collections: `exercises`, `workouts`, `sessions`; plus doc `meta/flags`.
- **`date` fields are client ISO strings** (`new Date().toISOString()`), never `serverTimestamp()` (keeps values present while offline and keeps `src/progress.js` pure/testable).
- **Canonical session shape** (produced in Task 2.2, consumed in Task 3.1 — keep identical):
  ```js
  {
    id,                         // crypto.randomUUID()
    date,                       // ISO string
    workoutId, workoutName,
    totalSeconds,               // number
    exercises: [
      { exerciseId, name, type, measureBy, weighted,
        sets: [ { weight, reps, duration } ] }  // unused fields are null
    ]
  }
  ```
- **Local dev + manual testing:** serve the folder with `python3 -m http.server 8000` and open `http://localhost:8000/` (secure context → Web Bluetooth + Firebase auth both work; `localhost` is a Firebase-authorized domain by default).
- **Exercise metric rule** (used for charts): `weighted` → `weight`; else `measureBy === 'duration'` → `duration`; else `measureBy === 'reps'` → `reps`; else → `duration`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Renamed from `treadmill-controller.html`. The app. Gains: module glue block, auth-gate overlay, sync indicator, per-set capture UI, pre-start logging controls, exercise-detail view + SVG chart. Its `load*/save*/delete*/logWorkoutCompletion` bodies now delegate to `window.DB`. |
| `src/db.js` | ES module. Firebase init + Google auth + Firestore data layer: in-memory caches, `onSnapshot` listeners, default seeding, optimistic read/write API. Imported by the glue, exposed as `window.DB`. |
| `src/progress.js` | ES module. **Pure** aggregation functions (no Firebase, no DOM): sessions → per-exercise series, stats, metric selection. Exposed as `window.Progress`; imported by tests. |
| `test/progress.test.mjs` | `node:test` unit tests for `src/progress.js`. |
| `firestore.rules` | Source-of-truth copy of the Firestore security rules (also pasted into the console). |
| `package.json` | Minimal: `"type":"module"` + `"test":"node --test"`. No dependencies. |

---

# Phase 0 — Hosting & file rename

### Task 0.1: Rename to `index.html`, add test harness, verify app still runs

**Files:**
- Rename: `treadmill-controller.html` → `index.html`
- Create: `package.json`

- [ ] **Step 1: Rename the file with git**

```bash
git mv treadmill-controller.html index.html
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "workouts",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Serve and verify the app is unchanged**

Run:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000/`. Expected: the app loads exactly as before (workouts, exercises, history all from `localStorage`). This is the pre-migration baseline.

- [ ] **Step 4: Commit**

```bash
git add index.html package.json
git commit -m "chore: rename app to index.html, add node:test harness"
```

- [ ] **Step 5: (Manual, one-time, outside code) Enable GitHub Pages**

After this branch is merged to `main`, the user enables Pages at
https://github.com/NikkiBouman/workouts/settings/pages → Source: "Deploy from a branch" → Branch `main` / `/ (root)` → Save. App will be live at `https://nikkibouman.github.io/workouts/`. No code change; note it in the PR description.

---

# Phase 1 — Cloud data layer

### Task 1.1: Firebase init + Google auth gate (no data yet)

**Files:**
- Create: `src/db.js`
- Create: `firestore.rules`
- Modify: `index.html` — add module glue block + login overlay + sign-out control; neutralize parse-time render (bottom init at lines 2650-2654).

**Interfaces:**
- Produces (from `src/db.js`): `onAuthChange(cb)`, `signIn()`, `signOut()`, `currentUser()`. Auth-only for this task; data API arrives in Task 1.2.
- Produces (in `index.html`): global hooks `window.APP = { defaults, defaultsVersion, onReady(user), onChange() }` that the module calls.

- [ ] **Step 1: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
(This is the exact text already published in the console; committing it keeps a source of truth.)

- [ ] **Step 2: Create `src/db.js` with Firebase init + auth only**

```js
// Firebase data layer for WorkoutCtrl. Public web config (not a secret).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
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
```

- [ ] **Step 3: Add the login overlay markup to `index.html`**

Immediately after `<body>` (before the app container), add:
```html
<div id="authGate" style="position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;flex-direction:column;gap:1rem;background:var(--bg);">
  <div class="logo-title" style="font-size:1.6rem;">Workout<span>Ctrl</span></div>
  <button id="authSignInBtn" class="btn btn-cyan">Inloggen met Google</button>
  <div id="authError" style="color:var(--muted);font-size:0.8rem;"></div>
</div>
```
Add a sign-out button in the header (next to the existing logo/title block, around line 404): a small `<button class="btn-icon" id="authSignOutBtn" title="Uitloggen">⎋</button>`.

- [ ] **Step 4: Neutralize parse-time rendering in `index.html`**

At the bottom init block (currently lines 2650-2654):
```js
applyTheme(localStorage.getItem('treadmill_theme') || 'light');
renderWorkoutList();
renderExerciseList();
renderHistory();
applySectionStates();
```
Replace with: keep the theme line, move the four render calls into a function and expose the hooks the module will call:
```js
applyTheme(localStorage.getItem('treadmill_theme') || 'light');

function renderAll() {
  renderWorkoutList();
  renderExerciseList();
  renderHistory();
  applySectionStates();
}

window.APP = {
  defaults: DEFAULT_EXERCISES,
  defaultsVersion: DEFAULTS_VERSION,
  onReady() { renderAll(); },   // extended in Task 1.2
  onChange() { renderAll(); },
};
```

- [ ] **Step 5: Add the module glue block to `index.html`**

Just before `</body>`, after the closing `</script>` of the classic app script, add:
```html
<script type="module">
  import * as DB from './src/db.js';
  window.DB = DB;

  const gate = document.getElementById('authGate');
  const signInBtn = document.getElementById('authSignInBtn');
  const signOutBtn = document.getElementById('authSignOutBtn');
  const errEl = document.getElementById('authError');

  signInBtn.addEventListener('click', () => {
    errEl.textContent = '';
    DB.signIn().catch(e => { errEl.textContent = e.message; });
  });
  signOutBtn.addEventListener('click', () => DB.signOut());

  DB.onAuthChange(async (user) => {
    if (!user) { gate.style.display = 'flex'; return; }
    gate.style.display = 'none';
    // Task 1.2 adds: await DB.start(user, window.APP.defaults, window.APP.defaultsVersion);
    window.APP.onReady(user);
  });
</script>
```

- [ ] **Step 6: Manual verification**

Serve (`python3 -m http.server 8000`), open `http://localhost:8000/`.
Expected: login overlay appears → click "Inloggen met Google" → Google popup → on success the overlay disappears and the app shows. Reload → stays signed in (no overlay). Click the ⎋ sign-out button → overlay returns.
If you see `auth/requests-from-referer-are-blocked`, loosen the API-key HTTP-referrer restriction (add `localhost:8000` / remove the restriction temporarily).

- [ ] **Step 7: Commit**

```bash
git add src/db.js firestore.rules index.html
git commit -m "feat: add Firebase init and Google auth gate"
```

---

### Task 1.2: Firestore data layer — caches, listeners, seeding; swap localStorage reads/writes

**Files:**
- Modify: `src/db.js` — add Firestore collections, caches, `start()/stop()`, read + write API, default seeding.
- Modify: `index.html` glue — `await DB.start(...)` before `onReady`; wire `DB.onChange(window.APP.onChange)`.
- Modify: `index.html` classic script — rewrite `loadWorkouts` (660), `saveWorkoutsData` (664), `loadExercises` (724-768), `saveExercises` (769), `loadHistory` (2621), `logWorkoutCompletion` (2625) bodies; and the mutation call sites in `deleteWorkout` (859), `deleteExercise` (865), `saveExercise` (983), `saveWorkout` (1261).

**Interfaces:**
- Produces (from `src/db.js`): `start(user, defaults, defaultsVersion): Promise<void>`, `stop()`, `onChange(cb)`, `exercises():Array`, `workouts():Array`, `sessions():Array`, `upsertExercise(ex)`, `deleteExercise(id)`, `upsertWorkout(w)`, `deleteWorkout(id)`, `addSession(session)`.
- Consumes: `window.APP.defaults` (= `DEFAULT_EXERCISES`), `window.APP.defaultsVersion` (= `DEFAULTS_VERSION`).

- [ ] **Step 1: Extend `src/db.js` imports**

Add to the firestore import in `src/db.js`:
```js
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, setDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
```

- [ ] **Step 2: Add caches, listeners, seeding and the data API to `src/db.js`**

```js
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
```

- [ ] **Step 3: Wire `DB.start` + `onChange` in the `index.html` glue block**

In the module block, change the auth handler to start the data layer before rendering:
```js
DB.onChange(() => window.APP.onChange());

DB.onAuthChange(async (user) => {
  if (!user) { DB.stop?.(); gate.style.display = 'flex'; return; }
  gate.style.display = 'none';
  await DB.start(user, window.APP.defaults, window.APP.defaultsVersion);
  window.APP.onReady(user);
});
```

- [ ] **Step 4: Rewrite the storage primitives in the classic script**

Replace `loadWorkouts` (line 660) body and delete `saveWorkoutsData` (line 664):
```js
function loadWorkouts() { return window.DB.workouts(); }
```
Replace `loadExercises` (lines 724-768, the whole function incl. seed logic) with:
```js
function loadExercises() { return window.DB.exercises(); }
```
Delete `saveExercises` (line 769). Keep `getExercise` (line 771) as-is (it calls `loadExercises()`).
Replace `loadHistory` (line 2621) body:
```js
function loadHistory() { return window.DB.sessions(); }
```
`DEFAULT_EXERCISES` and `DEFAULTS_VERSION` stay where they are (referenced via `window.APP.defaults`). `DEFAULTS_VERSION_KEY`/`SEEDED_KEY` and the `localStorage` seed code are gone with the old `loadExercises`.

- [ ] **Step 5: Rewrite the mutation call sites**

`deleteWorkout` (line 859) — replace the `saveWorkoutsData(loadWorkouts().filter(...))` line with:
```js
window.DB.deleteWorkout(id);
```
`deleteExercise` (line 865) — replace the `saveExercises(loadExercises().filter(...))` line with:
```js
window.DB.deleteExercise(id);
```
`saveExercise` (lines 964-983) — replace from `const list = loadExercises();` through `saveExercises(list);` with (build `ex`, then upsert the single item; preserve edit-merge):
```js
  const isCardio = exState.type === 'cardio';
  const isSetBased = exState.type === 'strength' || exState.type === 'stretch';
  const existing = editingExId ? loadExercises().find(e => e.id === editingExId) : null;
  const ex = {
    ...(existing || {}),
    id: editingExId || 'ex_' + Date.now(),
    name,
    imageUrl: document.getElementById('exImageUrl').value.trim(),
    type: exState.type,
    perSide: isSetBased ? exState.perSide : false,
    measureBy: isSetBased ? exState.measureBy : (isCardio && !exState.bleConnectable ? 'duration' : null),
    weighted: exState.type === 'strength' ? exState.weighted : false,
    bleConnectable: isCardio ? exState.bleConnectable : false,
  };
  window.DB.upsertExercise(ex);
```
`saveWorkout` (lines 1254-1261) — replace from `const list = loadWorkouts();` through `saveWorkoutsData(list);` with:
```js
  let w;
  if (editingId) {
    w = { ...loadWorkouts().find(x => x.id === editingId), id: editingId, name, entries: editorEntries };
    delete w.blocks;
  } else {
    w = { id: 'w_' + Date.now(), name, entries: editorEntries };
  }
  window.DB.upsertWorkout(w);
```

- [ ] **Step 6: Point `logWorkoutCompletion` at the new store (interim)**

`logWorkoutCompletion` (line 2625) currently builds a history entry and writes `localStorage`. For now, rewrite it to write a session via `DB.addSession` using the prescribed values, so Phase 1 is coherent (Task 2.2 replaces the *content* with actual values):
```js
function logWorkoutCompletion(workout) {
  const exercises = (workout.entries || []).map(e => {
    const ex = getExercise(e.exerciseId) || {};
    return {
      exerciseId: e.exerciseId, name: ex.name || '?', type: ex.type || '?',
      measureBy: ex.measureBy || null, weighted: !!ex.weighted,
      sets: Array.from({ length: e.sets || 1 }, () => ({
        weight: e.weight ?? null, reps: e.reps ?? null, duration: e.duration ?? null,
      })),
    };
  });
  window.DB.addSession({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    workoutId: workout.id, workoutName: workout.name,
    totalSeconds: Math.round((Date.now() - runStartTime) / 1000),
    exercises,
  });
}
```

- [ ] **Step 7: Update `renderHistory` for the new session shape**

`renderHistory` (lines 882-889) reads the old flat shape. Replace the `exList` builder with one that reads `e.sets`:
```js
    const exList = h.exercises.map(e => {
      const n = (e.sets || []).length;
      const top = (e.sets || []).reduce((m, s) => Math.max(m, s.weight || 0), 0);
      let detail = e.name || e.exerciseName || '?';
      if (n) detail += ` ${n}×`;
      if (top > 0) detail += ` ${top}kg`;
      return detail;
    }).join(' · ');
```

- [ ] **Step 8: Manual verification**

Serve + sign in. Expected:
1. First login seeds the default library → the exercise list shows all defaults from Firestore (check the Firestore console: `users/<uid>/exercises`).
2. Create a workout → it persists after reload (from Firestore, not localStorage — verify in console).
3. Complete a workout → a `sessions` doc appears; history list renders it.
4. Open the app in a second browser profile, sign in with the same Google account → the same workouts/exercises appear; create a workout in one window and watch it appear live in the other (onSnapshot).
5. Delete a workout → gone in both windows.

- [ ] **Step 9: Commit**

```bash
git add src/db.js index.html
git commit -m "feat: back exercises/workouts/sessions with Firestore + live sync"
```

---

### Task 1.3: Online/offline sync indicator

**Files:**
- Modify: `src/db.js` — export a tiny online-state helper.
- Modify: `index.html` — add an indicator element + wire `online`/`offline` events.

**Interfaces:**
- Produces: nothing new from `db.js` required; uses the browser `navigator.onLine` + `window` online/offline events.

- [ ] **Step 1: Add an indicator element to `index.html`**

Near the header, add:
```html
<div id="syncStatus" style="display:none;font-size:0.65rem;font-family:var(--mono);color:var(--amber);text-align:center;padding:0.2rem;">offline — wijzigingen worden later gesynct</div>
```

- [ ] **Step 2: Wire online/offline events in the module glue**

Add inside the `<script type="module">` block:
```js
const sync = document.getElementById('syncStatus');
const refreshSync = () => { sync.style.display = navigator.onLine ? 'none' : 'block'; };
window.addEventListener('online', refreshSync);
window.addEventListener('offline', refreshSync);
refreshSync();
```

- [ ] **Step 3: Manual verification**

In DevTools → Network → set "Offline". Expected: the indicator appears. Add a workout → it still saves (Firestore offline cache) and renders. Set back to "Online" → indicator disappears and the write syncs (verify in the Firestore console).

- [ ] **Step 4: Commit**

```bash
git add index.html src/db.js
git commit -m "feat: add offline sync indicator"
```

---

# Phase 2 — Capture actual weight/reps + logging controls

### Task 2.1: Editable per-set weight/reps during the run; accumulate `runLog`

**Files:**
- Modify: `index.html` — `startRunner` (line 1528), `updateStrengthUI` (line 1689), `strNextSet` (line 1769).

**Interfaces:**
- Produces: a module-scope `runLog` map `{ [exerciseId]: { exerciseId, sets: [{weight, reps, duration}] } }`, reset per run, appended on each completed set. Consumed by Task 2.2's `finishWorkout`.

- [ ] **Step 1: Initialize `runLog` in `startRunner`**

In `startRunner` (line 1528), right after `runEntryIndex = 0;` (line 1535), add:
```js
  window.runLog = {};
```
(Attach to `window` so Task 2.2 and 2.3 can read it from the same classic scope.)

- [ ] **Step 2: Render editable weight/reps inputs in `updateStrengthUI`**

`updateStrengthUI` (line 1689) currently sets `strDetail`/`strWeight` as text. Add editable controls. After the existing `strDetail`/`strWeight` updates, inject inputs (reuse the existing input styling from the editor):
```js
  const capWrap = document.getElementById('strCapture');
  if (ex.measureBy === 'reps') {
    capWrap.style.display = '';
    capWrap.innerHTML = `
      <label>Reps <input type="number" id="capReps" min="0" max="100" value="${entry.reps || 0}" style="width:64px;"></label>
      ${ex.weighted ? `<label>kg <input type="number" id="capWeight" min="0" max="500" step="0.5" value="${entry.weight || 0}" style="width:72px;"></label>` : ''}
    `;
  } else {
    capWrap.style.display = 'none';
  }
```
Add the container element `<div id="strCapture" class="row" style="gap:0.75rem;justify-content:center;margin-top:0.5rem;"></div>` into the strength runner screen markup (near `strWeight`/`strDetail`).

- [ ] **Step 3: Capture the shown values on set completion in `strNextSet`**

`strNextSet` (line 1769) runs when the user taps ✓. At the very top of the function (after the `entry`/`ex` guards, before advancing indices at line 1778), record the current set:
```js
  const repsEl = document.getElementById('capReps');
  const wEl = document.getElementById('capWeight');
  const set = {
    weight: wEl ? (+wEl.value || 0) : (ex.weighted ? (entry.weight || 0) : null),
    reps: ex.measureBy === 'reps' ? (repsEl ? (+repsEl.value || 0) : (entry.reps || 0)) : null,
    duration: ex.measureBy === 'duration' ? (entry.duration || 0) : null,
  };
  if (!window.runLog[entry.exerciseId]) {
    window.runLog[entry.exerciseId] = {
      exerciseId: entry.exerciseId, name: ex.name, type: ex.type,
      measureBy: ex.measureBy || null, weighted: !!ex.weighted, sets: [],
    };
  }
  window.runLog[entry.exerciseId].sets.push(set);
```
(For `perSide` exercises each side's ✓ records a set — matches the per-side set loop; acceptable per spec "one weight/reps applies to both sides".)

- [ ] **Step 4: Pre-fill next set from the previous set this session**

Still in `strNextSet`, after capturing, when it continues to the next set of the same exercise (the branch that calls `updateStrengthUI(entry, ex)` at line 1789), carry the just-entered values forward by writing them onto `entry` so the inputs pre-fill:
```js
  if (set.reps != null) entry.reps = set.reps;
  if (set.weight != null) entry.weight = set.weight;
```
(Place this right before `updateStrengthUI(entry, ex);`. It only mutates the in-memory run copy, not the stored workout.)

- [ ] **Step 5: Manual verification**

Serve + sign in, run a strength workout with ≥2 sets. On set 1 change the weight, tap ✓. Expected: set 2 pre-fills the new weight. In the console, after a few sets, inspect `window.runLog` → it contains per-exercise `sets` arrays with the values you entered.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: capture actual per-set weight/reps during a run"
```

---

### Task 2.2: Pre-start logging controls + write actual sessions on finish

**Files:**
- Modify: `index.html` — `openPreview` (line 1373) add controls; `startRunner` (line 1528) snapshot the log plan; `finishWorkout` (line 1807) write from `runLog`.

**Interfaces:**
- Consumes: `window.runLog` (Task 2.1), the canonical session shape (Global Constraints).
- Produces: `window.logPlan = { master: boolean, perExercise: { [exerciseId]: boolean } }`.

- [ ] **Step 1: Add the logging controls to the preview screen**

In `openPreview` (line 1373), after `previewStats` is set (line 1389), render controls into a new container `<div id="previewLogControls"></div>` (add this element to the preview markup):
```js
  const logCtl = document.getElementById('previewLogControls');
  logCtl.innerHTML = `
    <label style="display:flex;align-items:center;gap:0.5rem;font-weight:700;">
      <input type="checkbox" id="logMaster" checked> Workout loggen
    </label>
    <div id="logPerExercise" style="margin-top:0.4rem;display:flex;flex-direction:column;gap:0.25rem;">
      ${entries.map(e => {
        const ex = getExercise(e.exerciseId);
        return `<label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:var(--muted);">
          <input type="checkbox" class="logEx" data-id="${e.exerciseId}" checked> ${esc(ex?.name || '?')}
        </label>`;
      }).join('')}
    </div>`;
  document.getElementById('logMaster').addEventListener('change', (ev) => {
    document.getElementById('logPerExercise').style.opacity = ev.target.checked ? '1' : '0.4';
    document.querySelectorAll('.logEx').forEach(c => c.disabled = !ev.target.checked);
  });
```

- [ ] **Step 2: Snapshot the log plan when the run starts**

In `startRunner` (line 1528), after `window.runLog = {};` (Task 2.1 Step 1), capture the checkbox state:
```js
  window.logPlan = {
    master: document.getElementById('logMaster')?.checked ?? true,
    perExercise: {},
  };
  document.querySelectorAll('.logEx').forEach(c => { window.logPlan.perExercise[c.dataset.id] = c.checked; });
```

- [ ] **Step 3: Replace history logging in `finishWorkout`**

`finishWorkout` (lines 1814-1816) currently does:
```js
  const raw = loadWorkouts().find(w => w.id === previewWorkoutId);
  if (raw) logWorkoutCompletion(migrateWorkout(raw));
```
Replace with a build-from-`runLog` version honoring `logPlan`:
```js
  const raw = loadWorkouts().find(w => w.id === previewWorkoutId);
  const plan = window.logPlan || { master: true, perExercise: {} };
  if (raw && plan.master) {
    const exercises = Object.values(window.runLog || {})
      .filter(r => plan.perExercise[r.exerciseId] !== false && r.sets.length);
    if (exercises.length) {
      window.DB.addSession({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        workoutId: raw.id, workoutName: raw.name,
        totalSeconds: Math.round((Date.now() - runStartTime) / 1000),
        exercises,
      });
    }
  }
```
`logWorkoutCompletion` (line 2625) is now unused — delete it.

- [ ] **Step 4: Manual verification**

Run a workout with all boxes checked → one `sessions` doc with the actual per-set values you entered (verify in the Firestore console and in the history list). Run again, uncheck one exercise → that exercise is absent from the session. Run with "Workout loggen" off → no `sessions` doc is written.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: pre-start logging controls; log actual sessions on finish"
```

---

### Task 2.3: "Als standaard opslaan" — update the workout's prescribed weight from the session

**Files:**
- Modify: `index.html` — `finishWorkout` (line 1807), completion screen (lines 1831-1834+).

**Interfaces:**
- Consumes: `window.runLog`, `previewWorkoutId`, `window.DB.upsertWorkout`.

- [ ] **Step 1: Compute which exercises changed vs the plan, on the completion screen**

In `finishWorkout`, where the completion screen `actions.innerHTML` is built (around line 1833), compute changed exercises (topset differs from the plan) and, if any, render a button:
```js
  const wkForUpdate = loadWorkouts().find(w => w.id === previewWorkoutId);
  const changed = [];
  if (wkForUpdate) {
    for (const r of Object.values(window.runLog || {})) {
      const topW = r.sets.reduce((m, s) => Math.max(m, s.weight || 0), 0);
      const topReps = r.sets.reduce((m, s) => Math.max(m, s.reps || 0), 0);
      const entry = (wkForUpdate.entries || []).find(e => e.exerciseId === r.exerciseId);
      if (entry && r.weighted && topW && topW !== (entry.weight || 0)) {
        changed.push({ exerciseId: r.exerciseId, name: r.name, topW, topReps });
      }
    }
  }
  window._pendingPlanUpdate = { workoutId: previewWorkoutId, changed };
```
Append to the completion `actions.innerHTML` when `changed.length`:
```js
    ${changed.length ? `<button class="btn btn-cyan btn-sm" onclick="applyPlanUpdate()">Nieuwe gewichten als standaard opslaan (${changed.length})</button>` : ''}
```

- [ ] **Step 2: Add `applyPlanUpdate`**

Add a new function in the classic script:
```js
function applyPlanUpdate() {
  const pu = window._pendingPlanUpdate;
  if (!pu) return;
  const w = loadWorkouts().find(x => x.id === pu.workoutId);
  if (!w) return;
  for (const c of pu.changed) {
    const entry = (w.entries || []).find(e => e.exerciseId === c.exerciseId);
    if (entry) { entry.weight = c.topW; if (c.topReps) entry.reps = c.topReps; }
  }
  window.DB.upsertWorkout(w);
  window._pendingPlanUpdate = null;
  alert('Workout bijgewerkt met je nieuwe gewichten.');
}
```

- [ ] **Step 3: Manual verification**

Run a weighted workout, increase a weight during a set, finish. Expected: the completion screen shows "Nieuwe gewichten als standaard opslaan". Click it → open the workout editor → the prescribed weight is updated to your topset. Run again without clicking → the workout's prescribed weight is unchanged (session still logged the actual value).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: optionally promote session topset to workout default weight"
```

---

# Phase 3 — Per-exercise progress view + chart

### Task 3.1: Pure aggregation functions + unit tests (TDD)

**Files:**
- Create: `src/progress.js`
- Create: `test/progress.test.mjs`

**Interfaces:**
- Produces: `metricForExercise(ex) -> 'weight'|'reps'|'duration'`; `seriesForExercise(sessions, exerciseId) -> [{date, topWeight, volume, maxReps, maxDuration}]` (sorted date ascending); `statsForExercise(sessions, exerciseId) -> {count, lastDate, prWeight, currentWeight}`.
- Consumes: the canonical session shape.

- [ ] **Step 1: Write the failing tests**

Create `test/progress.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/progress.test.mjs`
Expected: FAIL — `Cannot find module '../src/progress.js'`.

- [ ] **Step 3: Implement `src/progress.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/progress.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Expose `Progress` to the app**

In the `index.html` module glue block, add:
```js
import * as Progress from './src/progress.js';
window.Progress = Progress;
```

- [ ] **Step 6: Commit**

```bash
git add src/progress.js test/progress.test.mjs index.html
git commit -m "feat: add tested pure progress-aggregation functions"
```

---

### Task 3.2: Exercise-detail view (header, stats, recent sessions)

**Files:**
- Modify: `index.html` — add a `viewExercise` section; make exercise-list items open it (`renderExerciseList`, line 837); add `openExerciseDetail(id)` + `renderExerciseDetail()`.

**Interfaces:**
- Consumes: `window.Progress.statsForExercise`, `window.DB.sessions()`, `getExercise(id)`.
- Produces: `openExerciseDetail(id)`, `renderExerciseDetail(id)`.

- [ ] **Step 1: Add the `viewExercise` markup**

Add a new view section alongside the other `view*` sections:
```html
<div id="viewExercise" class="view" style="display:none;">
  <button class="btn btn-sm" onclick="showView('viewHome')">← Terug</button>
  <div id="exDetailHeader"></div>
  <div id="exDetailStats" class="row" style="gap:1rem;flex-wrap:wrap;margin:0.75rem 0;"></div>
  <div id="exDetailChart"></div>
  <h3 style="margin-top:1rem;">Recente sessies</h3>
  <div id="exDetailSessions"></div>
</div>
```

- [ ] **Step 2: Make exercise-list rows open the detail view**

In `renderExerciseList` (line 837), add an `onclick="openExerciseDetail('${ex.id}')"` to the row container (keep the existing edit/delete buttons using `event.stopPropagation()` as the delete button already does at line 854).

- [ ] **Step 3: Add `openExerciseDetail` + `renderExerciseDetail`**

```js
let detailExerciseId = null;
function openExerciseDetail(id) { detailExerciseId = id; renderExerciseDetail(id); showView('viewExercise'); }

function renderExerciseDetail(id) {
  const ex = getExercise(id);
  if (!ex) return;
  const sessions = loadHistory();
  const st = window.Progress.statsForExercise(sessions, id);

  document.getElementById('exDetailHeader').innerHTML = `
    <div class="row" style="gap:0.75rem;align-items:center;">
      ${ex.imageUrl ? `<img src="${ex.imageUrl}" style="width:56px;height:56px;object-fit:cover;border-radius:var(--r-sm);">` : ''}
      <div><div style="font-weight:700;font-size:1.1rem;">${esc(ex.name)}</div>
      <div style="color:var(--muted);font-size:0.8rem;">${exIcon(ex)} ${ex.type}</div></div>
    </div>`;

  const fmtDate = d => d ? new Date(d).toLocaleDateString('nl-NL', { day:'numeric', month:'short', year:'numeric' }) : '—';
  document.getElementById('exDetailStats').innerHTML = `
    <div><div style="font-size:1.4rem;font-weight:700;">${st.count}</div><div style="font-size:0.7rem;color:var(--muted);">keer gedaan</div></div>
    <div><div style="font-size:1.4rem;font-weight:700;">${st.prWeight || '—'}${st.prWeight ? ' kg' : ''}</div><div style="font-size:0.7rem;color:var(--muted);">PR</div></div>
    <div><div style="font-size:1.4rem;font-weight:700;">${st.currentWeight || '—'}${st.currentWeight ? ' kg' : ''}</div><div style="font-size:0.7rem;color:var(--muted);">huidig</div></div>
    <div><div style="font-size:0.9rem;font-weight:700;">${fmtDate(st.lastDate)}</div><div style="font-size:0.7rem;color:var(--muted);">laatst</div></div>`;

  // Recent sessions for this exercise
  const rows = sessions
    .filter(s => (s.exercises || []).some(e => e.exerciseId === id))
    .slice(0, 15)
    .map(s => {
      const e = s.exercises.find(x => x.exerciseId === id);
      const setStr = (e.sets || []).map(x =>
        x.duration != null ? `${x.duration}s` : `${x.reps || 0}${x.weight ? '×' + x.weight + 'kg' : ''}`
      ).join(', ');
      return `<div style="padding:0.4rem 0.6rem;background:var(--s1);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:0.3rem;font-size:0.8rem;">
        <span style="font-family:var(--mono);color:var(--muted);">${fmtDate(s.date)}</span> — ${esc(setStr)}
      </div>`;
    }).join('');
  document.getElementById('exDetailSessions').innerHTML = rows ||
    `<div style="color:var(--muted);font-size:0.85rem;">Nog geen sessies gelogd.</div>`;

  renderProgressChart(id);   // Task 3.3
}
```
For this task, stub `renderProgressChart`:
```js
function renderProgressChart() { /* implemented in Task 3.3 */ }
```

- [ ] **Step 4: Re-render the detail view on live data changes**

So cross-device updates refresh an open detail view, extend `window.APP.onChange`:
```js
  onChange() { renderAll(); if (document.getElementById('viewExercise').style.display !== 'none' && detailExerciseId) renderExerciseDetail(detailExerciseId); },
```

- [ ] **Step 5: Manual verification**

Serve + sign in. Complete a couple of workouts with a weighted exercise at different weights. Click that exercise in the list → the detail view opens with correct "keer gedaan", PR, current, last date, and a recent-sessions list showing your actual sets.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: exercise detail view with stats and recent sessions"
```

---

### Task 3.3: Hand-rolled SVG progress chart (+ weight/volume toggle)

**Files:**
- Modify: `index.html` — implement `renderProgressChart(id)` using `window.Progress.seriesForExercise` + `window.Progress.metricForExercise`, styled with the existing `chartColors()` helper (used by the cardio preview chart).

**Interfaces:**
- Consumes: `window.Progress.seriesForExercise`, `window.Progress.metricForExercise`, `chartColors()`, `getExercise(id)`.

- [ ] **Step 1: Implement `renderProgressChart`**

Replace the Task 3.2 stub with:
```js
let chartMode = 'weight'; // 'weight' | 'volume' (only meaningful when metric === 'weight')

function renderProgressChart(id) {
  const ex = getExercise(id);
  const el = document.getElementById('exDetailChart');
  if (!ex || !el) return;
  const series = window.Progress.seriesForExercise(loadHistory(), id);
  const metric = window.Progress.metricForExercise(ex);

  if (series.length < 2) {
    el.innerHTML = `<div style="color:var(--muted);font-size:0.85rem;padding:0.5rem 0;">Minstens 2 sessies nodig voor een grafiek.</div>`;
    return;
  }

  const pick = (p) => {
    if (metric === 'weight') return chartMode === 'volume' ? p.volume : p.topWeight;
    if (metric === 'duration') return p.maxDuration;
    return p.maxReps;
  };
  const unit = metric === 'weight' ? (chartMode === 'volume' ? '' : 'kg') : (metric === 'duration' ? 's' : 'reps');

  const cc = chartColors();
  const cW = 380, cH = 160, padL = 34, padR = 10, padT = 12, padB = 24;
  const plotW = cW - padL - padR, plotH = cH - padT - padB;
  const vals = series.map(pick);
  const yMax = Math.max(1, Math.ceil(Math.max(...vals) * 1.1));
  const x = i => padL + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = v => padT + plotH - (v / yMax) * plotH;

  let svg = `<svg viewBox="0 0 ${cW} ${cH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">`;
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = (yMax / ySteps) * i, yy = y(val);
    svg += `<line x1="${padL}" y1="${yy}" x2="${padL + plotW}" y2="${yy}" stroke="${cc.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 4}" y="${yy + 3}" fill="${cc.label}" font-size="7" font-family="var(--mono)" text-anchor="end">${Math.round(val)}</text>`;
  }
  const line = series.map((p, i) => `${x(i)},${y(pick(p))}`).join(' ');
  svg += `<polyline points="${line}" fill="none" stroke="var(--cyan)" stroke-width="2"/>`;
  series.forEach((p, i) => {
    const v = pick(p);
    svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--cyan)"><title>${new Date(p.date).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}: ${v}${unit}</title></circle>`;
  });
  // x labels: first and last date
  const dLabel = d => new Date(d).toLocaleDateString('nl-NL', { day:'numeric', month:'short' });
  svg += `<text x="${padL}" y="${cH - 6}" fill="${cc.label}" font-size="7" font-family="var(--mono)">${dLabel(series[0].date)}</text>`;
  svg += `<text x="${padL + plotW}" y="${cH - 6}" fill="${cc.label}" font-size="7" font-family="var(--mono)" text-anchor="end">${dLabel(series[series.length-1].date)}</text>`;
  svg += '</svg>';

  const toggle = metric === 'weight'
    ? `<div class="row" style="gap:0.5rem;margin-bottom:0.3rem;">
         <button class="btn btn-sm ${chartMode==='weight'?'btn-cyan':''}" onclick="setChartMode('weight')">Gewicht</button>
         <button class="btn btn-sm ${chartMode==='volume'?'btn-cyan':''}" onclick="setChartMode('volume')">Volume</button>
       </div>` : '';
  el.innerHTML = toggle + svg;
}

function setChartMode(m) { chartMode = m; renderProgressChart(detailExerciseId); }
```

- [ ] **Step 2: Manual verification**

In the detail view of a weighted exercise done ≥2 times at different weights: a line chart renders in the app's SVG style; tapping a point shows the date+value (SVG `<title>` tooltip); "Gewicht"/"Volume" toggle switches the series. For a duration-based stretch, the chart plots seconds and shows no weight/volume toggle. With <2 sessions, the "Minstens 2 sessies nodig" message shows.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: SVG progress chart with weight/volume toggle"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §4.1 Hosting / index.html | 0.1 |
| §4.2 Firebase no-build SDK | 1.1 |
| §4.3 Google auth + rules | 1.1 (`firestore.rules`, auth gate) |
| §4.4 In-memory cache data layer | 1.2 |
| §5 Firestore model + `meta/flags` | 1.2 |
| §5.1 Seed defaults, no import | 1.2 (`seedDefaults`) |
| §6 Per-set capture | 2.1 |
| §7 Logging controls (master + per-exercise) | 2.2 |
| §8 Plan-weight update (topset) | 2.3 |
| §9 Progress view + SVG chart + metric rule | 3.1 / 3.2 / 3.3 |
| §10 Offline + sync indicator + seed idempotency | 1.2 (`seedDefaults` flag), 1.3 (indicator) |
| §11 Pure functions + unit tests | 3.1 |
| §12 Phases | all |

No uncovered requirement. Cardio charting is intentionally minimal (duration), per spec §2 non-goals / §9 low priority.

**2. Placeholder scan:** The only forward reference is the explicit `renderProgressChart` stub in Task 3.2, resolved in Task 3.3 — called out in both tasks, not a placeholder. No TBD/"handle edge cases"/"write tests for the above".

**3. Type consistency:** The session shape in Global Constraints is produced identically by Task 1.2 Step 6 and Task 2.2 Step 3, and consumed by Task 3.1 (`sets[].{weight,reps,duration}`, `exercises[].{exerciseId,weighted,measureBy}`). `window.runLog` entry shape (Task 2.1 Step 3) matches the session `exercises[]` element exactly (same keys), so Task 2.2 can use `Object.values(runLog)` directly. `DB` method names (`exercises/workouts/sessions/upsertExercise/deleteExercise/upsertWorkout/deleteWorkout/addSession/start/stop/onChange/onAuthChange/signIn/signOut/currentUser`) are defined in Tasks 1.1–1.2 and used consistently thereafter. `Progress` names (`metricForExercise/seriesForExercise/statsForExercise`) match between `src/progress.js`, the tests, and the view code.
