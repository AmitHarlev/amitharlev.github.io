import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Coordinates, Line, Mafs } from "mafs";

const h = React.createElement;
const VIEW_LIMIT = 3.25;
const GRID_LIMIT = 2.5;
const DEFAULT_GRID_STEP = 0.5;
const SAMPLE_COUNT = 40;
const ANIMATION_MS = 2600;
const MAX_DRAW_COORD = 14;
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

function buildSourceGrid(gridStep) {
  const start = Math.ceil(-GRID_LIMIT / gridStep) * gridStep;
  const end = Math.floor(GRID_LIMIT / gridStep) * gridStep;

  return range(start, end, gridStep).flatMap((value) => {
    const vertical = [];
    const horizontal = [];

    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const t = index / SAMPLE_COUNT;
      const coordinate = -GRID_LIMIT + t * GRID_LIMIT * 2;
      vertical.push([value, coordinate]);
      horizontal.push([coordinate, value]);
    }

    return [
      { axis: "vertical", points: vertical },
      { axis: "horizontal", points: horizontal }
    ];
  });
}

function identity(z) {
  return z;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function buildAnimatedGrid(fn, gridStep) {
  return buildSourceGrid(gridStep).map((line) => ({
    axis: line.axis,
    points: line.points.map((point) => {
      const source = complex(point[0], point[1]);
      const target = fn(source);

      if (!isFiniteComplex(target)) {
        return null;
      }

      if (Math.abs(target.re) > MAX_DRAW_COORD || Math.abs(target.im) > MAX_DRAW_COORD) {
        return null;
      }

      return {
        source: [source.re, source.im],
        target: [target.re, target.im]
      };
    })
  }));
}

function gridSegments(animatedGrid, progress) {
  const easedProgress = easeOutCubic(progress);

  return animatedGrid.flatMap((line, lineIndex) => {
    const color = line.axis === "vertical" ? "#2563eb" : "#dc2626";
    const opacity = line.axis === "vertical" ? 0.68 : 0.58;
    const segments = [];

    for (let index = 0; index < line.points.length - 1; index += 1) {
      const point1 = line.points[index];
      const point2 = line.points[index + 1];

      if (!point1 || !point2) {
        continue;
      }

      const interpolatedPoint1 = [
        point1.source[0] + (point1.target[0] - point1.source[0]) * easedProgress,
        point1.source[1] + (point1.target[1] - point1.source[1]) * easedProgress
      ];
      const interpolatedPoint2 = [
        point2.source[0] + (point2.target[0] - point2.source[0]) * easedProgress,
        point2.source[1] + (point2.target[1] - point2.source[1]) * easedProgress
      ];

      segments.push(h(Line.Segment, {
        key: `${lineIndex}-${index}`,
        point1: interpolatedPoint1,
        point2: interpolatedPoint2,
        color,
        opacity,
        weight: line.axis === "vertical" ? 1.45 : 1.25
      }));
    }

    return segments;
  });
}

function AmplitwistDemo() {
  const [expression, setExpression] = useState("z^2");
  const [gridStep, setGridStep] = useState(DEFAULT_GRID_STEP);
  const [animatedGrid, setAnimatedGrid] = useState(() => buildAnimatedGrid(identity, DEFAULT_GRID_STEP));
  const [progress, setProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState("");
  const rafRef = useRef(null);
  const animationStartRef = useRef(null);
  const currentFunctionRef = useRef(identity);
  const segments = useMemo(
    () => gridSegments(animatedGrid, progress),
    [animatedGrid, progress]
  );

  useEffect(() => {
    if (!isAnimating) {
      return undefined;
    }

    const tick = (timestamp) => {
      if (animationStartRef.current === null) {
        animationStartRef.current = timestamp;
      }

      const elapsed = timestamp - animationStartRef.current;
      const nextProgress = Math.min(1, elapsed / ANIMATION_MS);
      setProgress(nextProgress);

      if (nextProgress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setIsAnimating(false);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isAnimating, animatedGrid]);

  function animate() {
    try {
      const fn = compileExpression(expression);
      currentFunctionRef.current = fn;
      setAnimatedGrid(buildAnimatedGrid(fn, gridStep));
      setProgress(0);
      setError("");
      animationStartRef.current = performance.now();
      setIsAnimating(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse the function.");
      setIsAnimating(false);
    }
  }

  function reset() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    currentFunctionRef.current = identity;
    setAnimatedGrid(buildAnimatedGrid(identity, gridStep));
    setProgress(0);
    setIsAnimating(false);
    setError("");
  }

  function updateGridStep(value) {
    const nextGridStep = Number(value);

    if (!Number.isFinite(nextGridStep)) {
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setGridStep(nextGridStep);
    setAnimatedGrid(buildAnimatedGrid(currentFunctionRef.current, nextGridStep));
    setIsAnimating(false);
  }

  function submit(event) {
    event.preventDefault();
    animate();
  }

  return h("div", { className: "amplitwist-demo" },
    h("style", null, `
      .amplitwist-demo {
        border: 1px solid #d8dee4;
        border-radius: 8px;
        background: #fff;
        overflow: hidden;
      }

      .amplitwist-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        align-items: center;
        padding: 0.7rem;
        border-bottom: 1px solid #e5e7eb;
        background: #f7f9fb;
      }

      .amplitwist-input-label {
        display: flex;
        flex: 1 1 17rem;
        min-width: 0;
        align-items: center;
        gap: 0.45rem;
        font-family: monospace, monospace;
      }

      .amplitwist-function-label {
        white-space: nowrap;
      }

      .amplitwist-input-label input {
        width: 100%;
        min-width: 9rem;
        border: 1px solid #b7c0cc;
        border-radius: 6px;
        padding: 0.45rem 0.55rem;
        font: inherit;
        background: white;
        color: #172033;
      }

      .amplitwist-grid-label {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font: 0.9rem/1.2 sans-serif;
        color: #374151;
        white-space: nowrap;
      }

      .amplitwist-grid-label input {
        width: 6.8rem;
        accent-color: #1d4ed8;
      }

      .amplitwist-grid-value {
        min-width: 2.4rem;
        font-family: monospace, monospace;
        color: #172033;
      }

      .amplitwist-controls button {
        border: 1px solid #9ca3af;
        border-radius: 6px;
        padding: 0.45rem 0.75rem;
        background: #fff;
        color: #172033;
        font: inherit;
        cursor: pointer;
      }

      .amplitwist-controls button:first-of-type {
        border-color: #1d4ed8;
        background: #1d4ed8;
        color: #fff;
      }

      .amplitwist-controls button:disabled {
        cursor: wait;
        opacity: 0.72;
      }

      .amplitwist-error {
        width: 100%;
        color: #b91c1c;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      .amplitwist-mafs {
        width: 100%;
        background: #ffffff;
      }

      @media (max-width: 520px) {
        .amplitwist-controls {
          align-items: stretch;
        }

        .amplitwist-controls button {
          flex: 1 1 7rem;
        }

        .amplitwist-grid-label {
          flex: 1 1 100%;
        }

        .amplitwist-grid-label input {
          flex: 1 1 auto;
          width: auto;
        }
      }
    `),
    h("form", { className: "amplitwist-controls", onSubmit: submit },
      h("label", { className: "amplitwist-input-label" },
        h("span", { className: "amplitwist-function-label" }, "f(z)="),
        h("input", {
          value: expression,
          spellCheck: "false",
          autoCapitalize: "off",
          onChange: (event) => setExpression(event.target.value)
        })
      ),
      h("label", { className: "amplitwist-grid-label" },
        "Grid spacing",
        h("input", {
          type: "range",
          min: "0.25",
          max: "1",
          step: "0.25",
          value: gridStep,
          onChange: (event) => updateGridStep(event.target.value)
        }),
        h("span", { className: "amplitwist-grid-value" }, gridStep.toFixed(2))
      ),
      h("button", { type: "submit", disabled: isAnimating }, "Animate"),
      h("button", { type: "button", onClick: reset }, "Reset"),
      error ? h("div", { className: "amplitwist-error", role: "alert" }, error) : null
    ),
    h("div", { className: "amplitwist-mafs" },
      h(Mafs, {
        height: 520,
        pan: false,
        zoom: false,
        preserveAspectRatio: "contain",
        viewBox: {
          x: [-VIEW_LIMIT, VIEW_LIMIT],
          y: [-VIEW_LIMIT, VIEW_LIMIT],
          padding: 0
        }
      },
        h(Coordinates.Cartesian, {
          subdivisions: 2,
          xAxis: { lines: 1, labels: () => "" },
          yAxis: { lines: 1, labels: () => "" }
        }),
        segments
      )
    )
  );
}

class AmplitwistDemoElement extends HTMLElement {
  connectedCallback() {
    if (this.root) {
      return;
    }

    this.root = createRoot(this);
    this.root.render(h(AmplitwistDemo));
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

customElements.define("amplitwist-demo", AmplitwistDemoElement);
