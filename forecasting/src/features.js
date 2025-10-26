import * as d3 from "d3";
import { clamp } from "./utils.js";

function yoy(series) {
  const out = Array(series.length).fill(null);
  for (let i=1;i<series.length;i++) {
    const prev = series[i-1];
    const cur = series[i];
    if (prev==null || cur==null) { out[i]=null; continue; }
    out[i] = (cur - prev) / (Math.abs(prev) > 1e-9 ? prev : 1e-9);
  }
  return out;
}
function roll(series, k, fn) {
  const out = Array(series.length).fill(null);
  for (let i=0;i<series.length;i++) {
    const a = Math.max(0, i-k), b = i-1;
    if (b < a) { out[i] = null; continue; }
    const window = series.slice(a, b+1).filter(v=>v!=null);
    if (window.length===0) { out[i]=null; continue; }
    out[i] = fn(window);
  }
  return out;
}
function cagrK(series, k) {
  const out = Array(series.length).fill(null);
  for (let i=0;i<series.length;i++) {
    const j = i-k;
    if (j<0) { out[i]=null; continue; }
    const a = series[j], b = series[i];
    if (a==null || b==null || a<=0 || b<=0) { out[i]=null; continue; }
    out[i] = Math.pow(b/a, 1/k) - 1;
  }
  return out;
}
function zscore(series, k) {
  const mean = roll(series, k, a => d3.mean(a));
  const std = roll(series, k, a => d3.deviation(a) || null);
  return series.map((v,i)=>{
    if (v==null || mean[i]==null || std[i]==null || std[i]===0) return null;
    return (v-mean[i])/std[i];
  });
}
function maxDrawdown5(series) {
  const out = Array(series.length).fill(null);
  for (let i=0;i<series.length;i++) {
    const a = Math.max(0, i-5), b = i;
    const sub = series.slice(a, b+1).filter(v=>v!=null);
    if (sub.length===0) { out[i]=null; continue; }
    const cur = series[i];
    const maxv = Math.max(...sub);
    out[i] = cur!=null ? 1 - cur/ (maxv || 1e-9) : null;
  }
  return out;
}
function recovery5(series) {
  const out = Array(series.length).fill(null);
  for (let i=0;i<series.length;i++) {
    const a = Math.max(0, i-5), b = i;
    const sub = series.slice(a, b+1).filter(v=>v!=null);
    if (sub.length===0) { out[i]=null; continue; }
    const cur = series[i];
    const minv = Math.min(...sub);
    out[i] = cur!=null ? cur/ (Math.abs(minv)>1e-9 ? minv : 1e-9) : null;
  }
  return out;
}

function pickFHP(series, season) {
  return series.filter(d=>d.season===season).map(d=>d.value);
}

function alignSeries(years, mapYearToVal) {
  return years.map(y => mapYearToVal.get(y) ?? null);
}

function toMap(rows, accessor) {
  const m = new Map();
  for (const r of rows) {
    const { year } = r;
    m.set(year, accessor(r));
  }
  return m;
}

export function extractTarget(prepared, targetKey) {
  const { years } = prepared;
  // Try reading from appropriate table
  if (targetKey === "FHP_whole") {
    // prefer Whole; if missing and seasons exist, average them
    const byYear = d3.rollup(prepared.fhp, v=> {
      const whole = v.find(d=>d.season==="Whole");
      if (whole) return whole.value;
      const seasons = v.filter(d=>d.season!=="Whole").map(d=>d.value).filter(x=>x!=null);
      if (seasons.length>0) return d3.mean(seasons);
      return null;
    }, d=>d.year);
    return years.map(y => byYear.get(y) ?? null);
  }
  if (["Yield","Prod","Area"].includes(targetKey)) {
    const m = toMap(prepared.apy, r => r[targetKey]);
    return years.map(y => m.get(y) ?? null);
  }
  if (["NetRet","GrossRet","TotCost","BC"].includes(targetKey)) {
    const m = toMap(prepared.cost, r => r[targetKey]);
    return years.map(y => m.get(y) ?? null);
  }
  if (targetKey === "ExportsTot") {
    const m = toMap(prepared.exp, r => r.ExportsTot);
    return years.map(y => m.get(y) ?? null);
  }
  return years.map(_=>null);
}

export function buildFeatureMatrix(prepared, cfg) {
  const { years, fhp, apy, cost, exp, msp } = prepared;
  const feat = [];
  const names = [];
  const add = (name, series) => {
    if (!series || series.every(v=>v==null)) return;
    names.push(name);
    feat.push(series);
  };

  // Helper aligned series
  const fhpWholeByYear = d3.rollup(fhp, v=>{
    const w = v.find(d=>d.season==="Whole")?.value;
    if (w!=null) return w;
    const seasons = v.filter(d=>d.season!=="Whole").map(d=>d.value).filter(x=>x!=null);
    return seasons.length? d3.mean(seasons): null;
  }, d=>d.year);
  const fhpWhole = years.map(y => fhpWholeByYear.get(y) ?? null);
  const fhpK = years.map(y => fhp.find(d=>d.year===y && d.season==="Kharif")?.value ?? null);
  const fhpR = years.map(y => fhp.find(d=>d.year===y && d.season==="Rabi")?.value ?? null);
  const fhpS = years.map(y => fhp.find(d=>d.year===y && d.season==="Summer")?.value ?? null);

  const area = alignSeries(years, toMap(apy, r=>r.Area));
  const prod = alignSeries(years, toMap(apy, r=>r.Prod));
  const yieldKg = alignSeries(years, toMap(apy, r=>r.Yield));

  const totCost = alignSeries(years, toMap(cost, r=>r.TotCost));
  const opCost = alignSeries(years, toMap(cost, r=>r.OpCost));
  const fixCost = alignSeries(years, toMap(cost, r=>r.FixCost));
  const grossRet = alignSeries(years, toMap(cost, r=>r.GrossRet));
  const netRet = alignSeries(years, toMap(cost, r=>r.NetRet));
  const bc = alignSeries(years, toMap(cost, r=>r.BC));

  const exTot = alignSeries(years, toMap(exp, r=>r.ExportsTot));

  // MSP (national)
  const mspByYear = d3.rollup(msp, v=> v[0], d=>d.year); // store one row per year
  const MSP_Bajra = years.map(y => mspByYear.get(y)?.MSP_Bajra ?? null);
  const MSP_Ragi = years.map(y => mspByYear.get(y)?.MSP_Ragi ?? null);
  const MSP_Jh = years.map(y => mspByYear.get(y)?.MSP_Jowar_Hybrid ?? null);
  const MSP_Jm = years.map(y => mspByYear.get(y)?.MSP_Jowar_Maldandi ?? null);

  const mainMSP = (() => {
    if (prepared.crop.includes("Bajra")) return MSP_Bajra;
    if (prepared.crop.includes("Ragi")) return MSP_Ragi;
    if (prepared.crop.includes("Jowar")) return MSP_Jh;
    return MSP_Bajra; // fallback
  })();

  // A) Prices and policy anchors
  if (cfg.featureBlocks.A) {
    add("A1_FHP_whole", fhpWhole);
    add("A2_yoyFHP", yoy(fhpWhole));
    add("A3_cagr3FHP", cagrK(fhpWhole, 3));
    add("A4_z5FHP", zscore(fhpWhole, 5));
    add("A5_std5_yoyFHP", roll(yoy(fhpWhole), 5, a=>d3.deviation(a)||null));
    add("A6_mdd5_FHP", maxDrawdown5(fhpWhole));
    add("A7_recovery5_FHP", recovery5(fhpWhole));
    add("A8_slope5_FHP", slopeK(fhpWhole, 5));
    add("A9_FHP_K", fhpK);
    add("A10_yoyFHP_K", yoy(fhpK));
    add("A11_FHP_R", fhpR);
    add("A12_yoyFHP_R", yoy(fhpR));
    add("A13_FHP_S", fhpS);
    add("A14_yoyFHP_S", yoy(fhpS));
    add("A15_season_spread_K_R", diff(fhpK, fhpR));
    add("A16_season_ratio_K_R", ratio(fhpK, fhpR));
    add("A17_season_amp", seasonAmp([fhpK, fhpR, fhpS]));
    add("A18_seasons_rising_share", seasonsRisingShare([fhpK, fhpR, fhpS]));
    add("A19_gap_FHP_MSP", diff(fhpWhole, mainMSP));
    add("A20_ratio_FHP_MSP", ratio(fhpWhole, mainMSP));
    add("A21_yoy_gap_FHP_MSP", yoy(diff(fhpWhole, mainMSP)));
    add("A22_msp_level", mainMSP);
    add("A23_yoyMSP", yoy(mainMSP));
    add("A24_cagr3MSP", cagrK(mainMSP, 3));
    add("A25_accelMSP", accel(mainMSP));
    if (prepared.crop.includes("Jowar")) {
      add("A26_MSP_variant_spread", diff(MSP_Jm, MSP_Jh));
      add("A27_MSP_variant_ratio", ratio(MSP_Jm, MSP_Jh));
    }
  }

  // B) APY supply fundamentals (subset for performance)
  if (cfg.featureBlocks.B) {
    add("B1_Area", area);
    add("B2_yoyArea", yoy(area));
    add("B3_Prod", prod);
    add("B4_yoyProd", yoy(prod));
    add("B5_Yield", yieldKg);
    add("B6_yoyYield", yoy(yieldKg));
    add("B7_cagr3Yield", cagrK(yieldKg, 3));
    add("B8_cv5Yield", cvK(yieldKg, 5));
  }

  // C) Costs & profitability
  if (cfg.featureBlocks.C) {
    add("C1_TotCost", totCost);
    add("C2_yoyTotCost", yoy(totCost));
    add("C3_GrossRet", grossRet);
    add("C4_NetRet", netRet);
    add("C5_BC", bc);
    const BE = breakeven(totCost, yieldKg);
    add("C6_BE_price", BE);
    add("C7_FHP_BE_cov", ratio(fhpWhole, BE));
    add("C8_MSP_BE_cov", ratio(mainMSP, BE));
    add("C9_ImpliedPrice", impliedPrice(grossRet, yieldKg));
    add("C10_Implied_minus_FHP", diff(impliedPrice(grossRet, yieldKg), fhpWhole));
  }

  // D) Exports and demand
  if (cfg.featureBlocks.D) {
    add("D1_ExportsTot", exTot);
    add("D2_yoyExportsTot", yoy(exTot));
    add("D3_cagr3Exports", cagrK(exTot, 3));
  }

  // E) Consumption (structural; stale flag beyond 2012 -> encode a decayed weight proxy)
  if (cfg.featureBlocks.E) {
    // Placeholder: no NSS data loaded; encode a small prior via MSP anchor interactions
    add("E1_structural_prior_proxy", roll(mainMSP, 5, a=>d3.mean(a)));
  }

  // F) Data/regime flags (simple)
  if (cfg.featureBlocks.F) {
    // Telangana flag
    const tel = years.map(y => y>=2015 ? 1: 0); // crop-year alignment note simplified
    add("F1_TelanganaFlag", tel);
    // FHP fallback flag: where we averaged seasons
    const fallback = years.map(y => {
      const rows = prepared.fhp.filter(d=>d.year===y);
      const hasWhole = rows.some(d=>d.season==="Whole" && d.value!=null);
      const seasonal = rows.filter(d=>d.season!=="Whole" && d.value!=null);
      return (!hasWhole && seasonal.length>0) ? 1 : 0;
    });
    add("F2_FHP_fallback", fallback);
  }

  // Build lag features correctly from base feature series
  const baseSeries = feat.slice();
  const baseNames = names.slice();
  for (let L = 1; L <= cfg.maxLags; L++) {
    for (let j = 0; j < baseSeries.length; j++) {
      const v = baseSeries[j];
      const vl = new Array(v.length).fill(null);
      for (let i = L; i < v.length; i++) vl[i] = v[i - L];
      names.push(`${baseNames[j]}_lag${L}`);
      feat.push(vl);
    }
  }

  // Final matrix: rows = time (years), cols = features
  const X = transpose(feat); // rows=time, cols=features
  const featureNames = names;

  const latestYear = years[years.length-1];
  const latestRow = X[X.length-1];

  return { years, X, featureNames, latestRow, latestYear };
}

export const FEATURE_EXPLANATIONS = {
  // Block A: Prices & Gov. Support
  'A1_FHP_whole': "Market Price (Yearly Avg)",
  'A2_yoyFHP': "Price Change from Last Year (%)",
  'A3_cagr3FHP': "Price Growth Rate (3-Year Avg)",
  'A4_z5FHP': "Price Uniqueness (vs 5-Year Avg)",
  'A5_std5_yoyFHP': "Price Volatility (5-Year)",
  'A6_mdd5_FHP': "Biggest Price Drop (in 5 Years)",
  'A7_recovery5_FHP': "Price Bounce-back (from 5-Year Low)",
  'A8_slope5_FHP': "Price Trend (5-Year Direction)",
  'A9_FHP_K': "Kharif Season Price",
  'A10_yoyFHP_K': "Kharif Price Change (%)",
  'A11_FHP_R': "Rabi Season Price",
  'A12_yoyFHP_R': "Rabi Price Change (%)",
  'A13_FHP_S': "Summer Season Price",
  'A14_yoyFHP_S': "Summer Price Change (%)",
  'A15_season_spread_K_R': "Price Difference (Kharif vs Rabi)",
  'A16_season_ratio_K_R': "Price Ratio (Kharif vs Rabi)",
  'A17_season_amp': "Price Swing between Seasons",
  'A18_seasons_rising_share': "How Many Seasons Prices Rose",
  'A19_gap_FHP_MSP': "Price vs MSP (Difference)",
  'A20_ratio_FHP_MSP': "Price vs MSP (Ratio)",
  'A21_yoy_gap_FHP_MSP': "Change in Price-MSP Gap",
  'A22_msp_level': "Government MSP Level",
  'A23_yoyMSP': "MSP Change from Last Year (%)",
  'A24_cagr3MSP': "MSP Growth Rate (3-Year Avg)",
  'A25_accelMSP': "Speed of MSP Change",
  'A26_MSP_variant_spread': "MSP Difference (Jowar Types)",
  'A27_MSP_variant_ratio': "MSP Ratio (Jowar Types)",

  // Block B: APY
  'B1_Area': "Area Sown (Hectares)",
  'B2_yoyArea': "Area Sown Change (%)",
  'B3_Prod': "Total Production (Tonnes)",
  'B4_yoyProd': "Production Change (%)",
  'B5_Yield': "Yield (Kg per Hectare)",
  'B6_yoyYield': "Yield Change (%)",
  'B7_cagr3Yield': "Yield Growth (3-Year Avg)",
  'B8_cv5Yield': "Yield Stability (5-Year)",

  // Block C: Costs
  'C1_TotCost': "Total Farming Cost (per Ha)",
  'C2_yoyTotCost': "Farming Cost Change (%)",
  'C3_GrossRet': "Gross Revenue (per Ha)",
  'C4_NetRet': "Net Profit (per Ha)",
  'C5_BC': "Benefit-Cost Ratio",
  'C6_BE_price': "Break-Even Price (per Quintal)",
  'C7_FHP_BE_cov': "Market Price vs Break-Even",
  'C8_MSP_BE_cov': "MSP vs Break-Even",
  'C9_ImpliedPrice': "Price Needed for Revenue",
  'C10_Implied_minus_FHP': "Price Gap (Revenue vs Market)",
  
  // Block D: Exports
  'D1_ExportsTot': "Total Exports (Tonnes)",
  'D2_yoyExportsTot': "Export Change (%)",
  'D3_cagr3Exports': "Export Growth (3-Year Avg)",

  // Block E: Consumption
  'E1_structural_prior_proxy': "Long-term Demand Proxy",

  // Block F: Data/Regime
  'F1_TelanganaFlag': "After Telangana State Formed",
  'F2_FHP_fallback': "Used Seasonal Price Average",
};

// Helpers for features
function diff(a,b){ return a.map((v,i)=> (v==null||b[i]==null)?null:(v-b[i])); }
function ratio(a,b){ return a.map((v,i)=> (v==null||b[i]==null||Math.abs(b[i])<1e-9)?null:(v/b[i])); }
function accel(a){ const y = yoy(a); return yoy(y); }
function seasonAmp(arrs){
  const n = arrs[0].length;
  const out = new Array(n).fill(null);
  for (let i=0;i<n;i++) {
    const vals = arrs.map(a=>a[i]).filter(v=>v!=null);
    out[i] = vals.length? (Math.max(...vals)-Math.min(...vals)) : null;
  }
  return out;
}
function seasonsRisingShare(arrs) {
  const n = arrs[0].length;
  const out = new Array(n).fill(null);
  for (let i=0;i<n;i++) {
    let cnt=0, tot=0;
    for (const a of arrs) {
      if (i===0) continue;
      if (a[i]!=null && a[i-1]!=null) { tot++; if (a[i] > a[i-1]) cnt++; }
    }
    out[i] = tot>0 ? cnt/tot : null;
  }
  return out;
}
function slopeK(series, k) {
  const out = Array(series.length).fill(null);
  for (let i=0;i<series.length;i++) {
    const a = Math.max(0, i-k), b = i;
    const xs = [], ys=[];
    for (let j=a;j<=b;j++){
      if (series[j]!=null) { xs.push(j-a); ys.push(series[j]); }
    }
    if (xs.length<2) { out[i]=null; continue; }
    const mx = d3.mean(xs), my=d3.mean(ys);
    let num=0, den=0;
    for (let t=0;t<xs.length;t++){ num+=(xs[t]-mx)*(ys[t]-my); den+=(xs[t]-mx)**2; }
    out[i] = den===0? 0 : num/den;
  }
  return out;
}
function cvK(series, k) {
  const m = roll(series, k, a=>d3.mean(a));
  const s = roll(series, k, a=>d3.deviation(a)||0);
  return m.map((mi,i)=> (mi==null || mi===0 || s[i]==null)? null : s[i]/mi);
}
function breakeven(totCost, yieldKg) {
  // Rs/quintal: TotCost / (Yield/100)
  return yieldKg.map((y,i)=> (totCost[i]==null||y==null||y===0)? null : totCost[i]/(y/100));
}
function impliedPrice(grossRet, yieldKg) {
  return yieldKg.map((y,i)=> (grossRet[i]==null||y==null||y===0)? null : grossRet[i]/(y/100));
}
function transpose(a) {
  if (a.length===0) return [];
  const rows = a[0].length;
  const cols = a.length;
  const out = new Array(rows);
  for (let i=0;i<rows;i++){
    out[i] = new Array(cols);
    for (let j=0;j<cols;j++) out[i][j] = a[j][i];
  }
  return out;
}