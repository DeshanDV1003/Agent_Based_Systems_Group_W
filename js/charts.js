/**
 * charts.js — Chart.js Integration
 * Manages the throughput, battery, and robot-state charts.
 */

let throughputChart = null;
let batteryChart = null;
let stateChart = null;
let donutChart = null;

const CHART_DEFAULTS = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: {
        color: '#9aa5c4',
        font: { family: 'Inter, sans-serif', size: 11 },
        boxWidth: 12,
        padding: 10,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(5,10,30,0.95)',
      titleColor: '#a0a8ff',
      bodyColor: '#c0c8e0',
      borderColor: 'rgba(108,99,255,0.4)',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#6b7a9f', font: { size: 10 }, maxTicksLimit: 8 },
      grid: { color: 'rgba(255,255,255,0.04)' },
      title: { display: true, text: 'Ticks', color: '#6b7a9f', font: { size: 10 } },
    },
    y: {
      ticks: { color: '#6b7a9f', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.06)' },
    },
  },
};

// ─── Initialise All Charts ────────────────────────────────────────────────────
function initCharts() {
  initThroughputChart();
  initBatteryChart();
  initDonutChart();
}

function initThroughputChart() {
  const el = document.getElementById('throughput-chart');
  if (!el) return;
  if (throughputChart) throughputChart.destroy();

  throughputChart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Items Delivered',
          data: [],
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.12)',
          fill: true,
          tension: 0.45,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'Collisions Avoided',
          data: [],
          borderColor: '#ff4d6d',
          backgroundColor: 'rgba(255,77,109,0.08)',
          fill: true,
          tension: 0.45,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: { display: false },
      },
    },
  });
}

function initBatteryChart() {
  const el = document.getElementById('battery-chart');
  if (!el) return;
  if (batteryChart) batteryChart.destroy();

  batteryChart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Avg Battery %',
          data: [],
          borderColor: '#00d4aa',
          backgroundColor: 'rgba(0,212,170,0.1)',
          fill: true,
          tension: 0.45,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y',
        },
        {
          label: 'Charging Robots',
          data: [],
          borderColor: '#ff9500',
          backgroundColor: 'rgba(255,149,0,0.1)',
          fill: true,
          tension: 0.45,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: 'Battery', color: '#6b7a9f', font: { size: 10 } },
        },
        y1: {
          position: 'right',
          ticks: { color: '#6b7a9f', font: { size: 10 } },
          grid: { display: false },
          title: { display: true, text: 'Charging', color: '#6b7a9f', font: { size: 10 } },
        },
      },
    },
  });
}

function initDonutChart() {
  const el = document.getElementById('donut-chart');
  if (!el) return;
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Fetching', 'Delivering', 'Charging', 'Idle'],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: ['#6c63ff', '#ff4d6d', '#ff9500', '#3a4060'],
          borderColor: '#0d1120',
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9aa5c4',
            font: { family: 'Inter, sans-serif', size: 10 },
            boxWidth: 10,
            padding: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(5,10,30,0.95)',
          titleColor: '#a0a8ff',
          bodyColor: '#c0c8e0',
        },
      },
    },
  });
}

// ─── Update Charts ────────────────────────────────────────────────────────────
function updateCharts() {
  updateThroughputChart();
  updateBatteryChart();
  updateDonutChart();
}

function updateThroughputChart() {
  if (!throughputChart) return;
  throughputChart.data.labels = history.ticks;
  throughputChart.data.datasets[0].data = history.itemsDelivered;
  throughputChart.data.datasets[1].data = history.collisionsAvoided;
  throughputChart.update('none');
}

function updateBatteryChart() {
  if (!batteryChart) return;
  batteryChart.data.labels = history.ticks;
  batteryChart.data.datasets[0].data = history.avgBattery;
  batteryChart.data.datasets[1].data = history.robotsCharging;
  batteryChart.update('none');
}

function updateDonutChart() {
  if (!donutChart || !robots.length) return;
  const fetching   = robots.filter(r => r.state === 'fetch').length;
  const delivering = robots.filter(r => r.state === 'deliver').length;
  const charging   = robots.filter(r => r.state === 'charge').length;
  const idle       = robots.length - fetching - delivering - charging;
  donutChart.data.datasets[0].data = [fetching, delivering, charging, Math.max(0, idle)];
  donutChart.update('none');
}

// ─── Reset Charts ─────────────────────────────────────────────────────────────
function resetCharts() {
  [throughputChart, batteryChart].forEach(chart => {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach(d => (d.data = []));
    chart.update();
  });
  updateDonutChart();
}

// ─── Scenario Comparison Chart (report.html) ──────────────────────────────────
function buildComparisonChart(canvasId, scenariosData) {
  const el = document.getElementById(canvasId);
  if (!el) return;

  const existingChart = Chart.getChart(el);
  if (existingChart) existingChart.destroy();

  const colors = ['#6c63ff', '#00d4aa', '#ff4d6d'];
  const datasets = scenariosData.map((s, i) => ({
    label: `Scenario ${i + 1} (${s.scenario.numRobots} robots)`,
    data: s.history.itemsDelivered,
    borderColor: colors[i],
    backgroundColor: colors[i] + '15',
    fill: true,
    tension: 0.4,
    borderWidth: 2,
    pointRadius: 0,
  }));

  new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: scenariosData[0]?.history?.ticks || [],
      datasets,
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: {
          display: true,
          text: 'Items Delivered — Scenario Comparison',
          color: '#a0a8ff',
          font: { size: 13, family: 'Inter, sans-serif' },
        },
      },
    },
  });
}
