import { FEATURE_EXPLANATIONS } from './features.js';

export function populateStates(selectEl, states) {
  const keep = selectEl.value;
  selectEl.innerHTML = "";
  const optN = document.createElement("option");
  optN.value="__NATIONAL__"; optN.textContent = "All India (National)";
  selectEl.appendChild(optN);
  const sorted = states.filter(s=>s!=="All India").sort();
  sorted.forEach(s=>{
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    selectEl.appendChild(o);
  });
  // set to previous if still available; else pick a valid fallback
  if (keep && Array.from(selectEl.options).some(o=>o.value===keep)) {
    selectEl.value = keep;
  } else if (states.includes("All India")) {
    selectEl.value = "__NATIONAL__";
  } else if (sorted.length) {
    selectEl.value = sorted[0];
  }
}

export function getFeatureBlocks() {
  const checks = Array.from(document.querySelectorAll(".fg"));
  const obj = { A:false,B:false,C:false,D:false,E:false,F:false };
  checks.forEach(c=> obj[c.dataset.block] = c.checked);
  return obj;
}

export function renderMetrics(el, m) {
  el.innerHTML = `
    <div>Number of years of data used: ${m.n}</div>
    <div>Number of factors considered: ${m.p}</div>
    <div>Average prediction error (on past data): ${(m.mape*100).toFixed(1)}%</div>
  `;
}

export function renderInsights(ul, notes) {
  ul.innerHTML = "";
  notes.forEach(n => {
    const li = document.createElement("li");
    li.textContent = n;
    ul.appendChild(li);
  });
}

export function renderFeatureTable(container, feat, latestYear) {
  const { featureNames, latestRow } = feat;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Factor Name</th><th>Value in ${latestYear}</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  featureNames.forEach((n,i)=>{
    const friendlyName = getFriendlyFeatureName(n);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${friendlyName}</td><td>${formatValue(n, latestRow[i])}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

export function renderDriversList(container, topRaw) {
  container.innerHTML = "";
  const ul = document.createElement("ul");
  ul.className = "insights";
  topRaw.forEach(d=>{
    const li = document.createElement("li");
    const friendlyName = getFriendlyFeatureName(d.name);
    li.textContent = `${friendlyName}`;
    // Add a simple visual indicator for impact
    const impact = d.value;
    const indicator = document.createElement('span');
    indicator.style.display = 'inline-block';
    indicator.style.marginLeft = '8px';
    indicator.style.fontWeight = 'bold';
    if (impact > 0) {
      indicator.textContent = '▲ (Pushes price up)';
      indicator.style.color = '#16a34a'; // green
    } else {
      indicator.textContent = '▼ (Pushes price down)';
      indicator.style.color = '#dc2626'; // red
    }
    li.appendChild(indicator);
    ul.appendChild(li);
  });
  container.appendChild(ul);
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

function num(x) {
  if (x==null || !Number.isFinite(x)) return "—";
  const ax = Math.abs(x);
  if (ax >= 1e6) return (x/1e6).toFixed(2)+"M";
  if (ax >= 1e3) return (x/1e3).toFixed(2)+"k";
  if (ax >= 100) return x.toFixed(0);
  return x.toFixed(2);
}

function formatValue(name, x) {
  if (x==null || !Number.isFinite(x)) return "—";
  // Percent-like features
  if (/(^|_)(yoy|cagr|accel|share|cv)(_|$)/i.test(name)) {
    return (x*100).toFixed(1) + "%";
  }
  // Ratios / coverage / BC
  if (/(ratio|cov|^C5_BC$)/i.test(name)) {
    return x.toFixed(2) + "x";
  }
  return num(x);
}