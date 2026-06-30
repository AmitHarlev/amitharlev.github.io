const EPS = 1e-7;
const RANGE = {
  minX: 0,
  maxX: 6,
  minY: 0,
  maxY: 5
};

const SVG_PLOT = {
  left: 70,
  right: 590,
  top: 64,
  bottom: 564
};

const PRESETS = [
  {
    id: "example_1",
    name: "Example 1",
    objective: { x: 10, y: 1 },
    range: RANGE,
    constraints: [
      { a: 1, b: 1, r: 4.5, label: "x + y <= 4.5" },
      { a: 1, b: 0, r: 2.2, label: "x <= 2.2" },
      { a: 0, b: 1, r: 4, label: "y <= 4" }
    ]
  },
  {
    id: "example_2",
    name: "Example 2",
    objective: { x: 1, y: 1 },
    range: RANGE,
    constraints: [
      { a: 2, b: 1, r: 4.5, label: "2x + y <= 4.5" },
      { a: 1, b: 2, r: 4.5, label: "x + 2y <= 4.5" }
    ]
  },
  {
    id: "example_3",
    name: "Example 3",
    objective: { x: 1, y: 1 },
    range: RANGE,
    constraints: [
      { a: 2, b: 1, r: 5.2, label: "2x + y <= 5.2" },
      { a: 1, b: 2, r: 5.2, label: "x + 2y <= 5.2" }
    ]
  },
  {
    id: "example_4",
    name: "Example 4",
    objective: { x: 4, y: 3 },
    range: RANGE,
    constraints: [
      { a: 3, b: 2, r: 12.5, label: "3x + 2y <= 12.5" },
      { a: 1, b: 3, r: 10.5, label: "x + 3y <= 10.5" }
    ]
  }
];

const CUSTOM_ID = "custom";
const APPLIED_CUSTOM_ID = "applied_custom";
const CUTTING_DEFAULT_ID = "example_1";

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const fixed = Number(value).toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cloneProblem(problem) {
  return {
    id: problem.id,
    name: problem.name,
    objective: { ...problem.objective },
    range: { ...problem.range },
    constraints: problem.constraints.map((constraint) => ({ ...constraint }))
  };
}

function objective(point, problem) {
  return problem.objective.x * point.x + problem.objective.y * point.y;
}

function closeEnough(a, b) {
  return Math.abs(a - b) <= EPS;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function regionLabel(index) {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

function isIntegerValue(value) {
  return Math.abs(value - Math.round(value)) <= 1e-6;
}

function isIntegerPoint(point) {
  return isIntegerValue(point.x) && isIntegerValue(point.y);
}

function constraintValue(constraint, point) {
  return constraint.a * point.x + constraint.b * point.y - constraint.r;
}

function satisfies(point, constraints) {
  return constraints.every((constraint) => constraintValue(constraint, point) <= EPS);
}

function intersection(c1, c2) {
  const det = c1.a * c2.b - c2.a * c1.b;

  if (Math.abs(det) <= EPS) {
    return null;
  }

  return {
    x: (c1.r * c2.b - c2.r * c1.b) / det,
    y: (c1.a * c2.r - c2.a * c1.r) / det
  };
}

function uniquePoints(points) {
  const result = [];

  for (const point of points) {
    if (!result.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 1e-6)) {
      result.push(point);
    }
  }

  return result;
}

function nonnegativeConstraints() {
  return [
    { a: -1, b: 0, r: 0, label: "x >= 0" },
    { a: 0, b: -1, r: 0, label: "y >= 0" }
  ];
}

function solveRelaxation(constraints, problem) {
  const allConstraints = constraints.concat(nonnegativeConstraints());
  const candidates = [];

  for (let i = 0; i < allConstraints.length; i += 1) {
    for (let j = i + 1; j < allConstraints.length; j += 1) {
      const point = intersection(allConstraints[i], allConstraints[j]);

      if (point && satisfies(point, allConstraints)) {
        candidates.push(point);
      }
    }
  }

  const vertices = uniquePoints(candidates);

  if (!vertices.length) {
    return { feasible: false, point: null, value: -Infinity };
  }

  let best = vertices[0];
  let bestValue = objective(best, problem);

  for (const vertex of vertices.slice(1)) {
    const value = objective(vertex, problem);

    if (value > bestValue + EPS) {
      best = vertex;
      bestValue = value;
    }
  }

  return {
    feasible: true,
    point: best,
    value: bestValue,
    vertices
  };
}

function clipPolygon(polygon, constraint) {
  if (!polygon.length) {
    return [];
  }

  const clipped = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = constraintValue(constraint, current) <= EPS;
    const nextInside = constraintValue(constraint, next) <= EPS;
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const denom = constraint.a * dx + constraint.b * dy;

    let crossing = null;

    if (Math.abs(denom) > EPS) {
      const t = (constraint.r - constraint.a * current.x - constraint.b * current.y) / denom;
      crossing = {
        x: current.x + t * dx,
        y: current.y + t * dy
      };
    }

    if (currentInside && nextInside) {
      clipped.push(next);
    } else if (currentInside && !nextInside) {
      if (crossing) {
        clipped.push(crossing);
      }
    } else if (!currentInside && nextInside) {
      if (crossing) {
        clipped.push(crossing);
      }
      clipped.push(next);
    }
  }

  return uniquePoints(clipped);
}

function polygonForConstraints(constraints, range) {
  let polygon = [
    { x: range.minX, y: range.minY },
    { x: range.maxX, y: range.minY },
    { x: range.maxX, y: range.maxY },
    { x: range.minX, y: range.maxY }
  ];

  for (const constraint of nonnegativeConstraints().concat(constraints)) {
    polygon = clipPolygon(polygon, constraint);
  }

  return polygon;
}

function branchConstraint(dim, sense, value) {
  if (dim === "x" && sense === "le") {
    return { a: 1, b: 0, r: value, label: `x <= ${value}` };
  }

  if (dim === "x") {
    return { a: -1, b: 0, r: -value, label: `x >= ${value}` };
  }

  if (sense === "le") {
    return { a: 0, b: 1, r: value, label: `y <= ${value}` };
  }

  return { a: 0, b: -1, r: -value, label: `y >= ${value}` };
}

function branchInequalityLabel(dim, sense, value) {
  const variable = dim === "x" ? "x₁" : "x₂";
  const relation = sense === "le" ? "≤" : "≥";

  return `${variable} ${relation} ${fmt(value, 0)}`;
}

function branchVariableLabel(dim) {
  return dim === "x" ? "x₁" : "x₂";
}

function branchInequalityParts(label) {
  const match = label.match(/^x([₁₂]) ([≤≥]) (.+)$/);

  if (!match) {
    return null;
  }

  return {
    subscript: match[1] === "₁" ? "1" : "2",
    relation: match[2],
    value: match[3]
  };
}

function integerPoints(constraints, problem) {
  const points = [];
  const range = problem.range;
  const allConstraints = nonnegativeConstraints().concat(constraints);
  const minX = Math.ceil(range.minX);
  const maxX = Math.floor(range.maxX);
  const minY = Math.ceil(range.minY);
  const maxY = Math.floor(range.maxY);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const point = { x, y };

      if (satisfies(point, allConstraints)) {
        points.push({
          ...point,
          value: objective(point, problem)
        });
      }
    }
  }

  return points;
}

function integerGcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));

  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }

  return x || 1;
}

function reduceIntegerConstraint(constraint) {
  const divisor = integerGcd(integerGcd(constraint.a, constraint.b), constraint.r);

  return {
    ...constraint,
    a: constraint.a / divisor,
    b: constraint.b / divisor,
    r: constraint.r / divisor
  };
}

function inequalityLabel(constraint) {
  const terms = [
    { coefficient: constraint.a, variable: "x" },
    { coefficient: constraint.b, variable: "y" }
  ].filter((term) => Math.abs(term.coefficient) > EPS);

  if (!terms.length) {
    return `0 <= ${fmt(constraint.r)}`;
  }

  return `${terms.map((term, index) => {
    const sign = term.coefficient < 0 ? "-" : "+";
    const magnitude = Math.abs(term.coefficient);
    const body = closeEnough(magnitude, 1) ? term.variable : `${fmt(magnitude)}${term.variable}`;

    if (index === 0) {
      return term.coefficient < 0 ? `-${body}` : body;
    }

    return `${sign} ${body}`;
  }).join(" ")} <= ${fmt(constraint.r)}`;
}

function hullCross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points) {
  const sorted = uniquePoints(points)
    .map((point) => ({ x: point.x, y: point.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);

  if (sorted.length <= 2) {
    return sorted;
  }

  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && hullCross(lower[lower.length - 2], lower[lower.length - 1], point) <= EPS) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper = [];
  for (const point of sorted.slice().reverse()) {
    while (upper.length >= 2 && hullCross(upper[upper.length - 2], upper[upper.length - 1], point) <= EPS) {
      upper.pop();
    }
    upper.push(point);
  }

  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function sameConstraint(left, right) {
  return closeEnough(left.a, right.a)
    && closeEnough(left.b, right.b)
    && closeEnough(left.r, right.r);
}

function separatingIntegerHullCut(point, integerFeasiblePoints, existingConstraints) {
  const hull = convexHull(integerFeasiblePoints);

  if (hull.length < 3) {
    return null;
  }

  let best = null;

  for (let index = 0; index < hull.length; index += 1) {
    const from = hull[index];
    const to = hull[(index + 1) % hull.length];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const raw = {
      a: dy,
      b: -dx,
      r: dy * from.x - dx * from.y
    };
    const cut = reduceIntegerConstraint(raw);
    const violation = constraintValue(cut, point);

    if (
      violation > EPS
      && !existingConstraints.some((constraint) => sameConstraint(constraint, cut))
      && (!best || violation > best.violation + EPS)
    ) {
      best = { ...cut, violation };
    }
  }

  return best ? { ...best, label: inequalityLabel(best) } : null;
}

class BranchAndBoundDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.selectedProblemId = PRESETS[0].id;
    this.problem = cloneProblem(PRESETS[0]);
    this.customDraft = this.problemToDraft(this.problem);
    this.customError = "";
    this.editingCustomProblem = false;
    this.reset();
  }

  connectedCallback() {
    this.render();
  }

  reset() {
    this.nextId = 1;
    this.nodes = [{
      id: 0,
      name: regionLabel(0),
      parentId: null,
      depth: 0,
      constraints: [],
      status: "open",
      relaxation: null,
      branchLabel: "root"
    }];
    this.currentId = 0;
    this.incumbent = null;
    this.displayedRelaxationNodeId = null;
    this.lastBranch = null;
    this.message = "solve the root relaxation";
  }

  allConstraints(node) {
    return this.problem.constraints.concat(node.constraints);
  }

  problemToDraft(problem) {
    return [
      `${problem.range.minX}, ${problem.range.maxX}, ${problem.range.minY}, ${problem.range.maxY} # plotting window: x_1 min, x_1 max, x_2 min, x_2 max`,
      `${problem.objective.x}, ${problem.objective.y} # objective coefficients c_1, c_2`,
      ...problem.constraints.map((constraint, index) => `${constraint.a}, ${constraint.b}, ${constraint.r} # constraint ${index + 1}: A, B, R means A x_1 + B x_2 <= R`)
    ].join("\n");
  }

  selectProblem(id) {
    this.customError = "";

    if (id === APPLIED_CUSTOM_ID) {
      this.render();
      return;
    }

    if (id === CUSTOM_ID) {
      this.editingCustomProblem = true;
      this.render();
      return;
    } else {
      this.selectedProblemId = id;
      this.editingCustomProblem = false;
      const preset = PRESETS.find((problem) => problem.id === id) ?? PRESETS[0];
      this.problem = cloneProblem(preset);
      this.customDraft = this.problemToDraft(this.problem);
    }

    this.reset();
    this.render();
  }

  updateCustomDraft(value) {
    this.customDraft = value;
  }

  parseCustomProblem() {
    const lines = this.customDraft.split("\n")
      .map((line) => line.split("#")[0].trim())
      .filter(Boolean);

    if (lines.length < 3) {
      this.customError = "Use at least three uncommented rows: ranges, objective, and one constraint.";
      return null;
    }

    const rangeParts = lines[0].split(/[,\s]+/).filter(Boolean).map(Number);
    const objectiveParts = lines[1].split(/[,\s]+/).filter(Boolean).map(Number);

    if (rangeParts.length !== 4 || !rangeParts.every(Number.isFinite)) {
      this.customError = "First row must be the plotting window: x_1 min, x_1 max, x_2 min, x_2 max.";
      return null;
    }

    if (objectiveParts.length !== 2 || !objectiveParts.every(Number.isFinite)) {
      this.customError = "Second row must be: objective coefficient for x_1, objective coefficient for x_2.";
      return null;
    }

    const [minX, maxX, minY, maxY] = rangeParts;
    const [objectiveX, objectiveY] = objectiveParts;

    if (maxX <= minX || maxY <= minY) {
      this.customError = "Each plotting-window axis max must be larger than its min.";
      return null;
    }

    const constraints = [];

    for (const [index, line] of lines.slice(2).entries()) {
      const parts = line.split(/[,\s]+/).filter(Boolean).map(Number);

      if (parts.length !== 3 || !parts.every(Number.isFinite)) {
        this.customError = `Constraint row ${index + 3} must be: A, B, R.`;
        return null;
      }

      const [a, b, r] = parts;
      constraints.push({
        a,
        b,
        r,
        label: `${fmt(a)}x + ${fmt(b)}y <= ${fmt(r)}`
      });
    }

    this.customError = "";
    return {
      id: CUSTOM_ID,
      name: "Custom",
      objective: { x: objectiveX, y: objectiveY },
      range: { minX, maxX, minY, maxY },
      constraints
    };
  }

  applyCustomProblem() {
    const parsed = this.parseCustomProblem();

    if (!parsed) {
      this.render();
      return;
    }

    this.selectedProblemId = CUSTOM_ID;
    this.editingCustomProblem = false;
    this.problem = parsed;
    this.reset();
    this.render();
  }

  nodeById(id) {
    return this.nodes.find((node) => node.id === id);
  }

  currentNode() {
    return this.nodeById(this.currentId);
  }

  openNodes() {
    return this.nodes.filter((node) => node.status === "open" || node.status === "active");
  }

  isOpenSelectable(node) {
    return node?.status === "open" || node?.status === "active";
  }

  closestOpenNode(startId, preferredIds = []) {
    for (const id of preferredIds) {
      const node = this.nodeById(id);

      if (this.isOpenSelectable(node)) {
        return node;
      }
    }

    const visited = new Set();
    const queue = [startId];

    while (queue.length) {
      const id = queue.shift();

      if (visited.has(id)) {
        continue;
      }

      visited.add(id);

      const node = this.nodeById(id);

      if (!node) {
        continue;
      }

      if (this.isOpenSelectable(node)) {
        return node;
      }

      queue.push(...(node.children ?? []));

      if (node.parentId !== null) {
        queue.push(node.parentId);
      }
    }

    return null;
  }

  isDone() {
    return this.nodes.every((node) => node.status === "fathomed" || node.status === "branched");
  }

  hasIntegerObjective() {
    return isIntegerValue(this.problem.objective.x) && isIntegerValue(this.problem.objective.y);
  }

  relaxationBoundValue(relaxation) {
    if (!relaxation?.feasible) {
      return -Infinity;
    }

    return this.hasIntegerObjective() ? Math.floor(relaxation.value + EPS) : relaxation.value;
  }

  isPrunableByBound(relaxation) {
    return Boolean(this.incumbent)
      && relaxation?.feasible
      && this.relaxationBoundValue(relaxation) <= this.incumbent.value + EPS;
  }

  boundReason(relaxation) {
    const bound = this.relaxationBoundValue(relaxation);
    return this.hasIntegerObjective()
      ? `bound floor(${fmt(relaxation.value)}) = ${fmt(bound)} <= ${fmt(this.incumbent.value)}`
      : `bound ${fmt(bound)} <= ${fmt(this.incumbent.value)}`;
  }

  pruneSolvedNodesByIncumbent(exceptId = null) {
    if (!this.incumbent) {
      return;
    }

    for (const node of this.nodes) {
      if (
        node.id !== exceptId
        && (node.status === "open" || node.status === "active")
        && this.isPrunableByBound(node.relaxation)
      ) {
        node.status = "fathomed";
        node.reason = "bound";
      }
    }
  }

  selectNode(id) {
    const node = this.nodeById(Number(id));

    if (!node || (node.status !== "open" && node.status !== "active")) {
      return;
    }

    this.currentId = node.id;
    this.message = node.relaxation ? "choose a branch dimension" : `solve region ${node.name}`;
    this.render();
  }

  computeCurrent() {
    const node = this.currentNode();

    if (!node || node.status === "fathomed" || node.status === "branched") {
      return;
    }

    const relaxation = solveRelaxation(this.allConstraints(node), this.problem);
    node.relaxation = relaxation;
    this.displayedRelaxationNodeId = relaxation.feasible ? node.id : null;

    if (!relaxation.feasible) {
      node.status = "fathomed";
      node.reason = "infeasible";
      this.currentId = null;
      this.message = `region ${node.name} fathomed: infeasible`;
      this.afterFathom();
      this.render();
      return;
    }

    if (this.isPrunableByBound(relaxation)) {
      node.status = "fathomed";
      node.reason = "bound";
      this.currentId = null;
      this.message = `region ${node.name} fathomed: ${this.boundReason(relaxation)}`;
      this.afterFathom();
      this.render();
      return;
    }

    if (isIntegerPoint(relaxation.point)) {
      const integerPoint = {
        x: Math.round(relaxation.point.x),
        y: Math.round(relaxation.point.y),
        value: relaxation.value,
        nodeId: node.id
      };

      if (!this.incumbent || integerPoint.value > this.incumbent.value + EPS) {
        this.incumbent = integerPoint;
        this.pruneSolvedNodesByIncumbent(node.id);
      }

      node.status = "fathomed";
      node.reason = "integer";
      this.currentId = null;
      this.message = `region ${node.name} fathomed: integer solution`;
      this.afterFathom();
      this.render();
      return;
    }

    node.status = "active";
    this.message = `branch from (${fmt(relaxation.point.x)}, ${fmt(relaxation.point.y)})`;
    this.render();
  }

  afterFathom() {
    if (this.isDone()) {
      this.message = this.incumbent
        ? `done: best integer point (${fmt(this.incumbent.x, 0)}, ${fmt(this.incumbent.y, 0)})`
        : "done: no feasible integer point";
      return;
    }

    const next = this.openNodes()[0];
    this.currentId = next ? next.id : null;
  }

  selectAfterBranch(parentId, childIds) {
    const next = this.closestOpenNode(parentId, childIds);
    this.currentId = next ? next.id : null;

    if (this.isDone()) {
      this.message = this.incumbent
        ? `done: best integer point (${fmt(this.incumbent.x, 0)}, ${fmt(this.incumbent.y, 0)})`
        : "done: no feasible integer point";
    } else if (next) {
      this.message = next.relaxation ? "choose a branch dimension" : `solve region ${next.name}`;
    } else {
      this.message = "choose an open region";
    }
  }

  branch(dim) {
    const node = this.currentNode();

    if (!node || !node.relaxation?.feasible || node.status !== "active") {
      return;
    }

    const value = node.relaxation.point[dim];
    const low = Math.floor(value);
    const high = Math.ceil(value);

    if (closeEnough(low, high)) {
      return;
    }

    const leftId = this.nextId;
    const rightId = this.nextId + 1;
    this.nextId += 2;
    const leftName = regionLabel(leftId);
    const rightName = regionLabel(rightId);
    const leftConstraint = branchConstraint(dim, "le", low);
    const rightConstraint = branchConstraint(dim, "ge", high);

    node.status = "branched";
    node.children = [leftId, rightId];
    node.branch = { dim, low, high };

    const makeChild = (id, name, constraint, sense, bound) => {
      const constraints = node.constraints.concat(constraint);
      const feasible = solveRelaxation(this.problem.constraints.concat(constraints), this.problem).feasible;

      return {
        id,
        name,
        parentId: node.id,
        depth: node.depth + 1,
        constraints,
        status: feasible ? "open" : "fathomed",
        relaxation: feasible ? null : { feasible: false, point: null, value: -Infinity },
        reason: feasible ? null : "infeasible",
        branchLabel: branchInequalityLabel(dim, sense, bound)
      };
    };

    this.nodes.push(makeChild(leftId, leftName, leftConstraint, "le", low));
    this.nodes.push(makeChild(rightId, rightName, rightConstraint, "ge", high));

    this.lastBranch = {
      parentId: node.id,
      dim,
      low,
      high,
      childIds: [leftId, rightId]
    };
    this.selectAfterBranch(node.id, [leftId, rightId]);
    this.render();
  }

  fractionalDims() {
    const node = this.currentNode();

    if (!node?.relaxation?.feasible) {
      return [];
    }

    return ["x", "y"].filter((dim) => !isIntegerValue(node.relaxation.point[dim]));
  }

  xScale(x) {
    const range = this.problem.range;
    return 70 + ((x - range.minX) / (range.maxX - range.minX)) * 520;
  }

  yScale(y) {
    const range = this.problem.range;
    return 564 - ((y - range.minY) / (range.maxY - range.minY)) * 500;
  }

  svgPoint(point) {
    return `${fmt(this.xScale(point.x), 3)},${fmt(this.yScale(point.y), 3)}`;
  }

  polygonPath(polygon) {
    return polygon.map((point) => this.svgPoint(point)).join(" ");
  }

  polygonArea(polygon) {
    if (polygon.length < 3) {
      return 0;
    }

    const doubledArea = polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);

    return Math.abs(doubledArea) / 2;
  }

  degenerateRegionHitTarget(polygon, nodeId, clickable) {
    if (!clickable || this.polygonArea(polygon) > 1e-6) {
      return "";
    }

    const points = uniquePoints(polygon);

    if (!points.length) {
      return "";
    }

    if (points.length === 1) {
      return `<circle class="region-hit-target" cx="${this.xScale(points[0].x)}" cy="${this.yScale(points[0].y)}" r="14" data-node-id="${nodeId}" />`;
    }

    let endpoints = [points[0], points[1]];
    let maxDistance = -Infinity;

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);

        if (distance > maxDistance) {
          endpoints = [points[i], points[j]];
          maxDistance = distance;
        }
      }
    }

    return `
      <line class="region-hit-target" x1="${this.xScale(endpoints[0].x)}" y1="${this.yScale(endpoints[0].y)}" x2="${this.xScale(endpoints[1].x)}" y2="${this.yScale(endpoints[1].y)}" data-node-id="${nodeId}" />
    `;
  }

  centroid(polygon) {
    if (!polygon.length) {
      return null;
    }

    return polygon.reduce((sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length
    }), { x: 0, y: 0 });
  }

  svgCoords(point) {
    return {
      x: this.xScale(point.x),
      y: this.yScale(point.y)
    };
  }

  svgPolygon(polygon) {
    return polygon.map((point) => this.svgCoords(point));
  }

  svgBounds(points) {
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y)
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    });
  }

  pointInRect(point, rect) {
    return point.x >= rect.x
      && point.x <= rect.x + rect.width
      && point.y >= rect.y
      && point.y <= rect.y + rect.height;
  }

  pointInPolygon(point, polygon) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y))
        && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  orientation(a, b, c) {
    return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  }

  segmentsIntersect(a, b, c, d) {
    const o1 = this.orientation(a, b, c);
    const o2 = this.orientation(a, b, d);
    const o3 = this.orientation(c, d, a);
    const o4 = this.orientation(c, d, b);

    return o1 * o2 < 0 && o3 * o4 < 0;
  }

  rectEdges(rect) {
    const topLeft = { x: rect.x, y: rect.y };
    const topRight = { x: rect.x + rect.width, y: rect.y };
    const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
    const bottomLeft = { x: rect.x, y: rect.y + rect.height };

    return [
      [topLeft, topRight],
      [topRight, bottomRight],
      [bottomRight, bottomLeft],
      [bottomLeft, topLeft]
    ];
  }

  segmentIntersectsRect(segment, rect) {
    const a = { x: segment.x1, y: segment.y1 };
    const b = { x: segment.x2, y: segment.y2 };

    return this.pointInRect(a, rect)
      || this.pointInRect(b, rect)
      || this.rectEdges(rect).some(([c, d]) => this.segmentsIntersect(a, b, c, d));
  }

  rectIntersectsPolygon(rect, polygon) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height }
    ];

    return polygon.some((point) => this.pointInRect(point, rect))
      || corners.some((point) => this.pointInPolygon(point, polygon))
      || polygon.some((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return this.rectEdges(rect).some(([a, b]) => this.segmentsIntersect(point, next, a, b));
      });
  }

  distancePointToSegment(point, segment) {
    const ax = segment.x1;
    const ay = segment.y1;
    const bx = segment.x2;
    const by = segment.y2;
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy;
    const t = denom <= EPS ? 0 : clamp(((point.x - ax) * dx + (point.y - ay) * dy) / denom, 0, 1);
    const x = ax + t * dx;
    const y = ay + t * dy;

    return Math.hypot(point.x - x, point.y - y);
  }

  labelRect(x, y, width, height, anchor = "middle") {
    const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;

    return {
      x: left,
      y: y - height + 4,
      width,
      height
    };
  }

  rectsOverlap(a, b) {
    return !(a.x + a.width < b.x
      || b.x + b.width < a.x
      || a.y + a.height < b.y
      || b.y + b.height < a.y);
  }

  lineAvoidanceScore(rect, lineSegments) {
    const center = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    };

    return lineSegments.reduce((score, segment) => {
      if (this.segmentIntersectsRect(segment, rect)) {
        return score + 1500;
      }

      const distance = this.distancePointToSegment(center, segment);
      return score + Math.max(0, 24 - distance) * 12;
    }, 0);
  }

  placeTextLabel(point, label, options = {}) {
    const lineSegments = options.lineSegments ?? this.plottedLineSegments();
    const avoidRects = options.avoidRects ?? [];
    const labelWidth = options.width ?? Math.max(54, label.length * 7.1);
    const labelHeight = options.height ?? 18;
    const origin = this.svgCoords(point);
    const candidates = [
      { x: origin.x, y: origin.y - 18, anchor: "middle" },
      { x: origin.x + 20, y: origin.y - 12, anchor: "start" },
      { x: origin.x - 20, y: origin.y - 12, anchor: "end" },
      { x: origin.x, y: origin.y + 30, anchor: "middle" },
      { x: origin.x + 20, y: origin.y + 26, anchor: "start" },
      { x: origin.x - 20, y: origin.y + 26, anchor: "end" },
      { x: origin.x + 22, y: origin.y - 30, anchor: "start" },
      { x: origin.x - 22, y: origin.y - 30, anchor: "end" }
    ];

    let best = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const rect = this.labelRect(candidate.x, candidate.y, labelWidth, labelHeight, candidate.anchor);
      let score = this.lineAvoidanceScore(rect, lineSegments);

      if (rect.x < 50 || rect.x + rect.width > 690 || rect.y < 14 || rect.y + rect.height > 604) {
        score += 10000;
      }

      for (const avoidRect of avoidRects) {
        if (this.rectsOverlap(rect, avoidRect)) {
          score += 2500;
        }
      }

      if (score < bestScore) {
        best = { ...candidate, rect };
        bestScore = score;
      }
    }

    return best;
  }

  axisLineSegments() {
    const range = this.problem.range;

    return [
      {
        x1: this.xScale(range.minX),
        y1: this.yScale(range.minY),
        x2: this.xScale(range.maxX),
        y2: this.yScale(range.minY)
      },
      {
        x1: this.xScale(range.minX),
        y1: this.yScale(range.minY),
        x2: this.xScale(range.minX),
        y2: this.yScale(range.maxY)
      }
    ];
  }

  placeFinalTextLabel(point, label, options = {}) {
    const lineSegments = this.axisLineSegments().concat(this.baseLineSegments());
    const avoidRects = options.avoidRects ?? [];
    const labelWidth = options.width ?? Math.max(72, label.length * 7.1);
    const labelHeight = options.height ?? 20;
    const origin = this.svgCoords(point);
    const candidates = [
      { x: origin.x, y: origin.y - 22, anchor: "middle" },
      { x: origin.x + 20, y: origin.y - 20, anchor: "start" },
      { x: origin.x - 20, y: origin.y - 20, anchor: "end" },
      { x: origin.x, y: origin.y + 34, anchor: "middle" },
      { x: origin.x + 22, y: origin.y + 7, anchor: "start" },
      { x: origin.x - 22, y: origin.y + 7, anchor: "end" },
      { x: origin.x + 22, y: origin.y - 34, anchor: "start" },
      { x: origin.x - 22, y: origin.y - 34, anchor: "end" }
    ];

    let best = null;
    let bestScore = Infinity;

    for (const [index, candidate] of candidates.entries()) {
      const rect = this.labelRect(candidate.x, candidate.y, labelWidth, labelHeight, candidate.anchor);
      let score = index * 100;

      if (rect.x < 50 || rect.x + rect.width > 690 || rect.y < 14 || rect.y + rect.height > 604) {
        score += 10000;
      }

      if (lineSegments.some((segment) => this.segmentIntersectsRect(segment, rect))) {
        score += 8000;
      }

      if (avoidRects.some((avoidRect) => this.rectsOverlap(rect, avoidRect))) {
        score += 2500;
      }

      if (score < bestScore) {
        best = { ...candidate, rect };
        bestScore = score;
      }
    }

    return best;
  }

  lineForConstraint(constraint) {
    const points = [];
    const candidates = [];
    const range = this.problem.range;

    if (Math.abs(constraint.b) > EPS) {
      candidates.push({ x: range.minX, y: (constraint.r - constraint.a * range.minX) / constraint.b });
      candidates.push({ x: range.maxX, y: (constraint.r - constraint.a * range.maxX) / constraint.b });
    }

    if (Math.abs(constraint.a) > EPS) {
      candidates.push({ x: (constraint.r - constraint.b * range.minY) / constraint.a, y: range.minY });
      candidates.push({ x: (constraint.r - constraint.b * range.maxY) / constraint.a, y: range.maxY });
    }

    for (const point of candidates) {
      if (
        point.x >= range.minX - EPS
        && point.x <= range.maxX + EPS
        && point.y >= range.minY - EPS
        && point.y <= range.maxY + EPS
        && !points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)
      ) {
        points.push(point);
      }
    }

    return points.slice(0, 2);
  }

  segmentForAxisLine(polygon, dim, value) {
    const points = [];
    const coordinate = (point) => point[dim];

    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const currentOffset = coordinate(current) - value;
      const nextOffset = coordinate(next) - value;

      if (Math.abs(currentOffset) <= EPS) {
        points.push(current);
      }

      if (Math.abs(nextOffset) <= EPS) {
        points.push(next);
      }

      if (currentOffset * nextOffset < -EPS) {
        const t = (value - coordinate(current)) / (coordinate(next) - coordinate(current));
        points.push({
          x: current.x + t * (next.x - current.x),
          y: current.y + t * (next.y - current.y)
        });
      }
    }

    const unique = uniquePoints(points);

    if (unique.length < 2) {
      return null;
    }

    unique.sort((a, b) => dim === "x" ? a.y - b.y : a.x - b.x);

    return [unique[0], unique[unique.length - 1]];
  }

  renderAxes() {
    const range = this.problem.range;
    const xTicks = Array.from({ length: Math.floor(range.maxX - range.minX) + 1 }, (_, index) => range.minX + index);
    const yTicks = Array.from({ length: Math.floor(range.maxY - range.minY) + 1 }, (_, index) => range.minY + index);

    return `
      <g class="grid">
        ${xTicks.map((x) => `
          <line x1="${this.xScale(x)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(x)}" y2="${this.yScale(range.maxY)}" />
          <text x="${this.xScale(x)}" y="${this.yScale(range.minY) + 24}" text-anchor="middle">${x}</text>
        `).join("")}
        ${yTicks.map((y) => `
          <line x1="${this.xScale(range.minX)}" y1="${this.yScale(y)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(y)}" />
          <text x="${this.xScale(range.minX) - 18}" y="${this.yScale(y) + 5}" text-anchor="end">${y}</text>
        `).join("")}
      </g>
      <line class="axis" x1="${this.xScale(range.minX)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(range.minY)}" />
      <line class="axis" x1="${this.xScale(range.minX)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(range.minX)}" y2="${this.yScale(range.maxY)}" />
      <line class="plot-boundary" x1="${this.xScale(range.minX)}" y1="${this.yScale(range.maxY)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(range.maxY)}" />
      <line class="plot-boundary" x1="${this.xScale(range.maxX)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(range.maxY)}" />
      <text class="axis-label" x="${this.xScale(range.maxX) + 18}" y="${this.yScale(range.minY) + 5}">x₁</text>
      <text class="axis-label" x="${this.xScale(range.minX) - 4}" y="${this.yScale(range.maxY) - 18}">x₂</text>
    `;
  }

  objectiveScreenNormal() {
    const range = this.problem.range;
    const xPixelsPerUnit = (SVG_PLOT.right - SVG_PLOT.left) / (range.maxX - range.minX);
    const yPixelsPerUnit = (SVG_PLOT.bottom - SVG_PLOT.top) / (range.maxY - range.minY);
    const x = this.problem.objective.x / xPixelsPerUnit;
    const y = -this.problem.objective.y / yPixelsPerUnit;
    const length = Math.hypot(x, y);

    if (length <= EPS) {
      return null;
    }

    return {
      x: x / length,
      y: y / length
    };
  }

  objectiveScreenSegment(offset, normal) {
    const points = [];
    const addPoint = (point) => {
      if (
        point.x >= SVG_PLOT.left - EPS
        && point.x <= SVG_PLOT.right + EPS
        && point.y >= SVG_PLOT.top - EPS
        && point.y <= SVG_PLOT.bottom + EPS
        && !points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)
      ) {
        points.push(point);
      }
    };

    if (Math.abs(normal.y) > EPS) {
      addPoint({ x: SVG_PLOT.left, y: (offset - normal.x * SVG_PLOT.left) / normal.y });
      addPoint({ x: SVG_PLOT.right, y: (offset - normal.x * SVG_PLOT.right) / normal.y });
    }

    if (Math.abs(normal.x) > EPS) {
      addPoint({ x: (offset - normal.y * SVG_PLOT.top) / normal.x, y: SVG_PLOT.top });
      addPoint({ x: (offset - normal.y * SVG_PLOT.bottom) / normal.x, y: SVG_PLOT.bottom });
    }

    return points.slice(0, 2);
  }

  renderObjectiveOverlay() {
    const normal = this.objectiveScreenNormal();

    if (!normal) {
      return "";
    }

    const corners = [
      { x: SVG_PLOT.left, y: SVG_PLOT.top },
      { x: SVG_PLOT.right, y: SVG_PLOT.top },
      { x: SVG_PLOT.right, y: SVG_PLOT.bottom },
      { x: SVG_PLOT.left, y: SVG_PLOT.bottom }
    ].map((point) => normal.x * point.x + normal.y * point.y);
    const minOffset = Math.min(...corners);
    const maxOffset = Math.max(...corners);
    const spacing = 34;
    const firstOffset = Math.ceil(minOffset / spacing) * spacing;
    const offsets = [];

    for (let offset = firstOffset; offset <= maxOffset + EPS; offset += spacing) {
      offsets.push(offset);
    }

    const segments = offsets
      .map((offset) => this.objectiveScreenSegment(offset, normal))
      .filter((segment) => segment.length >= 2);

    return `
      <g class="objective-overlay">
        ${segments.map((segment) => `
          <line class="objective-line" x1="${segment[0].x}" y1="${segment[0].y}" x2="${segment[1].x}" y2="${segment[1].y}" />
        `).join("")}
      </g>
    `;
  }

  baseLineSegments() {
    return this.problem.constraints.flatMap((constraint) => {
      const line = this.lineForConstraint(constraint);

      if (line.length < 2) {
        return [];
      }

      return [{
        x1: this.xScale(line[0].x),
        y1: this.yScale(line[0].y),
        x2: this.xScale(line[1].x),
        y2: this.yScale(line[1].y)
      }];
    });
  }

  branchLineSegments() {
    return this.nodes
      .filter((node) => node.branch)
      .flatMap((node) => {
        const polygon = polygonForConstraints(this.allConstraints(node), this.problem.range);
        const branch = node.branch;

        return [branch.low, branch.high].flatMap((value) => {
          const segment = this.segmentForAxisLine(polygon, branch.dim, value);

          if (!segment) {
            return [];
          }

          return [{
            x1: this.xScale(segment[0].x),
            y1: this.yScale(segment[0].y),
            x2: this.xScale(segment[1].x),
            y2: this.yScale(segment[1].y)
          }];
        });
      });
  }

  plottedLineSegments() {
    return this.baseLineSegments().concat(this.branchLineSegments());
  }

  renderBaseConstraints() {
    return this.baseLineSegments().map((segment, index) => `
      <line class="base-line base-line-${index}" x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" />
    `).join("");
  }

  renderBranchLines() {
    return this.branchLineSegments().map((segment) => `
      <line class="branch-line" x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" />
    `).join("");
  }

  renderGap() {
    return this.nodes
      .filter((node) => node.branch)
      .map((node) => {
        const branch = node.branch;
        const gapConstraints = this.allConstraints(node).concat(
          branchConstraint(branch.dim, "ge", branch.low),
          branchConstraint(branch.dim, "le", branch.high)
        );
        const gap = polygonForConstraints(gapConstraints, this.problem.range);

        if (!gap.length) {
          return "";
        }

        return `<polygon class="gap-region" points="${this.polygonPath(gap)}" />`;
      }).join("");
  }

  renderRegions() {
    return this.nodes.map((node) => {
      if (node.status === "branched") {
        return "";
      }

      const polygon = polygonForConstraints(this.allConstraints(node), this.problem.range);

      if (!polygon.length) {
        return "";
      }

      const isCurrent = node.id === this.currentId;
      const classes = [
        "region",
        node.status === "fathomed" ? "region-fathomed" : "region-open",
        isCurrent ? "region-current" : ""
      ].filter(Boolean).join(" ");
      const clickable = node.status === "open" || node.status === "active";

      return `
        <polygon class="${classes}" points="${this.polygonPath(polygon)}" focusable="false" ${clickable ? `data-node-id="${node.id}"` : ""} />
        ${this.degenerateRegionHitTarget(polygon, node.id, clickable)}
      `;
    }).join("");
  }

  renderIntegerPoints() {
    const basePoints = integerPoints(this.problem.constraints, this.problem);
    const current = this.currentNode();
    const currentConstraints = current ? this.allConstraints(current) : null;

    return basePoints.map((point) => {
      const inCurrent = currentConstraints ? satisfies(point, currentConstraints) : false;
      const isIncumbent = this.incumbent && point.x === this.incumbent.x && point.y === this.incumbent.y;
      const cls = isIncumbent ? "integer-point incumbent" : inCurrent ? "integer-point in-current" : "integer-point";
      const radius = isIncumbent ? 7 : inCurrent ? 5 : 3.5;

      return `<circle class="${cls}" cx="${this.xScale(point.x)}" cy="${this.yScale(point.y)}" r="${radius}" />`;
    }).join("");
  }

  relaxationLabel(node) {
    const relaxation = node.relaxation;

    if (!relaxation?.feasible || node.status === "branched") {
      return null;
    }

    const point = relaxation.point;
    const label = `(${fmt(point.x)}, ${fmt(point.y)}): ${fmt(relaxation.value)}`;

    return {
      point,
      label,
      placement: this.placeTextLabel(point, label)
    };
  }

  visibleRelaxationLabelRects() {
    const node = this.nodeById(this.displayedRelaxationNodeId);
    const rect = node ? this.relaxationLabel(node)?.placement?.rect : null;

    return rect ? [rect] : [];
  }

  renderRelaxationPoints() {
    const node = this.nodeById(this.displayedRelaxationNodeId);
    const relaxation = node?.relaxation;

    if (!relaxation?.feasible) {
      return "";
    }

    const point = relaxation.point;
    const isCurrent = node.id === this.currentId;
    const labelInfo = this.relaxationLabel(node);

    return `
      <g class="relaxation-point ${isCurrent ? "relaxation-current" : ""}">
        <circle cx="${this.xScale(point.x)}" cy="${this.yScale(point.y)}" r="${isCurrent ? 8 : 6}" />
        ${labelInfo ? `<text x="${labelInfo.placement.x}" y="${labelInfo.placement.y}" text-anchor="${labelInfo.placement.anchor}">${labelInfo.label}</text>` : ""}
      </g>
    `;
  }

  graphActions() {
    const node = this.currentNode();

    if (!node || node.status === "fathomed" || node.status === "branched") {
      return [];
    }

    if (!node.relaxation) {
      return [{ action: "compute", label: "Solve LP", width: 88 }];
    }

    if (node.status !== "active") {
      return [];
    }

    return this.fractionalDims().map((dim) => ({
      action: "branch",
      dim,
      label: `Branch ${branchVariableLabel(dim)}`,
      width: 92
    }));
  }

  renderGraphActionButton(button, x, y) {
    return `
      <g class="graph-action" transform="translate(${fmt(x, 3)} ${fmt(y, 3)})" data-graph-action="${button.action}" ${button.dim ? `data-graph-dim="${button.dim}"` : ""} focusable="false">
        <rect width="${button.width}" height="30" rx="6" />
        <text x="${button.width / 2}" y="20" text-anchor="middle">${button.label}</text>
      </g>
    `;
  }

  renderGraphActions() {
    const actions = this.graphActions();

    if (!actions.length) {
      return "";
    }

    const maxWidth = 92;
    const x = SVG_PLOT.right - maxWidth - 38;
    const y = SVG_PLOT.top + 34;

    return `
      <g class="graph-actions">
        ${actions.map((action, index) => this.renderGraphActionButton(action, x, y + index * 38)).join("")}
      </g>
    `;
  }

  renderFinalMarker() {
    if (!this.isDone() || !this.incumbent) {
      return "";
    }

    const x = this.xScale(this.incumbent.x);
    const y = this.yScale(this.incumbent.y);
    const label = `OPT VAL = ${fmt(this.incumbent.value)}`;
    const placement = this.placeFinalTextLabel(this.incumbent, label, {
      width: Math.max(62, label.length * 7.1),
      avoidRects: this.visibleRelaxationLabelRects()
    });

    return `
      <g class="final-marker">
        <circle cx="${x}" cy="${y}" r="15" />
        <text x="${placement.x}" y="${placement.y}" text-anchor="${placement.anchor}">${label}</text>
      </g>
    `;
  }

  renderSvg() {
    return `
      <svg viewBox="0 0 700 620" role="img" aria-label="Branch and bound applet" focusable="false">
        <rect class="plot-background" x="0" y="0" width="700" height="620" />
        ${this.renderAxes()}
        ${this.renderObjectiveOverlay()}
        ${this.renderRegions()}
        ${this.renderGap()}
        ${this.renderBaseConstraints()}
        ${this.renderBranchLines()}
        ${this.renderIntegerPoints()}
        ${this.renderRelaxationPoints()}
        ${this.renderGraphActions()}
        ${this.renderFinalMarker()}
      </svg>
    `;
  }

  treeLayout() {
    const nodeWidth = 92;
    const nodeHeight = 48;
    const horizontalGap = 20;
    const leafGap = nodeWidth + horizontalGap;
    const margin = 42;
    const top = 38;
    const levelGap = 76;
    const maxDepth = Math.max(...this.nodes.map((node) => node.depth));
    const height = Math.max(146, top + maxDepth * levelGap + 52);
    const nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    const roots = this.nodes.filter((node) => node.parentId === null);
    const positions = new Map();
    let nextLeaf = 0;

    const placeNode = (node) => {
      const children = (node.children ?? [])
        .map((id) => nodeMap.get(id))
        .filter(Boolean);
      let x;

      if (children.length) {
        const childXs = children.map((child) => placeNode(child));
        x = (childXs[0] + childXs[childXs.length - 1]) / 2;
      } else {
        x = margin + nextLeaf * leafGap;
        nextLeaf += 1;
      }

      positions.set(node.id, {
        x,
        y: top + node.depth * levelGap
      });

      return x;
    };

    for (const root of roots) {
      placeNode(root);
    }

    const rootCenter = roots.length
      ? (positions.get(roots[0].id)?.x ?? margin)
      : margin;
    const leftmost = Math.min(
      margin,
      ...Array.from(positions.values()).map((position) => position.x - nodeWidth / 2)
    );
    const rightmost = Math.max(
      margin,
      ...Array.from(positions.values()).map((position) => position.x + nodeWidth / 2)
    );
    const rootRadius = Math.max(rootCenter - leftmost, rightmost - rootCenter) + margin;
    const width = rootRadius * 2;
    const rootShift = width / 2 - rootCenter;

    for (const position of positions.values()) {
      position.x += rootShift;
    }

    return { width, height, positions, nodeWidth, nodeHeight };
  }

  treeNodeSummary(node) {
    if (!node.relaxation) {
      return "unsolved";
    }

    if (!node.relaxation.feasible) {
      return "infeasible";
    }

    return `VAL = ${fmt(node.relaxation.value)}`;
  }

  treeNodeSolution(node) {
    if (!node.relaxation?.feasible) {
      return "";
    }

    const point = node.relaxation.point;
    return `(${fmt(point.x)}, ${fmt(point.y)})`;
  }

  renderNodeTree() {
    const layout = this.treeLayout();
    const edges = this.nodes
      .filter((node) => node.parentId !== null)
      .map((node) => {
        const parent = layout.positions.get(node.parentId);
        const child = layout.positions.get(node.id);

        if (!parent || !child) {
          return "";
        }

        const start = {
          x: parent.x,
          y: parent.y + layout.nodeHeight / 2
        };
        const end = {
          x: child.x,
          y: child.y - layout.nodeHeight / 2
        };
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const labelX = midX;
        const labelY = midY + 4;
        const labelParts = branchInequalityParts(node.branchLabel);
        const labelWidth = Math.max(46, node.branchLabel.length * 7.4 + 12);
        const labelHeight = 18;
        const labelMarkup = labelParts
          ? `<tspan font-style="italic">x</tspan><tspan baseline-shift="sub" font-size="7">${labelParts.subscript}</tspan><tspan> ${labelParts.relation} ${labelParts.value}</tspan>`
          : node.branchLabel;

        return `
          <g class="tree-edge">
            <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />
            <rect class="tree-edge-label-bg" x="${labelX - labelWidth / 2}" y="${labelY - 12.5}" width="${labelWidth}" height="${labelHeight}" rx="${labelHeight / 2}" />
            <text x="${labelX}" y="${labelY}" text-anchor="middle">${labelMarkup}</text>
          </g>
        `;
      }).join("");

    const nodes = this.nodes.map((node) => {
      const position = layout.positions.get(node.id);

      if (!position) {
        return "";
      }

      const isCurrent = node.id === this.currentId;
      const isDisplayedRelaxation = node.id === this.displayedRelaxationNodeId;
      const isIncumbent = this.incumbent?.nodeId === node.id;
      const clickable = node.status === "open" || node.status === "active";
      const solution = this.treeNodeSolution(node);
      const classes = [
        "tree-node",
        `tree-node-${node.status}`,
        isIncumbent ? "tree-node-incumbent" : "",
        isCurrent ? "tree-node-current" : "",
        isDisplayedRelaxation ? "tree-node-relaxation" : "",
        isDisplayedRelaxation && isCurrent ? "tree-node-relaxation-current" : "",
        clickable ? "tree-node-clickable" : ""
      ].filter(Boolean).join(" ");

      return `
        <g class="${classes}" transform="translate(${position.x} ${position.y})" ${clickable ? `data-tree-node-id="${node.id}"` : ""}>
          <rect x="${-layout.nodeWidth / 2}" y="${-layout.nodeHeight / 2}" width="${layout.nodeWidth}" height="${layout.nodeHeight}" rx="8" />
          <text class="tree-node-state" y="${solution ? -3 : 5}" text-anchor="middle">${this.treeNodeSummary(node)}</text>
          ${solution ? `<text class="tree-node-solution" y="14" text-anchor="middle"><tspan class="math-var">x</tspan><tspan baseline-shift="super" font-size="8">∗</tspan><tspan class="math-op"> = </tspan><tspan class="math-num">${solution}</tspan></text>` : ""}
        </g>
      `;
    }).join("");

    return `
      <div class="tree-panel">
        <div class="tree-heading">Branch and bound node tree</div>
        <div class="tree-scroll">
          <svg class="tree-svg" style="width: ${layout.width}px;" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Branch and bound node tree" focusable="false">
            ${edges}
            ${nodes}
          </svg>
        </div>
        ${this.renderTreeLegend()}
        ${this.renderProblemControls()}
      </div>
    `;
  }

  renderTreeLegend() {
    const items = [
      ["incumbent", "Incumbent"],
      ["open", "Unsolved"],
      ["branched", "Branched"],
      ["fathomed", "Fathomed"]
    ];

    return `
      <div class="tree-legend" aria-label="Node color legend">
        ${items.map(([key, label]) => `
          <span class="tree-legend-item">
            <span class="tree-legend-swatch tree-legend-${key}"></span>
            <span>${label}</span>
          </span>
        `).join("")}
      </div>
    `;
  }

  renderVariableTspans(subscript) {
    return `<tspan font-style="italic">x</tspan><tspan baseline-shift="sub" font-size="12">${subscript}</tspan>`;
  }

  renderLinearExpressionTspans(coefficients) {
    const terms = [
      { coefficient: coefficients.x, subscript: "1" },
      { coefficient: coefficients.y, subscript: "2" }
    ].filter((term) => Math.abs(term.coefficient) > EPS);

    if (!terms.length) {
      return "<tspan>0</tspan>";
    }

    return terms.map((term, index) => {
      const sign = term.coefficient < 0 ? "-" : "+";
      const magnitude = Math.abs(term.coefficient);
      const prefix = index === 0
        ? (sign === "-" ? "- " : "")
        : ` ${sign} `;
      const coefficient = closeEnough(magnitude, 1) ? "" : fmt(magnitude);

      return `<tspan>${prefix}${coefficient}</tspan>${this.renderVariableTspans(term.subscript)}`;
    }).join("");
  }

  renderProblemStatement() {
    const lineGap = 28;
    const constraintStartY = 84;
    const constraintLines = this.problem.constraints.map((constraint, index) => `
      <text class="problem-lp-line" x="118" y="${constraintStartY + lineGap * index}">
        ${this.renderLinearExpressionTspans({ x: constraint.a, y: constraint.b })}
        <tspan> &lt;= ${fmt(constraint.r)}</tspan>
      </text>
    `).join("");
    const nonnegativeY = constraintStartY + lineGap * this.problem.constraints.length;
    const height = nonnegativeY + 38;

    return `
      <div class="problem-statement" aria-label="Linear programming problem">
        <svg class="problem-lp-svg" viewBox="0 0 420 ${height}" role="img" focusable="false">
          <text class="problem-lp-objective" x="38" y="36">
            <tspan>max </tspan>${this.renderLinearExpressionTspans(this.problem.objective)}
          </text>
          <text class="problem-lp-subject" x="38" y="${constraintStartY}"><tspan font-style="italic">s.t.</tspan></text>
          ${constraintLines}
          <text class="problem-lp-line" x="118" y="${nonnegativeY}">
            ${this.renderVariableTspans("1")}<tspan>, </tspan>${this.renderVariableTspans("2")}<tspan> &gt;= 0</tspan>
          </text>
        </svg>
      </div>
    `;
  }

  renderNodeButtons() {
    const open = this.openNodes();

    if (!open.length) {
      return "";
    }

    return `
      <div class="node-buttons">
        ${open.map((node) => `
          <button type="button" class="${node.id === this.currentId ? "selected" : ""}" data-select-node="${node.id}">
            ${node.name}: ${node.branchLabel}
          </button>
        `).join("")}
      </div>
    `;
  }

  renderStatusRows() {
    return this.nodes.map((node) => {
      const bound = node.relaxation?.feasible ? fmt(node.relaxation.value) : node.relaxation ? "none" : "unsolved";
      const reason = node.status === "fathomed" ? node.reason : node.status;

      return `
        <tr class="${node.id === this.currentId ? "active-row" : ""}">
          <td>${node.name}</td>
          <td>${node.branchLabel}</td>
          <td>${bound}</td>
          <td>${reason}</td>
        </tr>
      `;
    }).join("");
  }

  renderProblemControls() {
    const showingCustomProblem = this.selectedProblemId === CUSTOM_ID;
    const editingCustom = this.editingCustomProblem;

    return `
      <div class="problem-panel ${editingCustom ? "problem-panel-custom" : ""}">
        <select class="example-select" data-control="problem" aria-label="Choose branch and bound demo">
          ${PRESETS.map((problem) => `
            <option value="${problem.id}" ${this.selectedProblemId === problem.id ? "selected" : ""}>${problem.name}</option>
          `).join("")}
          ${showingCustomProblem && !editingCustom ? `<option value="${APPLIED_CUSTOM_ID}" selected>Custom problem</option>` : ""}
          <option value="${CUSTOM_ID}" ${editingCustom ? "selected" : ""}>Custom</option>
        </select>

        ${editingCustom ? `
          <div class="custom-problem-editor">
            <textarea class="custom-problem-text" rows="7" data-custom-problem>${escapeHtml(this.customDraft)}</textarea>
            <div class="custom-actions">
              <button type="button" data-action="apply-custom">Apply custom</button>
              ${this.customError ? `<span class="custom-error">${this.customError}</span>` : ""}
            </div>
          </div>
        ` : this.renderProblemStatement()}
      </div>
    `;
  }

  renderControls() {
    return `
      <div class="controls">
        ${this.renderProblemControls()}
      </div>
    `;
  }

  render() {
    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="demo">
        <div class="visuals">
          <div class="plot-column">
            <div class="canvas">${this.renderSvg()}</div>
            <button class="plot-reset-button" type="button" data-action="reset-demo" aria-label="Reset demo" title="Reset">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
          ${this.renderNodeTree()}
        </div>
      </div>
    `;

    this.shadowRoot.querySelector('[data-control="problem"]')?.addEventListener("change", (event) => {
      this.selectProblem(event.target.value);
    });
    this.shadowRoot.querySelector("[data-custom-problem]")?.addEventListener("input", (event) => {
      this.updateCustomDraft(event.target.value);
    });
    this.shadowRoot.querySelector('[data-action="apply-custom"]')?.addEventListener("click", () => {
      this.applyCustomProblem();
    });
    this.shadowRoot.querySelector('[data-action="reset-demo"]')?.addEventListener("click", () => {
      this.reset();
      this.render();
    });
    this.shadowRoot.querySelectorAll("[data-tree-node-id]").forEach((treeNode) => {
      treeNode.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.selectNode(treeNode.dataset.treeNodeId);
      });
      treeNode.addEventListener("click", () => this.selectNode(treeNode.dataset.treeNodeId));
    });
    this.shadowRoot.querySelectorAll("[data-graph-action]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.graphAction === "compute") {
          this.computeCurrent();
        } else if (button.dataset.graphAction === "branch") {
          this.branch(button.dataset.graphDim);
        }
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    this.shadowRoot.querySelectorAll("[data-node-id]").forEach((region) => {
      region.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.selectNode(region.dataset.nodeId);
      });
      region.addEventListener("click", () => this.selectNode(region.dataset.nodeId));
    });
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          height: 100vh;
          color: #1f2933;
          font-family: inherit;
        }

        .demo {
          display: grid;
          grid-template-columns: 1fr;
          height: 100vh;
          overflow: hidden;
          background: #ffffff;
        }

        .visuals {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(24rem, 42vw);
          min-height: 0;
          min-width: 0;
        }

        .plot-column {
          display: grid;
          grid-template-rows: minmax(0, 1fr);
          position: relative;
          min-width: 0;
          min-height: 0;
          border-right: 1px solid #dce4ea;
        }

        .plot-reset-button {
          position: absolute;
          top: 0.85rem;
          right: 0.85rem;
          z-index: 3;
          display: grid;
          place-items: center;
          width: 2rem;
          height: 2rem;
          padding: 0;
          border: 1px solid #c0cbd3;
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.96);
          color: #44525e;
          box-shadow: 0 4px 10px rgba(31, 41, 51, 0.13);
        }

        .plot-reset-button svg {
          width: 1.18rem;
          height: 1.18rem;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .plot-reset-button:hover,
        .plot-reset-button:focus-visible {
          border-color: #0c6fa6;
          color: #075780;
          background: #ffffff;
        }

        .canvas {
          min-width: 0;
          min-height: 0;
          background: #ffffff;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          user-select: none;
        }

        .canvas > svg {
          display: block;
          width: 100%;
          height: 100%;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }

        .canvas svg * {
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .canvas svg text {
          fill: #26323c;
          font-size: 14px;
          pointer-events: none;
        }

        .plot-background {
          fill: #ffffff;
        }

        .grid line {
          display: none;
        }

        .grid text,
        .axis-label {
          fill: #53616d;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 13px;
        }

        .axis-label {
          font-style: italic;
        }

        .axis {
          stroke: #53616d;
          stroke-width: 2;
        }

        .plot-boundary {
          stroke: #d6dee5;
          stroke-width: 1;
        }

        .objective-line {
          stroke: #9aa6af;
          stroke-width: 1.5;
          stroke-linecap: round;
          opacity: 0.28;
        }

        .base-line {
          stroke: #284b63;
          stroke-width: 3;
          stroke-linecap: round;
        }

        .branch-line {
          stroke: #6bbbe8;
          stroke-width: 3;
          stroke-linecap: round;
        }

        .region {
          stroke: #1f6fa8;
          stroke-width: 2;
          cursor: pointer;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .region:focus,
        .region:focus-visible,
        .region:active {
          outline: none;
        }

        .region-open {
          fill: #cfeeff;
          fill-opacity: 0.42;
        }

        .region-current {
          fill: #8fd3ff;
          fill-opacity: 0.64;
          stroke: #005f99;
          stroke-width: 3;
        }

        .region-fathomed {
          fill: #d3d7dc;
          fill-opacity: 0.78;
          stroke: #87919a;
          cursor: default;
        }

        .region-hit-target {
          fill: transparent;
          stroke: transparent;
          stroke-width: 18;
          cursor: pointer;
          pointer-events: all;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .gap-region {
          fill: #ffffff;
          fill-opacity: 0.76;
          stroke: #a9b4bd;
          stroke-width: 1;
          stroke-dasharray: 4 4;
          pointer-events: none;
        }

        .integer-point {
          fill: #39434d;
          opacity: 0.42;
        }

        .integer-point.in-current {
          fill: #111827;
          opacity: 0.88;
        }

        .integer-point.incumbent {
          fill: #168a4a;
          stroke: #ffffff;
          stroke-width: 2;
          opacity: 1;
        }

        .relaxation-point circle {
          fill: #e07a2f;
          stroke: #ffffff;
          stroke-width: 2;
        }

        .canvas svg .relaxation-point text {
          fill: #e07a2f;
          font-weight: 800;
          paint-order: stroke;
          stroke: #ffffff;
          stroke-linejoin: round;
          stroke-width: 4px;
        }

        .relaxation-current circle {
          fill: #f15f34;
        }

        .canvas svg .relaxation-current text {
          fill: #f15f34;
        }

        .graph-action {
          cursor: pointer;
          filter: drop-shadow(0 3px 7px rgba(31, 41, 51, 0.18));
          outline: none;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }

        .graph-action rect {
          fill: #ffffff;
          stroke: #0c6fa6;
          stroke-width: 1.5;
        }

        .graph-action text {
          fill: #075780;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 12px;
          font-weight: 800;
          pointer-events: none;
        }

        .graph-action:active rect {
          fill: #eaf7ff;
        }

        .final-marker circle {
          fill: none;
          stroke: #168a4a;
          stroke-width: 4;
        }

        .final-marker path {
          fill: none;
          stroke: #168a4a;
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .canvas svg .final-marker text {
          fill: #168a4a;
          font-weight: 800;
          font-size: 16px;
          paint-order: stroke;
          stroke: #ffffff;
          stroke-linejoin: round;
          stroke-width: 4px;
        }

        .tree-panel {
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: #fbfdfe;
          padding: 0.8rem 0.9rem 1rem;
          overflow: hidden;
        }

        .tree-heading {
          color: #596773;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          margin-bottom: 0.45rem;
          text-transform: uppercase;
        }

        .tree-scroll {
          flex: 1 1 auto;
          overflow-x: auto;
          padding-bottom: 0.2rem;
          text-align: center;
        }

        .tree-svg {
          display: block;
          max-width: none;
          height: auto;
          margin-inline: auto;
          min-height: 12rem;
        }

        .tree-svg * {
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .tree-svg text {
          pointer-events: none;
        }

        .tree-edge line {
          stroke: #9aabb8;
          stroke-width: 2;
        }

        .tree-edge-label-bg {
          fill: #fbfdfe;
          stroke: #9aabb8;
          stroke-width: 1.25;
        }

        .tree-edge text {
          fill: #657480;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 11px;
          font-weight: 800;
        }

        .tree-node rect {
          fill: #ffffff;
          stroke: #738392;
          stroke-width: 2;
        }

        .tree-node-open rect,
        .tree-node-active rect {
          fill: #dff4ff;
          stroke: #1f6fa8;
        }

        .tree-node-branched rect {
          fill: #f6f8fa;
          stroke: #8897a3;
        }

        .tree-node-fathomed rect {
          fill: #d8dde2;
          stroke: #87919a;
        }

        .tree-node-incumbent rect {
          fill: #dff4e8;
          stroke: #168a4a;
        }

        .tree-node-current rect {
          fill: #8fd3ff;
          stroke: #005f99;
          stroke-width: 3;
        }

        .tree-node-relaxation rect {
          stroke: #e07a2f;
          stroke-width: 2;
        }

        .tree-node-relaxation-current rect {
          stroke: #f15f34;
        }

        .tree-node-clickable {
          cursor: pointer;
        }

        .tree-node-state {
          fill: #596773;
          font-size: 11px;
          font-weight: 800;
        }

        .tree-node-solution {
          fill: #596773;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 10px;
          font-weight: 800;
        }

        .tree-node-solution .math-var {
          font-style: italic;
        }

        .tree-node-solution .math-op,
        .tree-node-solution .math-num {
          font-style: normal;
        }

        .tree-legend {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.75rem;
          border-top: 1px solid #dce4ea;
          margin-top: auto;
          padding-top: 0.65rem;
          padding-bottom: 0.6rem;
          color: #596773;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .tree-legend-item {
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          white-space: nowrap;
        }

        .tree-legend-swatch {
          display: inline-block;
          width: 18px;
          height: 12px;
          border: 2px solid #738392;
          border-radius: 4px;
          background: #ffffff;
        }

        .tree-legend-open {
          background: #dff4ff;
          border-color: #1f6fa8;
        }

        .tree-legend-current {
          background: #8fd3ff;
          border-color: #005f99;
        }

        .tree-legend-branched {
          background: #f6f8fa;
          border-color: #8897a3;
        }

        .tree-legend-fathomed {
          background: #d8dde2;
          border-color: #87919a;
        }

        .tree-legend-incumbent {
          background: #dff4e8;
          border-color: #168a4a;
        }

        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.55rem 0.75rem;
          background: #ffffff;
          border-top: 1px solid #dce4ea;
        }

        .problem-panel {
          display: grid;
          gap: 0.45rem;
          width: 100%;
          max-width: none;
          border-top: 1px solid #dce4ea;
          padding-top: 0.65rem;
        }

        .problem-panel-custom {
          align-items: stretch;
        }

        .field {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          min-width: min(24rem, 92vw);
        }

        .field span {
          color: #596773;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .example-select {
          width: 100%;
        }

        select,
        input,
        textarea {
          width: 100%;
          border: 1px solid #b9c4cd;
          border-radius: 6px;
          background: #ffffff;
          color: #1f2933;
          font: inherit;
          font-size: 0.82rem;
          padding: 0.48rem 0.55rem;
        }

        textarea {
          resize: vertical;
          min-height: 5.6rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          line-height: 1.35;
        }

        .custom-problem-text {
          min-height: 7.4rem;
          max-height: 11rem;
        }

        .custom-problem-editor {
          display: grid;
          gap: 0.5rem;
        }

        .problem-statement {
          border: 1px solid #dce4ea;
          border-radius: 7px;
          background: #ffffff;
          padding: 0.35rem 0.45rem;
        }

        .problem-lp-svg {
          display: block;
          width: min(100%, 22rem);
          height: auto;
          margin-inline: auto;
        }

        .problem-lp-svg text {
          fill: #314252;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 16px;
          font-weight: 700;
        }

        .problem-lp-objective {
          font-size: 18px;
        }

        .problem-lp-subject {
          fill: #5f6e7a;
        }

        .problem-lp-line {
          font-size: 16px;
        }

        .custom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.55rem;
        }

        .custom-grid .field:first-child {
          grid-column: 1 / -1;
        }

        .custom-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .custom-error {
          color: #a13d28;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .topline {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .topline > div {
          display: grid;
          gap: 0.15rem;
          min-width: 0;
        }

        .eyebrow {
          color: #596773;
          font-size: 0.76rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .topline strong {
          font-size: 1rem;
          line-height: 1.25;
        }

        .action-row,
        .node-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        button {
          appearance: none;
          border: 1px solid #aebbc5;
          border-radius: 6px;
          background: #ffffff;
          color: #1f2933;
          cursor: pointer;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 800;
          line-height: 1;
          padding: 0.58rem 0.68rem;
          white-space: nowrap;
        }

        button:hover,
        button:focus-visible,
        button.selected {
          border-color: #0c6fa6;
          color: #075780;
          background: #eaf7ff;
        }

        button:focus-visible {
          outline: 2px solid #78c6ef;
          outline-offset: 2px;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .math-var-label {
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-style: italic;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border: 1px solid #dce4ea;
          background: #ffffff;
          border-radius: 8px;
          overflow: hidden;
        }

        .metrics div {
          display: grid;
          gap: 0.1rem;
          padding: 0.62rem 0.72rem;
          border-right: 1px solid #edf1f4;
        }

        .metrics div:last-child {
          border-right: 0;
        }

        .metrics span {
          color: #596773;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .metrics strong {
          font-size: 0.93rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.76rem;
          background: #ffffff;
          border: 1px solid #dce4ea;
          border-radius: 8px;
          overflow: hidden;
          display: table;
          margin: 0;
          padding: 0;
          max-height: none;
        }

        thead,
        tbody,
        tr {
          display: table-row-group;
          width: auto;
        }

        tr {
          display: table-row;
        }

        th,
        td {
          padding: 0.42rem 0.35rem;
          border-bottom: 1px solid #edf1f4;
          text-align: left;
          vertical-align: top;
        }

        th {
          color: #596773;
          font-size: 0.68rem;
          text-transform: uppercase;
        }

        .active-row td {
          background: #eaf7ff;
          font-weight: 800;
        }

        @media (max-width: 820px) {
          .demo {
            overflow: auto;
          }

          .visuals {
            grid-template-columns: 1fr;
          }

          .canvas {
            border-right: 0;
            border-bottom: 1px solid #dce4ea;
          }

          .plot-column {
            border-right: 0;
          }

          .tree-panel {
            border-bottom: 0;
          }

          .tree-svg {
            min-height: 8rem;
          }

          .metrics {
            grid-template-columns: 1fr;
          }

          .metrics div {
            border-right: 0;
            border-bottom: 1px solid #edf1f4;
          }

          .metrics div:last-child {
            border-bottom: 0;
          }
        }
      </style>
    `;
  }
}

class CuttingPlanesDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.selectedProblemId = CUTTING_DEFAULT_ID;
    this.problem = cloneProblem(PRESETS.find((problem) => problem.id === CUTTING_DEFAULT_ID) ?? PRESETS[0]);
    this.customDraft = this.problemToDraft(this.problem);
    this.customError = "";
    this.reset();
  }

  connectedCallback() {
    this.render();
  }

  reset() {
    this.cuts = [];
    this.relaxation = null;
    this.done = false;
    this.message = "solve the LP relaxation";
    this.bestInteger = this.bestIntegerPoint();
  }

  problemToDraft(problem) {
    return {
      name: problem.name,
      objectiveX: String(problem.objective.x),
      objectiveY: String(problem.objective.y),
      maxX: String(problem.range.maxX),
      maxY: String(problem.range.maxY),
      constraints: problem.constraints.map((constraint) => `${constraint.a}, ${constraint.b}, ${constraint.r}`).join("\n")
    };
  }

  selectProblem(id) {
    this.selectedProblemId = id;
    this.customError = "";

    if (id === CUSTOM_ID) {
      const parsed = this.parseCustomProblem();

      if (parsed) {
        this.problem = parsed;
      }
    } else {
      const preset = PRESETS.find((problem) => problem.id === id) ?? PRESETS.find((problem) => problem.id === CUTTING_DEFAULT_ID) ?? PRESETS[0];
      this.problem = cloneProblem(preset);
      this.customDraft = this.problemToDraft(this.problem);
    }

    this.reset();
    this.render();
  }

  updateCustomField(field, value) {
    this.customDraft = {
      ...this.customDraft,
      [field]: value
    };
  }

  parseCustomProblem() {
    const objectiveX = Number(this.customDraft.objectiveX);
    const objectiveY = Number(this.customDraft.objectiveY);
    const maxX = Number(this.customDraft.maxX);
    const maxY = Number(this.customDraft.maxY);
    const lines = this.customDraft.constraints.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (![objectiveX, objectiveY, maxX, maxY].every(Number.isFinite)) {
      this.customError = "Objective and axis limits must be numeric.";
      return null;
    }

    if (maxX <= 0 || maxY <= 0) {
      this.customError = "Axis limits must be positive.";
      return null;
    }

    if (!lines.length) {
      this.customError = "Add at least one constraint.";
      return null;
    }

    const constraints = [];

    for (const [index, line] of lines.entries()) {
      const parts = line.split(/[,\s]+/).filter(Boolean).map(Number);

      if (parts.length !== 3 || !parts.every(Number.isFinite)) {
        this.customError = `Constraint ${index + 1} must be: a, b, r.`;
        return null;
      }

      const [a, b, r] = parts;
      constraints.push({
        a,
        b,
        r,
        label: `${fmt(a)}x + ${fmt(b)}y <= ${fmt(r)}`
      });
    }

    this.customError = "";
    return {
      id: CUSTOM_ID,
      name: this.customDraft.name?.trim() || "Custom problem",
      objective: { x: objectiveX, y: objectiveY },
      range: { minX: 0, maxX, minY: 0, maxY },
      constraints
    };
  }

  applyCustomProblem() {
    const parsed = this.parseCustomProblem();

    if (!parsed) {
      this.render();
      return;
    }

    this.selectedProblemId = CUSTOM_ID;
    this.problem = parsed;
    this.reset();
    this.render();
  }

  allConstraints() {
    return this.problem.constraints.concat(this.cuts);
  }

  feasibleIntegerPoints() {
    return integerPoints(this.problem.constraints, this.problem);
  }

  bestIntegerPoint() {
    const points = this.feasibleIntegerPoints();

    return points.reduce((best, point) => {
      if (!best || point.value > best.value + EPS) {
        return point;
      }

      return best;
    }, null);
  }

  computeRelaxation() {
    this.relaxation = solveRelaxation(this.allConstraints(), this.problem);

    if (!this.relaxation.feasible) {
      this.done = true;
      this.message = "LP region is empty";
      this.render();
      return;
    }

    if (isIntegerPoint(this.relaxation.point)) {
      this.done = true;
      this.message = "LP optimum is integer";
      this.render();
      return;
    }

    this.done = false;
    this.message = `fractional LP optimum (${fmt(this.relaxation.point.x)}, ${fmt(this.relaxation.point.y)})`;
    this.render();
  }

  addCut() {
    if (!this.relaxation?.feasible || isIntegerPoint(this.relaxation.point)) {
      return;
    }

    const cut = separatingIntegerHullCut(
      this.relaxation.point,
      this.feasibleIntegerPoints(),
      this.allConstraints()
    );

    if (!cut) {
      this.done = true;
      this.message = "no separating cut found";
      this.render();
      return;
    }

    const nextIndex = this.cuts.length + 1;
    this.cuts.push({
      ...cut,
      name: `C${nextIndex}`,
      label: `${inequalityLabel(cut)}`
    });
    this.relaxation = null;
    this.done = false;
    this.message = `added ${`C${nextIndex}`}: ${inequalityLabel(cut)}`;
    this.render();
  }

  xScale(x) {
    const range = this.problem.range;
    return SVG_PLOT.left + ((x - range.minX) / (range.maxX - range.minX)) * (SVG_PLOT.right - SVG_PLOT.left);
  }

  yScale(y) {
    const range = this.problem.range;
    return SVG_PLOT.bottom - ((y - range.minY) / (range.maxY - range.minY)) * (SVG_PLOT.bottom - SVG_PLOT.top);
  }

  svgPoint(point) {
    return `${fmt(this.xScale(point.x), 3)},${fmt(this.yScale(point.y), 3)}`;
  }

  polygonPath(polygon) {
    return polygon.map((point) => this.svgPoint(point)).join(" ");
  }

  lineForConstraint(constraint) {
    const points = [];
    const candidates = [];
    const range = this.problem.range;

    if (Math.abs(constraint.b) > EPS) {
      candidates.push({ x: range.minX, y: (constraint.r - constraint.a * range.minX) / constraint.b });
      candidates.push({ x: range.maxX, y: (constraint.r - constraint.a * range.maxX) / constraint.b });
    }

    if (Math.abs(constraint.a) > EPS) {
      candidates.push({ x: (constraint.r - constraint.b * range.minY) / constraint.a, y: range.minY });
      candidates.push({ x: (constraint.r - constraint.b * range.maxY) / constraint.a, y: range.maxY });
    }

    for (const point of candidates) {
      if (
        point.x >= range.minX - EPS
        && point.x <= range.maxX + EPS
        && point.y >= range.minY - EPS
        && point.y <= range.maxY + EPS
        && !points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6)
      ) {
        points.push(point);
      }
    }

    return points.slice(0, 2);
  }

  lineSegments(constraints) {
    return constraints.flatMap((constraint) => {
      const line = this.lineForConstraint(constraint);

      if (line.length < 2) {
        return [];
      }

      return [{
        constraint,
        x1: this.xScale(line[0].x),
        y1: this.yScale(line[0].y),
        x2: this.xScale(line[1].x),
        y2: this.yScale(line[1].y)
      }];
    });
  }

  renderAxes() {
    const range = this.problem.range;
    const xTicks = Array.from({ length: Math.floor(range.maxX - range.minX) + 1 }, (_, index) => range.minX + index);
    const yTicks = Array.from({ length: Math.floor(range.maxY - range.minY) + 1 }, (_, index) => range.minY + index);

    return `
      <g class="grid">
        ${xTicks.map((x) => `
          <line x1="${this.xScale(x)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(x)}" y2="${this.yScale(range.maxY)}" />
          <text x="${this.xScale(x)}" y="${this.yScale(range.minY) + 24}" text-anchor="middle">${x}</text>
        `).join("")}
        ${yTicks.map((y) => `
          <line x1="${this.xScale(range.minX)}" y1="${this.yScale(y)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(y)}" />
          <text x="${this.xScale(range.minX) - 18}" y="${this.yScale(y) + 5}" text-anchor="end">${y}</text>
        `).join("")}
      </g>
      <line class="axis" x1="${this.xScale(range.minX)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(range.maxX)}" y2="${this.yScale(range.minY)}" />
      <line class="axis" x1="${this.xScale(range.minX)}" y1="${this.yScale(range.minY)}" x2="${this.xScale(range.minX)}" y2="${this.yScale(range.maxY)}" />
      <text class="axis-label" x="${this.xScale(range.maxX) + 18}" y="${this.yScale(range.minY) + 5}">x₁</text>
      <text class="axis-label" x="${this.xScale(range.minX) - 4}" y="${this.yScale(range.maxY) - 18}">x₂</text>
    `;
  }

  renderRegion() {
    const polygon = polygonForConstraints(this.allConstraints(), this.problem.range);

    if (!polygon.length) {
      return "";
    }

    return `<polygon class="cut-region ${this.done ? "cut-region-done" : ""}" points="${this.polygonPath(polygon)}" />`;
  }

  renderBaseConstraints() {
    return this.lineSegments(this.problem.constraints).map((segment, index) => `
      <line class="base-line base-line-${index}" x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" />
    `).join("");
  }

  renderCuts() {
    return this.lineSegments(this.cuts).map((segment) => `
      <g class="cut-line">
        <line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" />
      </g>
    `).join("");
  }

  renderIntegerPoints() {
    const showBest = this.done && this.bestInteger;

    return this.feasibleIntegerPoints().map((point) => {
      const isBest = showBest && point.x === this.bestInteger.x && point.y === this.bestInteger.y;
      const cls = isBest ? "integer-point incumbent" : "integer-point";
      const radius = isBest ? 7 : 4;

      return `<circle class="${cls}" cx="${this.xScale(point.x)}" cy="${this.yScale(point.y)}" r="${radius}" />`;
    }).join("");
  }

  renderRelaxationPoint() {
    if (!this.relaxation?.feasible) {
      return "";
    }

    const point = this.relaxation.point;
    const label = `(${fmt(point.x)}, ${fmt(point.y)}): ${fmt(this.relaxation.value)}`;
    const x = this.xScale(point.x);
    const y = this.yScale(point.y);
    const labelX = clamp(x + 24, SVG_PLOT.left + 70, SVG_PLOT.right - 8);
    const labelY = clamp(y - 16, SVG_PLOT.top + 18, SVG_PLOT.bottom - 14);

    return `
      <g class="relaxation-point relaxation-current">
        <circle cx="${x}" cy="${y}" r="8" />
        <text x="${labelX}" y="${labelY}" text-anchor="start">${label}</text>
      </g>
    `;
  }

  renderFinalMarker() {
    if (!this.done || !this.bestInteger) {
      return "";
    }

    const x = this.xScale(this.bestInteger.x);
    const y = this.yScale(this.bestInteger.y);
    const label = `best z=${fmt(this.bestInteger.value)}`;

    return `
      <g class="final-marker">
        <circle cx="${x}" cy="${y}" r="15" />
        <text x="${clamp(x + 22, SVG_PLOT.left + 60, SVG_PLOT.right - 8)}" y="${clamp(y + 30, SVG_PLOT.top + 18, SVG_PLOT.bottom - 10)}" text-anchor="start">${label}</text>
      </g>
    `;
  }

  graphActions() {
    if (this.done) {
      return [];
    }

    if (!this.relaxation) {
      return [{ action: "compute", label: "Solve LP", width: 88 }];
    }

    if (this.relaxation.feasible && !isIntegerPoint(this.relaxation.point)) {
      return [{ action: "cut", label: "Add cut", width: 88 }];
    }

    return [];
  }

  renderGraphActionButton(button, x, y) {
    return `
      <g class="graph-action" transform="translate(${fmt(x, 3)} ${fmt(y, 3)})" data-graph-action="${button.action}" focusable="false">
        <rect width="${button.width}" height="30" rx="6" />
        <text x="${button.width / 2}" y="20" text-anchor="middle">${button.label}</text>
      </g>
    `;
  }

  renderGraphActions() {
    const actions = this.graphActions();

    if (!actions.length) {
      return "";
    }

    const x = SVG_PLOT.right - 130;
    const y = SVG_PLOT.top + 48;

    return `
      <g class="graph-actions">
        ${actions.map((action, index) => this.renderGraphActionButton(action, x, y + index * 38)).join("")}
      </g>
    `;
  }

  renderSvg() {
    return `
      <svg viewBox="0 0 700 620" role="img" aria-label="Cutting planes applet" focusable="false">
        <rect class="plot-background" x="0" y="0" width="700" height="620" />
        ${this.renderAxes()}
        ${this.renderRegion()}
        ${this.renderBaseConstraints()}
        ${this.renderCuts()}
        ${this.renderIntegerPoints()}
        ${this.renderRelaxationPoint()}
        ${this.renderFinalMarker()}
        ${this.renderGraphActions()}
      </svg>
    `;
  }

  renderCutsTable() {
    if (!this.cuts.length) {
      return `<div class="empty-cuts">No cuts yet</div>`;
    }

    return `
      <table>
        <thead>
          <tr><th>Cut</th><th>Valid inequality</th></tr>
        </thead>
        <tbody>
          ${this.cuts.map((cut) => `
            <tr>
              <td>${cut.name}</td>
              <td>${inequalityLabel(cut)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  renderProblemControls() {
    const isCustom = this.selectedProblemId === CUSTOM_ID;

    return `
      <div class="problem-panel">
        <label class="field">
          <span>Problem</span>
          <select data-control="problem">
            ${PRESETS.map((problem) => `
              <option value="${problem.id}" ${this.selectedProblemId === problem.id ? "selected" : ""}>${problem.name}</option>
            `).join("")}
            <option value="${CUSTOM_ID}" ${isCustom ? "selected" : ""}>Custom</option>
          </select>
        </label>

        ${isCustom ? `
          <div class="custom-grid">
            <label class="field">
              <span>Name</span>
              <input type="text" value="${escapeHtml(this.customDraft.name)}" data-custom-field="name">
            </label>
            <label class="field">
              <span>x coeff</span>
              <input type="number" step="0.1" value="${escapeHtml(this.customDraft.objectiveX)}" data-custom-field="objectiveX">
            </label>
            <label class="field">
              <span>y coeff</span>
              <input type="number" step="0.1" value="${escapeHtml(this.customDraft.objectiveY)}" data-custom-field="objectiveY">
            </label>
            <label class="field">
              <span>max x</span>
              <input type="number" min="1" step="1" value="${escapeHtml(this.customDraft.maxX)}" data-custom-field="maxX">
            </label>
            <label class="field">
              <span>max y</span>
              <input type="number" min="1" step="1" value="${escapeHtml(this.customDraft.maxY)}" data-custom-field="maxY">
            </label>
          </div>
          <label class="field">
            <span>Constraints: a, b, r means ax + by <= r</span>
            <textarea rows="4" data-custom-field="constraints">${escapeHtml(this.customDraft.constraints)}</textarea>
          </label>
          <div class="custom-actions">
            <button type="button" data-action="apply-custom">Apply custom</button>
            ${this.customError ? `<span class="custom-error">${this.customError}</span>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  renderControls() {
    const objectiveLabel = `max z = ${fmt(this.problem.objective.x)}x + ${fmt(this.problem.objective.y)}y`;
    const lpText = this.relaxation?.feasible
      ? `(${fmt(this.relaxation.point.x)}, ${fmt(this.relaxation.point.y)}) z=${fmt(this.relaxation.value)}`
      : "unsolved";
    const bestText = this.bestInteger
      ? `(${fmt(this.bestInteger.x, 0)}, ${fmt(this.bestInteger.y, 0)}) z=${fmt(this.bestInteger.value)}`
      : "none";

    return `
      <div class="controls">
        ${this.renderProblemControls()}

        <div class="topline">
          <div>
            <span class="eyebrow">${objectiveLabel}</span>
            <strong>${this.message}</strong>
          </div>
          <button type="button" data-action="reset">Reset</button>
        </div>

        <div class="action-row">
          <button type="button" data-action="compute" ${!this.done && !this.relaxation ? "" : "disabled"}>Solve relaxation</button>
          <button type="button" data-action="cut" ${!this.done && this.relaxation?.feasible && !isIntegerPoint(this.relaxation.point) ? "" : "disabled"}>Add cutting plane</button>
        </div>

        <div class="metrics">
          <div><span>LP relaxation</span><strong>${lpText}</strong></div>
          <div><span>Best lattice point</span><strong>${this.done ? bestText : "hidden until done"}</strong></div>
          <div><span>Cuts added</span><strong>${this.cuts.length}</strong></div>
        </div>

        ${this.renderCutsTable()}
      </div>
    `;
  }

  render() {
    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="demo">
        <div class="canvas">${this.renderSvg()}</div>
        ${this.renderControls()}
      </div>
    `;

    this.shadowRoot.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      this.reset();
      this.render();
    });
    this.shadowRoot.querySelector('[data-action="compute"]')?.addEventListener("click", () => this.computeRelaxation());
    this.shadowRoot.querySelector('[data-action="cut"]')?.addEventListener("click", () => this.addCut());
    this.shadowRoot.querySelector('[data-control="problem"]')?.addEventListener("change", (event) => {
      this.selectProblem(event.target.value);
    });
    this.shadowRoot.querySelector('[data-action="apply-custom"]')?.addEventListener("click", () => this.applyCustomProblem());
    this.shadowRoot.querySelectorAll("[data-custom-field]").forEach((input) => {
      input.addEventListener("input", (event) => {
        this.updateCustomField(event.target.dataset.customField, event.target.value);
      });
    });
    this.shadowRoot.querySelectorAll("[data-graph-action]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.graphAction === "compute") {
          this.computeRelaxation();
        } else if (button.dataset.graphAction === "cut") {
          this.addCut();
        }
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          color: #1f2933;
          font-family: inherit;
        }

        .demo {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
          border: 1px solid #cfd7de;
          border-radius: 8px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 12px 30px rgba(31, 41, 51, 0.08);
        }

        .canvas {
          min-width: 0;
          background: #ffffff;
          border-right: 1px solid #dce4ea;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          user-select: none;
        }

        svg {
          display: block;
          width: 100%;
          height: auto;
          min-height: 34rem;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }

        svg * {
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        svg text {
          fill: #26323c;
          font-size: 14px;
          pointer-events: none;
        }

        .plot-background {
          fill: #ffffff;
        }

        .grid line {
          stroke: #dceaf5;
          stroke-width: 1;
        }

        .grid text,
        .axis-label {
          fill: #53616d;
          font-family: Cambria Math, STIX Two Math, STIXGeneral, Latin Modern Math, Times New Roman, serif;
          font-size: 13px;
        }

        .axis-label {
          font-style: italic;
        }

        .axis {
          stroke: #53616d;
          stroke-width: 2;
        }

        .cut-region {
          fill: #cfeeff;
          fill-opacity: 0.5;
          stroke: #1f6fa8;
          stroke-width: 2.5;
        }

        .cut-region-done {
          fill: #dcf4e7;
          stroke: #168a4a;
        }

        .base-line {
          stroke: #284b63;
          stroke-width: 3;
          stroke-linecap: round;
        }

        .cut-line line {
          stroke: #c64632;
          stroke-width: 3;
          stroke-linecap: round;
        }

        .integer-point {
          fill: #39434d;
          opacity: 0.46;
        }

        .integer-point.incumbent {
          fill: #168a4a;
          stroke: #ffffff;
          stroke-width: 2;
          opacity: 1;
        }

        .relaxation-point circle {
          fill: #f15f34;
          stroke: #ffffff;
          stroke-width: 2;
        }

        .relaxation-point text,
        .final-marker text {
          font-weight: 800;
          paint-order: stroke;
          stroke: #ffffff;
          stroke-linejoin: round;
          stroke-width: 4px;
        }

        .relaxation-point text {
          fill: #8d3f0b;
        }

        .final-marker circle {
          fill: none;
          stroke: #168a4a;
          stroke-width: 4;
        }

        .final-marker text {
          fill: #126b3c;
          font-size: 16px;
        }

        .graph-action {
          cursor: pointer;
          filter: drop-shadow(0 3px 7px rgba(31, 41, 51, 0.18));
          outline: none;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }

        .graph-action rect {
          fill: #ffffff;
          stroke: #0c6fa6;
          stroke-width: 1.5;
        }

        .graph-action text {
          fill: #075780;
          font-size: 12px;
          font-weight: 800;
          pointer-events: none;
        }

        .graph-action:active rect {
          fill: #eaf7ff;
        }

        .controls {
          display: grid;
          align-content: start;
          gap: 0.85rem;
          padding: 1rem;
          background: #f8fafb;
        }

        .problem-panel {
          display: grid;
          gap: 0.65rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid #dce4ea;
        }

        .field {
          display: grid;
          gap: 0.28rem;
          min-width: 0;
        }

        .field span {
          color: #596773;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        select,
        input,
        textarea {
          width: 100%;
          border: 1px solid #b9c4cd;
          border-radius: 6px;
          background: #ffffff;
          color: #1f2933;
          font: inherit;
          font-size: 0.82rem;
          padding: 0.48rem 0.55rem;
        }

        textarea {
          resize: vertical;
          min-height: 5.8rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          line-height: 1.35;
        }

        .custom-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.55rem;
        }

        .custom-grid .field:first-child {
          grid-column: 1 / -1;
        }

        .custom-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .custom-error {
          color: #a13d28;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .topline {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .topline > div {
          display: grid;
          gap: 0.15rem;
          min-width: 0;
        }

        .eyebrow {
          color: #596773;
          font-size: 0.76rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .topline strong {
          font-size: 1rem;
          line-height: 1.25;
        }

        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        button {
          appearance: none;
          border: 1px solid #aebbc5;
          border-radius: 6px;
          background: #ffffff;
          color: #1f2933;
          cursor: pointer;
          font: inherit;
          font-size: 0.78rem;
          font-weight: 800;
          line-height: 1;
          padding: 0.58rem 0.68rem;
          white-space: nowrap;
        }

        button:hover,
        button:focus-visible {
          border-color: #0c6fa6;
          color: #075780;
          background: #eaf7ff;
        }

        button:focus-visible {
          outline: 2px solid #78c6ef;
          outline-offset: 2px;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .metrics {
          display: grid;
          grid-template-columns: 1fr;
          border: 1px solid #dce4ea;
          background: #ffffff;
          border-radius: 8px;
          overflow: hidden;
        }

        .metrics div {
          display: grid;
          gap: 0.1rem;
          padding: 0.62rem 0.72rem;
          border-bottom: 1px solid #edf1f4;
        }

        .metrics div:last-child {
          border-bottom: 0;
        }

        .metrics span {
          color: #596773;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .metrics strong {
          font-size: 0.93rem;
        }

        .empty-cuts {
          border: 1px solid #dce4ea;
          border-radius: 8px;
          background: #ffffff;
          color: #596773;
          font-size: 0.78rem;
          font-weight: 800;
          padding: 0.75rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.76rem;
          background: #ffffff;
          border: 1px solid #dce4ea;
          border-radius: 8px;
          overflow: hidden;
          display: table;
          margin: 0;
          padding: 0;
        }

        thead,
        tbody,
        tr {
          display: table-row-group;
          width: auto;
        }

        tr {
          display: table-row;
        }

        th,
        td {
          padding: 0.42rem 0.35rem;
          border-bottom: 1px solid #edf1f4;
          text-align: left;
          vertical-align: top;
        }

        th {
          color: #596773;
          font-size: 0.68rem;
          text-transform: uppercase;
        }

        @media (max-width: 820px) {
          .demo {
            grid-template-columns: 1fr;
          }

          .canvas {
            border-right: 0;
            border-bottom: 1px solid #dce4ea;
          }

          svg {
            min-height: 22rem;
          }
        }
      </style>
    `;
  }
}

customElements.define("branch-and-bound-demo", BranchAndBoundDemo);
customElements.define("cutting-planes-demo", CuttingPlanesDemo);
