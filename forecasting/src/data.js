import * as d3 from "d3";

const CROPS = ["Sorghum/Jowar", "Pearl Millet/Bajra", "Finger Millet/Ragi", "Small/Minor Millets"];

export async function loadFromFiles(fileList) {
  const files = Array.from(fileList || []);
  const textContents = await Promise.all(files.map(f => f.text()));
  const parsed = textContents.map(txt => parseCSVFlexible(txt));

  // Merge by known schemas; we accept column prefixes to route tables
  const allRows = parsed.flat();
  return normalizeAndIndex(allRows);
}

export async function loadDemo(url = './demo/5-prices.csv') {
  // Aggregate core demo files to ensure the model has enough features
  const coreFiles = new Set([
    './demo/5-prices.csv',      // FHP Prices
    './demo/6-apy.csv',         // Area, Production, Yield
    './demo/7-exports.csv',     // Exports Totals
    './demo/2-cost-bajra.csv',  // Cost of Cultivation (Bajra)
    './demo/3-cost-sorghum.csv',// Cost of Cultivation (Sorghum)
    './demo/4-cost-ragi.csv',   // Cost of Cultivation (Ragi)
  ]);
  if (url) coreFiles.add(url);

  const texts = await Promise.all(Array.from(coreFiles).map(async (path) => {
    const res = await fetch(path);
    return await res.text();
  }));

  const rows = texts.flatMap(txt => parseCSVFlexible(txt));
  return normalizeAndIndex(rows);
}

// New: numbered demo sets 1..15 with independent, predictable slices
export async function loadDemoSet(idStr) {
  const id = parseInt(idStr, 10);
  // fetch core sources once
  const texts = await Promise.all([
    './demo/5-prices.csv',
    './demo/6-apy.csv',
    './demo/7-exports.csv',
    './demo/2-cost-bajra.csv',
    './demo/3-cost-sorghum.csv',
    './demo/4-cost-ragi.csv',
  ].map(async (path) => {
    const res = await fetch(path);
    return await res.text();
  }));
  const allRows = texts.flatMap(txt => parseCSVFlexible(txt));

  const SETS = {
    1:  { crops: ['Finger Millet/Ragi'], states: ['All India'], years: [2004, 2019], defaults: { crop:'Finger Millet/Ragi', state:'__NATIONAL__', target:'Yield' } },
    2:  { crops: ['Pearl Millet/Bajra'], states: ['Gujarat'],     years: [2005, 2019], defaults: { crop:'Pearl Millet/Bajra', state:'Gujarat', target:'FHP_whole' } },
    3:  { crops: ['Sorghum/Jowar'],      states: ['Karnataka'],   years: [2005, 2019], defaults: { crop:'Sorghum/Jowar', state:'Karnataka', target:'FHP_whole' } },
    4:  { crops: ['Pearl Millet/Bajra'], states: ['Rajasthan'],   years: [2005, 2019], defaults: { crop:'Pearl Millet/Bajra', state:'Rajasthan', target:'FHP_whole' } },
    5:  { crops: ['Sorghum/Jowar'],      states: ['Maharashtra'], years: [2005, 2019], defaults: { crop:'Sorghum/Jowar', state:'Maharashtra', target:'FHP_whole' } },
    6:  { crops: ['Finger Millet/Ragi'], states: ['Tamil Nadu'],  years: [2005, 2019], defaults: { crop:'Finger Millet/Ragi', state:'Tamil Nadu', target:'FHP_whole' } },
    7:  { crops: ['Sorghum/Jowar'],      states: ['Andhra Pradesh'], years: [2005, 2019], defaults: { crop:'Sorghum/Jowar', state:'Andhra Pradesh', target:'FHP_whole' } },
    8:  { crops: ['Pearl Millet/Bajra'], states: ['Uttar Pradesh'], years: [2005, 2019], defaults: { crop:'Pearl Millet/Bajra', state:'Uttar Pradesh', target:'FHP_whole' } },
    9:  { crops: ['Sorghum/Jowar'],      states: ['Madhya Pradesh'], years: [2005, 2019], defaults: { crop:'Sorghum/Jowar', state:'Madhya Pradesh', target:'FHP_whole' } },
    10: { crops: ['Finger Millet/Ragi'], states: ['Karnataka','All India'], years: [2005, 2019], defaults: { crop:'Finger Millet/Ragi', state:'Karnataka', target:'FHP_whole' } },
    11: { crops: ['Pearl Millet/Bajra'], states: ['Haryana'],     years: [2005, 2019], defaults: { crop:'Pearl Millet/Bajra', state:'Haryana', target:'FHP_whole' } },
    12: { crops: ['Pearl Millet/Bajra'], states: ['Maharashtra'], years: [2005, 2019], defaults: { crop:'Pearl Millet/Bajra', state:'Maharashtra', target:'FHP_whole' } },
    13: { crops: ['Sorghum/Jowar'],      states: ['Rajasthan'],   years: [2005, 2019], defaults: { crop:'Sorghum/Jowar', state:'Rajasthan', target:'FHP_whole' } },
    14: { crops: ['Finger Millet/Ragi'], states: ['Uttarakhand'], years: [2007, 2019], defaults: { crop:'Finger Millet/Ragi', state:'Uttarakhand', target:'FHP_whole' } },
    15: { crops: ['Finger Millet/Ragi'], states: ['All India'],   years: [1967, 2000], defaults: { crop:'Finger Millet/Ragi', state:'__NATIONAL__', target:'Yield' } },
  };

  const cfg = SETS[id] || SETS[1];

  // Normalize first to use crop normalization
  const normalized = allRows.map(r => {
    const crop = normCrop(r.crop || r.Crop);
    return { ...r, __crop: crop };
  });

  const [y0, y1] = cfg.years;
  const keepStates = new Set(cfg.states);
  const keepCrops = new Set(cfg.crops);

  const filteredRows = normalized.filter(r => {
    const crop = r.__crop;
    const stateRaw = r.state || r.State || r.geo || r.Geography || 'All India';
    const state = normState(stateRaw);
    const year = parseInt(r.year || r.Year, 10);
    if (!Number.isFinite(year)) return false;
    if (!keepCrops.has(crop)) return false;
    if (year < y0 || year > y1) return false;
    // exp rows lack state -> default All India; allow if All India included or if state explicitly matches
    return keepStates.has(state);
  });

  const data = normalizeAndIndex(filteredRows);
  return { data, defaults: cfg.defaults };
}

function parseCSVFlexible(txt) {
  const delim = txt.indexOf("\t") >= 0 ? "\t" : ",";
  const rows = d3.dsvFormat(delim).parse(txt.trim());
  return rows;
}

function normalizeAndIndex(rows) {
  // We expect rows with type markers or column names indicating measures
  const fhp = [];
  const apy = [];
  const cost = [];
  const exp = [];
  const msp = [];

  for (const r of rows) {
    const crop = normCrop(r.crop || r.Crop);
    const state = normState(r.state || r.State || r.geo || r.Geography || "All India");
    const year = parseInt(r.year || r.Year, 10);

    if (!crop || !year) continue;

    if ((r.type || "").toUpperCase() === "FHP" || hasAny(r, ["FHP_whole","FHP","Season"])) {
      const season = r.season || r.Season || "Whole";
      const value = toNum(r.value ?? r.FHP_whole ?? r.Price ?? r.Value);
      fhp.push({ crop, state, year, season, value });
    }

    if ((r.type || "").toUpperCase() === "APY" || hasAny(r, ["Area","Prod","Yield"])) {
      apy.push({
        crop, state, year,
        Area: toNum(r.Area), Prod: toNum(r.Prod), Yield: toNum(r.Yield)
      });
    }

    if ((r.type || "").toUpperCase() === "COST" || hasAny(r, ["TotCost","BC","NetRet","GrossRet"])) {
      cost.push({
        crop, state, year,
        OpCost: toNum(r.OpCost), FixCost: toNum(r.FixCost), TotCost: toNum(r.TotCost),
        GrossRet: toNum(r.GrossRet), NetRet: toNum(r.NetRet), BC: toNum(r.BC)
      });
    }

    if ((r.type || "").toUpperCase() === "EXP" || hasAny(r, ["ExportsTot"])) {
      exp.push({ crop, state, year, ExportsTot: toNum(r.ExportsTot) });
    }

    if ((r.type || "").toUpperCase() === "MSP" || hasAny(r, ["MSP_Bajra","MSP_Ragi","MSP_Jowar_Hybrid","MSP_Jowar_Maldandi"])) {
      msp.push({
        crop, state: "All India", year,
        MSP_Bajra: toNum(r.MSP_Bajra), MSP_Ragi: toNum(r.MSP_Ragi),
        MSP_Jowar_Hybrid: toNum(r.MSP_Jowar_Hybrid), MSP_Jowar_Maldandi: toNum(r.MSP_Jowar_Maldandi)
      });
    }
  }

  // include states from cost/exp too (if any state info is present)
  const states = Array.from(new Set(
    fhp.map(d=>d.state)
      .concat(apy.map(d=>d.state))
      .concat(cost.map(d=>d.state))
      .concat(exp.map(d=>d.state))
  )).filter(Boolean);
  // include years from all sources (fhp, apy, cost, exp)
  const years = Array.from(new Set(
    fhp.map(d=>d.year)
      .concat(apy.map(d=>d.year))
      .concat(cost.map(d=>d.year))
      .concat(exp.map(d=>d.year))
  )).sort((a,b)=>a-b);

  return { fhp, apy, cost, exp, msp, crops: Array.from(new Set(apy.map(d=>d.crop))), states, years };
}

function hasAny(obj, keys) {
  return keys.some(k => obj[k] != null && obj[k] !== "");
}
function toNum(v) {
  const x = +v;
  return Number.isFinite(x) ? x : null;
}
function normState(s) {
  if (!s) return null;
  const x = String(s).trim();
  const fixes = { "Rajastan":"Rajasthan", "Chattisrgarh":"Chhattisgarh", "Chattisgarh":"Chhattisgarh" };
  return fixes[x] || x;
}
function normCrop(c) {
  if (!c) return null;
  const x = String(c).trim();
  if (/bajra/i.test(x)) return "Pearl Millet/Bajra";
  if (/jowar|sorghum/i.test(x)) return "Sorghum/Jowar";
  if (/ragi|finger/i.test(x)) return "Finger Millet/Ragi";
  if (/small|minor/i.test(x)) return "Small/Minor Millets";
  return x;
}

export function sliceFor(raw, crop, state) {
  const fhp = raw.fhp.filter(d => d.crop===crop && (state==="__NATIONAL__" ? d.state==="All India" : d.state===state));
  const apy = raw.apy.filter(d => d.crop===crop && (state==="__NATIONAL__" ? d.state==="All India" : d.state===state));
  const cost = raw.cost.filter(d => d.crop===crop && (state==="__NATIONAL__" ? d.state==="All India" : d.state===state));
  const exp = raw.exp.filter(d => d.crop===crop && ((state==="__NATIONAL__") ? d.state==="All India" : d.state===state));
  const msp = raw.msp.filter(d => d.crop===crop || true); // national MSP applies to all states; crop used downstream

  const years = Array.from(new Set([ ...apy.map(d=>d.year), ...fhp.map(d=>d.year), ...cost.map(d=>d.year), ...exp.map(d=>d.year)])).sort((a,b)=>a-b);
  return { crop, state: state==="__NATIONAL__" ? "All India" : state, years, fhp, apy, cost, exp, msp, allStates: raw.states, allYears: raw.years };
}

export function toCSV(rows) {
  if (!rows || rows.length===0) return "";
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const lines = [cols.join(",")].concat(rows.map(r => cols.map(k => r[k] ?? "").join(",")));
  return lines.join("\n");
}

export function featuresToCSV(fm) {
  const { featureNames, latestRow, latestYear } = fm;
  const rowObj = Object.fromEntries(featureNames.map((n,i)=>[n, latestRow[i]]));
  return toCSV([{ year: latestYear, ...rowObj }]);
}

export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}