import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Tek HTML dosyasının farklı "ev sahibi" ortamlarda çalışması:
 *  - iPhone/Claude dosya önizleyicisi gibi korumalı çerçeve (sandbox + srcdoc, opak köken,
 *    adres çubuğu değiştirilemez, localStorage yok)
 *  - Dosya olarak açma (file://)
 */
const FILE = path.resolve(process.cwd(), "mobile/www/index.html");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

async function sandboxed(page: Page): Promise<{ frame: FrameLocator; errors: string[] }> {
  const html = await readFile(FILE, "utf8");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setContent(`<!doctype html><html><body style="margin:0"><iframe id="app" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh" srcdoc="${escAttr(html)}"></iframe></body></html>`);
  return { frame: page.frameLocator("#app"), errors };
}

test("korumalı önizleme çerçevesinde (iPhone dosya önizleyicisi gibi) uygulama açılır ve gezinme çalışır", async ({ page }) => {
  const { frame, errors } = await sandboxed(page);
  await expect(frame.getByText("Kurulum bekleniyor.")).toBeVisible();
  await frame.getByRole("navigation", { name: "Alt menü" }).getByText("Maçlar").click();
  await expect(frame.getByRole("heading", { name: "Maç Merkezi" })).toBeVisible();
  await frame.getByRole("navigation", { name: "Alt menü" }).getByText("Akış").click();
  await expect(frame.getByRole("heading", { name: "Taraftar Akışı" })).toBeVisible();
  await frame.getByRole("link", { name: "Menü" }).click();
  await frame.getByText("Hakkında ve yasal metinler").click();
  await expect(frame.getByText("Bağımsız taraftar platformu")).toBeVisible();
  await frame.getByRole("button", { name: "Geri" }).click();
  await expect(frame.getByText("Hakkında ve yasal metinler")).toBeVisible();
  expect(errors).toEqual([]);
});

test("dosya olarak açıldığında (file://) uygulama açılır ve gezinme çalışır", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${FILE}`);
  await expect(page.getByText("Kurulum bekleniyor.")).toBeVisible();
  await page.getByRole("navigation", { name: "Alt menü" }).getByText("Shorts").click();
  await expect(page.getByText(/Kurulum bekleniyor/)).toBeVisible();
  await page.getByRole("navigation", { name: "Alt menü" }).getByText("Ana Sayfa").click();
  await expect(page.getByRole("navigation", { name: "Kısayollar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("eski iPhone uyumluluğu: paket, iOS 16.4 öncesinde çalışmayan 'lookbehind' kalıbı içermez", async () => {
  const html = await readFile(FILE, "utf8");
  expect(html.includes("(?<=")).toBe(false);
  expect(html.includes("(?<!")).toBe(false);
});
