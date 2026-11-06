// Session navigation state for a running workout.
//
// Pure, DOM-free model of "which exercise is current, what have we done with each one,
// and where do we go next". index.html renders the top nav strip and the bottom action
// bar from this, and calls the operations from the button/circle handlers.
//
// The visual nav strip is always drawn in fixed entry order (entry i -> circle i+1); its
// positions never move. The *play* order (which pending entry comes next) lives in `order`
// and is only reshuffled by postpone().

export const STATUS = { PENDING: 'pending', DONE: 'done', SKIPPED: 'skipped', STOPPED: 'stopped' };

// s = { n, status: string[], order: number[], pos: number }
//   status[i]  state of entry i
//   order      play sequence of entry indices; order[pos] is the current entry
//   pos        index into `order` of the current entry, or -1 when nothing is pending

export function createSession(n) {
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  return { n, status: order.map(() => STATUS.PENDING), order, pos: n > 0 ? 0 : -1 };
}

export function current(s) {
  if (s.pos < 0 || s.pos >= s.order.length) return null;
  return s.order[s.pos];
}

export function pendingCount(s) {
  return s.status.filter(st => st === STATUS.PENDING).length;
}

export function isEnd(s) {
  return pendingCount(s) === 0;
}

// First position (scanning right from `fromPos`, then wrapping) whose entry is pending.
// Returns -1 when no entry is pending.
function nextPendingPos(s, fromPos) {
  const len = s.order.length;
  for (let step = 1; step <= len; step++) {
    const p = (fromPos + step) % len;
    if (s.status[s.order[p]] === STATUS.PENDING) return p;
  }
  return -1;
}

function resolveCurrent(s, newStatus) {
  if (s.pos < 0) return;
  s.status[s.order[s.pos]] = newStatus;
  s.pos = nextPendingPos(s, s.pos);
}

export function complete(s) {
  resolveCurrent(s, STATUS.DONE);
}

// Overslaan with nothing done: the exercise is skipped (red), nothing logged.
export function skip(s) {
  resolveCurrent(s, STATUS.SKIPPED);
}

// Overslaan after doing ≥1 set, or leaving a partly-done exercise: it is stopped early
// (orange). The sets done so far stay logged; the exercise is locked.
export function stopEarly(s) {
  resolveCurrent(s, STATUS.STOPPED);
}

// Jump to entry i by tapping its circle. Done (green) and stopped-early (orange) entries
// are locked — both hold logged sets. Skipped entries flip back to pending. Returns true
// when the jump happened.
export function jumpTo(s, i) {
  if (i < 0 || i >= s.n) return false;
  if (s.status[i] === STATUS.DONE || s.status[i] === STATUS.STOPPED) return false; // locked
  if (s.status[i] === STATUS.SKIPPED) s.status[i] = STATUS.PENDING;
  s.pos = s.order.indexOf(i);
  return true;
}

// Render model for the nav strip, in fixed entry order.
export function strip(s) {
  const cur = current(s);
  const out = [];
  for (let i = 0; i < s.n; i++) {
    out.push({ index: i, number: i + 1, status: s.status[i], isCurrent: cur === i });
  }
  return out;
}
