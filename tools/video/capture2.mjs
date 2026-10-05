// Segunda parte del video: "lo que hay detrás", con un mes de datos de ejemplo en OLI local (sin tocar producción).
import { chromium } from 'playwright'; import fs from 'fs'; import JSZip from 'jszip'; import ExcelJS from 'exceljs';
fs.mkdirSync('shots', { recursive: true }); fs.mkdirSync('docs', { recursive: true });
const URL = process.env.BASE || 'http://localhost:8090/', RB = process.env.RBASE || 'http://localhost:8091/', sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, s = 20) { for (let i = 0; i < s * 4; i++) { try { if (await fn()) return true; } catch (e) {} await sleep(250); } return false; }
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--headless=new', '--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, acceptDownloads: true }); const pg = await ctx.newPage();
const shot = async n => { await pg.waitForTimeout(900); await pg.screenshot({ path: `shots/${n}.png` }); console.log('captura', n); };
const go = async r => { await pg.evaluate(r => { location.hash = '#' + r; }, r); await pg.waitForTimeout(1800); await pg.evaluate(() => window.scrollTo(0, 0)); };
const bajar = async (tipo, nombre) => { const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click(`[data-act="generar"][data-v="${tipo}"]`)]); await d.saveAs('docs/' + nombre); console.log('archivo', nombre, fs.statSync('docs/' + nombre).size); await pg.waitForTimeout(1500); };
try {
  await pg.goto(URL); await waitFor(async () => (await pg.locator('[data-act="empezarDemo"]').count()) > 0, 30);
  await pg.click('[data-act="empezarDemo"]'); await waitFor(async () => /Así va OLI|Buenas/.test(await pg.innerText('#view')), 40);
  if (await waitFor(async () => (await pg.locator('[data-act="doNombreEquipo"]').count()) > 0, 10)) { await pg.locator('#panel [data-act="elegir"]').first().click().catch(() => {}); await pg.click('[data-act="doNombreEquipo"]'); await pg.waitForTimeout(800); }
  await go('hoy'); await shot('p01_inicio');
  await go('analisis'); await shot('p02_analisis');
  await go('finanzas'); await shot('p03_dinero');
  await go('productos'); await shot('p04_productos');
  await go('equipo'); await shot('p06_equipo');
  await go('reportes'); await pg.click('[data-act="rangoInf"][data-v="mes"]').catch(() => {}); await pg.waitForTimeout(800); await shot('p07_informes');
  await bajar('empresarial', 'empresarial.pdf'); await bajar('contador', 'contador.pdf'); await bajar('gerencial', 'gerencial.xlsx'); await bajar('zip', 'contador.zip');
  await go('contabilidad');
  for (const k of ['resumen', 'cumplimiento', 'facturacion', 'conciliacion', 'auditoria', 'cierre']) { await pg.click(`[data-act="conTab"][data-v="${k}"]`).catch(e => console.log('sin pestaña', k)); await pg.waitForTimeout(900); await pg.evaluate(() => window.scrollTo(0, 0)); await shot('c_' + k); }
} catch (err) { console.log('EXCEPCION', String(err.message).split('\n')[0]); }
// páginas de los PDF (pdf.js) y ventana con el contenido del paquete del contador
try {
  const v = await b.newPage({ viewport: { width: 1300, height: 1800 } });
  for (const [f, p, n] of [['empresarial.pdf', 2, 'p08_pdf_empresarial'], ['empresarial.pdf', 5, 'p08b_pdf_recomendaciones'], ['contador.pdf', 1, 'p10_pdf_contador']]) {
    await v.goto(`${RB}render.html?f=docs/${f}&p=${p}`); await v.waitForFunction(() => window.listo === true, null, { timeout: 60000 });
    await (await v.$('canvas')).screenshot({ path: `shots/${n}.png` }); console.log('captura', n);
  }
  const zip = await JSZip.loadAsync(fs.readFileSync('docs/contador.zip')); const filas = [];
  zip.forEach((p, e) => { if (!e.dir) filas.push(p); });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile('docs/gerencial.xlsx'); const hojas = wb.worksheets.map(w => w.name);
  const tipo = x => /\.pdf$/i.test(x) ? 'pdf' : /\.txt$/i.test(x) ? 'txt' : 'xls';
  const li = (a, hoja) => a.map(x => `<li><span class="ic ${hoja ? 'xls' : tipo(x)}">${hoja ? 'HOJA' : tipo(x).toUpperCase()}</span>${x}</li>`).join('');
  await v.setViewportSize({ width: 1440, height: 900 });
  await v.setContent(`<style>body{margin:0;font-family:system-ui,sans-serif;background:#F4F2EC;color:#1F2A24;display:flex;gap:24px;padding:28px;box-sizing:border-box;height:900px}.w{background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.08);flex:1;overflow:hidden;display:flex;flex-direction:column}.h{background:#EDEAE3;padding:14px 20px;font-weight:700;font-size:20px}.h small{font-weight:500;color:#6b746e;margin-left:8px}ul{list-style:none;margin:0;padding:10px 20px;columns:1;overflow:hidden}li{padding:7px 0;border-bottom:1px solid #eee;font-size:17px;display:flex;align-items:center;gap:12px}.ic{font-size:11px;font-weight:800;color:#fff;border-radius:5px;padding:4px 6px;min-width:30px;text-align:center}.xls{background:#1E7A46}.pdf{background:#C0392B}.txt{background:#7A847E}</style>
    <div class="w"><div class="h">Paquete_contador.zip<small>${filas.length} archivos</small></div><ul>${li(filas)}</ul></div>
    <div class="w"><div class="h">Informe_gerencial.xlsx<small>${hojas.length} hojas con fórmulas y gráficos</small></div><ul>${li(hojas, true)}</ul></div>`);
  await v.screenshot({ path: 'shots/p09_archivos.png' }); console.log('captura p09_archivos', filas.length, 'archivos', hojas.length, 'hojas');
} catch (err) { console.log('EXCEPCION2', String(err.message).split('\n')[0]); }
await b.close(); console.log('FIN_CAPTURA2');
