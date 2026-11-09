import { expect, test } from "@playwright/test";
import { NEWS, SUPA, mockBackend } from "./mock";

/** Uygulamanın içinden bağlantı kurma (Kurulum ekranı) */
const ANON = "test-anon-key-0123456789abcdefghijklmnop-uzun";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("yapılandırılmamış uygulama, bağlantı uygulama içinden kurulunca gerçek veriyi gösterir", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/raw.html");
  await expect(page.getByText("Kurulum bekleniyor.")).toBeVisible();
  await page.getByRole("link", { name: /Bağlantıyı uygulamadan kur/ }).click();
  await expect(page.getByRole("heading", { name: "Bağlantıyı kur" })).toBeVisible();
  await page.getByLabel("Supabase Project URL").fill(SUPA);
  await page.getByLabel("anon / publishable anahtarı").fill(ANON);
  await page.getByLabel(/Web sitesi adresi/).fill("https://site.example");
  await page.getByRole("button", { name: /Bağlantıyı test et ve kaydet/ }).click();
  await expect(page.getByText("Bağlantı başarılı ve bu cihaza kaydedildi.")).toBeVisible();
  await expect(page.getByText(NEWS[0].title)).toBeVisible();
  // Yeniden açınca bağlantı hatırlanır
  await page.reload();
  await expect(page.getByText(NEWS[0].title)).toBeVisible();
  await page.getByRole("link", { name: "Menü" }).click();
  await expect(page.getByText("Bağlantı ayarları (bu cihaz)")).toBeVisible();
});

test("kurulum ekranı gizli (service_role) anahtarı reddeder ve kaydetmez", async ({ page }) => {
  const state = await mockBackend(page);
  await page.goto("/raw.html#/kurulum");
  await page.getByLabel("Supabase Project URL").fill(SUPA);
  await page.getByLabel("anon / publishable anahtarı").fill(`eyJhbGciOiJIUzI1NiJ9.${b64({ role: "service_role", iss: "supabase" })}.imza-imza-imza`);
  await page.getByRole("button", { name: /Bağlantıyı test et ve kaydet/ }).click();
  await expect(page.getByRole("alert")).toContainText("GİZLİ");
  expect(state.calls.length).toBe(0);
});

test("kurulum ekranı http (şifresiz) adresi reddeder", async ({ page }) => {
  await page.goto("/raw.html#/kurulum");
  await page.getByLabel("Supabase Project URL").fill("http://guvensiz.example");
  await page.getByLabel("anon / publishable anahtarı").fill(ANON);
  await page.getByRole("button", { name: /Bağlantıyı test et ve kaydet/ }).click();
  await expect(page.getByRole("alert")).toContainText("https://");
});

test("dosyaya gömülü bağlantı varsa kurulum ekranı değiştirmeye izin vermez", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/#/kurulum");
  await expect(page.getByText(/bağlantısı uygulamanın içine gömülüdür/)).toBeVisible();
  await expect(page.getByLabel("Supabase Project URL")).toHaveCount(0);
});
