import * as d3 from "d3";

function normalEqRidge(X, y, lambda) {
  // X: n x p, y: n
  const n = X.length, p = X[0].length;
  // Compute XtX and Xty
  const XtX = Array.from({length:p}, _=>Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i=0;i<n;i++){
    const xi = X[i];
    const yi = y[i];
    if (yi==null || xi.some(v=>v==null || !Number.isFinite(v))) continue;
    for (let j=0;j<p;j++){
      Xty[j] += xi[j]*yi;
      for (let k=0;k<p;k++){
        XtX[j][k] += xi[j]*xi[k];
      }
    }
  }
  for (let j=0;j<p;j++) XtX[j][j] += lambda;

  const beta = solveSymmetric(XtX, Xty);
  return beta;
}

function solveSymmetric(A, b) {
  // naive Gaussian elimination with partial pivoting
  const n = A.length;
  const M = A.map(row=>row.slice());
  const v = b.slice();

  for (let i=0;i<n;i++) {
    // pivot
    let maxR = i, maxV = Math.abs(M[i][i]);
    for (let r=i+1;r<n;r++){
      const val = Math.abs(M[r][i]);
      if (val > maxV) { maxV = val; maxR = r; }
    }
    if (maxR !== i) {
      [M[i], M[maxR]] = [M[maxR], M[i]];
      [v[i], v[maxR]] = [v[maxR], v[i]];
    }
    const piv = M[i][i] || 1e-9;
    // normalize
    for (let j=i;j<n;j++) M[i][j] /= piv;
    v[i] /= piv;
    // eliminate
    for (let r=0;r<n;r++){
      if (r===i) continue;
      const f = M[r][i];
      if (f===0) continue;
      for (let j=i;j<n;j++) M[r][j] -= f*M[i][j];
      v[r] -= f*v[i];
    }
  }
  return v;
}

function buildTrainMatrix(featureMatrix, target, window) {
  const { years, X, featureNames } = featureMatrix;
  // Keep only rows with complete target and at least one non-null feature
  const rows = [];
  const ys = [];
  const idxYears = [];
  const start = Math.max(0, years.length - window);
  for (let i=start;i<years.length;i++){
    const xi = X[i];
    const yi = target[i];
    if (yi==null) continue;
    if (!xi || xi.every(v=>v==null || !Number.isFinite(v))) continue;
    // Replace nulls with feature medians computed over window
    rows.push(xi);
    ys.push(yi);
    idxYears.push(years[i]);
  }
  if (rows.length===0) return { X: [], y: [], years: [], featureNames };
  // Column-wise impute medians
  const med = columnMedian(rows);
  const Ximp = rows.map(r => r.map((v,j)=> Number.isFinite(v) ? v : med[j]));
  return { X: Ximp, y: ys, years: idxYears, featureNames };
}

function columnMedian(rows) {
  if (!rows || rows.length===0) return [];
  const p = rows[0].length;
  const med = Array(p).fill(0);
  for (let j=0;j<p;j++){
    const col = rows.map(r=>r[j]).filter(Number.isFinite).sort((a,b)=>a-b);
    const m = col.length ? (col.length%2 ? col[(col.length-1)/2] : 0.5*(col[col.length/2-1]+col[col.length/2])) : 0;
    med[j] = m;
  }
  return med;
}

function predictRow(beta, x) {
  let s = 0;
  for (let j=0;j<beta.length;j++) s += beta[j]*x[j];
  return s;
}

function backtestCV(X, y, years, folds=3, lambda=2) {
  // simple expanding window CV
  const n = y.length;
  const k = Math.max(2, folds);
  const foldSize = Math.floor(n/k);
  const preds = [];
  const targets = [];
  const idxYears = [];
  for (let f=1; f<=k; f++) {
    const trainEnd = f*foldSize;
    if (trainEnd+1 >= n) break;
    const Xtr = X.slice(0, trainEnd);
    const ytr = y.slice(0, trainEnd);
    const Xte = [X[trainEnd]];
    const yte = [y[trainEnd]];
    const beta = normalEqRidge(Xtr, ytr, lambda);
    const ph = predictRow(beta, Xte[0]);
    preds.push(ph);
    targets.push(yte[0]);
    idxYears.push(years[trainEnd]);
  }
  const residuals = targets.map((v,i)=> v - preds[i]);
  const rmse = Math.sqrt(d3.mean(residuals.map(r=>r*r)));
  const mape = d3.mean(residuals.map((r,i)=> Math.abs(r)/Math.max(1, Math.abs(targets[i])) ));
  return { preds, targets, residuals, residualYears: idxYears, rmse, mape };
}

export function trainAndForecast(featureMatrix, targetSeries, cfg) {
  const { X, y, years, featureNames } = buildTrainMatrix(featureMatrix, targetSeries, cfg.window);
  if (!X.length || !y.length) {
    const lastIdx = featureMatrix.years.length - 1;
    const lastYear = featureMatrix.years[lastIdx];
    return {
      model: { beta: [], featureNames },
      fit: { years, X, y },
      backtest: { preds: [], targets: [], residuals: [], residualYears: [], predYears: [] },
      forecast: { values: Array(cfg.horizon).fill(null) },
      contributions: { all: [], topLabels: [], topValues: [], topRaw: [] },
      metrics: { rmse: NaN, mape: NaN, n: 0, p: featureNames.length },
      X: featureMatrix, y: targetSeries, lastYear,
      futureYears: Array.from({length: cfg.horizon}, (_,i)=> lastYear + i + 1)
    };
  }
  const beta = normalEqRidge(X, y, cfg.lambda);

  const cv = backtestCV(X, y, years, cfg.cvFolds, cfg.lambda);

  // One-step ahead forecast recursively for horizon using last known row + naive feature carry
  const lastIdx = featureMatrix.years.length - 1;
  const lastYear = featureMatrix.years[lastIdx];
  const futureYears = Array.from({length: cfg.horizon}, (_,i)=> lastYear + i + 1);

  const latestRow = featureMatrix.X[lastIdx].slice();
  const med = columnMedian(X);
  const cleaned = latestRow.map((v,j)=> Number.isFinite(v) ? v : med[j]);
  const forecastValues = [];
  let curRow = cleaned.slice();
  for (let h=0; h<cfg.horizon; h++) {
    const ph = predictRow(beta, curRow);
    forecastValues.push(ph);
    // roll lags: shift lag features one step (simple)
    curRow = curRow.slice();
    // nothing fancy; leave as is for simplicity
  }

  // Contributions: beta_j * x_j for latest observed
  const contribVals = cleaned.map((v,j)=> beta[j]*v);
  // Rank top absolute contributors
  const pairs = contribVals.map((v,j)=> ({ name: featureNames[j], value: v }));
  pairs.sort((a,b)=> Math.abs(b.value) - Math.abs(a.value));
  const top = pairs.slice(0, 12);

  const backtest = {
    predYears: years.slice(0, cv.preds.length).map((_,i)=> cv.residualYears[i]),
    preds: cv.preds,
    targets: cv.targets,
    residuals: cv.residuals,
    residualYears: cv.residualYears
  };

  const metrics = {
    rmse: cv.rmse, mape: cv.mape, n: y.length, p: featureNames.length
  };

  return {
    model: { beta, featureNames },
    fit: { years, X, y },
    backtest,
    forecast: { values: forecastValues },
    contributions: {
      all: pairs,
      topLabels: top.map(d=>d.name),
      topValues: top.map(d=>d.value),
      topRaw: top
    },
    metrics,
    X: featureMatrix,
    y: targetSeries,
    lastYear,
    futureYears
  };
}