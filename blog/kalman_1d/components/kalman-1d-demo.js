const MIN_X = 0;
const MAX_X = 100;
const START_X = 12;
const VELOCITY = 4.6;
const MOTION_SEGMENT_SECONDS = 0.45;
const INITIAL_VARIANCE = 0.8 * 0.8;
const MOTION_LOG_SIGMA = 0.45;
const GPS_SIGMA = 7.5;
const GPS_VARIANCE = GPS_SIGMA * GPS_SIGMA;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gaussian(x, mean, sigma) {
  const normalized = (x - mean) / sigma;
  return Math.exp(-0.5 * normalized * normalized) / (sigma * Math.sqrt(2 * Math.PI));
}

function randn() {
  const u1 = Math.max(Number.MIN_VALUE, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function meanOneLognormal() {
  return Math.exp(-0.5 * MOTION_LOG_SIGMA * MOTION_LOG_SIGMA + MOTION_LOG_SIGMA * randn());
}

function fmt(value, digits = 1) {
  return Number(value).toFixed(digits);
}

const MOTION_MULTIPLIER_VARIANCE = Math.exp(MOTION_LOG_SIGMA * MOTION_LOG_SIGMA) - 1;

class Kalman1dDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.resetState();
  }

  connectedCallback() {
    this.gain = this.modelState().optimalGain;
    this.render();
  }

  disconnectedCallback() {
    this.playing = false;
  }

  resetState() {
    this.time = 0;
    this.truePosition = START_X;
    this.estimateMean = START_X;
    this.estimateVariance = INITIAL_VARIANCE;
    this.measurementMean = null;
    this.gain = 0.5;
    this.gainTouched = false;
    this.playing = false;
    this.lastFrame = null;
    this.motionSegmentElapsed = 0;
    this.currentMotionMultiplier = meanOneLognormal();
  }

  hasMeasurement() {
    return Number.isFinite(this.measurementMean);
  }

  modelState() {
    const priorSigma = Math.sqrt(Math.max(this.estimateVariance, 0.05));
    const optimalGain = this.estimateVariance / (this.estimateVariance + GPS_VARIANCE);
    const showMeasurement = this.hasMeasurement();
    const gain = showMeasurement ? clamp(this.gain, 0, 1) : 0;
    const measurementMean = showMeasurement ? this.measurementMean : this.truePosition;
    const fusedMean = (1 - gain) * this.estimateMean + gain * measurementMean;
    const fusedVariance = (1 - gain) * (1 - gain) * this.estimateVariance
      + gain * gain * GPS_VARIANCE;
    const fusedSigma = Math.sqrt(Math.max(fusedVariance, 0.05));

    return {
      time: this.time,
      truePosition: this.truePosition,
      priorMean: this.estimateMean,
      priorSigma,
      measurementMean,
      measurementSigma: GPS_SIGMA,
      optimalGain,
      showMeasurement,
      gain,
      fusedMean,
      fusedSigma,
      atEnd: this.estimateMean >= MAX_X || this.truePosition >= MAX_X
    };
  }

  startNextMotionSegment() {
    this.motionSegmentElapsed = 0;
    this.currentMotionMultiplier = meanOneLognormal();
  }

  motionVarianceForDuration(duration) {
    const nominalDistance = VELOCITY * duration;
    return nominalDistance * nominalDistance * MOTION_MULTIPLIER_VARIANCE;
  }

  advanceBy(dt) {
    let remaining = Math.min(dt, 0.5);

    while (remaining > 0 && this.playing) {
      const segmentRemaining = MOTION_SEGMENT_SECONDS - this.motionSegmentElapsed;
      const chunk = Math.min(remaining, segmentRemaining);
      const previousSegmentElapsed = this.motionSegmentElapsed;
      const nextSegmentElapsed = previousSegmentElapsed + chunk;

      this.time += chunk;
      this.estimateMean = clamp(this.estimateMean + VELOCITY * chunk, MIN_X, MAX_X);
      this.estimateVariance += this.motionVarianceForDuration(nextSegmentElapsed)
        - this.motionVarianceForDuration(previousSegmentElapsed);
      this.truePosition = clamp(
        this.truePosition + VELOCITY * this.currentMotionMultiplier * chunk,
        MIN_X,
        MAX_X
      );

      this.motionSegmentElapsed = nextSegmentElapsed;
      remaining -= chunk;

      if (this.estimateMean >= MAX_X || this.truePosition >= MAX_X) {
        this.playing = false;
      }

      if (this.playing && this.motionSegmentElapsed >= MOTION_SEGMENT_SECONDS - 1e-9) {
        this.startNextMotionSegment();
      }
    }
  }

  setGain(value) {
    this.gainTouched = true;
    this.gain = clamp(Number(value), 0, 1);
    this.render();
  }

  resetRun() {
    this.resetState();
    this.gain = this.modelState().optimalGain;
    this.render();
  }

  togglePlay() {
    if (this.playing) {
      this.playing = false;
      this.render();
      return;
    }

    this.measurementMean = null;
    this.gainTouched = false;
    this.playing = true;
    this.lastFrame = null;
    this.render();
    requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  tick(timestamp) {
    if (!this.playing) {
      return;
    }

    if (this.lastFrame === null) {
      this.lastFrame = timestamp;
      requestAnimationFrame((next) => this.tick(next));
      return;
    }

    const elapsed = (timestamp - this.lastFrame) / 1000;
    this.lastFrame = timestamp;
    this.advanceBy(elapsed);

    this.render();

    if (this.playing) {
      requestAnimationFrame((next) => this.tick(next));
    }
  }

  takeMeasurement() {
    this.playing = false;
    this.measurementMean = clamp(this.truePosition + GPS_SIGMA * randn(), MIN_X, MAX_X);
    const state = this.modelState();
    this.gain = state.optimalGain;
    this.gainTouched = false;
    this.render();
  }

  useKalmanGain() {
    const state = this.modelState();
    this.gainTouched = false;
    this.gain = state.optimalGain;
    this.render();
  }

  updateState() {
    const state = this.modelState();

    if (!state.showMeasurement) {
      return;
    }

    this.estimateMean = clamp(state.fusedMean, MIN_X, MAX_X);
    this.estimateVariance = state.fusedSigma * state.fusedSigma;
    this.measurementMean = null;
    this.gain = this.modelState().optimalGain;
    this.gainTouched = false;
    this.render();
  }

  xScale(x) {
    const left = 52;
    const right = 668;
    return left + ((x - MIN_X) / (MAX_X - MIN_X)) * (right - left);
  }

  curvePath(mean, sigma, baseline, height) {
    const samples = 420;
    const pdfAtMean = gaussian(mean, mean, sigma);
    const points = [];

    for (let i = 0; i <= samples; i += 1) {
      const x = MIN_X + (i / samples) * (MAX_X - MIN_X);
      const y = baseline - (gaussian(x, mean, sigma) / pdfAtMean) * height;
      points.push(`${fmt(this.xScale(x), 2)},${fmt(y, 2)}`);
    }

    return points.join(" ");
  }

  marker(x, y, color, label, muted = false) {
    return `
      <g class="${muted ? "muted-marker" : ""}">
        <line x1="${this.xScale(x)}" x2="${this.xScale(x)}" y1="${y - 62}" y2="${y + 9}" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" />
        <circle cx="${this.xScale(x)}" cy="${y}" r="6" fill="${color}" />
        <text x="${this.xScale(x)}" y="${y + 25}" text-anchor="middle">${label}</text>
      </g>
    `;
  }

  robot(x, y) {
    const sx = this.xScale(x);

    return `
      <g class="robot" transform="translate(${sx - 22} ${y - 28})">
        <line x1="22" y1="0" x2="22" y2="8" stroke="#4f5b62" stroke-width="3" stroke-linecap="round" />
        <circle cx="22" cy="-2" r="3" fill="#d26b2c" />
        <rect x="7" y="8" width="30" height="24" rx="5" fill="#4f6d7a" />
        <circle cx="16" cy="19" r="3" fill="#fbfbf8" />
        <circle cx="28" cy="19" r="3" fill="#fbfbf8" />
        <path d="M15 27 H29" stroke="#fbfbf8" stroke-width="2" stroke-linecap="round" />
        <line x1="7" y1="18" x2="0" y2="24" stroke="#4f5b62" stroke-width="3" stroke-linecap="round" />
        <line x1="37" y1="18" x2="44" y2="24" stroke="#4f5b62" stroke-width="3" stroke-linecap="round" />
        <circle cx="12" cy="37" r="5" fill="#2d2d2d" />
        <circle cx="32" cy="37" r="5" fill="#2d2d2d" />
      </g>
    `;
  }

  renderSvg(state) {
    const plotBaseline = 184;
    const plotHeight = 92;
    const trackY = 278;
    const priorPath = this.curvePath(state.priorMean, state.priorSigma, plotBaseline, plotHeight);
    const measurementPath = this.curvePath(state.measurementMean, state.measurementSigma, plotBaseline, plotHeight);
    const fusedPath = this.curvePath(state.fusedMean, state.fusedSigma, plotBaseline, plotHeight);

    return `
      <svg viewBox="0 0 720 330" role="img" aria-label="One-dimensional Kalman filter robot demo">
        <rect x="0" y="0" width="720" height="330" rx="8" fill="#fbfbf8" />

        <line x1="${this.xScale(MIN_X)}" y1="${plotBaseline}" x2="${this.xScale(MAX_X)}" y2="${plotBaseline}" stroke="#c9c9c1" stroke-width="1" />
        <line x1="${this.xScale(MIN_X)}" y1="${trackY}" x2="${this.xScale(MAX_X)}" y2="${trackY}" stroke="#545454" stroke-width="3" stroke-linecap="round" />

        <text x="${this.xScale(MIN_X)}" y="${trackY + 28}" text-anchor="middle">0 m</text>
        <text x="${this.xScale(MAX_X)}" y="${trackY + 28}" text-anchor="middle">100 m</text>

        <polyline points="${priorPath}" fill="none" stroke="#2f6fbb" stroke-width="3" />
        <path d="M${priorPath} L${this.xScale(MAX_X)},${plotBaseline} L${this.xScale(MIN_X)},${plotBaseline} Z" fill="#2f6fbb" opacity="0.1" />

        ${state.showMeasurement ? `
          <polyline points="${measurementPath}" fill="none" stroke="#d26b2c" stroke-width="3" />
          <path d="M${measurementPath} L${this.xScale(MAX_X)},${plotBaseline} L${this.xScale(MIN_X)},${plotBaseline} Z" fill="#d26b2c" opacity="0.1" />
          <polyline points="${fusedPath}" fill="none" stroke="#2f8f5b" stroke-width="4" />
          <path d="M${fusedPath} L${this.xScale(MAX_X)},${plotBaseline} L${this.xScale(MIN_X)},${plotBaseline} Z" fill="#2f8f5b" opacity="0.12" />
        ` : ""}

        ${this.marker(state.priorMean, plotBaseline, "#2f6fbb", "prediction")}
        ${state.showMeasurement ? this.marker(state.measurementMean, plotBaseline, "#d26b2c", "GPS") : ""}
        ${state.showMeasurement ? this.marker(state.fusedMean, plotBaseline, "#2f8f5b", "joint") : ""}
        ${this.marker(state.truePosition, trackY, "#444444", "true", true)}
        ${this.robot(state.truePosition, trackY)}

        <g class="legend" transform="translate(54 34)">
          <circle cx="0" cy="0" r="5" fill="#2f6fbb" />
          <text x="12" y="4">state dynamics</text>
          <circle cx="146" cy="0" r="5" fill="#d26b2c" />
          <text x="158" y="4">measurement</text>
          <circle cx="286" cy="0" r="5" fill="#2f8f5b" />
          <text x="298" y="4">joint estimate</text>
        </g>

        <text x="666" y="42" text-anchor="end" class="time-label">t = ${fmt(state.time, 1)} s</text>
      </svg>
    `;
  }

  renderStats(state) {
    if (!state.showMeasurement) {
      return `
        <div class="stat-grid">
          <div><span>Dynamics</span><strong>${fmt(state.priorMean)} m, sigma ${fmt(state.priorSigma)} m</strong></div>
          <div><span>Measurement</span><strong>${this.playing ? "pause to measure" : "ready"}</strong></div>
          <div><span>Joint estimate</span><strong>waiting for measurement</strong></div>
        </div>
      `;
    }

    return `
      <div class="stat-grid">
        <div><span>Dynamics</span><strong>${fmt(state.priorMean)} m, sigma ${fmt(state.priorSigma)} m</strong></div>
        <div><span>Measurement</span><strong>${fmt(state.measurementMean)} m, sigma ${fmt(state.measurementSigma)} m</strong></div>
        <div><span>Joint estimate</span><strong>${fmt(state.fusedMean)} m, sigma ${fmt(state.fusedSigma)} m</strong></div>
      </div>
    `;
  }

  updateDom(state) {
    const activeControl = this.shadowRoot.activeElement?.getAttribute("data-control");
    const gainDisabled = !state.showMeasurement;
    const measureDisabled = this.playing || state.atEnd;

    this.shadowRoot.querySelector(".canvas-wrap").innerHTML = this.renderSvg(state);
    this.shadowRoot.querySelector('[data-action="play"]').textContent = this.playing ? "Pause" : "Play";
    this.shadowRoot.querySelector('[data-action="play"]').disabled = state.atEnd && !this.playing;
    this.shadowRoot.querySelector('[data-action="measure"]').disabled = measureDisabled;
    this.shadowRoot.querySelector('[data-action="update"]').disabled = !state.showMeasurement;

    const gainInput = this.shadowRoot.querySelector('[data-control="gain"]');
    if (gainInput) {
      gainInput.disabled = gainDisabled;
      if (activeControl !== "gain") {
        gainInput.value = state.gain;
      }
    }

    const gainLabel = this.shadowRoot.querySelector('[data-label="gain"]');
    if (gainLabel) {
      gainLabel.textContent = `trust measurement: ${fmt(state.gain * 100, 0)}%`;
    }

    const kalmanButton = this.shadowRoot.querySelector('[data-action="kalman"]');
    if (kalmanButton) {
      kalmanButton.disabled = gainDisabled;
      kalmanButton.textContent = `Kalman gain: ${fmt(state.optimalGain * 100, 0)}%`;
    }

    this.shadowRoot.querySelector('[data-region="stats"]').innerHTML = this.renderStats(state);
  }

  render() {
    const state = this.modelState();
    const gainDisabled = state.showMeasurement ? "" : "disabled";
    const updateDisabled = state.showMeasurement ? "" : "disabled";
    const measureDisabled = this.playing || state.atEnd ? "disabled" : "";
    const kalmanPercent = fmt(state.optimalGain * 100, 0);

    if (this.shadowRoot.querySelector(".demo")) {
      this.updateDom(state);
      return;
    }

    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="demo">
        <div class="canvas-wrap">
          ${this.renderSvg(state)}
        </div>

        <div class="controls">
          <button type="button" data-action="play">${this.playing ? "Pause" : "Play"}</button>
          <button type="button" data-action="measure" ${measureDisabled}>Measure</button>
          <button type="button" data-action="update" ${updateDisabled}>Update state</button>
          <button type="button" data-action="reset">Reset</button>
          <label>
            <span data-label="gain">trust measurement: ${fmt(state.gain * 100, 0)}%</span>
            <input type="range" min="0" max="1" step="0.01" value="${state.gain}" data-control="gain" ${gainDisabled}>
          </label>
          <button type="button" data-action="kalman" ${gainDisabled}>Kalman gain: ${kalmanPercent}%</button>
        </div>

        <div data-region="stats">
          ${this.renderStats(state)}
        </div>
      </div>
    `;

    this.shadowRoot.querySelector('[data-action="play"]')?.addEventListener("click", () => this.togglePlay());
    this.shadowRoot.querySelector('[data-action="measure"]')?.addEventListener("click", () => this.takeMeasurement());
    this.shadowRoot.querySelector('[data-action="update"]')?.addEventListener("click", () => this.updateState());
    this.shadowRoot.querySelector('[data-action="reset"]')?.addEventListener("click", () => this.resetRun());
    this.shadowRoot.querySelector('[data-action="kalman"]')?.addEventListener("click", () => this.useKalmanGain());
    this.shadowRoot.querySelector('[data-control="gain"]')?.addEventListener("input", (event) => this.setGain(event.target.value));
    this.shadowRoot.querySelector('[data-control="gain"]')?.addEventListener("change", (event) => this.setGain(event.target.value));
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          color: #272727;
          font-family: inherit;
        }

        .demo {
          border: 1px solid #d7d7ce;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.06);
        }

        .canvas-wrap {
          width: 100%;
          background: #fbfbf8;
          border-bottom: 1px solid #e2e2dc;
        }

        svg {
          display: block;
          width: 100%;
          height: auto;
        }

        svg text {
          fill: #333333;
          font-size: 13px;
        }

        .time-label {
          font-weight: 700;
        }

        .legend text {
          font-size: 12px;
        }

        .muted-marker {
          opacity: 0.55;
        }

        .controls {
          display: grid;
          grid-template-columns: auto auto auto auto minmax(190px, 1fr) auto;
          gap: 0.7rem;
          align-items: center;
          padding: 0.9rem;
          border-bottom: 1px solid #e8e8e1;
        }

        label {
          display: grid;
          gap: 0.25rem;
          min-width: 0;
          font-size: 0.78rem;
          font-weight: 700;
          color: #555555;
        }

        input[type="range"] {
          width: 100%;
          accent-color: #2f8f5b;
        }

        button {
          appearance: none;
          border: 1px solid #b9beb8;
          border-radius: 6px;
          background: #f6f7f4;
          color: #222222;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          line-height: 1;
          padding: 0.55rem 0.65rem;
          cursor: pointer;
          white-space: nowrap;
        }

        button:hover,
        button:focus-visible {
          border-color: #2f8f5b;
          color: #1d6a42;
        }

        button:focus-visible {
          outline: 2px solid #8bc9aa;
          outline-offset: 2px;
        }

        button:disabled,
        input:disabled {
          cursor: not-allowed;
          opacity: 0.46;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
        }

        .stat-grid > div {
          padding: 0.75rem 0.9rem;
          border-right: 1px solid #e8e8e1;
          min-width: 0;
        }

        .stat-grid > div:last-child {
          border-right: 0;
        }

        .stat-grid span,
        .stat-grid strong {
          display: block;
        }

        .stat-grid span {
          color: #666666;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .stat-grid strong {
          margin-top: 0.15rem;
          font-size: 0.86rem;
          line-height: 1.35;
        }

        @media (max-width: 860px) {
          .controls {
            grid-template-columns: 1fr 1fr;
          }

          .controls label {
            grid-column: 1 / -1;
          }

          .stat-grid {
            grid-template-columns: 1fr;
          }

          .stat-grid > div {
            border-right: 0;
            border-bottom: 1px solid #e8e8e1;
          }

          .stat-grid > div:last-child {
            border-bottom: 0;
          }
        }
      </style>
    `;
  }
}

customElements.define("kalman-1d-demo", Kalman1dDemo);
