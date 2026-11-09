import { expect, test, type Page } from "@playwright/test";

/**
 * Uçtan uca testler — Supabase bağlantısı OLMADAN çalışan uygulama üzerinde.
 * Amaç: arayüzün, yönlendirmelerin, güvenlik başlıklarının, PWA'nın ve
 * "sahte veri gösterme" kuralının doğrulanması.
 */

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "yatay kaydırma olmamalı").toBeLessThanOrEqual(1);
}

async function acceptCookies(page: Page) {
  const btn = page.getByRole("button", { name: "Yalnızca zorunlu" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

test.describe("Ana sayfa ve gezinme", () => {
  test("ana sayfa yüklenir, kurulum uyarısı görünür, sahte veri yoktur", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AMEDSPOR/);
    await expect(page.getByText("Kurulum bekleniyor").first()).toBeVisible();
    await expect(page.getByText("Maç verisi henüz girilmedi")).toBeVisible();
    await expect(page.getByText("Henüz yayınlanmış haber yok")).toBeVisible();
    // Uydurma canlı skor veya reklam yok
    await expect(page.getByText("Canlı", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Sponsorlu")).toHaveCount(0);
    await expect(page.getByText(/resmî bir bağlantısı yoktur/)).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("mobilde alt menü, masaüstünde yan menü görünür", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) {
      await expect(page.getByRole("navigation", { name: "Alt menü" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Ana menü" })).toBeHidden();
    } else {
      await expect(page.getByRole("navigation", { name: "Ana menü" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Alt menü" })).toBeHidden();
    }
  });

  test("ana bölümler arasında gezinilir ve hiçbirinde yatay taşma olmaz", async ({ page }) => {
    for (const [path, heading] of [
      ["/maclar", "Maç Merkezi"],
      ["/haberler", "Haber Merkezi"],
      ["/oyuncular", "Oyuncular"],
      ["/tahminler", "Tahmin & Oyunlar"],
      ["/akis", "Taraftar Akışı"],
      ["/tarihce", "Amedspor Tarihi"],
      ["/premium", "Reklamsız taraftar deneyimi"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await noHorizontalScroll(page);
    }
  });

  test("tahmin sayfası kumar/para içermediğini açıkça belirtir", async ({ page }) => {
    await page.goto("/tahminler");
    await expect(page.getByText(/Gerçek para, bahis/)).toBeVisible();
  });

  test("bilinmeyen sayfa 404 gösterir", async ({ page }) => {
    const res = await page.goto("/olmayan-sayfa-xyz");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
  });
});

test.describe("Kimlik doğrulama ve yetki", () => {
  for (const path of ["/paylas", "/ayarlar", "/bildirimler", "/kaydedilenler", "/admin", "/admin/gelir", "/admin/reklamlar"]) {
    test(`giriş yapılmadan ${path} açılamaz → giriş sayfasına yönlendirilir`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/giris\?next=/);
      await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toBeVisible();
    });
  }

  test("kayıt formu: zorunlu alanlar ve onay kutuları istenir", async ({ page }) => {
    await page.goto("/kayit");
    await acceptCookies(page);
    await expect(page.getByLabel("Kullanıcı adı")).toHaveAttribute("required", "");
    await expect(page.getByLabel(/13 yaşından büyüğüm/)).toHaveAttribute("required", "");
    await expect(page.getByRole("button", { name: "Google ile kayıt ol" })).toBeVisible();
  });

  test("altyapı yokken kayıt sahte başarı göstermez, dürüst hata verir", async ({ page }) => {
    await page.goto("/kayit");
    await acceptCookies(page);
    await page.getByLabel("Kullanıcı adı").fill("amedli_test");
    await page.getByLabel("E-posta").fill("test@example.com");
    await page.getByLabel("Şifre").fill("Guvenli123");
    await page.getByLabel(/Kullanım Şartları/).check();
    await page.getByLabel(/13 yaşından büyüğüm/).check();
    await page.getByRole("button", { name: "Kayıt ol", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toContainText("henüz yapılandırılmadı");
    await expect(page).toHaveURL(/\/kayit/);
  });

  test("kayıtta küfürlü kullanıcı adı reddedilir", async ({ page }) => {
    await page.goto("/kayit");
    await acceptCookies(page);
    await page.getByLabel("Kullanıcı adı").fill("kral_orospu34");
    await page.getByLabel("E-posta").fill("test2@example.com");
    await page.getByLabel("Şifre").fill("Guvenli123");
    await page.getByLabel(/Kullanım Şartları/).check();
    await page.getByLabel(/13 yaşından büyüğüm/).check();
    await page.getByRole("button", { name: "Kayıt ol", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toContainText("topluluk kurallarımıza uygun değil");
  });

  test("zayıf şifre reddedilir", async ({ page }) => {
    await page.goto("/kayit");
    await acceptCookies(page);
    await page.getByLabel("Kullanıcı adı").fill("amedli_test");
    await page.getByLabel("E-posta").fill("test@example.com");
    await page.getByLabel("Şifre").fill("abcdefgh");
    await page.getByLabel(/Kullanım Şartları/).check();
    await page.getByLabel(/13 yaşından büyüğüm/).check();
    await page.getByRole("button", { name: "Kayıt ol", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toContainText("rakam");
  });

  test("açık yönlendirme engellenir (next parametresi dış siteye gidemez)", async ({ page }) => {
    await page.goto("/giris?next=//kotu-site.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/");
  });
});

test.describe("Premium ve ödeme güvenliği", () => {
  test("Premium sayfası fiyatı ve açıklamayı gösterir; ödeme altyapısı yokken satın alma sunulmaz", async ({ page }) => {
    await page.goto("/premium");
    await expect(page.getByText("AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.")).toBeVisible();
    await expect(page.getByText(/10,00/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Premium için giriş yap" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Abonelik ve İptal Koşulları" }).first()).toBeVisible();
  });

  test("test ödeme sayfası giriş yapılmadan açılamaz", async ({ page }) => {
    await page.goto(`/premium/test-odeme?token=${"a".repeat(48)}`);
    await expect(page).toHaveURL(/\/giris/);
  });

  test("ödeme webhook'u: yapılandırılmamış sağlayıcı 404, sahte istek Premium vermez", async ({ request }) => {
    const res = await request.post("/api/webhooks/payments/test", { data: { id: "evt_fake", type: "payment.succeeded" } });
    expect(res.status()).toBe(404);
    const unknown = await request.post("/api/webhooks/payments/bilinmeyen", { data: {} });
    expect(unknown.status()).toBe(404);
  });

  test("zamanlanmış görev uç noktası anahtarsız çağrılamaz", async ({ request }) => {
    const res = await request.get("/api/cron/daily");
    expect(res.status()).toBe(401);
    const wrong = await request.get("/api/cron/daily", { headers: { authorization: "Bearer yanlis" } });
    expect(wrong.status()).toBe(401);
  });

  test("finans CSV dışa aktarımı yetkisiz kullanıcıya kapalıdır", async ({ request }) => {
    const res = await request.get("/api/admin/finance-export");
    expect(res.status()).toBe(403);
  });

  test("veri indirme uç noktası oturumsuz kapalıdır", async ({ request }) => {
    const res = await request.get("/api/me/export");
    expect(res.status()).toBe(401);
  });

  test("reklam olay uç noktası geçersiz veriyi reddeder", async ({ request }) => {
    const bad = await request.post("/api/ads/event", { data: { campaignId: "x", placement: "home_feed", kind: "impression" } });
    expect([204, 400]).toContain(bad.status());
  });
});

test.describe("Çerez izni, tema, PWA ve güvenlik başlıkları", () => {
  test("çerez bildirimi görünür, seçim kalıcıdır", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Çerez tercihleri" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Kişiselleştirilmemiş reklam" }).click();
    await expect(dialog).toBeHidden();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "amed_consent")?.value).toContain("non_personalized");
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Çerez tercihleri" })).toBeHidden();
  });

  test("karanlık mod varsayılan, tema değiştirilebilir ve hatırlanır", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Aydınlık temaya geç" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("PWA manifest ve ikonlar geçerli; service worker sunuluyor", async ({ request }) => {
    const m = await request.get("/manifest.webmanifest");
    expect(m.ok()).toBeTruthy();
    const json = await m.json();
    expect(json.name).toContain("AMEDSPOR");
    expect(json.display).toBe("standalone");
    expect(json.lang).toBe("tr");
    for (const icon of json.icons) {
      const r = await request.get(icon.src);
      expect(r.ok(), icon.src).toBeTruthy();
      expect(r.headers()["content-type"]).toContain("image/png");
    }
    expect(json.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBeTruthy();
    expect(await sw.text()).toContain("NEVER_CACHE");
    const offline = await request.get("/cevrimdisi");
    expect(offline.ok()).toBeTruthy();
  });

  test("güvenlik başlıkları gönderilir", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("yasal sayfalar mevcut ve taslak uyarısı taşır", async ({ page }) => {
    for (const slug of ["gizlilik", "kvkk", "kullanim-sartlari", "cerezler", "abonelik", "topluluk-kurallari", "telif"]) {
      await page.goto(`/yasal/${slug}`);
      await expect(page.getByText(/kesin hukuki görüş niteliği taşımaz/)).toBeVisible();
    }
  });
});
