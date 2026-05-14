const charts = {};

const COLORS = {
  blue: '#1a73e8',
  teal: '#0d9488',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
  green: '#22c55e',
};

const PALETTE = [
  COLORS.blue, COLORS.teal, COLORS.amber, COLORS.red,
  COLORS.purple, COLORS.indigo, COLORS.pink, COLORS.orange, COLORS.cyan, COLORS.green,
];

const BG_PALETTE = [
  'rgba(26,115,232,0.12)', 'rgba(13,148,136,0.12)', 'rgba(245,158,11,0.12)',
  'rgba(239,68,68,0.12)', 'rgba(139,92,246,0.12)', 'rgba(99,102,241,0.12)',
];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 8,
        font: { family: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif', size: 12 },
      },
    },
  },
  scales: {
    x: {
      ticks: { font: { size: 11 } },
      grid: { display: false },
    },
    y: {
      ticks: { font: { size: 11 } },
      grid: { color: '#f1f5f9' },
    },
  },
};

export function destroyChart(canvasId) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
    delete charts[canvasId];
  }
}

export function destroyAllCharts() {
  for (const key of Object.keys(charts)) {
    charts[key].destroy();
    delete charts[key];
  }
}

export function createPieChart(canvasId, labels, data, title) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const backgroundColor = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  charts[canvasId] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor,
        borderColor: '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: title ? { display: true, text: title, font: { size: 14, weight: '600' }, padding: 12 } : undefined,
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
  return charts[canvasId];
}

export function createBarChart(canvasId, labels, datasets, title) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const colored = datasets.map((ds, i) => ({
    ...ds,
    backgroundColor: ds.backgroundColor || PALETTE[i % PALETTE.length],
    borderRadius: 4,
  }));

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: colored },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: title ? { display: true, text: title, font: { size: 14, weight: '600' }, padding: 12 } : undefined,
      },
    },
  });
  return charts[canvasId];
}

export function createLineChart(canvasId, labels, datasets, title) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const colored = datasets.map((ds, i) => ({
    ...ds,
    borderColor: ds.borderColor || PALETTE[i % PALETTE.length],
    backgroundColor: ds.backgroundColor || BG_PALETTE[i % BG_PALETTE.length],
    tension: 0.3,
    fill: false,
    pointRadius: 3,
    pointHoverRadius: 5,
  }));

  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: colored },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        title: title ? { display: true, text: title, font: { size: 14, weight: '600' }, padding: 12 } : undefined,
      },
    },
  });
  return charts[canvasId];
}

export function getPalette(n) {
  return PALETTE.slice(0, n);
}
