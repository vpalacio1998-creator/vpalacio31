// Video del administrador: su rutina diaria paso a paso (datos de ejemplo en OLI local) + ingreso y "Crear cuenta" en producción (sin guardar).
import { chromium } from 'playwright'; import fs from 'fs';
fs.mkdirSync('shots', { recursive: true });
const URL = process.env.BASE || 'http://localhost:8090/', PROD = 'https://oli-pos.vercel.app/', sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, s = 20) { for (let i = 0; i < s * 4; i++) { try { if (await fn()) return true; } catch (e) {} await sleep(250); } return false; }
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--headless=new', '--no-sandbox'] } : {});
const dev = async (w, h, dsf) => (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, acceptDownloads: true })).newPage();
const shot = async (pg, n) => { await pg.waitForTimeout(800); await pg.screenshot({ path: `shots/${n}.png` }); console.log('captura', n); };
const go = async (pg, r) => { await pg.evaluate(r => { location.hash = '#' + r; }, r); await pg.waitForTimeout(1600); await pg.evaluate(() => window.scrollTo(0, 0)); };
const nombreEquipo = async pg => { if (await waitFor(async () => (await pg.locator('[data-act="doNombreEquipo"]').count()) > 0, 12)) { await pg.locator('#panel [data-act="elegir"]').first().click().catch(() => {}); await pg.click('[data-act="doNombreEquipo"]'); await pg.waitForTimeout(800); } };
const cerrar = async pg => { await pg.click('#panel [data-act="cerrar"]').catch(() => {}); await pg.waitForTimeout(500); };
try {
  // celular del administrador, un mes de datos de ejemplo
  const A = await dev(390, 844, 3);
  await A.goto(URL); await waitFor(async () => (await A.locator('[data-act="empezarDemo"]').count()) > 0, 30);
  await A.click('[data-act="empezarDemo"]'); await waitFor(async () => /Así va OLI|Buenas/.test(await A.innerText('#view')), 40); await nombreEquipo(A);
  await go(A, 'hoy'); await shot(A, 'a01_inicio');
  const h = A.locator('text=¿Qué deberías hacer?').first(); if (await h.count()) { await h.scrollIntoViewIfNeeded(); await A.evaluate(() => window.scrollBy(0, -70)); } await shot(A, 'a02_hacer');
  await go(A, 'compras'); await shot(A, 'a03_pedir');
  await A.locator('[data-act="porque"]').first().click(); await shot(A, 'a04_porque'); await cerrar(A);
  await A.click('[data-act="generarPedido"]'); await A.waitForTimeout(500); await A.fill('#gp-prov', 'Paletas del Quindío'); await shot(A, 'a05_pedido');
  await A.click('[data-act="doPedido"]'); await A.waitForTimeout(1200);
  await A.click('[data-act="comprasTab"][data-v="lista"]'); await A.waitForTimeout(900);
  await A.locator('[data-act="recibir"]').first().click(); await A.waitForTimeout(600);
  await A.click('#panel [data-act="elegir"][data-v="Factura electrónica"]').catch(() => {}); await A.fill('#rf-fac', 'FE-10482').catch(() => {}); await A.evaluate(() => document.querySelector('#panel').scrollTo(0, 0)); await shot(A, 'a06_recibir');
  await A.click('[data-act="doRecibir"]'); await A.waitForTimeout(1300);
  await go(A, 'inventario'); await A.locator('[data-act="verProd"]').first().click(); await shot(A, 'a07_inventario'); await cerrar(A);
  await go(A, 'finanzas'); await A.click('[data-act="nuevoGasto"]'); await A.waitForTimeout(500);
  await A.fill('#gs-v', '85.000'); await A.dispatchEvent('#gs-v', 'input'); await A.click('#panel [data-act="elegir"][data-v="Servicios"]'); await A.click('#panel [data-act="elegir"][data-v="Transferencia"]'); await A.fill('#gs-d', 'Recibo de luz').catch(() => {}); await shot(A, 'a08_gasto');
  await A.click('[data-act="doGasto"]'); await A.waitForTimeout(1300); await go(A, 'finanzas'); await shot(A, 'a09_dinero');
  await go(A, 'hoy'); await A.click('[data-act="verFijos"]'); await shot(A, 'a10_fijos'); await cerrar(A);
  await go(A, 'inventario'); await A.locator('[data-act="verProd"]').nth(1).click(); await A.waitForTimeout(500); await A.click('#panel [data-act="contar"]'); await A.waitForTimeout(500);
  await A.fill('#ct-q', '12'); await A.dispatchEvent('#ct-q', 'input'); await A.click('#panel [data-act="elegir"][data-v="Conteo de rutina"]').catch(() => {}); await shot(A, 'a11_contar'); await cerrar(A);
  // computador: informes y auditoría (mismos datos de ejemplo)
  const C = await dev(1440, 900, 1.5); await C.goto(URL); await waitFor(async () => (await C.locator('[data-act="empezarDemo"]').count()) > 0, 30);
  await C.click('[data-act="empezarDemo"]'); await waitFor(async () => /Así va OLI|Buenas/.test(await C.innerText('#view')), 40); await nombreEquipo(C);
  await go(C, 'reportes'); await C.click('[data-act="rangoInf"][data-v="mes"]').catch(() => {}); await shot(C, 'a13_informes');
  await go(C, 'equipo'); const hc = C.locator('text=Historial de cambios').first(); if (await hc.count()) { await hc.scrollIntoViewIfNeeded(); await C.evaluate(() => window.scrollBy(0, -80)); } await shot(C, 'a15_historial');
} catch (err) { console.log('EXCEPCION', String(err.message).split('\n')[0]); }
// producción real: ingreso del administrador y "Crear cuenta" (se llena, NO se guarda)
if (process.env.ADM_PASS) try {
  const P = await dev(390, 844, 3); await P.goto(PROD); await P.waitForSelector('#lg-mail', { timeout: 30000 });
  await P.type('#lg-mail', 'admin@oli.app', { delay: 25 }); await P.type('#lg-pass', process.env.ADM_PASS, { delay: 25 }); await shot(P, 'a00_ingreso');
  const C2 = await dev(1440, 900, 1.5); await C2.goto(PROD); await C2.waitForSelector('#lg-mail', { timeout: 30000 });
  await C2.fill('#lg-mail', 'admin@oli.app'); await C2.fill('#lg-pass', process.env.ADM_PASS); await C2.click('[data-act="login"]');
  await waitFor(async () => (await C2.locator('#lg-mail').count()) === 0, 30); await C2.waitForTimeout(3000); await nombreEquipo(C2);
  await go(C2, 'equipo'); await C2.click('[data-act="nuevaCuenta"]'); await C2.waitForTimeout(500);
  await C2.fill('#nc-n', 'Laura'); await C2.fill('#nc-m', 'laura@ejemplo.com'); await C2.fill('#nc-p', 'Paleteria2026'); await shot(C2, 'a12_crear_cuenta'); await cerrar(C2);
} catch (err) { console.log('EXCEPCION_PROD', String(err.message).split('\n')[0]); }
await b.close(); console.log('FIN_CAPTURA3');
