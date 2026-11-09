// PWA PNG ikonlarını SVG kaynaklarından üretir (Playwright/Chromium ile, ücretsiz).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../public/icons");
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "maskable-512.png", 512],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = await readFile(path.join(dir, src), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("ikonlar üretildi");
