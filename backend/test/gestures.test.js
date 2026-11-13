import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useSwipe } from '../../frontend/src/lib/useSwipe.js';

function pointer(x, y, extra = {}) {
  return { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0,
    target: { closest: () => null }, ...extra };
}
function clickAllowed(gesture, detail = 1) {
  let prevented = false, stopped = false;
  gesture.click({ detail, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, stopped);
  return !prevented;
}

test('taps tolerate small finger movement and allow the next tap after scrolling', () => {
  const swipes = [], gesture = useSwipe(step => swipes.push(step));
  gesture.pointerdown(pointer(100, 100));
  gesture.pointermove(pointer(104, 105));
  gesture.pointerup(pointer(104, 105));
  assert.equal(clickAllowed(gesture), true);
  assert.deepEqual(swipes, []);
  gesture.pointerdown(pointer(100, 100));
  gesture.pointerup(pointer(100, 150));
  assert.equal(clickAllowed(gesture), false);
  gesture.pointerdown(pointer(100, 100));
  gesture.pointerup(pointer(100, 100));
  assert.equal(clickAllowed(gesture), true);
});

test('vertical, diagonal and short horizontal drags cannot activate a record', () => {
  for (const [x, y] of [[0, 40], [8, 8], [30, 0], [100, 100]]) {
    const swipes = [], gesture = useSwipe(step => swipes.push(step));
    gesture.pointerdown(pointer(0, 0));
    gesture.pointermove(pointer(x, y));
    gesture.pointerup(pointer(x, y));
    assert.equal(clickAllowed(gesture), false, `${x},${y}`);
    assert.deepEqual(swipes, []);
  }
});

test('movement remains disqualifying even when the finger returns to its starting point', () => {
  const gesture = useSwipe(() => assert.fail('must not switch days'));
  gesture.pointerdown(pointer(100, 100));
  gesture.pointermove(pointer(100, 140));
  gesture.pointerup(pointer(100, 100));
  assert.equal(clickAllowed(gesture), false);
});

test('horizontal swipes still change days and suppress the following click', () => {
  for (const [x, expected] of [[-100, -1], [100, 1]]) {
    const swipes = [], gesture = useSwipe(step => swipes.push(step));
    gesture.pointerdown(pointer(0, 0));
    gesture.pointerup(pointer(x, 10));
    assert.deepEqual(swipes, [expected]);
    assert.equal(clickAllowed(gesture), false);
  }
});

test('browser cancellation and multi-touch cannot activate records', () => {
  const gesture = useSwipe(() => assert.fail('must not switch days'));
  gesture.pointerdown(pointer(100, 100));
  gesture.pointercancel(pointer(100, 100));
  gesture.pointerup(pointer(100, 100));
  assert.equal(clickAllowed(gesture), false);
  gesture.pointerdown(pointer(100, 100));
  gesture.pointerdown(pointer(150, 100, { pointerId: 2, isPrimary: false }));
  gesture.pointerup(pointer(100, 100));
  assert.equal(clickAllowed(gesture), false);
});

test('keyboard activation works after a canceled scroll and controls retain independent clicks', () => {
  const gesture = useSwipe(() => assert.fail('must not switch days'));
  gesture.pointerdown(pointer(100, 100));
  gesture.pointercancel(pointer(100, 140));
  assert.equal(clickAllowed(gesture, 0), true);
  gesture.pointerdown(pointer(0, 0, { target: { closest: () => ({}) } }));
  gesture.pointerup(pointer(100, 0));
  assert.equal(clickAllowed(gesture), true);
});
