// Maximize x + 0.85y subject to x,y >= 0 and three nonredundant bounds:
// -x + 4y <= 24, x + y <= 9, and 2x - 2y <= 11.
// The additional bound 2x + 3y <= 25 is redundant and strictly slack.
// The slanted right edge lets the region widen above the horizontal axis.
// Unit outward normals make signed distances and circle contacts consistent.
export const OBJECTIVE = Object.freeze({ x: 1, y: 0.85 });
export const FORCE = Object.freeze({ x: 2.5, y: 2.125 });

// Strictly convex quadratic for the fourth demo; Hessian = diag(0.5, 0.7).
export function convexObjective(x, y) {
  return 0.25 * ((x + 1.5) ** 2 + 1.4 * (y + 0.5) ** 2);
}

export function convexObjectiveForce(x, y) {
  return { x: 0.5 * (x + 1.5), y: 0.7 * (y + 0.5) };
}

export function forceForObjective(upward) {
  if (!Number.isFinite(upward) || upward <= 0) return FORCE;
  const x = Math.hypot(FORCE.x, FORCE.y) / Math.hypot(1, upward);
  return { x, y: x * upward };
}
export const RADIUS = 0.12;
export const STEP = 1 / 240;
export const DAMPING_RATE = 0.4;

// All demos use the same viscous damping along the contact tangent.
// At a corner there is no common sliding direction; at rest the force is zero.
export function applyBoundaryDamping(ball, normals, dt, rate = DAMPING_RATE) {
  if (!normals.length) return { x: 0, y: 0 };
  const n = normals[0];
  if (normals.some(w => Math.abs(n.x * w.y - n.y * w.x) > 1e-8)) return { x: 0, y: 0 };
  const normalSpeed = ball.vx * n.x + ball.vy * n.y;
  const loss = 1 - Math.exp(-rate * dt);
  const ix = -loss * (ball.vx - normalSpeed * n.x);
  const iy = -loss * (ball.vy - normalSpeed * n.y);
  ball.vx += ix;
  ball.vy += iy;
  return { x: ix / dt, y: iy / dt };
}
export const WALLS = [
  [-1, 0, 0], [0, -1, 0], [-1, 4, 24], [1, 1, 9], [2, -2, 11], [2, 3, 25],
].map(([x, y, b]) => {
  const length = Math.hypot(x, y);
  return Object.freeze({ x: x / length, y: y / length, b: b / length });
});

export function isFeasible(x, y, radius = 0, tolerance = 1e-9) {
  return Number.isFinite(x) && Number.isFinite(y) &&
    WALLS.every(w => w.x * x + w.y * y <= w.b - radius + tolerance);
}

export function polygon(radius = 0) {
  const points = [];
  for (let i = 0; i < WALLS.length; i++) {
    for (let j = i + 1; j < WALLS.length; j++) {
      const a = WALLS[i], b = WALLS[j], det = a.x * b.y - a.y * b.x;
      if (Math.abs(det) < 1e-10) continue;
      const x = ((a.b - radius) * b.y - a.y * (b.b - radius)) / det;
      const y = (a.x * (b.b - radius) - (a.b - radius) * b.x) / det;
      if (isFeasible(x, y, radius)) points.push({ x, y });
    }
  }
  const center = points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }), { x: 0, y: 0 });
  return points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

const CENTER_POLYGON = polygon(RADIUS);

function projectInside(ball) {
  if (isFeasible(ball.x, ball.y, RADIUS, 0)) return;
  let closest, distance = Infinity;
  for (let i = 0; i < CENTER_POLYGON.length; i++) {
    const a = CENTER_POLYGON[i], b = CENTER_POLYGON[(i + 1) % CENTER_POLYGON.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / (dx * dx + dy * dy)));
    const p = { x: a.x + t * dx, y: a.y + t * dy };
    const d = (ball.x - p.x) ** 2 + (ball.y - p.y) ** 2;
    if (d < distance) { closest = p; distance = d; }
  }
  ball.x = closest.x;
  ball.y = closest.y;
}

export function createBall(x, y) {
  if (!isFeasible(x, y)) return null;
  const ball = { x, y, vx: 0, vy: 0,
    forces: { damping: { x: 0, y: 0 }, contacts: WALLS.map(() => ({ x: 0, y: 0 })) } };
  // Edge clicks remain valid; inset only enough to fit the physical radius.
  projectInside(ball);
  return ball;
}

export function stepBall(ball, dt = STEP, force = FORCE, dampingRate = DAMPING_RATE) {
  const normals = WALLS.filter(w => w.b - RADIUS - w.x * ball.x - w.y * ball.y < 1e-8);
  const damping = applyBoundaryDamping(ball, normals, dt, dampingRate);
  ball.vx += force.x * dt;
  ball.vy += force.y * dt;
  // Record the actual forces used by the integrator (unit mass).
  ball.forces = {
    damping,
    contacts: WALLS.map(() => ({ x: 0, y: 0 })),
  };
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  projectInside(ball);

  const contacts = WALLS.map((wall, index) => ({ wall, index }))
    .filter(({ wall: w }) => w.b - RADIUS - w.x * ball.x - w.y * ball.y < 1e-8);
  return solveContactForces(ball, contacts, dt);
}

export function solveContactForces(ball, normals, dt) {
  const contacts = normals.map(({ wall, index }) => {
      const speed = ball.vx * wall.x + ball.vy * wall.y;
      return { wall, index, impulse: 0, target: speed > 0.18 ? -0.30 * speed : 0 };
    });
  // Accumulated normal impulses permit correcting an earlier contact solve
  // without introducing tangential damping or spurious motion at a corner.
  for (let pass = 0; pass < 32; pass++) {
    for (const contact of contacts) {
      const { wall } = contact;
      const speed = ball.vx * wall.x + ball.vy * wall.y;
      const nextImpulse = Math.max(0, contact.impulse + speed - contact.target);
      const change = nextImpulse - contact.impulse;
      contact.impulse = nextImpulse;
      ball.vx -= change * wall.x;
      ball.vy -= change * wall.y;
    }
  }
  for (const { wall, index, impulse } of contacts) {
    const reaction = ball.forces.contacts[index];
    reaction.x += -impulse * wall.x / dt;
    reaction.y += -impulse * wall.y / dt;
  }
  return ball;
}
