# Settings Screen + Contextual Connection Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home-screen moon (theme) icon with a gear that opens a new full-screen **Instellingen** view holding the dark/light toggle plus treadmill + HR connection; delete the always-on global connection bars and instead show connection bars contextually (Instellingen always; the Start-Workout preview and the live runner get an HR bar always and a treadmill bar only when the workout contains a run).

**Architecture:** Single HTML file (`index.html`) with one big inline classic `<script>` (functions like `showView`, `toggleTheme`, `bleConnect`, `hrConnect`, `updateConnUI`, `updateHrUI`, `renderPreview`, `startRunner`) plus a `<script type="module">` that wires `src/*.js`. All work here is DOM/markup + a few JS edits in the inline script — **no new modules, no new logic worth a unit test** (the only new computation is a one-line `.some(...)` over existing `usesTreadmill`). The repo convention is that pure logic lives in `src/*.js` with `node --test`, and DOM wiring in `index.html` is verified in the browser — this plan follows that: each task is verified in the browser (demo mode + console), which is the real gate.

**Tech Stack:** Vanilla JS (no framework, no bundler), ES-module imports from `./src/*.js` (so the page must be served over HTTP, not `file://`), inline SVG charts, CSS custom properties for theming.

## Global Constraints

- **No build step.** Serve statically over HTTP. Verify at `http://localhost:8000/index.html?demo` after `python3 -m http.server 8000` (run from the repo root). Demo mode (`?demo`) swaps Firebase for the in-memory `src/demo-db.js` — no login, seeded data.
- **UI copy is Dutch** (match the app, e.g. "Instellingen", "Loopband", "Niet verbonden", "Geen HR monitor").
- **Commits are headless-unfriendly here.** Local commits must use `git commit --no-gpg-sign` (1Password signing agent is unavailable headlessly). Do NOT push — the user pushes by hand.
- **Connection-bar sync classes (defined in Task 1, used in Tasks 2/4/5 — keep identical):**
  - Treadmill row: `.js-conn-dot`, `.js-conn-label`, `.js-btn-conn`, `.js-btn-disc`
  - HR row: `.js-hr-dot`, `.js-hr-label`, `.js-btn-hr-conn`, `.js-btn-hr-disc`
- **Bars are static markup, permanently in the DOM** in each host view. The class-based updaters (`updateConnUI`/`updateHrUI`/live-BPM) touch *every* matching instance, so all visible bars stay in sync with zero re-render-on-open logic. The only per-view dynamic bit is toggling the treadmill row's visibility on `hasRun`.
- **`hasRun` definition (used in Tasks 4 & 5 — keep identical):** a workout has a run session when any entry's exercise satisfies the existing `usesTreadmill(ex)` (i.e. `ex.bleConnectable` truthy). Compute as:
  ```js
  const hasRun = (w.entries || []).some(e => usesTreadmill(getExercise(e.exerciseId)));
  ```
- **Demo workouts for verification:** `"Running program: Phase 1"` contains `ex_hardlopen` (`bleConnectable:true`) → `hasRun === true`. `"Krachttraining (demo · beter dan vorige keer)"` is strength-only → `hasRun === false`.

---

## Task 1: Class-sync refactor of the connection bars (no behavior change)

Convert the two existing global bars to carry the sync classes, and rewrite the three update sites to target *all* instances by class. After this task the app behaves exactly as before (bars still global), but the plumbing now supports multiple bar instances.

**Files:**
- Modify: `index.html:406-419` (the `#globalConn` markup — add sync classes)
- Modify: `index.html:3105-3110` (`updateConnUI`)
- Modify: `index.html:3446-3450` (`updateHrUI` — only the four bar lines)
- Modify: `index.html:3478` (live-BPM write inside `onHeartRate`)

**Interfaces:**
- Produces: `updateConnUI(connected)` and `updateHrUI(connected)` keep the same signatures and call sites; they now update every `.js-*` instance. The sync classes listed in Global Constraints become the contract for Tasks 2/4/5.

- [ ] **Step 1: Add sync classes to the existing global bars**

In `index.html`, change the `#globalConn` inner markup (keep the existing `id`s for now; they're deleted in Task 3) so each element also carries its sync class:

```html
<div id="globalConn">
  <div class="conn">
    <div class="conn-dot js-conn-dot" id="dot"></div>
    <span class="conn-label js-conn-label" id="connLabel">Niet verbonden</span>
    <button class="btn btn-cyan btn-sm js-btn-conn" id="btnConn" onclick="bleConnect()">Loopband</button>
    <button class="btn btn-ghost btn-sm hidden js-btn-disc" id="btnDisc" onclick="bleDisconnect()">Verbreek</button>
  </div>
  <div class="conn">
    <div class="conn-dot js-hr-dot" id="hrDot"></div>
    <span class="conn-label js-hr-label" id="hrLabel">Geen HR monitor</span>
    <button class="btn btn-sm js-btn-hr-conn" id="btnHrConn" onclick="hrConnect()" style="background:#e74c3c;color:#fff;">❤ HR Verbind</button>
    <button class="btn btn-ghost btn-sm hidden js-btn-hr-disc" id="btnHrDisc" onclick="hrDisconnect()">Verbreek</button>
  </div>
</div>
```

- [ ] **Step 2: Rewrite `updateConnUI` to target all treadmill-bar instances**

Replace the body of `updateConnUI` (`index.html:3105-3110`) with:

```js
function updateConnUI(connected) {
  document.querySelectorAll('.js-conn-dot').forEach(el => el.classList.toggle('on', connected));
  document.querySelectorAll('.js-conn-label').forEach(el => el.textContent = connected ? (bleDevice?.name || 'Verbonden') : 'Niet verbonden');
  document.querySelectorAll('.js-btn-conn').forEach(el => el.classList.toggle('hidden', connected));
  document.querySelectorAll('.js-btn-disc').forEach(el => el.classList.toggle('hidden', !connected));
}
```

(`classList.toggle('on', …)` preserves the `conn-dot js-conn-dot` classes, unlike the old `el.className = …`.)

- [ ] **Step 3: Rewrite the four bar lines in `updateHrUI`**

In `updateHrUI` (`index.html:3446-3450`), replace **only** the first four `getElementById` lines (leave the `runHrDisplay`, `strHr`, and `pendingSetHr` logic at 3452-3459 untouched):

```js
  document.querySelectorAll('.js-hr-dot').forEach(el => el.classList.toggle('on', connected));
  document.querySelectorAll('.js-hr-label').forEach(el => el.textContent = connected ? `❤ ${hrDevice?.name || 'HR Monitor'}` : 'Geen HR monitor');
  document.querySelectorAll('.js-btn-hr-conn').forEach(el => el.classList.toggle('hidden', connected));
  document.querySelectorAll('.js-btn-hr-disc').forEach(el => el.classList.toggle('hidden', !connected));
```

- [ ] **Step 4: Rewrite the live-BPM write in `onHeartRate`**

Replace `index.html:3478`:

```js
  // Update connection bar
  document.querySelectorAll('.js-hr-label').forEach(el => el.textContent = `❤ ${currentHR} bpm`);
```

- [ ] **Step 5: Verify (browser + console) — behavior unchanged**

Run `python3 -m http.server 8000` from the repo root, open `http://localhost:8000/index.html?demo`.
- The two bars still render at the very top of the home screen exactly as before.
- In the devtools console run `updateConnUI(true)` → the Loopband dot goes green, label becomes "Verbonden", "Loopband" button hides, "Verbreek" shows. Run `updateConnUI(false)` → reverts.
- Run `updateHrUI(true)` → HR dot green, label "❤ HR Monitor", "❤ HR Verbind" hides, "Verbreek" shows. `updateHrUI(false)` → reverts.
Expected: identical to pre-refactor behavior (there is still only one bar instance, so "all instances" = that one).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "refactor: drive connection bars by class so they can be shown in multiple places"
```

---

## Task 2: Instellingen view + gear icon (reachable and testable together)

Add the new full-screen settings view (back button, theme row, both bars) and swap the home moon button for a gear that opens it. Done together so the view is reachable via the UI immediately.

**Files:**
- Modify: `index.html:426-429` (home header — replace `#themeToggle` button with a gear button)
- Create markup: new `#viewSettings` block, inserted right after `#viewHome` closes (`index.html:458`)

**Interfaces:**
- Consumes: sync classes from Task 1; existing `showView(id)`, `toggleTheme()`, `bleConnect()`, `bleDisconnect()`, `hrConnect()`, `hrDisconnect()`.
- Produces: `showView('viewSettings')` as the settings entry point.

- [ ] **Step 1: Replace the moon button in the home header with a gear**

In `index.html:426-429`, replace the `#themeToggle` button (line 428) with a gear that opens settings. The sign-out button on line 427 stays. The `#themeToggle` id is **moved** to the settings view in Step 2 (not duplicated — `applyTheme` at `index.html:3512`/`3580` calls `getElementById('themeToggle')` and only needs it to exist somewhere in the DOM):

```html
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:-1rem;">
      <button id="authSignOutBtn" title="Uitloggen" style="display:none;background:none;border:1px solid var(--border);border-radius:50%;width:36px;height:36px;font-size:1rem;cursor:pointer;align-items:center;justify-content:center;">⎋</button>
      <button id="settingsBtn" title="Instellingen" onclick="showView('viewSettings')" style="background:none;border:1px solid var(--border);border-radius:50%;width:36px;height:36px;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">⚙</button>
    </div>
```

- [ ] **Step 2: Add the `#viewSettings` markup after `#viewHome`**

Insert this block immediately after the closing `</div>` of `#viewHome` (`index.html:458`), before the `<!-- VIEW: EXERCISE EDITOR -->` comment. It reuses the existing `.editor-header` / `.btn-icon` back-button pattern (see `index.html:464-467`) and carries the sync classes so it stays in sync via Task 1's updaters:

```html
<!-- =========================================
     VIEW: SETTINGS
     ========================================= -->
<div class="view" id="viewSettings">
  <div class="editor-header">
    <button class="btn-icon" onclick="showView('viewHome')" style="font-size:1rem;">←</button>
    <span style="font-weight:700;font-size:1rem;">Instellingen</span>
  </div>

  <div class="conn" style="justify-content:space-between;">
    <span class="conn-label" style="flex:0;">Thema</span>
    <button id="themeToggle" onclick="toggleTheme()" style="background:none;border:1px solid var(--border);border-radius:50%;width:36px;height:36px;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">🌙</button>
  </div>

  <div class="conn">
    <div class="conn-dot js-conn-dot"></div>
    <span class="conn-label js-conn-label">Niet verbonden</span>
    <button class="btn btn-cyan btn-sm js-btn-conn" onclick="bleConnect()">Loopband</button>
    <button class="btn btn-ghost btn-sm hidden js-btn-disc" onclick="bleDisconnect()">Verbreek</button>
  </div>

  <div class="conn">
    <div class="conn-dot js-hr-dot"></div>
    <span class="conn-label js-hr-label">Geen HR monitor</span>
    <button class="btn btn-sm js-btn-hr-conn" onclick="hrConnect()" style="background:#e74c3c;color:#fff;">❤ HR Verbind</button>
    <button class="btn btn-ghost btn-sm hidden js-btn-hr-disc" onclick="hrDisconnect()">Verbreek</button>
  </div>
</div>
```

- [ ] **Step 3: Verify (browser + console)**

Reload `http://localhost:8000/index.html?demo`.
- Home header right side now shows a ⚙ gear (no moon). Tapping it opens the Instellingen screen; the ← back button returns to home; the phone/browser back button also returns (History API, handled by `showView`).
- The "Thema" row shows the 🌙/☀️ toggle; tapping it flips the theme (whole app recolors) and swaps the emoji. Reload → theme persists (localStorage).
- On the Instellingen screen run `updateConnUI(true)` / `updateHrUI(true)` in console → **both** the settings bars and the (still-present) global bars flip together. Revert with `(false)`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "feat: add Instellingen screen (theme + connect) behind a gear icon"
```

---

## Task 3: Remove the global connection bars

Now that settings is the connect hub, delete the always-on global bars.

**Files:**
- Modify: `index.html:405-419` (delete the `#globalConn` block)

- [ ] **Step 1: Delete `#globalConn`**

Delete `index.html` lines 405–419 in full: the `<!-- Connection bars (global) -->` comment, the `<div id="globalConn">` wrapper, both `.conn` rows inside it (the Loopband row and the HR row edited in Task 1 Step 1), and the wrapper's closing `</div>`. After deletion, `<div class="app">` (line 403) is immediately followed by the `<!-- VIEW: HOME -->` comment and `#viewHome` (line 424) — leave those intact.

- [ ] **Step 2: Verify (browser + console)**

Reload `http://localhost:8000/index.html?demo`.
- Home screen: no connection bars at the top anymore; "Mijn Workouts" sits directly under the logo (content shifted up).
- The editors, exercise-detail, and preview screens also no longer show top bars (they were global).
- Instellingen still shows both bars. On Instellingen, `updateConnUI(true)`/`updateHrUI(true)` still flips them (now the only instances).
- Console: `document.getElementById('globalConn')` returns `null`; no console errors on load or when navigating.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "feat: remove always-on global connection bars (now in Instellingen)"
```

---

## Task 4: Connect bars above the Start-Workout button (preview)

Add a bar container directly above ▶ Start Workout: HR always, Loopband only when the workout has a run.

**Files:**
- Modify: `index.html:572-575` (insert bars before the Start button inside `#viewPreview`)
- Modify: `renderPreview()` (`index.html:2071+`) — compute `hasRun`, toggle the treadmill row

**Interfaces:**
- Consumes: sync classes (Task 1); `usesTreadmill(ex)`, `getExercise(id)`, the `w`/`entries` already built in `renderPreview`.

- [ ] **Step 1: Add the bar container above the Start button**

In `#viewPreview`, insert this block immediately **before** the `<button … onclick="startRunner()">` (currently `index.html:572`):

```html
  <div id="previewConn" style="margin-top:0.5rem;">
    <div class="conn">
      <div class="conn-dot js-hr-dot"></div>
      <span class="conn-label js-hr-label">Geen HR monitor</span>
      <button class="btn btn-sm js-btn-hr-conn" onclick="hrConnect()" style="background:#e74c3c;color:#fff;">❤ HR Verbind</button>
      <button class="btn btn-ghost btn-sm hidden js-btn-hr-disc" onclick="hrDisconnect()">Verbreek</button>
    </div>
    <div class="conn" id="previewConnTreadmill">
      <div class="conn-dot js-conn-dot"></div>
      <span class="conn-label js-conn-label">Niet verbonden</span>
      <button class="btn btn-cyan btn-sm js-btn-conn" onclick="bleConnect()">Loopband</button>
      <button class="btn btn-ghost btn-sm hidden js-btn-disc" onclick="bleDisconnect()">Verbreek</button>
    </div>
  </div>
```

- [ ] **Step 2: Toggle the treadmill row on `hasRun` in `renderPreview`**

`renderPreview` already builds `const w = migrateWorkout(raw);` and `const entries = w.entries || [];` (`index.html:2074-2075`). Add, anywhere after `entries` is defined (e.g. right after line 2075):

```js
  const hasRun = entries.some(e => usesTreadmill(getExercise(e.exerciseId)));
  document.getElementById('previewConnTreadmill').style.display = hasRun ? '' : 'none';
```

- [ ] **Step 3: Verify (browser + console)**

Reload `http://localhost:8000/index.html?demo`, expand "Mijn Workouts".
- Open **"Running program: Phase 1"** → above ▶ Start Workout you see an HR bar **and** a Loopband bar.
- Go back, open **"Krachttraining (demo · beter dan vorige keer)"** → above Start you see **only** the HR bar (no Loopband).
- On either preview, `updateHrUI(true)` in console flips the preview HR bar (and the Instellingen one). On the running workout, `updateConnUI(true)` flips the preview Loopband bar too.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "feat: show HR (always) + Loopband (if run) connect bars above Start Workout"
```

---

## Task 5: Slim reconnect bar at the top of the runner

Give the live runner a compact reconnect bar: HR always, Loopband only when the workout has a run. Must not disturb the fixed 100dvh runner layout (portrait + landscape).

**Files:**
- Modify: CSS — add `.conn-slim` next to `.conn` (`index.html:106-113`) and a landscape rule next to the runner media query (`index.html:307-312`)
- Modify: `index.html:594` — insert the slim bar as the first in-flow child of `#runnerLayout`
- Modify: `startRunner()` (`index.html` — the function behind ▶ Start Workout) — toggle the runner treadmill row on `hasRun`

**Interfaces:**
- Consumes: sync classes (Task 1); `hasRun` rule (same as Task 4); `previewWorkoutId` + `loadWorkouts()`/`migrateWorkout()`/`getExercise()` already used inside `startRunner` (`index.html:2244`).

- [ ] **Step 1: Add the `.conn-slim` and runner-bar CSS**

After the `.conn-label` rule (`index.html:113`), add:

```css
/* Slim connection bar for the space-constrained runner */
.conn-slim { padding:0.3rem 0.6rem; margin-bottom:0.25rem; gap:0.45rem; }
.conn-slim .conn-label { font-size:0.65rem; }
#runnerConn { flex:0 0 auto; padding:0.35rem 0.35rem 0; }
```

Inside the `@media (orientation:landscape)` block (`index.html:307-312`), add a line so the bar spans the full top row:

```css
  #runnerConn { flex:0 0 100%; }
```

- [ ] **Step 2: Insert the slim bar at the top of `#runnerLayout`**

The runner markup opens with `<div id="runnerLayout">` (`index.html:594`) followed by the position:fixed emergency overlay (`index.html:596`) and then `<div id="runnerChart">` (`index.html:604`). Insert `#runnerConn` immediately **before** `<div id="runnerChart">` so it's the first *in-flow* flex child (the overlay is `position:fixed`, so order relative to it is irrelevant):

```html
    <div id="runnerConn">
      <div class="conn conn-slim">
        <div class="conn-dot js-hr-dot"></div>
        <span class="conn-label js-hr-label">Geen HR monitor</span>
        <button class="btn btn-sm js-btn-hr-conn" onclick="hrConnect()" style="background:#e74c3c;color:#fff;">❤ HR</button>
        <button class="btn btn-ghost btn-sm hidden js-btn-hr-disc" onclick="hrDisconnect()">Verbreek</button>
      </div>
      <div class="conn conn-slim" id="runnerConnTreadmill">
        <div class="conn-dot js-conn-dot"></div>
        <span class="conn-label js-conn-label">Niet verbonden</span>
        <button class="btn btn-cyan btn-sm js-btn-conn" onclick="bleConnect()">Loopband</button>
        <button class="btn btn-ghost btn-sm hidden js-btn-disc" onclick="bleDisconnect()">Verbreek</button>
      </div>
    </div>
```

- [ ] **Step 3: Toggle the runner treadmill row on `hasRun` in `startRunner`**

`startRunner` (`index.html:2243`) assigns `runEntries = wk.entries || [];` on line 2247. Immediately after that line (before the `if (!runEntries.length)` guard on line 2248), add:

```js
  const hasRun = runEntries.some(e => usesTreadmill(getExercise(e.exerciseId)));
  document.getElementById('runnerConnTreadmill').style.display = hasRun ? '' : 'none';
```

This reuses the `runEntries` the function already built — no extra fetch.

- [ ] **Step 4: Verify (browser + console)**

Reload `http://localhost:8000/index.html?demo`.
- Open **"Running program: Phase 1"** → ▶ Start Workout. At the top of the runner: a slim HR bar **and** a slim Loopband bar. The chart, current/next cards, and the bottom button row are all still fully visible and not clipped. Rotate to landscape (devtools device toolbar) → the slim bar spans the top, chart/controls sit below, buttons stay at the bottom.
- Exit, open **"Krachttraining (demo · beter dan vorige keer)"** → ▶ Start Workout → runner top shows **only** the slim HR bar.
- In the runner console, `updateHrUI(true)` flips the slim HR bar; on the run workout `updateConnUI(true)` flips the slim Loopband bar.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit --no-gpg-sign -m "feat: slim HR/Loopband reconnect bar at the top of the runner"
```

---

## Task 6: End-to-end verification pass

A final cross-screen check that the whole flow and the sync invariant hold together. No code; if something fails, fix it in the owning task's file and re-commit.

- [ ] **Step 1: Full walkthrough in demo mode**

Serve and open `http://localhost:8000/index.html?demo`. Confirm:
1. Home: no top bars; ⚙ opens Instellingen; theme toggle works and persists.
2. Instellingen: both bars present; `updateConnUI(true)`/`updateHrUI(true)` flip them.
3. Preview of a **run** workout: HR + Loopband bars above Start. Preview of a **strength-only** workout: HR bar only.
4. Runner of a **run** workout: slim HR + Loopband at top, layout intact (portrait + landscape). Runner of a **strength-only** workout: slim HR only.
5. **Sync across screens:** with a bar connected (via console `updateHrUI(true)` on Instellingen), navigate to a preview and into the runner → the HR bar reads connected everywhere without any extra action. `updateHrUI(false)` resets everywhere.
6. No console errors at any step; `document.getElementById('globalConn')` is `null`.

- [ ] **Step 2: Confirm nothing else regressed**

Run the existing unit tests to confirm the untouched modules still pass:

```bash
npm test
```
Expected: all existing `node --test` suites pass (this change touches no `src/*.js`, so they should be unaffected).

- [ ] **Step 3: (Optional) note any follow-ups**

If the "above Start button" placement feels buried on long previews during real use, that's a known trade-off from the spec (top-of-screen was the alternative) — note it for the user rather than changing placement here.
