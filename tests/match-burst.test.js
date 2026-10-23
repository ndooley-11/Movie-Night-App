import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collisionMs, burstPlan, heartKeyframes, HEART_DURATION } from '../src/lib/matchBurst.js';

// Independent CSS cubic-bezier evaluator: solve x(t) = time fraction by
// Newton/bisection, then return y(t), the eased progress the browser uses.
function easedProgress(fraction, [x1, y1, x2, y2]) {
  const c = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1, t = fraction;
  for (let i = 0; i < 60; i++) { t = (lo + hi) / 2; if (c(t, x1, x2) < fraction) lo = t; else hi = t; }
  return c(t, y1, y2);
}

test('burst launches on the exact frame the hearts reach the meeting keyframe', () => {
  const ms = collisionMs();
  const progress = easedProgress(ms / HEART_DURATION, [0.25, 0.65, 0.35, 1]);
  assert.ok(Math.abs(progress - 0.54) < 1e-6, `eased progress at collision is ${progress}`);
  assert.ok(ms > 200 && ms < 260, 'the meeting happens early in clock time, not at 54% of the duration');
  const meet = heartKeyframes(-1).find(k => k.transform === 'translateX(0) scale(1)');
  assert.equal(meet.offset, 0.54, 'hearts are centered at the meeting keyframe');
});

test('44 particles, 60% behind the card, rear ones smaller, all in one shared flight', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plan = burstPlan(random);
  const rear = plan.filter(p => p.rear), front = plan.filter(p => !p.rear);
  assert.equal(plan.length, 44);
  assert.equal(rear.length, 26);
  assert.ok(Math.max(...rear.map(p => p.size)) <= Math.min(...front.map(p => p.size)), 'rear particles are smaller');
  for (const p of plan) {
    assert.equal(p.frames[0].offset, 0);
    assert.equal(p.frames.at(-1).offset, 1);
    assert.equal(p.frames.at(-1).opacity, 0, 'particles fade out by the end of their flight');
    assert.match(p.frames[0].transform, /calc\(-50% \+ 0px\),calc\(-50% \+ 0px\)/, 'every particle starts at the collision point');
  }
  // Low-gravity arc: rises first, then falls back below its peak.
  const ys = plan[0].frames.map(f => Number(/calc\(-50% \+ (-?[\d.e-]+)px\)\)/.exec(f.transform)[1]));
  const peak = Math.min(...ys);
  assert.ok(peak < -50 && ys.at(-1) > peak, 'particles arc up and drift back down');
});
