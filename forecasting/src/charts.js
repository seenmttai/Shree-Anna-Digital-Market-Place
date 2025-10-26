import uPlot from "uplot";

let charts = { target: null, residuals: null, drivers: null };

export function renderTarget(el, years, actual, backtest, forecast, lastYear) {
  if (charts.target) { charts.target.destroy(); charts.target = null; }
  const xs = years.slice();
  const actualSeries = actual.slice();
  // Compose forecast timeline
  const futureYears = [];
  const futureVals = [];
  for (let i=0;i<forecast.values.length;i++) {
    futureYears.push(lastYear + i + 1);
    futureVals.push(forecast.values[i]);
  }
  const series = [
    {},
    { label: "Actual", stroke: "#111", width: 2 },
    { label: "Forecast", stroke: "#0f172a", width: 2, dash: [6,4] }
  ];
  const data = [
    xs.concat(futureYears),
    actualSeries.concat(Array(futureYears.length).fill(null)),
    Array(xs.length).fill(null).concat(futureVals)
  ];
  charts.target = new uPlot({
    width: el.clientWidth, height: el.clientHeight,
    scales: { x: { time: false } },
    axes: [{}, {grid: {show:true}}],
    series
  }, data, el);
}

export function renderResiduals(el, years, residuals) {
  if (charts.residuals) { charts.residuals.destroy(); charts.residuals = null; }
  const data = [years, residuals];
  charts.residuals = new uPlot({
    width: el.clientWidth, height: el.clientHeight,
    scales: { x: { time: false } },
    axes: [{}, {}],
    series: [
      {},
      { label: "Residual", stroke: "#334155", width: 2 }
    ]
  }, data, el);
}

export function renderDrivers(el, labels, values) {
  if (charts.drivers) { charts.drivers.destroy(); charts.drivers = null; }
  const idx = labels.map((_,i)=> i+1);
  const data = [idx, values];
  charts.drivers = new uPlot({
    width: el.clientWidth, height: el.clientHeight,
    scales: { x: { time: false } },
    axes: [{}, {}],
    series: [
      {},
      { label: "Contribution", stroke: "#0f172a", width: 2 }
    ]
  }, data, el);
  // Simple overlay labels list is rendered in UI
}

