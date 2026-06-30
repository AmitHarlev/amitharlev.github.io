const BASE_RATE = 0.25;
const SMALL_SIZE = 0.5;
const LARGE_SIZE = 1.5;
const START_LOAD = BASE_RATE * SMALL_SIZE + BASE_RATE * LARGE_SIZE;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fmt(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return Number(value).toFixed(digits);
}

function poissonRateCost(mu, lambda = BASE_RATE) {
  if (mu <= 0) {
    return lambda;
  }

  return mu * Math.log(mu / lambda) - mu + lambda;
}

function log10Probability(cost, horizon) {
  return -(cost * horizon) / Math.LN10;
}

function exactRatesForLoad(targetLoad) {
  if (targetLoad <= START_LOAD) {
    return {
      theta: 0,
      smallRate: BASE_RATE,
      largeRate: BASE_RATE,
      cost: 0
    };
  }

  let lo = 0;
  let hi = 1;

  const loadAt = (theta) => (
    SMALL_SIZE * BASE_RATE * Math.exp(theta * SMALL_SIZE)
    + LARGE_SIZE * BASE_RATE * Math.exp(theta * LARGE_SIZE)
  );

  while (loadAt(hi) < targetLoad) {
    hi *= 2;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;

    if (loadAt(mid) < targetLoad) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const theta = (lo + hi) / 2;
  const smallRate = BASE_RATE * Math.exp(theta * SMALL_SIZE);
  const largeRate = BASE_RATE * Math.exp(theta * LARGE_SIZE);

  return {
    theta,
    smallRate,
    largeRate,
    cost: poissonRateCost(smallRate) + poissonRateCost(largeRate)
  };
}

class Mg1LargeDeviationsDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.resetState();
  }

  connectedCallback() {
    this.render();
  }

  resetState() {
    this.smallRate = BASE_RATE;
    this.largeRate = BASE_RATE;
    this.targetLoad = 1;
    this.stepLoad = 0.025;
    this.horizon = 40;
    this.history = [{
      smallRate: BASE_RATE,
      largeRate: BASE_RATE,
      load: START_LOAD,
      choice: "start",
      cost: 0
    }];
  }

  currentLoad() {
    return SMALL_SIZE * this.smallRate + LARGE_SIZE * this.largeRate;
  }

  currentCost() {
    return poissonRateCost(this.smallRate) + poissonRateCost(this.largeRate);
  }

  nextDecision() {
    const load = this.currentLoad();
    const remaining = Math.max(0, this.targetLoad - load);
    const h = Math.min(this.stepLoad, remaining);

    if (h <= 1e-12) {
      return {
        done: true,
        stepLoad: 0,
        small: null,
        large: null,
        choice: null
      };
    }

    const smallDelta = h / SMALL_SIZE;
    const largeDelta = h / LARGE_SIZE;
    const smallCost = poissonRateCost(this.smallRate + smallDelta) - poissonRateCost(this.smallRate);
    const largeCost = poissonRateCost(this.largeRate + largeDelta) - poissonRateCost(this.largeRate);
    const smallOption = {
      name: "small jobs",
      size: SMALL_SIZE,
      deltaRate: smallDelta,
      nextRate: this.smallRate + smallDelta,
      nextLoad: load + h,
      cost: smallCost,
      log10Probability: log10Probability(smallCost, this.horizon)
    };
    const largeOption = {
      name: "large jobs",
      size: LARGE_SIZE,
      deltaRate: largeDelta,
      nextRate: this.largeRate + largeDelta,
      nextLoad: load + h,
      cost: largeCost,
      log10Probability: log10Probability(largeCost, this.horizon)
    };

    return {
      done: false,
      stepLoad: h,
      small: smallOption,
      large: largeOption,
      choice: smallCost <= largeCost ? "small" : "large"
    };
  }

  applyOneStep() {
    const decision = this.nextDecision();

    if (decision.done) {
      return;
    }

    if (decision.choice === "small") {
      this.smallRate = decision.small.nextRate;
    } else {
      this.largeRate = decision.large.nextRate;
    }

    this.history.push({
      smallRate: this.smallRate,
      largeRate: this.largeRate,
      load: this.currentLoad(),
      choice: decision.choice,
      cost: this.currentCost()
    });

    this.render();
  }

  runToTarget() {
    let guard = 0;

    while (this.currentLoad() < this.targetLoad - 1e-12 && guard < 1000) {
      const decision = this.nextDecision();

      if (decision.done) {
        break;
      }

      if (decision.choice === "small") {
        this.smallRate = decision.small.nextRate;
      } else {
        this.largeRate = decision.large.nextRate;
      }

      this.history.push({
        smallRate: this.smallRate,
        largeRate: this.largeRate,
        load: this.currentLoad(),
        choice: decision.choice,
        cost: this.currentCost()
      });
      guard += 1;
    }

    this.render();
  }

  setTargetLoad(value) {
    this.targetLoad = clamp(Number(value), 0.55, 1.5);

    if (this.currentLoad() > this.targetLoad + 1e-12) {
      this.smallRate = BASE_RATE;
      this.largeRate = BASE_RATE;
      this.history = [this.history[0]];
    }

    this.render();
  }

  setStepLoad(value) {
    this.stepLoad = clamp(Number(value), 0.005, 0.1);
    this.render();
  }

  setHorizon(value) {
    this.horizon = clamp(Number(value), 1, 200);
    this.render();
  }

  resetRun() {
    const targetLoad = this.targetLoad;
    const stepLoad = this.stepLoad;
    const horizon = this.horizon;

    this.resetState();
    this.targetLoad = targetLoad;
    this.stepLoad = stepLoad;
    this.horizon = horizon;
    this.render();
  }

  rateBar(label, rate, color, maxRate) {
    const width = clamp((rate / maxRate) * 100, 0, 100);
    const workRate = rate * (label === "small" ? SMALL_SIZE : LARGE_SIZE);
    const size = label === "small" ? SMALL_SIZE : LARGE_SIZE;

    return `
      <div class="rate-row">
        <div class="rate-label">
          <strong>${label}</strong>
          <span>size ${fmt(size, 1)}</span>
        </div>
        <div class="bar-track" aria-hidden="true">
          <div class="bar-fill" style="width: ${width}%; background: ${color};"></div>
        </div>
        <div class="rate-number">
          <strong>${fmt(rate)}</strong>
          <span>work ${fmt(workRate)}</span>
        </div>
      </div>
    `;
  }

  distributionSvg(state) {
    const smallProb = state.smallRate / (state.smallRate + state.largeRate);
    const largeProb = 1 - smallProb;
    const meanSize = SMALL_SIZE * smallProb + LARGE_SIZE * largeProb;
    const smallHeight = 148 * smallProb;
    const largeHeight = 148 * largeProb;
    const meanX = 92 + ((meanSize - SMALL_SIZE) / (LARGE_SIZE - SMALL_SIZE)) * 196;

    return `
      <svg viewBox="0 0 380 240" role="img" aria-label="Effective job size distribution">
        <rect x="0" y="0" width="380" height="240" rx="8" fill="#fbfbf8" />
        <line x1="54" y1="184" x2="326" y2="184" stroke="#c8c8bf" />
        <line x1="92" y1="184" x2="92" y2="${184 - smallHeight}" stroke="#2f6fbb" stroke-width="42" stroke-linecap="round" />
        <line x1="288" y1="184" x2="288" y2="${184 - largeHeight}" stroke="#d26b2c" stroke-width="42" stroke-linecap="round" />
        <line x1="${meanX}" y1="40" x2="${meanX}" y2="196" stroke="#2f8f5b" stroke-width="3" stroke-dasharray="6 5" />
        <circle cx="${meanX}" cy="40" r="6" fill="#2f8f5b" />
        <text x="92" y="216" text-anchor="middle">1/2</text>
        <text x="288" y="216" text-anchor="middle">3/2</text>
        <text x="92" y="${166 - smallHeight}" text-anchor="middle">${fmt(100 * smallProb, 1)}%</text>
        <text x="288" y="${166 - largeHeight}" text-anchor="middle">${fmt(100 * largeProb, 1)}%</text>
        <text x="${meanX}" y="27" text-anchor="middle">mean ${fmt(meanSize, 3)}</text>
      </svg>
    `;
  }

  pathSvg(state) {
    const points = this.history;
    const width = 1040;
    const height = 260;
    const left = 76;
    const right = 984;
    const top = 32;
    const bottom = 210;
    const maxLoad = Math.max(this.targetLoad, ...points.map((point) => point.load), 1);
    const maxCost = Math.max(0.01, ...points.map((point) => point.cost));
    const xFor = (index) => left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (right - left));
    const yLoad = (load) => bottom - ((load - START_LOAD) / (maxLoad - START_LOAD || 1)) * (bottom - top);
    const yCost = (cost) => bottom - (cost / maxCost) * (bottom - top);
    const loadPath = points.map((point, index) => `${xFor(index)},${yLoad(point.load)}`).join(" ");
    const costPath = points.map((point, index) => `${xFor(index)},${yCost(point.cost)}`).join(" ");
    const targetY = yLoad(this.targetLoad);

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Greedy path load and cost">
        <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#fbfbf8" />
        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#c8c8bf" />
        <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#c8c8bf" />
        <line x1="${left}" y1="${targetY}" x2="${right}" y2="${targetY}" stroke="#d26b2c" stroke-dasharray="5 5" />
        <text x="${right}" y="${targetY - 10}" text-anchor="end">target load ${fmt(this.targetLoad, 2)}</text>
        <polyline points="${loadPath}" fill="none" stroke="#2f6fbb" stroke-width="3" />
        <polyline points="${costPath}" fill="none" stroke="#2f8f5b" stroke-width="3" />
        ${points.map((point, index) => `
          <circle cx="${xFor(index)}" cy="${yLoad(point.load)}" r="3.5" fill="${point.choice === "small" ? "#2f6fbb" : point.choice === "large" ? "#d26b2c" : "#666"}" />
        `).join("")}
        <text x="${left}" y="240">0</text>
        <text x="${right}" y="240" text-anchor="end">${points.length - 1} steps</text>
        <g transform="translate(690 44)">
          <line x1="0" y1="0" x2="24" y2="0" stroke="#2f6fbb" stroke-width="3" />
          <text x="31" y="4">load</text>
          <line x1="92" y1="0" x2="116" y2="0" stroke="#2f8f5b" stroke-width="3" />
          <text x="123" y="4">cost</text>
        </g>
      </svg>
    `;
  }

  decisionRows(decision) {
    if (decision.done) {
      return `
        <tr>
          <td colspan="6">Target reached. Increase the target or reset to continue.</td>
        </tr>
      `;
    }

    return [decision.small, decision.large].map((option) => {
      const key = option.name === "small jobs" ? "small" : "large";
      const selected = decision.choice === key;

      return `
        <tr class="${selected ? "selected" : ""}">
          <td>${option.name}${selected ? " *" : ""}</td>
          <td>${fmt(option.size, 1)}</td>
          <td>${fmt(option.deltaRate)}</td>
          <td>${fmt(option.nextRate)}</td>
          <td>${fmt(option.cost, 5)}</td>
          <td>10^${fmt(option.log10Probability, 2)}</td>
        </tr>
      `;
    }).join("");
  }

  summaryStats(state, exact) {
    const totalRate = state.smallRate + state.largeRate;
    const largeArrivalShare = state.largeRate / totalRate;
    const logProb = log10Probability(state.cost, this.horizon);
    const exactTotalRate = exact.smallRate + exact.largeRate;
    const exactLargeShare = exact.largeRate / exactTotalRate;
    const exactLogProb = log10Probability(exact.cost, this.horizon);

    return `
      <div class="stat-grid">
        <div>
          <span>current load</span>
          <strong>${fmt(state.load, 3)}</strong>
        </div>
        <div>
          <span>total LD cost</span>
          <strong>${fmt(state.cost, 5)}</strong>
        </div>
        <div>
          <span>period probability</span>
          <strong>10^${fmt(logProb, 2)}</strong>
        </div>
        <div>
          <span>large arrival share</span>
          <strong>${fmt(100 * largeArrivalShare, 1)}%</strong>
        </div>
        <div>
          <span>exact target cost</span>
          <strong>${fmt(exact.cost, 5)}</strong>
        </div>
        <div>
          <span>exact large share</span>
          <strong>${fmt(100 * exactLargeShare, 1)}%</strong>
        </div>
        <div>
          <span>exact rates</span>
          <strong>${fmt(exact.smallRate)}, ${fmt(exact.largeRate)}</strong>
        </div>
        <div>
          <span>exact probability</span>
          <strong>10^${fmt(exactLogProb, 2)}</strong>
        </div>
      </div>
    `;
  }

  render() {
    const activeControl = this.shadowRoot.activeElement?.getAttribute("data-control");
    const state = {
      smallRate: this.smallRate,
      largeRate: this.largeRate,
      load: this.currentLoad(),
      cost: this.currentCost()
    };
    const decision = this.nextDecision();
    const exact = exactRatesForLoad(this.targetLoad);
    const maxRate = Math.max(0.75, this.smallRate, this.largeRate, exact.largeRate) * 1.08;
    const atTarget = state.load >= this.targetLoad - 1e-12;

    if (this.shadowRoot.querySelector(".demo")) {
      this.shadowRoot.querySelector(".rates-panel").innerHTML = `
        ${this.rateBar("small", state.smallRate, "#2f6fbb", maxRate)}
        ${this.rateBar("large", state.largeRate, "#d26b2c", maxRate)}
      `;
      this.shadowRoot.querySelector(".distribution-panel").innerHTML = this.distributionSvg(state);
      this.shadowRoot.querySelector(".path-panel").innerHTML = this.pathSvg(state);
      this.shadowRoot.querySelector(".decision-body").innerHTML = this.decisionRows(decision);
      this.shadowRoot.querySelector(".stats-panel").innerHTML = this.summaryStats(state, exact);
      this.shadowRoot.querySelector('[data-action="step"]').disabled = atTarget;
      this.shadowRoot.querySelector('[data-action="run"]').disabled = atTarget;

      for (const input of this.shadowRoot.querySelectorAll("[data-control]")) {
        if (input.getAttribute("data-control") !== activeControl) {
          if (input.getAttribute("data-control") === "target") input.value = this.targetLoad;
          if (input.getAttribute("data-control") === "step") input.value = this.stepLoad;
          if (input.getAttribute("data-control") === "horizon") input.value = this.horizon;
        }
      }

      this.shadowRoot.querySelector('[data-label="target"]').textContent = fmt(this.targetLoad, 2);
      this.shadowRoot.querySelector('[data-label="step"]').textContent = fmt(this.stepLoad, 3);
      this.shadowRoot.querySelector('[data-label="horizon"]').textContent = fmt(this.horizon, 0);
      return;
    }

    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="demo">
        <div class="controls">
          <label>
            <span>target load <strong data-label="target">${fmt(this.targetLoad, 2)}</strong></span>
            <input type="range" min="0.55" max="1.5" step="0.01" value="${this.targetLoad}" data-control="target">
          </label>
          <label>
            <span>step load <strong data-label="step">${fmt(this.stepLoad, 3)}</strong></span>
            <input type="range" min="0.005" max="0.1" step="0.005" value="${this.stepLoad}" data-control="step">
          </label>
          <label>
            <span>period length T <strong data-label="horizon">${fmt(this.horizon, 0)}</strong></span>
            <input type="range" min="1" max="200" step="1" value="${this.horizon}" data-control="horizon">
          </label>
          <div class="buttons">
            <button type="button" data-action="step" ${atTarget ? "disabled" : ""}>Step</button>
            <button type="button" data-action="run" ${atTarget ? "disabled" : ""}>Run to target</button>
            <button type="button" data-action="reset">Reset</button>
          </div>
        </div>

        <div class="top-grid">
          <section class="panel">
            <h3>Effective Poisson rates</h3>
            <div class="rates-panel">
              ${this.rateBar("small", state.smallRate, "#2f6fbb", maxRate)}
              ${this.rateBar("large", state.largeRate, "#d26b2c", maxRate)}
            </div>
          </section>
          <section class="panel">
            <h3>Effective job-size distribution</h3>
            <div class="distribution-panel">
              ${this.distributionSvg(state)}
            </div>
          </section>
        </div>

        <section class="panel path-panel">
          ${this.pathSvg(state)}
        </section>

        <section class="panel decision-panel">
          <h3>Next-step decision</h3>
          <table>
            <thead>
              <tr>
                <th>source</th>
                <th>size</th>
                <th>rate added</th>
                <th>new rate</th>
                <th>extra cost</th>
                <th>factor over T</th>
              </tr>
            </thead>
            <tbody class="decision-body">
              ${this.decisionRows(decision)}
            </tbody>
          </table>
        </section>

        <section class="stats-panel">
          ${this.summaryStats(state, exact)}
        </section>
      </div>
    `;

    this.shadowRoot.querySelector('[data-control="target"]')?.addEventListener("input", (event) => this.setTargetLoad(event.target.value));
    this.shadowRoot.querySelector('[data-control="step"]')?.addEventListener("input", (event) => this.setStepLoad(event.target.value));
    this.shadowRoot.querySelector('[data-control="horizon"]')?.addEventListener("input", (event) => this.setHorizon(event.target.value));
    this.shadowRoot.querySelector('[data-action="step"]')?.addEventListener("click", () => this.applyOneStep());
    this.shadowRoot.querySelector('[data-action="run"]')?.addEventListener("click", () => this.runToTarget());
    this.shadowRoot.querySelector('[data-action="reset"]')?.addEventListener("click", () => this.resetRun());
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          color: #242424;
          font-family: inherit;
        }

        .demo {
          border: 1px solid #d6d8d2;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
        }

        .controls {
          display: grid;
          grid-template-columns: repeat(3, minmax(170px, 1fr)) auto;
          gap: 0.85rem;
          align-items: end;
          padding: 1rem;
          border-bottom: 1px solid #e5e6df;
          background: #fbfbf8;
        }

        label {
          display: grid;
          gap: 0.3rem;
          min-width: 0;
          color: #555;
          font-size: 0.78rem;
          font-weight: 700;
        }

        input[type="range"] {
          width: 100%;
          accent-color: #2f8f5b;
        }

        .buttons {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        button {
          appearance: none;
          border: 1px solid #b9beb8;
          border-radius: 6px;
          background: #f5f6f2;
          color: #222;
          cursor: pointer;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          line-height: 1;
          padding: 0.58rem 0.68rem;
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

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .top-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
          gap: 1rem;
          padding: 1rem;
        }

        .panel {
          border: 1px solid #e1e3dc;
          border-radius: 8px;
          background: #ffffff;
          min-width: 0;
          overflow: hidden;
        }

        h3 {
          margin: 0;
          padding: 0.75rem 0.9rem;
          border-bottom: 1px solid #ecede8;
          font-size: 0.9rem;
          line-height: 1.2;
        }

        .rates-panel {
          display: grid;
          gap: 0.9rem;
          padding: 1rem;
        }

        .rate-row {
          display: grid;
          grid-template-columns: 82px minmax(130px, 1fr) 90px;
          gap: 0.75rem;
          align-items: center;
        }

        .rate-label strong,
        .rate-label span,
        .rate-number strong,
        .rate-number span {
          display: block;
        }

        .rate-label strong {
          text-transform: capitalize;
        }

        .rate-label span,
        .rate-number span {
          color: #666;
          font-size: 0.73rem;
        }

        .rate-number {
          text-align: right;
        }

        .bar-track {
          height: 22px;
          border-radius: 999px;
          background: #ecede8;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: inherit;
          transition: width 160ms ease;
        }

        svg {
          display: block;
          width: 100%;
          height: auto;
        }

        svg text {
          fill: #333;
          font-size: 13px;
        }

        .path-panel {
          margin: 0 1rem 1rem;
        }

        .decision-panel {
          margin: 0 1rem 1rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }

        th,
        td {
          padding: 0.62rem 0.72rem;
          text-align: left;
          border-bottom: 1px solid #eceee8;
          white-space: nowrap;
        }

        th {
          color: #555;
          font-size: 0.72rem;
          text-transform: uppercase;
        }

        tr.selected {
          background: #f0f7f3;
        }

        tr:last-child td {
          border-bottom: 0;
        }

        .stats-panel {
          border-top: 1px solid #e5e6df;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .stat-grid > div {
          min-width: 0;
          padding: 0.78rem 0.9rem;
          border-right: 1px solid #eceee8;
          border-bottom: 1px solid #eceee8;
        }

        .stat-grid > div:nth-child(4n) {
          border-right: 0;
        }

        .stat-grid > div:nth-last-child(-n + 4) {
          border-bottom: 0;
        }

        .stat-grid span,
        .stat-grid strong {
          display: block;
        }

        .stat-grid span {
          color: #666;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .stat-grid strong {
          margin-top: 0.14rem;
          font-size: 0.88rem;
          line-height: 1.35;
        }

        @media (max-width: 900px) {
          .controls,
          .top-grid {
            grid-template-columns: 1fr;
          }

          .buttons {
            justify-content: flex-start;
          }

          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .stat-grid > div,
          .stat-grid > div:nth-child(4n),
          .stat-grid > div:nth-last-child(-n + 4) {
            border-right: 1px solid #eceee8;
            border-bottom: 1px solid #eceee8;
          }

          .stat-grid > div:nth-child(2n) {
            border-right: 0;
          }

          .stat-grid > div:nth-last-child(-n + 2) {
            border-bottom: 0;
          }
        }

        @media (max-width: 560px) {
          .rate-row {
            grid-template-columns: 1fr;
            gap: 0.35rem;
          }

          .rate-number {
            text-align: left;
          }

          .decision-panel {
            overflow-x: auto;
          }

          .stat-grid {
            grid-template-columns: 1fr;
          }

          .stat-grid > div,
          .stat-grid > div:nth-child(2n),
          .stat-grid > div:nth-last-child(-n + 2) {
            border-right: 0;
            border-bottom: 1px solid #eceee8;
          }

          .stat-grid > div:last-child {
            border-bottom: 0;
          }
        }
      </style>
    `;
  }
}

customElements.define("mg1-large-deviations-demo", Mg1LargeDeviationsDemo);

class Mg1WorkProcessDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.resetState();
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.playing = false;
    this.stopLoop();
  }

  resetState() {
    this.time = 0;
    this.work = 0;
    this.arrivalRate = 0.5;
    this.speed = 1;
    this.playing = false;
    this.lastFrame = null;
    this.timer = null;
    this.nextArrival = this.sampleInterarrival();
    this.points = [{ t: 0, w: 0 }];
    this.arrivals = [];
    this.yMax = 4;
  }

  sampleInterarrival() {
    const u = Math.max(Number.MIN_VALUE, Math.random());
    return -Math.log(u) / Math.max(this.arrivalRate, 1e-9);
  }

  sampleJobSize() {
    return Math.random() < 0.5 ? SMALL_SIZE : LARGE_SIZE;
  }

  pushPoint(t, w) {
    const last = this.points[this.points.length - 1];

    if (last && Math.abs(last.t - t) < 1e-9 && Math.abs(last.w - w) < 1e-9) {
      return;
    }

    this.points.push({ t, w });
  }

  trimHistory() {
    const cutoff = Math.max(0, this.time - this.windowSeconds() - 10);
    let firstKeep = 0;

    while (firstKeep < this.points.length - 2 && this.points[firstKeep + 1].t < cutoff) {
      firstKeep += 1;
    }

    if (firstKeep > 0) {
      this.points = this.points.slice(firstKeep);
    }

    this.arrivals = this.arrivals.filter((arrival) => arrival.t >= cutoff);
  }

  windowSeconds() {
    return 70;
  }

  setArrivalRate(value) {
    const oldRate = this.arrivalRate;
    this.arrivalRate = clamp(Number(value), 0.1, 1.5);

    if (oldRate !== this.arrivalRate) {
      this.nextArrival = this.time + this.sampleInterarrival();
    }

    this.render();
  }

  setSpeed(value) {
    this.speed = clamp(Number(value), 0.25, 8);
    this.render();
  }

  togglePlay() {
    this.playing = !this.playing;
    this.lastFrame = performance.now();
    this.render();

    if (this.playing) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  startLoop() {
    this.stopLoop();
    this.timer = setInterval(() => this.tick(performance.now()), 33);
  }

  stopLoop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetRun() {
    const arrivalRate = this.arrivalRate;
    const speed = this.speed;

    this.resetState();
    this.arrivalRate = arrivalRate;
    this.speed = speed;
    this.nextArrival = this.sampleInterarrival();
    this.render();
  }

  tick(timestamp) {
    if (!this.playing) {
      this.stopLoop();
      return;
    }

    if (this.lastFrame === null) {
      this.lastFrame = timestamp;
      return;
    }

    const elapsed = Math.min(0.25, (timestamp - this.lastFrame) / 1000) * this.speed;
    this.lastFrame = timestamp;
    this.advance(elapsed);
    this.render();
  }

  advance(duration) {
    const endTime = this.time + duration;

    while (this.nextArrival <= endTime) {
      const beforeArrivalWork = Math.max(0, this.work - (this.nextArrival - this.time));
      this.pushPoint(this.nextArrival, beforeArrivalWork);

      const jobSize = this.sampleJobSize();
      const afterArrivalWork = beforeArrivalWork + jobSize;
      this.pushPoint(this.nextArrival, afterArrivalWork);
      this.arrivals.push({ t: this.nextArrival, size: jobSize, w: afterArrivalWork });

      this.time = this.nextArrival;
      this.work = afterArrivalWork;
      this.nextArrival = this.time + this.sampleInterarrival();
    }

    this.work = Math.max(0, this.work - (endTime - this.time));
    this.time = endTime;
    this.pushPoint(this.time, this.work);
    this.trimHistory();
  }

  visiblePoints() {
    const start = Math.max(0, this.time - this.windowSeconds());
    const points = this.points.filter((point) => point.t >= start);

    if (points.length === 0 || points[0].t > start) {
      const previous = [...this.points].reverse().find((point) => point.t < start);
      if (previous) {
        points.unshift({ t: start, w: Math.max(0, previous.w - (start - previous.t)) });
      }
    }

    return points;
  }

  updateScale(visiblePoints) {
    const maxWork = Math.max(0, this.work, ...visiblePoints.map((point) => point.w));
    const desired = Math.max(4, Math.ceil(maxWork * 1.25 + 0.5));

    if (desired > this.yMax) {
      this.yMax = desired;
    } else if (desired < this.yMax * 0.55) {
      this.yMax = Math.max(4, this.yMax * 0.985);
    }
  }

  renderSvg() {
    const width = 900;
    const height = 330;
    const left = 58;
    const right = 868;
    const top = 28;
    const bottom = 270;
    const windowSeconds = this.windowSeconds();
    const start = Math.max(0, this.time - windowSeconds);
    const end = start + windowSeconds;
    const visiblePoints = this.visiblePoints();
    this.updateScale(visiblePoints);

    const x = (t) => left + ((t - start) / windowSeconds) * (right - left);
    const y = (w) => bottom - (w / this.yMax) * (bottom - top);
    const path = visiblePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${fmt(x(point.t), 2)} ${fmt(y(point.w), 2)}`).join(" ");
    const arrivals = this.arrivals.filter((arrival) => arrival.t >= start && arrival.t <= end);
    const tickCount = 5;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => (this.yMax * index) / tickCount);
    const xTicks = Array.from({ length: 6 }, (_, index) => start + (windowSeconds * index) / 5);

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="M/G/1 workload sample path">
        <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#fbfbf8" />
        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#c8c8bf" />
        <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#c8c8bf" />

        ${yTicks.map((tick) => `
          <line x1="${left}" y1="${y(tick)}" x2="${right}" y2="${y(tick)}" stroke="#eceee8" />
          <text x="${left - 10}" y="${y(tick) + 4}" text-anchor="end">${fmt(tick, tick >= 10 ? 0 : 1)}</text>
        `).join("")}

        ${xTicks.map((tick) => `
          <line x1="${x(tick)}" y1="${bottom}" x2="${x(tick)}" y2="${bottom + 5}" stroke="#9b9b92" />
          <text x="${x(tick)}" y="${bottom + 24}" text-anchor="middle">${fmt(tick, 0)}</text>
        `).join("")}

        <path d="${path}" fill="none" stroke="#2f6fbb" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />

        ${arrivals.map((arrival) => `
          <g>
            <line x1="${x(arrival.t)}" x2="${x(arrival.t)}" y1="${y(Math.max(0, arrival.w - arrival.size))}" y2="${y(arrival.w)}" stroke="#2f6fbb" stroke-width="2.5" />
          </g>
        `).join("")}

        <text x="${left}" y="20">workload W(t)</text>
        <text x="${right}" y="${bottom + 24}" text-anchor="end">time</text>
      </svg>
    `;
  }

  statsHtml() {
    const load = this.arrivalRate;
    const status = load < 1 ? "stable on average" : load === 1 ? "critical" : "overloaded on average";
    const visibleStart = Math.max(0, this.time - this.windowSeconds());

    return `
      <div class="work-stats">
        <div><span>time</span><strong>${fmt(this.time, 1)}</strong></div>
        <div><span>work in system</span><strong>${fmt(this.work, 2)}</strong></div>
        <div><span>arrival rate</span><strong>${fmt(this.arrivalRate, 2)}</strong></div>
        <div><span>load</span><strong>${fmt(load, 2)} (${status})</strong></div>
        <div><span>visible window</span><strong>${fmt(visibleStart, 0)} to ${fmt(visibleStart + this.windowSeconds(), 0)}</strong></div>
        <div><span>vertical scale</span><strong>0 to ${fmt(this.yMax, 1)}</strong></div>
      </div>
    `;
  }

  render() {
    const activeControl = this.shadowRoot.activeElement?.getAttribute("data-control");

    if (this.shadowRoot.querySelector(".work-demo")) {
      this.shadowRoot.querySelector(".work-canvas").innerHTML = this.renderSvg();
      this.shadowRoot.querySelector(".work-stats-wrap").innerHTML = this.statsHtml();
      this.shadowRoot.querySelector('[data-action="toggle"]').textContent = this.playing ? "Pause" : "Play";

      for (const input of this.shadowRoot.querySelectorAll("[data-control]")) {
        if (input.getAttribute("data-control") !== activeControl) {
          if (input.getAttribute("data-control") === "rate") input.value = this.arrivalRate;
          if (input.getAttribute("data-control") === "speed") input.value = this.speed;
        }
      }

      this.shadowRoot.querySelector('[data-label="rate"]').textContent = fmt(this.arrivalRate, 2);
      this.shadowRoot.querySelector('[data-label="speed"]').textContent = `${fmt(this.speed, 2)}x`;
      return;
    }

    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="work-demo">
        <div class="work-controls">
          <button type="button" data-action="toggle">${this.playing ? "Pause" : "Play"}</button>
          <button type="button" data-action="reset">Reset</button>
          <label>
            <span>arrival rate <strong data-label="rate">${fmt(this.arrivalRate, 2)}</strong></span>
            <input type="range" min="0.1" max="1.5" step="0.05" value="${this.arrivalRate}" data-control="rate">
          </label>
          <label>
            <span>animation speed <strong data-label="speed">${fmt(this.speed, 2)}x</strong></span>
            <input type="range" min="0.25" max="8" step="0.25" value="${this.speed}" data-control="speed">
          </label>
        </div>
        <div class="work-canvas">${this.renderSvg()}</div>
        <div class="work-stats-wrap">${this.statsHtml()}</div>
      </div>
    `;

    this.shadowRoot.querySelector('[data-action="toggle"]')?.addEventListener("click", () => this.togglePlay());
    this.shadowRoot.querySelector('[data-action="reset"]')?.addEventListener("click", () => this.resetRun());
    this.shadowRoot.querySelector('[data-control="rate"]')?.addEventListener("input", (event) => this.setArrivalRate(event.target.value));
    this.shadowRoot.querySelector('[data-control="speed"]')?.addEventListener("input", (event) => this.setSpeed(event.target.value));
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          color: #242424;
          font-family: inherit;
        }

        .work-demo {
          border: 1px solid #d6d8d2;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
        }

        .work-controls {
          display: grid;
          grid-template-columns: auto auto minmax(190px, 1fr) minmax(190px, 1fr);
          gap: 0.75rem;
          align-items: end;
          padding: 0.9rem;
          border-bottom: 1px solid #e5e6df;
          background: #fbfbf8;
        }

        button {
          appearance: none;
          border: 1px solid #b9beb8;
          border-radius: 6px;
          background: #f5f6f2;
          color: #222;
          cursor: pointer;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          line-height: 1;
          padding: 0.58rem 0.68rem;
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

        label {
          display: grid;
          gap: 0.3rem;
          min-width: 0;
          color: #555;
          font-size: 0.78rem;
          font-weight: 700;
        }

        input[type="range"] {
          width: 100%;
          accent-color: #2f8f5b;
        }

        .work-canvas {
          background: #fbfbf8;
          border-bottom: 1px solid #e5e6df;
        }

        svg {
          display: block;
          width: 100%;
          height: auto;
        }

        svg text {
          fill: #333;
          font-size: 13px;
        }

        .work-stats {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }

        .work-stats > div {
          min-width: 0;
          padding: 0.72rem 0.85rem;
          border-right: 1px solid #eceee8;
        }

        .work-stats > div:last-child {
          border-right: 0;
        }

        .work-stats span,
        .work-stats strong {
          display: block;
        }

        .work-stats span {
          color: #666;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .work-stats strong {
          margin-top: 0.12rem;
          font-size: 0.84rem;
          line-height: 1.35;
        }

        @media (max-width: 860px) {
          .work-controls {
            grid-template-columns: 1fr 1fr;
          }

          .work-controls label {
            grid-column: 1 / -1;
          }

          .work-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .work-stats > div {
            border-bottom: 1px solid #eceee8;
          }

          .work-stats > div:nth-child(2n) {
            border-right: 0;
          }
        }
      </style>
    `;
  }
}

customElements.define("mg1-work-process-demo", Mg1WorkProcessDemo);
