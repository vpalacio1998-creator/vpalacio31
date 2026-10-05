import { chromium } from 'playwright';
const URL = 'https://oli-pos.vercel.app/', E_PASS = process.env.EMP_PASS, A_PASS = process.env.ADM_PASS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, s = 20) { for (let i = 0; i < s * 4; i++) { try { if (await fn()) return true; } catch (e) {} await sleep(250); } return false; }
const b = await chromium.launch();
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
async function dev(w, h, dsf, ua) { const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, userAgent: ua, hasTouch: !!ua }); if (ua) await ctx.addInitScript("Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5})"); const pg = await ctx.newPage(); return { ctx, pg }; }
const shot = async (pg, n) => { await pg.waitForTimeout(700); await pg.screenshot({ path: `shots/${n}.png` }); console.log('captura', n); };
async function login(pg, mail, pass) {
  await pg.goto(URL); await pg.waitForSelector('#lg-mail', { timeout: 30000 });
  await pg.click('#lg-mail'); await pg.type('#lg-mail', mail, { delay: 30 }); await pg.click('#lg-pass'); await pg.type('#lg-pass', pass, { delay: 30 });
  return async () => { await pg.click('[data-act="login"]');
    await waitFor(async () => (await pg.locator('#lg-mail').count()) === 0, 30);
    await waitFor(async () => (await pg.locator('[data-act="tile"]').count()) > 0 || /Hoy|Así va OLI/.test(await pg.innerText('#view')), 40);
    if (await waitFor(async () => (await pg.locator('[data-act="doNombreEquipo"]').count()) > 0, 15)) { await pg.locator('#panel [data-act="elegir"]').first().click().catch(() => {}); await pg.click('[data-act="doNombreEquipo"]'); await pg.waitForTimeout(1200); } };
}
const go = async (pg, r) => { await pg.evaluate(r => { location.hash = '#' + r; }, r); await pg.waitForTimeout(1800); await pg.evaluate(() => window.scrollTo(0, 0)); };
import fs from 'fs'; fs.mkdirSync('shots', { recursive: true });
try {
  // instalar (iPad, pantalla de ingreso)
  const i = await dev(1180, 820, 2, IPAD); await i.pg.goto(URL); await i.pg.waitForSelector('#lg-mail'); await i.pg.waitForTimeout(1500);
  await shot(i.pg, '01_ingreso'); await i.pg.click('[data-act="instalar"]'); await shot(i.pg, '02_instalar'); await i.ctx.close();
  // empleada en tablet
  const e = await dev(1180, 820, 2), E = e.pg; const entrar = await login(E, 'empleado@oli.app', E_PASS); await shot(E, '03_ingreso_lleno'); await entrar();
  await shot(E, '04_vender');
  await E.click('[data-act="abrirCaja"]'); await E.waitForTimeout(500); await E.click('[data-act="aperturaMonto"][data-v="50000"]'); await shot(E, '05_abrir_caja');
  await E.click('[data-act="doAbrir"]'); await E.waitForTimeout(1500);
  for (const p of ['p-pal-milky', 'p-pal-milky', 'p-cafe']) { await E.click(`[data-act="tile"][data-id="${p}"]`); await E.waitForTimeout(250); }
  await shot(E, '06_pedido');
  await E.click('#ticket [data-act="cobrar"]'); await E.waitForTimeout(500); await E.click('[data-act="metodo"][data-v="Efectivo"]'); await E.waitForTimeout(300);
  await E.click('[data-act="recibido"][data-v="50000"]').catch(() => {}); await shot(E, '07_cobrar');
  await E.click('[data-act="confirmarVenta"]'); await E.waitForTimeout(900); await shot(E, '08_venta_lista');
  await E.click('#panel [data-act="cerrar"]').catch(() => {}); await E.waitForTimeout(500);
  // sin internet
  await e.ctx.setOffline(true); await E.waitForTimeout(1000);
  await E.click('[data-act="tile"][data-id="p-g12-mango"]'); await E.waitForTimeout(250); await E.click('#ticket [data-act="cobrar"]'); await E.waitForTimeout(500);
  await E.click('[data-act="metodo"][data-v="Nequi"]'); await E.waitForTimeout(300); await E.click('[data-act="confirmarVenta"]'); await E.waitForTimeout(900);
  await E.click('#panel [data-act="cerrar"]').catch(() => {}); await shot(E, '09_sin_internet');
  await e.ctx.setOffline(false); await E.waitForTimeout(6000);
  // administrador en celular
  const a = await dev(390, 844, 3), A = a.pg; const entrarA = await login(A, 'admin@oli.app', A_PASS); await entrarA();
  await waitFor(async () => /32\.000/.test(await A.innerText('#view')), 40); await shot(A, '10_admin_inicio');
  const eq = A.locator('text=PUNTO DE EQUILIBRIO').first(); if (await eq.count()) { await eq.scrollIntoViewIfNeeded(); await A.evaluate(() => window.scrollBy(0, -90)); } await shot(A, '11_equilibrio');
  await go(A, 'inventario'); await shot(A, '12_inventario');
  await go(A, 'compras'); await shot(A, '13_compras');
  // cierre de caja en la tablet
  await go(E, 'caja'); await shot(E, '14_caja');
  await E.click('[data-act="cerrarCaja"]'); await E.waitForTimeout(600); await E.fill('#ci-monto', '75500').catch(() => {}); await E.dispatchEvent('#ci-monto', 'input').catch(() => {}); await shot(E, '15_cerrar_caja');
  await E.click('[data-act="doCerrar"]').catch(() => {}); await E.waitForTimeout(1500); await shot(E, '16_caja_cerrada');
  // computador: informes
  const c = await dev(1440, 900, 1.5), C = c.pg; const entrarC = await login(C, 'admin@oli.app', A_PASS); await entrarC();
  await go(C, 'hoy'); await shot(C, '17_pc_inicio'); await go(C, 'reportes'); await shot(C, '18_informes');
} catch (err) { console.log('EXCEPCION', String(err.message).split('\n')[0]); }
await b.close(); console.log('FIN_CAPTURA');
