// Prueba real contra producción (Supabase + Vercel). Uso: EMP_PASS=... ADM_PASS=... node tests/e2e/produccion.mjs
// Crea ventas reales de prueba: bórralas después (ver OLI_Final_Audit.md). Las contraseñas NUNCA van en este archivo.
import { chromium } from 'playwright';
const URL = 'https://oli-pos.vercel.app/';
const R = []; const paso = (n, t, ok, d = '') => { R.push({ n, t, ok: !!ok, d }); console.log((ok ? 'OK ' : 'FALLA ') + n + ' ' + t + ' ' + (typeof d === 'string' ? d : JSON.stringify(d))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, s = 20) { for (let i = 0; i < s * 4; i++) { try { if (await fn()) return true; } catch (e) {} await sleep(250); } return false; }
const b = await chromium.launch();
async function device(w, h) { const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); return { ctx, pg, errs }; }
async function login(pg, mail, pass) {
  await pg.goto(URL); await pg.waitForSelector('#lg-mail', { timeout: 30000 });
  await pg.fill('#lg-mail', mail); await pg.fill('#lg-pass', pass); await pg.click('[data-act="login"]');
  const ok = await waitFor(async () => (await pg.locator('#lg-mail').count()) === 0, 30);
  if (!ok) console.log('LOGIN_NO_PASO', mail, (await pg.innerText('body')).slice(0, 300));
  await waitFor(async () => (await pg.locator('[data-act="tile"]').count()) > 0 || /Hoy|Inicio|Centro/.test(await pg.innerText('#view')), 40);
  if (await waitFor(async () => (await pg.locator('[data-act="doNombreEquipo"]').count()) > 0, 15)) { await pg.locator('#panel [data-act="elegir"]').first().click().catch(() => {}); await pg.click('[data-act="doNombreEquipo"]'); await pg.waitForTimeout(1000); }
  console.log('PANTALLA', mail, (await pg.innerText('#view')).replace(/\n/g, ' | ').slice(0, 200));
}
async function vender(E, items, metodo, recibido) {
  for (const pid of items) { await E.click(`[data-act="tile"][data-id="${pid}"]`); await E.waitForTimeout(150); }
  await E.click((await E.locator('#ticket [data-act="cobrar"]').count()) ? '#ticket [data-act="cobrar"]' : '.cartbar [data-act="cobrar"]'); await E.waitForTimeout(400);
  await E.click(`[data-act="metodo"][data-v="${metodo}"]`); await E.waitForTimeout(200);
  if (recibido) { await E.click(`[data-act="recibido"][data-v="${recibido}"]`); await E.waitForTimeout(200); }
  const txt = await E.innerText('#panel');
  await E.click('[data-act="confirmarVenta"]'); await E.waitForTimeout(900);
  const done = (await E.locator('#panel .done').count()) === 1;
  if (done) await E.click('#panel [data-act="cerrar"]').catch(() => {});
  await E.waitForTimeout(300); return { done, txt };
}
try {
  // 1. empleado en tablet
  const e = await device(1180, 820), E = e.pg;
  await login(E, 'empleado@oli.app', process.env.EMP_PASS);
  const okE = await waitFor(async () => (await E.locator('[data-act="tile"]').count()) > 0 || (await E.locator('[data-act="abrirCaja"]').count()) > 0, 30);
  const rail = (await E.locator('#rail').count()) ? await E.innerText('#rail') : '';
  paso(1, 'Empleado inicia sesión en la tablet y ve el catálogo', okE, `${await E.locator('[data-act="tile"]').count()} productos`);
  paso(2, 'Empleado solo ve sus pantallas (sin Dinero/Análisis/Contabilidad)', rail.includes('Vender') && !/Dinero|Análisis|Contabilidad/.test(rail), rail.replace(/\n/g, ' | ').slice(0, 120));
  const html = await E.content(); paso(3, 'La tablet del empleado no recibe costos', !/7255|7\.255/.test(html));
  await E.screenshot({ path: '01_empleado_tablet.png' });
  // 2. abrir caja
  await E.click('[data-act="abrirCaja"]'); await E.waitForTimeout(400); await E.click('[data-act="aperturaMonto"][data-v="50000"]'); await E.click('[data-act="doAbrir"]'); await E.waitForTimeout(1500);
  paso(4, 'Abrir caja con $50.000', (await E.locator('[data-act="abrirCaja"]').count()) === 0);
  // 3. venta online
  const v1 = await vender(E, ['p-pal-milky', 'p-pal-milky'], 'Efectivo', '50000');
  paso(5, 'Venta en línea: 2 Paleta Milky en efectivo ($22.000)', v1.done, (v1.txt.match(/Cambio[^\n]*\n?[^\n]*/) || [''])[0].replace(/\n/g, ' '));
  await E.screenshot({ path: '02_venta.png' });
  // 4. admin en celular ve la venta
  const a = await device(390, 844), A = a.pg;
  await login(A, 'admin@oli.app', process.env.ADM_PASS);
  const vio = await waitFor(async () => /22\.000/.test(await A.innerText('#view')), 30);
  paso(6, 'Administrador (celular) ve la venta de la tablet', vio);
  await A.screenshot({ path: '03_admin_celular.png' });
  // 5. sin internet
  await e.ctx.setOffline(true); await E.waitForTimeout(800);
  const v2 = await vender(E, ['p-pal-quimbaya'], 'Nequi');
  paso(7, 'Sin internet: la tablet sigue vendiendo (1 Quimbaya por Nequi)', v2.done);
  const ban = await E.innerText('#banners').catch(() => ''); paso(8, 'La tablet avisa que trabaja sin conexión', /sin conexi/i.test(ban), ban.slice(0, 120));
  await E.screenshot({ path: '04_sin_internet.png' });
  const antes = await A.innerText('#view'); const noLlego = !/33\.000/.test(antes);
  await e.ctx.setOffline(false);
  const llego = await waitFor(async () => /33\.000/.test(await A.innerText('#view')), 60);
  paso(9, 'Al volver internet la venta llega sola al administrador (total $33.000)', noLlego && llego);
  await A.screenshot({ path: '05_admin_sincronizado.png' });
  // 6. tiempo real: otra venta y medir
  const t0 = Date.now(); const v3 = await vender(E, ['p-pal-brownie'], 'Efectivo', '11000');
  const rt = await waitFor(async () => /44\.000/.test(await A.innerText('#view')), 30);
  paso(10, 'Tiempo real: venta visible en el celular del admin', v3.done && rt, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // 7. recarga sin duplicar
  await E.reload(); await E.waitForTimeout(6000); await A.reload(); await A.waitForTimeout(8000);
  paso(11, 'Tras recargar ambos equipos el total sigue en $44.000 (sin duplicados)', /44\.000/.test(await A.innerText('#view')) && !/55\.000|66\.000|88\.000/.test(await A.innerText('#view')));
  console.log('ERRORES_EMP', JSON.stringify(e.errs.slice(0, 8))); console.log('ERRORES_ADM', JSON.stringify(a.errs.slice(0, 8)));
} catch (err) { console.log('EXCEPCION', String(err.message).split('\n')[0]); }
console.log('RESUMEN', JSON.stringify(R));
await b.close();
