import { h, toast } from "../dom";
import { icon, logoMark } from "../icons";
import { api } from "../api";
import { config, isBackendConfigured, isSiteConfigured } from "../config";
import { navigate, safeNextHash } from "../router";
import { getMyProfile, getMySubscription, getSettings, isPremium, resetPremiumCache } from "../data";
import { moderateFields, moderateText } from "@/lib/moderation";
import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from "@/lib/payments/types";
import { validateUpload } from "@/lib/uploads/validate";
import { UserError, alertBox, avatar, button, card, emptyState, errorText, externalLink, fmtDate, fmtTry, requireLogin, run, setupNotice } from "../ui";
import { applyTheme, currentTheme } from "../theme";

const pageTitle = (t: string, sub?: string) => h("header", { class: "page-title" }, h("h1", null, t), sub ? h("p", { class: "muted small" }, sub) : null);

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { class: "field" }, h("span", { class: "label" }, label), input, hint ? h("span", { class: "muted tiny" }, hint) : null);
}
const inp = (attrs: Record<string, string | number | boolean>) => h("input", { class: "input", ...attrs }) as HTMLInputElement;

function authShell(title: string, subtitle: string, ...body: (Node | null)[]): HTMLElement {
  return h(
    "div",
    { class: "auth" },
    h("div", { class: "center stack-sm" }, logoMark(52), h("h1", { class: "h1" }, title), h("p", { class: "muted small" }, subtitle)),
    !isBackendConfigured(config()) ? alertBox("Üyelik sistemi henüz yapılandırılmadı. Kurulum tamamlanana kadar kayıt ve giriş çalışmaz (sahte giriş yapılmaz).", "warning") : null,
    card("p-md stack", ...body),
  );
}

/** Form gönderimini tek yerde yönetir: düğmeyi kilitler, hatayı formun içinde gösterir. */
function formHandler(msg: HTMLElement, fn: () => Promise<void>) {
  return async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]");
    msg.replaceChildren();
    if (btn) btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      msg.replaceChildren(alertBox(errorText(err), "error"));
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------- Giriş
export function loginPage(_: Record<string, string>, q: URLSearchParams): Node {
  const next = safeNextHash(q.get("next"));
  const email = inp({ type: "email", autocomplete: "email", required: true, name: "email" });
  const pw = inp({ type: "password", autocomplete: "current-password", required: true, name: "password" });
  const msg = h("div");
  const form = h(
    "form",
    { class: "stack", onsubmit: formHandler(msg, async () => {
      await api.signIn(email.value.trim().toLowerCase(), pw.value);
      resetPremiumCache();
      navigate(next, true);
    }) },
    msg,
    field("E-posta", email),
    field("Şifre", pw),
    h("button", { type: "submit", class: "btn btn-primary btn-lg" }, "Giriş yap"),
    h("a", { href: "#/sifre", class: "link small center" }, "Şifremi unuttum"),
  );
  return h("div", null, authShell("Tekrar hoş geldin", "Taraftar hesabınla giriş yap", form), h("p", { class: "center small mt" }, "Hesabın yok mu? ", h("a", { href: "#/kayit", class: "link" }, "Kayıt ol")));
}

// ---------------------------------------------------------------- Kayıt
export function signupPage(): Node {
  const username = inp({ autocomplete: "username", pattern: "[a-z0-9_.]{3,24}", minlength: 3, maxlength: 24, required: true, placeholder: "ornek: amedli_21", name: "username" });
  const email = inp({ type: "email", autocomplete: "email", required: true, name: "email" });
  const pw = inp({ type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72, required: true, name: "password" });
  const terms = inp({ type: "checkbox", required: true, name: "terms" });
  const age = inp({ type: "checkbox", required: true, name: "age" });
  const msg = h("div");
  const legal = (path: string, label: string) => (isSiteConfigured(config()) ? externalLink(`${config().siteUrl}${path}`, label) : h("span", null, label));
  const form = h(
    "form",
    {
      class: "stack",
      onsubmit: formHandler(msg, async () => {
        const u = username.value.trim().toLowerCase();
        if (!/^[a-z0-9_.]{3,24}$/.test(u)) throw new UserError("Kullanıcı adı 3-24 karakter; küçük harf, rakam, nokta ve alt çizgi.");
        if (moderateText(u, "username").decision !== "allow") throw new UserError("Bu kullanıcı adı topluluk kurallarımıza uygun değil.");
        if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw.value) || !/\d/.test(pw.value) || pw.value.length < 8) throw new UserError("Şifre en az 8 karakter olmalı, harf ve rakam içermeli.");
        if (!terms.checked || !age.checked) throw new UserError("Devam etmek için onay kutularını işaretlemelisin.");
        await api.signUp(email.value.trim().toLowerCase(), pw.value, u);
        navigate(`#/dogrula?email=${encodeURIComponent(email.value.trim().toLowerCase())}`);
      }),
    },
    msg,
    field("Kullanıcı adı", username),
    field("E-posta", email),
    field("Şifre", pw, "En az 8 karakter, en az bir harf ve bir rakam."),
    h("label", { class: "check" }, terms, h("span", { class: "small" }, legal("/yasal/kullanim-sartlari", "Kullanım Şartları"), ", ", legal("/yasal/topluluk-kurallari", "Topluluk Kuralları"), " ve ", legal("/yasal/kvkk", "KVKK Aydınlatma Metni"), "'ni okudum, kabul ediyorum.")),
    h("label", { class: "check" }, age, h("span", { class: "small" }, "13 yaşından büyüğüm. (18 yaşından küçüksem velimin onayı var.)")),
    h("button", { type: "submit", class: "btn btn-primary btn-lg" }, "Kayıt ol"),
  );
  return h("div", null, authShell("Taraftar hesabı oluştur", "Ücretsiz. Tüm temel özellikler ücretsiz üyelikte açık.", form), h("p", { class: "center small mt" }, "Zaten hesabın var mı? ", h("a", { href: "#/giris", class: "link" }, "Giriş yap")));
}

export function verifyPage(_: Record<string, string>, q: URLSearchParams): Node {
  const email = inp({ type: "email", required: true, value: q.get("email") ?? "" });
  const code = inp({ inputmode: "numeric", autocomplete: "one-time-code", maxlength: 10, required: true });
  const msg = h("div");
  const form = h(
    "form",
    { class: "stack", onsubmit: formHandler(msg, async () => {
      const token = code.value.replace(/\s/g, "");
      if (!/^\d{6,10}$/.test(token)) throw new UserError("E-postana gelen 6 haneli kodu gir.");
      await api.verifyOtp(email.value.trim().toLowerCase(), token, "email");
      toast("E-postan doğrulandı. Hoş geldin!", "success");
      navigate("#/ayarlar", true);
    }) },
    msg,
    field("E-posta", email),
    field("6 haneli kod", code),
    h("button", { type: "submit", class: "btn btn-primary btn-lg" }, "Doğrula"),
    button("Kodu yeniden gönder", (e) => run(e.currentTarget as HTMLButtonElement, () => api.resendSignup(email.value.trim().toLowerCase()), "Yeni kod gönderildi."), "outline"),
  );
  return authShell("E-postanı doğrula", "Doğrulama kodunu e-posta adresine gönderdik. Gelen kutunu ve spam klasörünü kontrol et.", form);
}

export function resetPage(_: Record<string, string>, q: URLSearchParams): Node {
  const email = inp({ type: "email", required: true, autocomplete: "email", value: q.get("email") ?? "" });
  const code = inp({ inputmode: "numeric", autocomplete: "one-time-code", maxlength: 10 });
  const pw = inp({ type: "password", autocomplete: "new-password", minlength: 8 });
  const step2 = h("div", { class: "stack" }, field("E-postadaki kod", code), field("Yeni şifre", pw, "En az 8 karakter, harf ve rakam."));
  step2.hidden = !q.get("email");
  const msg = h("div");
  const submitBtn = h("button", { type: "submit", class: "btn btn-primary btn-lg" }, q.get("email") ? "Şifreyi güncelle" : "Sıfırlama kodu gönder");
  const form = h(
    "form",
    { class: "stack", onsubmit: formHandler(msg, async () => {
      const mail = email.value.trim().toLowerCase();
      if (step2.hidden) {
        await api.recover(mail);
        step2.hidden = false;
        submitBtn.textContent = "Şifreyi güncelle";
        msg.replaceChildren(alertBox("Hesap varsa e-postana bir kod gönderildi.", "info"));
        return;
      }
      if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw.value) || !/\d/.test(pw.value) || pw.value.length < 8) throw new UserError("Şifre en az 8 karakter olmalı, harf ve rakam içermeli.");
      await api.verifyOtp(mail, code.value.replace(/\s/g, ""), "recovery");
      await api.updatePassword(pw.value);
      toast("Şifren güncellendi.", "success");
      navigate("#/", true);
    }) },
    msg,
    field("E-posta", email),
    step2,
    submitBtn,
  );
  return authShell("Şifreni sıfırla", "Kayıtlı e-postanı gir; sana bir sıfırlama kodu gönderelim.", form);
}

// ---------------------------------------------------------------- Ayarlar
export async function settingsPage(): Promise<Node> {
  if (!requireLogin()) return h("div");
  const me = await getMyProfile();
  if (!me) return emptyState("Profil bulunamadı", "Lütfen çıkış yapıp yeniden giriş yap.");

  // Profil bilgileri (moderasyon gerektiği için sunucu üzerinden)
  const displayName = inp({ maxlength: 50, value: me.display_name });
  const username = inp({ maxlength: 24, pattern: "[a-z0-9_.]{3,24}", value: me.username, required: true });
  const bio = h("textarea", { class: "input", rows: 3, maxlength: 300 }, me.bio) as HTMLTextAreaElement;
  const profileMsg = h("div");
  const profileForm = h(
    "form",
    { class: "stack", onsubmit: formHandler(profileMsg, async () => {
      const u = username.value.trim().toLowerCase();
      const pre = moderateFields({ username: u, display_name: displayName.value, bio: bio.value });
      if (pre.decision !== "allow") throw new UserError("Profil bilgilerin topluluk kurallarına uygun değil. Lütfen düzenle.");
      const r = await api.site<{ ok: boolean; message?: string }>("profile", { username: u, displayName: displayName.value, bio: bio.value });
      profileMsg.replaceChildren(alertBox(r.message ?? "Profilin güncellendi.", "success"));
    }) },
    profileMsg,
    field("Görünen ad", displayName),
    field("Kullanıcı adı", username),
    field("Biyografi", bio),
    h("button", { type: "submit", class: "btn btn-primary" }, "Kaydet"),
  );

  // Profil fotoğrafı
  const avatarBox = h("div", { class: "row gap-md" }, avatar(me.avatar_url, me.display_name || me.username, 64));
  const fileInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr-only", "aria-label": "Profil fotoğrafı seç" }) as HTMLInputElement;
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const err = validateUpload({ kind: "image", mime: file.type, size: file.size });
    if (err) return toast(err, "error");
    await run(null, async () => {
      const bmp = await createImageBitmap(file);
      const s = Math.min(bmp.width, bmp.height);
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 512, 512);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.85));
      if (!blob) throw new UserError("Görsel işlenemedi.");
      const path = `${me.id}/avatar-${crypto.randomUUID()}.webp`;
      await api.upload("avatars", path, blob, "image/webp");
      await api.update("profiles", `id=eq.${me.id}`, { avatar_url: api.publicUrl("avatars", path) });
      navigate(location.hash);
    }, "Profil fotoğrafın güncellendi.");
  };
  avatarBox.append(fileInput, button([icon("image", "ic-xs"), " Fotoğraf değiştir"], () => fileInput.click(), "secondary"));

  // Tercihler (doğrudan; yalnızca izinli sütunlar)
  const toggle = (label: string, desc: string, key: "is_private" | "data_saver" | "personalized_ads", value: boolean) => {
    const box = inp({ type: "checkbox", checked: value, "aria-label": label });
    box.onchange = () =>
      run(null, async () => {
        await api.update("profiles", `id=eq.${me.id}`, { [key]: box.checked });
        if (key === "data_saver") localStorage.setItem("amed.datasaver", box.checked ? "1" : "0");
      }, "Kaydedildi");
    return h("label", { class: "toggle-row" }, h("span", null, h("strong", { class: "block" }, label), h("span", { class: "muted small" }, desc)), box);
  };
  const theme = inp({ type: "checkbox", checked: currentTheme() === "dark", "aria-label": "Karanlık mod" });
  theme.onchange = () => applyTheme(theme.checked ? "dark" : "light");

  // Şifre
  const newPw = inp({ type: "password", autocomplete: "new-password", minlength: 8 });
  const pwMsg = h("div");
  const pwForm = h(
    "form",
    { class: "stack", onsubmit: formHandler(pwMsg, async () => {
      if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(newPw.value) || !/\d/.test(newPw.value) || newPw.value.length < 8) throw new UserError("Şifre en az 8 karakter olmalı, harf ve rakam içermeli.");
      await api.updatePassword(newPw.value);
      newPw.value = "";
      pwMsg.replaceChildren(alertBox("Şifren güncellendi.", "success"));
    }) },
    pwMsg,
    field("Yeni şifre", newPw),
    h("button", { type: "submit", class: "btn btn-secondary" }, "Şifreyi güncelle"),
  );

  // Hesap silme (Google Play kuralı: uygulama içinden silme talebi)
  const confirmInput = inp({ autocomplete: "off", placeholder: me.username });
  const delMsg = h("div");
  const delForm = h(
    "form",
    { class: "stack", onsubmit: formHandler(delMsg, async () => {
      if (confirmInput.value.trim().toLowerCase() !== me.username) throw new UserError("Onay için kullanıcı adını aynen yazmalısın.");
      if (!window.confirm("Hesabın ve tüm içeriklerin kalıcı olarak silinecek. Emin misin?")) return;
      await api.site("delete-account", { confirm: confirmInput.value.trim().toLowerCase() });
      await api.signOut("local");
      toast("Hesabın silindi.", "success");
      navigate("#/", true);
    }) },
    delMsg,
    field(`Onaylamak için kullanıcı adını yaz: ${me.username}`, confirmInput),
    h("button", { type: "submit", class: "btn btn-danger" }, "Hesabımı kalıcı olarak sil"),
  );

  return h(
    "div",
    { class: "stack-lg" },
    pageTitle("Ayarlar"),
    card("p-md stack", h("h2", { class: "h2" }, "Profil"), avatarBox, profileForm),
    card(
      "p-md stack",
      h("h2", { class: "h2" }, "Gizlilik ve tercihler"),
      toggle("Özel hesap", "Paylaşımlarını yalnızca onayladığın takipçiler görür.", "is_private", me.is_private),
      toggle("Veri tasarrufu", "Videolar ve kapaklar otomatik yüklenmez; dokununca oynar.", "data_saver", me.data_saver),
      toggle("Kişiselleştirilmiş reklam", "Uygulamada yalnızca platformun kendi sponsor kartları gösterilir; üçüncü taraf reklam çerezi kullanılmaz.", "personalized_ads", me.personalized_ads),
      h("label", { class: "toggle-row" }, h("span", null, h("strong", { class: "block" }, "Karanlık mod"), h("span", { class: "muted small" }, "Bu cihazda geçerli")), theme),
    ),
    card("p-md stack", h("h2", { class: "h2" }, "Güvenlik"), pwForm, button("Diğer cihazlardan çıkış yap", (e) => run(e.currentTarget as HTMLButtonElement, () => api.signOut("others"), "Diğer cihazlardaki oturumlar kapatıldı."), "outline")),
    card("p-md stack danger-zone", h("h2", { class: "h2 danger" }, "Hesabı kalıcı olarak sil"), h("p", { class: "muted small" }, "Profilin, gönderilerin, yorumların, fotoğraf ve videoların kalıcı olarak silinir. Bu işlem geri alınamaz."), delForm),
    button([icon("logout", "ic-xs"), " Çıkış yap"], async () => {
      await api.signOut("local");
      resetPremiumCache();
      navigate("#/", true);
    }, "secondary"),
  );
}

// ---------------------------------------------------------------- Premium
export async function premiumPage(): Promise<Node> {
  const settings = isBackendConfigured(config()) ? await getSettings().catch(() => null) : null;
  const price = settings?.premium.price_try ?? 10;
  const tagline = settings?.premium.tagline ?? "AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.";
  const [premium, sub] = api.userId && settings ? await Promise.all([isPremium(), getMySubscription().catch(() => null)]) : [false, null];
  const features = [
    "Ana sayfada, haberlerde, Shorts'ta, maç merkezinde ve profillerde reklam yok",
    "Video izlerken ve sayfa geçişlerinde reklam yok",
    "Profilinde Premium taraftar rozeti",
  ];
  return h(
    "div",
    { class: "stack-lg" },
    card(
      "p-lg stack premium",
      h("span", { class: "badge badge-amber" }, icon("crown", "ic-xs"), " AMEDSPOR Premium"),
      h("h1", { class: "h1" }, "Reklamsız taraftar deneyimi"),
      h("p", { class: "muted" }, tagline),
      h("p", null, h("span", { class: "price" }, fmtTry(price)), h("span", { class: "muted" }, " / ay · KDV dahil")),
      h("ul", { class: "checks" }, ...features.map((f) => h("li", null, icon("shield", "ic-xs accent"), f))),
      h("p", { class: "muted tiny note" }, "Ücretsiz üyeler hiçbir temel özellikten mahrum kalmaz. Premium yalnızca reklamları kaldırır."),
      premium
        ? alertBox("Premium üyeliğin aktif. Uygulamada reklam görmezsin.", "success")
        : alertBox(
            "Uygulama içinden Premium satın alma, Google Play Faturalandırma entegrasyonu tamamlandığında açılacak. Ödeme alınmadan Premium verilmez.",
            "info",
          ),
    ),
    sub
      ? card(
          "p-md stack-sm",
          h("h2", { class: "h2" }, "Abonelik durumun"),
          h("p", { class: "small" }, "Durum: ", h("strong", null, SUBSCRIPTION_STATUS_LABEL[sub.status as SubscriptionStatus] ?? sub.status)),
          h("p", { class: "small" }, `${sub.cancel_at_period_end ? "Premium bitiş" : "Sonraki yenileme"}: `, h("strong", null, fmtDate(sub.current_period_end))),
        )
      : null,
  );
}

// ---------------------------------------------------------------- Menü ve hakkında
export async function menuPage(): Promise<Node> {
  const me = api.userId ? await getMyProfile().catch(() => null) : null;
  const item = (href: string, ic: string, label: string) => h("a", { href, class: "menu-item" }, icon(ic, "ic"), h("span", null, label));
  return h(
    "div",
    { class: "stack" },
    me
      ? h("a", { href: `#/u/${me.username}`, class: "card p-md row gap-md" }, avatar(me.avatar_url, me.display_name || me.username, 52), h("span", null, h("strong", { class: "block" }, me.display_name || me.username), h("span", { class: "muted small" }, `@${me.username} · profilimi gör`)))
      : card("p-md stack-sm", h("strong", null, "Taraftar hesabınla giriş yap"), h("div", { class: "row gap-sm" }, h("a", { href: "#/giris", class: "btn btn-primary grow" }, "Giriş yap"), h("a", { href: "#/kayit", class: "btn btn-secondary grow" }, "Kayıt ol"))),
    card(
      "divide",
      item("#/maclar", "trophy", "Maç Merkezi"),
      item("#/haberler", "news", "Haberler"),
      item("#/oyuncular", "shirt", "Oyuncular"),
      item("#/tahmin", "target", "Tahmin & Oyunlar"),
      item("#/ara", "search", "Taraftar ara"),
    ),
    card(
      "divide",
      me ? item("#/bildirimler", "bell", "Bildirimler") : null,
      me ? item("#/kaydedilenler", "bookmark", "Kaydedilenler") : null,
      item("#/premium", "crown", "Premium"),
      me ? item("#/ayarlar", "settings", "Ayarlar") : null,
      item("#/hakkinda", "info", "Hakkında ve yasal metinler"),
    ),
    h("p", { class: "muted tiny center" }, `Sürüm ${config().appVersion}`),
  );
}

export function aboutPage(): Node {
  const site = config().siteUrl;
  const links: [string, string][] = [
    ["/yasal/gizlilik", "Gizlilik Politikası"],
    ["/yasal/kvkk", "KVKK Aydınlatma Metni"],
    ["/yasal/kullanim-sartlari", "Kullanım Şartları"],
    ["/yasal/topluluk-kurallari", "Topluluk Kuralları"],
    ["/yasal/abonelik", "Abonelik ve İptal Koşulları"],
    ["/yasal/telif", "Telif Hakkı Başvurusu"],
  ];
  return h(
    "div",
    { class: "stack" },
    pageTitle("Hakkında"),
    card(
      "p-md stack-sm",
      h("strong", null, "Bağımsız taraftar platformu"),
      h("p", { class: "small" }, "Bu uygulamanın Amed Sportif Faaliyetler Kulübü ile resmî bir bağlantısı yoktur ve kulübün resmî uygulaması değildir. Kulüp logosu, forması ve maç görüntüleri izin alınmadan kullanılmaz."),
      h("p", { class: "small" }, "Haberler ve maç verileri kaynaklarıyla birlikte gösterilir; veri yoksa uydurulmaz. Tahmin oyunlarında gerçek para veya bahis yoktur."),
    ),
    isSiteConfigured(config())
      ? card("divide", ...links.map(([p, l]) => h("a", { href: `${site}${p}`, target: "_blank", rel: "noopener noreferrer", class: "menu-item" }, icon("external", "ic"), h("span", null, l))))
      : setupNotice(),
    h("p", { class: "muted tiny center" }, "Uygulama ikonları: Lucide (ISC lisansı)."),
  );
}
