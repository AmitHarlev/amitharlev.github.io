import test from 'node:test';
import assert from 'node:assert/strict';
import { convexObjective, convexObjectiveForce, RADIUS, STEP } from './physics.mjs';
import { createCurvedBall, isCurvedFeasible, stepCurvedBall } from './curved-physics.mjs';

test('the position-dependent force is the gradient of a strictly convex objective', () => {
  const epsilon = 1e-5;
  for (const [x, y] of [[0, 0], [2, 5], [5, 2], [-1, -1], [9, 9]]) {
    const force = convexObjectiveForce(x, y);
    const dx = (convexObjective(x + epsilon, y) - convexObjective(x - epsilon, y)) / (2 * epsilon);
    const dy = (convexObjective(x, y + epsilon) - convexObjective(x, y - epsilon)) / (2 * epsilon);
    assert.ok(Math.abs(force.x - dx) < 1e-8);
    assert.ok(Math.abs(force.y - dy) < 1e-8);
    assert.ok(convexObjective(x + 1, y - 2) > convexObjective(x, y) + force.x - 2 * force.y);
  }
  const left = convexObjectiveForce(1, 5), right = convexObjectiveForce(5, 1);
  assert.ok(left.y / left.x > right.y / right.x);
  assert.ok(Math.hypot(...Object.values(convexObjectiveForce(5, 5))) > Math.hypot(...Object.values(convexObjectiveForce(1, 1))));
});

test('the ball follows the changing gradient and stays confined with boundary damping', () => {
  for (const [x, y] of [[0, 0], [1, 4], [5, 1], [2, 2], [4, 4]]) {
    const ball = createCurvedBall(x, y);
    assert.ok(ball);
    for (let i = 0; i < 30 / STEP; i++) {
      const force = convexObjectiveForce(ball.x, ball.y);
      const before = { x: ball.vx, y: ball.vy };
      stepCurvedBall(ball, STEP, force);
      assert.ok(isCurvedFeasible(ball.x, ball.y, RADIUS, 1e-8));
      const net = [force, ball.forces.damping, ...ball.forces.contacts].reduce((s, f) => ({ x: s.x + f.x, y: s.y + f.y }), { x: 0, y: 0 });
      assert.ok(Math.abs(net.x - (ball.vx - before.x) / STEP) < 1e-8);
      assert.ok(Math.abs(net.y - (ball.vy - before.y) / STEP) < 1e-8);
    }
  }
});
