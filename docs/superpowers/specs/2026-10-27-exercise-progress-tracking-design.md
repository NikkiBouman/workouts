# Exercise Progress Tracking — Design

- **Date:** 2026-10-27
- **Status:** Approved for planning
- **App:** `treadmill-controller.html` (WorkoutCtrl) — single-file vanilla-JS web app, no build step.

## 1. Context & current state

The app is one static HTML file (~2600 lines) with all data in `localStorage`:

- `treadmill_exercises` — exercise library. Schema (after commit `f222803`): `{ id, name, imageUrl, type, perSide, measureBy, weighted, bleConnectable }`, where `type ∈ {cardio, strength, stretch}` is the **category** ("wat je doet"), and execution is driven by `measureBy ∈ {reps, duration, null}`, `weighted`, `perSide`, `bleConnectable`.
- `treadmill_workouts` — workout definitions: `{ id, name, entries:[{ exerciseId, sets, reps, duration, weight }] }`.
- `treadmill_history` — completed workouts: `{ date, workoutName, totalSeconds, exercises:[{ exerciseName, exerciseId, type, sets, reps, duration, weight }] }` (last 100).
- Plus `treadmill_defaults_version`, `treadmill_seeded_defaults`, `treadmill_collapsed`, `treadmill_speed_unit`, `treadmill_dur_unit`, `treadmill_theme`.

**Two problems this design solves:**

1. **No multi-device access.** `localStorage` is per-browser/per-device. The user wants their data on every device.
2. **History logs the *prescribed* plan, not what was actually done.** `finishWorkout()` calls `logWorkoutCompletion(migrateWorkout(raw))`, which copies the workout's prescribed `sets/reps/weight` into history. During a session there is no way to record the *actual* weight/reps performed, so every completion of the same workout logs identical numbers. A progress chart of that data is a flat line.

## 2. Goals & non-goals

**Goals**
- Data synced across devices, private to the user, usable offline (gym Wi-Fi).
- Record the **actual** per-set weight and reps performed during a session.
- Per-exercise progress view with a chart, reachable by clicking an exercise.
- Control which sessions/exercises count toward progress.

**Non-goals (YAGNI for now)**
- No migration/import of existing `localStorage` data (user explicitly declined). Default exercise library is still seeded fresh into the cloud.
- No social/multi-user features, sharing, or coaching.
- No per-side (left/right) *separate* weight logging — one weight/reps per set applies to both sides of a `perSide` exercise.
- Cardio progress charting is low priority (duration only; pace/distance later).

## 3. Locked decisions

| Topic | Decision |
|---|---|
| Backend | **Firebase Firestore + Firebase Auth** |
| Login | **Google sign-in** (one tap, no password) |
| Hosting | **GitHub Pages**, repo rename entry to `index.html` |
| Chart | **Hand-rolled inline SVG**, matching the app's existing cardio chart idiom (`chartColors()`), zero dependencies |
| Offline | Firestore offline persistence (`persistentLocalCache`) |
| Data granularity | Per-set `{weight, reps}` (or `{duration}`) |
| Logging control | Master "Workout loggen" toggle (default ON) **and** per-exercise checkboxes (default ON) |
| Plan-weight update | Keep as a **separate** optional action ("als standaard opslaan" → topset becomes workout's prescribed weight) |

## 4. Architecture

### 4.1 Hosting & secure context
- Enable GitHub Pages on `main` (repo is already public). Rename the entry file to `index.html` so the URL is `https://nikkibouman.github.io/workouts/`.
- HTTPS keeps Web Bluetooth (treadmill FTMS control) working.
- Firebase web config lives in the committed HTML — web API keys are public identifiers, not secrets; security is enforced by Firestore rules + auth.

### 4.2 Firebase integration without a build step
- Load the Firebase **modular** SDK via CDN inside one `<script type="module">` block: `firebase-app`, `firebase-auth`, `firebase-firestore`.
- That module exposes a small `window.DB` API consumed by the existing non-module inline script.
- Firestore initialized with `persistentLocalCache` (offline reads/writes, auto-sync).

### 4.3 Auth
- On load: not signed in → a login gate (overlay with a single "Inloggen met Google" button). Signed in → all data scoped under the user's `uid`.
- Firestore security rules:
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

### 4.4 Data-layer strategy (keeps the refactor bounded)
The existing code calls `loadExercises()` / `loadWorkouts()` / `loadHistory()` **synchronously** in many places. We do **not** make everything async. Instead:

- After auth, hydrate **in-memory caches** for exercises, workouts and sessions from Firestore (instant on repeat visits thanks to the offline cache).
- `load*()` read from the in-memory caches synchronously → minimal changes at call sites.
- Writes update the in-memory cache **and** push to Firestore (offline-queued).
- `onSnapshot` listeners keep the caches fresh, giving cross-device live updates.

Only the bodies of `loadExercises/saveExercises/loadWorkouts/saveWorkoutsData/loadHistory/logWorkoutCompletion` and the seed logic change; the rest of the app keeps calling the same functions.

## 5. Firestore data model

All under `users/{uid}`:

- `meta/flags` → `{ seededDefaultsVersion: <number> }` (replaces `treadmill_defaults_version` + `treadmill_seeded_defaults`; makes seeding idempotent and re-syncable).
- `exercises/{exerciseId}` → the full exercise object as today (`name, imageUrl, type, perSide, measureBy, weighted, bleConnectable`). Schema-flexible: any extra fields are stored and round-tripped.
- `workouts/{workoutId}` → `{ name, entries:[{ exerciseId, sets, reps, duration, weight }], order? }`.
- `sessions/{sessionId}` → a completed session with **actual** values:
  ```
  {
    date: <timestamp>,
    workoutId, workoutName,
    totalSeconds,
    exercises: [
      { exerciseId, name, type, measureBy, weighted,
        sets: [ { weight?, reps?, duration? }, ... ] }
    ]
  }
  ```
  Only logged exercises appear (see §7). Replaces `treadmill_history`.

**Progress data is not stored separately.** The exercise-detail view loads all `sessions` (cached/offline) and aggregates the per-exercise time series in memory. Adequate for personal scale (hundreds of sessions); a per-exercise subcollection is the scale-up path if ever needed.

### 5.1 Seeding defaults (no user-data import)
- On first run per user (or when `DEFAULTS_VERSION` increases), seed/re-sync `DEFAULT_EXERCISES` into `users/{uid}/exercises`, mirroring today's `DEFAULTS_VERSION` re-sync behaviour. Track via `meta/flags.seededDefaultsVersion`.
- No import of the user's existing local workouts/history.

## 6. Capture: actual weight & reps per set

- In the strength/stretch run screen, each set shows **editable weight and reps** controls (± steppers), pre-filled with the prescribed value (or the previous set's value this session, to reduce tapping).
- When the user taps ✓ to complete a set, the shown `{weight, reps}` (or `{duration}` for duration-based) is appended to an in-memory `runLog` for that exercise.
- `finishWorkout()` writes a `sessions` doc from `runLog` (actual values) instead of the prescribed workout — subject to the logging controls in §7.

For `perSide` exercises, one weight/reps applies to both sides (left and right sets record the same entered value).

## 7. Logging controls

**Before starting** (on the preview/start screen):
- **Master toggle "Workout loggen"** — default **ON**. OFF → nothing from this session is written to the DB.
- **Per-exercise checkboxes** — default all **ON**, shown only while the master is ON. An unchecked exercise is still performed in the flow but is **not** logged and does not count toward progress.

**At finish:** the `sessions` doc includes only exercises that are logged (master ON and the exercise checked). If the master is OFF, no `sessions` doc is written.

## 8. Plan-weight update (separate, optional)

- Independent of logging. When a weight/reps differs from the workout's prescribed value, an **"Als standaard opslaan"** action lets the user set the workout entry's prescribed `weight`/`reps` to the session's **topset** (heaviest set). Updates the `workouts` doc directly.
- Works regardless of the logging toggles.

## 9. Progress view + chart

Clicking an exercise opens a new **exercise-detail view**:

- **Header:** image + name + category (`type`).
- **Key stats:** times done (session count), last done (date), PR (max weight ever), current working weight (latest session topset).
- **Chart (hand-rolled SVG line, x = date):** drawn in the same style as the existing cardio preview chart (theme-aware via `chartColors()`), zero dependencies. Line + axes + points, with a tap-to-read tooltip. Metric chosen by execution attributes, not category —
  - `weighted` → **topset weight** per session, with a toggle to **total volume** (Σ sets×reps×weight);
  - `measureBy = 'reps'` and not weighted → **reps** per session;
  - `measureBy = 'duration'` → **duration** per session;
  - cardio → duration (low priority).
- **Recent sessions list:** e.g. "12 okt — 3×10 @ 12 kg".
- Exercise list items on the home view get a click target to open this view, keeping existing edit/delete actions.

## 10. Error handling & offline

- Offline: Firestore cache serves reads/writes and queues sync. Show a subtle "offline — synct later" indicator.
- Not signed in → login gate.
- Hard write failure → toast; the SDK retries transient failures.
- Seeding is idempotent via `meta/flags.seededDefaultsVersion`.

## 11. Testing

- No test framework exists. Extract the **aggregation/progress-computation** as pure functions (`sessions → per-exercise series`, PR, counts, volume) and unit-test them (TDD per the tdd skill) — this is where logic bugs hide.
- Firebase/UI integration is verified manually: sign in on two devices, complete a workout, confirm sync and that the chart reflects actual values; verify logging toggles exclude the right data; verify offline behaviour.

## 12. Build phases (one spec, phased plan)

- **Phase 0 — Hosting:** enable GitHub Pages, rename entry to `index.html`. Multi-device access works at all.
- **Phase 1 — Cloud data layer:** Firebase + Google auth + login gate + Firestore data layer (in-memory cache + `onSnapshot` listeners) + seed defaults. Replace `localStorage` reads/writes; keep offline cache.
- **Phase 2 — Capture & logging:** editable per-set weight/reps, `runLog`, master + per-exercise logging toggles, write `sessions` from actual values, "als standaard opslaan" plan-weight update.
- **Phase 3 — Progress view:** exercise-detail view + hand-rolled SVG chart + key stats + recent-sessions list.

Each phase is independently testable and shippable.

## 13. Risks & open points

- **Firebase project setup** (console): create project, enable Google auth provider, publish Firestore rules, add authorized domain `nikkibouman.github.io`. One-time manual steps outside the codebase.
- **Chart metric defaults** may need tuning once real data exists (topset vs volume as the primary line).
- **iOS Safari** has no Web Bluetooth — an existing constraint, unchanged here; the rest of the app (logging, charts) works on iOS.
