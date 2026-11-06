# Workout session controls: complete / skip / stop + nav strip

**Date:** 2026-11-05 (revised 2026-11-06)

## Problem

During a running workout the bottom bar had three buttons: **✓ Voltooid**, **⏭ Skip**,
**⏹ Stop**. Two problems:

1. **Stop threw the session away.** `stopRunner()` just returned home without logging. The
   user wants to be asked whether to log the partial workout.
2. **"Skip" was too blunt and lost work.** It dropped the exercise entirely, and there was
   no way to navigate back to an exercise once past it.

## Final shape

- Bottom bar: **✓ Voltooid** (green), **✕ Overslaan** (amber), **⏹ Stop** (red) — three
  equal-width buttons, equal height, icon stacked above the label. The green slot is
  contextual (▶ Start / ⏸ Pauze where relevant).
- A **navigation strip** of numbered circles at the top, one per exercise, connected by
  lines, centered, with per-exercise state and tap-to-jump.
- A **fullscreen toggle** (opt-in) top-right, just under the strip. Fullscreen is no longer
  forced on start.
- **Stop** asks: log partial / don't log / cancel.
- The session is written to history **only when the user confirms** (**Bevestig sessie**) —
  no silent auto-save.

### Note on an earlier idea ("Stel uit" / postpone)

An intermediate design had a fourth button, **🕐 Stel uit** (postpone: keep pending, move one
position back, auto-resurface). It was dropped: with tap-to-jump navigation the distinction
from Overslaan was too subtle, so the two were merged into a single **Overslaan**. The
postpone logic (`postpone()` in the nav module, one-position-back reordering) was removed.

## Bottom bar

```
[ ✓ Voltooid ] [ ✕ Overslaan ] [ ⏹ Stop ]
    green          amber          red
   <----------- equal width ----------->
```

- All three equal width (`flex:1`) and equal height; each is a stacked button (`.btn-stack`)
  with the icon above the label. Amber uses the existing `--amber` token via `.btn-amber`.
- The green/first slot is **contextual**: strength & non-BLE cardio show **▶ Start** then
  **✓ Voltooid** (same slot); the treadmill timeline shows **⏸ Pauze** (nothing to mark
  complete there). Overslaan and Stop are always present.
- On the **end screen** none of these show — only **✓ Bevestig sessie** (plus the existing
  "nieuwe gewichten opslaan" when weights changed).

### Button behaviour

- **Voltooid** — unchanged per-set behaviour: finish set → next set; last set → exercise
  done (circle turns **green**, locked), advance to next pending exercise.
- **Overslaan** — leave the current exercise; the workout can end without it.
  - Did **≥1 set** → those sets are **logged** and the circle turns **orange**. You can tap
    it later to come back and **resume at the set where you left off** (no re-logging).
  - Did **nothing** → plain **skip**: circle turns **red**, nothing logged, revisitable (it
    restarts from set 1 since there was nothing to resume).
- **Stop** — opens the stop dialog.

## Navigation strip

A horizontal, centered row of numbered circles connected by short lines, one per exercise,
in fixed workout order. Numbers and positions never move. Scrolls horizontally on overflow.

| State | Appearance | Tappable? |
|-------|-----------|-----------|
| Current | thick blue border (over whatever fill) | n/a |
| Pending | thin blue border, no fill | yes → becomes current |
| In progress (current, ≥1 set this exercise) | thick **green** border, no fill | n/a |
| Completed (Voltooid) | green fill | **no — locked** |
| Skipped (Overslaan, nothing done) | red fill | yes → restarts at set 1 |
| Stopped early (Overslaan, ≥1 set logged) | **amber/orange** fill | yes → resumes at next set |

- Tapping a **pending**, **skipped**, or **stopped** circle jumps there. Skipped/stopped flip
  back to pending; a stopped (orange) exercise resumes at the set where you left off.
- Only a **green (fully done)** circle is **locked** — redoing a completed exercise (an extra
  set beyond the plan) is out of scope.
- The strip stays visible on the end screen so the user can tap a blue/red/orange circle to
  go back into the workout; doing so restores the action buttons.

## Leaving and resuming an exercise

Leaving the current exercise before finishing all its sets:

- via **Overslaan** → orange (sets logged) or red (nothing done);
- via **tapping another circle** → if ≥1 set was done it is logged and marked orange; if
  nothing was done it stays pending.

**Sets you actually did are never lost, and you can resume.** When you (re)enter a strength
exercise, the runner reads how many sets are already in `runLog` for it and continues at the
next set — e.g. 2 of 6 done → resumes at "Set 3/6", with per-side carry-forward reconstructed
from the logged sets, and no re-logging. Only redoing a *fully completed* exercise is out of
scope.

## Stop dialog

A modal overlay (dims the workout behind it). Three choices:

- **Gedeeltelijke workout loggen** → the end screen with whatever sets were committed so far.
- **Niet loggen** → discard, return home.
- **Annuleren** (or backdrop tap) → back into the workout; strength resumes at the current
  set, treadmill re-enters its start prompt. Activity (belt/timers) is halted while the
  dialog is open; a failed belt stop escalates to the emergency screen as before.

## End screen & saving

Appears when **no exercise is pending** (every exercise is done, skipped, or stopped), or via
stop → "wel loggen". The action buttons are hidden; it shows:

- ✓ icon + "Workout voltooid!" (or "Gedeeltelijke workout" via stop) + elapsed time + a
  "n oefening(en) gelogd" count.
- **✓ Bevestig sessie** (primary) — or "Terug naar start" when nothing was logged.
- **Nieuwe gewichten als standaard opslaan (n)** — only when weights changed.

**Saving happens on "Bevestig sessie"** (`confirmSession()`), reading `window.runLog` as it
stands then, so anything done after returning via the strip is included. Both a natural
finish and stop → log route to this one screen.

## Fullscreen

Opt-in via a top-right icon button under the nav strip (`toggleFullscreen()`): expand icon
to enter, compress icon to exit; stays in sync with `fullscreenchange` (e.g. Esc). Not
forced on workout start.

## Technical approach

The linear `runEntries[runEntryIndex]`/`runEntryIndex++` walk is replaced by a pure, DOM-free
**session-nav module** (`src/session-nav.js`, bridged to `window.SessionNav` in the module
`<script>` block alongside `Progress`, `StrengthUI`, etc.). It owns:

- per-entry status: `pending | done | skipped | stopped`
- the play order and the "current" pointer
- operations: `complete()`, `skip()`, `stopEarly()`, `jumpTo(i)`, plus derived `current()`,
  `pendingCount()`, `isEnd()`, and a `strip()` render model.

`index.html` renders the strip and bottom bar and calls the operations from the button/circle
handlers; all DOM/BLE/timer side-effects stay in `index.html`. `runEntryIndex` is kept as a
mirror of `SessionNav.current()` so existing per-set code is untouched.

### Test cases (`test/session-nav.test.mjs`)

1. New session of N → current = entry 0, all pending.
2. `complete()` → current done (green), advance to next pending.
3. `skip()` → current skipped (red), advance to next pending; doesn't block the end.
4. `stopEarly()` → current stopped (orange), not pending, doesn't block the end.
5. `jumpTo(pending)` → becomes current.
6. `jumpTo(skipped)` → flips to pending + current.
7. `jumpTo(stopped)` → flips to pending + current (resumable); `jumpTo(done)` → no-op (locked).
8. no pending remaining → `current()` null / `isEnd()` true → end screen.

The resume-at-set arithmetic (logged-set count → set/side index) lives in `index.html`
(`startStrengthEntry`) and is covered end-to-end by the browser harness: do 2 of 6 → Overslaan
→ tap the orange circle → resumes at "Set 3/6" → finish → the exercise has 6 logged sets, not 8.

## Out of scope

- Redoing a *fully completed* exercise (an extra set beyond the plan) — green circles stay
  locked.
