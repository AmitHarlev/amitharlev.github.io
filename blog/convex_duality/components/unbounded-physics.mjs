import { FORCE, RADIUS, STEP, WALLS, solveContactForces } from './physics.mjs';

export const UNBOUNDED_WALLS = [...WALLS.slice(0, 2),
  ...[[2, -1, 5], [-2, 1, 4]].map(([x, y, b]) => {
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length, b: b / length };
  })];
function projectInside(ball) {
  for (let pass = 0; pass < 64; pass++) {
    for (const w of UNBOUNDED_WALLS) {
      const excess = Math.max(0, w.x * ball.x + w.y * ball.y - w.b + RADIUS);
      ball.x -= excess * w.x;
      ball.y -= excess * w.y;
    }
  }
}
export function unboundedViewportPolygon(view) {
  let points = [{x: view.left, y: view.bottom}, {x: view.right, y: view.bottom}, {x: view.right, y: view.top}, {x: view.left, y: view.top}];
  for (const w of UNBOUNDED_WALLS) {
    const next = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const da = w.x*a.x+w.y*a.y-w.b, db = w.x*b.x+w.y*b.y-w.b;
      if (da <= 0) next.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da-db);
        next.push({x: a.x+t*(b.x-a.x), y: a.y+t*(b.y-a.y)});
      }
    }
    points = next;
  }
  return points;
}
export const isUnboundedFeasible = (x, y) => Number.isFinite(x) && Number.isFinite(y) && UNBOUNDED_WALLS.every(w => w.x*x + w.y*y <= w.b + 1e-9);
export function createUnboundedBall(x, y) {
  if (!isUnboundedFeasible(x, y)) return null;
  const ball = { x: Math.max(RADIUS, x), y: Math.max(RADIUS, y), vx: 0, vy: 0,
    forces: { damping: { x: 0, y: 0 }, contacts: UNBOUNDED_WALLS.map(() => ({ x: 0, y: 0 })) } };
  projectInside(ball);
  return ball;
}
export function stepUnboundedBall(ball, dt = STEP, force = FORCE, dampingRate = 0, restitution = 0) {
  ball.vx += force.x * dt;
  ball.vy += force.y * dt;
  ball.x = Math.max(RADIUS, ball.x + ball.vx * dt);
  ball.y = Math.max(RADIUS, ball.y + ball.vy * dt);
  projectInside(ball);
  ball.forces = { damping: { x: 0, y: 0 }, contacts: UNBOUNDED_WALLS.map(() => ({ x: 0, y: 0 })) };
  const contacts = UNBOUNDED_WALLS.map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => wall.b - RADIUS - wall.x * ball.x - wall.y * ball.y < 1e-8);
  return solveContactForces(ball, contacts, dt, restitution);
}
