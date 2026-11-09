import { expect, test, type Page } from "@playwright/test";
import { LAST_MATCH, NEWS, POSTS, SITE, SUPA, TOKEN, USER_ID, loggedIn, mockBackend } from "./mock";

/**
 * Tek HTML mobil uygulamanın uçtan uca testleri (Pixel 7 ekranı).
 * Veriler yalnızca test amaçlı sahte bir Supabase'ten gelir.
 */

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Yapılandırılmamış uygulama (tek HTML dosyası olduğu gibi)", () => {
  test("kurulum uyarısı gösterir, sahte veri göstermez, hiçbir sunucuya istek atmaz", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://127.0.0.1")) requests.push(r.url());
    });
    await page.goto("/raw.html");
    await expect(page.getByText("Kurulum bekleniyor.")).toBeVisible();
    await expect(page.getByText("Maç verisi henüz girilmedi")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Alt menü" })).toBeVisible();
    await expect(page.getByText("Sponsorlu")).toHaveCount(0);
    await noHorizontalScroll(page);
    expect(requests).toEqual([]);
  });

  test("kayıt ekranı altyapı yokken dürüst uyarı verir", async ({ page }) => {
    await page.goto("/raw.html#/kayit");
    await expect(page.getByText(/kayıt ve giriş çalışmaz \(sahte giriş yapılmaz\)/)).toBeVisible();
  });
});

test.describe("Yapılandırılmış uygulama", () => {
  test("ana sayfa gerçek veriyi kaynağıyla gösterir; ücretsiz üyeye etiketli sponsor kartı çıkar", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/");
    await expect(page.locator(".match-top").getByText("Sıradaki maç")).toBeVisible();
    await expect(page.getByText("Son maç")).toBeVisible();
    await expect(page.getByText("2 - 1")).toBeVisible();
    await expect(page.getByText(NEWS[0].title)).toBeVisible();
    await expect(page.getByText(POSTS[0].body)).toBeVisible();
    await expect(page.getByRole("complementary", { name: /Sponsorlu içerik/ })).toBeVisible();
    await expect(page.getByText("Sponsorlu").first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("XSS: gönderi içindeki HTML/betik metin olarak gösterilir, çalıştırılmaz", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/akis");
    await expect(page.getByText(POSTS[1].body)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator(".post-body img")).toHaveCount(0);
  });

  test("alt menü ile gezinme, maç detayı ve Android geri tuşu (tarayıcı geçmişi)", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/");
    await page.getByRole("navigation", { name: "Alt menü" }).getByText("Maçlar").click();
    await expect(page.getByRole("heading", { name: "Maç Merkezi" })).toBeVisible();
    await page.locator(`a[href="#/mac/${LAST_MATCH.id}"]`).click();
    await expect(page.getByText("Test Oyuncu")).toBeVisible();
    await expect(page.getByRole("link", { name: "Kaynak: Test Kaynağı", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Maç Merkezi" })).toBeVisible();
  });

  test("haber detayı kaynak/tarih gösterir; söylenti açıkça uyarılır", async ({ page }) => {
    await mockBackend(page);
    await page.goto(`/#/haber/${NEWS[1].id}`);
    await expect(page.getByText("Test Spor Gazetesi")).toBeVisible();
    await expect(page.getByText(/Bu bir söylentidir/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Kaynağa git/ })).toHaveAttribute("href", NEWS[1].original_url);
  });

  test("giriş: hatalı şifre Türkçe hata verir; doğru şifreyle oturum açılır ve beğeni kullanıcının belirteciyle gönderilir", async ({ page }) => {
    const state = await mockBackend(page);
    await page.goto("/#/giris");
    await page.getByLabel("E-posta").fill("deneme@example.com");
    await page.getByLabel("Şifre").fill("Yanlis123");
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("E-posta veya şifre hatalı.");
    await page.getByLabel("Şifre").fill("Dogru123");
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(page.getByRole("link", { name: "Profilim" })).toBeVisible();

    await page.goto("/#/akis");
    await page.getByRole("button", { name: "Beğen" }).first().click();
    await expect.poll(() => state.calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/likes"))).toBeTruthy();
    const like = state.calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/likes"))!;
    expect(like.body).toEqual({ user_id: USER_ID, post_id: POSTS[0].id });
    expect(like.auth).toBe(`Bearer ${TOKEN}`);
  });

  test("giriş yapmadan beğeni giriş ekranına yönlendirir", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/akis");
    await page.getByRole("button", { name: "Beğen" }).first().click();
    await expect(page).toHaveURL(/#\/giris\?next=/);
  });

  test("Premium üye hiçbir reklam görmez; uygulamada satın alma düğmesi yoktur", async ({ page }) => {
    await loggedIn(page);
    await mockBackend(page, { premium: true });
    await page.goto("/#/");
    await expect(page.getByText(NEWS[0].title)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText("Sponsorlu")).toHaveCount(0);
    await page.goto("/#/premium");
    await expect(page.getByText("Premium üyeliğin aktif.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /satın al|Premium ol/i })).toHaveCount(0);
  });

  test("ücretsiz üye Premium sayfasında fiyatı görür; satın alma Google Play Faturalandırma'ya kadar kapalıdır", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/premium");
    await expect(page.getByText(/Aylık yalnızca 10 TL/)).toBeVisible();
    await expect(page.getByText(/Google Play Faturalandırma entegrasyonu tamamlandığında/)).toBeVisible();
    await expect(page.locator(`a[href*="${SITE}/premium"]`)).toHaveCount(0);
  });

  test("yorum: küfür cihazda engellenir (istek gitmez); temiz yorum sunucu API'sine oturum belirteciyle gider", async ({ page }) => {
    await loggedIn(page);
    const state = await mockBackend(page);
    await page.goto(`/#/gonderi/${POSTS[0].id}`);
    const box = page.getByRole("textbox", { name: "Yorum" });
    await box.fill("s1kt1r git");
    await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect(page.locator("#toast")).toContainText("topluluk kurallarımıza uymuyor");
    expect(state.calls.some((c) => c.url.includes("/api/mobile/comment"))).toBe(false);
    await box.fill("Harika maçtı, tebrikler!");
    await page.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect.poll(() => state.calls.find((c) => c.url === `${SITE}/api/mobile/comment`)).toBeTruthy();
    const call = state.calls.find((c) => c.url === `${SITE}/api/mobile/comment`)!;
    expect(call.body).toMatchObject({ postId: POSTS[0].id, body: "Harika maçtı, tebrikler!" });
    expect(call.auth).toBe(`Bearer ${TOKEN}`);
  });

  test("şikâyet: uygulama içinden içerik şikâyet edilebilir (Google Play UGC kuralı)", async ({ page }) => {
    await loggedIn(page);
    const state = await mockBackend(page);
    await page.goto("/#/akis");
    await page.getByRole("button", { name: "Gönderi seçenekleri" }).first().click();
    await page.getByRole("button", { name: /Şikâyet et/ }).click();
    await page.getByRole("dialog", { name: "İçeriği şikâyet et" }).getByLabel("Şikâyet nedeni").selectOption("hakaret");
    await page.getByRole("button", { name: "Şikâyeti gönder" }).click();
    await expect.poll(() => state.calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/reports"))).toBeTruthy();
    expect(state.calls.find((c) => c.url.includes("/rest/v1/reports"))!.body).toMatchObject({ reporter_id: USER_ID, target_type: "post", reason: "hakaret" });
  });

  test("engelleme: kullanıcı uygulama içinden engellenebilir (Google Play UGC kuralı)", async ({ page }) => {
    await loggedIn(page);
    const state = await mockBackend(page);
    page.on("dialog", (d) => d.accept());
    await page.goto("/#/akis");
    await page.getByRole("button", { name: "Gönderi seçenekleri" }).first().click();
    await page.getByRole("button", { name: "Kullanıcıyı engelle" }).click();
    await expect.poll(() => state.calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/blocks"))).toBeTruthy();
  });

  test("ayarlar: hesabı uygulama içinden silme seçeneği vardır (Google Play kuralı)", async ({ page }) => {
    await loggedIn(page);
    await mockBackend(page);
    await page.goto("/#/ayarlar");
    await expect(page.getByRole("heading", { name: "Hesabı kalıcı olarak sil" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hesabımı kalıcı olarak sil" })).toBeVisible();
  });

  test("kayıt: küfürlü kullanıcı adı cihazda reddedilir", async ({ page }) => {
    const state = await mockBackend(page);
    await page.goto("/#/kayit");
    await page.getByLabel("Kullanıcı adı").fill("kral_orospu34");
    await page.getByLabel("E-posta").fill("a@example.com");
    await page.getByLabel("Şifre").fill("Guvenli123");
    await page.locator('input[name="terms"]').check();
    await page.locator('input[name="age"]').check();
    await page.getByRole("button", { name: "Kayıt ol", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("topluluk kurallarımıza uygun değil");
    expect(state.calls.some((c) => c.url.includes("/auth/v1/signup"))).toBe(false);
  });

  test("Shorts: yalnızca ekrandaki video yüklenir (gereksiz veri tüketimi yok)", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/#/shorts");
    await expect(page.getByRole("region", { name: "Shorts 1" })).toBeVisible();
    await expect.poll(() => page.locator(".shorts video[src]").count()).toBe(1);
    await expect(page.getByRole("button", { name: /Veri tasarrufu/ })).toBeVisible();
  });

  test("çevrimdışı olunca uyarı gösterilir", async ({ page, context }) => {
    await mockBackend(page);
    await page.goto("/#/");
    await expect(page.getByText(NEWS[0].title)).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/İnternet bağlantısı yok/)).toBeVisible();
    await context.setOffline(false);
  });

  test("yalnızca HTTPS bağlantılara ve izinli adreslere istek atılır", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await mockBackend(page);
    await page.goto("/#/");
    await expect(page.getByText(NEWS[0].title)).toBeVisible();
    const external = urls.filter((u) => !u.startsWith("http://127.0.0.1"));
    expect(external.length).toBeGreaterThan(0);
    for (const u of external) expect(u.startsWith(SUPA) || u.startsWith(SITE), u).toBe(true);
  });
});
