import * as d3 from "d3";
import { FEATURE_EXPLANATIONS } from "./features.js";

export function generateInsights(prepared, feat, target, cfg, ctx) {
  const notes = [];
  const { backtest, forecast, metrics, contributions } = ctx;

  // Policy anchors
  const years = prepared.years;
  const lastY = years[years.length-1];
  const fhpWholeByYear = d3.rollup(prepared.fhp, v=>{
    const whole = v.find(d=>d.season==="Whole");
    if (whole) return whole.value;
    const s = v.filter(d=>d.season!=="Whole").map(d=>d.value).filter(x=>x!=null);
    return s.length? d3.mean(s): null;
  }, d=>d.year);
  const fhpLast = fhpWholeByYear.get(lastY) ?? null;

  const mspByYear = d3.rollup(prepared.msp, v=> v[0], d=>d.year);
  let mainMSP = null;
  if (prepared.crop.includes("Bajra")) mainMSP = mspByYear.get(lastY)?.MSP_Bajra ?? null;
  else if (prepared.crop.includes("Ragi")) mainMSP = mspByYear.get(lastY)?.MSP_Ragi ?? null;
  else if (prepared.crop.includes("Jowar")) mainMSP = mspByYear.get(lastY)?.MSP_Jowar_Hybrid ?? null;

  if (fhpLast!=null && mainMSP!=null) {
    const floorGap = fhpLast - mainMSP;
    notes.push(`The latest market price (${fmt(fhpLast)} Rs/Quintal) is currently ${floorGap >= 0 ? 'above' : 'below'} the Government's Minimum Support Price (MSP) of ${fmt(mainMSP)} Rs/Quintal.`);
    if (fhpLast < mainMSP) notes.push("Since prices are below the MSP, there might be a chance for them to rise, especially if the government buys more stock.");
    else notes.push("Prices are above the government's support level, which is a good sign for profitability.");
  }

  // Breakeven coverage
  const apyRow = prepared.apy.find(d=>d.year===lastY);
  const costRow = prepared.cost.find(d=>d.year===lastY);
  if (apyRow && costRow && apyRow.Yield && costRow.TotCost) {
    const BE = costRow.TotCost / (apyRow.Yield/100);
    const cov = fhpLast!=null ? fhpLast / BE : null;
    notes.push(`To cover costs, a farmer needs to sell at ${fmt(BE)} Rs/Quintal. The current market price is ${cov ? cov.toFixed(1) : "N/A"} times this break-even price.`);
    if (cov && cov < 1.1 && cov > 0) {
      notes.push("Warning: Market prices are very close to the cost of farming. Profits may be low.");
    } else if (cov && cov <= 0) {
       notes.push("Warning: Market prices are below the cost of farming, suggesting farmers may be facing losses.");
    }
  }

  // Backtest quality
  if (Number.isFinite(metrics.mape)) {
    notes.push(`How reliable is this prediction? In the past, this computer model's guesses have been off by about ${(metrics.mape*100).toFixed(1)}% on average.`);
  }

  // Drivers
  const top = (contributions.topRaw||[]).slice(0,1);
  if (top.length) {
    const mainDriver = top[0];
    const direction = mainDriver.value > 0 ? 'pushing the price up' : 'pulling the price down';
    notes.push(`The most important factor driving this forecast is '${getFriendlyFeatureName(mainDriver.name)}', which is currently ${direction}.`);
  }

  // Exports tension vs supply (if available)
  const exThis = prepared.exp.find(d=>d.year===lastY)?.ExportsTot ?? null;
  const exPrev = prepared.exp.find(d=>d.year===lastY-1)?.ExportsTot ?? null;
  const prodThis = prepared.apy.find(d=>d.year===lastY)?.Prod ?? null;
  const prodPrev = prepared.apy.find(d=>d.year===lastY-1)?.Prod ?? null;
  if (exThis!=null && exPrev!=null && prodThis!=null && prodPrev!=null) {
    const yoyEx = (exThis-exPrev)/Math.max(1e-9, exPrev);
    const yoyProd = (prodThis-prodPrev)/Math.max(1e-9, prodPrev);
    const direction = yoyEx > yoyProd ? "faster" : "slower";
    notes.push(`Last year, demand from other countries (exports) grew by ${(yoyEx*100).toFixed(0)}%, while production grew by ${(yoyProd*100).toFixed(0)}%. When exports grow ${direction} than supply, it can push prices up.`);
  }

  // Forward path
  const f0 = forecast.values?.[0];
  if (Number.isFinite(f0)) {
    notes.push(`The prediction for next year (${lastY+1}) is ${fmt(f0)} Rs/Quintal.`);
  }

  return notes;
}

function getFriendlyFeatureName(name) {
  const lagMatch = name.match(/_lag(\d+)$/);
  if (lagMatch) {
    const baseName = name.replace(lagMatch[0], '');
    const lagNum = lagMatch[1];
    const friendlyBase = FEATURE_EXPLANATIONS[baseName] || baseName;
    return `${friendlyBase} (${lagNum} year${lagNum > 1 ? 's' : ''} ago)`;
  }
  return FEATURE_EXPLANATIONS[name] || name;
}


function fmt(x) {
  if (x==null || !Number.isFinite(x)) return "n/a";
  if (Math.abs(x) >= 1000) return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return x.toFixed(2);
}