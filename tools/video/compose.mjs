import { chromium } from 'playwright'; import fs from 'fs';
const S = JSON.parse(fs.readFileSync('scenes.json', 'utf8')); fs.mkdirSync('frames', { recursive: true });
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const img = n => 'data:image/png;base64,' + fs.readFileSync(`shots/${n}.png`).toString('base64');
const css = `@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0}body{width:1920px;height:1080px;overflow:hidden;background:#FAF7F0;font-family:Figtree,sans-serif;color:#1F2A24;position:relative}
.blob{position:absolute;border-radius:50%;filter:blur(10px)}.b1{width:900px;height:900px;right:-220px;top:-180px;background:radial-gradient(circle,#E3EFE6 0%,#FAF7F0 70%)}.b2{width:600px;height:600px;left:-200px;bottom:-260px;background:radial-gradient(circle,#F6E7D2 0%,#FAF7F0 70%)}
.logo{position:absolute;left:96px;top:72px;font-family:Fredoka;font-weight:700;font-size:44px;color:#2F7B5A;letter-spacing:.5px}
.left{position:absolute;left:96px;top:0;bottom:0;width:600px;display:flex;flex-direction:column;justify-content:center;gap:26px}
.chip{align-self:flex-start;background:#2F7B5A;color:#fff;font-weight:700;font-size:20px;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border-radius:999px}
h1{font-family:Fredoka;font-weight:600;font-size:72px;line-height:1.02;letter-spacing:-.5px}.sub{font-size:30px;line-height:1.35;color:#5B6660}
.foot{position:absolute;left:96px;bottom:56px;font-size:18px;color:#8A938D}
.dev{position:absolute;display:flex;align-items:center;justify-content:center}.dev img{display:block;width:100%;height:auto}
.tablet{right:90px;top:50%;transform:translateY(-50%);width:1060px;padding:22px;background:#1C211E;border-radius:44px;box-shadow:0 40px 90px rgba(31,42,36,.28)}.tablet img{border-radius:22px}
.phone{right:330px;top:50%;transform:translateY(-50%);width:420px;padding:16px;background:#1C211E;border-radius:62px;box-shadow:0 40px 90px rgba(31,42,36,.28)}.phone img{border-radius:48px}
.pc{right:80px;top:50%;transform:translateY(-54%);width:1080px;flex-direction:column}.pc .scr{width:100%;padding:18px 18px 22px;background:#1C211E;border-radius:26px 26px 10px 10px;box-shadow:0 40px 90px rgba(31,42,36,.28)}.pc .scr img{border-radius:8px}.pc .base{width:116%;height:26px;background:linear-gradient(#D9D6CE,#BEBAB0);border-radius:0 0 22px 22px}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:30px}.center .big{font-family:Fredoka;font-weight:700;font-size:200px;color:#2F7B5A;line-height:1}.center h1{font-size:84px}.center .sub{max-width:1100px}`;
for (const s of S) {
  let devHtml = '';
  if (s.dev === 'tablet') devHtml = `<div class="dev tablet"><img src="${img(s.img)}"></div>`;
  if (s.dev === 'phone') devHtml = `<div class="dev phone"><img src="${img(s.img)}"></div>`;
  if (s.dev === 'pc') devHtml = `<div class="dev pc"><div class="scr"><img src="${img(s.img)}"></div><div class="base"></div></div>`;
  const body = s.dev === 'none'
    ? `<div class="blob b1"></div><div class="blob b2"></div><div class="center"><div class="big">OLI</div><h1>${s.title}</h1><div class="sub">${s.sub}</div></div>`
    : `<div class="blob b1"></div><div class="blob b2"></div><div class="logo">OLI</div><div class="left"><div class="chip">${s.chip}</div><h1>${s.title}</h1><div class="sub">${s.sub}</div></div>${devHtml}<div class="foot">OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio</div>`;
  await pg.setContent(`<html><head><style>${css}</style></head><body>${body}</body></html>`, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
  await pg.screenshot({ path: `frames/${s.id}.png` }); console.log('lamina', s.id);
}
await b.close();
