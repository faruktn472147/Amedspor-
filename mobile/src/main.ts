import { h, clear } from "./dom";
import { icon, logoMark } from "./icons";
import { api } from "./api";
import { config, isBackendConfigured } from "./config";
import { canGoBack, currentHash, goBack, resolve, route, startRouter } from "./router";
import { applyTheme } from "./theme";
import { avatar, emptyState, errorText, skeleton } from "./ui";
import { getMyProfile, getUnreadCount } from "./data";
import { homePage } from "./pages/home";
import { gamesPage, matchDetailPage, matchesPage, newsDetailPage, newsPage, playerDetailPage, playersPage, stopLiveRefresh } from "./pages/content";
import { bookmarksPage, composePage, feedPage, myProfileRedirect, notificationsPage, postPage, profilePage, searchPage, shortsPage } from "./pages/social";
import { aboutPage, loginPage, menuPage, premiumPage, resetPage, settingsPage, signupPage, verifyPage } from "./pages/account";
import { setupPage } from "./pages/setup";

// ---------------------------------------------------------------- Rotalar
route("/", "Ana Sayfa", homePage);
route("/akis", "Taraftar Akışı", feedPage);
route("/shorts", "Shorts", shortsPage);
route("/paylas", "Paylaş", composePage);
route("/gonderi/:id", "Gönderi", postPage);
route("/u/:username", "Profil", profilePage);
route("/profil", "Profil", myProfileRedirect);
route("/maclar", "Maç Merkezi", matchesPage);
route("/mac/:id", "Maç", matchDetailPage);
route("/haberler", "Haberler", newsPage);
route("/haber/:id", "Haber", newsDetailPage);
route("/oyuncular", "Oyuncular", playersPage);
route("/oyuncu/:slug", "Oyuncu", playerDetailPage);
route("/tahmin", "Tahmin & Oyunlar", gamesPage);
route("/bildirimler", "Bildirimler", notificationsPage);
route("/kaydedilenler", "Kaydedilenler", bookmarksPage);
route("/ara", "Ara", searchPage);
route("/giris", "Giriş", loginPage);
route("/kayit", "Kayıt", signupPage);
route("/dogrula", "E-posta doğrulama", verifyPage);
route("/sifre", "Şifre sıfırlama", resetPage);
route("/ayarlar", "Ayarlar", settingsPage);
route("/premium", "Premium", premiumPage);
route("/menu", "Menü", menuPage);
route("/hakkinda", "Hakkında", aboutPage);
route("/kurulum", "Bağlantı", setupPage);

// ---------------------------------------------------------------- Kabuk
const TABS: [string, string, string][] = [
  ["#/", "home", "Ana Sayfa"],
  ["#/akis", "users", "Akış"],
  ["#/paylas", "plus", "Paylaş"],
  ["#/shorts", "shorts", "Shorts"],
  ["#/maclar", "trophy", "Maçlar"],
];

const view = h("main", { id: "view", class: "view", tabindex: "-1" });
const ROOT_TABS = new Set(["/", "/akis", "/paylas", "/shorts", "/maclar"]);
const backBtn = h("button", { type: "button", class: "icon-btn", "aria-label": "Geri", hidden: true, onclick: () => goBack() }, icon("back"));
const bell = h("a", { href: "#/bildirimler", class: "icon-btn rel", "aria-label": "Bildirimler" }, icon("bell"));
const accountSlot = h("span", { class: "row" });
const offline = h("div", { class: "offline", role: "status", hidden: true }, icon("wifi", "ic-xs"), " İnternet bağlantısı yok. Bağlantı gelince içerikler güncellenir.");
const nav = h(
  "nav",
  { class: "tabbar", "aria-label": "Alt menü" },
  ...TABS.map(([href, ic, label]) =>
    h("a", { href, class: `tab ${ic === "plus" ? "tab-create" : ""}`, "data-tab": href }, ic === "plus" ? h("span", { class: "create-btn" }, icon("plus")) : icon(ic), h("span", { class: ic === "plus" ? "sr-only" : "" }, label)),
  ),
);

function shell() {
  const header = h(
    "header",
    { class: "topbar" },
    h("div", { class: "stripe", "aria-hidden": "true" }),
    h(
      "div",
      { class: "topbar-in" },
      backBtn,
      h("a", { href: "#/", class: "brand", "aria-label": "AMEDSPOR ana sayfa" }, logoMark(30), h("span", { class: "brand-text" }, "AMED", h("span", { class: "red" }, "SPOR"))),
      h("a", { href: "#/ara", class: "icon-btn", "aria-label": "Ara" }, icon("search")),
      bell,
      accountSlot,
      h("a", { href: "#/menu", class: "icon-btn", "aria-label": "Menü" }, icon("menu")),
    ),
  );
  document.body.replaceChildren(header, offline, view, nav);
}

async function refreshHeader() {
  bell.hidden = !api.userId;
  if (!api.userId || !isBackendConfigured(config())) {
    clear(accountSlot, api.userId ? null : h("a", { href: "#/giris", class: "btn btn-primary btn-sm" }, "Giriş yap"));
    return;
  }
  try {
    const [me, unread] = await Promise.all([getMyProfile(), getUnreadCount()]);
    bell.querySelector(".dot")?.remove();
    if (unread > 0) bell.appendChild(h("span", { class: "dot", "aria-label": `${unread} okunmamış` }, unread > 99 ? "99+" : String(unread)));
    clear(accountSlot, me ? h("a", { href: `#/u/${me.username}`, "aria-label": "Profilim", class: "me" }, avatar(me.avatar_url, me.display_name || me.username, 30)) : null);
  } catch {
    /* çevrimdışıysa başlık sade kalır */
  }
}

let renderToken = 0;
async function render() {
  stopLiveRefresh();
  const token = ++renderToken;
  const hash = currentHash();
  const m = resolve(hash);
  const path = hash.split("?")[0];
  for (const a of nav.querySelectorAll<HTMLAnchorElement>("a.tab")) {
    const tab = a.dataset.tab ?? "";
    a.toggleAttribute("aria-current", tab === "#/" ? path === "#/" : path === tab || path.startsWith(`${tab}/`));
  }
  backBtn.hidden = !(canGoBack() && m && !ROOT_TABS.has(m.path));
  document.body.classList.toggle("is-shorts", m?.path === "/shorts");
  if (!m) {
    clear(view, emptyState("Sayfa bulunamadı", "Aradığın sayfa taşınmış veya hiç var olmamış olabilir.", h("a", { href: "#/", class: "btn btn-primary btn-sm" }, "Ana sayfaya dön")));
    return;
  }
  try {
    document.title = `${m.title} · AMEDSPOR`;
  } catch {
    /* bazı önizleyicilerde başlık değiştirilemez */
  }
  clear(view, skeleton());
  try {
    window.scrollTo(0, 0);
  } catch {
    /* yok say */
  }
  try {
    const node = await m.handler(m.params, m.query);
    if (token !== renderToken) return; // kullanıcı bu arada başka sayfaya geçti
    clear(view, node);
  } catch (e) {
    if (token !== renderToken) return;
    clear(view, emptyState("İçerik yüklenemedi", errorText(e), h("button", { class: "btn btn-primary btn-sm", onclick: () => render() }, "Tekrar dene"), "wifi"));
  }
  try {
    view.focus({ preventScroll: true });
  } catch {
    /* yok say */
  }
}

/** Beklenmeyen bir hata olursa boş ekran yerine okunabilir bir mesaj gösterilir. */
function showFatal(err: unknown) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const box = h(
    "div",
    { class: "alert alert-error", role: "alert", style: "margin:14px" },
    h("strong", null, "Uygulama beklenmeyen bir hatayla karşılaştı. "),
    h("span", { class: "block small" }, message),
    h("button", { type: "button", class: "btn btn-primary btn-sm", style: "margin-top:10px", onclick: () => location.reload() }, "Yeniden başlat"),
  );
  (document.getElementById("view") ?? document.body).appendChild(box);
}

export function start() {
  try {
    applyTheme();
  } catch {
    /* tema uygulanamazsa varsayılan karanlık tema kalır */
  }
  shell();
  const onlineState = () => (offline.hidden = navigator.onLine !== false);
  window.addEventListener("online", () => {
    onlineState();
    render();
  });
  window.addEventListener("offline", onlineState);
  onlineState();
  window.addEventListener("unhandledrejection", (e) => console.error("AMEDSPOR:", e.reason));
  api.onAuthChange(() => refreshHeader());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshHeader();
  });
  startRouter(render);
  render();
  refreshHeader();
}

try {
  start();
} catch (e) {
  showFatal(e);
}
