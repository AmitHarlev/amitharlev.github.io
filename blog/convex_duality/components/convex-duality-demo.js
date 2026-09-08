import { FORCE, RADIUS, STEP, WALLS, convexObjectiveForce, createBall, forceForObjective, isFeasible, stepBall } from './physics.mjs';
import { CURVE, CURVE_LINES, REGION_POINTS, createCurvedBall, isCurvedFeasible, stepCurvedBall } from './curved-physics.mjs';

const VIEW = { left: -1.15, right: 10.05, bottom: -1.15, top: 10.05 };
const WIDTH = VIEW.right - VIEW.left, HEIGHT = VIEW.top - VIEW.bottom;
const DOT_DRAG = 3.1;

class ConvexDualityDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.balls = [];
    this.dots = [];
    this.keyboardPoint = { x: 2, y: 2 };
    this.accumulator = 0;
    this.frame = null;
    this.visible = true;
    this.showForces = false;
    this.movingDots = true;
    this.force = FORCE;
    this.forceAt = () => this.force;
    this.tick = this.tick.bind(this);
  }

  connectedCallback() {
    this.curved = this.getAttribute('region') === 'curved';
    this.createBall = this.curved ? createCurvedBall : createBall;
    this.isFeasible = this.curved ? isCurvedFeasible : isFeasible;
    this.stepBall = this.curved ? stepCurvedBall : stepBall;
    const upward = Number(this.getAttribute('objective-y'));
    this.force = forceForObjective(upward);
    this.nonlinear = this.getAttribute('objective') === 'convex';
    this.forceAt = this.nonlinear ? convexObjectiveForce : () => this.force;
    // Retain the static-stroke experiment as an optional background.
    this.fixedArrows = this.getAttribute('background') === 'fixed-arrows';
    this.movingDots = !this.fixedArrows && this.getAttribute('background') !== 'static-strokes';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .box { position: relative; overflow: hidden; border: 1px solid #dce2e3; border-radius: 14px; background: transparent; }
        canvas { display: block; width: 100%; aspect-ratio: 1; touch-action: pan-y; outline: none; }
        .box:focus-within { outline: 2px solid #338a7d; outline-offset: 4px; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .toolbar { position: absolute; top: 14px; right: 14px; font: 14px/1.4 system-ui, sans-serif; color: #4f5d64; }
        .forces-toggle { min-height: 42px; padding: 0 17px; border: 1px solid #cfd7da; border-radius: 9px; background: #fff; color: #4f5d64; font: inherit; font-weight: 500; cursor: pointer; box-shadow: 0 2px 3px #172b3510; transition: background 150ms, box-shadow 150ms, border-color 150ms, transform 150ms; }
        .forces-toggle:hover { background: #f5f7f7; border-color: #aab8bd; }
        .forces-toggle[aria-pressed="true"] { background: #e3e9ec; color: #202e35; border-color: #9aadb7; box-shadow: inset 0 2px 4px #172b3526; transform: translateY(1px); }
        .forces-toggle:active { box-shadow: inset 0 2px 4px #172b3526; transform: translateY(1px); }
        .forces-toggle:focus-visible { outline: 2px solid #338a7d; outline-offset: 3px; }
        .legend { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; padding: 10px 4px 0; font: 14px/1.4 system-ui, sans-serif; color: #4f5d64; }
        .legend[hidden] { display: none; }
        .constraints { padding: 10px 4px 0; color: #4f5d64; font: 14px/1.5 system-ui, sans-serif; }
        .constraints .equations { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 4px; }
        .constraints .equations span { white-space: nowrap; }
        .legend span { display: inline-flex; align-items: center; gap: 6px; }
        .legend i { width: 17px; border-top: 2px solid var(--color); position: relative; }
        .legend i::after { content: ''; position: absolute; right: 0; top: -4.5px; width: 8px; height: 7px; background: var(--color); clip-path: polygon(100% 50%, 0 0, 25% 50%, 0 100%); }
        @media (max-width: 400px) { .toolbar { top: 10px; right: 10px; } .forces-toggle { min-height: 38px; padding: 0 14px; } }
        @media (prefers-reduced-motion: reduce) { .forces-toggle { transition: none; } }
      </style>
      <div class="box">
        <canvas tabindex="0" role="group" aria-label="Interactive constrained ball simulation" aria-describedby="instructions"></canvas>
        <div class="toolbar">
          <button class="forces-toggle" type="button" aria-pressed="${this.showForces}">Show forces</button>
        </div>
      </div>
      ${this.curved ? `<div class="constraints">Shaded region: the intersection, with x<sub>1</sub>, x<sub>2</sub> ≥ 0.
        <div class="equations"><span>x<sub>2</sub> ≤ 0.3x<sub>1</sub> + 4.75</span><span>x<sub>2</sub> ≥ 2.9x<sub>1</sub> − 17.65</span><span>(x<sub>1</sub> − 3.2)² + (x<sub>2</sub> − 2.8)² ≤ 4.6²</span></div>
      </div>` : ''}
      <div class="legend" ${!this.showForces ? 'hidden' : ''}>
        <span><i style="--color:#bb701d"></i>Gravity (objective)</span>
        <span><i style="--color:#2878bc"></i>Normal (constraints)</span>
        <span><i style="--color:#c43d3d"></i>Damping</span>
      </div>
      <p id="instructions" class="sr-only">Click or tap inside the region bounded by the axes and constraints to release a ball at rest, replacing the previous ball. ${this.nonlinear ? 'The force follows the local gradient of a convex quadratic objective, changing direction and strength with position.' : 'A constant force pushes up and right.'} Arrow keys move a placement point; Enter or Space releases a ball. Escape clears the ball. Enable forces to show the objective force in orange and normal forces in blue. Normal forces are briefly averaged to make impacts visible; all arrows share a common scale.</p>
      <span class="sr-only" role="status" aria-live="polite"></span>`;
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    this.shadowRoot.querySelector('.forces-toggle').addEventListener('click', e => {
      this.showForces = !this.showForces;
      e.currentTarget.setAttribute('aria-pressed', String(this.showForces));
      this.shadowRoot.querySelector('.legend').hidden = !this.showForces;
      this.draw();
    }, options);
    this.canvas.addEventListener('click', e => {
      const p = this.fromPointer(e);
      this.addBall(p.x, p.y);
    }, options);
    this.canvas.addEventListener('pointermove', e => {
      const p = this.fromPointer(e);
      this.canvas.style.cursor = this.isFeasible(p.x, p.y) ? 'crosshair' : 'default';
    }, options);
    this.canvas.addEventListener('keydown', e => this.onKey(e), options);
    this.canvas.addEventListener('blur', () => { this.keyboardActive = false; this.draw(); }, options);
    document.addEventListener('visibilitychange', () => this.restart(), options);
    this.motion.addEventListener('change', () => this.restart(), options);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.restart();
    });
    this.intersectionObserver.observe(this);
    this.resize();
    this.restart();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.scale = rect.width / WIDTH;
    // Roughly 39 CSS pixels between dots, including on smaller screens.
    const cols = Math.max(6, Math.round(rect.width / 39));
    const rows = Math.max(6, Math.round(rect.height / 39));
    const maxForce = Math.max(...[VIEW.left, VIEW.right].flatMap(x => [VIEW.bottom, VIEW.top].map(y => {
      const force = this.forceAt(x, y);
      return Math.hypot(force.x, force.y);
    })), 1e-9);
    this.fieldArrowScale = 0.50 * Math.min(rect.width / cols, rect.height / rows) / maxForce;
    this.dots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const jitter = Math.sin(row * 73.1 + col * 39.7);
        const dot = {
          x: VIEW.left + ((col + 0.5 + (this.fixedArrows ? 0 : 0.18 * jitter)) / cols) * WIDTH,
          y: VIEW.bottom + ((row + 0.5 + (this.fixedArrows ? 0 : 0.18 * Math.cos(col * 51 + row * 19))) / rows) * HEIGHT,
        };
        const force = this.forceAt(dot.x, dot.y);
        this.dots.push({ ...dot, vx: force.x / DOT_DRAG, vy: force.y / DOT_DRAG });
      }
    }
    this.draw();
  }

  fromPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: VIEW.left + (e.clientX - rect.left) / rect.width * WIDTH,
      y: VIEW.top - (e.clientY - rect.top) / rect.height * HEIGHT };
  }

  addBall(x, y) {
    const ball = this.createBall(x, y);
    if (!ball) return;
    ball.displayForces = ball.forces.contacts.map(() => ({ x: 0, y: 0 }));
    ball.displayForces.push({ x: 0, y: 0 });
    this.balls = [ball];
    this.shadowRoot.querySelector('[role="status"]').textContent = 'Ball released. The force carries it up and right within the constraints.';
    this.draw();
  }

  onKey(e) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (direction) {
      e.preventDefault();
      this.keyboardActive = true;
      const p = this.keyboardPoint;
      const next = this.createBall(p.x + 0.2 * direction[0], p.y + 0.2 * direction[1]);
      if (next) this.keyboardPoint = { x: next.x, y: next.y };
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.keyboardActive = true;
      this.addBall(this.keyboardPoint.x, this.keyboardPoint.y);
    } else if (e.key === 'Escape') {
      this.balls = [];
      this.keyboardActive = false;
    }
    this.draw();
  }

  restart() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastTime = null;
    this.accumulator = 0;
    if (this.visible && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  }

  tick(now) {
    if (this.lastTime !== null) this.accumulator += Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    while (this.accumulator >= STEP) {
      for (const ball of this.balls) {
        this.stepBall(ball, STEP, this.forceAt(ball.x, ball.y));
        // Average collision impulses over 80ms so a brief impact can be seen.
        const blend = 1 - Math.exp(-STEP / 0.08);
        const displayed = [...ball.forces.contacts, ball.forces.damping];
        displayed.forEach((force, i) => {
          ball.displayForces[i].x += blend * (force.x - ball.displayForces[i].x);
          ball.displayForces[i].y += blend * (force.y - ball.displayForces[i].y);
        });
      }
      if (this.movingDots && !this.motion.matches) {
        const drag = Math.exp(-DOT_DRAG * STEP);
        for (const dot of this.dots) {
          const force = this.forceAt(dot.x, dot.y);
          dot.vx = dot.vx * drag + force.x / DOT_DRAG * (1 - drag);
          dot.vy = dot.vy * drag + force.y / DOT_DRAG * (1 - drag);
          const escaped = dot.x + dot.vx * STEP < VIEW.left || dot.x + dot.vx * STEP > VIEW.right ||
            dot.y + dot.vy * STEP < VIEW.bottom || dot.y + dot.vy * STEP > VIEW.top;
          dot.x = VIEW.left + ((dot.x + dot.vx * STEP - VIEW.left) % WIDTH + WIDTH) % WIDTH;
          dot.y = VIEW.bottom + ((dot.y + dot.vy * STEP - VIEW.bottom) % HEIGHT + HEIGHT) % HEIGHT;
          if (this.nonlinear && escaped) {
            const enteringForce = this.forceAt(dot.x, dot.y);
            dot.vx = enteringForce.x / DOT_DRAG;
            dot.vy = enteringForce.y / DOT_DRAG;
          }
        }
      }
      this.accumulator -= STEP;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  }

  screen(x, y) { return [(x - VIEW.left) * this.scale, (VIEW.top - y) * this.scale]; }

  line(x1, y1, x2, y2) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(...this.screen(x1, y1));
    c.lineTo(...this.screen(x2, y2));
    c.stroke();
  }

  drawAxisLabel(index, x, y, align = 'left') {
    const c = this.ctx;
    c.save();
    c.fillStyle = '#4f5d64';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = 'italic 20px Georgia, serif';
    const baseWidth = c.measureText('x').width;
    c.font = '12px Georgia, serif';
    const subWidth = c.measureText(String(index)).width;
    const left = align === 'right' ? x - baseWidth - subWidth : x;
    c.font = 'italic 20px Georgia, serif';
    c.fillText('x', left, y);
    // Draw the smaller, upright index explicitly below the main baseline.
    c.font = '12px Georgia, serif';
    c.fillText(String(index), left + baseWidth, y + 5);
    c.restore();
  }

  drawLatexArrow(startX, startY, endX, endY, head, addHeadBeyondShaft = false) {
    const c = this.ctx;
    const length = Math.hypot(endX - startX, endY - startY);
    const angle = Math.atan2(endY - startY, endX - startX);
    // Magnitude determines the shaft alone; the fixed head is additional.
    const extension = addHeadBeyondShaft ? head : 0;
    const totalLength = length + extension;
    c.save();
    c.translate(endX + extension * Math.cos(angle), endY + extension * Math.sin(angle));
    c.rotate(angle);
    // Fill the shaft and tip together so their translucent overlap is painted
    // only once, with no darker seam or shaft showing through the arrowhead.
    c.fillStyle = c.strokeStyle;
    c.beginPath();
    if (totalLength > head * 0.72) {
      c.rect(-totalLength, -c.lineWidth / 2, totalLength - head * 0.72, c.lineWidth);
    }
    c.moveTo(0, 0);
    c.quadraticCurveTo(-head * 0.45, head * 0.1, -head, head * 0.42);
    c.quadraticCurveTo(-head * 0.72, 0, -head, -head * 0.42);
    c.quadraticCurveTo(-head * 0.45, -head * 0.1, 0, 0);
    c.closePath();
    c.fill();
    c.restore();
  }

  drawForces(ball) {
    const c = this.ctx;
    const vectors = [this.forceAt(ball.x, ball.y), ...ball.displayForces];
    // A common scale preserves relative magnitudes even during strong impacts.
    const largest = Math.max(4, ...vectors.map(v => Math.hypot(v.x, v.y)));
    const factor = this.nonlinear ? Math.min(0.35, 2.4 / largest) : 2 / largest;
    const [x, y] = this.screen(ball.x, ball.y);
    c.save();
    c.lineWidth = 2.3;
    c.lineCap = 'round';
    vectors.forEach((v, i) => {
      const isDamping = i === vectors.length - 1;
      // Suppress the damping indicator only when motion is visually negligible.
      // Objective and normal forces remain visible at equilibrium.
      if (isDamping && Math.hypot(ball.vx, ball.vy) * this.scale < 1) return;
      const dx = v.x * factor * this.scale, dy = -v.y * factor * this.scale;
      const length = Math.hypot(dx, dy);
      // Hide only numerical zero, not weak forces with subpixel shafts.
      if (Math.hypot(v.x, v.y) < 1e-6 || length === 0) return;
      const ux = dx / length, uy = dy / length;
      const head = 8;
      // Keep the entire scaled vector outside the ball, including weak forces.
      const offset = RADIUS * this.scale + 2;
      const startX = x + offset * ux, startY = y + offset * uy;
      const endX = startX + dx, endY = startY + dy;
      c.strokeStyle = i === 0 ? '#bb701d' : i === vectors.length - 1 ? '#c43d3d' : '#2878bc';
      this.drawLatexArrow(startX, startY, endX, endY, head, true);
    });
    c.restore();
  }

  draw() {
    if (!this.width || !this.height) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.save();
    c.fillStyle = 'rgba(104, 116, 122, 0.23)';
    c.strokeStyle = 'rgba(104, 116, 122, 0.23)';
    c.lineWidth = 1.9;
    c.lineCap = 'round';
    c.beginPath();
    for (const dot of this.dots) {
      const [x, y] = this.screen(dot.x, dot.y);
      if (this.movingDots) {
        c.moveTo(x + 1.25, y);
        c.arc(x, y, 1.25, 0, Math.PI * 2);
      } else if (this.fixedArrows) {
        const force = this.forceAt(dot.x, dot.y);
        const dx = force.x * this.fieldArrowScale, dy = -force.y * this.fieldArrowScale;
        const length = Math.hypot(dx, dy);
        if (length < 0.5) continue;
        const tipX = x + dx / 2, tipY = y + dy / 2;
        const head = 7;
        this.drawLatexArrow(x - dx / 2, y - dy / 2, tipX, tipY, head, true);
      } else {
        const force = this.forceAt(dot.x, dot.y);
        const forceLength = Math.hypot(force.x, force.y) || 1;
        const halfDx = 5 * force.x / forceLength;
        const halfDy = -5 * force.y / forceLength;
        c.moveTo(x - halfDx, y - halfDy);
        c.lineTo(x + halfDx, y + halfDy);
      }
    }
    if (this.movingDots) c.fill();
    else if (!this.fixedArrows) c.stroke();
    c.restore();

    c.save();
    c.beginPath();
    c.rect(15, 15, Math.max(0, this.width - 30), Math.max(0, this.height - 30));
    c.clip();
    c.lineWidth = 2;
    c.strokeStyle = '#4f5d64';
    if (this.curved) {
      c.beginPath();
      c.moveTo(...this.screen(REGION_POINTS[0].x, REGION_POINTS[0].y));
      for (const p of REGION_POINTS.slice(1)) c.lineTo(...this.screen(p.x, p.y));
      c.closePath();
      c.fillStyle = 'rgba(70, 107, 119, 0.08)';
      c.fill();
      c.stroke();
      // Extend every constraint beyond the active boundary of the intersection.
      c.lineWidth = 1.3;
      c.globalAlpha = 0.55;
      c.setLineDash([5, 5]);
      c.beginPath();
      c.arc(...this.screen(CURVE.x, CURVE.y), CURVE.radius * this.scale, 0, Math.PI * 2);
      c.stroke();
      for (const wall of CURVE_LINES) {
        this.line(VIEW.left, (wall.b - wall.x * VIEW.left) / wall.y, VIEW.right, (wall.b - wall.x * VIEW.right) / wall.y);
      }
    } else for (const wall of WALLS.slice(2)) {
      if (Math.abs(wall.y) < 1e-10) this.line(wall.b / wall.x, VIEW.bottom, wall.b / wall.x, VIEW.top);
      else this.line(VIEW.left, (wall.b - wall.x * VIEW.left) / wall.y, VIEW.right, (wall.b - wall.x * VIEW.right) / wall.y);
    }
    c.restore();

    c.strokeStyle = '#4f5d64';
    c.lineWidth = 2;
    const pad = 22 / this.scale;
    this.drawLatexArrow(...this.screen(VIEW.left + pad, 0), ...this.screen(VIEW.right - pad, 0), 7);
    this.drawLatexArrow(...this.screen(0, VIEW.bottom + pad), ...this.screen(0, VIEW.top - pad), 7);
    // Small unlabeled ticks keep the coordinate plane readable without a grid.
    c.lineWidth = 1.3;
    const tick = 3 / this.scale;
    for (let x = 1; x <= 9; x++) this.line(x, -tick, x, tick);
    for (let y = 1; y < VIEW.top - pad; y++) this.line(-tick, y, tick, y);
    c.lineWidth = 2;

    const [axisRight, axisY] = this.screen(VIEW.right - pad, 0);
    this.drawAxisLabel(1, axisRight, axisY + 18, 'right');
    const [axisX, axisTop] = this.screen(0, VIEW.top - pad);
    this.drawAxisLabel(2, axisX + 12, axisTop + 7);

    for (const ball of this.balls) {
      if (this.showForces) this.drawForces(ball);
      const [x, y] = this.screen(ball.x, ball.y), radius = RADIUS * this.scale;
      c.fillStyle = '#000';
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    }
    if (this.keyboardActive) {
      const [x, y] = this.screen(this.keyboardPoint.x, this.keyboardPoint.y);
      c.strokeStyle = '#298573';
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(x, y, RADIUS * this.scale + 4, 0, Math.PI * 2);
      c.stroke();
    }
  }
}

customElements.define('convex-duality-demo', ConvexDualityDemo);
