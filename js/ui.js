/**
 * ui.js — UI Controller
 * Binds sliders, buttons, monitors, scenario presets, keyboard shortcuts,
 * robot inspector, and simulation loop management.
 */

// ─── Loop State ───────────────────────────────────────────────────────────────
let simInterval = null;
let renderFrame = null;
const SIM_FPS = 30;

// ─── Scenario Configurations ──────────────────────────────────────────────────
const SCENARIOS = {
  1: { numRobots: 5,  robotSpeed: 1, batteryCapacity: 100, lowBatteryThreshold: 20, numObstacles: 5,  restockRate: 30, label: 'S1: Light Load'   },
  2: { numRobots: 15, robotSpeed: 1, batteryCapacity: 100, lowBatteryThreshold: 20, numObstacles: 15, restockRate: 30, label: 'S2: Medium Load'  },
  3: { numRobots: 30, robotSpeed: 1, batteryCapacity: 100, lowBatteryThreshold: 20, numObstacles: 20, restockRate: 30, label: 'S3: Peak Load'    },
};

// ─── Initialisation ───────────────────────────────────────────────────────────
function initUI() {
  initCanvas();
  bindSliders();
  bindButtons();
  bindToggles();
  bindScenarioButtons();
  bindSpeedButtons();
  bindKeyboard();
  bindExportButtons();
  initCharts();
  handleSetup();
  startRenderLoop();
  updateThemeToggle();
}

function initCanvas() {
  const cvs = document.getElementById('warehouse-canvas');
  if (!cvs) return;
  resizeCanvasToContainer(cvs);
  initRenderer(cvs);

  window.addEventListener('resize', () => {
    resizeCanvasToContainer(cvs);
    render();
  });
}

function resizeCanvasToContainer(cvs) {
  const container = cvs.parentElement;
  cvs.width  = container.clientWidth  || 800;
  cvs.height = container.clientHeight || 560;
  computeCellSize();
}

// ─── Slider Binding ───────────────────────────────────────────────────────────
const SLIDER_MAP = [
  { id: 'num-robots',              key: 'numRobots',             fmt: v => Math.round(v) },
  { id: 'robot-speed',             key: 'robotSpeed',            fmt: v => v.toFixed(1)  },
  { id: 'battery-capacity',        key: 'batteryCapacity',       fmt: v => Math.round(v) },
  { id: 'low-battery-threshold',   key: 'lowBatteryThreshold',   fmt: v => Math.round(v) },
  { id: 'num-obstacles',           key: 'numObstacles',          fmt: v => Math.round(v) },
  { id: 'restock-rate',            key: 'restockRate',           fmt: v => Math.round(v) },
];

function bindSliders() {
  SLIDER_MAP.forEach(({ id, key, fmt }) => {
    const slider  = document.getElementById(id);
    const display = document.getElementById(id + '-val');
    if (!slider) return;

    const update = () => {
      const v = parseFloat(slider.value);
      params[key] = v;
      if (display) display.textContent = fmt(v);
    };
    slider.addEventListener('input', update);
    update(); // set initial
  });
}

function syncSlidersFromParams() {
  SLIDER_MAP.forEach(({ id, key, fmt }) => {
    const slider  = document.getElementById(id);
    const display = document.getElementById(id + '-val');
    if (!slider) return;
    slider.value = params[key];
    if (display) display.textContent = fmt(params[key]);
  });
}

// ─── Button Binding ───────────────────────────────────────────────────────────
function bindButtons() {
  const btn = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  btn('btn-setup',  handleSetup);
  btn('btn-go',     handleGo);
  btn('btn-pause',  handlePause);
  btn('btn-step',   handleStep);
  btn('btn-reset',  handleSetup);
}

// ─── Toggle Binding ───────────────────────────────────────────────────────────
function bindToggles() {
  const tog = (id, setter) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => setter(el.checked));
    setter(el.checked); // init
  };
  tog('toggle-heatmap', v => { showHeatmap = v; });
  tog('toggle-trails',  v => { showTrails  = v; });
  tog('toggle-labels',  v => { showLabels  = v; });
  tog('toggle-grid',    v => { showGrid    = v; });
}

// ─── Speed Buttons ────────────────────────────────────────────────────────────
function bindSpeedButtons() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      speedMultiplier = parseFloat(btn.dataset.speed);
      if (running) { stopSimLoop(); startSimLoop(); } // restart at new speed
    });
  });
}

// ─── Scenario Buttons ─────────────────────────────────────────────────────────
function bindScenarioButtons() {
  [1, 2, 3].forEach(n => {
    document.getElementById(`scenario-${n}`)?.addEventListener('click', () => loadScenario(n));
  });
}

function loadScenario(n) {
  const s = SCENARIOS[n];
  if (!s) return;
  Object.assign(params, s);
  syncSlidersFromParams();
  document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`scenario-${n}`)?.classList.add('active');
  showToast(`Loaded ${s.label}`, 'info');
  handleSetup();
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); running ? handlePause() : handleGo(); break;
      case 'KeyR':  handleSetup(); break;
      case 'KeyS':  handleStep();  break;
      case 'KeyH':  toggleEl('toggle-heatmap'); break;
      case 'KeyT':  toggleEl('toggle-trails');  break;
      case 'Digit1': loadScenario(1); break;
      case 'Digit2': loadScenario(2); break;
      case 'Digit3': loadScenario(3); break;
    }
  });
}

function toggleEl(id) {
  const el = document.getElementById(id);
  if (el) { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
}

// ─── Export Buttons ───────────────────────────────────────────────────────────
function bindExportButtons() {
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const csv = exportCSV();
    downloadBlob(csv, `warehouse_data_${ticks}ticks.csv`, 'text/csv');
    showToast('CSV exported!', 'success');
  });

  document.getElementById('btn-export-img')?.addEventListener('click', () => {
    const cvs = document.getElementById('warehouse-canvas');
    if (!cvs) return;
    cvs.toBlob(blob => downloadBlob(blob, `warehouse_snapshot_t${ticks}.png`));
    showToast('Snapshot saved!', 'success');
  });

  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    const data = JSON.stringify({ params, metrics: getMetrics(), history }, null, 2);
    downloadBlob(data, `warehouse_session_${Date.now()}.json`, 'application/json');
    showToast('JSON exported!', 'success');
  });
}

function downloadBlob(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Simulation Control ───────────────────────────────────────────────────────
function handleSetup() {
  stopSimLoop();
  running = false;
  setup();
  resetCharts();
  render();
  updateMonitors();
  updateButtonStates();
  clearRobotInspector();
  showToast('Warehouse initialized!', 'info');
}

function handleGo() {
  if (!grid.length) handleSetup();
  running = true;
  updateButtonStates();
  startSimLoop();
}

function handlePause() {
  running = false;
  stopSimLoop();
  updateButtonStates();
}

function handleStep() {
  if (!grid.length) handleSetup();
  tick();
  updateMonitors();
  updateCharts();
  render();
}

// ─── Simulation Loop ──────────────────────────────────────────────────────────
function startSimLoop() {
  stopSimLoop();
  const stepsPerInterval = Math.max(1, Math.round(speedMultiplier));
  simInterval = setInterval(() => {
    if (!running) { stopSimLoop(); return; }
    for (let i = 0; i < stepsPerInterval; i++) tick();
    updateMonitors();
    if (ticks % 3 === 0) updateCharts();
    // Update selected robot inspector live
    if (selectedRobotId !== null) {
      const r = robots.find(r => r.id === selectedRobotId);
      if (r) updateRobotInspector(r);
    }
  }, 1000 / SIM_FPS);
}

function stopSimLoop() {
  if (simInterval) { clearInterval(simInterval); simInterval = null; }
}

function startRenderLoop() {
  const loop = () => {
    render();
    renderFrame = requestAnimationFrame(loop);
  };
  renderFrame = requestAnimationFrame(loop);
}

// ─── Monitor Updates ──────────────────────────────────────────────────────────
function updateMonitors() {
  const m = getMetrics();
  setText('monitor-delivered',  m.totalItemsDelivered);
  setText('monitor-battery',    m.avgBattery + '%');
  setText('monitor-collisions', m.totalCollisionsAvoided);
  setText('monitor-charging',   m.robotsCharging);
  setText('monitor-ticks',      m.ticks);
  setText('monitor-efficiency', m.efficiency + '%');
  setText('monitor-fetching',   m.robotsFetching);
  setText('monitor-delivering', m.robotsDelivering);

  // Battery mini-progress bar
  const barEl = document.getElementById('avg-battery-bar');
  if (barEl && params.batteryCapacity) {
    const pct = (m.avgBattery / params.batteryCapacity) * 100;
    barEl.style.width = pct + '%';
    barEl.style.backgroundColor = pct > 50 ? '#00c851' : pct > 20 ? '#ff9500' : '#ff4d6d';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Button State Management ──────────────────────────────────────────────────
function updateButtonStates() {
  const goBtn    = document.getElementById('btn-go');
  const pauseBtn = document.getElementById('btn-pause');
  const statusEl = document.getElementById('sim-status');

  goBtn?.classList.toggle('active', running);
  pauseBtn?.classList.toggle('active', !running);

  if (statusEl) {
    statusEl.textContent = running ? '● RUNNING' : ticks > 0 ? '⏸ PAUSED' : '■ READY';
    statusEl.className = 'sim-status ' + (running ? 'running' : ticks > 0 ? 'paused' : 'ready');
  }
}

// ─── Robot Inspector ──────────────────────────────────────────────────────────
function updateRobotInspector(robot) {
  const panel = document.getElementById('robot-inspector');
  if (!panel) return;
  panel.style.display = 'block';

  setText('inspector-id',         `Robot #${robot.id}`);
  setText('inspector-state',      robot.state.toUpperCase());
  setText('inspector-battery',    `${Math.round(robot.batteryLevel)} / ${params.batteryCapacity}`);
  setText('inspector-tasks',      robot.taskCount);
  setText('inspector-collisions', robot.collisionsAvoided);
  setText('inspector-carrying',   robot.carryingItem ? '📦 Yes' : '✗ No');
  setText('inspector-pos',        `(${robot.x.toFixed(1)}, ${robot.y.toFixed(1)})`);
  setText('inspector-target',     robot.target
    ? `${robot.target.type} @ (${robot.target.col},${robot.target.row})`
    : '—');

  const barEl = document.getElementById('inspector-battery-bar');
  if (barEl) {
    const pct = (robot.batteryLevel / params.batteryCapacity) * 100;
    barEl.style.width = pct + '%';
    barEl.style.backgroundColor = pct > 50 ? '#00c851' : pct > 20 ? '#ff9500' : '#ff4d6d';
  }

  const stateEl = document.getElementById('inspector-state');
  if (stateEl) {
    stateEl.style.color = { fetch: '#6c63ff', deliver: '#ff4d6d', charge: '#ff9500' }[robot.state] || '#fff';
  }
}

function clearRobotInspector() {
  const panel = document.getElementById('robot-inspector');
  if (panel) panel.style.display = 'none';
  selectedRobotId = null;
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ─── Dark / Light Theme ───────────────────────────────────────────────────────
function updateThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    btn.textContent = document.body.classList.contains('light-theme') ? '🌙' : '☀️';
  });
}
