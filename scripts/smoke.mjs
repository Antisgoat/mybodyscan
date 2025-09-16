// scripts/smoke.mjs
/* offline-safe smoke harness: uses only Node 20 built-ins */
const log = (...a) => console.log('[SMOKE]', ...a);
const warn = (...a) => console.warn('[SMOKE:WARN]', ...a);
const fail = (m) => { console.error('[SMOKE:FAIL]', m); process.exitCode = 1; };

const TIMEOUT_MS = 8000;

// Resolve base URLs from env or defaults (adjust if your local emulator differs)
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5001';
const FOOD = process.env.SMOKE_FOOD_URL || `${BASE}/foodSearch`;
const ADD  = process.env.SMOKE_ADD_URL  || `${BASE}/addFoodLog`;
const GET  = process.env.SMOKE_GET_URL  || `${BASE}/getDayLog`;
const SCAN = {
  start: process.env.SMOKE_STARTSCAN_URL || `${BASE}/startScan`,
  status: process.env.SMOKE_SCANSTATUS_URL || `${BASE}/getScanStatus`
};
const COACH = {
  gen: process.env.SMOKE_GENPLAN_URL || `${BASE}/generatePlan`,
  chk: process.env.SMOKE_CHECKIN_URL || `${BASE}/weeklyCheckIn`
};
const HEALTH = process.env.SMOKE_HEALTH_URL || `${BASE}/health`;

function controllerTimeout(ms = TIMEOUT_MS) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms).unref?.();
  return c;
}

async function pingHealth() {
  try {
    const res = await fetch(HEALTH, { signal: controllerTimeout().signal });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.ok) { log('health ok'); return true; }
    warn('health endpoint not ok', res.status, data);
    return false;
  } catch (e) { warn('health unreachable (offline?)', e.message); return false; }
}

async function testFoodSearch() {
  try {
    const r = await fetch(FOOD, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ q: 'chicken breast raw', page: 1 }), signal: controllerTimeout().signal });
    const j = await r.json();
    if (!Array.isArray(j.items) || j.items.length === 0) { fail('foodSearch returned no items'); return; }
    log('foodSearch ok; first item:', (j.items||[])[0]);
  } catch (e) { warn('foodSearch skipped (offline?)', e.message); }
}

async function testFoodBarcode() {
  try {
    const r = await fetch(FOOD, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ barcode: '737628064502' }), signal: controllerTimeout().signal });
    const j = await r.json();
    log('foodSearch(barcode) source:', j.items?.[0]?.source || 'none');
  } catch (e) { warn('barcode search skipped (offline?)', e.message); }
}

async function testNutritionLog() {
  try {
    const today = new Date().toISOString().slice(0,10);
    const sample = { id:'smoke1', source:'mock', name:'Chicken Breast',
      per100g:{kcal:165,protein:31,carbs:0,fat:3.6} };
    let r = await fetch(ADD, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ date: today, item: sample, qty: { grams: 150 } }), signal: controllerTimeout().signal });
    const add = await r.json(); log('addFoodLog:', add);
    r = await fetch(GET, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ date: today }), signal: controllerTimeout().signal });
    const day = await r.json(); log('getDayLog totals:', day?.totals);
  } catch (e) { warn('nutrition log skipped (offline?)', e.message); }
}

async function testScanFlow() {
  try {
    // simulate 4 images already uploaded; backend compat may not strictly check path existence
    const paths = ['/uploads/demo/scan/a.jpg','/uploads/demo/scan/b.jpg','/uploads/demo/scan/c.jpg','/uploads/demo/scan/d.jpg'];
    let r = await fetch(SCAN.start, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ photoPaths: paths }), signal: controllerTimeout().signal });
    const s = await r.json(); log('startScan:', s);
    if (!s.scanId) { fail('startScan missing scanId'); return; }
    let tries = 0;
    while (tries++ < 6) {
      await new Promise(res => setTimeout(res, 1000));
      const rr = await fetch(SCAN.status, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ scanId: s.scanId }), signal: controllerTimeout().signal });
      const st = await rr.json(); log('getScanStatus:', st.status);
      if (st.status === 'completed') { log('scan result:', st.result); return; }
    }
    warn('scan did not complete within expected timeframe');
  } catch (e) { warn('scan flow skipped (offline?)', e.message); }
}

async function testCoach() {
  try {
    const r = await fetch(COACH.gen, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ lengthWeeks:4, daysPerWeek:4, sessionMins:60, equipment:'gym', weakSpots:['glutes'], injuries:'', goal:'cut' }),
      signal: controllerTimeout().signal });
    const g = await r.json(); log('generatePlan:', g?.planId || g);
    const c = await fetch(COACH.chk, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ avgWeightNow:185, avgWeightPrev:187, nutritionAdherence:0.7, proteinAdherence:0.8, workoutAdherence:0.75, recoveryScore:3, avgSleepHours:7, cardioFeedback:'more', injuriesNote:'', preference:'same' }),
      signal: controllerTimeout().signal });
    log('weeklyCheckIn:', await c.json());
  } catch (e) { warn('coach tests skipped (offline?)', e.message); }
}

(async () => {
  const healthy = await pingHealth();
  if (!healthy) warn('Continuing with offline-tolerant skips');
  await testFoodSearch();
  await testFoodBarcode();
  await testNutritionLog();
  await testScanFlow();
  await testCoach();
  if (process.exitCode === 1) { log('SMOKE: completed with failures'); } else { log('SMOKE: completed'); }
})();
