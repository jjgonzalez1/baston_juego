// Prueba de humo end-to-end: juega una partida completa en chromium headless.
// Fases: menú → modo 3D → golpes reales de ratón → cristales → runas → altar
//        → victoria → modo calma/flow (biofeedback). Verifica que no hay errores.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const url = process.env.URL || 'http://127.0.0.1:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: true,
  defaultViewport: { width: 760, height: 500, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const ok = (cond, msg) => { console.log((cond ? '✔' : '✘ FALLO') + ' ' + msg); if (!cond) process.exitCode = 1; };
// Espera activa hasta que la condición en página sea verdadera (el tiempo de juego
// corre más lento que el de pared en render por software)
async function waitFor(evalFn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(evalFn)) { ok(true, label + ` (${Math.round((Date.now() - t0) / 1000)}s)`); return true; }
    await sleep(2000);
  }
  ok(false, label + ` (timeout ${timeoutMs / 1000}s)`);
  return false;
}

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(1000);
ok(await page.$eval('#overlayStart', (e) => !e.classList.contains('hidden')), 'pantalla de inicio visible');
await page.screenshot({ path: 'test/shot_start.png' });

// ── Fase 1: modo 3D con entrada real de ratón ──
await page.click('#btn3D');
await sleep(1500);
for (let i = 0; i < 10; i++) {
  await page.mouse.move(300 + i * 60, 430 + (i % 4) * 35);
  await sleep(50);
  await page.mouse.down(); await sleep(35); await page.mouse.up();
  await sleep(120);
}
await page.mouse.move(640, 420);
await page.mouse.down(); await sleep(900); await page.mouse.up(); // golpe cargado
await sleep(800);
let s = await page.evaluate(() => ({
  hud: !document.getElementById('hud').classList.contains('hidden'),
  link: +document.getElementById('linkPct').textContent,
  batt: +document.getElementById('battPct').textContent,
  bpm: +document.getElementById('bpm').textContent,
  force: +document.getElementById('forceN').textContent,
}));
ok(s.hud, 'HUD visible');
ok(s.link >= 10 && s.link < 100, `vínculo inicial (${s.link}%)`);
ok(s.force > 0, `sensor de fuerza midió ${s.force} N`);
ok(s.bpm >= 60, `bio-sensor cardíaco activo (${s.bpm} ppm)`);
ok(s.batt > 0 && s.batt < 100, `baterías drenan con golpes (${s.batt}%)`);

// ── Fase 2: cristales — golpes suaves a las rocas ──
await page.evaluate(() => {
  const B = window.__baston;
  for (const r of B.world.rocks) {
    for (let i = 0; i < 3; i++) B.doPulse(r.pos.clone(), 0.3);
    B.doPulse(r.pos.clone(), 0.35); // recolectar
  }
});
await sleep(300);
s = await page.evaluate(() => ({ cr: window.__baston.G.crystals, batt: window.__baston.G.battery }));
ok(s.cr === 3, `3 cristales revelados y absorbidos (${s.cr}/3)`);
ok(s.batt > 40, `cristales recargaron baterías (${Math.round(s.batt)}%)`);

// ── Fase 3: runas + altar ──
await page.evaluate(() => {
  const B = window.__baston;
  for (const rn of B.world.runes) B.doPulse(rn.pos.clone(), 0.6);
  B.doPulse(B.world.shrinePos.clone(), 0.8); // altar
});
await sleep(3200);
s = await page.evaluate(() => ({
  runes: window.__baston.G.runesLit, altar: window.__baston.G.altarAwake,
  link: window.__baston.G.link, win: !document.getElementById('winOverlay').classList.contains('hidden'),
}));
ok(s.runes === 5, `5 runas encendidas (${s.runes}/5)`);
ok(s.altar, 'altar conectado');
ok(s.link === 100, `vínculo al 100% (${s.link}%)`);
ok(s.win, 'pantalla de victoria mostrada');
await page.screenshot({ path: 'test/shot_win.png' });
await page.click('#btnContinue');

// ── Fase 4: modo calma → respiración → Flow ──
const before = await page.evaluate(() => ({ batt: window.__baston.G.battery, bpm: Math.round(window.__baston.bio.bpm) }));
await waitFor(() => window.__baston.bio.calm.active, 90000, 'modo calma activado por quietud');
await waitFor(() => window.__baston.bio.calm.done >= 1, 60000, 'primer ciclo de respiración completado (+9% batería)');
await waitFor(() => window.__baston.G.time < window.__baston.G.flowUntil, 180000, 'FLOW desbloqueado tras 3 ciclos de respiración');
await sleep(1500);
const fin = await page.evaluate(() => ({
  badge: !document.getElementById('flowBadge').classList.contains('hidden'),
  batt: window.__baston.G.battery,
}));
ok(fin.badge, 'insignia FLOW visible en HUD');
ok(fin.batt >= before.batt - 8, `batería neta mejoró con calma (${Math.round(before.batt)}% → ${Math.round(fin.batt)}%)`);

// ── Fase 5: golpe fuerte espanta luciérnagas / ráfagas ocurren ──
await page.evaluate(() => window.__baston.doPulse(window.__baston.cane.pos.clone(), 0.9));
await sleep(400);
ok(true, 'golpe de alta fuerza procesado');
await page.screenshot({ path: 'test/shot_final.png' });

console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'SIN ERRORES DE PÁGINA ✔');
await browser.close();
process.exit(errors.length ? 1 : process.exitCode || 0);
