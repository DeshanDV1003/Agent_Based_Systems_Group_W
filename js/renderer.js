/**
 * renderer.js — Canvas 2D Rendering Layer
 * Draws the warehouse grid, robots, heatmap, trails, and tooltips.
 */

// ─── Display Settings ─────────────────────────────────────────────────────────
let showHeatmap = false;
let showTrails = true;
let showLabels = true;
let showGrid = true;

// ─── Canvas References ────────────────────────────────────────────────────────
let canvas, ctx;
let cellW, cellH;
let hoveredCell = null;
let selectedRobotId = null;

// ─── Cell Visual Palette ──────────────────────────────────────────────────────
const CELL_BG = {
  aisle:    '#131929',
  shelf:    '#3d1f08',
  packing:  '#0d3018',
  charger:  '#2d2200',
  obstacle: '#1e1e1e',
};

const CELL_ACCENT = {
  aisle:    '#1a2235',
  shelf:    '#6b3f1f',
  packing:  '#1a5c2a',
  charger:  '#5c4a00',
  obstacle: '#2a2a2a',
};

const STATE_COLOR = {
  fetch:   '#6c63ff',
  deliver: '#ff4d6d',
  charge:  '#ff9500',
};

// ─── Renderer Initialisation ──────────────────────────────────────────────────
function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  computeCellSize();

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasHover);
  canvas.addEventListener('mouseleave', () => { hoveredCell = null; });
}

function computeCellSize() {
  if (!canvas) return;
  cellW = canvas.width / GRID_COLS;
  cellH = canvas.height / GRID_ROWS;
}

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  computeCellSize();
}

// ─── Input Handlers ───────────────────────────────────────────────────────────
function onCanvasClick(e) {
  const { gx, gy } = getGridCoords(e);
  let found = null, minD = 1.2;

  robots.forEach(r => {
    const d = dist(r.x, r.y, gx, gy);
    if (d < minD) { minD = d; found = r; }
  });

  robots.forEach(r => (r.selected = false));
  if (found) {
    found.selected = true;
    selectedRobotId = found.id;
    if (typeof updateRobotInspector === 'function') updateRobotInspector(found);
  } else {
    selectedRobotId = null;
    if (typeof clearRobotInspector === 'function') clearRobotInspector();
  }
}

function onCanvasHover(e) {
  const { col, row } = getCellCoords(e);
  if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
    hoveredCell = { col, row };
  } else {
    hoveredCell = null;
  }
}

function getGridCoords(e) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return { gx: 0, gy: 0 };
  return {
    gx: ((e.clientX - r.left) / r.width) * GRID_COLS,
    gy: ((e.clientY - r.top) / r.height) * GRID_ROWS,
  };
}

function getCellCoords(e) {
  const { gx, gy } = getGridCoords(e);
  return { col: Math.floor(gx), row: Math.floor(gy) };
}

// ─── Master Render ────────────────────────────────────────────────────────────
function render() {
  if (!ctx || !grid.length) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawCells();
  if (showHeatmap) drawHeatmap();
  if (showTrails) drawTrails();
  drawRobots();
  if (hoveredCell) drawTooltip();
}

// ─── Draw Grid Cells ──────────────────────────────────────────────────────────
function drawCells() {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = grid[row][col];
      const x = col * cellW;
      const y = row * cellH;

      // Base fill
      ctx.fillStyle = CELL_BG[cell.type] || '#131929';
      ctx.fillRect(x, y, cellW, cellH);

      // Accent fill (gradient-like)
      ctx.fillStyle = CELL_ACCENT[cell.type] || '#1a2235';
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // Thin grid line
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellW, cellH);
      }

      drawCellContent(cell, x, y);
    }
  }
}

function drawCellContent(cell, x, y) {
  const pad = cellW * 0.12;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (cell.type === 'shelf') {
    // Shelf rack lines
    ctx.fillStyle = 'rgba(139,90,43,0.5)';
    ctx.fillRect(x + pad, y + cellH * 0.15, cellW - pad * 2, 2);
    ctx.fillRect(x + pad, y + cellH * 0.55, cellW - pad * 2, 2);

    // Item boxes
    if (cell.itemCount > 0) {
      const boxW = Math.min((cellW - pad * 2) / 5, 12);
      for (let i = 0; i < Math.min(cell.itemCount, 5); i++) {
        const bx = x + pad + i * (boxW + 1);
        const by = y + cellH * 0.22;
        ctx.fillStyle = `hsl(${30 + i * 10},70%,${45 + i * 3}%)`;
        ctx.fillRect(bx, by, boxW, boxW);
      }
    }

    // Count badge
    if (cellW > 14) {
      ctx.fillStyle = cell.itemCount > 0 ? '#e8c887' : '#555';
      ctx.font = `bold ${Math.max(7, cellW * 0.28)}px Inter, sans-serif`;
      ctx.fillText(cell.itemCount, x + cellW / 2, y + cellH * 0.8);
    }
  }

  else if (cell.type === 'packing') {
    // Conveyor belt strips
    ctx.fillStyle = 'rgba(0,200,81,0.25)';
    ctx.fillRect(x + pad, y + cellH * 0.35, cellW - pad * 2, cellH * 0.3);
    ctx.strokeStyle = 'rgba(0,200,81,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const lx = x + pad + i * ((cellW - pad * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(lx, y + cellH * 0.35);
      ctx.lineTo(lx, y + cellH * 0.65);
      ctx.stroke();
    }
    if (cellW > 14 && cell.itemsPacked > 0) {
      ctx.fillStyle = '#00c851';
      ctx.font = `bold ${Math.max(7, cellW * 0.28)}px Inter, sans-serif`;
      ctx.fillText(cell.itemsPacked, x + cellW / 2, y + cellH * 0.82);
    }
  }

  else if (cell.type === 'charger') {
    // Glowing yellow bolt
    const glow = ctx.createRadialGradient(
      x + cellW / 2, y + cellH / 2, 0,
      x + cellW / 2, y + cellH / 2, cellW * 0.6
    );
    glow.addColorStop(0, 'rgba(255,214,0,0.3)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, cellW, cellH);

    ctx.fillStyle = '#ffd700';
    ctx.font = `${Math.max(10, cellW * 0.55)}px sans-serif`;
    ctx.fillText('⚡', x + cellW / 2, y + cellH * 0.6);
  }

  else if (cell.type === 'obstacle') {
    ctx.strokeStyle = 'rgba(120,120,120,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + cellW - pad, y + cellH - pad);
    ctx.moveTo(x + cellW - pad, y + pad);
    ctx.lineTo(x + pad, y + cellH - pad);
    ctx.stroke();
  }
}

// ─── Heatmap Overlay ──────────────────────────────────────────────────────────
function drawHeatmap() {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const heat = grid[row][col].congestionHeat;
      if (heat < 0.5) continue;
      const alpha = Math.min(0.75, heat / 40);
      const r = Math.min(255, Math.round(heat * 5));
      const g = Math.max(0, Math.round(100 - heat * 2));
      ctx.fillStyle = `rgba(${r},${g},0,${alpha})`;
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }
}

// ─── Robot Trails ─────────────────────────────────────────────────────────────
function drawTrails() {
  robots.forEach(robot => {
    if (robot.trail.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(robot.trail[0].x * cellW, robot.trail[0].y * cellH);
    robot.trail.forEach(p => ctx.lineTo(p.x * cellW, p.y * cellH));
    const col = STATE_COLOR[robot.state] || '#6c63ff';
    ctx.strokeStyle = col + '30';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  });
}

// ─── Robot Drawing ────────────────────────────────────────────────────────────
function drawRobots() {
  robots.forEach(robot => drawSingleRobot(robot));
}

function drawSingleRobot(robot) {
  const rx = robot.x * cellW;
  const ry = robot.y * cellH;
  const radius = Math.max(4, Math.min(cellW, cellH) * 0.38);
  const col = STATE_COLOR[robot.state] || '#6c63ff';

  // Selection glow
  if (robot.selected) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(rx, ry, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Outer ring (carrying indicator)
  if (robot.carryingItem) {
    ctx.beginPath();
    ctx.arc(rx, ry, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff80';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Robot body
  const grad = ctx.createRadialGradient(rx - radius * 0.3, ry - radius * 0.3, 0, rx, ry, radius);
  grad.addColorStop(0, lightenColor(col, 40));
  grad.addColorStop(1, col);
  ctx.beginPath();
  ctx.arc(rx, ry, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Direction arrow
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(robot.angle) * radius * 1.1, ry + Math.sin(robot.angle) * radius * 1.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cargo dot
  if (robot.carryingItem) {
    ctx.beginPath();
    ctx.arc(rx, ry, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Battery micro-bar
  if (cellW > 14) {
    const bw = radius * 2;
    const bh = 3;
    const bx = rx - radius;
    const by = ry + radius + 3;
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(bx, by, bw, bh);
    const pct = robot.batteryLevel / params.batteryCapacity;
    ctx.fillStyle = pct > 0.5 ? '#00c851' : pct > 0.2 ? '#ff9500' : '#ff4d6d';
    ctx.fillRect(bx, by, bw * pct, bh);
  }

  // Robot ID label
  if (showLabels && cellW > 18) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(6, Math.min(cellW * 0.3, 10))}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(robot.id, rx, ry);
  }

  ctx.shadowBlur = 0;
}

// ─── Hover Tooltip ────────────────────────────────────────────────────────────
function drawTooltip() {
  if (!hoveredCell) return;
  const cell = grid[hoveredCell.row]?.[hoveredCell.col];
  if (!cell) return;

  const x = hoveredCell.col * cellW;
  const y = hoveredCell.row * cellH;

  const lines = [
    `📦 ${cell.type.toUpperCase()}`,
    cell.type === 'shelf'   ? `Items: ${cell.itemCount}`   : null,
    cell.type === 'packing' ? `Packed: ${cell.itemsPacked}` : null,
    `🔥 Heat: ${cell.congestionHeat.toFixed(1)}`,
    `📍 (${cell.col}, ${cell.row})`,
  ].filter(Boolean);

  const pad = 8, lh = 15, tw = 130;
  const th = lines.length * lh + pad * 2;
  let tx = x + cellW + 6;
  let ty = y;
  if (tx + tw > canvas.width) tx = x - tw - 6;
  if (ty + th > canvas.height) ty = canvas.height - th - 4;

  ctx.fillStyle = 'rgba(5,10,20,0.93)';
  ctx.strokeStyle = 'rgba(108,99,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 6);
  else ctx.rect(tx, ty, tw, th);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e0e0ff';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#a0a8ff' : '#c0c8e0';
    ctx.fillText(line, tx + pad, ty + pad + i * lh);
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}
