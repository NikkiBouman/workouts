import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, current, complete, skip, stopEarly, jumpTo,
  pendingCount, isEnd, strip, STATUS,
} from '../src/session-nav.js';

test('new session: current is entry 0, all pending', () => {
  const s = createSession(3);
  assert.equal(current(s), 0);
  assert.equal(pendingCount(s), 3);
  assert.equal(isEnd(s), false);
  assert.deepEqual(strip(s).map(c => c.status), ['pending', 'pending', 'pending']);
  assert.deepEqual(strip(s).map(c => c.isCurrent), [true, false, false]);
});

test('empty session: current null, immediately ended', () => {
  const s = createSession(0);
  assert.equal(current(s), null);
  assert.equal(isEnd(s), true);
});

test('complete: current done (green), advance to next pending', () => {
  const s = createSession(3);
  complete(s);
  assert.equal(strip(s)[0].status, 'done');
  assert.equal(current(s), 1);
  complete(s);
  assert.equal(current(s), 2);
  complete(s);
  assert.equal(current(s), null);
  assert.equal(isEnd(s), true);
  assert.deepEqual(strip(s).map(c => c.status), ['done', 'done', 'done']);
});

test('skip: current skipped (red), advance to next pending', () => {
  const s = createSession(3);
  skip(s);
  assert.equal(strip(s)[0].status, 'skipped');
  assert.equal(current(s), 1);
  // skipped entry is not pending, so when all others resolved it does not block the end
  complete(s); // entry 1
  complete(s); // entry 2
  assert.equal(current(s), null);
  assert.equal(isEnd(s), true);
  assert.deepEqual(strip(s).map(c => c.status), ['skipped', 'done', 'done']);
});

test('stopEarly: current stopped (orange), advance to next pending, not pending anymore', () => {
  const s = createSession(3);
  stopEarly(s);
  assert.equal(strip(s)[0].status, 'stopped');
  assert.equal(current(s), 1);
  assert.equal(pendingCount(s), 2); // stopped does not count as pending
  complete(s); // 1
  complete(s); // 2
  assert.equal(current(s), null);
  assert.equal(isEnd(s), true); // stopped (like done/skipped) does not block the end
});

test('jumpTo pending: becomes current', () => {
  const s = createSession(3);
  jumpTo(s, 2);
  assert.equal(current(s), 2);
  assert.equal(strip(s)[2].isCurrent, true);
});

test('jumpTo skipped: flips back to pending and becomes current', () => {
  const s = createSession(3);
  skip(s); // 0 skipped, current 1
  const ok = jumpTo(s, 0);
  assert.equal(ok, true);
  assert.equal(current(s), 0);
  assert.equal(strip(s)[0].status, 'pending');
  assert.equal(isEnd(s), false);
});

test('jumpTo done: no-op (green is locked)', () => {
  const s = createSession(3);
  complete(s); // 0 done, current 1
  const ok = jumpTo(s, 0);
  assert.equal(ok, false);
  assert.equal(current(s), 1); // unchanged
  assert.equal(strip(s)[0].status, 'done');
});

test('jumpTo stopped: resumable (orange flips to pending and becomes current)', () => {
  const s = createSession(3);
  stopEarly(s); // 0 stopped, current 1
  const ok = jumpTo(s, 0);
  assert.equal(ok, true);
  assert.equal(current(s), 0);
  assert.equal(strip(s)[0].status, 'pending');
  assert.equal(isEnd(s), false);
});

test('end reached when nothing pending, even with a skipped entry remaining', () => {
  const s = createSession(2);
  skip(s);     // 0 skipped
  complete(s); // 1 done
  assert.equal(current(s), null);
  assert.equal(isEnd(s), true);
  assert.equal(pendingCount(s), 0);
  // tapping the skipped one re-opens the workout
  jumpTo(s, 0);
  assert.equal(isEnd(s), false);
  assert.equal(current(s), 0);
});

test('STATUS constants exported', () => {
  assert.deepEqual(STATUS, { PENDING: 'pending', DONE: 'done', SKIPPED: 'skipped', STOPPED: 'stopped' });
});
