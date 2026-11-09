import { h, sheet, toast, type Child } from "./dom";
import { icon } from "./icons";
import { api, ApiError, NotConfiguredError } from "./api";
import { navigate } from "./router";
import { VERIFICATION_LABEL } from "@/lib/news/classify";
import { pickCampaign, type PlacementCode } from "@/lib/ads/frequency";
import type { AdCampaign, Match, NewsItem, Post, Team } from "@/lib/types";
import { getAdInventory, getSettings, isPremium } from "./data";

// ---------------------------------------------------------------- Biçimlendirme
const TZ = "Europe/Istanbul";
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(iso)) : "—";
export const fmtDate = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: TZ }).format(new Date(iso)) : "—");
export const fmtTry = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);
export const compact = (n: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "az önce";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} sa önce`;
  const d = Math.round(hr / 24);
  return d < 7 ? `${d} gün önce` : fmtDate(iso);
}

// ---------------------------------------------------------------- Temel bileşenler
export function avatar(src: string | null | undefined, name: string, size = 40, cls = ""): HTMLElement {
  if (src) return h("img", { class: `avatar ${cls}`, src, alt: "", width: size, height: size, loading: "lazy", style: `width:${size}px;height:${size}px` });
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR") || "A";
  return h("span", { class: `avatar avatar-fallback ${cls}`, "aria-hidden": "true", style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px` }, initials);
}

export const badge = (text: string, tone: "neutral" | "green" | "red" | "live" | "amber" = "neutral") => h("span", { class: `badge badge-${tone}` }, text);
export const liveBadge = (text = "Canlı") => h("span", { class: "badge badge-live" }, h("span", { class: "live-dot" }), text);
export const card = (cls: string, ...children: Child[]) => h("div", { class: `card ${cls}` }, ...children);

export function emptyState(title: string, description?: string, action?: Child, ic = "info"): HTMLElement {
  return h("div", { class: "empty" }, icon(ic, "ic-lg muted"), h("p", { class: "empty-title" }, title), description ? h("p", { class: "muted small" }, description) : null, action ?? null);
}

export function sectionHeader(title: string, href?: string, action = "Tümü", ic?: string): HTMLElement {
  return h("div", { class: "section-head" }, h("h2", null, ic ? icon(ic, "ic accent") : null, title), href ? h("a", { href, class: "link" }, action) : null);
}

export const skeleton = () =>
  h("div", { class: "stack", "aria-busy": "true", "aria-label": "Yükleniyor" }, h("div", { class: "skeleton", style: "height:150px" }), h("div", { class: "skeleton", style: "height:90px" }), h("div", { class: "skeleton", style: "height:220px" }));

export function alertBox(text: Child, tone: "info" | "error" | "success" | "warning" = "info"): HTMLElement {
  return h("div", { class: `alert alert-${tone}`, role: tone === "error" ? "alert" : "status" }, text);
}

export function button(label: Child, onclick: (e: Event) => void, variant = "primary", extra: Record<string, string | boolean> = {}): HTMLButtonElement {
  return h("button", { type: "button", class: `btn btn-${variant}`, onclick, ...extra }, label) as HTMLButtonElement;
}

/** Düğmeyi işlem süresince kilitler ve hataları kullanıcıya anlaşılır biçimde gösterir. */
export async function run<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> {
  if (btn) btn.disabled = true;
  try {
    const r = await fn();
    if (okMessage) toast(okMessage, "success");
    return r;
  } catch (e) {
    toast(errorText(e), "error");
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Kullanıcıya olduğu gibi gösterilebilecek (Türkçe) hata */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function errorText(e: unknown): string {
  if (e instanceof UserError) return e.message;
  if (e instanceof NotConfiguredError) return e.message;
  if (e instanceof ApiError) {
    if (e.code === "23505") return "Bu işlemi zaten yaptın.";
    if (e.status === 401) return "Oturumun sona erdi. Lütfen yeniden giriş yap.";
    if (e.status === 403 || e.code === "42501") return e.message.includes("süresi doldu") ? "Süre doldu." : "Bu işlem için yetkin yok.";
    return e.message;
  }
  if (e instanceof TypeError) return "İnternet bağlantısı yok veya sunucuya ulaşılamıyor.";
  return "Bir şeyler ters gitti. Lütfen tekrar dene.";
}

/** Giriş gerektiren işlemler için */
export function requireLogin(): boolean {
  if (api.userId) return true;
  navigate(`#/giris?next=${encodeURIComponent(location.hash || "#/")}`);
  return false;
}

export function setupNotice(): HTMLElement {
  return alertBox(
    h("span", null, h("strong", null, "Kurulum bekleniyor. "), "Uygulamanın veritabanı bağlantısı henüz yapılandırılmadı. Sahte veri gösterilmez."),
    "warning",
  );
}

export function externalLink(href: string, label: Child, cls = "link"): HTMLElement {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer", class: cls }, label, " ", icon("external", "ic-xs"));
}

// ---------------------------------------------------------------- Maç
export const MATCH_STATUS: Record<Match["status"], string> = {
  scheduled: "Planlandı",
  live: "Canlı",
  halftime: "Devre arası",
  finished: "Maç sonu",
  postponed: "Ertelendi",
  cancelled: "İptal",
};

function teamBlock(t: Team | null): HTMLElement {
  const initials = (t?.short_name || t?.name || "?").slice(0, 3).toLocaleUpperCase("tr-TR");
  return h("div", { class: "team" }, h("span", { class: `team-badge ${t?.is_amedspor ? "brand" : ""}` }, initials), h("span", { class: "team-name" }, t?.name ?? "—"));
}

export function matchCard(m: Match, label?: string, compactView = false): HTMLElement {
  const live = m.status === "live" || m.status === "halftime";
  const hasScore = m.home_score != null && m.away_score != null && m.status !== "scheduled";
  return h(
    "a",
    { href: `#/mac/${m.id}`, class: `card match ${live ? "is-live" : ""}` },
    h("div", { class: "match-top" }, h("span", null, label ?? m.competition), live ? liveBadge(m.status === "halftime" ? "Devre arası" : `Canlı ${m.minute ?? ""}'`) : badge(MATCH_STATUS[m.status], m.status === "scheduled" ? "green" : "neutral")),
    h("div", { class: "match-mid" }, teamBlock(m.home), h("div", { class: "score" }, hasScore ? `${m.home_score} - ${m.away_score}` : h("span", { class: "muted" }, "vs")), teamBlock(m.away)),
    compactView
      ? null
      : h("div", { class: "match-foot" }, icon("calendar", "ic-xs"), fmtDateTime(m.kickoff_at), m.venue ? ` · ${m.venue}` : "", " · ", m.verified ? h("span", { class: "accent" }, `Kaynak: ${m.source_name}`) : "Veri doğrulanmadı"),
  );
}

// ---------------------------------------------------------------- Haber
export const NEWS_CATEGORY: Record<NewsItem["category"], string> = {
  son_dakika: "Son dakika",
  resmi: "Resmî açıklama",
  haber: "Haber",
  transfer: "Transfer",
  mac: "Maç",
  roportaj: "Röportaj",
};

export function verificationBadge(v: NewsItem["verification"]) {
  return badge(VERIFICATION_LABEL[v], v === "official" || v === "verified" ? "green" : v === "rumor" ? "amber" : "neutral");
}

export function newsRow(n: NewsItem): HTMLElement {
  const date = n.source_published_at ?? n.published_at;
  return h(
    "a",
    { href: `#/haber/${n.id}`, class: "news-row" },
    h("div", { class: "news-thumb" }, n.image_url ? h("img", { src: n.image_url, alt: "", loading: "lazy" }) : h("span", { class: "brand-bg" }, icon("news", "ic-lg"))),
    h(
      "div",
      { class: "news-body" },
      h("div", { class: "row gap-xs" }, h("span", { class: `kicker ${n.category === "son_dakika" ? "live-text" : ""}` }, NEWS_CATEGORY[n.category]), n.verification === "rumor" ? verificationBadge("rumor") : null),
      h("h3", null, n.title),
      h("p", { class: "muted small" }, `${n.source?.name ?? "AMEDSPOR editör"} · ${date ? fmtDateTime(date) : "tarih yok"}`),
    ),
  );
}

export function newsHero(n: NewsItem): HTMLElement {
  return h(
    "a",
    { href: `#/haber/${n.id}`, class: "card news-hero" },
    n.image_url ? h("img", { src: n.image_url, alt: "", loading: "lazy" }) : h("div", { class: "brand-bg hero-fill" }, icon("news", "ic-xl")),
    h(
      "div",
      { class: "hero-text" },
      h("div", { class: "row gap-xs" }, badge(NEWS_CATEGORY[n.category], n.category === "son_dakika" ? "live" : "neutral"), verificationBadge(n.verification)),
      h("h3", null, n.title),
      h("p", { class: "small" }, `${n.source?.name ?? "AMEDSPOR editör"} · ${timeAgo(n.source_published_at ?? n.published_at ?? n.created_at)}`),
    ),
  );
}

// ---------------------------------------------------------------- Paylaşım (Android paylaşım menüsü)
interface CapacitorShare {
  share(o: { title?: string; text?: string; url?: string }): Promise<unknown>;
}
declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Share?: CapacitorShare } };
  }
}

export async function shareLink(path: string, title = "AMEDSPOR"): Promise<void> {
  const { config } = await import("./config");
  const site = config().siteUrl;
  const url = site.startsWith("https://") ? `${site}${path}` : undefined;
  try {
    const native = window.Capacitor?.Plugins?.Share;
    if (native) await native.share({ title, text: title, url });
    else if (navigator.share) await navigator.share({ title, url });
    else if (url) {
      await navigator.clipboard.writeText(url);
      toast("Bağlantı kopyalandı", "success");
    } else toast("Paylaşım için web sitesi adresi yapılandırılmalı.", "info");
  } catch {
    /* kullanıcı paylaşımı iptal etti */
  }
}

// ---------------------------------------------------------------- Şikâyet
const REASONS: [string, string][] = [
  ["kufur", "Küfür"], ["hakaret", "Hakaret"], ["tehdit", "Tehdit"], ["irkcilik", "Irkçılık"], ["nefret", "Nefret söylemi"],
  ["taciz", "Taciz"], ["siddet", "Şiddet çağrısı"], ["spam", "Spam"], ["dolandiricilik", "Dolandırıcılık"],
  ["kisisel_bilgi", "Kişisel bilgi ifşası"], ["uygunsuz_gorsel", "Uygunsuz görsel"], ["telif", "Telif hakkı ihlali"], ["diger", "Diğer"],
];

export function openReport(targetType: "post" | "comment" | "profile" | "news", targetId: string) {
  if (!requireLogin()) return;
  const select = h("select", { class: "input", "aria-label": "Şikâyet nedeni" }, ...REASONS.map(([v, l]) => h("option", { value: v }, l))) as HTMLSelectElement;
  const details = h("textarea", { class: "input", rows: 3, maxlength: 1000, placeholder: "İsteğe bağlı açıklama" }) as HTMLTextAreaElement;
  const s = sheet(
    "İçeriği şikâyet et",
    h(
      "div",
      { class: "stack" },
      select,
      details,
      button("Şikâyeti gönder", async (e) => {
        const ok = await run(e.currentTarget as HTMLButtonElement, () =>
          api.insert("reports", { reporter_id: api.userId, target_type: targetType, target_id: targetId, reason: select.value, details: details.value.slice(0, 1000) }),
        );
        if (ok !== undefined) {
          toast("Şikâyetin moderatörlere iletildi. Teşekkürler.", "success");
          s.close();
        }
      }, "danger"),
    ),
  );
}

// ---------------------------------------------------------------- Gönderi kartı
function mediaView(p: Post, dataSaver: boolean): HTMLElement | null {
  if (!p.media.length) return null;
  const strip = h("div", { class: "media-strip" });
  for (const m of p.media) {
    if (m.media_type === "image") {
      strip.appendChild(h("div", { class: "media-item" }, m.url ? h("img", { src: m.url, alt: "Gönderi görseli", loading: "lazy", decoding: "async" }) : h("span", { class: "muted small" }, "Görsel yüklenemedi")));
    } else {
      const slot = h("div", { class: "media-item" });
      const playBtn = h(
        "button",
        {
          type: "button",
          class: "video-cover",
          "aria-label": "Videoyu oynat",
          onclick: () => {
            if (!m.url) return toast("Video yüklenemedi", "error");
            slot.replaceChildren(h("video", { src: m.url, controls: true, autoplay: true, playsinline: true }));
          },
        },
        m.poster_url && !dataSaver ? h("img", { src: m.poster_url, alt: "" }) : h("span", { class: "brand-bg hero-fill" }),
        h("span", { class: "play-circle" }, icon("play", "ic-lg")),
      );
      slot.appendChild(playBtn);
      strip.appendChild(slot);
    }
  }
  return h("div", { class: "media" }, strip, p.media.length > 1 ? h("span", { class: "media-count" }, `${p.media.length} fotoğraf`) : null);
}

function pollView(p: Post): HTMLElement {
  const wrap = h("div", { class: "poll", role: "group", "aria-label": "Anket" });
  const render = (vote: string | null) => {
    const total = p.poll_options.reduce((a, o) => a + o.vote_count, 0);
    wrap.replaceChildren(
      ...p.poll_options.map((o) => {
        const pct = total ? Math.round((o.vote_count / total) * 100) : 0;
        return h(
          "button",
          {
            type: "button",
            class: `poll-opt ${vote === o.id ? "chosen" : ""}`,
            disabled: !!vote,
            onclick: async (e: Event) => {
              if (!requireLogin()) return;
              const ok = await run(e.currentTarget as HTMLButtonElement, () => api.insert("poll_votes", { post_id: p.id, option_id: o.id, user_id: api.userId }));
              if (ok !== undefined) {
                o.vote_count += 1;
                p.my_vote = o.id;
                render(o.id);
              }
            },
          },
          vote ? h("span", { class: "poll-bar", style: `width:${pct}%` }) : null,
          h("span", { class: "poll-label" }, h("span", null, o.label), vote ? h("span", null, `%${pct}`) : null),
        );
      }),
      h("p", { class: "muted small" }, `${total} oy`),
    );
  };
  render(p.my_vote ?? null);
  return wrap;
}

export function postCard(p: Post, opts: { dataSaver?: boolean; onDeleted?: () => void } = {}): HTMLElement {
  const author = p.author;
  const name = author?.display_name || author?.username || "Silinmiş kullanıcı";
  const isMine = api.userId === p.author_id;
  let liked = !!p.liked_by_me;
  let likes = p.like_count;
  let saved = !!p.bookmarked_by_me;

  const likeCount = h("span", { class: "count" }, compact(likes));
  const likeBtn = h("button", { type: "button", class: `act ${liked ? "on" : ""}`, "aria-pressed": String(liked), "aria-label": "Beğen" }, icon("heart"), likeCount) as HTMLButtonElement;
  likeBtn.onclick = async () => {
    if (!requireLogin()) return;
    const next = !liked;
    liked = next;
    likes += next ? 1 : -1;
    likeBtn.classList.toggle("on", next);
    likeBtn.setAttribute("aria-pressed", String(next));
    likeCount.textContent = compact(likes);
    try {
      if (next) await api.insert("likes", { user_id: api.userId, post_id: p.id });
      else await api.remove("likes", `user_id=eq.${api.userId}&post_id=eq.${p.id}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "23505")) {
        liked = !next;
        likes += next ? -1 : 1;
        likeBtn.classList.toggle("on", liked);
        likeCount.textContent = compact(likes);
        toast(errorText(e), "error");
      }
    }
  };
  const saveBtn = h("button", { type: "button", class: `act push ${saved ? "on" : ""}`, "aria-pressed": String(saved), "aria-label": "Kaydet" }, icon("bookmark")) as HTMLButtonElement;
  saveBtn.onclick = async () => {
    if (!requireLogin()) return;
    saved = !saved;
    saveBtn.classList.toggle("on", saved);
    try {
      if (saved) await api.insert("bookmarks", { user_id: api.userId, post_id: p.id });
      else await api.remove("bookmarks", `user_id=eq.${api.userId}&post_id=eq.${p.id}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "23505")) {
        saved = !saved;
        saveBtn.classList.toggle("on", saved);
        toast(errorText(e), "error");
      }
    }
  };

  const menu = () => {
    const s = sheet(
      "Gönderi seçenekleri",
      h(
        "div",
        { class: "stack" },
        isMine
          ? button([icon("trash"), " Gönderiyi sil"], async (e) => {
              if (!window.confirm("Bu gönderiyi kalıcı olarak silmek istiyor musun?")) return;
              const ok = await run(e.currentTarget as HTMLButtonElement, () => api.remove("posts", `id=eq.${p.id}&author_id=eq.${api.userId}`), "Gönderi silindi");
              if (ok !== undefined) {
                s.close();
                opts.onDeleted?.();
              }
            }, "danger")
          : button([icon("flag"), " Şikâyet et"], () => {
              s.close();
              openReport("post", p.id);
            }, "outline"),
        !isMine && author
          ? button("Kullanıcıyı engelle", async (e) => {
              if (!requireLogin()) return;
              if (!window.confirm("Bu kullanıcıyı engellemek istiyor musun? Birbirinizin içeriğini göremezsiniz.")) return;
              const ok = await run(e.currentTarget as HTMLButtonElement, () => api.insert("blocks", { blocker_id: api.userId, blocked_id: p.author_id }), "Kullanıcı engellendi");
              if (ok !== undefined) {
                s.close();
                opts.onDeleted?.();
              }
            }, "ghost")
          : null,
      ),
    );
  };

  return h(
    "article",
    { class: "card post" },
    h(
      "div",
      { class: "post-head" },
      h("a", { href: author ? `#/u/${author.username}` : "#", class: "post-author" }, avatar(author?.avatar_url, name, 40), h("span", null, h("strong", null, name), h("span", { class: "muted small block" }, `@${author?.username ?? "—"} · ${timeAgo(p.created_at)}${p.edited_at ? " · düzenlendi" : ""}`))),
      p.kind === "short" ? badge("Shorts", "red") : null,
      h("button", { type: "button", class: "icon-btn", "aria-label": "Gönderi seçenekleri", onclick: menu }, icon("more")),
    ),
    p.moderation_status !== "approved" && isMine ? alertBox(p.moderation_status === "pending" ? "İncelemede — yalnızca sen görüyorsun." : "Bu gönderi yayından kaldırıldı.", "warning") : null,
    p.body ? h("a", { href: `#/gonderi/${p.id}`, class: "post-body" }, p.body) : null,
    p.kind === "poll" ? pollView(p) : null,
    mediaView(p, !!opts.dataSaver),
    h(
      "div",
      { class: "post-actions" },
      likeBtn,
      h("a", { href: `#/gonderi/${p.id}`, class: "act", "aria-label": "Yorumlar" }, icon("message"), h("span", { class: "count" }, compact(p.comment_count))),
      h("button", { type: "button", class: "act", "aria-label": "Paylaş", onclick: () => shareLink(`/gonderi/${p.id}`) }, icon("share")),
      saveBtn,
    ),
  );
}

// ---------------------------------------------------------------- Sponsor kartı (yalnızca kendi kampanyalarımız)
const seenKey = () => `amed.adseen.${new Date().toISOString().slice(0, 10)}`;
function readSeen(): { counts: Record<string, number>; last: string | null } {
  try {
    return JSON.parse(localStorage.getItem(seenKey()) ?? "") as { counts: Record<string, number>; last: string | null };
  } catch {
    return { counts: {}, last: null };
  }
}

/**
 * Uygulama içinde yalnızca platformun KENDİ sponsor kartları gösterilir (çerez yok,
 * üçüncü taraf kod yok). Premium üyelerde hiçbir şey render edilmez. Kampanya yoksa
 * boş alan bırakılmaz.
 */
export async function adSlot(placement: PlacementCode, slot = 0, variant: "card" | "short" = "card"): Promise<HTMLElement | null> {
  try {
    if (await isPremium()) return null;
    const [settings, inv] = await Promise.all([getSettings(), getAdInventory()]);
    const pl = inv.placements.get(placement);
    if (!settings.ads.enabled || !pl?.enabled || settings.ads.max_per_page === 0) return null;
    const seen = readSeen();
    const c = pickCampaign(inv.campaigns, placement, seen.counts, settings.ads.per_campaign_daily_cap, seen.last, slot) as AdCampaign | null;
    if (!c) return null;
    const el = h(
      "aside",
      { class: `card sponsor ${variant === "short" ? "sponsor-short" : ""}`, "aria-label": `Sponsorlu içerik: ${c.advertiser_name}` },
      h("div", { class: "sponsor-top" }, h("strong", null, "Sponsorlu"), h("span", null, c.advertiser_name)),
      c.image_url ? h("img", { src: c.image_url, alt: "", loading: "lazy" }) : null,
      h(
        "div",
        { class: "sponsor-body" },
        h("div", null, h("strong", null, c.title), c.body ? h("p", { class: "small muted" }, c.body) : null),
        h("a", { href: c.target_url, target: "_blank", rel: "sponsored noopener noreferrer", class: "btn btn-primary btn-sm", onclick: () => api.trackAd(c.id, placement, "click") }, c.cta_label),
      ),
    );
    // Yalnızca gerçekten görüldüğünde (en az %50, 1 sn) sayılır
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer = setTimeout(() => {
            io.disconnect();
            const s = readSeen();
            s.counts[c.id] = (s.counts[c.id] ?? 0) + 1;
            s.last = c.id;
            try {
              localStorage.setItem(seenKey(), JSON.stringify(s));
            } catch {
              /* depolama kapalı */
            }
            api.trackAd(c.id, placement, "impression");
          }, 1000);
        } else if (timer) clearTimeout(timer);
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return el;
  } catch {
    return null; // reklam yüklenemezse uygulama hata vermez
  }
}

/** Reklamı yer tutucu ile ekler; yüklenemezse yer tutucu kaldırılır (boş alan kalmaz). */
export function adPlaceholder(placement: PlacementCode, slot = 0, variant: "card" | "short" = "card"): HTMLElement {
  const holder = h("div", { class: "ad-holder" });
  adSlot(placement, slot, variant).then((el) => (el ? holder.replaceWith(el) : holder.remove()));
  return holder;
}
