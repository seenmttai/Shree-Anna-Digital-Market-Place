import * as Data from "https://bharat-millet-hub.pages.dev/forecasting/src/data.js";
import * as Features from "https://bharat-millet-hub.pages.dev/forecasting/src/features.js";
import * as Models from "https://bharat-millet-hub.pages.dev/forecasting/src/models.js";
import * as Charts from "https://bharat-millet-hub.pages.dev/forecasting/src/charts.js";
import * as Explain from "https://bharat-millet-hub.pages.dev/forecasting/src/explain.js";
import * as UI from "https://bharat-millet-hub.pages.dev/forecasting/src/ui.js";

const els = {
  fileInput: document.getElementById("fileInput"),
  demoDataSelect: document.getElementById("demoDataSelect"),
  runBtn: document.getElementById("runBtn"),
  downloadForecasts: document.getElementById("downloadForecasts"),
  downloadFeatures: document.getElementById("downloadFeatures"),
  forecastTitle: document.getElementById("forecastTitle"),
  target: document.getElementById("targetSelect"),
  crop: document.getElementById("cropSelect"),
  state: document.getElementById("stateSelect"),
  horizon: document.getElementById("horizonInput"),
  lambda: document.getElementById("lambdaInput"),
  lags: document.getElementById("lagsInput"),
  window: document.getElementById("windowInput"),
  cv: document.getElementById("cvInput"),
  chartTarget: document.getElementById("chartTarget"),
  chartDrivers: document.getElementById("chartDrivers"),
  chartResiduals: document.getElementById("chartResiduals"),
  metrics: document.getElementById("metrics"),
  insights: document.getElementById("insights"),
  featureTable: document.getElementById("featureTable"),
  driversList: document.getElementById("driversList"),
};

let appState = {
  raw: null,
  prepared: null,
  featureMatrix: null,
  model: null,
  lastResult: null,
  firstRun: true,
};

async function handleFiles(files) {
  const parsed = await Data.loadFromFiles(files);
  appState.raw = parsed;
  UI.populateStates(els.state, parsed.states);
}

async function loadDemoData(url) {
  if (!url) return;
  const demo = await Data.loadDemoSet(url);
  appState.raw = demo.data;
  UI.populateStates(els.state, demo.data.states);
  // apply set-specific defaults
  const d = demo.defaults;
  els.crop.value = d.crop;
  els.state.value = d.state;
  els.target.value = d.target;
}

async function ensureDataLoaded() {
  if (!appState.raw) {
    // Load a default demo if nothing is selected yet
    await loadDemoData('./demo/5-prices.csv');
  }
}

async function runForecast() {
  await ensureDataLoaded();
  const cfg = {
    target: els.target.value,
    crop: els.crop.value,
    state: els.state.value,
    horizon: parseInt(els.horizon.value, 10),
    lambda: parseFloat(els.lambda.value),
    maxLags: parseInt(els.lags.value, 10),
    window: parseInt(els.window.value, 10),
    cvFolds: parseInt(els.cv.value, 10),
    featureBlocks: UI.getFeatureBlocks()
  };

  const prepared = Data.sliceFor(appState.raw, cfg.crop, cfg.state);
  const feat = Features.buildFeatureMatrix(prepared, cfg);
  const targetSeries = Features.extractTarget(prepared, cfg.target);

  const { model, fit, backtest, forecast, contributions, metrics, X, y, lastYear, futureYears } =
    Models.trainAndForecast(feat, targetSeries, cfg);

  appState.prepared = prepared;
  appState.featureMatrix = X;
  appState.model = model;
  appState.lastResult = { fit, backtest, forecast, contributions, metrics, lastYear, futureYears, cfg };

  const targetText = els.target.options[els.target.selectedIndex].text;
  els.forecastTitle.textContent = `Forecast: ${targetText}`;
  Charts.renderTarget(els.chartTarget, prepared.years, targetSeries, backtest, forecast, lastYear);
  Charts.renderResiduals(els.chartResiduals, backtest.residualYears, backtest.residuals);
  Charts.renderDrivers(els.chartDrivers, contributions.topLabels, contributions.topValues);

  UI.renderMetrics(els.metrics, metrics);
  UI.renderDriversList(els.driversList, contributions.topRaw);
  UI.renderFeatureTable(els.featureTable, feat, lastYear);

  const insights = Explain.generateInsights(prepared, feat, targetSeries, cfg, { backtest, forecast, metrics, contributions });
  UI.renderInsights(els.insights, insights);
  
  if (appState.firstRun) {
    document.getElementById('welcome-card').style.display = 'none';
    appState.firstRun = false;
  }
}

els.fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
els.demoDataSelect.addEventListener("change", (e) => loadDemoData(e.target.value));
els.runBtn.addEventListener("click", runForecast);

if (els.downloadForecasts) {
  els.downloadForecasts.addEventListener("click", () => {
    if (!appState.lastResult) return;
    const { backtest, forecast, futureYears } = appState.lastResult;
    const rows = [];
    (backtest.predYears || []).forEach((t, i) => rows.push({ year: t, type: "train_pred", value: backtest.preds[i] }));
    (futureYears || []).forEach((t, i) => rows.push({ year: t, type: "forecast", value: forecast.values[i] }));
    const csv = Data.toCSV(rows);
    Data.downloadFile(csv, "forecasts.csv", "text/csv");
  });
}

if (els.downloadFeatures) {
  els.downloadFeatures.addEventListener("click", () => {
    if (!appState.featureMatrix) return;
    const csv = Data.featuresToCSV(appState.featureMatrix);
    Data.downloadFile(csv, "features_latest.csv", "text/csv");
  });
}

// Bootstrap
(async () => {
  await ensureDataLoaded();
})();