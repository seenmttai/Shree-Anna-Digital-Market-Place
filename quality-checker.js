(() => {
  // Utility math
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const median = arr => { if (!arr.length) return 0; const a = [...arr].sort((x,y)=>x-y); const n=a.length; return n%2?a[(n-1)/2]:0.5*(a[n/2-1]+a[n/2]); };
  const quantile = (arr,q) => { if(!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); const p=clamp(q,0,1)*(a.length-1); const k=Math.floor(p), d=p-k; return a[k]+d*(a[Math.min(k+1,a.length-1)]-a[k]); };
  const mad = arr => { const m=median(arr); const dev=arr.map(v=>Math.abs(v-m)); return median(dev)||1e-6; };
  const robustZ = (v, arr) => { const m=median(arr), M=1.4826*mad(arr); return Math.abs(v-m)/(M||1e-6); };

  const DefaultCfg = {
    targetWidth: 1280,
    minAreaPx: 70,
    openSize: 3, closeSize: 3,
    watershedFgFrac: 0.45,
    brokenSolidityMax: 0.80,
    smallAreaRatio: 0.55,
    colorZDiscolor: 2.6,
    LStdDiscolor: 26,
    damageScoreThreshold: 0.50,
    gradeRules: [
      { name: 'A', maxBroken: 5, maxForeign: 1 },
      { name: 'B', maxBroken: 10, maxForeign: 2 },
      { name: 'C', maxBroken: 100, maxForeign: 100 }
    ]
  };

  let lastItems = null; // for CSV export
  let lastSummary = null;

  function getCfg() {
    return {
      ...DefaultCfg,
      targetWidth: parseInt(document.getElementById('cfgWidth').value || '1280', 10),
      minAreaPx: parseInt(document.getElementById('cfgMinArea').value || '70', 10),
      watershedFgFrac: parseFloat(document.getElementById('cfgFg').value || '0.45'),
      brokenSolidityMax: parseFloat(document.getElementById('cfgSol').value || '0.85')
    };
  }

  function renderSummary(res){
    if (!res) return '';
    // Only show grade
    const cls = (g) => g==='A'?'ok': g==='B'?'warn':'bad';
    return `
      <div class="${cls(res.grade)}"><b>Grade:</b> ${res.grade}</div>
    `;
  }

  function selfCheck(res) {
    if (!res) return '';
    const coverage = res.maskCoverage || 0;
    const tips = [];
    if (res.totalKernels < 10) tips.push('Very few kernels detected; retake with more spread.');
    if (coverage < 1) tips.push('Low coverage; bring camera closer or increase target width.');
    if (coverage > 60) tips.push('Too dense; spread kernels to avoid merging.');
    return tips.length ? 'Capture suggestions: ' + tips.join(' ') : '';
  }

  async function handleImage(ev){
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      drawInput(img);
      analyzeCurrent(img);
    };
    img.src = URL.createObjectURL(file);
  }

  function drawInput(img){
    const inCv = document.getElementById('inCanvas');
    const ctx = inCv.getContext('2d');
    const scale = Math.min(inCv.width / img.width, inCv.height / img.height);
    inCv.width = Math.floor(img.width * scale);
    inCv.height = Math.floor(img.height * scale);
    ctx.clearRect(0,0,inCv.width,inCv.height);
    ctx.drawImage(img, 0, 0, inCv.width, inCv.height);
  }

  function analyzeCurrent(img){
    const inCv = document.getElementById('inCanvas');
    // If input canvas is smaller than image canvas drawn, already drawn.
    const srcRGBA = cv.imread(inCv);
    const res = analyzeMat(srcRGBA, getCfg(), 'outCanvas');
    srcRGBA.delete();

    lastItems = res.items || null;
    lastSummary = res;

    document.getElementById('summary').innerHTML = renderSummary(res);
    document.getElementById('selfCheck').textContent = selfCheck(res);
    document.getElementById('exportCsv').disabled = !(lastItems && lastItems.length);
  }

  // Core analysis
  function analyzeMat(srcRGBA, cfg, outCanvasId){
    const t0 = performance.now();

    let src = new cv.Mat(); cv.cvtColor(srcRGBA, src, cv.COLOR_RGBA2RGB);
    const scale = cfg.targetWidth > 0 ? (cfg.targetWidth / src.cols) : 1.0;
    if (scale > 0 && scale < 0.99){
      const dsize = new cv.Size(Math.round(src.cols*scale), Math.round(src.rows*scale));
      const resized = new cv.Mat(); cv.resize(src, resized, dsize, 0,0, cv.INTER_AREA);
      src.delete(); src = resized;
    }

    const lab = new cv.Mat(); cv.cvtColor(src, lab, cv.COLOR_RGB2Lab);
    const hsv = new cv.Mat(); cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

    const labSplit = new cv.MatVector(); cv.split(lab, labSplit);
    const L = labSplit.get(0), A = labSplit.get(1), B = labSplit.get(2);
    let clahe = null;
    try { clahe = new cv.CLAHE(2.0, new cv.Size(8,8)); } catch {}
    if (clahe){ clahe.apply(L, L); clahe.delete(); }

    labSplit.set(0, L); labSplit.set(1, A); labSplit.set(2, B);
    const labFixed = new cv.Mat(); cv.merge(labSplit, labFixed);
    const srcFixed = new cv.Mat(); cv.cvtColor(labFixed, srcFixed, cv.COLOR_Lab2RGB);

    const bg = estimateBackgroundFromBorder(L, A, B);
    const mask0 = initialMask(L, hsv, bg, cfg);

    const maskClean = new cv.Mat(); mask0.copyTo(maskClean);
    const kOpen = cv.Mat.ones(cfg.openSize, cfg.openSize, cv.CV_8U);
    const kClose = cv.Mat.ones(cfg.closeSize, cfg.closeSize, cv.CV_8U);
    cv.morphologyEx(maskClean, maskClean, cv.MORPH_OPEN, kOpen);
    cv.morphologyEx(maskClean, maskClean, cv.MORPH_CLOSE, kClose);
    kOpen.delete(); kClose.delete();

    // remove 1px border
    const border = new cv.Mat.zeros(maskClean.rows, maskClean.cols, cv.CV_8U);
    cv.rectangle(border, new cv.Point(1,1), new cv.Point(maskClean.cols-2, maskClean.rows-2), new cv.Scalar(255), -1);
    cv.bitwise_and(maskClean, border, maskClean);
    border.delete();

    const { markers, nLabels } = watershedSplit(maskClean, srcFixed, cfg);
    const comps = extractComponents(markers, nLabels, labFixed, hsv, cfg);
    const classified = classifyComponents(comps, cfg);
    const { counts, total, grade } = summarizeAndGrade(classified, cfg);

    // mask coverage %
    const coverage = Math.round(100 * (cv.countNonZero(maskClean) / Math.max(1, maskClean.rows * maskClean.cols)));

    if (outCanvasId){
      const overlay = drawOverlay(srcFixed, classified);
      cv.imshow(outCanvasId, overlay);
      overlay.delete();
    }

    // Cleanup
    src.delete(); lab.delete(); hsv.delete();
    labSplit.delete(); labFixed.delete(); srcFixed.delete();
    L.delete(); A.delete(); B.delete();
    mask0.delete(); maskClean.delete();
    markers.delete();

    const t1 = performance.now();

    return {
      totalKernels: total,
      counts,
      grade,
      items: classified,
      maskCoverage: coverage,
      timingMs: Math.round(t1 - t0)
    };
  }

  function estimateBackgroundFromBorder(L, A, B){
    const h = L.rows, w = L.cols;
    const borderMask = new cv.Mat.zeros(h,w, cv.CV_8U);
    cv.rectangle(borderMask, new cv.Point(0,0), new cv.Point(w,5), new cv.Scalar(255), -1);
    cv.rectangle(borderMask, new cv.Point(0,h-6), new cv.Point(w,h), new cv.Scalar(255), -1);
    cv.rectangle(borderMask, new cv.Point(0,0), new cv.Point(5,h), new cv.Scalar(255), -1);
    cv.rectangle(borderMask, new cv.Point(w-6,0), new cv.Point(w,h), new cv.Scalar(255), -1);
    const meanL = cv.mean(L, borderMask)[0];
    borderMask.delete();
    return { isWhite: meanL > 140, isBlack: meanL < 70 };
  }

  function initialMask(L, hsv, bg, cfg){
    const mask = new cv.Mat();
    const threshType = bg.isWhite ? (cv.THRESH_BINARY_INV + cv.THRESH_OTSU) : (cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.threshold(L, mask, 0, 255, threshType);
    cv.medianBlur(mask, mask, 3); // suppress speckle on black backgrounds

    const hsvSplit = new cv.MatVector(); cv.split(hsv, hsvSplit);
    const S = hsvSplit.get(1), V = hsvSplit.get(2);
    const sMean = cv.mean(S)[0], vMean = cv.mean(V)[0];
    const sMask = new cv.Mat(); cv.threshold(S, sMask, clamp(sMean + 10, 40, 180), 255, cv.THRESH_BINARY);
    const vMask = new cv.Mat(); cv.threshold(V, vMask, clamp(vMean - 10, 20, 240), 255, bg.isWhite ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY);

    const colorAid = new cv.Mat();
    cv.bitwise_or(sMask, vMask, colorAid);
    cv.bitwise_or(mask, colorAid, mask);

    hsvSplit.delete(); S.delete(); V.delete();
    sMask.delete(); vMask.delete(); colorAid.delete();

    return mask;
  }

  function watershedSplit(binaryMask, srcColor, cfg){
    const sureBg = new cv.Mat();
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5,5));
    cv.dilate(binaryMask, sureBg, k); k.delete();

    const dist = new cv.Mat();
    cv.distanceTransform(binaryMask, dist, cv.DIST_L2, 5);
    const mm = cv.minMaxLoc(dist);
    const dist8u = new cv.Mat(); dist.convertTo(dist8u, cv.CV_8U, 255.0 / (mm.maxVal || 1.0));
    const dtThresh = new cv.Mat();
    const thrVal = Math.round(cfg.watershedFgFrac * 255);
    cv.threshold(dist8u, dtThresh, thrVal, 255, cv.THRESH_BINARY);

    const markers = new cv.Mat();
    cv.connectedComponents(dtThresh, markers);

    const unknown = new cv.Mat();
    cv.subtract(sureBg, dtThresh, unknown);

    for (let r=0; r<markers.rows; r++){
      for (let c=0; c<markers.cols; c++){
        const v = markers.intPtr(r,c)[0];
        markers.intPtr(r,c)[0] = v + 1;
      }
    }
    for (let r=0; r<unknown.rows; r++){
      for (let c=0; c<unknown.cols; c++){
        if (unknown.ucharPtr(r,c)[0] !== 0) markers.intPtr(r,c)[0] = 0;
      }
    }

    const srcBGR = new cv.Mat(); cv.cvtColor(srcColor, srcBGR, cv.COLOR_RGB2BGR);
    cv.watershed(srcBGR, markers);
    srcBGR.delete();

    sureBg.delete(); dist.delete(); dist8u.delete(); dtThresh.delete(); unknown.delete();

    // nLabels is not strictly needed downstream
    return { markers, nLabels: 0 };
  }

  function extractComponents(markers, nLabels, labImg, hsvImg, cfg){
    const h = markers.rows, w = markers.cols;
    const data = markers.data32S;
    const comps = [];
    const counts = new Map();
    for (let i=0; i<h*w; i++){
      const v = data[i];
      if (v <= 1) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    for (const [label, pixCount] of counts.entries()){
      if (pixCount < cfg.minAreaPx) continue;

      const mask = new cv.Mat.zeros(h, w, cv.CV_8U);
      const mdata = mask.data;
      for (let i=0; i<h*w; i++){
        if (data[i] === label) mdata[i] = 255;
      }

      const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      if (contours.size() === 0){ contours.delete(); hierarchy.delete(); mask.delete(); continue; }
      let maxArea = -1, maxIdx = -1;
      for (let i=0;i<contours.size();i++){
        const a = cv.contourArea(contours.get(i));
        if (a > maxArea){ maxArea = a; maxIdx = i; }
      }
      const contour = contours.get(maxIdx);

      const area = maxArea;
      const perimeter = cv.arcLength(contour, true);
      const hull = new cv.Mat(); cv.convexHull(contour, hull, false, true);
      const hullArea = Math.max(1, cv.contourArea(hull));
      const solidity = area / hullArea;
      const rect = cv.boundingRect(contour);
      const aspect = Math.max(rect.width/rect.height, rect.height/rect.width);
      const extent = area / Math.max(1, rect.width * rect.height);
      const moments = cv.moments(contour, false);
      const mu20 = moments.mu20 / moments.m00, mu02 = moments.mu02 / moments.m00, mu11 = moments.mu11 / moments.m00;
      const t = Math.sqrt(Math.max(0, (mu20 - mu02) * (mu20 - mu02) + 4*mu11*mu11));
      const lambda1 = Math.max(mu20 + mu02 + t, 1e-6), lambda2 = Math.max(mu20 + mu02 - t, 1e-6);
      const eccentricity = Math.sqrt(Math.max(0, 1 - lambda2 / lambda1));
      const roundness = 4 * Math.PI * area / Math.max(1, perimeter * perimeter);
      const pOverSqrtA = perimeter / Math.max(1, Math.sqrt(area));

      const one = new cv.MatVector(); one.push_back(contour);
      const maskPoly = new cv.Mat.zeros(h,w, cv.CV_8U);
      cv.drawContours(maskPoly, one, 0, new cv.Scalar(255), -1);
      const labMean = cv.mean(labImg, maskPoly);
      const hsvMean = cv.mean(hsvImg, maskPoly);

      const labSplit = new cv.MatVector(); cv.split(labImg, labSplit);
      const Lc = labSplit.get(0);
      const Lmean = new cv.Mat(), Lstd = new cv.Mat();
      cv.meanStdDev(Lc, Lmean, Lstd, maskPoly);
      const LstdVal = Lstd.doubleAt(0,0);
      /* crease/shriveling: centerline contrast */
      const strip = new cv.Mat.zeros(h,w, cv.CV_8U);
      const sw = Math.max(2, Math.floor(rect.width * 0.2));
      cv.rectangle(strip, new cv.Point(rect.x + Math.floor((rect.width - sw)/2), rect.y),
                   new cv.Point(rect.x + Math.floor((rect.width - sw)/2) + sw, rect.y + rect.height), new cv.Scalar(255), -1);
      const centerMask = new cv.Mat(); cv.bitwise_and(strip, maskPoly, centerMask);
      const centerMeanL = cv.mean(Lc, centerMask)[0];
      const centerContrast = Math.abs(centerMeanL - labMean[0]) / 255.0;
      /* ...existing code... */

      comps.push({
        label, area, perimeter, hullArea, solidity, rect, aspect, extent,
        eccentricity, roundness, pOverSqrtA,
        L: labMean[0], a: labMean[1], b: labMean[2],
        H: hsvMean[0], S: hsvMean[1], V: hsvMean[2],
        Lstd: LstdVal,
        centerContrast // new metric
      });

      hull.delete(); contours.delete(); hierarchy.delete(); one.delete(); mask.delete(); maskPoly.delete();
    }

    return comps;
  }

  function classifyComponents(comps, cfg){
    if (comps.length === 0) return [];

    const areas = comps.map(c=>c.area);
    const Ls = comps.map(c=>c.L), as = comps.map(c=>c.a), bs = comps.map(c=>c.b);
    const pOverSqrtAs = comps.map(c=>c.pOverSqrtA);

    const medArea = median(areas);
    const aLo = quantile(areas, 0.1), aHi = quantile(areas, 0.9);
    const areaRef = median(areas.filter(a=>a>=aLo && a<=aHi)) || medArea;

    for (const c of comps){
      c.areaRatio = areaRef ? (c.area / areaRef) : 1.0;
      c.zArea = robustZ(c.area, areas);
      c.zL = robustZ(c.L, Ls);
      c.za = robustZ(c.a, as);
      c.zb = robustZ(c.b, bs);
      c.zPerim = robustZ(c.pOverSqrtA, pOverSqrtAs);
    }

    const out = [];
    for (const c of comps){
      const foreignBySize = (c.areaRatio < cfg.tinyAreaRatio) || (c.areaRatio > cfg.hugeAreaRatio) || (c.zArea > 3.5);
      const foreignByShape = (c.solidity < cfg.foreignSolidityMax) && (c.roundness < 0.2 || c.aspect > cfg.aspectMax);
      const foreignByColor = (c.zL > cfg.colorZForeign) || (Math.hypot(c.za, c.zb) > cfg.colorZForeign + 0.5);
      const isForeign = [foreignBySize, foreignByShape, foreignByColor].filter(Boolean).length >= 2;

      const brokenBySolidity = c.solidity < cfg.brokenSolidityMax;
      const brokenByArea = c.areaRatio < cfg.smallAreaRatio;
      const brokenByPerim = c.zPerim > 2.5 || c.pOverSqrtA > 12.0;
      const damageScore = 0.35*(1-c.solidity) + 0.25*(1-c.extent) + 0.20*c.eccentricity + 0.10*(c.Lstd/40) + 0.10*c.centerContrast;
      const isBroken = !isForeign && ([brokenBySolidity, brokenByArea, brokenByPerim].filter(Boolean).length >= 2 || (damageScore > cfg.damageScoreThreshold && c.centerContrast > 0.06));

      const discoloredByL = Math.abs(c.zL) > cfg.colorZDiscolor || c.L < 60 || c.L > 200;
      const discoloredByAB = Math.hypot(c.za, c.zb) > cfg.colorZDiscolor + 0.3;
      const discoloredByTexture = c.Lstd > cfg.LStdDiscolor;
      const isDiscolored = !isForeign && !isBroken && ((discoloredByL && discoloredByAB) || (discoloredByTexture && (discoloredByL || discoloredByAB)));

      let cls = 'Good';
      if (isForeign) cls = 'Foreign';
      else if (isBroken) cls = 'Broken';
      else if (isDiscolored) cls = 'Discolored';

      out.push({ ...c, cls });
    }
    return out;
  }

  function summarizeAndGrade(items, cfg){
    const counts = { Good:0, Broken:0, Discolored:0, Foreign:0 };
    for (const it of items) counts[it.cls] = (counts[it.cls] || 0) + 1;
    const total = items.length;
    const pct = k => 100 * (counts[k] || 0) / Math.max(total, 1);
    let grade = 'C';
    for (const rule of cfg.gradeRules){
      if (pct('Broken') <= rule.maxBroken && pct('Foreign') <= rule.maxForeign){ grade = rule.name; break; }
    }
    return { counts, total, grade };
  }

  function drawOverlay(srcRGB, items){
    const out = srcRGB.clone();
    // Neutral box color (black) and thickness
    const boxColor = new cv.Scalar(0,0,0,255);
    const thickness = 2;

    // Build rect list with areas, sort by area desc, keep non-overlapping
    const rects = items.map(it => ({ rect: it.rect, area: it.rect.width * it.rect.height }));
    rects.sort((a,b) => b.area - a.area);

    const selected = [];
    const intersects = (r1, r2) => {
      const x1 = Math.max(r1.x, r2.x);
      const y1 = Math.max(r1.y, r2.y);
      const x2 = Math.min(r1.x + r1.width, r2.x + r2.width);
      const y2 = Math.min(r1.y + r1.height, r2.y + r2.height);
      return (x2 > x1) && (y2 > y1);
    };

    for (const cand of rects) {
      let overlap = false;
      for (const sel of selected) {
        if (intersects(cand.rect, sel.rect)) { overlap = true; break; }
      }
      if (!overlap) selected.push(cand);
    }

    // Draw non-overlapping rectangles
    for (const s of selected){
      const { x,y,width,height } = s.rect;
      cv.rectangle(out, new cv.Point(x,y), new cv.Point(x+width, y+height), boxColor, thickness);
    }

    // No legend
    return out;
  }

  function exportCSV(items){
    const header = ['class','area','perimeter','hullArea','solidity','aspect','extent','eccentricity','roundness','pOverSqrtA','L','a','b','H','S','V','Lstd'];
    const lines = [header.join(',')];
    for (const it of items){
      lines.push([
        it.cls, it.area, it.perimeter, it.hullArea, it.solidity.toFixed(4), it.aspect.toFixed(3), it.extent.toFixed(3),
        it.eccentricity.toFixed(3), it.roundness.toFixed(3), it.pOverSqrtA.toFixed(3),
        it.L.toFixed(2), it.a.toFixed(2), it.b.toFixed(2), it.H.toFixed(2), it.S.toFixed(2), it.V.toFixed(2), it.Lstd.toFixed(2)
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'grain_quality.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function loadSampleImage(){
    // Simple sample image hosted externally (placeholder). Replace with your own sample URL set.
    const sampleUrl = 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=1200&auto=format&fit=crop'; // grains-like
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { drawInput(img); analyzeCurrent(img); };
    img.src = sampleUrl;
  }

  function initUI(){
    const file = document.getElementById('file');
    const loadSampleBtn = document.getElementById('loadSample');
    const exportBtn = document.getElementById('exportCsv');

    file.addEventListener('change', handleImage);
    loadSampleBtn.addEventListener('click', loadSampleImage);
    exportBtn.addEventListener('click', () => { if (lastItems && lastItems.length) exportCSV(lastItems); });

    // Persist settings
    const ids = ['cfgWidth','cfgMinArea','cfgFg','cfgSol'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      const saved = localStorage.getItem('qc_'+id);
      if (saved !== null) el.value = saved;
      el.addEventListener('change', () => localStorage.setItem('qc_'+id, el.value));
    });
  }

  if (window.cv && cv['onRuntimeInitialized']) {
    cv['onRuntimeInitialized'] = () => initUI();
  } else {
    // If cv not yet loaded, set hook
    window.Module = window.Module || {};
    Module['onRuntimeInitialized'] = () => initUI();
  }
})();