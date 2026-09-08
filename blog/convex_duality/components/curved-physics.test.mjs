import test from 'node:test';
import assert from 'node:assert/strict';
import { FORCE, RADIUS, STEP } from './physics.mjs';
import { CURVE, CURVE_LINES, REGION_POINTS, createCurvedBall, isCurvedFeasible, stepCurvedBall } from './curved-physics.mjs';

test('each of the three constraints independently excludes points', () => {
  for (const [point, excluded] of [[{x:3.2,y:7},0],[{x:7,y:1},1],[{x:8,y:6},2]]) {
    const conditions = [...CURVE_LINES.map(w=>w.x*point.x+w.y*point.y<=w.b), Math.hypot(point.x-CURVE.x,point.y-CURVE.y)<=CURVE.radius];
    assert.deepEqual(conditions, [0,1,2].map(i=>i!==excluded));
    assert.equal(createCurvedBall(point.x,point.y),null);
  }
  assert.ok(isCurvedFeasible(0,0));
});

test('edge clicks produce stationary balls that fit the exact intersection', () => {
  for(const p of [{x:0,y:0},{x:2,y:2},...REGION_POINTS]) {
    const ball=createCurvedBall(p.x,p.y);
    assert.ok(ball);
    assert.ok(isCurvedFeasible(ball.x,ball.y,RADIUS));
    assert.equal(ball.vx,0);assert.equal(ball.vy,0);
  }
});

test('collisions remain confined and report each constraint normal separately', () => {
  for(const p of [{x:0,y:0},{x:0,y:4},{x:5,y:0},{x:2,y:2},{x:4,y:4}]) {
    const ball=createCurvedBall(p.x,p.y);
    for(let i=0;i<30/STEP;i++) {
      const before={x:ball.vx,y:ball.vy};
      stepCurvedBall(ball);
      assert.ok(isCurvedFeasible(ball.x,ball.y,RADIUS,1e-8));
      assert.equal(ball.forces.contacts.length,5);
      const radial=ball.forces.contacts[4],dx=ball.x-CURVE.x,dy=ball.y-CURVE.y;
      assert.ok(radial.x*dx+radial.y*dy<=1e-8);
      assert.ok(Math.abs(radial.x*dy-radial.y*dx)<1e-8);
      CURVE_LINES.forEach((w,index)=> {
        const f=ball.forces.contacts[index+2];
        assert.ok(Math.abs(f.x*w.y-f.y*w.x)<1e-8);
        assert.ok(f.x*w.x+f.y*w.y<=1e-8);
      });
      const net=[FORCE,ball.forces.damping,...ball.forces.contacts].reduce((s,f)=>({x:s.x+f.x,y:s.y+f.y}),{x:0,y:0});
      assert.ok(Math.abs(net.x-(ball.vx-before.x)/STEP)<1e-8);
      assert.ok(Math.abs(net.y-(ball.vy-before.y)/STEP)<1e-8);
    }
  }
});

test('the circular normal balances the objective at its maximizing point', () => {
  const magnitude=Math.hypot(FORCE.x,FORCE.y);
  const ball=createCurvedBall(CURVE.x+(CURVE.radius-RADIUS)*FORCE.x/magnitude,CURVE.y+(CURVE.radius-RADIUS)*FORCE.y/magnitude);
  assert.ok(ball);
  for(let i=0;i<240;i++)stepCurvedBall(ball);
  assert.ok(Math.hypot(ball.vx,ball.vy)<1e-8);
  const normal=ball.forces.contacts[4];
  assert.ok(Math.hypot(normal.x+FORCE.x,normal.y+FORCE.y)<1e-8);
});

test('fast impacts remain in the exact disk and both half-planes', () => {
  const ball=createCurvedBall(0,0);ball.vx=150;ball.vy=-100;
  for(let i=0;i<3000;i++){stepCurvedBall(ball);assert.ok(isCurvedFeasible(ball.x,ball.y,RADIUS,1e-8));}
});
