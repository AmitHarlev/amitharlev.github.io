const DEFAULT_VIEWBOX_WIDTH = 720;
const NODE_RADIUS = 28;
const PATH_EDGE_GAP = 33;

const edgeKey = (leftId, rightId) => `${leftId}--${rightId}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeNode(node) {
  return typeof node === "string" ? { id: node, label: node } : node;
}

function normalizeEdge(edge) {
  if (Array.isArray(edge)) {
    return { from: edge[0], to: edge[1], color: edge[2] };
  }

  return { ...edge, color: edge.color || edge.stroke };
}

function normalizePair(pair) {
  if (Array.isArray(pair)) {
    return { from: pair[0], to: pair[1] };
  }

  return pair;
}

function shortenedSegment(from, to, gap = PATH_EDGE_GAP) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return { from, to };
  }

  const unitX = dx / length;
  const unitY = dy / length;

  return {
    from: {
      x: from.x + unitX * gap,
      y: from.y + unitY * gap
    },
    to: {
      x: to.x - unitX * gap,
      y: to.y - unitY * gap
    }
  };
}

class BipartiteDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = null;
    this.currentViewId = null;
    this.showAugmented = false;
  }

  connectedCallback() {
    this.renderLoading();
    this.loadConfig();
  }

  async loadConfig() {
    const configUrl = this.getAttribute("config");

    if (!configUrl) {
      this.renderError("Missing config attribute.");
      return;
    }

    try {
      const response = await fetch(configUrl, { credentials: "same-origin" });

      if (!response.ok) {
        throw new Error(`Could not load ${configUrl}: ${response.status}`);
      }

      this.config = await response.json();
      const initialView = this.getAttribute("view") || this.config.defaultView;
      this.currentViewId = initialView || this.views[0]?.id || null;
      this.render();
    } catch (error) {
      this.renderError(error.message);
    }
  }

  get views() {
    return this.config?.views || [];
  }

  get currentView() {
    return this.views.find((view) => view.id === this.currentViewId) || this.views[0] || {};
  }

  get hasSideLabels() {
    return this.hasAttribute("show-side-labels") || this.config?.showSideLabels === true;
  }

  renderLoading() {
    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="bipartite-demo">
        <div class="status">Loading graph...</div>
      </div>
    `;
  }

  renderError(message) {
    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="bipartite-demo">
        <div class="status error">${escapeHtml(message)}</div>
      </div>
    `;
  }

  render() {
    if (!this.config) {
      this.renderLoading();
      return;
    }

    this.shadowRoot.innerHTML = `
      ${this.styles()}
      <div class="bipartite-demo">
        ${this.renderSvg()}
      </div>
    `;
  }

  graphData() {
    const left = (this.config.left || []).map(normalizeNode);
    const right = (this.config.right || []).map(normalizeNode);
    const edges = (this.config.edges || []).map(normalizeEdge);
    const sides = new Map();
    const labels = new Map();

    left.forEach((node) => {
      sides.set(node.id, "left");
      labels.set(node.id, node.label || node.id);
    });

    right.forEach((node) => {
      sides.set(node.id, "right");
      labels.set(node.id, node.label || node.id);
    });

    return { left, right, edges, sides, labels };
  }

  positions(left, right) {
    const maxCount = Math.max(left.length, right.length, 2);
    const top = this.hasSideLabels ? 64 : 38;
    const bottom = 38;
    const height = Math.max(300, top + bottom + (maxCount - 1) * 78);
    const leftX = 145;
    const rightX = DEFAULT_VIEWBOX_WIDTH - 145;
    const nodePositions = new Map();

    const yFor = (index, count) => {
      if (count === 1) {
        return height / 2;
      }

      return top + index * ((height - top - bottom) / (count - 1));
    };

    left.forEach((node, index) => {
      nodePositions.set(node.id, { x: leftX, y: yFor(index, left.length) });
    });

    right.forEach((node, index) => {
      nodePositions.set(node.id, { x: rightX, y: yFor(index, right.length) });
    });

    return { height, nodePositions };
  }

  matchingSet(data) {
    const view = this.currentView;
    const pairs = this.showAugmented && view.afterMatching?.length
      ? view.afterMatching
      : view.matching || this.config.matching || [];

    return new Set(pairs.map((pair) => this.keyForPair(normalizePair(pair), data)).filter(Boolean));
  }

  matchedNodes() {
    const view = this.currentView;
    const pairs = this.showAugmented && view.afterMatching?.length
      ? view.afterMatching
      : view.matching || this.config.matching || [];
    const nodes = new Set();

    pairs.map(normalizePair).forEach((pair) => {
      if (pair.from) nodes.add(pair.from);
      if (pair.to) nodes.add(pair.to);
    });

    return nodes;
  }

  pathEdgeKeys(data) {
    const path = this.currentView.path || [];
    const keys = [];

    for (let index = 0; index < path.length - 1; index += 1) {
      const key = this.keyBetween(path[index], path[index + 1], data);
      if (key) {
        keys.push(key);
      }
    }

    return keys;
  }

  pathOrder() {
    const order = new Map();
    const path = this.currentView.path || [];

    path.forEach((nodeId, index) => {
      if (!order.has(nodeId)) {
        order.set(nodeId, index + 1);
      }
    });

    return order;
  }

  keyForPair(pair, data) {
    return this.keyBetween(pair.from, pair.to, data);
  }

  keyBetween(first, second, data) {
    const firstSide = data.sides.get(first);
    const secondSide = data.sides.get(second);

    if (firstSide === "left" && secondSide === "right") {
      return edgeKey(first, second);
    }

    if (firstSide === "right" && secondSide === "left") {
      return edgeKey(second, first);
    }

    return null;
  }

  renderSvg() {
    const data = this.graphData();
    const { left, right, edges, labels } = data;
    const { height, nodePositions } = this.positions(left, right);
    const matching = this.matchingSet(data);
    const matchedNodes = this.matchedNodes();
    const pathKeys = this.pathEdgeKeys(data);
    const pathSet = new Set(pathKeys);
    const pathOrder = this.pathOrder();
    const vertexCover = new Set(this.currentView.vertexCover || []);
    const highlightedNodes = new Set([...(this.currentView.highlightNodes || []), ...(this.currentView.path || [])]);
    const pathEndpoints = new Set(this.currentView.path?.length
      ? [this.currentView.path[0], this.currentView.path[this.currentView.path.length - 1]]
      : []);
    const sideLabelMarkup = this.hasSideLabels ? `
      <text class="side-label" x="145" y="24" text-anchor="middle">${escapeHtml(this.config.leftLabel || "Left")}</text>
      <text class="side-label" x="${DEFAULT_VIEWBOX_WIDTH - 145}" y="24" text-anchor="middle">${escapeHtml(this.config.rightLabel || "Right")}</text>
    ` : "";

    const edgeMarkup = edges.map((edge) => {
      const from = nodePositions.get(edge.from);
      const to = nodePositions.get(edge.to);
      const key = this.keyBetween(edge.from, edge.to, data);

      if (!from || !to || !key) {
        return "";
      }

      const classes = ["edge"];
      const style = edge.color ? ` style="--edge-color: ${escapeHtml(edge.color)};"` : "";

      if (matching.has(key)) classes.push("matching-edge");
      if (pathSet.has(key)) classes.push("under-path-edge");
      if (vertexCover.has(edge.from) || vertexCover.has(edge.to)) classes.push("covered-edge");

      return `
        <line
          class="${classes.join(" ")}"
          ${style}
          x1="${from.x}"
          y1="${from.y}"
          x2="${to.x}"
          y2="${to.y}"
          aria-label="${escapeHtml(labels.get(edge.from))} to ${escapeHtml(labels.get(edge.to))}"
        />
      `;
    }).join("");

    const pathMarkup = (this.currentView.path || []).slice(0, -1).map((nodeId, index) => {
      const nextNodeId = this.currentView.path[index + 1];
      const from = nodePositions.get(nodeId);
      const to = nodePositions.get(nextNodeId);
      const key = this.keyBetween(nodeId, nextNodeId, data);

      if (!from || !to || !key) {
        return "";
      }

      const segment = shortenedSegment(from, to);
      const classes = ["directed-path-edge", matching.has(key) ? "path-matched-edge" : "path-unmatched-edge"];
      const marker = matching.has(key) ? "path-arrow-matched" : "path-arrow-unmatched";
      const edge = edges.find((candidate) => this.keyBetween(candidate.from, candidate.to, data) === key);
      const style = edge?.color ? ` style="--edge-color: ${escapeHtml(edge.color)};"` : "";

      return `
        <line
          class="${classes.join(" ")}"
          ${style}
          x1="${segment.from.x}"
          y1="${segment.from.y}"
          x2="${segment.to.x}"
          y2="${segment.to.y}"
          marker-end="url(#${marker})"
          aria-label="Step ${index + 1}: ${escapeHtml(labels.get(nodeId))} to ${escapeHtml(labels.get(nextNodeId))}"
        />
      `;
    }).join("");

    const nodeMarkup = [...left, ...right].map((node) => {
      const position = nodePositions.get(node.id);
      const classes = ["node"];
      const label = pathOrder.has(node.id) ? pathOrder.get(node.id) : node.label || node.id;

      if (matchedNodes.has(node.id)) classes.push("matched-node");
      if (vertexCover.has(node.id)) classes.push("cover-node");
      if (highlightedNodes.has(node.id)) classes.push("path-node");
      if (pathEndpoints.has(node.id)) classes.push("path-end-node");

      return `
        <g class="${classes.join(" ")}" transform="translate(${position.x} ${position.y})">
          <circle r="${NODE_RADIUS}"></circle>
          <text text-anchor="middle" dominant-baseline="central">${escapeHtml(label)}</text>
        </g>
      `;
    }).join("");

    return `
      <svg
        class="graph"
        viewBox="0 0 ${DEFAULT_VIEWBOX_WIDTH} ${height}"
        role="img"
        aria-label="${escapeHtml(this.config.title || "Bipartite graph demo")}"
      >
        <defs>
          <marker id="path-arrow-unmatched" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" class="path-arrow-unmatched-fill"></path>
          </marker>
          <marker id="path-arrow-matched" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" class="path-arrow-matched-fill"></path>
          </marker>
        </defs>
        ${sideLabelMarkup}
        ${edgeMarkup}
        ${pathMarkup}
        ${nodeMarkup}
      </svg>
    `;
  }

  styles() {
    return `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .bipartite-demo {
          background: transparent;
          color: #243238;
          overflow: visible;
        }

        .graph {
          display: block;
          width: 100%;
          height: auto;
          min-height: 320px;
        }

        .side-label {
          fill: #607078;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0;
        }

        .edge {
          stroke: var(--edge-color, #b8c4ca);
          stroke-width: 4;
          stroke-linecap: round;
        }

        .covered-edge {
          stroke: var(--edge-color, #d75b5b);
        }

        .matching-edge {
          stroke: var(--edge-color, #1f77b4);
          stroke-width: 4;
        }

        .under-path-edge {
          stroke-opacity: 0;
        }

        .directed-path-edge {
          stroke-linecap: butt;
          stroke-dasharray: 13 10;
          fill: none;
        }

        .path-unmatched-edge {
          stroke: var(--edge-color, #4f5f67);
          stroke-width: 4;
        }

        .path-matched-edge {
          stroke: var(--edge-color, #1f77b4);
          stroke-width: 4;
        }

        .path-arrow-unmatched-fill {
          fill: #4f5f67;
        }

        .path-arrow-matched-fill {
          fill: #1f77b4;
        }

        .node circle {
          fill: #ffffff;
          stroke: #61727a;
          stroke-width: 3;
        }

        .node text {
          fill: #243238;
          font-size: 13px;
          font-weight: 700;
          pointer-events: none;
        }

        .matched-node circle {
          fill: #e7f2fb;
          stroke: #1f77b4;
        }

        .path-end-node circle {
          fill: #fff7e8;
        }

        .cover-node circle {
          fill: #fdeaea;
          stroke: #c62828;
        }

        .status {
          padding: 0.75rem 1rem 0.9rem;
          color: #3f5057;
          font-size: 0.92rem;
          line-height: 1.4;
          min-height: 3.4rem;
          background: #fbfcfd;
        }

        .error {
          color: #8a1f11;
        }

        @media (max-width: 640px) {
          .graph {
            min-height: 360px;
          }

          .node text {
            font-size: 12px;
          }

          .status {
            padding-inline: 0.75rem;
          }
        }
      </style>
    `;
  }
}

customElements.define("bipartite-demo", BipartiteDemo);
