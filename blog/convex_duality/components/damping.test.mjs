import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBoundaryDamping, createBall, stepBall, RADIUS, STEP, DAMPING_RATE } from './physics.mjs';
import { createCurvedBall, stepCurvedBall } from './curved-physics.mjs';

test('boundary damping vanishes at rest and removes only sliding velocity', () => {
  const n={x:0.6,y:0.8}, ball={vx:3,vy:-1};
  const before={...ball};
  const force=applyBoundaryDamping(ball,[n],STEP);
  assert.ok(Math.abs(force.x*n.x+force.y*n.y)<1e-10);
  assert.ok(force.x*before.vx+force.y*before.vy<0);
  assert.ok(Math.hypot(ball.vx,ball.vy)<Math.hypot(before.vx,before.vy));
  const rest={vx:0,vy:0};
  const atRest=applyBoundaryDamping(rest,[n],STEP);
  assert.equal(Math.hypot(atRest.x,atRest.y),0);
  const free={vx:3,vy:-1};
  applyBoundaryDamping(free,[],STEP);
  assert.deepEqual(free,before);
});

test('linear and curved demos use identical physics at the same straight contact', () => {
  const linear=createBall(2,RADIUS), curved=createCurvedBall(2,RADIUS);
  for(const b of [linear,curved]){b.vx=1;b.vy=-0.2;}
  stepBall(linear,STEP,{x:0,y:0});
  stepCurvedBall(curved,STEP,{x:0,y:0});
  assert.ok(Math.abs(linear.vx-Math.exp(-DAMPING_RATE*STEP))<1e-10);
  assert.ok(Math.abs(linear.vx-curved.vx)<1e-10);
  assert.ok(Math.abs(linear.vy-curved.vy)<1e-10);
  assert.deepEqual(linear.forces.damping,curved.forces.damping);
});
