const DEFAULT_VIEW_HALF = 2;
const MIN_VIEW_HALF = 0.45;
const NAVIGATION_LIMIT = 10;
const MAX_VIEW_HALF = NAVIGATION_LIMIT;
const GRID_REAL_LIMIT = 8;
const GRID_IMAG_LIMIT = 4;
const GRID_STEP = 1;
const SAMPLE_COUNT = 180;
const BASE_ANIMATION_MS = 27733.333333333332;
const DEFAULT_ANIMATION_SPEED = 1;
const ANIMATION_ACCELERATION = 50.0;
const MAX_DRAW_COORD = 14;
const PLOT_HEIGHT = 520;
const BOX_SIZE = 0.72;
const BOX_SAMPLES_PER_SIDE = 36;
const BOX_HANDLE_RADIUS_PX = 6;
const BOX_COLORS = [
  { stroke: "rgba(250, 204, 21, 0.98)", fill: "rgba(250, 204, 21, 0.24)" },
  { stroke: "rgba(244, 114, 182, 0.98)", fill: "rgba(244, 114, 182, 0.22)" },
  { stroke: "rgba(34, 197, 94, 0.98)", fill: "rgba(34, 197, 94, 0.22)" },
  { stroke: "rgba(168, 85, 247, 0.98)", fill: "rgba(168, 85, 247, 0.22)" },
  { stroke: "rgba(251, 146, 60, 0.98)", fill: "rgba(251, 146, 60, 0.22)" }
];
const PATH_COLORS = [
  "rgba(236, 72, 153, 0.96)",
  "rgba(34, 211, 238, 0.96)",
  "rgba(190, 242, 100, 0.96)",
  "rgba(251, 113, 133, 0.96)"
];
const MIN_BOX_SIZE = 0.16;
const LINE_HIT_RADIUS_PX = 8;
const VECTOR_SOURCE_RADIUS = 0.34;
const VECTOR_SOURCE_RAY_COUNT = 16;
const VECTOR_SOURCE_HIT_RADIUS_PX = 14;
const VECTOR_SOURCE_DERIVATIVE_STEP = 1e-4;
const VECTOR_SOURCE_SEEDS = [
  [0, 0],
  [-0.85, 0.65],
  [0.9, -0.55],
  [0.85, 0.85],
  [-0.95, -0.75],
  [0.25, 1.15],
  [-1.25, 0.1],
  [1.25, 0.15]
];
const FUNCTION_NAMES = new Set([
  "abs",
  "arg",
  "conj",
  "cos",
  "exp",
  "im",
  "log",
  "re",
  "sin",
  "sqrt",
  "tan"
]);

function complex(re, im = 0) {
  return { re, im };
}

function isFiniteComplex(z) {
  return Number.isFinite(z.re) && Number.isFinite(z.im);
}

function add(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

function sub(a, b) {
  return complex(a.re - b.re, a.im - b.im);
}

function neg(a) {
  return complex(-a.re, -a.im);
}

function mul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function div(a, b) {
  const denom = b.re * b.re + b.im * b.im;

  if (denom === 0) {
    return complex(Number.NaN, Number.NaN);
  }

  return complex(
    (a.re * b.re + a.im * b.im) / denom,
    (a.im * b.re - a.re * b.im) / denom
  );
}

function abs(a) {
  return Math.hypot(a.re, a.im);
}

function exp(a) {
  const magnitude = Math.exp(a.re);
  return complex(magnitude * Math.cos(a.im), magnitude * Math.sin(a.im));
}

function log(a) {
  return complex(Math.log(abs(a)), Math.atan2(a.im, a.re));
}

function sin(a) {
  return complex(
    Math.sin(a.re) * Math.cosh(a.im),
    Math.cos(a.re) * Math.sinh(a.im)
  );
}

function cos(a) {
  return complex(
    Math.cos(a.re) * Math.cosh(a.im),
    -Math.sin(a.re) * Math.sinh(a.im)
  );
}

function tan(a) {
  return div(sin(a), cos(a));
}

function sqrt(a) {
  const r = abs(a);
  const sign = a.im < 0 ? -1 : 1;

  return complex(
    Math.sqrt(Math.max(0, (r + a.re) / 2)),
    sign * Math.sqrt(Math.max(0, (r - a.re) / 2))
  );
}

function pow(a, b) {
  if (Math.abs(b.im) < 1e-12 && Math.abs(b.re - Math.round(b.re)) < 1e-12) {
    const n = Math.round(b.re);
    let result = complex(1);
    let base = a;
    let exponent = Math.abs(n);

    while (exponent > 0) {
      if (exponent % 2 === 1) {
        result = mul(result, base);
      }

      base = mul(base, base);
      exponent = Math.floor(exponent / 2);
    }

    return n < 0 ? div(complex(1), result) : result;
  }

  return exp(mul(b, log(a)));
}

function applyFunction(name, value) {
  switch (name) {
    case "abs":
      return complex(abs(value));
    case "arg":
      return complex(Math.atan2(value.im, value.re));
    case "conj":
      return complex(value.re, -value.im);
    case "cos":
      return cos(value);
    case "exp":
      return exp(value);
    case "im":
      return complex(value.im);
    case "log":
      return log(value);
    case "re":
      return complex(value.re);
    case "sin":
      return sin(value);
    case "sqrt":
      return sqrt(value);
    case "tan":
      return tan(value);
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

function tokenize(input) {
  const tokens = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/\d/.test(char) || (char === "." && /\d/.test(input[index + 1] ?? ""))) {
      const start = index;
      index += 1;

      while (/\d|\./.test(input[index] ?? "")) {
        index += 1;
      }

      if (/e/i.test(input[index] ?? "")) {
        index += 1;

        if (/[+-]/.test(input[index] ?? "")) {
          index += 1;
        }

        while (/\d/.test(input[index] ?? "")) {
          index += 1;
        }
      }

      const value = Number(input.slice(start, index));

      if (!Number.isFinite(value)) {
        throw new Error("Could not parse a number.");
      }

      tokens.push({ type: "number", value });
      continue;
    }

    if (/[a-z]/i.test(char)) {
      const start = index;
      index += 1;

      while (/[a-z0-9_]/i.test(input[index] ?? "")) {
        index += 1;
      }

      tokens.push({ type: "identifier", value: input.slice(start, index).toLowerCase() });
      continue;
    }

    if ("+-*/^()".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return insertImplicitMultiplication(tokens);
}

function canEndValue(token) {
  return token.type === "number"
    || token.type === ")"
    || (token.type === "identifier" && !FUNCTION_NAMES.has(token.value));
}

function canStartValue(token) {
  return token.type === "number" || token.type === "identifier" || token.type === "(";
}

function insertImplicitMultiplication(tokens) {
  const expanded = [];

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];

    if (previous && canEndValue(previous) && canStartValue(token)) {
      expanded.push({ type: "*", value: "*" });
    }

    expanded.push(token);
  });

  return expanded;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index] ?? { type: "end", value: "" };
  }

  match(type) {
    if (this.current().type !== type) {
      return false;
    }

    this.index += 1;
    return true;
  }

  expect(type) {
    if (!this.match(type)) {
      throw new Error(`Expected ${type}.`);
    }
  }

  parse() {
    const expression = this.parseExpression();

    if (this.current().type !== "end") {
      throw new Error("Could not parse the whole expression.");
    }

    return expression;
  }

  parseExpression() {
    let expression = this.parseProduct();

    while (this.current().type === "+" || this.current().type === "-") {
      const operator = this.current().type;
      this.index += 1;
      const right = this.parseProduct();
      const left = expression;

      expression = (z) => operator === "+"
        ? add(left(z), right(z))
        : sub(left(z), right(z));
    }

    return expression;
  }

  parseProduct() {
    let expression = this.parseUnary();

    while (this.current().type === "*" || this.current().type === "/") {
      const operator = this.current().type;
      this.index += 1;
      const right = this.parseUnary();
      const left = expression;

      expression = (z) => operator === "*"
        ? mul(left(z), right(z))
        : div(left(z), right(z));
    }

    return expression;
  }

  parseUnary() {
    if (this.match("+")) {
      return this.parseUnary();
    }

    if (this.match("-")) {
      const expression = this.parseUnary();
      return (z) => neg(expression(z));
    }

    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();

    if (!this.match("^")) {
      return base;
    }

    const exponent = this.parseUnary();
    return (z) => pow(base(z), exponent(z));
  }

  parsePrimary() {
    const token = this.current();

    if (this.match("number")) {
      return () => complex(token.value);
    }

    if (this.match("(")) {
      const expression = this.parseExpression();
      this.expect(")");
      return expression;
    }

    if (this.match("identifier")) {
      if (token.value === "z") {
        return (z) => z;
      }

      if (token.value === "i") {
        return () => complex(0, 1);
      }

      if (token.value === "pi") {
        return () => complex(Math.PI);
      }

      if (token.value === "e") {
        return () => complex(Math.E);
      }

      if (FUNCTION_NAMES.has(token.value)) {
        this.expect("(");
        const argument = this.parseExpression();
        this.expect(")");

        return (z) => applyFunction(token.value, argument(z));
      }

      throw new Error(`Unknown name: ${token.value}`);
    }

    throw new Error("Expected a number, z, i, or a function.");
  }
}

function compileExpression(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Enter a function first.");
  }

  const fn = new Parser(tokenize(trimmed)).parse();
  const sample = fn(complex(0.7, 0.2));

  if (!isFiniteComplex(sample)) {
    throw new Error("The function was not finite at a sample point.");
  }

  return fn;
}

function range(min, max, step) {
  const values = [];

  for (let value = min; value <= max + 1e-9; value += step) {
    values.push(Number(value.toFixed(10)));
  }

  return values;
}

function identity(z) {
  return z;
}

function fmtLineValue(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function lineLabel(line) {
  return line.axis === "vertical"
    ? `real part = ${fmtLineValue(line.value)}`
    : `imaginary part = ${fmtLineValue(line.value)}`;
}

function groupedLineLabels(matches) {
  const realValues = [];
  const imaginaryValues = [];

  matches.forEach((match) => {
    if (match.line.axis === "vertical") {
      realValues.push(match.line.value);
    } else {
      imaginaryValues.push(match.line.value);
    }
  });

  return [
    realValues.length > 0 ? `Re = ${formatLineValues(realValues)}` : null,
    imaginaryValues.length > 0 ? `Im = ${formatLineValues(imaginaryValues)}` : null
  ].filter(Boolean).join("\n");
}

function formatLineValues(values) {
  return [...new Set(values.map(fmtLineValue))].join(", ");
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const t = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
  ) / lengthSquared));
  const projection = [
    start[0] + t * dx,
    start[1] + t * dy
  ];

  return Math.hypot(point[0] - projection[0], point[1] - projection[1]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function animationProgressFromElapsed(elapsedMs, speedMultiplier) {
  const initialProgress = (elapsedMs / BASE_ANIMATION_MS) * speedMultiplier;
  const acceleration = Math.max(0, ANIMATION_ACCELERATION);

  return initialProgress + 0.5 * acceleration * initialProgress * initialProgress;
}

function parseNumberAttribute(element, name, fallback) {
  if (!element.hasAttribute(name)) {
    return fallback;
  }

  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function parseVectorSourcesAttribute(value) {
  if (!value) {
    return [];
  }

  return value.split(";").flatMap((entry) => {
    const [x, y] = entry.split(",").map((part) => Number(part.trim()));

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    return [{
      center: [x, y],
      radius: VECTOR_SOURCE_RADIUS
    }];
  });
}

function buildSourceGrid(gridStep) {
  const realStart = Math.ceil(-GRID_REAL_LIMIT / gridStep) * gridStep;
  const realEnd = Math.floor(GRID_REAL_LIMIT / gridStep) * gridStep;
  const imagStart = Math.ceil(-GRID_IMAG_LIMIT / gridStep) * gridStep;
  const imagEnd = Math.floor(GRID_IMAG_LIMIT / gridStep) * gridStep;

  const verticalLines = range(realStart, realEnd, gridStep).map((value) => {
    const vertical = [];

    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const t = index / SAMPLE_COUNT;
      const coordinate = -GRID_IMAG_LIMIT + t * GRID_IMAG_LIMIT * 2;
      vertical.push([value, coordinate]);
    }

    return { axis: "vertical", value, points: vertical };
  });

  const horizontalLines = range(imagStart, imagEnd, gridStep).map((value) => {
    const horizontal = [];

    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const t = index / SAMPLE_COUNT;
      const coordinate = -GRID_REAL_LIMIT + t * GRID_REAL_LIMIT * 2;
      horizontal.push([coordinate, value]);
    }

    return { axis: "horizontal", value, points: horizontal };
  });

  return [...verticalLines, ...horizontalLines];
}

function buildAnimatedGrid(fn, gridStep) {
  return buildSourceGrid(gridStep).map((line) => ({
    axis: line.axis,
    value: line.value,
    points: line.points.map((point) => {
      const source = complex(point[0], point[1]);
      const target = fn(source);

      if (!isFiniteComplex(target)) {
        return null;
      }

      return {
        source: [source.re, source.im],
        target: [target.re, target.im]
      };
    })
  }));
}

function buildBoxSourcePoints(box) {
  if (!box) {
    return [];
  }

  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const left = box.center[0] - halfWidth;
  const right = box.center[0] + halfWidth;
  const bottom = box.center[1] - halfHeight;
  const top = box.center[1] + halfHeight;
  const edges = [
    [[left, bottom], [right, bottom]],
    [[right, bottom], [right, top]],
    [[right, top], [left, top]],
    [[left, top], [left, bottom]]
  ];
  const points = [];

  edges.forEach(([start, end], edgeIndex) => {
    for (let index = 0; index <= BOX_SAMPLES_PER_SIDE; index += 1) {
      if (edgeIndex > 0 && index === 0) {
        continue;
      }

      const t = index / BOX_SAMPLES_PER_SIDE;
      points.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
      ]);
    }
  });

  return points;
}

function buildAnimatedBox(box, fn) {
  return {
    box,
    points: buildBoxSourcePoints(box).map((point) => {
      const source = complex(point[0], point[1]);
      const target = fn(source);
      const hasFiniteTarget = isFiniteComplex(target);

      return {
        source: [source.re, source.im],
        target: hasFiniteTarget ? [target.re, target.im] : null
      };
    })
  };
}

function buildAnimatedBoxes(boxes, fn) {
  return boxes.map((box) => buildAnimatedBox(box, fn));
}

function buildAnimatedPath(path, fn) {
  return {
    path,
    points: path.points.map((point) => {
      const source = complex(point[0], point[1]);
      const target = fn(source);
      const hasFiniteTarget = isFiniteComplex(target);

      return {
        source: [source.re, source.im],
        target: hasFiniteTarget ? [target.re, target.im] : null
      };
    })
  };
}

function buildAnimatedPaths(paths, fn) {
  return paths.map((path) => buildAnimatedPath(path, fn));
}

function numericalJacobian(fn, center) {
  const h = VECTOR_SOURCE_DERIVATIVE_STEP;
  const right = fn(complex(center[0] + h, center[1]));
  const left = fn(complex(center[0] - h, center[1]));
  const up = fn(complex(center[0], center[1] + h));
  const down = fn(complex(center[0], center[1] - h));

  if (![right, left, up, down].every(isFiniteComplex)) {
    return null;
  }

  return {
    duDx: (right.re - left.re) / (2 * h),
    dvDx: (right.im - left.im) / (2 * h),
    duDy: (up.re - down.re) / (2 * h),
    dvDy: (up.im - down.im) / (2 * h)
  };
}

function applyJacobian(jacobian, offset) {
  return [
    jacobian.duDx * offset[0] + jacobian.duDy * offset[1],
    jacobian.dvDx * offset[0] + jacobian.dvDy * offset[1]
  ];
}

function buildAnimatedVectorSources(vectorSources, fn) {
  return vectorSources.map((source) => {
    const center = complex(source.center[0], source.center[1]);
    const targetCenter = fn(center);
    const hasFiniteTargetCenter = isFiniteComplex(targetCenter);
    const jacobian = hasFiniteTargetCenter ? numericalJacobian(fn, source.center) : null;
    const centerPoint = {
      source: [center.re, center.im],
      target: hasFiniteTargetCenter ? [targetCenter.re, targetCenter.im] : null
    };
    const rays = [];

    for (let index = 0; index < VECTOR_SOURCE_RAY_COUNT; index += 1) {
      const angle = (index / VECTOR_SOURCE_RAY_COUNT) * Math.PI * 2;
      const endpoint = complex(
        source.center[0] + source.radius * Math.cos(angle),
        source.center[1] + source.radius * Math.sin(angle)
      );
      const sourceOffset = [
        endpoint.re - center.re,
        endpoint.im - center.im
      ];
      const targetOffset = jacobian ? applyJacobian(jacobian, sourceOffset) : null;
      const targetEndpoint = targetOffset && hasFiniteTargetCenter
        ? [
            targetCenter.re + targetOffset[0],
            targetCenter.im + targetOffset[1]
          ]
        : null;

      rays.push({
        primary: index === 0,
        endpoint: {
          source: [endpoint.re, endpoint.im],
          target: targetEndpoint
        }
      });
    }

    return {
      center: centerPoint,
      rays
    };
  });
}

class CustomComplexDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.expression = this.getAttribute("expression") || "z^2";
    this.gridStep = GRID_STEP;
    this.animationSpeed = parseNumberAttribute(this, "speed", DEFAULT_ANIMATION_SPEED);
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.boxes = [];
    this.animatedBoxes = [];
    this.paths = [];
    this.animatedPaths = [];
    this.vectorSources = parseVectorSourcesAttribute(this.getAttribute("vector-sources"));
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.boxInteraction = null;
    this.draggingVectorSourceIndex = null;
    this.pathMode = false;
    this.drawingPath = false;
    this.pathDraft = null;
    this.panning = false;
    this.dragOffset = [0, 0];
    this.panStartCanvas = [0, 0];
    this.panStartCenter = [0, 0];
    this.viewCenter = [0, 0];
    this.viewHalf = DEFAULT_VIEW_HALF;
    this.progress = 0;
    this.animationFrame = null;
    this.animationStart = null;
    this.hoveredLines = [];
    this.resizeObserver = null;
    this.pixelWidth = 1;
    this.pixelHeight = PLOT_HEIGHT;
  }

  connectedCallback() {
    this.render();
    this.cacheElements();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.canvas);
    this.resizeCanvas();
  }

  disconnectedCallback() {
    this.stopAnimation();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .demo {
          overflow: hidden;
          border: 1px solid #d8dee4;
          border-radius: 8px;
          background: #fff;
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          align-items: center;
          padding: 0.7rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f7f9fb;
        }

        .function-label {
          display: flex;
          flex: 1 1 17rem;
          min-width: 0;
          align-items: center;
          gap: 0.45rem;
          font-family: monospace, monospace;
        }

        .function-label span {
          white-space: pre;
        }

        .function-label input {
          width: 100%;
          min-width: 9rem;
          border: 1px solid #b7c0cc;
          border-radius: 6px;
          padding: 0.45rem 0.55rem;
          font: inherit;
          color: #172033;
          background: white;
        }

        .speed-label {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font: 0.9rem/1.2 sans-serif;
          color: #374151;
          white-space: nowrap;
        }

        .speed-label input {
          width: 6.8rem;
          accent-color: #1d4ed8;
        }

        .speed-value {
          min-width: 2.4rem;
          font-family: monospace, monospace;
          color: #172033;
        }

        button {
          border: 1px solid #9ca3af;
          border-radius: 6px;
          padding: 0.45rem 0.75rem;
          background: #fff;
          color: #172033;
          font: inherit;
          cursor: pointer;
        }

        button[type="submit"] {
          border-color: #1d4ed8;
          background: #1d4ed8;
          color: #fff;
        }

        button:disabled {
          cursor: wait;
          opacity: 0.72;
        }

        .error {
          display: none;
          width: 100%;
          color: #b91c1c;
          font-size: 0.88rem;
          line-height: 1.35;
        }

        .error[data-visible="true"] {
          display: block;
        }

        canvas {
          display: block;
          width: 100%;
          height: ${PLOT_HEIGHT}px;
          background: #050505;
          cursor: grab;
          touch-action: none;
        }

        .plot-wrap {
          position: relative;
        }

        .line-tooltip {
          position: absolute;
          z-index: 2;
          display: none;
          max-width: min(15rem, calc(100% - 1rem));
          transform: translate(12px, -50%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 6px;
          padding: 0.3rem 0.45rem;
          background: rgba(17, 24, 39, 0.92);
          color: #fff;
          font: 0.82rem/1.25 monospace, monospace;
          pointer-events: none;
          white-space: nowrap;
        }

        .line-tooltip[data-visible="true"] {
          display: block;
        }

        @media (max-width: 520px) {
          .controls {
            align-items: stretch;
          }

          .speed-label {
            flex: 1 1 100%;
          }

          .speed-label input {
            flex: 1 1 auto;
            width: auto;
          }

          button {
            flex: 1 1 7rem;
          }
        }
      </style>
      <div class="demo">
        <form class="controls">
          <label class="function-label">
            <span>f(z)=</span>
            <input class="function-input" value="${this.expression}" spellcheck="false" autocapitalize="off">
          </label>
          <label class="speed-label">
            Speed
            <input class="speed-input" type="range" min="0.25" max="3" step="0.25" value="${this.animationSpeed}">
            <span class="speed-value">${this.animationSpeed.toFixed(2)}x</span>
          </label>
          <button class="box-button" type="button">Add box</button>
          <button class="path-button" type="button">Draw path</button>
          <button class="clear-paths-button" type="button">Clear paths</button>
          <button class="vector-button" type="button">Add vectors</button>
          <button class="clear-vectors-button" type="button">Clear vectors</button>
          <button type="submit">Animate</button>
          <button class="reset-button" type="button">Reset</button>
          <button class="view-button" type="button">Reset view</button>
          <div class="error" role="alert"></div>
        </form>
        <div class="plot-wrap">
          <canvas aria-label="Animated complex function grid"></canvas>
          <div class="line-tooltip"></div>
        </div>
      </div>
    `;
  }

  cacheElements() {
    this.form = this.shadowRoot.querySelector("form");
    this.functionInput = this.shadowRoot.querySelector(".function-input");
    this.speedInput = this.shadowRoot.querySelector(".speed-input");
    this.speedValue = this.shadowRoot.querySelector(".speed-value");
    this.boxButton = this.shadowRoot.querySelector(".box-button");
    this.pathButton = this.shadowRoot.querySelector(".path-button");
    this.clearPathsButton = this.shadowRoot.querySelector(".clear-paths-button");
    this.vectorButton = this.shadowRoot.querySelector(".vector-button");
    this.clearVectorsButton = this.shadowRoot.querySelector(".clear-vectors-button");
    this.resetButton = this.shadowRoot.querySelector(".reset-button");
    this.viewButton = this.shadowRoot.querySelector(".view-button");
    this.submitButton = this.shadowRoot.querySelector("button[type='submit']");
    this.error = this.shadowRoot.querySelector(".error");
    this.canvas = this.shadowRoot.querySelector("canvas");
    this.tooltip = this.shadowRoot.querySelector(".line-tooltip");
    this.ctx = this.canvas.getContext("2d");
  }

  bindEvents() {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.animate();
    });
    this.functionInput.addEventListener("input", () => {
      this.expression = this.functionInput.value;
    });
    this.speedInput.addEventListener("input", () => {
      this.updateAnimationSpeed(Number(this.speedInput.value));
    });
    this.boxButton.addEventListener("click", () => {
      this.addBox();
    });
    this.pathButton.addEventListener("click", () => {
      this.togglePathMode();
    });
    this.clearPathsButton.addEventListener("click", () => {
      this.clearPaths();
    });
    this.vectorButton.addEventListener("click", () => {
      this.addVectorSource();
    });
    this.clearVectorsButton.addEventListener("click", () => {
      this.clearVectorSources();
    });
    this.resetButton.addEventListener("click", () => {
      this.reset();
    });
    this.viewButton.addEventListener("click", () => {
      this.resetView();
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.startPointerInteraction(event);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      this.continuePointerInteraction(event);
    });
    this.canvas.addEventListener("pointerup", () => {
      this.endPointerInteraction();
    });
    this.canvas.addEventListener("pointercancel", () => {
      this.endPointerInteraction();
      this.hideLineHover();
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.endPointerInteraction();
      this.hideLineHover();
    });
    this.canvas.addEventListener("wheel", (event) => {
      this.zoomView(event);
    }, { passive: false });
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(PLOT_HEIGHT * dpr));

    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }

    this.pixelWidth = rect.width || nextWidth / dpr;
    this.pixelHeight = PLOT_HEIGHT;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  toCanvasPoint(point) {
    const bounds = this.viewBounds();

    return [
      ((point[0] - bounds.left) / (bounds.right - bounds.left)) * this.pixelWidth,
      ((bounds.top - point[1]) / (bounds.top - bounds.bottom)) * this.pixelHeight
    ];
  }

  fromCanvasPoint(point) {
    const bounds = this.viewBounds();

    return [
      bounds.left + (point[0] / this.pixelWidth) * (bounds.right - bounds.left),
      bounds.top - (point[1] / this.pixelHeight) * (bounds.top - bounds.bottom)
    ];
  }

  viewBounds() {
    this.clampView();
    const horizontalHalf = this.horizontalViewHalf();

    return {
      left: this.viewCenter[0] - horizontalHalf,
      right: this.viewCenter[0] + horizontalHalf,
      bottom: this.viewCenter[1] - this.viewHalf,
      top: this.viewCenter[1] + this.viewHalf
    };
  }

  viewAspect() {
    return this.pixelHeight > 0 ? this.pixelWidth / this.pixelHeight : 1;
  }

  horizontalViewHalf() {
    return this.viewHalf * this.viewAspect();
  }

  clampView() {
    const maxViewHalfForAspect = NAVIGATION_LIMIT / Math.max(this.viewAspect(), 1);
    this.viewHalf = clamp(this.viewHalf, MIN_VIEW_HALF, Math.min(MAX_VIEW_HALF, maxViewHalfForAspect));
    const horizontalHalf = this.horizontalViewHalf();
    const maxCenterX = Math.max(0, NAVIGATION_LIMIT - horizontalHalf);
    const maxCenterY = Math.max(0, NAVIGATION_LIMIT - this.viewHalf);

    this.viewCenter = [
      clamp(this.viewCenter[0], -maxCenterX, maxCenterX),
      clamp(this.viewCenter[1], -maxCenterY, maxCenterY)
    ];
  }

  eventToMathPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.fromCanvasPoint([
      event.clientX - rect.left,
      event.clientY - rect.top
    ]);
  }

  eventToCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      event.clientX - rect.left,
      event.clientY - rect.top
    ];
  }

  interpolatedPoint(point, progress) {
    if (!point || !point.target) {
      return null;
    }

    const currentPoint = [
      point.source[0] + (point.target[0] - point.source[0]) * progress,
      point.source[1] + (point.target[1] - point.source[1]) * progress
    ];

    if (!Number.isFinite(currentPoint[0]) || !Number.isFinite(currentPoint[1])) {
      return null;
    }

    if (Math.abs(currentPoint[0]) > MAX_DRAW_COORD || Math.abs(currentPoint[1]) > MAX_DRAW_COORD) {
      return null;
    }

    return [
      currentPoint[0],
      currentPoint[1]
    ];
  }

  interpolatedPointUnclipped(point, progress) {
    if (!point.target) {
      return progress === 0 ? point.source : null;
    }

    const currentPoint = [
      point.source[0] + (point.target[0] - point.source[0]) * progress,
      point.source[1] + (point.target[1] - point.source[1]) * progress
    ];

    return Number.isFinite(currentPoint[0]) && Number.isFinite(currentPoint[1])
      ? currentPoint
      : null;
  }

  draw() {
    if (!this.ctx) {
      return;
    }

    this.ctx.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
    this.ctx.fillStyle = "#050505";
    this.ctx.fillRect(0, 0, this.pixelWidth, this.pixelHeight);
    this.drawBackgroundGrid();
    this.drawAnimatedGrid();
    this.drawAnimatedPaths();
    this.drawAnimatedVectorSources();
    this.drawAnimatedBoxes();
  }

  drawBackgroundGrid() {
    const bounds = this.viewBounds();
    const majorGridStep = this.gridStep;
    const minorGridStep = majorGridStep / 5;
    const xValues = range(
      Math.floor(bounds.left / minorGridStep) * minorGridStep,
      Math.ceil(bounds.right / minorGridStep) * minorGridStep,
      minorGridStep
    );
    const yValues = range(
      Math.floor(bounds.bottom / minorGridStep) * minorGridStep,
      Math.ceil(bounds.top / minorGridStep) * minorGridStep,
      minorGridStep
    );

    this.ctx.save();
    this.ctx.lineWidth = 1;

    xValues.forEach((value) => {
      const isMajor = Math.abs(value / majorGridStep - Math.round(value / majorGridStep)) < 1e-6;
      this.ctx.strokeStyle = isMajor ? "rgba(229, 231, 235, 0.16)" : "rgba(229, 231, 235, 0.075)";
      this.ctx.beginPath();

      const start = this.toCanvasPoint([value, bounds.bottom]);
      const end = this.toCanvasPoint([value, bounds.top]);
      this.ctx.moveTo(start[0], start[1]);
      this.ctx.lineTo(end[0], end[1]);
      this.ctx.stroke();
    });

    yValues.forEach((value) => {
      const isMajor = Math.abs(value / majorGridStep - Math.round(value / majorGridStep)) < 1e-6;
      this.ctx.strokeStyle = isMajor ? "rgba(229, 231, 235, 0.16)" : "rgba(229, 231, 235, 0.075)";
      this.ctx.beginPath();

      const start = this.toCanvasPoint([bounds.left, value]);
      const end = this.toCanvasPoint([bounds.right, value]);
      this.ctx.moveTo(start[0], start[1]);
      this.ctx.lineTo(end[0], end[1]);
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  drawAnimatedGrid() {
    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.animatedGrid.forEach((line) => {
      this.strokeGridLine(line, false);
    });

    this.hoveredLines.forEach((line) => {
      this.strokeGridLine(line, true);
    });

    this.ctx.restore();
  }

  strokeGridLine(line, highlighted) {
    const isAxis = Math.abs(line.value) < 1e-9;

    if (isAxis) {
      this.ctx.strokeStyle = highlighted ? "rgba(255, 255, 255, 1)" : "rgba(255, 255, 255, 0.9)";
      this.ctx.lineWidth = highlighted ? 3.8 : 2.1;
    } else {
      this.ctx.strokeStyle = highlighted ? "rgba(147, 197, 253, 1)" : "rgba(125, 211, 252, 0.82)";
      this.ctx.lineWidth = highlighted ? 3.6 : 1.7;
    }

    this.ctx.beginPath();

    let started = false;

    line.points.forEach((point) => {
      const currentPoint = this.interpolatedPoint(point, this.progress);

      if (!currentPoint) {
        started = false;
        return;
      }

      const canvasPoint = this.toCanvasPoint(currentPoint);

      if (!started) {
        this.ctx.moveTo(canvasPoint[0], canvasPoint[1]);
        started = true;
        return;
      }

      this.ctx.lineTo(canvasPoint[0], canvasPoint[1]);
    });

    this.ctx.stroke();
  }

  drawAnimatedBoxes() {
    if (!this.animatedBoxes || this.animatedBoxes.length === 0) {
      return;
    }

    this.animatedBoxes.forEach((animatedBox) => {
      this.drawAnimatedBox(animatedBox);
    });
  }

  drawAnimatedBox(animatedBox) {
    this.ctx.save();
    this.ctx.lineWidth = 2.4;
    this.ctx.strokeStyle = animatedBox.box.color.stroke;
    this.ctx.fillStyle = animatedBox.box.color.fill;
    this.ctx.lineJoin = "round";
    this.ctx.beginPath();
    let started = false;
    let hasDrawablePoint = false;

    animatedBox.points.forEach((point) => {
      const currentPoint = this.interpolatedPointUnclipped(point, this.progress);

      if (!currentPoint) {
        started = false;
        return;
      }

      const canvasPoint = this.toCanvasPoint(currentPoint);
      hasDrawablePoint = true;

      if (!started) {
        this.ctx.moveTo(canvasPoint[0], canvasPoint[1]);
        started = true;
        return;
      }

      this.ctx.lineTo(canvasPoint[0], canvasPoint[1]);
    });

    if (hasDrawablePoint) {
      this.ctx.closePath();
      this.ctx.fill();
    }

    this.ctx.stroke();

    if (this.progress === 0) {
      this.drawBoxHandles(animatedBox.box);
    }

    this.ctx.restore();
  }

  drawBoxHandles(box) {
    this.boxHandlePoints(box).forEach((handle) => {
      const canvasPoint = this.toCanvasPoint(handle.point);
      this.ctx.beginPath();
      this.ctx.fillStyle = box.color.stroke;
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      this.ctx.lineWidth = 1.6;
      this.ctx.arc(canvasPoint[0], canvasPoint[1], BOX_HANDLE_RADIUS_PX, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    });
  }

  drawAnimatedPaths() {
    if (!this.animatedPaths || this.animatedPaths.length === 0) {
      return;
    }

    this.animatedPaths.forEach((animatedPath) => {
      this.ctx.save();
      this.ctx.strokeStyle = animatedPath.path.color;
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.beginPath();

      let started = false;

      animatedPath.points.forEach((point) => {
        const currentPoint = this.interpolatedPoint(point, this.progress);

        if (!currentPoint) {
          started = false;
          return;
        }

        const canvasPoint = this.toCanvasPoint(currentPoint);

        if (!started) {
          this.ctx.moveTo(canvasPoint[0], canvasPoint[1]);
          started = true;
          return;
        }

        this.ctx.lineTo(canvasPoint[0], canvasPoint[1]);
      });

      this.ctx.stroke();
      this.ctx.restore();
    });
  }

  drawAnimatedVectorSources() {
    if (!this.animatedVectorSources || this.animatedVectorSources.length === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.animatedVectorSources.forEach((source) => {
      const center = this.interpolatedPoint(source.center, this.progress);

      if (!center) {
        return;
      }

      const centerCanvas = this.toCanvasPoint(center);

      source.rays.forEach((ray) => {
        const endpoint = this.interpolatedPoint(ray.endpoint, this.progress);

        if (!endpoint) {
          return;
        }

        const endpointCanvas = this.toCanvasPoint(endpoint);
        this.drawArrow(centerCanvas, endpointCanvas, ray.primary);
      });

      this.ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      this.ctx.strokeStyle = "rgba(20, 184, 166, 1)";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(centerCanvas[0], centerCanvas[1], 4.8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  drawArrow(start, end, primary = false) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);

    if (length < 2) {
      return;
    }

    const ux = dx / length;
    const uy = dy / length;
    const headLength = Math.min(8, Math.max(4, length * 0.28));
    const headWidth = headLength * 0.55;
    const headBase = [
      end[0] - ux * headLength,
      end[1] - uy * headLength
    ];
    const normal = [-uy, ux];

    this.ctx.strokeStyle = primary ? "rgba(250, 204, 21, 1)" : "rgba(20, 184, 166, 0.82)";
    this.ctx.fillStyle = primary ? "rgba(250, 204, 21, 1)" : "rgba(20, 184, 166, 0.82)";
    this.ctx.lineWidth = primary ? 2.8 : 1.45;
    this.ctx.beginPath();
    this.ctx.moveTo(start[0], start[1]);
    this.ctx.lineTo(end[0], end[1]);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(end[0], end[1]);
    this.ctx.lineTo(
      headBase[0] + normal[0] * headWidth,
      headBase[1] + normal[1] * headWidth
    );
    this.ctx.lineTo(
      headBase[0] - normal[0] * headWidth,
      headBase[1] - normal[1] * headWidth
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  setError(message) {
    this.error.textContent = message;
    this.error.dataset.visible = message ? "true" : "false";
  }

  hideLineHover() {
    if (this.hoveredLines.length > 0) {
      this.hoveredLines = [];
      this.draw();
    }

    this.tooltip.textContent = "";
    this.tooltip.dataset.visible = "false";
  }

  updateLineHover(event) {
    if (this.boxInteraction || this.draggingVectorSourceIndex !== null || this.drawingPath) {
      this.hideLineHover();
      return;
    }

    const canvasPoint = this.eventToCanvasPoint(event);
    const matches = this.findGridLinesNear(canvasPoint);

    if (matches.length === 0) {
      this.hideLineHover();
      return;
    }

    const nextLines = matches.map((match) => match.line);
    const changed = nextLines.length !== this.hoveredLines.length
      || nextLines.some((line, index) => line !== this.hoveredLines[index]);

    if (changed) {
      this.hoveredLines = nextLines;
      this.draw();
    }

    this.tooltip.textContent = groupedLineLabels(matches);
    this.tooltip.style.left = `${Math.min(canvasPoint[0], this.pixelWidth - 170)}px`;
    this.tooltip.style.top = `${Math.max(18, Math.min(canvasPoint[1], this.pixelHeight - 18))}px`;
    this.tooltip.dataset.visible = "true";
  }

  findGridLinesNear(canvasPoint) {
    const matches = [];

    this.animatedGrid.forEach((line) => {
      let nearestDistanceForLine = Infinity;

      for (let index = 0; index < line.points.length - 1; index += 1) {
        const point1 = line.points[index];
        const point2 = line.points[index + 1];

        const currentPoint1 = this.interpolatedPoint(point1, this.progress);
        const currentPoint2 = this.interpolatedPoint(point2, this.progress);

        if (!currentPoint1 || !currentPoint2) {
          continue;
        }

        const start = this.toCanvasPoint(currentPoint1);
        const end = this.toCanvasPoint(currentPoint2);
        const distance = distanceToSegment(canvasPoint, start, end);

        if (distance < nearestDistanceForLine) {
          nearestDistanceForLine = distance;
        }
      }

      if (nearestDistanceForLine <= LINE_HIT_RADIUS_PX) {
        matches.push({ line, distance: nearestDistanceForLine });
      }
    });

    return matches.sort((a, b) => a.distance - b.distance);
  }

  setAnimating(isAnimating) {
    this.submitButton.disabled = isAnimating;
    this.boxButton.disabled = isAnimating;
    this.pathButton.disabled = isAnimating;
    this.clearPathsButton.disabled = isAnimating;
    this.vectorButton.disabled = isAnimating;
    this.clearVectorsButton.disabled = isAnimating;
  }

  startPointerInteraction(event) {
    if (this.startPathDraw(event)) {
      return;
    }

    if (this.startVectorSourceDrag(event)) {
      return;
    }

    if (this.startBoxDrag(event)) {
      return;
    }

    this.startPan(event);
  }

  continuePointerInteraction(event) {
    if (this.drawingPath) {
      this.continuePathDraw(event);
      return;
    }

    if (this.draggingVectorSourceIndex !== null) {
      this.dragVectorSource(event);
      return;
    }

    if (this.boxInteraction) {
      this.dragBox(event);
      return;
    }

    if (this.panning) {
      this.panView(event);
      return;
    }

    this.updateLineHover(event);
  }

  endPointerInteraction() {
    this.endPathDraw();
    this.endVectorSourceDrag();
    this.endBoxDrag();
    this.endPan();
  }

  stopAnimation() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.animationStart = null;
    this.setAnimating(false);
  }

  animate() {
    try {
      const fn = compileExpression(this.expression);
      this.currentFunction = fn;
      this.animatedGrid = buildAnimatedGrid(fn, this.gridStep);
      this.animatedBoxes = buildAnimatedBoxes(this.boxes, fn);
      this.animatedPaths = buildAnimatedPaths(this.paths, fn);
      this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, fn);
      this.progress = 0;
      this.setError("");
      this.hideLineHover();
      this.stopAnimation();
      this.setAnimating(true);
      this.animationStart = performance.now();
      this.animationFrame = requestAnimationFrame((timestamp) => this.tick(timestamp));
    } catch (err) {
      this.stopAnimation();
      this.setError(err instanceof Error ? err.message : "Could not parse the function.");
    }
  }

  tick(timestamp) {
    if (this.animationStart === null) {
      this.animationStart = timestamp;
    }

    const elapsed = timestamp - this.animationStart;
    const computedProgress = animationProgressFromElapsed(elapsed, this.animationSpeed);
    this.progress = Math.min(1, computedProgress);
    this.draw();

    if (computedProgress < 1) {
      this.animationFrame = requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
      return;
    }

    this.animationFrame = null;
    this.animationStart = null;
    this.setAnimating(false);
  }

  reset() {
    this.stopAnimation();
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);
    this.animatedPaths = buildAnimatedPaths(this.paths, identity);
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.progress = 0;
    this.setError("");
    this.hideLineHover();
    this.draw();
  }

  resetView() {
    this.viewCenter = [0, 0];
    this.viewHalf = DEFAULT_VIEW_HALF;
    this.hideLineHover();
    this.draw();
  }

  updateAnimationSpeed(nextAnimationSpeed) {
    if (!Number.isFinite(nextAnimationSpeed)) {
      return;
    }

    this.animationSpeed = nextAnimationSpeed;
    this.speedValue.textContent = `${this.animationSpeed.toFixed(2)}x`;
  }

  addBox() {
    this.stopAnimation();
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.animatedPaths = buildAnimatedPaths(this.paths, identity);
    this.progress = 0;
    this.hideLineHover();
    const color = BOX_COLORS[this.boxes.length % BOX_COLORS.length];
    const offset = (this.boxes.length % 5) * 0.22;
    const box = {
      center: [this.viewCenter[0] - 0.55 + offset, this.viewCenter[1] + 0.55 - offset],
      width: BOX_SIZE,
      height: BOX_SIZE,
      color
    };

    this.boxes = [...this.boxes, box];
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);

    this.setError("");
    this.draw();
  }

  togglePathMode() {
    if (this.animationFrame !== null || this.progress !== 0) {
      this.reset();
    }

    this.pathMode = !this.pathMode;
    this.pathButton.textContent = this.pathMode ? "Drawing path" : "Draw path";
    this.pathButton.style.borderColor = this.pathMode ? "#db2777" : "";
    this.pathButton.style.background = this.pathMode ? "#fdf2f8" : "";
    this.hideLineHover();
  }

  clearPaths() {
    this.stopAnimation();
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.paths = [];
    this.animatedPaths = [];
    this.pathDraft = null;
    this.drawingPath = false;
    this.progress = 0;
    this.setError("");
    this.hideLineHover();
    this.draw();
  }

  addVectorSource() {
    this.stopAnimation();
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);
    this.animatedPaths = buildAnimatedPaths(this.paths, identity);
    this.progress = 0;
    this.hideLineHover();

    const seed = VECTOR_SOURCE_SEEDS[this.vectorSources.length % VECTOR_SOURCE_SEEDS.length];
    const center = [
      clamp(this.viewCenter[0] + seed[0], -NAVIGATION_LIMIT, NAVIGATION_LIMIT),
      clamp(this.viewCenter[1] + seed[1], -NAVIGATION_LIMIT, NAVIGATION_LIMIT)
    ];
    this.vectorSources = [
      ...this.vectorSources,
      { center, radius: VECTOR_SOURCE_RADIUS }
    ];
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.setError("");
    this.draw();
  }

  clearVectorSources() {
    this.stopAnimation();
    this.currentFunction = identity;
    this.animatedGrid = buildAnimatedGrid(identity, this.gridStep);
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);
    this.animatedPaths = buildAnimatedPaths(this.paths, identity);
    this.vectorSources = [];
    this.animatedVectorSources = [];
    this.progress = 0;
    this.draggingVectorSourceIndex = null;
    this.setError("");
    this.hideLineHover();
    this.draw();
  }

  startPathDraw(event) {
    if (!this.pathMode || this.animationFrame !== null || this.progress !== 0) {
      return false;
    }

    const point = this.eventToMathPoint(event);
    const color = PATH_COLORS[this.paths.length % PATH_COLORS.length];
    this.drawingPath = true;
    this.pathDraft = { points: [point], color };
    this.hideLineHover();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "crosshair";
    return true;
  }

  continuePathDraw(event) {
    if (!this.drawingPath || !this.pathDraft) {
      return;
    }

    const point = this.eventToMathPoint(event);
    const previous = this.pathDraft.points[this.pathDraft.points.length - 1];

    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.025) {
      return;
    }

    this.pathDraft.points.push(point);
    this.animatedPaths = buildAnimatedPaths([...this.paths, this.pathDraft], identity);
    this.draw();
  }

  endPathDraw() {
    if (!this.drawingPath || !this.pathDraft) {
      return;
    }

    if (this.pathDraft.points.length > 1) {
      this.paths = [...this.paths, this.pathDraft];
    }

    this.pathDraft = null;
    this.drawingPath = false;
    this.animatedPaths = buildAnimatedPaths(this.paths, identity);
    this.canvas.style.cursor = "grab";
    this.draw();
  }

  startVectorSourceDrag(event) {
    if (this.animationFrame !== null || this.progress !== 0) {
      return false;
    }

    const canvasPoint = this.eventToCanvasPoint(event);
    let nearestIndex = null;
    let nearestDistance = VECTOR_SOURCE_HIT_RADIUS_PX;

    this.vectorSources.forEach((source, index) => {
      const sourceCanvas = this.toCanvasPoint(source.center);
      const distance = Math.hypot(
        canvasPoint[0] - sourceCanvas[0],
        canvasPoint[1] - sourceCanvas[1]
      );

      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });

    if (nearestIndex === null) {
      return false;
    }

    const point = this.eventToMathPoint(event);
    const source = this.vectorSources[nearestIndex];
    this.draggingVectorSourceIndex = nearestIndex;
    this.dragOffset = [
      point[0] - source.center[0],
      point[1] - source.center[1]
    ];
    this.hideLineHover();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    return true;
  }

  dragVectorSource(event) {
    if (this.draggingVectorSourceIndex === null) {
      return;
    }

    const point = this.eventToMathPoint(event);
    const nextSources = this.vectorSources.map((source, index) => {
      if (index !== this.draggingVectorSourceIndex) {
        return source;
      }

      return {
        ...source,
        center: [
          clamp(point[0] - this.dragOffset[0], -NAVIGATION_LIMIT, NAVIGATION_LIMIT),
          clamp(point[1] - this.dragOffset[1], -NAVIGATION_LIMIT, NAVIGATION_LIMIT)
        ]
      };
    });

    this.vectorSources = nextSources;
    this.animatedVectorSources = buildAnimatedVectorSources(this.vectorSources, identity);
    this.draw();
  }

  endVectorSourceDrag() {
    this.draggingVectorSourceIndex = null;
  }

  boxHandlePoints(box) {
    const halfWidth = box.width / 2;
    const halfHeight = box.height / 2;
    const left = box.center[0] - halfWidth;
    const right = box.center[0] + halfWidth;
    const bottom = box.center[1] - halfHeight;
    const top = box.center[1] + halfHeight;
    const midX = box.center[0];
    const midY = box.center[1];

    return [
      { handle: "nw", point: [left, top] },
      { handle: "n", point: [midX, top] },
      { handle: "ne", point: [right, top] },
      { handle: "e", point: [right, midY] },
      { handle: "se", point: [right, bottom] },
      { handle: "s", point: [midX, bottom] },
      { handle: "sw", point: [left, bottom] },
      { handle: "w", point: [left, midY] }
    ];
  }

  startBoxDrag(event) {
    if (this.boxes.length === 0 || this.animationFrame !== null || this.progress !== 0) {
      return false;
    }

    const canvasPoint = this.eventToCanvasPoint(event);
    const point = this.eventToMathPoint(event);
    let interaction = null;

    for (let index = this.boxes.length - 1; index >= 0; index -= 1) {
      const box = this.boxes[index];
      const handleHit = this.boxHandlePoints(box).find((handle) => {
        const handleCanvas = this.toCanvasPoint(handle.point);
        return Math.hypot(
          canvasPoint[0] - handleCanvas[0],
          canvasPoint[1] - handleCanvas[1]
        ) <= BOX_HANDLE_RADIUS_PX + 3;
      });

      if (handleHit) {
        interaction = {
          index,
          mode: "resize",
          handle: handleHit.handle,
          startPoint: point,
          startBox: { ...box, center: [...box.center] }
        };
        break;
      }

      const halfWidth = box.width / 2;
      const halfHeight = box.height / 2;
      const insideBox = point[0] >= box.center[0] - halfWidth
        && point[0] <= box.center[0] + halfWidth
        && point[1] >= box.center[1] - halfHeight
        && point[1] <= box.center[1] + halfHeight;

      if (insideBox) {
        interaction = {
          index,
          mode: "move",
          startPoint: point,
          startBox: { ...box, center: [...box.center] }
        };
        break;
      }
    }

    if (!interaction) {
      return false;
    }

    this.boxInteraction = interaction;
    this.hideLineHover();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    return true;
  }

  dragBox(event) {
    if (!this.boxInteraction) {
      return;
    }

    const point = this.eventToMathPoint(event);
    const nextBoxes = this.boxes.map((box, index) => {
      if (index !== this.boxInteraction.index) {
        return box;
      }

      if (this.boxInteraction.mode === "move") {
        const dx = point[0] - this.boxInteraction.startPoint[0];
        const dy = point[1] - this.boxInteraction.startPoint[1];
        return {
          ...box,
          center: [
            clamp(
              this.boxInteraction.startBox.center[0] + dx,
              -NAVIGATION_LIMIT + box.width / 2,
              NAVIGATION_LIMIT - box.width / 2
            ),
            clamp(
              this.boxInteraction.startBox.center[1] + dy,
              -NAVIGATION_LIMIT + box.height / 2,
              NAVIGATION_LIMIT - box.height / 2
            )
          ]
        };
      }

      return this.resizedBox(this.boxInteraction.startBox, this.boxInteraction.handle, point);
    });

    this.boxes = nextBoxes;
    this.animatedBoxes = buildAnimatedBoxes(this.boxes, identity);
    this.draw();
  }

  endBoxDrag() {
    this.boxInteraction = null;
  }

  resizedBox(box, handle, point) {
    let left = box.center[0] - box.width / 2;
    let right = box.center[0] + box.width / 2;
    let bottom = box.center[1] - box.height / 2;
    let top = box.center[1] + box.height / 2;

    if (handle.includes("w")) {
      left = clamp(point[0], -NAVIGATION_LIMIT, right - MIN_BOX_SIZE);
    }

    if (handle.includes("e")) {
      right = clamp(point[0], left + MIN_BOX_SIZE, NAVIGATION_LIMIT);
    }

    if (handle.includes("s")) {
      bottom = clamp(point[1], -NAVIGATION_LIMIT, top - MIN_BOX_SIZE);
    }

    if (handle.includes("n")) {
      top = clamp(point[1], bottom + MIN_BOX_SIZE, NAVIGATION_LIMIT);
    }

    return {
      ...box,
      center: [(left + right) / 2, (bottom + top) / 2],
      width: right - left,
      height: top - bottom
    };
  }

  startPan(event) {
    this.panning = true;
    this.panStartCanvas = this.eventToCanvasPoint(event);
    this.panStartCenter = [...this.viewCenter];
    this.hideLineHover();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
  }

  panView(event) {
    const point = this.eventToCanvasPoint(event);
    const dx = point[0] - this.panStartCanvas[0];
    const dy = point[1] - this.panStartCanvas[1];
    const bounds = this.viewBounds();
    const unitsPerPixelX = (bounds.right - bounds.left) / this.pixelWidth;
    const unitsPerPixelY = (bounds.top - bounds.bottom) / this.pixelHeight;

    this.viewCenter = [
      this.panStartCenter[0] - dx * unitsPerPixelX,
      this.panStartCenter[1] + dy * unitsPerPixelY
    ];
    this.clampView();
    this.hideLineHover();
    this.draw();
  }

  endPan() {
    this.panning = false;
    this.canvas.style.cursor = "grab";
  }

  zoomView(event) {
    event.preventDefault();

    const canvasPoint = this.eventToCanvasPoint(event);
    const beforeZoom = this.fromCanvasPoint(canvasPoint);
    const zoomFactor = event.deltaY > 0 ? 1.12 : 0.88;
    this.viewHalf = clamp(this.viewHalf * zoomFactor, MIN_VIEW_HALF, MAX_VIEW_HALF);
    const afterZoom = this.fromCanvasPoint(canvasPoint);

    this.viewCenter = [
      this.viewCenter[0] + beforeZoom[0] - afterZoom[0],
      this.viewCenter[1] + beforeZoom[1] - afterZoom[1]
    ];
    this.clampView();
    this.hideLineHover();
    this.draw();
  }
}

customElements.define("custom-complex-demo", CustomComplexDemo);
