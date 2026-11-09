// Android uygulama ikonlarını, açılış ekranlarını ve Play Store görsellerini üretir
// (özgün platform işareti; kulübün resmî logosu DEĞİLDİR). Ücretsiz: Playwright/Chromium.
// Kullanım: node scripts/android-assets.mjs
import { chromium } from "../../node_modules/playwright/index.mjs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const here = path.resolve(import.meta.dirname, "..");
const res = path.join(here, "android/app/src/main/res");
const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8102e"/><stop offset=".5" stop-color="#a50d26"/><stop offset="1" stop-color="#00843d"/></linearGradient></defs>`;
const A = (fill = "#fff") => `<path d="M256 96 L400 416 H332 L304 348 H208 L180 416 H112 Z M232 292 H280 L256 228 Z" fill="${fill}"/>`;
const svg = {
  legacy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRAD}<rect x="16" y="16" width="480" height="480" rx="104" fill="url(#g)"/>${A()}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRAD}<circle cx="256" cy="256" r="240" fill="url(#g)"/><g transform="translate(256 256) scale(.86) translate(-256 -256)">${A()}</g></svg>`,
  // Uyarlanabilir ikon ön katmanı: 108dp tuval, logo ortadaki 66dp güvenli alanda
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 262) scale(.56) translate(-256 -256)">${A()}</g></svg>`,
  store: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRAD}<rect width="512" height="512" fill="url(#g)"/>${A()}</svg>`,
};
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, w, h, file, bg = "transparent") {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${bg};width:${w}px;height:${h}px;overflow:hidden">${markup}</body></html>`);
  await page.screenshot({ path: file, omitBackground: bg === "transparent", clip: { x: 0, y: 0, width: w, height: h } });
}
const sized = (s, w, h = w) => s.replace("<svg ", `<svg width="${w}" height="${h}" `);

for (const [d, k] of Object.entries(DENS)) {
  const dir = path.join(res, `mipmap-${d}`);
  await render(sized(svg.legacy, 48 * k), 48 * k, 48 * k, path.join(dir, "ic_launcher.png"));
  await render(sized(svg.round, 48 * k), 48 * k, 48 * k, path.join(dir, "ic_launcher_round.png"));
  await render(sized(svg.foreground, 108 * k), 108 * k, 108 * k, path.join(dir, "ic_launcher_foreground.png"));
}

// Açılış ekranları: mevcut her splash.png aynı boyutta yeniden üretilir
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name === "splash.png") out.push(p);
  }
  return out;
}
for (const file of await walk(res)) {
  const { width, height } = await import("node:fs").then((fs) => {
    const b = fs.readFileSync(file);
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  });
  const s = Math.round(Math.min(width, height) * 0.28);
  await render(`<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${sized(svg.legacy, s)}</div>`, width, height, file, "#0a0d0b");
}

// Play Store: 512x512 uygulama ikonu ve 1024x500 öne çıkan görsel
await render(sized(svg.store, 512), 512, 512, path.join(here, "store", "play-icon-512.png"), "#a50d26");
await render(
  `<div style="width:1024px;height:500px;display:flex;align-items:center;gap:48px;padding:0 80px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#c8102e 0%,#a50d26 45%,#006b31 100%)">
    ${sized(svg.legacy, 200)}
    <div><div style="font-size:76px;font-weight:900;letter-spacing:-2px;line-height:1">AMEDSPOR<br><span style="font-weight:700;opacity:.9">Taraftar</span></div>
    <div style="margin-top:22px;font-size:23px;font-weight:600;opacity:.92;white-space:nowrap">Haberler · Maç merkezi · Shorts · Tahmin oyunları</div>
    <div style="margin-top:10px;font-size:18px;opacity:.75">Bağımsız taraftar platformu — resmî kulüp uygulaması değildir</div></div></div>`,
  1024,
  500,
  path.join(here, "store", "feature-graphic-1024x500.png"),
  "#a50d26",
);
await browser.close();
console.log("✓ Android ikonları, açılış ekranları ve Play Store görselleri üretildi");
