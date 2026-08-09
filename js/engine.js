/**
 * engine.js — Warehouse Robot Simulation Core
 * Implements all NetLogo logic: patches, robots, tick loop, battery, collision
 */

// ─── World Dimensions ────────────────────────────────────────────────────────
const GRID_COLS = 40;
const GRID_ROWS = 28;

// ─── Simulation State ────────────────────────────────────────────────────────
let grid = [];
let robots = [];
let ticks = 0;
let running = false;
let nextRobotId = 0;

// ─── Global Counters (NetLogo globals) ────────────────────────────────────────
let totalItemsDelivered = 0;
let totalCollisionsAvoided = 0;

// ─── Simulation Parameters (bound to sliders) ────────────────────────────────
let params = {
  numRobots: 10,
  robotSpeed: 1.0,
  batteryCapacity: 100,
  lowBatteryThreshold: 20,
  numObstacles: 10,
  restockRate: 30,
  enableComms: false,
};

// ─── Speed Multiplier ─────────────────────────────────────────────────────────
let speedMultiplier = 1;

// ─── History (for charts) ─────────────────────────────────────────────────────
let history = {
  ticks: [],
  itemsDelivered: [],
  avgBattery: [],
  collisionsAvoided: [],
  robotsCharging: [],
};

// ─── Scenario Results Storage ────────────────────────────────────────────────
let scenarioResults = {};

// ─── Grid Initialisation ──────────────────────────────────────────────────────
function initGrid() {
  grid = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      grid[row][col] = {
        type: 'aisle',
        col,
        row,
        itemCount: 0,
        restockTimer: 0,
        itemsPacked: 0,
        congestionHeat: 0,
      };
    }
  }
}

// ─── Layout Builder ───────────────────────────────────────────────────────────
function setupLayout() {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = grid[row][col];

      // Shelves: left zone, every 3rd row
      if (col < 8 && row % 3 === 0) {
        cell.type = 'shelf';
        cell.itemCount = 5;
      }
      // Packing stations: right zone, every 4th row
      else if (col >= GRID_COLS - 8 && row % 4 === 0) {
        cell.type = 'packing';
      }
      // Charging stations: centre column, top and bottom rows
      else if (
        col === Math.floor(GRID_COLS / 2) &&
        (row < 2 || row >= GRID_ROWS - 2)
      ) {
        cell.type = 'charger';
      }
    }
  }

  // Random obstacles scattered through aisles
  const aisles = getAllOfType('aisle');
  const shuffled = aisles.sort(() => Math.random() - 0.5);
  const count = Math.min(params.numObstacles, shuffled.length - params.numRobots * 2);
  for (let i = 0; i < count; i++) {
    shuffled[i].type = 'obstacle';
  }
}

// ─── Query Helpers ────────────────────────────────────────────────────────────
function getAllOfType(type) {
  const result = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (grid[row][col].type === type) result.push(grid[row][col]);
    }
  }
  return result;
}

function getShelvesWithItems() {
  const result = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const c = grid[row][col];
      if (c.type === 'shelf' && c.itemCount > 0) result.push(c);
    }
  }
  return result;
}

function getCell(col, row) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return grid[row][col];
}

// ─── Distance Utilities ───────────────────────────────────────────────────────
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function distToCell(x, y, cell) {
  return dist(x, y, cell.col + 0.5, cell.row + 0.5);
}

function nearestOf(cells, x, y) {
  if (!cells || cells.length === 0) return null;
  return cells.reduce((best, cell) =>
    distToCell(x, y, cell) < distToCell(x, y, best) ? cell : best
  );
}

// ─── Robot Factory ────────────────────────────────────────────────────────────
function createRobot() {
  const aisles = getAllOfType('aisle');
  if (aisles.length === 0) return null;
  const aisle = aisles[Math.floor(Math.random() * aisles.length)];
  const shelves = getShelvesWithItems();

  return {
    id: nextRobotId++,
    x: aisle.col + 0.5,
    y: aisle.row + 0.5,
    angle: Math.random() * Math.PI * 2,
    batteryLevel: params.batteryCapacity,
    carryingItem: false,
    target: shelves.length > 0 ? nearestOf(shelves, aisle.col, aisle.row) : null,
    taskCount: 0,
    collisionsAvoided: 0,
    state: 'fetch',       // 'fetch' | 'deliver' | 'charge'
    trail: [],
    selected: false,
    stuckTimer: 0,
    color: '#6c63ff',     // display colour — updated each decide()
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
function setup() {
  ticks = 0;
  nextRobotId = 0;
  totalItemsDelivered = 0;
  totalCollisionsAvoided = 0;
  history = { ticks: [], itemsDelivered: [], avgBattery: [], collisionsAvoided: [], robotsCharging: [] };

  initGrid();
  setupLayout();

  robots = [];
  for (let i = 0; i < params.numRobots; i++) {
    const r = createRobot();
    if (r) robots.push(r);
  }
}

// ─── Robot Decision (Priority-based) ──────────────────────────────────────────
function robotDecide(robot) {
  // PRIORITY 1 — Battery critically low OR currently charging until full → go charge
  if (
    robot.batteryLevel < params.lowBatteryThreshold ||
    (robot.state === 'charge' && robot.batteryLevel < params.batteryCapacity)
  ) {
    const chargers = getAllOfType('charger');
    robot.target = nearestOf(chargers, robot.x, robot.y);
    robot.state = 'charge';
    robot.color = '#ff9500';
    return;
  }

  // PRIORITY 2 — Carrying item → go deliver
  if (robot.carryingItem) {
    const packing = getAllOfType('packing');
    robot.target = nearestOf(packing, robot.x, robot.y);
    robot.state = 'deliver';
    robot.color = '#ff4d6d';
    return;
  }

  // DEFAULT — Fetch nearest shelf with items
  const shelves = getShelvesWithItems();
  if (shelves.length > 0) {
    robot.target = nearestOf(shelves, robot.x, robot.y);
  } else {
    robot.target = null;
  }
  robot.state = 'fetch';
  robot.color = '#6c63ff';
}

// ─── Cone-of-Vision Check (NetLogo in-cone equivalent) ───────────────────────
function getRobotsInCone(robot, radius, halfAngle) {
  return robots.filter(other => {
    if (other.id === robot.id) return false;
    const dx = other.x - robot.x;
    const dy = other.y - robot.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > radius || d < 0.01) return false;
    const angleToOther = Math.atan2(dy, dx);
    let diff = angleToOther - robot.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= halfAngle;
  });
}

// ─── Robot Movement with Collision Avoidance ──────────────────────────────────
function robotMove(robot) {
  if (!robot.target) {
    // Idle wander
    robot.angle += (Math.random() - 0.5) * 0.3;
    return;
  }

  const tx = robot.target.col + 0.5;
  const ty = robot.target.row + 0.5;

  // Face the target (like NetLogo face)
  robot.angle = Math.atan2(ty - robot.y, tx - robot.x);

  // Cone vision: 1.5 radius, 60° half-angle
  const robotsAhead = getRobotsInCone(robot, 1.5, Math.PI / 3);

  // Next cell obstacle check
  const nextX = robot.x + Math.cos(robot.angle);
  const nextY = robot.y + Math.sin(robot.angle);
  const nextCell = getCell(Math.floor(nextX), Math.floor(nextY));
  const blocked = !nextCell || nextCell.type === 'obstacle';

  if (robotsAhead.length > 0 || blocked) {
    // Collision avoidance: turn 45–135° randomly (NetLogo: rt 45 + random 90)
    robot.angle += Math.PI / 4 + Math.random() * Math.PI / 2;
    robot.collisionsAvoided++;
    totalCollisionsAvoided++;
    robot.stuckTimer++;
  } else {
    // Clear path — move forward at robot-speed (emergency slow crawl at 0 battery)
    const speedMult = robot.batteryLevel <= 0 ? 0.2 : 1.0;
    const speed = params.robotSpeed * 0.12 * speedMult;
    const newX = robot.x + Math.cos(robot.angle) * speed;
    const newY = robot.y + Math.sin(robot.angle) * speed;
    const newCell = getCell(Math.floor(newX), Math.floor(newY));

    if (newCell && newCell.type !== 'obstacle') {
      robot.x = Math.max(0.1, Math.min(GRID_COLS - 0.1, newX));
      robot.y = Math.max(0.1, Math.min(GRID_ROWS - 0.1, newY));
      robot.stuckTimer = Math.max(0, robot.stuckTimer - 1);
    }
  }

  // Anti-stuck: teleport to nearby aisle if deeply stuck
  if (robot.stuckTimer > 60) {
    const aisles = getAllOfType('aisle');
    const nearby = aisles.filter(a => dist(a.col, a.row, robot.x, robot.y) < 6);
    const dest = nearby.length > 0
      ? nearby[Math.floor(Math.random() * nearby.length)]
      : aisles[Math.floor(Math.random() * aisles.length)];
    if (dest) { robot.x = dest.col + 0.5; robot.y = dest.row + 0.5; }
    robot.stuckTimer = 0;
  }

  // Battery drain every movement tick
  robot.batteryLevel = Math.max(0, robot.batteryLevel - 0.1);

  // Trail recording
  robot.trail.push({ x: robot.x, y: robot.y });
  if (robot.trail.length > 40) robot.trail.shift();

  // Congestion heat (NetLogo: ask patch-here [set congestion-heat ...])
  const here = getCell(Math.floor(robot.x), Math.floor(robot.y));
  if (here) here.congestionHeat = Math.min(200, here.congestionHeat + 1);
}

// ─── Robot Actions (pick-up, drop-off, charge) ────────────────────────────────
function robotAct(robot) {
  const here = getCell(Math.floor(robot.x), Math.floor(robot.y));
  if (!here) return;

  // PICK UP — on shelf, has items, not already carrying
  if (here.type === 'shelf' && here.itemCount > 0 && !robot.carryingItem) {
    here.itemCount--;
    robot.carryingItem = true;
  }

  // DROP OFF — on packing station, carrying item
  if (here.type === 'packing' && robot.carryingItem) {
    here.itemsPacked++;
    robot.carryingItem = false;
    robot.taskCount++;
    totalItemsDelivered++;
  }

  // CHARGE — on charger, not full
  if (here.type === 'charger' && robot.batteryLevel < params.batteryCapacity) {
    robot.batteryLevel = Math.min(params.batteryCapacity, robot.batteryLevel + 5);
  }
}

// ─── Shelf Restock ────────────────────────────────────────────────────────────
function restockShelves() {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = grid[row][col];
      if (cell.type === 'shelf' && cell.itemCount === 0) {
        cell.restockTimer++;
        if (cell.restockTimer >= params.restockRate) {
          cell.itemCount = 5;
          cell.restockTimer = 0;
        }
      }
      // Decay congestion heat (NetLogo: * 0.95)
      cell.congestionHeat *= 0.95;
    }
  }
}

// ─── Main Tick (one simulation step) ─────────────────────────────────────────
function tick() {
  robots.forEach(r => robotDecide(r));
  robots.forEach(r => robotMove(r));
  robots.forEach(r => robotAct(r));
  restockShelves();
  ticks++;

  // Record history every 5 ticks
  if (ticks % 5 === 0) {
    history.ticks.push(ticks);
    history.itemsDelivered.push(totalItemsDelivered);
    history.avgBattery.push(getAvgBattery());
    history.collisionsAvoided.push(totalCollisionsAvoided);
    history.robotsCharging.push(robots.filter(r => r.state === 'charge').length);
  }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
function getAvgBattery() {
  if (!robots.length) return 0;
  return Math.round((robots.reduce((s, r) => s + r.batteryLevel, 0) / robots.length) * 10) / 10;
}

function getMetrics() {
  const charging = robots.filter(r => r.state === 'charge').length;
  const delivering = robots.filter(r => r.state === 'deliver').length;
  const fetching = robots.filter(r => r.state === 'fetch').length;
  return {
    totalItemsDelivered,
    totalCollisionsAvoided,
    avgBattery: getAvgBattery(),
    robotsCharging: charging,
    robotsFetching: fetching,
    robotsDelivering: delivering,
    ticks,
    efficiency: ticks > 0 ? ((totalItemsDelivered / (ticks * robots.length || 1)) * 100).toFixed(2) : '0.00',
    throughputPerMin: ticks > 0 ? Math.round(totalItemsDelivered / (ticks / 60)) : 0,
  };
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV() {
  let csv = 'Tick,ItemsDelivered,AvgBattery,CollisionsAvoided,RobotsCharging\n';
  history.ticks.forEach((t, i) => {
    csv += `${t},${history.itemsDelivered[i]},${history.avgBattery[i]},${history.collisionsAvoided[i]},${history.robotsCharging[i]}\n`;
  });
  return csv;
}

// ─── Scenario Runner (for report page) ───────────────────────────────────────
function runScenarioSync(scenarioParams, targetTicks, onProgress) {
  const savedParams = { ...params };
  Object.assign(params, scenarioParams);
  setup();

  for (let i = 0; i < targetTicks; i++) {
    tick();
    if (onProgress && i % 50 === 0) onProgress(i / targetTicks);
  }

  const result = {
    scenario: scenarioParams,
    ticks,
    totalItemsDelivered,
    totalCollisionsAvoided,
    avgBattery: getAvgBattery(),
    history: { ...history },
  };

  Object.assign(params, savedParams);
  return result;
}
