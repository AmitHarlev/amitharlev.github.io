import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVE, FORCE, RADIUS, STEP, WALLS, polygon, isFeasible, createBall, forceForObjective, stepBall } from './physics.mjs';

test('feasible clicks, including every vertex, create stationary balls that fit inside', () => {
  assert.ok(isFeasible(0, 0));
  for (const p of [...polygon(), { x: 2, y: 3 }]) {
    const ball = createBall(p.x, p.y);
    assert.ok(ball);
    assert.equal(ball.vx, 0);
    assert.equal(ball.vy, 0);
    assert.ok(isFeasible(ball.x, ball.y, RADIUS));
  }
  for (const [x, y] of [[-0.01, 1], [1, -0.01], [8, 0], [3, 7], [7, 4], [NaN, 0]]) {
    assert.equal(createBall(x, y), null);
  }
});

test('a ball released away from walls accelerates along the objective', () => {
  const ball = createBall(2, 2);
  stepBall(ball);
  assert.ok(ball.x > 2 && ball.y > 2);
  assert.ok(Math.abs(ball.vy / ball.vx - OBJECTIVE.y / OBJECTIVE.x) < 1e-12);
  assert.equal(FORCE.y / FORCE.x, OBJECTIVE.y / OBJECTIVE.x);
});

test('free motion has constant objective acceleration with no drag', () => {
  const ball = createBall(2, 2);
  ball.vx = 0.5;
  ball.vy = -0.25;
  for (let i = 0; i < 120; i++) {
    stepBall(ball);
    const time = (i + 1) * STEP;
    assert.ok(Math.abs(ball.vx - (0.5 + FORCE.x * time)) < 1e-10);
    assert.ok(Math.abs(ball.vy - (-0.25 + FORCE.y * time)) < 1e-10);
    assert.ok(ball.forces.contacts.every(f => f.x === 0 && f.y === 0));
  }
});

test('axis impacts bounce and dissipate energy', () => {
  for (const axis of ['x', 'y']) {
    const ball = createBall(2, 2);
    ball[axis] = RADIUS + 0.001;
    ball[`v${axis}`] = -3;
    stepBall(ball);
    assert.ok(ball[`v${axis}`] > 0 && ball[`v${axis}`] < 3);
    assert.ok(isFeasible(ball.x, ball.y, RADIUS));
  }
});

test('each active upper constraint reflects outward motion and permits tangent motion', () => {
  const vertices = polygon(RADIUS);
  for (const wall of WALLS.slice(2)) {
    const ends = vertices.filter(p => Math.abs(wall.x * p.x + wall.y * p.y - wall.b + RADIUS) < 1e-8);
    if (ends.length === 0) {
      assert.ok(vertices.every(p => wall.x * p.x + wall.y * p.y < wall.b - RADIUS));
      continue; // A redundant constraint cannot be reached by the ball.
    }
    assert.equal(ends.length, 2);
    const ball = createBall((ends[0].x + ends[1].x) / 2, (ends[0].y + ends[1].y) / 2);
    ball.vx = 3 * wall.x - wall.y;
    ball.vy = 3 * wall.y + wall.x;
    stepBall(ball);
    assert.ok(ball.vx * wall.x + ball.vy * wall.y < 0);
    const expectedTangent = Math.exp(-0.4 * STEP) + (-FORCE.x * wall.y + FORCE.y * wall.x) * STEP;
    assert.ok(Math.abs(-ball.vx * wall.y + ball.vy * wall.x - expectedTangent) < 1e-10);
    assert.ok(isFeasible(ball.x, ball.y, RADIUS));
  }
});

test('balls stay confined and settle at the radius-adjusted maximizing corner', () => {
  const objective = p => p.x * OBJECTIVE.x + p.y * OBJECTIVE.y;
  const optimum = polygon(RADIUS).sort((a, b) => objective(b) - objective(a))[0];
  const starts = [...polygon(), { x: 0, y: 0 }];
  for (let x = 0.5; x < 8; x += 1) {
    for (let y = 0.5; y < 8; y += 1) {
      if (isFeasible(x, y)) starts.push({ x, y });
    }
  }
  for (const start of starts) {
    const ball = createBall(start.x, start.y);
    // Without air drag, dissipation occurs only at impacts and settling takes longer.
    for (let i = 0; i < 40 / STEP; i++) {
      stepBall(ball);
      assert.ok(isFeasible(ball.x, ball.y, RADIUS, 1e-8), JSON.stringify(ball));
    }
    assert.ok(Math.hypot(ball.x - optimum.x, ball.y - optimum.y) < 0.005, JSON.stringify({ start, ball, optimum }));
    assert.ok(Math.hypot(ball.vx, ball.vy) < 0.02);
  }
});

test('fast impacts and repeated corner contact cannot escape the region', () => {
  for (const vertex of polygon()) {
    const ball = createBall(vertex.x, vertex.y);
    ball.vx = 150;
    ball.vy = -100;
    for (let i = 0; i < 3000; i++) {
      stepBall(ball);
      assert.ok(isFeasible(ball.x, ball.y, RADIUS, 1e-8));
    }
  }
});

test('reported forces account for acceleration, including collision impulses', () => {
  const ball = createBall(0.2, 0.2);
  ball.vx = -3;
  ball.vy = -2;
  for (let i = 0; i < 2000; i++) {
    const before = { x: ball.vx, y: ball.vy };
    stepBall(ball);
    const net = [FORCE, ball.forces.damping, ...ball.forces.contacts]
      .reduce((sum, f) => ({ x: sum.x + f.x, y: sum.y + f.y }), { x: 0, y: 0 });
    assert.ok(Math.abs(net.x - (ball.vx - before.x) / STEP) < 1e-8);
    assert.ok(Math.abs(net.y - (ball.vy - before.y) / STEP) < 1e-8);
    ball.forces.contacts.forEach((force, index) => {
      const normal = WALLS[index];
      assert.ok(force.x * normal.x + force.y * normal.y <= 1e-9);
      assert.ok(Math.abs(force.x * normal.y - force.y * normal.x) < 1e-8);
    });
  }
});

test('averaged boundary reactions balance the objective at the maximizing corner', () => {
  const ball = createBall(2, 2);
  for (let i = 0; i < 24 / STEP; i++) stepBall(ball);
  assert.equal(ball.forces.contacts.filter(f => Math.hypot(f.x, f.y) > 0.01).length, 2);
  // Assess sustained force balance across a full second of contact.
  const net = { x: 0, y: 0 };
  for (let i = 0; i < 1 / STEP; i++) {
    stepBall(ball);
    for (const f of [FORCE, ball.forces.damping, ...ball.forces.contacts]) {
      net.x += f.x * STEP;
      net.y += f.y * STEP;
    }
  }
  assert.ok(Math.hypot(net.x, net.y) < 0.001);
});

test('the normalized steeper objective accelerates correctly and selects the upper corner', () => {
  const stronger = forceForObjective(2);
  assert.ok(Math.abs(Math.hypot(stronger.x, stronger.y) - Math.hypot(FORCE.x, FORCE.y)) < 1e-12);
  assert.ok(Math.abs(stronger.y / stronger.x - 2) < 1e-12);
  const free = createBall(2, 2);
  stepBall(free, STEP, stronger);
  assert.ok(Math.abs(free.vx - stronger.x * STEP) < 1e-10);
  assert.ok(Math.abs(free.vy - stronger.y * STEP) < 1e-10);
  const score = (p, force) => p.x * force.x + p.y * force.y;
  const corners = polygon(RADIUS);
  const upper = [...corners].sort((a, b) => score(b, stronger) - score(a, stronger))[0];
  const original = [...corners].sort((a, b) => score(b, FORCE) - score(a, FORCE))[0];
  assert.ok(upper.y > original.y && upper.x < original.x);
  const starts = [...polygon(), { x: 2, y: 2 }];
  for (let x = 0.5; x < 8; x++) {
    for (let y = 0.5; y < 6; y++) {
      if (isFeasible(x, y)) starts.push({ x, y });
    }
  }
  for (const start of starts) {
    const ball = createBall(start.x, start.y);
    for (let i = 0; i < 40 / STEP; i++) {
      const before = { x: ball.vx, y: ball.vy };
      stepBall(ball, STEP, stronger);
      assert.ok(isFeasible(ball.x, ball.y, RADIUS, 1e-8));
      const net = [stronger, ball.forces.damping, ...ball.forces.contacts]
        .reduce((sum, f) => ({ x: sum.x + f.x, y: sum.y + f.y }), { x: 0, y: 0 });
      assert.ok(Math.abs(net.x - (ball.vx - before.x) / STEP) < 1e-8);
      assert.ok(Math.abs(net.y - (ball.vy - before.y) / STEP) < 1e-8);
    }
    assert.ok(Math.hypot(ball.x - upper.x, ball.y - upper.y) < 0.005);
    assert.ok(Math.hypot(ball.vx, ball.vy) < 0.02);
  }
});

test('inelastic collisions remove normal velocity while preserving sliding motion', () => {
  const vertices = polygon(RADIUS);
  for (const wall of WALLS) {
    const ends = vertices.filter(p => Math.abs(wall.x * p.x + wall.y * p.y - wall.b + RADIUS) < 1e-8);
    if (ends.length !== 2) continue;
    const ball = createBall((ends[0].x + ends[1].x) / 2, (ends[0].y + ends[1].y) / 2);
    ball.vx = 3 * wall.x - wall.y;
    ball.vy = 3 * wall.y + wall.x;
    stepBall(ball, STEP, { x: 0, y: 0 }, 0, 0);
    assert.ok(Math.abs(ball.vx * wall.x + ball.vy * wall.y) < 1e-10);
    assert.ok(Math.abs(-ball.vx * wall.y + ball.vy * wall.x - 1) < 1e-10);
    assert.ok(isFeasible(ball.x, ball.y, RADIUS));
  }
});
