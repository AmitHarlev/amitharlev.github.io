import { FORCE, RADIUS, STEP, DAMPING_RATE, applyBoundaryDamping, solveContactForces } from './physics.mjs';

// Exact intersection of a disk, two nonredundant half-planes, and x,y >= 0.
export const CURVE = Object.freeze({ x: 3.2, y: 2.8, radius: 4.6, lowerSlope: 2.9, upperSlope: 0.3 });
export const CURVE_LINES = [[-0.3, 1, 4.75], [2.9, -1, 17.65]].map(([x, y, b]) => {
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length, b: b / length };
});
const LINES = [{ x: -1, y: 0, b: 0 }, { x: 0, y: -1, b: 0 }, ...CURVE_LINES];

export function isCurvedFeasible(x, y, radius = 0, tolerance = 1e-9) {
  return Number.isFinite(x) && Number.isFinite(y) &&
    Math.hypot(x - CURVE.x, y - CURVE.y) <= CURVE.radius - radius + tolerance &&
    LINES.every(w => w.x * x + w.y * y <= w.b - radius + tolerance);
}

// Clip a densely sampled circle for shading only. Physics uses the exact disk.
export const CURVE_POINTS = Array.from({ length: 512 }, (_, i) => {
  const t = 2 * Math.PI * i / 512;
  return { x: CURVE.x + CURVE.radius * Math.cos(t), y: CURVE.y + CURVE.radius * Math.sin(t) };
});
let region = CURVE_POINTS;
for (const w of LINES) {
  const clipped = [];
  for (let i = 0; i < region.length; i++) {
    const a = region[i], b = region[(i + 1) % region.length];
    const da = w.x * a.x + w.y * a.y - w.b, db = w.x * b.x + w.y * b.y - w.b;
    if (da <= 0) clipped.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      clipped.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  region = clipped;
}
export const REGION_POINTS = region;

function projectInside(ball) {
  if (isCurvedFeasible(ball.x, ball.y, RADIUS, 0)) return;
  const candidates = [];
  const r = CURVE.radius - RADIUS;
  for (const wall of LINES) {
    const bound = wall.b - RADIUS, tx = -wall.y, ty = wall.x;
    const fx = wall.x * bound, fy = wall.y * bound;
    const normalDistance = wall.x * CURVE.x + wall.y * CURVE.y - bound;
    if (Math.abs(normalDistance) > r) continue;
    const center = tx * CURVE.x + ty * CURVE.y;
    const half = Math.sqrt(Math.max(0, r * r - normalDistance * normalDistance));
    let low = center - half, high = center + half;
    for (const other of LINES) {
      if (other === wall) continue;
      const coefficient = other.x * tx + other.y * ty;
      const slack = other.b - RADIUS - other.x * fx - other.y * fy;
      if (Math.abs(coefficient) < 1e-12) { if (slack < 0) high = -Infinity; }
      else if (coefficient > 0) high = Math.min(high, slack / coefficient);
      else low = Math.max(low, slack / coefficient);
    }
    if (low > high) continue;
    const t = Math.max(low, Math.min(high, tx * ball.x + ty * ball.y));
    candidates.push({ x: fx + t * tx, y: fy + t * ty });
  }
  const distance = Math.hypot(ball.x - CURVE.x, ball.y - CURVE.y);
  if (distance > 0) {
    const p = { x: CURVE.x + r * (ball.x - CURVE.x) / distance, y: CURVE.y + r * (ball.y - CURVE.y) / distance };
    if (isCurvedFeasible(p.x, p.y, RADIUS)) candidates.push(p);
  }
  candidates.sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
  ball.x = candidates[0].x;
  ball.y = candidates[0].y;
}

export function createCurvedBall(x, y) {
  if (!isCurvedFeasible(x, y)) return null;
  const ball = { x, y, vx: 0, vy: 0, forces: { damping: { x: 0, y: 0 }, contacts: Array.from({ length: 5 }, () => ({ x: 0, y: 0 })) } };
  projectInside(ball);
  return ball;
}

export function stepCurvedBall(ball, dt = STEP, force = FORCE, dampingRate = DAMPING_RATE, restitution = 0.30) {
  const normals = LINES.filter(w => w.b - RADIUS - w.x * ball.x - w.y * ball.y < 1e-8);
  const oldDistance = Math.hypot(ball.x - CURVE.x, ball.y - CURVE.y);
  if (CURVE.radius - RADIUS - oldDistance < 1e-8) {
    normals.push({ x: (ball.x - CURVE.x) / oldDistance, y: (ball.y - CURVE.y) / oldDistance });
  }
  const damping = applyBoundaryDamping(ball, normals, dt, dampingRate);
  ball.vx += force.x * dt;
  ball.vy += force.y * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  projectInside(ball);
  ball.forces = { damping, contacts: Array.from({ length: 5 }, () => ({ x: 0, y: 0 })) };
  const contacts = [];
  LINES.forEach((wall, index) => {
    if (wall.b - RADIUS - wall.x * ball.x - wall.y * ball.y < 1e-8) contacts.push({ wall, index });
  });
  const dx = ball.x - CURVE.x, dy = ball.y - CURVE.y, distance = Math.hypot(dx, dy);
  if (CURVE.radius - RADIUS - distance < 1e-8) contacts.push({ wall: { x: dx / distance, y: dy / distance }, index: 4 });
  return solveContactForces(ball, contacts, dt, restitution);
}
