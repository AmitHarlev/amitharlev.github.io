/**
 * Markov Chains Core Module
 * Shared functionality for building and displaying Markov chains
 */

class MarkovChains {
  constructor(svg, options = {}) {
    // Configuration
    this.GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    this.TOKEN_SPACING = 2.5;
    this.TOTAL_TOKENS = options.totalTokens || 200;
    this.COUPLED_TOTAL_TOKENS = 500; // number of black tokens in coupled mode and total mass baseline
    this.COUPLED_TOKEN_SPACING = 1.5; // tighter packing for coupled mode
    // Open Color palette: https://yeun.github.io/open-color/
    this.colorPalette = [
      { name:'Blue',   fill:'#339af0', stroke:'#1c7ed6' }, // blue-5, blue-7
      { name:'Green',  fill:'#51cf66', stroke:'#37b24d' }, // green-5, green-7
      { name:'Red',    fill:'#ff6b6b', stroke:'#f03e3e' }, // red-5, red-7
      { name:'Violet', fill:'#845ef7', stroke:'#7048e8' }, // violet-5, violet-7
      { name:'Yellow', fill:'#ffd43b', stroke:'#fab005' }, // yellow-4, yellow-6
      { name:'Pink',   fill:'#f06595', stroke:'#d6336c' }, // pink-5, pink-7
      { name:'Indigo', fill:'#5c7cfa', stroke:'#4263eb' }, // indigo-5, indigo-7
      { name:'Teal',   fill:'#20c997', stroke:'#0ca678' }, // teal-5, teal-7
      { name:'Orange', fill:'#ff922b', stroke:'#f76707' }, // orange-5, orange-7
      { name:'Gray',   fill:'#868e96', stroke:'#495057' }, // gray-6, gray-7
    ];

    // State
    this.states = [];
    this.edges = [];
    this.svg = svg;
    this.edgesLayer = svg.getElementById('edgesLayer');
    this.statesLayer = svg.getElementById('statesLayer');
    this.tokensLayer = svg.getElementById('tokensLayer');
    this.uiLayer = svg.getElementById('uiLayer');

    // Markov mode state
    this.markovMode = false;
    this.distributionMode = false;
    this.coupledMode = false;
    this.coupledSampleMode = false;
    this.coupledSampleSplitMode = false;
    this.tripleClusterMode = false;
    this.sampleProofMode = false;
    this.tokenStateId = null;
    this.greenTokenStateId = null;
    this.visits = {};
    this.tokens = [];
    this.blackTokens = [];
    this.orangeTokens = [];
    this.greenToken = null;
    this.greenClusterTokens = [];
    this.coupledTokens = new Set(); // Track which ORANGE tokens are coupled in coupled mode
    this.tokenCounts = {};
    this.blackMassCounts = {}; // Continuous mass tracking for coupled mode (like tokenCounts)
    this.orangeMassCounts = {};
    // Coupled-sample mode tokens
    this.sampleBlackToken = null; // large black
    this.sampleGreenToken = null; // large green
    this.sampleOrangeToken = null; // medium orange
    this.coupledSampleFollowsGreen = false;
    this.animatingTokens = false;
    this.stepDelay = 500;
    this.animationEpoch = 0; // invalidate in-flight animations on reset/mode changes

    // Sample-proof tracking
    this.proofTargetStateId = null;   // state id we are tracking arrivals into
    this.proofIncomingCounts = {};    // map: fromStateId -> arrivals count into target
    this.proofTotalArrivals = 0;

    // Editing state (for builder mode)
    this.addingEdge = false;
    this.selectedStates = [];
    this.draggedState = null;
    this.draggedControl = null;
    this.editingEdgeId = null;
    this.contextMenuState = null;
    this.editText = '';
    this.labelEditText = '';

    // Mode
    this.isViewerMode = options.viewerMode || false;

    // Callbacks
    this.onStateClick = options.onStateClick || null;
    this.onRender = options.onRender || null;
  }

  // ----- Color utilities -----
  lightenColor(hex, percent) {
    try {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
      if (!m) return hex;
      const to = (v) => Math.min(255, Math.round(v));
      const r = parseInt(m[1], 16);
      const g = parseInt(m[2], 16);
      const b = parseInt(m[3], 16);
      const p = Math.max(-100, Math.min(100, percent || 0)) / 100;
      // Lighten towards white (or darken if negative)
      const rr = to(r + (255 - r) * p);
      const gg = to(g + (255 - g) * p);
      const bb = to(b + (255 - b) * p);
      const h = (n) => n.toString(16).padStart(2, '0');
      return `#${h(rr)}${h(gg)}${h(bb)}`;
    } catch (_) {
      return hex;
    }
  }

  // Compute layout for per-state Markov stats label (percent + caption)
  // Position can be configured per state via one of the following properties:
  //   st.markovLabelSide | st.statsLabelSide | st.statsPosition
  // Accepted values: 'up' | 'down' | 'left' | 'right' (default: 'down')
  getStateStatsLabelLayout(st) {
    const R = 40;        // state circle radius
    const gap = 10;      // gap from node to label
    // Wider only in coupled mode (two percentages side by side). Smaller elsewhere.
    const boxW = this.coupledMode ? 110 : 74;
    const boxH = 22;     // label box height
    const side = (st.markovLabelSide || st.statsLabelSide || st.statsPosition || 'down').toLowerCase();

    let rectX = st.x - boxW / 2;
    let rectY = st.y + R + gap; // default 'down'
    let textX = st.x;
    let textY = rectY + Math.round(boxH / 2) + 3; // visually centered
    let captionX = st.x;
    let captionY = rectY + boxH + 13; // below box

    if (side === 'up') {
      rectX = st.x - boxW / 2;
      rectY = st.y - R - gap - boxH;
      textX = st.x;
      textY = rectY + Math.round(boxH / 2) + 1;
      captionX = st.x;
      captionY = rectY - 10; // above box
    } else if (side === 'left') {
      rectX = st.x - R - gap - boxW;
      rectY = st.y - Math.round(boxH / 2);
      textX = rectX + Math.round(boxW / 2);
      textY = st.y + 1;
      captionX = rectX + Math.round(boxW / 2);
      captionY = rectY + boxH + 12; // below box
    } else if (side === 'right') {
      rectX = st.x + R + gap;
      rectY = st.y - Math.round(boxH / 2);
      textX = rectX + Math.round(boxW / 2);
      textY = st.y + 1;
      captionX = rectX + Math.round(boxW / 2);
      captionY = rectY + boxH + 12; // below box
    }

    return { rectX, rectY, boxW, boxH, textX, textY, captionX, captionY };
  }

  // Geometry helpers
  svgPoint(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  svgEl(tag, attrs = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  getEdgePath(edge) {
    const from = this.states.find(s => s.id === edge.from);
    const to = this.states.find(s => s.id === edge.to);
    if (!from || !to) return null;
    
    let sx, sy, ex, ey;
    if (edge.from === edge.to) {
      // Self-loop: create a circular arc using SVG arc command
      const ang = Math.atan2(edge.controlY - from.y, edge.controlX - from.x);
      const nodeRadius = 40;
      const loopRadius = 25; // radius of the circular loop
      const spread = 0.3;    // angle between start and end points
      
      // Start and end points on the node boundary
      sx = from.x + Math.cos(ang - spread) * nodeRadius;
      sy = from.y + Math.sin(ang - spread) * nodeRadius;
      ex = from.x + Math.cos(ang + spread) * nodeRadius;
      ey = from.y + Math.sin(ang + spread) * nodeRadius;
      
      // Create a circular arc path using SVG arc syntax
      return {
        path: `M ${sx} ${sy} A ${loopRadius} ${loopRadius} 0 1 1 ${ex} ${ey}`,
        sx, sy, ex, ey
      };
    } else {
      let dx = edge.controlX - from.x;
      let dy = edge.controlY - from.y;
      let d = Math.hypot(dx, dy);
      sx = from.x + dx / d * 40;
      sy = from.y + dy / d * 40;
      dx = edge.controlX - to.x;
      dy = edge.controlY - to.y;
      d = Math.hypot(dx, dy);
      ex = to.x + dx / d * 40;
      ey = to.y + dy / d * 40;
      
      return {
        path: `M ${sx} ${sy} Q ${edge.controlX} ${edge.controlY} ${ex} ${ey}`,
        sx, sy, ex, ey
      };
    }
  }

  weightPos(e) {
    const p = this.getEdgePath(e);
    if (!p) return { x: 0, y: 0 };
    const t = 0.5;
    return {
      x: (1 - t) * (1 - t) * p.sx + 2 * (1 - t) * t * e.controlX + t * t * p.ex,
      y: (1 - t) * (1 - t) * p.sy + 2 * (1 - t) * t * e.controlY + t * t * p.ey
    };
  }

  getPointOnQuadraticBezier(sx, sy, cx, cy, ex, ey, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * sx + 2 * mt * t * cx + t * t * ex,
      y: mt * mt * sy + 2 * mt * t * cy + t * t * ey
    };
  }

  getPointOnCircularArc(sx, sy, ex, ey, radius, centerX, centerY, t) {
    // For circular arc, interpolate along the arc angle
    const startAngle = Math.atan2(sy - centerY, sx - centerX);
    const endAngle = Math.atan2(ey - centerY, ex - centerX);
    
    // Ensure we go the long way around for the loop
    let deltaAngle = endAngle - startAngle;
    if (Math.abs(deltaAngle) < Math.PI) {
      deltaAngle += deltaAngle > 0 ? -2 * Math.PI : 2 * Math.PI;
    }
    
    const currentAngle = startAngle + deltaAngle * t;
    return {
      x: centerX + radius * Math.cos(currentAngle),
      y: centerY + radius * Math.sin(currentAngle)
    };
  }

  // Auto layout
  autoLayout() {
    if (this.states.length === 0) return;
    
    const rect = this.svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const margin = 100;
    const nodeRadius = 40;
    const minDist = nodeRadius * 3.5;
    
    // Initialize positions
    this.states.forEach(s => {
      if (!s.x || !s.y) {
        s.x = centerX + (Math.random() - 0.5) * 200;
        s.y = centerY + (Math.random() - 0.5) * 200;
      }
    });
    
    // Force-directed layout
    const iterations = 100;
    const cooling = 0.95;
    let temperature = 50;
    
    for (let iter = 0; iter < iterations; iter++) {
      const forces = {};
      
      this.states.forEach(s => {
        forces[s.id] = { x: 0, y: 0 };
      });
      
      // Repulsive forces
      for (let i = 0; i < this.states.length; i++) {
        for (let j = i + 1; j < this.states.length; j++) {
          const s1 = this.states[i];
          const s2 = this.states[j];
          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const dist = Math.hypot(dx, dy);
          
          if (dist > 0 && dist < minDist * 2) {
            const force = (minDist * minDist) / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            forces[s1.id].x -= fx;
            forces[s1.id].y -= fy;
            forces[s2.id].x += fx;
            forces[s2.id].y += fy;
          }
        }
      }
      
      // Attractive forces along edges
      this.edges.forEach(e => {
        if (e.from === e.to) return;
        const s1 = this.states.find(s => s.id === e.from);
        const s2 = this.states.find(s => s.id === e.to);
        if (!s1 || !s2) return;
        
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const dist = Math.hypot(dx, dy);
        const idealDist = minDist * 1.5;
        
        if (dist > idealDist) {
          const force = (dist - idealDist) * 0.1;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          forces[s1.id].x += fx;
          forces[s1.id].y += fy;
          forces[s2.id].x -= fx;
          forces[s2.id].y -= fy;
        }
      });
      
      // Centering force
      this.states.forEach(s => {
        const dx = centerX - s.x;
        const dy = centerY - s.y;
        forces[s.id].x += dx * 0.01;
        forces[s.id].y += dy * 0.01;
      });
      
      // Apply forces
      this.states.forEach(s => {
        const f = forces[s.id];
        const fx = Math.max(-temperature, Math.min(temperature, f.x));
        const fy = Math.max(-temperature, Math.min(temperature, f.y));
        s.x += fx;
        s.y += fy;
        
        s.x = Math.max(margin, Math.min(rect.width - margin, s.x));
        s.y = Math.max(margin, Math.min(rect.height - margin, s.y));
      });
      
      temperature *= cooling;
    }
    
    // Update edge control points
    this.edges.forEach(e => {
      const s1 = this.states.find(s => s.id === e.from);
      const s2 = this.states.find(s => s.id === e.to);
      if (!s1 || !s2) return;
      
      if (e.from === e.to) {
        e.controlX = s1.x;
        e.controlY = s1.y - 100;
      } else {
        const midX = (s1.x + s2.x) / 2;
        const midY = (s1.y + s2.y) / 2;
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const dist = Math.hypot(dx, dy);
        
        const opposite = this.edges.find(ed => ed.from === e.to && ed.to === e.from);
        const offset = 30;
        
        if (opposite) {
          const px = -dy / dist * offset;
          const py = dx / dist * offset;
          e.controlX = midX + px;
          e.controlY = midY + py;
        } else {
          const px = -dy / dist * 15;
          const py = dx / dist * 15;
          e.controlX = midX + px;
          e.controlY = midY + py;
        }
      }
    });
    
    this.render();
  }

  // Rendering
  render() {
    // Clear layers
    [this.edgesLayer, this.statesLayer, this.uiLayer].forEach(l => {
      while (l.firstChild) l.removeChild(l.firstChild);
    });

    // Render edges
    this.edges.forEach(ed => {
      const g = this.svgEl('g');
      const d = this.getEdgePath(ed);
      if (!d) return;
      
      // Self-loops: use arc path with marker-end so arrowhead connects flush
      if (ed.from === ed.to) {
        const path = this.svgEl('path', {
          d: d.path,
          fill: 'none',
          stroke: '#374151',
          'stroke-width': 1.5,
          'marker-end': 'url(#arrowhead)'
        });
        g.appendChild(path);
      } else {
         const path = this.svgEl('path', {
          d: d.path,
          fill: 'none',
          stroke: '#374151',
           'stroke-width': 1.5,
          'marker-end': 'url(#arrowhead)'
        });
        g.appendChild(path);
      }

      // Control handle (only in builder mode)
      if (!this.markovMode && !this.isViewerMode) {
        const ch = this.svgEl('circle', {
          cx: ed.controlX,
          cy: ed.controlY,
          r: 6,
          fill: '#9CA3AF',
          stroke: '#6B7280',
          'stroke-width': 1
        });
        ch.classList.add('cursor-move', 'hover:fill-blue-400', 'transition-colors');
        ch.addEventListener('mousedown', e => {
          e.stopPropagation();
          const p = this.svgPoint(e);
          this.draggedControl = {
            id: ed.id,
            offsetX: p.x - ed.controlX,
            offsetY: p.y - ed.controlY
          };
        });
        g.appendChild(ch);
      }

      // Weight display
      const wp = this.weightPos(ed);
      if (this.editingEdgeId === ed.id && !this.markovMode && !this.isViewerMode) {
        const fo = this.svgEl('foreignObject', {
          x: wp.x - 20,
          y: wp.y - 10,
          width: 40,
          height: 20
        });
        const inp = document.createElement('input');
        inp.className = 'w-full px-1 text-center bg-white border border-gray-300 rounded outline-none text-sm';
        inp.value = this.editText;
        inp.addEventListener('mousedown', e => e.stopPropagation());
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.commitEdgeWeight();
          }
        });
        inp.addEventListener('input', e => this.editText = e.target.value);
        inp.addEventListener('blur', () => this.commitEdgeWeight());
        fo.appendChild(inp);
        g.appendChild(fo);
        setTimeout(() => inp.focus(), 0);
      } else {
        const wg = this.svgEl('g');
        if (!this.isViewerMode) {
          wg.classList.add('cursor-pointer');
          wg.addEventListener('click', e => {
            if (this.markovMode) return;
            e.stopPropagation();
            this.editingEdgeId = ed.id;
            this.editText = ed.weight;
            this.render();
          });
        }
        wg.appendChild(this.svgEl('rect', {
          x: wp.x - 15,
          y: wp.y - 10,
          width: 30,
          height: 20,
          fill: 'white',
          stroke: '#374151',
          'stroke-width': 1,
          rx: 3
        }));
        wg.appendChild(this.svgEl('text', {
          x: wp.x,
          y: wp.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          fill: '#374151',
          'font-size': 12,
          'font-weight': 500
        }, ed.weight));
        g.appendChild(wg);
      }

      this.edgesLayer.appendChild(g);
    });

    // Render states
    this.states.forEach(st => {
      const g = this.svgEl('g');
      
        const isEdgeSourceSelected = (!this.markovMode && !this.isViewerMode && this.addingEdge && this.selectedStates.length === 1 && this.selectedStates[0] === st.id);
        const isProofTarget = (this.sampleProofMode && this.proofTargetStateId != null && st.id === this.proofTargetStateId);
        let baseFill = (st.color && st.color.fill) ? st.color.fill : '#9CA3AF';
        let baseStroke = (st.color && st.color.stroke) ? st.color.stroke : '#6B7280';
        if (isProofTarget) {
          baseFill = '#51cf66';
          baseStroke = '#37b24d';
        }
        const highlightFill = isEdgeSourceSelected ? this.lightenColor(baseFill, 18) : baseFill;
        const highlightStroke = isEdgeSourceSelected ? this.lightenColor(baseStroke, 10) : baseStroke;
        const circle = this.svgEl('circle', {
          cx: st.x,
          cy: st.y,
          r: 32,
          fill: highlightFill,
          stroke: highlightStroke,
          'stroke-width': 2
        });
      
      if (this.isViewerMode) {
        circle.classList.add('cursor-pointer', 'hover:opacity-90', 'transition-opacity');
      } else {
        circle.classList.add(
          this.markovMode ? 'cursor-default' : (this.addingEdge ? 'cursor-pointer' : 'cursor-move'),
          'hover:opacity-90',
          'transition-opacity'
        );
      }
      
      circle.addEventListener('mousedown', e => this.handleStateMouseDown(e, st.id));
      circle.addEventListener('click', e => this.handleStateClick(e, st.id));
      
      if (!this.markovMode && !this.isViewerMode) {
        circle.addEventListener('contextmenu', e => this.handleStateContextMenu(e, st.id));
      }
      
      g.appendChild(circle);

        g.appendChild(this.svgEl('text', {
        x: st.x,
        y: st.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: 'white',
          'font-size': 12,
        'font-weight': 500,
        'pointer-events': 'none'
      }, st.label));

      // Stats display in Markov mode
      if (this.markovMode) {
        if (this.coupledSampleMode || this.coupledSampleSplitMode || this.tripleClusterMode) {
          // No probability boxes for coupled-sample mode
        } else if (this.coupledMode) {
          // Show probability for both clusters (black | orange) with zero decimals
          const baseline = this.COUPLED_TOTAL_TOKENS || this.TOTAL_TOKENS;
          const blackMass = (this.blackMassCounts && this.blackMassCounts[st.id]) || 0;
          const orangeMass = (this.orangeMassCounts && this.orangeMassCounts[st.id]) || 0;
          const blackPct = Math.round((blackMass / baseline) * 100) || 0;
          const orangePct = Math.round((orangeMass / baseline) * 100) || 0;
          const pos = this.getStateStatsLabelLayout(st);
          const isGreenHere = !!(this.greenToken && this.greenToken.stateId === st.id);

          const rectFill = isGreenHere ? '#ebfbee' : 'white';       // oc-green-0
          const rectStroke = isGreenHere ? '#37b24d' : '#374151';   // green-7 or default gray
          const textFill = '#374151';                               // keep black text dark gray even when highlighted
          const barFill = '#6B7280';                                // gray for separator
          const orangeFill = '#f76707';                             // darker orange for text

          g.appendChild(this.svgEl('rect', {
            x: pos.rectX,
            y: pos.rectY,
            width: pos.boxW,
            height: pos.boxH,
            fill: rectFill,
            stroke: rectStroke,
            'stroke-width': 1,
            rx: 3,
            opacity: 0.95
          }));

          const textEl = this.svgEl('text', {
            x: pos.textX,
            y: pos.textY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': 13,
            'font-weight': 600,
            'pointer-events': 'none'
          });
          const t1 = this.svgEl('tspan', { fill: textFill }, blackPct + '% ');
          const tbar = this.svgEl('tspan', { fill: barFill }, '| ');
          const t2 = this.svgEl('tspan', { fill: orangeFill }, orangePct + '%');
          textEl.appendChild(t1);
          textEl.appendChild(tbar);
          textEl.appendChild(t2);
          g.appendChild(textEl);
          // No caption in coupled/distribution modes
        } else if (this.distributionMode) {
          const cnt = (this.tokenCounts[st.id] / this.TOTAL_TOKENS) * 100 || 0;
          const pos = this.getStateStatsLabelLayout(st);
          g.appendChild(this.svgEl('rect', {
            x: pos.rectX,
            y: pos.rectY,
            width: pos.boxW,
            height: pos.boxH,
            fill: 'white',
            stroke: '#374151',
            'stroke-width': 1,
            rx: 3,
            opacity: 0.95
          }));
          g.appendChild(this.svgEl('text', {
            x: pos.textX,
            y: pos.textY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#374151',
            'font-size': 13,
            'font-weight': 600,
            'pointer-events': 'none'
          }, cnt.toFixed(2) + "%"));
          // No caption in coupled/distribution modes
        } else {
          const total = Object.values(this.visits).reduce((s, v) => s + v, 0);
          const pct = total > 0 ? ((this.visits[st.id] / total) * 100).toFixed(1) : '0.0';
          const pos = this.getStateStatsLabelLayout(st);
          g.appendChild(this.svgEl('rect', {
            x: pos.rectX,
            y: pos.rectY,
            width: pos.boxW,
            height: pos.boxH,
            fill: 'white',
            stroke: '#374151',
            'stroke-width': 1,
            rx: 3,
            opacity: 0.95
          }));
          g.appendChild(this.svgEl('text', {
            x: pos.textX,
            y: pos.textY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#374151',
            'font-size': 13,
            'font-weight': 600,
            'pointer-events': 'none'
          }, `${pct}%`));
          g.appendChild(this.svgEl('text', {
            x: pos.captionX,
            y: pos.captionY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#6B7280',
            'font-size': 10,
            'font-weight': 400,
            'pointer-events': 'none'
          }, `(${this.visits[st.id] || 0} visits)`));
        }
      }

      this.statesLayer.appendChild(g);
    });

    if (this.contextMenuState && !this.isViewerMode) {
      this.drawContextMenu();
    }

    if (this.onRender) {
      this.onRender();
    }
  }

  // State management
  addState() {
    if (this.markovMode || this.isViewerMode) return;
    // Compute the smallest unused integer for a label of the form "State <n>"
    const used = new Set(this.states.map(s => (s.label || '').trim()));
    let idx = 1;
    while (used.has(`State ${idx}`)) idx += 1;
    const label = `State ${idx}`;
    this.states.push({
      id: Date.now(),
      x: 200 + Math.random() * 300,
      y: 150 + Math.random() * 200,
      label,
      color: this.colorPalette[0]
    });
    this.render();
  }

  // Edge management
  beginEdgeMode() {
    if (this.markovMode || this.isViewerMode) return;
    this.addingEdge = true;
    this.selectedStates = [];
    this.render();
  }

  cancelEdgeMode() {
    this.addingEdge = false;
    this.selectedStates = [];
    this.render();
  }

  // Event handlers
  handleStateMouseDown(e, id) {
    e.stopPropagation();
    if (this.markovMode || this.animatingTokens || this.isViewerMode) return;
    if (this.addingEdge) {
      this.handleStateClickForEdge(id);
      return;
    }
    const p = this.svgPoint(e);
    const st = this.states.find(s => s.id === id);
    this.draggedState = {
      id,
      offsetX: p.x - st.x,
      offsetY: p.y - st.y
    };
    this.contextMenuState = null;
    this.render();
  }

  handleStateClick(e, id) {
    if (this.animatingTokens) return;
    
    if (this.onStateClick) {
      this.onStateClick(id, e);
    }
    
    if (this.markovMode && (this.coupledSampleMode || this.coupledSampleSplitMode)) {
      // In coupled-sample mode, left click sets black (and orange) start; shift+click sets green start
      if (e && e.shiftKey) {
        if (this.sampleGreenToken) {
          this.sampleGreenToken.stateId = id;
          this.positionTokensAtState([this.sampleGreenToken], id);
        }
        // Latch orange to green at t=0 if co-located with black/orange
        if (this.sampleOrangeToken && this.sampleOrangeToken.stateId === id && this.sampleBlackToken && this.sampleBlackToken.stateId === id) {
          this.coupledSampleFollowsGreen = true;
        } else {
          this.coupledSampleFollowsGreen = false;
        }
        this.positionCoupledSampleTokens();
        this.render();
      } else {
        if (this.sampleBlackToken) {
          this.sampleBlackToken.stateId = id;
        }
        if (this.sampleOrangeToken) {
          this.sampleOrangeToken.stateId = id;
        }
        // Latch depends on green matching
        if (this.sampleGreenToken && this.sampleGreenToken.stateId === id) {
          this.coupledSampleFollowsGreen = true;
        } else {
          this.coupledSampleFollowsGreen = false;
        }
        this.positionCoupledSampleTokens();
        this.render();
      }
      return;
    } else if (this.markovMode && this.coupledMode) {
      // In coupled mode, left click sets black tokens, shift+click sets orange token
      if (e && e.shiftKey) {
        // Shift+click sets orange token
        this.greenToken.stateId = id;
        this.greenTokenStateId = id;
        this.positionTokensAtState([this.greenToken], id);
        // No change to black mass when only green changes; re-render to refresh labels
        this.render();
      } else {
        // Regular click sets black tokens
        this.blackTokens.forEach(t => {
          t.stateId = id;
          t.coupled = false;
          t.elt.setAttribute('fill', '#000');
        });
        // Move orange tokens start with black tokens
        this.orangeTokens.forEach(t => {
          t.stateId = id;
          // Coupled at t=0 if green starts here too
          t.coupled = (this.greenTokenStateId === id);
        });
        this.coupledTokens.clear();
        this.positionTokensAtState(this.blackTokens, id);
        this.positionTokensAtState(this.orangeTokens, id);
        this.positionCoupledClustersSideBySide();
        // Reset continuous mass baselines to reflect new starting state
        this.blackMassCounts = {};
        this.orangeMassCounts = {};
        this.states.forEach(s => { this.blackMassCounts[s.id] = 0; this.orangeMassCounts[s.id] = 0; });
        const totalPerCluster = this.COUPLED_TOTAL_TOKENS || this.TOTAL_TOKENS;
        this.blackMassCounts[id] = totalPerCluster;
        this.orangeMassCounts[id] = totalPerCluster;
        // Refresh labels immediately
        this.render();
      }
      return;
    } else if (this.markovMode && !this.distributionMode) {
      this.tokenStateId = id;
      this.visits = {};
      this.states.forEach(s => this.visits[s.id] = 0);
      this.visits[this.tokenStateId] = 1;
      if (this.tokens[0]) {
        this.tokens[0].stateId = id;
        this.positionTokensAtState(this.tokens, id);
      }
      this.render();
    } else if (this.markovMode && this.distributionMode) {
      this.resetTokens(this.TOTAL_TOKENS, id);
      this.render();
    }
  }

  handleStateClickForEdge(id) {
    this.selectedStates.push(id);
    if (this.selectedStates.length === 2) {
      const [f, t] = this.selectedStates;
      if (this.edges.some(e => e.from === f && e.to === t)) {
        alert('Edge already exists');
        this.cancelEdgeMode();
        return;
      }
      const S = this.states.find(s => s.id === f);
      const T = this.states.find(s => s.id === t);
      let cx, cy;
      if (f === t) {
        // Control far above to make the loop close to circular
        const loopHeight = 150;
        cx = S.x;
        cy = S.y - loopHeight;
      } else {
        const midX = (S.x + T.x) / 2;
        const midY = (S.y + T.y) / 2;
        const dx = T.x - S.x;
        const dy = T.y - S.y;
        const dist = Math.hypot(dx, dy) || 1;
        const opp = this.edges.find(e => e.from === t && e.to === f);
        const off = 30;
        // Perpendicular unit vector
        const nx = -dy / dist;
        const ny = dx / dist;
        if (opp) {
          // Mirror new control point across the midpoint relative to the opposite edge's control
          const vx = (opp.controlX || midX) - midX;
          const vy = (opp.controlY || midY) - midY;
          const mag = Math.hypot(vx, vy);
          if (mag > 1e-6) {
            cx = midX - vx;
            cy = midY - vy;
          } else {
            cx = midX - nx * off;
            cy = midY - ny * off;
          }
        } else {
          cx = midX + nx * off;
          cy = midY + ny * off;
        }
      }
      this.edges.push({
        id: Date.now(),
        from: f,
        to: t,
        weight: '1',
        controlX: cx,
        controlY: cy
      });
      this.cancelEdgeMode();
      this.render();
    } else {
      // Render immediately so the selected source highlights green
      this.render();
    }
  }

  handleStateContextMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const st = this.states.find(s => s.id === id);
    this.contextMenuState = { id, x: st.x, y: st.y };
    this.labelEditText = st.label;
    this.render();
  }

  drawContextMenu() {
    const { id, x, y } = this.contextMenuState;
    const mg = this.svgEl('g');
    
    mg.appendChild(this.svgEl('rect', {
      x: x - 110,
      y: y + 50,
      width: 220,
      height: 200,
      fill: 'white',
      stroke: '#374151',
      'stroke-width': 1,
      rx: 5
    }));
    
    const fo = this.svgEl('foreignObject', {
      x: x - 100,
      y: y + 55,
      width: 200,
      height: 30
    });
    
    const inp = document.createElement('input');
    inp.className = 'w-full px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:border-blue-500';
    inp.placeholder = 'State label';
    inp.value = this.labelEditText;
    inp.addEventListener('input', e => this.labelEditText = e.target.value);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitLabelEdit();
        this.contextMenuState = null;
        this.render();
      }
    });
    fo.appendChild(inp);
    mg.appendChild(fo);

    mg.appendChild(this.svgEl('text', {
      x: x,
      y: y + 95,
      'text-anchor': 'middle',
      fill: '#6B7280',
      'font-size': 11,
      'font-weight': 500
    }, 'Choose color:'));
    
    this.colorPalette.forEach((col, i) => {
      const cc = this.svgEl('circle', {
        cx: x - 95 + (i % 5) * 40,
        cy: y + 110 + Math.floor(i / 5) * 25,
        r: 10,
        fill: col.fill,
        stroke: col.stroke,
        'stroke-width': 2
      });
      cc.classList.add('cursor-pointer', 'hover:opacity-80', 'transition-opacity');
      cc.addEventListener('click', e => {
        e.stopPropagation();
        this.commitLabelEdit();
        this.states = this.states.map(s =>
          s.id === id ? { ...s, color: col } : s
        );
        this.contextMenuState = null;
        this.render();
      });
      mg.appendChild(cc);
    });

    const del = this.svgEl('text', {
      x: x,
      y: y + 180,
      'text-anchor': 'middle',
      fill: '#EF4444',
      'font-size': 12,
      'font-weight': 600,
      cursor: 'pointer'
    }, '🗑 Delete State');
    
    del.addEventListener('click', e => {
      e.stopPropagation();
      this.states = this.states.filter(s => s.id !== id);
      this.edges = this.edges.filter(ed => ed.from !== id && ed.to !== id);
      this.contextMenuState = null;
      this.render();
    });
    
    mg.appendChild(del);
    this.uiLayer.appendChild(mg);
    setTimeout(() => inp.focus(), 0);
  }

  commitEdgeWeight() {
    if (this.editingEdgeId !== null) {
      const EPS = 1e-12;
      const w = parseFloat(this.editText);
      if (Number.isFinite(w) && w <= EPS) {
        // Delete edge if weight is zero (or effectively zero)
        this.edges = this.edges.filter(e => e.id !== this.editingEdgeId);
      } else {
        const newWeight = this.editText && this.editText.trim().length > 0 ? this.editText : '1';
        this.edges = this.edges.map(e =>
          e.id === this.editingEdgeId ? { ...e, weight: newWeight } : e
        );
      }
    }
    this.editingEdgeId = null;
    this.editText = '';
    this.render();
  }

  commitLabelEdit() {
    if (this.contextMenuState && this.labelEditText.trim()) {
      this.states = this.states.map(s =>
        s.id === this.contextMenuState.id ? { ...s, label: this.labelEditText.trim() } : s
      );
    }
    this.labelEditText = '';
  }

  // Cancel any in-flight animations and unlock UI
  cancelAnimations() {
    this.animationEpoch += 1;
    this.animatingTokens = false;
  }

  // Token management
  resetTokens(n, startStateId) {
    this.cancelAnimations();
    this.tokensLayer.innerHTML = '';
    this.tokens = [];
    const s0 = this.states.find(s => s.id === startStateId);
    if (!s0) return;
    
    if (this.distributionMode) {
      this.tokenCounts = {};
      this.states.forEach(s => this.tokenCounts[s.id] = 0);
      this.tokenCounts[startStateId] = n;
    }
    
    for (let i = 0; i < n; i++) {
      const radius = n === 1 ? 13 : 2;
      const c = this.svgEl('circle', { r: radius, fill: '#000' });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.tokens.push({ stateId: startStateId, elt: c });
    }
    this.positionTokensAtState(this.tokens, startStateId);
  }

  // Reset tokens for coupled mode
  resetCoupledTokens(blackStartStateId, greenStartStateId) {
    this.cancelAnimations();
    this.tokensLayer.innerHTML = '';
    this.showTokensLayer();
    this.blackTokens = [];
    this.orangeTokens = [];
    this.greenToken = null;
    // Clear any coupled-sample tokens
    this.sampleBlackToken = null;
    this.sampleGreenToken = null;
    this.sampleOrangeToken = null;
    this.coupledSampleFollowsGreen = false;
    this.coupledTokens.clear();
    // Initialize continuous mass counts for both clusters
    this.blackMassCounts = {};
    this.orangeMassCounts = {};
    
    const blackStart = this.states.find(s => s.id === blackStartStateId);
    const greenStart = this.states.find(s => s.id === greenStartStateId);
    if (!blackStart || !greenStart) return;
    
    // Initialize mass: both clusters start at the same state (blackStart)
    this.states.forEach(s => { this.blackMassCounts[s.id] = 0; this.orangeMassCounts[s.id] = 0; });
    const totalPerCluster = this.COUPLED_TOTAL_TOKENS || this.TOTAL_TOKENS;
    this.blackMassCounts[blackStartStateId] = totalPerCluster;
    this.orangeMassCounts[blackStartStateId] = totalPerCluster;
    
    // Create many black tokens for coupled mode
    for (let i = 0; i < this.COUPLED_TOTAL_TOKENS; i++) {
      const c = this.svgEl('circle', { r: 1.5, fill: '#000' });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.blackTokens.push({ 
        stateId: blackStartStateId, 
        elt: c,
        coupled: false
      });
    }
    // Create same number of small orange tokens (starting where black starts)
    for (let i = 0; i < this.COUPLED_TOTAL_TOKENS; i++) {
      const c = this.svgEl('circle', { r: 1.5, fill: '#ff922b', stroke: '#f76707', 'stroke-width': 1 });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.orangeTokens.push({ 
        stateId: blackStartStateId, 
        elt: c,
        coupled: false
      });
    }
    
    // Create large green token
    const greenCircle = this.svgEl('circle', { 
      r: 13, 
      fill: '#51cf66',   // green-5
      stroke: '#37b24d', // green-7 for contrast outline
      'stroke-width': 2
    });
    greenCircle.classList.add('token');
    this.tokensLayer.appendChild(greenCircle);
    this.greenToken = { 
      stateId: greenStartStateId, 
      elt: greenCircle,
      isOrange: true 
    };
    
    // Position clusters side-by-side similar to coupled-sample layout
    this.positionTokensAtState(this.blackTokens, blackStartStateId);
    this.positionTokensAtState(this.orangeTokens, blackStartStateId);
    // Also position the large green token at its start
    this.positionTokensAtState([this.greenToken], greenStartStateId);
    // Offset clusters when they share a state
    this.positionCoupledClustersSideBySide();
    
    // Track state for green token
    this.greenTokenStateId = greenStartStateId;

    // If orange cluster starts at the same state as green, couple from time 0
    if (blackStartStateId === greenStartStateId) {
      this.orangeTokens.forEach(t => { t.coupled = true; });
    } else {
      // Otherwise ensure initial coupled flags are false
      this.orangeTokens.forEach(t => { t.coupled = false; });
    }
  }

  positionTokensAtState(tokenList, stateId) {
    const st = this.states.find(s => s.id === stateId);
    if (!st) return;
    
    const relevantTokens = tokenList.filter(t => t.stateId === stateId);
    relevantTokens.forEach((tok, i) => {
      const angle = i * this.GOLDEN_ANGLE;
      const useCoupledSpacing = (this.coupledMode || this.tripleClusterMode);
      const spacing = (useCoupledSpacing && !tok.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
      const r = spacing * Math.sqrt(i);
      const x = st.x + r * Math.cos(angle);
      const y = st.y + r * Math.sin(angle);
      tok.elt.setAttribute('transform', `translate(${x},${y})`);
    });
  }

  // Position tokens specifically for coupled-sample mode (up to 3 tokens total)
  positionCoupledSampleTokens() {
    if (!(this.coupledSampleMode || this.coupledSampleSplitMode)) return;
    const tokens = [this.sampleBlackToken, this.sampleGreenToken, this.sampleOrangeToken].filter(Boolean);
    // Group by state id
    const byState = new Map();
    tokens.forEach(tok => {
      if (!byState.has(tok.stateId)) byState.set(tok.stateId, []);
      byState.get(tok.stateId).push(tok);
    });

    const offset = 10; // pixels; slight overlap

    this.states.forEach(st => {
      const list = byState.get(st.id) || [];
      if (list.length === 0) return;
      if (list.length === 1) {
        const t = list[0];
        t.elt.setAttribute('transform', `translate(${st.x},${st.y})`);
      } else if (list.length === 2) {
        // Ensure black and orange are visible side-by-side if present together
        const hasBlack = list.some(t => t === this.sampleBlackToken);
        const hasOrange = list.some(t => t === this.sampleOrangeToken);
        if (hasBlack && hasOrange) {
          this.sampleBlackToken.elt.setAttribute('transform', `translate(${st.x - offset},${st.y})`);
          this.sampleOrangeToken.elt.setAttribute('transform', `translate(${st.x + offset},${st.y})`);
        } else {
          list[0].elt.setAttribute('transform', `translate(${st.x - offset},${st.y})`);
          list[1].elt.setAttribute('transform', `translate(${st.x + offset},${st.y})`);
        }
      } else {
        // Three tokens: arrange in a small triangle
        list[0].elt.setAttribute('transform', `translate(${st.x - offset},${st.y + 0})`);
        list[1].elt.setAttribute('transform', `translate(${st.x + offset},${st.y + 0})`);
        list[2].elt.setAttribute('transform', `translate(${st.x},${st.y - offset})`);
      }
    });
  }

  // Offset black/orange clusters side-by-side when co-located in coupled mode
  positionCoupledClustersSideBySide() {
    if (!this.coupledMode) return;
    const offset = 15;
    // For each state, detect presence of clusters and offset one left/right
    this.states.forEach(st => {
      const blacks = this.blackTokens.filter(t => t.stateId === st.id);
      const oranges = this.orangeTokens.filter(t => t.stateId === st.id);
      if (blacks.length === 0 && oranges.length === 0) return;
      if (blacks.length > 0 && oranges.length > 0) {
        // Shift black cluster left, orange cluster right
        blacks.forEach((tok, i) => {
          const transform = tok.elt.getAttribute('transform') || `translate(${st.x},${st.y})`;
          const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(transform);
          const x = m ? parseFloat(m[1]) : st.x;
          const y = m ? parseFloat(m[2]) : st.y;
          tok.elt.setAttribute('transform', `translate(${x - offset},${y})`);
        });
        oranges.forEach((tok, i) => {
          const transform = tok.elt.getAttribute('transform') || `translate(${st.x},${st.y})`;
          const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(transform);
          const x = m ? parseFloat(m[1]) : st.x;
          const y = m ? parseFloat(m[2]) : st.y;
          tok.elt.setAttribute('transform', `translate(${x + offset},${y})`);
        });
      }
    });
  }

  // Offset three clusters when co-located in triple cluster mode
  positionTripleClustersSideBySide() {
    if (!this.tripleClusterMode) return;
    const offset = 15;
    this.states.forEach(st => {
      const blacks = this.blackTokens.filter(t => t.stateId === st.id);
      const oranges = this.orangeTokens.filter(t => t.stateId === st.id);
      const greens = this.greenClusterTokens.filter(t => t.stateId === st.id);
      if (blacks.length + oranges.length + greens.length === 0) return;
      blacks.forEach(tok => {
        const tr = tok.elt.getAttribute('transform') || `translate(${st.x},${st.y})`;
        const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(tr);
        const x = m ? parseFloat(m[1]) : st.x;
        const y = m ? parseFloat(m[2]) : st.y;
        tok.elt.setAttribute('transform', `translate(${x - offset},${y})`);
      });
      oranges.forEach(tok => {
        const tr = tok.elt.getAttribute('transform') || `translate(${st.x},${st.y})`;
        const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(tr);
        const x = m ? parseFloat(m[1]) : st.x;
        const y = m ? parseFloat(m[2]) : st.y;
        tok.elt.setAttribute('transform', `translate(${x + offset},${y})`);
      });
      greens.forEach(tok => {
        const tr = tok.elt.getAttribute('transform') || `translate(${st.x},${st.y})`;
        const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(tr);
        const x = m ? parseFloat(m[1]) : st.x;
        const y = m ? parseFloat(m[2]) : st.y;
        tok.elt.setAttribute('transform', `translate(${x},${y - offset})`);
      });
    });
  }

  animateTokenClusterAlongEdge(tokenGroup, edge, duration, callback) {
    const startEpoch = this.animationEpoch;
    let finished = false;
    const safeFinish = (canceled = false) => {
      if (finished) return;
      finished = true;
      if (typeof callback === 'function') callback(canceled);
    };
    const fromState = this.states.find(s => s.id === edge.from);
    const toState = this.states.find(s => s.id === edge.to);
    if (!fromState || !toState || tokenGroup.length === 0) {
      safeFinish(true);
      return;
    }

    const startTime = performance.now();
    const relativePositions = tokenGroup.map((t, i) => {
      // Preserve current offset from the state's center if available
      const transform = (t.elt && t.elt.getAttribute) ? (t.elt.getAttribute('transform') || '') : '';
      const m = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(transform);
      if (m && fromState) {
        const absX = parseFloat(m[1]);
        const absY = parseFloat(m[2]);
        return { x: absX - fromState.x, y: absY - fromState.y };
      }
      // Fallback: generate a compact spiral based on mode
      const angle = i * this.GOLDEN_ANGLE;
      const useCoupledSpacing = (this.coupledMode || this.tripleClusterMode);
      const spacing = (useCoupledSpacing && !t.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
      const r = spacing * Math.sqrt(i);
      return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    });

    // Check if this is a self-loop
    const isSelfLoop = (edge.from === edge.to);
    let centerPoint;

    if (isSelfLoop) {
      // For self-loops, use circular arc animation
      const ang = Math.atan2(edge.controlY - fromState.y, edge.controlX - fromState.x);
      const nodeRadius = 40;
      const loopRadius = 25;
      const spread = 0.3;
      
      const sx = fromState.x + Math.cos(ang - spread) * nodeRadius;
      const sy = fromState.y + Math.sin(ang - spread) * nodeRadius;
      const ex = fromState.x + Math.cos(ang + spread) * nodeRadius;
      const ey = fromState.y + Math.sin(ang + spread) * nodeRadius;
      const centerX = fromState.x + Math.cos(ang) * (nodeRadius + loopRadius);
      const centerY = fromState.y + Math.sin(ang) * (nodeRadius + loopRadius);

      const animate = (now) => {
        if (startEpoch !== this.animationEpoch) {
          return safeFinish(true);
        }
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Piecewise: center -> loop start, around loop, loop end -> center
        const ramp = 0.2; // time spent easing out/in to/from loop
        if (eased < ramp) {
          const u = eased / ramp;
          centerPoint = {
            x: fromState.x + u * (sx - fromState.x),
            y: fromState.y + u * (sy - fromState.y)
          };
        } else if (eased <= 1 - ramp) {
          const tArc = (eased - ramp) / (1 - 2 * ramp);
          centerPoint = this.getPointOnCircularArc(sx, sy, ex, ey, loopRadius, centerX, centerY, tArc);
        } else {
          const u = (eased - (1 - ramp)) / ramp;
          centerPoint = {
            x: ex + u * (fromState.x - ex),
            y: ey + u * (fromState.y - ey)
          };
        }

          tokenGroup.forEach((token, i) => {
            const pos = relativePositions[i];
            token.elt.setAttribute(
              'transform',
              `translate(${centerPoint.x + pos.x},${centerPoint.y + pos.y})`
            );
          });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (startEpoch !== this.animationEpoch) return safeFinish(true);
          tokenGroup.forEach(token => token.stateId = edge.to);
          safeFinish(false);
        }
      };

      requestAnimationFrame(animate);
    } else {
      // For regular edges, use quadratic bezier animation
      const animate = (now) => {
        if (startEpoch !== this.animationEpoch) {
          return safeFinish(true);
        }
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        centerPoint = this.getPointOnQuadraticBezier(
          fromState.x, fromState.y,
          edge.controlX, edge.controlY,
          toState.x, toState.y,
          eased
        );

          tokenGroup.forEach((token, i) => {
            const pos = relativePositions[i];
            token.elt.setAttribute(
              'transform',
              `translate(${centerPoint.x + pos.x},${centerPoint.y + pos.y})`
            );
          });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (startEpoch !== this.animationEpoch) return safeFinish(true);
          tokenGroup.forEach(token => token.stateId = edge.to);
          safeFinish(false);
        }
      };

      requestAnimationFrame(animate);
    }
  }

  // Stepping
  stepForward() {
    if (!this.markovMode || this.animatingTokens) return;
    
    if (this.coupledSampleSplitMode) {
      // Start with three-token sample logic identical to coupled-sample
      this.animatingTokens = true;
      const startEpoch = this.animationEpoch;

      const moveSingle = (token, chosenEdge) => new Promise(resolve => {
        if (!chosenEdge) return resolve();
        this.animateTokenClusterAlongEdge([token], chosenEdge, this.stepDelay, resolve);
      });

      const sampleNextEdge = (stateId) => {
        const outs = this.edges.filter(e => e.from === stateId);
        if (outs.length === 0) return null;
        const probs = outs.map(e => parseFloat(e.weight));
        const r = Math.random();
        let cum = 0;
        for (let i = 0; i < outs.length; i++) {
          cum += probs[i];
          if (r <= cum) return outs[i];
        }
        return outs[outs.length - 1];
      };

      const blackEdge = sampleNextEdge(this.sampleBlackToken.stateId);
      const greenEdge = sampleNextEdge(this.sampleGreenToken.stateId);
      // Orange follows black unless we've already coupled to green
      const orangeEdge = this.coupledSampleFollowsGreen ? greenEdge : blackEdge;

      Promise.all([
        moveSingle(this.sampleBlackToken, blackEdge),
        moveSingle(this.sampleGreenToken, greenEdge),
        moveSingle(this.sampleOrangeToken, orangeEdge)
      ]).then(() => {
        if (this.animationEpoch !== startEpoch) {
          this.animatingTokens = false;
          return;
        }
        if (blackEdge) this.sampleBlackToken.stateId = blackEdge.to;
        if (greenEdge) this.sampleGreenToken.stateId = greenEdge.to;
        if (orangeEdge) this.sampleOrangeToken.stateId = orangeEdge.to;

        const allSame = (
          this.sampleBlackToken.stateId === this.sampleGreenToken.stateId &&
          this.sampleGreenToken.stateId === this.sampleOrangeToken.stateId
        );

        if (allSame) {
          // Convert to triple clusters (black, orange, green) moving deterministically
          const meetIdBlack = this.sampleBlackToken.stateId;
          const meetIdGreen = this.sampleGreenToken.stateId;
          this.convertSampleSplitToTripleClusters(meetIdBlack, meetIdGreen);
          this.animatingTokens = false;
          return;
        }

        // Reposition (single token per state, but keep consistent API)
        this.positionCoupledSampleTokens();
        this.animatingTokens = false;
        this.render();
      });

      return;
    }

    if (this.tripleClusterMode) {
      // Deterministic redistribution for three independent clusters (black, orange, green)
      this.animatingTokens = true;
      const startEpoch = this.animationEpoch;

      const edgeGroups = {};

      const assignCluster = (tokensArray) => {
        this.states.forEach(st => {
          const stateTokens = tokensArray.filter(t => t.stateId === st.id);
          if (stateTokens.length === 0) return;
          const outEdges = this.edges.filter(e => e.from === st.id);
          if (outEdges.length === 0) return; // stay put if no outs

          const assignments = [];
          let assignedCount = 0;
          outEdges.forEach((edge, idx) => {
            const prob = parseFloat(edge.weight);
            const count = (idx === outEdges.length - 1)
              ? stateTokens.length - assignedCount
              : Math.floor(stateTokens.length * prob);
            for (let i = 0; i < count && assignedCount < stateTokens.length; i++) {
              assignments.push({ token: stateTokens[assignedCount++], edge });
            }
          });

          assignments.forEach(a => {
            const key = `${a.edge.from}_${a.edge.to}_${a.edge.id}`;
            if (!edgeGroups[key]) edgeGroups[key] = { edge: a.edge, tokens: [] };
            edgeGroups[key].tokens.push(a.token);
          });
        });
      };

      assignCluster(this.blackTokens);
      assignCluster(this.orangeTokens);
      assignCluster(this.greenClusterTokens);

      const animationPromises = [];
      Object.values(edgeGroups).forEach(group => {
        const p = new Promise(resolve => {
          this.animateTokenClusterAlongEdge(group.tokens, group.edge, this.stepDelay, resolve);
        });
        animationPromises.push(p);
      });

      Promise.all(animationPromises).then(() => {
        if (this.animationEpoch !== startEpoch) {
          this.animatingTokens = false;
          return;
        }
        // Reposition tokens at their new states in spirals
        this.states.forEach(st => {
          const clusters = [this.blackTokens, this.orangeTokens, this.greenClusterTokens];
          clusters.forEach(arr => {
            const list = arr.filter(t => t.stateId === st.id);
            list.forEach((tok, i) => {
              const angle = i * this.GOLDEN_ANGLE;
              const useCoupledSpacing = true;
              const spacing = (useCoupledSpacing && !tok.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
              const r = spacing * Math.sqrt(i);
              const x = st.x + r * Math.cos(angle);
              const y = st.y + r * Math.sin(angle);
              tok.elt.setAttribute('transform', `translate(${x},${y})`);
            });
          });
        });
        // Offset three clusters when co-located
        this.positionTripleClustersSideBySide();

        this.animatingTokens = false;
        this.render();
      });

      return;
    }

    if (this.coupledSampleMode) {
      // Three-token sample logic
      this.animatingTokens = true;
      const startEpoch = this.animationEpoch;

      const moveSingle = (token, chosenEdge) => new Promise(resolve => {
        if (!chosenEdge) return resolve();
        this.animateTokenClusterAlongEdge([token], chosenEdge, this.stepDelay, resolve);
      });

      const sampleNextEdge = (stateId) => {
        const outs = this.edges.filter(e => e.from === stateId);
        if (outs.length === 0) return null;
        const probs = outs.map(e => parseFloat(e.weight));
        const r = Math.random();
        let cum = 0;
        for (let i = 0; i < outs.length; i++) {
          cum += probs[i];
          if (r <= cum) return outs[i];
        }
        return outs[outs.length - 1];
      };

      const blackEdge = sampleNextEdge(this.sampleBlackToken.stateId);
      const greenEdge = sampleNextEdge(this.sampleGreenToken.stateId);
      // Orange follows black unless we've already coupled to green
      const orangeEdge = this.coupledSampleFollowsGreen ? greenEdge : blackEdge;

      Promise.all([
        moveSingle(this.sampleBlackToken, blackEdge),
        moveSingle(this.sampleGreenToken, greenEdge),
        moveSingle(this.sampleOrangeToken, orangeEdge)
      ]).then(() => {
        if (this.animationEpoch !== startEpoch) {
          this.animatingTokens = false;
          return;
        }
        if (blackEdge) this.sampleBlackToken.stateId = blackEdge.to;
        if (greenEdge) this.sampleGreenToken.stateId = greenEdge.to;
        if (orangeEdge) this.sampleOrangeToken.stateId = orangeEdge.to;

        // If all three tokens at same state, latch orange to green henceforth
        if (this.sampleBlackToken.stateId === this.sampleGreenToken.stateId &&
            this.sampleGreenToken.stateId === this.sampleOrangeToken.stateId) {
          this.coupledSampleFollowsGreen = true;
        }

        // Reposition (single token per state, but keep consistent API)
        this.positionCoupledSampleTokens();
        this.animatingTokens = false;
        this.render();
      });

    } else if (this.coupledMode) {
      this.animatingTokens = true;
      const startEpoch = this.animationEpoch;
      
      // First, determine large green token's next state (sampled)
      const greenOuts = this.edges.filter(e => e.from === this.greenToken.stateId);
      const greenProbs = greenOuts.map(e => parseFloat(e.weight));
      const greenR = Math.random();
      let greenCum = 0, greenNext = null;
      for (let i = 0; i < greenOuts.length; i++) {
        greenCum += greenProbs[i];
        if (greenR <= greenCum) { greenNext = greenOuts[i]; break; }
      }
      
      // Group tokens by their movements (clustered per edge)
      const movements = new Map(); // key -> { edge, tokens }

      // Helper to add a token to a movement edge group
      const addMove = (edge, token) => {
        if (!edge || !token) return;
        const key = `${edge.from}_${edge.to}_${edge.id}`;
        if (!movements.has(key)) movements.set(key, { edge, tokens: [] });
        movements.get(key).tokens.push(token);
      };

      // Move large green token with its sampled edge
      if (greenNext) addMove(greenNext, this.greenToken);

      // Deterministic redistribution for BOTH clusters (black and orange)
      // Maintain continuous mass counts to mirror distribution mode exactly for both
      const nextMassCounts = {};
      const nextOrangeMassCounts = {};
      this.states.forEach(s => { nextMassCounts[s.id] = 0; nextOrangeMassCounts[s.id] = 0; });

      // 1) Continuous mass update for all states, splitting exactly by weights.
      //    For orange cluster, route coupled fraction at green's from-state along greenNext.
      this.states.forEach(st => {
        const stateId = st.id;
        const totalBlack = this.blackMassCounts[stateId] || 0;
        const totalOrange = this.orangeMassCounts[stateId] || 0;

        const outs = this.edges.filter(e => e.from === stateId);
        if (outs.length === 0) {
          nextMassCounts[stateId] += totalBlack;
          nextOrangeMassCounts[stateId] += totalOrange;
          return;
        }

        // Split black mass purely by weights
        outs.forEach(out => {
          const p = parseFloat(out.weight);
          nextMassCounts[out.to] += totalBlack * p;
        });

        // Split orange mass by weights, but if this is green's from-state, route coupled fraction along greenNext
        let orangeMassToSplit = totalOrange;
        if (greenNext && stateId === greenNext.from) {
          // Compute fraction of coupled orange tokens at this state
          const orangesHere = this.orangeTokens.filter(t => t.stateId === stateId);
          const numCoupledOranges = orangesHere.filter(t => t.coupled).length;
          const fracCoupled = orangesHere.length > 0 ? (numCoupledOranges / orangesHere.length) : 0;
          const coupledMass = totalOrange * fracCoupled;
          nextOrangeMassCounts[greenNext.to] += coupledMass;
          orangeMassToSplit = totalOrange - coupledMass;
        }
        outs.forEach(out => {
          const p = parseFloat(out.weight);
          nextOrangeMassCounts[out.to] += orangeMassToSplit * p;
        });
      });

      // 2) Integer token assignment for both clusters (black and orange) by rounding
      const assignCluster = (tokensArr) => {
        const uncoupled = tokensArr.filter(t => !t.coupled);
        const byState = new Map();
        uncoupled.forEach(tok => {
          if (!byState.has(tok.stateId)) byState.set(tok.stateId, []);
          byState.get(tok.stateId).push(tok);
        });
        byState.forEach((tokenList, stateId) => {
          const outs = this.edges.filter(e => e.from === stateId);
          if (outs.length === 0) return; // tokens stay put
          let assigned = 0;
          outs.forEach((edge, idx) => {
            const prob = parseFloat(edge.weight);
            const count = (idx === outs.length - 1)
              ? tokenList.length - assigned
              : Math.floor(tokenList.length * prob);
            for (let i = 0; i < count && assigned < tokenList.length; i++) {
              addMove(edge, tokenList[assigned++]);
            }
          });
        });
      };
      assignCluster(this.blackTokens);
      // For orange cluster: coupled ones move with greenNext
      if (greenNext) {
        this.orangeTokens.forEach(t => { if (t.coupled) addMove(greenNext, t); });
      }
      assignCluster(this.orangeTokens);
      
      // Animate all movements
      const animationPromises = [];
      
      movements.forEach(group => {
        const promise = new Promise(resolve => {
          this.animateTokenClusterAlongEdge(group.tokens, group.edge, this.stepDelay, resolve);
        });
        animationPromises.push(promise);
      });
      
      Promise.all(animationPromises).then(() => {
        if (this.animationEpoch !== startEpoch) {
          this.animatingTokens = false;
          return;
        }
        // Update large green token state
        if (greenNext) {
          this.greenToken.stateId = greenNext.to;
          this.greenTokenStateId = greenNext.to;
        }
        
        // Update token states and check for coupling of ORANGE tokens
        this.orangeTokens.forEach(orangeTok => {
          if (!orangeTok.coupled && orangeTok.stateId === this.greenToken.stateId) {
            orangeTok.coupled = true;
            this.coupledTokens.add(orangeTok);
            // Keep orange color
          }
        });
        
        // Commit the continuous mass counts after movements
        this.blackMassCounts = nextMassCounts;
        this.orangeMassCounts = nextOrangeMassCounts;

        // Reposition all tokens
        this.states.forEach(st => {
          const blacksAtState = this.blackTokens.filter(t => t.stateId === st.id);
          blacksAtState.forEach((tok, i) => {
            const angle = i * this.GOLDEN_ANGLE;
            const spacing = (this.coupledMode && !tok.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
            const r = spacing * Math.sqrt(i);
            const x = st.x + r * Math.cos(angle);
            const y = st.y + r * Math.sin(angle);
            tok.elt.setAttribute('transform', `translate(${x},${y})`);
          });
          const orangesAtState = this.orangeTokens.filter(t => t.stateId === st.id);
          orangesAtState.forEach((tok, i) => {
            const angle = i * this.GOLDEN_ANGLE;
            const spacing = (this.coupledMode && !tok.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
            const r = spacing * Math.sqrt(i);
            const x = st.x + r * Math.cos(angle);
            const y = st.y + r * Math.sin(angle);
            tok.elt.setAttribute('transform', `translate(${x},${y})`);
          });
        });
        // Offset clusters side-by-side where needed
        this.positionCoupledClustersSideBySide();
        
        this.animatingTokens = false;
        this.render();
      });
      
    } else if (this.distributionMode) {
      this.animatingTokens = true;
      const startEpoch = this.animationEpoch;
      
      const newCounts = {};
      this.states.forEach(s => newCounts[s.id] = 0);
      
      this.states.forEach(st => {
        const outs = this.edges.filter(e => e.from === st.id);
        const currentCount = this.tokenCounts[st.id] || 0;
        
        if (!outs.length || currentCount === 0) {
          newCounts[st.id] += currentCount;
          return;
        }
        
        outs.forEach(out => {
          const prob = parseFloat(out.weight);
          const tokensToMove = currentCount * prob;
          newCounts[out.to] += tokensToMove;
        });
      });
      
      const edgeGroups = {};
      
      this.states.forEach(st => {
        const stateTokens = this.tokens.filter(t => t.stateId === st.id);
        if (stateTokens.length === 0) return;
        
        const outEdges = this.edges.filter(e => e.from === st.id);
        if (outEdges.length === 0) return;
        
        const assignments = [];
        let assignedCount = 0;
        
        outEdges.forEach((edge, idx) => {
          const prob = parseFloat(edge.weight);
          const count = (idx === outEdges.length - 1)
            ? stateTokens.length - assignedCount
            : Math.floor(stateTokens.length * prob);
          
          for (let i = 0; i < count && assignedCount < stateTokens.length; i++) {
            assignments.push({
              token: stateTokens[assignedCount++],
              edge: edge
            });
          }
        });
        
        assignments.forEach(a => {
          const key = `${a.edge.from}_${a.edge.to}_${a.edge.id}`;
          if (!edgeGroups[key]) {
            edgeGroups[key] = {
              edge: a.edge,
              tokens: []
            };
          }
          edgeGroups[key].tokens.push(a.token);
        });
      });
      
      const animationPromises = [];
      
      Object.values(edgeGroups).forEach(group => {
        const promise = new Promise(resolve => {
          this.animateTokenClusterAlongEdge(group.tokens, group.edge, this.stepDelay, resolve);
        });
        animationPromises.push(promise);
      });
      
      Promise.all(animationPromises).then(() => {
        // If a reset happened during animation, ignore this frame
        if (this.animationEpoch !== startEpoch) {
          this.animatingTokens = false;
          return;
        }
        this.tokenCounts = newCounts;
        
        this.states.forEach(st => {
          const stateTokens = this.tokens.filter(t => t.stateId === st.id);
          stateTokens.forEach((tok, i) => {
            const angle = i * this.GOLDEN_ANGLE;
            const spacing = (this.coupledMode && !tok.isOrange) ? this.COUPLED_TOKEN_SPACING : this.TOKEN_SPACING;
            const r = spacing * Math.sqrt(i);
            const x = st.x + r * Math.cos(angle);
            const y = st.y + r * Math.sin(angle);
            tok.elt.setAttribute('transform', `translate(${x},${y})`);
          });
        });
        
        this.animatingTokens = false;
        this.render();
      });
      
    } else {
      if (this.tokenStateId === null) return;
      this.animatingTokens = true;
      
      const outs = this.edges.filter(e => e.from === this.tokenStateId);
      const probs = outs.map(e => parseFloat(e.weight));
      const r = Math.random();
      let cum = 0, next = null;
      for (let i = 0; i < outs.length; i++) {
        cum += probs[i];
        if (r <= cum) {
          next = outs[i];
          break;
        }
      }
      
      if (next && this.tokens[0]) {
        const startEpoch = this.animationEpoch;
        this.animateTokenClusterAlongEdge([this.tokens[0]], next, this.stepDelay, (canceled) => {
          if (canceled || this.animationEpoch !== startEpoch) {
            this.animatingTokens = false;
            return;
          }
          const prevStateId = this.tokenStateId;
          this.tokenStateId = next.to;
          this.visits[this.tokenStateId] = (this.visits[this.tokenStateId] || 0) + 1;

          // Sample-proof tracking: count arrivals into target, by where we came from
          if (this.sampleProofMode && this.proofTargetStateId != null && this.tokenStateId === this.proofTargetStateId) {
            if (!this.proofIncomingCounts) this.proofIncomingCounts = {};
            this.proofIncomingCounts[prevStateId] = (this.proofIncomingCounts[prevStateId] || 0) + 1;
            this.proofTotalArrivals = (this.proofTotalArrivals || 0) + 1;
          }

          this.animatingTokens = false;
          this.render();
        });
      } else {
        this.animatingTokens = false;
      }
    }
  }

  // Convert coupled-sample-split mode to triple cluster deterministic distribution
  convertSampleSplitToTripleClusters(meetBlackId, meetGreenId) {
    const meetId = meetGreenId;
    this.cancelAnimations();
    this.coupledSampleSplitMode = false;
    this.coupledSampleMode = false;
    this.sampleProofMode = false;
    this.distributionMode = false;
    this.coupledMode = false;
    this.tripleClusterMode = true;
    this.tokensLayer.innerHTML = '';
    this.showTokensLayer();
    this.blackTokens = [];
    this.orangeTokens = [];
    this.greenClusterTokens = [];
    this.coupledTokens.clear();

    const totalPerCluster = this.COUPLED_TOTAL_TOKENS || this.TOTAL_TOKENS;
    for (let i = 0; i < totalPerCluster; i++) {
      const c = this.svgEl('circle', { r: 1.5, fill: '#000' });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.blackTokens.push({ stateId: meetId, elt: c });
    }
    for (let i = 0; i < totalPerCluster; i++) {
      const c = this.svgEl('circle', { r: 1.5, fill: '#ff922b', stroke: '#f76707', 'stroke-width': 1 });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.orangeTokens.push({ stateId: meetId, elt: c });
    }
    for (let i = 0; i < totalPerCluster; i++) {
      const c = this.svgEl('circle', { r: 1.5, fill: '#51cf66', stroke: '#37b24d', 'stroke-width': 1 });
      c.classList.add('token');
      this.tokensLayer.appendChild(c);
      this.greenClusterTokens.push({ stateId: meetId, elt: c, isGreenCluster: true });
    }

    this.positionTokensAtState(this.blackTokens, meetId);
    this.positionTokensAtState(this.orangeTokens, meetId);
    this.positionTokensAtState(this.greenClusterTokens, meetId);
    this.positionTripleClustersSideBySide();
    this.render();
  }

  // Markov mode
  enterMarkovMode() {
    this.markovMode = true;
    const rnd = this.states[Math.floor(Math.random() * this.states.length)];
    this.tokenStateId = rnd.id;
    this.visits = {};
    this.states.forEach(s => this.visits[s.id] = 0);
    this.visits[this.tokenStateId] = 1;
    this.distributionMode = false;
    this.sampleProofMode = false;
    this.resetTokens(1, this.tokenStateId);
    
    this.addingEdge = false;
    this.selectedStates = [];
    this.editingEdgeId = null;
    this.draggedState = null;
    this.draggedControl = null;
    this.contextMenuState = null;
    
    this.render();
  }

  exitMarkovMode() {
    this.markovMode = false;
    this.cancelAnimations();
    this.tokenCounts = {};
    this.tokensLayer.classList.add('hidden');
    this.render();
  }

  // Enable/disable Sample-Proof mode (single token sampling with arrival tracking into a target state)
  setSampleProofMode(enabled, targetStateId) {
    this.sampleProofMode = !!enabled;
    if (!enabled) {
      // Turn off only the flag; keep sample state intact
      this.render();
      return;
    }
    this.distributionMode = false;
    this.coupledMode = false;
    this.coupledSampleMode = false;
    this.coupledSampleSplitMode = false;
    this.tripleClusterMode = false;
    this.cancelAnimations();
    this.showTokensLayer();
    // Ensure a valid start state
    const startId = this.tokenStateId || (this.states[0] ? this.states[0].id : null);
    if (startId != null) {
      this.resetTokens(1, startId);
    }
    // Set target and clear counts
    const tgt = targetStateId || (this.states[0] ? this.states[0].id : null);
    this.setProofTargetState(tgt, true);
    this.render();
  }

  // Change which state to track arrivals into
  setProofTargetState(stateId, resetCounts = true) {
    this.proofTargetStateId = stateId || null;
    if (resetCounts) {
      this.resetSampleProofCounts();
    }
    this.render();
  }

  // Zero out arrival counts
  resetSampleProofCounts() {
    this.proofIncomingCounts = {};
    this.proofTotalArrivals = 0;
  }

  setDistributionMode(enabled) {
    this.distributionMode = enabled;
    this.coupledMode = false;
    this.coupledSampleMode = false;
    this.sampleProofMode = false;
    this.coupledSampleSplitMode = false;
    this.tripleClusterMode = false;
    this.cancelAnimations();
    // Ensure there is a valid start state for distribution mode
    const startId = this.tokenStateId || (this.states[0] ? this.states[0].id : null);
    if (enabled) {
      this.resetTokens(this.TOTAL_TOKENS, startId);
    } else {
      this.resetTokens(1, startId);
    }
    this.render();
  }

  setCoupledMode(enabled) {
    this.coupledMode = enabled;
    this.distributionMode = false;
    this.coupledSampleMode = false;
    this.sampleProofMode = false;
    this.coupledSampleSplitMode = false;
    this.tripleClusterMode = false;
    this.cancelAnimations();
    if (enabled) {
      this.showTokensLayer();
      const defaultState = this.tokenStateId || (this.states[0] ? this.states[0].id : null);
      if (defaultState) {
        this.resetCoupledTokens(defaultState, defaultState);
      }
    } else {
      this.resetTokens(1, this.tokenStateId);
    }
    this.render();
  }

  setCoupledSampleMode(enabled, blackStartId, greenStartId) {
    if (!enabled) {
      // Disable only the coupled-sample flag; do not disturb other modes or tokens
      this.coupledSampleMode = false;
      this.sampleProofMode = false;
      this.coupledSampleSplitMode = false;
      this.tripleClusterMode = false;
      this.render();
      return;
    }

    this.coupledSampleMode = true;
    this.coupledMode = false;
    this.distributionMode = false;
    this.sampleProofMode = false;
    this.coupledSampleSplitMode = false;
    this.tripleClusterMode = false;
    this.cancelAnimations();
    this.tokensLayer.innerHTML = '';
    this.showTokensLayer();
    this.blackTokens = [];
    this.greenToken = null;
    this.coupledTokens.clear();
    this.sampleBlackToken = null;
    this.sampleGreenToken = null;
    this.sampleOrangeToken = null;
    this.coupledSampleFollowsGreen = false;

    if (true) {
      const defaultState = this.tokenStateId || (this.states[0] ? this.states[0].id : null);
      const bId = blackStartId || defaultState;
      const gId = greenStartId || defaultState;
      const bState = this.states.find(s => s.id === bId);
      const gState = this.states.find(s => s.id === gId);
      if (!bState || !gState) return;

      // Create tokens: large black, large green, medium orange
      const blackCircle = this.svgEl('circle', { r: 13, fill: '#000' });
      blackCircle.classList.add('token');
      this.tokensLayer.appendChild(blackCircle);
      this.sampleBlackToken = { stateId: bId, elt: blackCircle };

      // Coupled-sample green: solid fill, with darker border (no transparency)
      const greenCircle = this.svgEl('circle', { r: 13, fill: '#51cf66', stroke: '#37b24d', 'stroke-width': 2 });
      greenCircle.classList.add('token');
      this.tokensLayer.appendChild(greenCircle);
      this.sampleGreenToken = { stateId: gId, elt: greenCircle };

      // Orange same size as black, with darker border
      const orangeCircle = this.svgEl('circle', { r: 13, fill: '#ff922b', stroke: '#f76707', 'stroke-width': 2 });
      orangeCircle.classList.add('token');
      this.tokensLayer.appendChild(orangeCircle);
      this.sampleOrangeToken = { stateId: bId, elt: orangeCircle };

      // Position tokens with slight offset when co-located
      this.positionCoupledSampleTokens();
      // If orange starts at same state as green, couple from time 0 (latch orange to green)
      if (bId === gId) {
        this.coupledSampleFollowsGreen = true;
      } else {
        this.coupledSampleFollowsGreen = false;
      }
    }
    this.render();
  }

  // Enable/disable Coupled-Sample-Split mode (start with 3 sample tokens, then split to clusters on first meeting)
  setCoupledSampleSplitMode(enabled, blackStartId, greenStartId) {
    if (!enabled) {
      this.coupledSampleSplitMode = false;
      this.coupledSampleMode = false;
      this.tripleClusterMode = false;
      this.render();
      return;
    }

    this.coupledSampleSplitMode = true;
    this.coupledSampleMode = false;
    this.coupledMode = false;
    this.distributionMode = false;
    this.sampleProofMode = false;
    this.tripleClusterMode = false;
    this.cancelAnimations();
    this.tokensLayer.innerHTML = '';
    this.showTokensLayer();
    this.blackTokens = [];
    this.greenToken = null;
    this.coupledTokens.clear();
    this.sampleBlackToken = null;
    this.sampleGreenToken = null;
    this.sampleOrangeToken = null;
    this.coupledSampleFollowsGreen = false;

    const defaultState = this.tokenStateId || (this.states[0] ? this.states[0].id : null);
    const bId = blackStartId || defaultState;
    const gId = greenStartId || defaultState;
    const bState = this.states.find(s => s.id === bId);
    const gState = this.states.find(s => s.id === gId);
    if (!bState || !gState) return;

    const blackCircle = this.svgEl('circle', { r: 13, fill: '#000' });
    blackCircle.classList.add('token');
    this.tokensLayer.appendChild(blackCircle);
    this.sampleBlackToken = { stateId: bId, elt: blackCircle };

    const orangeCircle = this.svgEl('circle', { r: 13, fill: '#ff922b', stroke: '#f76707', 'stroke-width': 2 });
    orangeCircle.classList.add('token');
    this.tokensLayer.appendChild(orangeCircle);
    this.sampleOrangeToken = { stateId: bId, elt: orangeCircle };

    const greenCircle = this.svgEl('circle', { r: 13, fill: '#51cf66', stroke: '#37b24d', 'stroke-width': 2 });
    greenCircle.classList.add('token');
    this.tokensLayer.appendChild(greenCircle);
    this.sampleGreenToken = { stateId: gId, elt: greenCircle };

    this.positionCoupledSampleTokens();
    this.coupledSampleFollowsGreen = (bId === gId);
    this.render();
  }

  // Validation
  validateMarkov() {
    const labels = this.states.map(s => s.label.trim());
    if (new Set(labels).size !== labels.length) {
      alert('All states must have unique names.');
      return false;
    }
    for (const st of this.states) {
      const outs = this.edges.filter(e => e.from === st.id);
      if (!outs.length) {
        alert(`State "${st.label}" has no outgoing edges.`);
        return false;
      }
      const sum = outs.reduce((a, e) => a + parseFloat(e.weight), 0);
      if (Math.abs(sum - 1) > 1e-6) {
        alert(`"${st.label}" outgoing sum ${sum.toFixed(3)}.`);
        return false;
      }
    }
    return true;
  }

  // Configuration
  getConfig() {
    return JSON.parse(JSON.stringify({ states: this.states, edges: this.edges }));
  }

  loadConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.states) || !Array.isArray(cfg.edges)) {
      throw new Error('Invalid config');
    }
    this.states = cfg.states;
    this.edges = cfg.edges;
    this.exitMarkovMode();
    this.addingEdge = false;
    this.selectedStates = [];
    this.render();
  }

  // Mouse handling
  handleMouseMove(e) {
    if (this.markovMode || this.animatingTokens || this.isViewerMode) return;
    if (!this.draggedState && !this.draggedControl) return;
    
    const p = this.svgPoint(e);
    if (this.draggedState) {
      const oldState = this.states.find(s => s.id === this.draggedState.id);
      const newX = p.x - this.draggedState.offsetX;
      const newY = p.y - this.draggedState.offsetY;
      const deltaX = newX - oldState.x;
      const deltaY = newY - oldState.y;

      // Update dragged state's position
      this.states = this.states.map(s =>
        s.id === this.draggedState.id
          ? { ...s, x: newX, y: newY }
          : s
      );

      const draggedId = this.draggedState.id;
      // Adjust connected edges' control points to move naturally with the state
      this.edges = this.edges.map(ed => {
        // Self-loop: translate control by the same delta
        if (ed.from === draggedId && ed.to === draggedId) {
          return { ...ed, controlX: ed.controlX + deltaX, controlY: ed.controlY + deltaY };
        }

        // Non-self edge connected to the dragged state: preserve control point
        // in the local (tangent/normal) frame of the segment as the endpoints move
        if (ed.from === draggedId || ed.to === draggedId) {
          // Old endpoints
          const otherId = (ed.from === draggedId) ? ed.to : ed.from;
          const otherState = this.states.find(s => s.id === otherId);
          const oldFromX = (ed.from === draggedId) ? oldState.x : otherState.x;
          const oldFromY = (ed.from === draggedId) ? oldState.y : otherState.y;
          const oldToX   = (ed.to   === draggedId) ? oldState.x : otherState.x;
          const oldToY   = (ed.to   === draggedId) ? oldState.y : otherState.y;

          const oldDx = oldToX - oldFromX;
          const oldDy = oldToY - oldFromY;
          const oldDist = Math.hypot(oldDx, oldDy) || 1;
          const uxOld = oldDx / oldDist;
          const uyOld = oldDy / oldDist;
          const nxOld = -uyOld;
          const nyOld = uxOld;
          const oldMidX = (oldFromX + oldToX) / 2;
          const oldMidY = (oldFromY + oldToY) / 2;
          const offX = ed.controlX - oldMidX;
          const offY = ed.controlY - oldMidY;
          const alpha = offX * uxOld + offY * uyOld; // tangential component
          const beta  = offX * nxOld + offY * nyOld; // normal component

          // New endpoints after drag
          const fromStateNew = this.states.find(s => s.id === ed.from);
          const toStateNew   = this.states.find(s => s.id === ed.to);
          const newDx = toStateNew.x - fromStateNew.x;
          const newDy = toStateNew.y - fromStateNew.y;
          const newDist = Math.hypot(newDx, newDy) || 1;
          const uxNew = newDx / newDist;
          const uyNew = newDy / newDist;
          const nxNew = -uyNew;
          const nyNew = uxNew;
          const newMidX = (fromStateNew.x + toStateNew.x) / 2;
          const newMidY = (fromStateNew.y + toStateNew.y) / 2;

          const newCX = newMidX + alpha * uxNew + beta * nxNew;
          const newCY = newMidY + alpha * uyNew + beta * nyNew;
          return { ...ed, controlX: newCX, controlY: newCY };
        }
        return ed;
      });
    }
    if (this.draggedControl) {
      this.edges = this.edges.map(ed =>
        ed.id === this.draggedControl.id
          ? { ...ed, controlX: p.x - this.draggedControl.offsetX, controlY: p.y - this.draggedControl.offsetY }
          : ed
      );
    }
    this.render();
  }

  handleMouseUp() {
    this.draggedState = null;
    this.draggedControl = null;
  }

  handleCanvasClick() {
    this.contextMenuState = null;
    this.render();
  }

  setStepDelay(delay) {
    this.stepDelay = delay;
  }

  showTokensLayer() {
    this.tokensLayer.classList.remove('hidden');
  }

  hideTokensLayer() {
    this.tokensLayer.classList.add('hidden');
  }

  // ---- Stationary distribution and utilities ----
  computeStationaryDistribution(maxIters = 5000, tol = 1e-5) {
    const n = this.states.length;
    if (n === 0) return [];
    const idToIndex = new Map();
    this.states.forEach((s, i) => idToIndex.set(s.id, i));
    // Build row-stochastic matrix P where P[i][j] = Pr(i->j)
    const P = Array.from({ length: n }, () => Array(n).fill(0));
    this.states.forEach((st, i) => {
      const outs = this.edges.filter(e => e.from === st.id);
      if (outs.length === 0) {
        // If no outgoing edges, make self-loop to avoid undefined behavior
        P[i][i] = 1;
      } else {
        outs.forEach(e => {
          const j = idToIndex.get(e.to);
          const w = parseFloat(e.weight);
          if (Number.isFinite(j) && Number.isFinite(w)) {
            P[i][j] += w;
          }
        });
      }
    });
    // Power iteration on row vector pi: pi_{k+1} = pi_k * P
    let pi = Array(n).fill(1 / n);
    for (let it = 0; it < maxIters; it++) {
      const next = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = 0; j < n; j++) {
          acc += pi[j] * P[j][i];
        }
        next[i] = acc;
      }
      // Normalize (guard against drift)
      const sum = next.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < n; i++) next[i] /= sum;
      // Check convergence (L1)
      let diff = 0;
      for (let i = 0; i < n; i++) diff += Math.abs(next[i] - pi[i]);
      pi = next;
      if (diff < tol) break;
    }
    return pi;
  }

  sampleGreenFromStationary() {
    const n = this.states.length;
    if (n === 0) return;
    const pi = this.computeStationaryDistribution();
    if (!pi || pi.length !== n) return;
    // Sample index based on pi
    const r = Math.random();
    let cum = 0, idx = 0;
    for (; idx < n; idx++) {
      cum += pi[idx];
      if (r <= cum) break;
    }
    const targetId = this.states[Math.min(idx, n - 1)].id;

    if (this.coupledMode) {
      if (!this.greenToken) return;
      this.greenToken.stateId = targetId;
      this.greenTokenStateId = targetId;
      this.positionTokensAtState([this.greenToken], targetId);
      // Couple orange tokens at t=0 if co-located
      if (Array.isArray(this.orangeTokens)) {
        this.orangeTokens.forEach(t => { t.coupled = (t.stateId === targetId); });
      }
      this.render();
    } else if (this.coupledSampleMode || this.coupledSampleSplitMode) {
      if (this.sampleGreenToken) {
        this.sampleGreenToken.stateId = targetId;
        this.positionTokensAtState([this.sampleGreenToken], targetId);
      }
      // Latch orange to green if all three coincide
      const allSame = (this.sampleBlackToken && this.sampleOrangeToken && this.sampleBlackToken.stateId === targetId && this.sampleOrangeToken.stateId === targetId);
      this.coupledSampleFollowsGreen = !!allSame;
      this.positionCoupledSampleTokens();
      this.render();
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkovChains;
}