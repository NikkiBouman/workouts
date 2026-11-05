// Pure, DOM-free renderers + target maths for the strength runner. Shared between the
// real runner (index.html) and the ?demo mode so there is one source of truth.
// No Firebase, no document access — importable by node:test.

import { sessionSetTableHtml } from './chart.js';

// Most gym machines/plates step in 2.5 kg, so the +/- buttons do too. Free typing of
// any value stays possible in the input itself.
export const WEIGHT_STEP = 2.5;

// Drop a trailing ".0" so 25.0 shows as 25 but 22.5 stays 22.5.
export function fmtKg(v) {
  const n = Math.round((v || 0) * 10) / 10;
  return String(n);
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

// The one metric a strength exercise progresses on ("MAX"): weight if it's weighted,
// otherwise its measured metric (reps or duration). Secondary metrics (e.g. reps on a
// weighted lift) stay as the planned target.
export function primaryMetric(ex) {
  if (!ex) return 'reps';
  if (ex.weighted) return 'weight';
  if (ex.measureBy === 'duration') return 'duration';
  return 'reps';
}

// Prefill values for one side (0=left, 1=right) from the history targets, given the
// exercise meta. Returns 0 for a metric the exercise does not use (or no history).
export function targetFor(targets, sideIndex, ex) {
  if (!targets || !ex) return { weight: 0, reps: 0, duration: 0 };
  const left = sideIndex !== 1;
  return {
    weight: ex.weighted ? (left ? targets.maxWeightL : targets.maxWeightR) : 0,
    reps: ex.measureBy === 'reps' ? (left ? targets.maxRepsL : targets.maxRepsR) : 0,
    duration: ex.measureBy === 'duration' ? (left ? targets.maxDurL : targets.maxDurR) : 0,
  };
}

// Coloured side badge (blue "Links" / orange "Rechts"), or '' for a non-perSide
// exercise. Colours match the progress chart.
export function sideBadgeHtml(sideIndex, perSide, { colLeft, colRight }) {
  if (!perSide) return '';
  const left = sideIndex !== 1;
  const color = left ? colLeft : colRight;
  const label = left ? 'Links' : 'Rechts';
  return `<span class="str-side-badge" style="display:inline-flex;align-items:center;` +
    `font-size:0.8rem;font-weight:800;color:#fff;background:${color};` +
    `padding:0.15rem 0.7rem;border-radius:999px;letter-spacing:0.02em;">${label}</span>`;
}

// "Vorige keer" panel: a short date header + the exact same set table the exercise
// detail view uses (so the previous session reads identically). `targets` is
// lastSessionTargets() output (or null → a "no history" note).
export function prevSessionPanelHtml(targets, ex, { colLeft, colRight }) {
  if (!targets) {
    return `<div class="str-prev" style="font-size:0.8rem;color:var(--muted);">` +
      `Geen vorige sessie — zet je eigen gewicht.</div>`;
  }
  const head = `<div style="font-size:0.72rem;font-weight:700;color:var(--muted);` +
    `margin-bottom:0.25rem;text-align:center;">Vorige keer · ${fmtDate(targets.date)}</div>`;
  const table = sessionSetTableHtml(ex, targets.sets, { colLeft, colRight });
  return `<div class="str-prev" style="width:100%;max-width:360px;margin:0 auto;">${head}${table}</div>`;
}
