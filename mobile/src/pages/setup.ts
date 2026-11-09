import { h } from "../dom";
import { icon } from "../icons";
import { clearDeviceConfig, config, configSource, isHttpsUrl, saveDeviceConfig } from "../config";
import { navigate, refresh } from "../router";
import { resetCaches } from "../data";
import { alertBox, card, UserError } from "../ui";

const pageTitle = (t: string, sub?: string) => h("header", { class: "page-title" }, h("h1", null, t), sub ? h("p", { class: "muted small" }, sub) : null);

/**
 * Bağlantıyı uygulamanın İÇİNDEN kurma ekranı. Kod düzenlemeden, telefondan
 * Supabase adresini ve herkese açık (anon) anahtarı girip bağlantıyı test eder.
 * Bilgiler yalnızca bu cihazda saklanır. Play Store sürümünde bağlantı dosyaya
 * gömülü olduğu için bu ekran görünmez.
 */
export function setupPage(): Node {
  const src = configSource();
  if (src === "file") {
    return h("div", { class: "stack" }, pageTitle("Bağlantı ayarları"), alertBox("Bu sürümde veritabanı bağlantısı uygulamanın içine gömülüdür; buradan değiştirilemez.", "info"));
  }
  const c = config();
  const url = h("input", { class: "input", type: "url", inputmode: "url", autocomplete: "off", placeholder: "https://xxxx.supabase.co", value: src === "device" ? c.supabaseUrl : "", name: "supabaseUrl" }) as HTMLInputElement;
  const key = h("textarea", { class: "input", rows: 3, autocomplete: "off", spellcheck: "false", placeholder: "eyJhbGciOi... veya sb_publishable_...", name: "anonKey" }, src === "device" ? c.supabaseAnonKey : "") as HTMLTextAreaElement;
  const site = h("input", { class: "input", type: "url", inputmode: "url", autocomplete: "off", placeholder: "https://siteniz.vercel.app (isteğe bağlı)", value: src === "device" ? c.siteUrl : "", name: "siteUrl" }) as HTMLInputElement;
  const msg = h("div");
  const form = h(
    "form",
    {
      class: "stack",
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const btn = (e.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>("button[type=submit]");
        msg.replaceChildren();
        if (btn) btn.disabled = true;
        try {
          const u = url.value.trim().replace(/\/+$/, "");
          const k = key.value.trim();
          const s = site.value.trim().replace(/\/+$/, "");
          if (!isHttpsUrl(u)) throw new UserError("Supabase adresi https:// ile başlamalı (ör. https://xxxx.supabase.co).");
          if (k.length < 30) throw new UserError("anon / publishable anahtarı eksik görünüyor.");
          if (/service_role|sb_secret_/i.test(k) || /"role"\s*:\s*"service_role"/.test(atobSafe(k.split(".")[1] ?? ""))) {
            throw new UserError("Bu GİZLİ (service_role / secret) anahtar! Buraya yalnızca anon / publishable anahtarı yazılır.");
          }
          if (s && !isHttpsUrl(s)) throw new UserError("Web sitesi adresi https:// ile başlamalı.");
          let res: Response;
          try {
            res = await fetch(`${u}/rest/v1/app_settings?select=key&limit=1`, { headers: { apikey: k, authorization: `Bearer ${k}` } });
          } catch {
            throw new UserError("Sunucuya ulaşılamadı. Adresi ve internet bağlantısını kontrol et.");
          }
          if (res.status === 401 || res.status === 403) throw new UserError("Anahtar kabul edilmedi. Supabase → Project Settings → API sayfasındaki anon / publishable anahtarı kopyala.");
          if (res.status === 404) throw new UserError("Bağlantı kuruldu ama tablolar bulunamadı. supabase/migrations dosyalarını SQL Editor'da sırayla çalıştırdın mı?");
          if (!res.ok) throw new UserError(`Bağlantı kurulamadı (HTTP ${res.status}).`);
          const persisted = saveDeviceConfig({ supabaseUrl: u, supabaseAnonKey: k, siteUrl: s });
          resetCaches();
          msg.replaceChildren(alertBox(persisted ? "Bağlantı başarılı ve bu cihaza kaydedildi." : "Bağlantı başarılı. Bu ortam kalıcı kayda izin vermediği için yalnızca bu oturumda geçerli.", "success"));
          setTimeout(() => navigate("#/", true), 700);
        } catch (err) {
          msg.replaceChildren(alertBox(err instanceof UserError ? err.message : "Beklenmeyen bir hata oluştu.", "error"));
        } finally {
          if (btn) btn.disabled = false;
        }
      },
    },
    msg,
    h("label", { class: "field" }, h("span", { class: "label" }, "Supabase Project URL"), url),
    h("label", { class: "field" }, h("span", { class: "label" }, "anon / publishable anahtarı"), key, h("span", { class: "muted tiny" }, "Herkese açık olacak şekilde tasarlanmış anahtardır. service_role / secret anahtarını ASLA yazma.")),
    h("label", { class: "field" }, h("span", { class: "label" }, "Web sitesi adresi (paylaşım, yorum, yasal sayfalar için)"), site),
    h("button", { type: "submit", class: "btn btn-primary btn-lg" }, icon("shield", "ic-xs"), " Bağlantıyı test et ve kaydet"),
  );
  return h(
    "div",
    { class: "stack" },
    pageTitle("Bağlantıyı kur", "Uygulamayı kendi ücretsiz Supabase veritabanına bağla. Kod düzenlemek gerekmez."),
    card(
      "p-md stack-sm",
      h("strong", null, "Önce gerekenler"),
      h(
        "ol",
        { class: "steps small" },
        h("li", null, "supabase.com'da ücretsiz hesap ve proje aç (bölge: Frankfurt)."),
        h("li", null, "SQL Editor'da depodaki supabase/migrations dosyalarını sırayla çalıştır."),
        h("li", null, "Project Settings → API sayfasından Project URL ve anon / publishable anahtarını kopyala."),
      ),
      h("p", { class: "muted tiny" }, "Ayrıntılı rehber: docs/KURULUM.md"),
    ),
    card("p-md", form),
    src === "device"
      ? h(
          "button",
          {
            type: "button",
            class: "btn btn-outline",
            onclick: () => {
              clearDeviceConfig();
              resetCaches();
              refresh();
            },
          },
          "Bu cihazdaki bağlantıyı kaldır",
        )
      : null,
  );
}

function atobSafe(s: string): string {
  try {
    return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}
