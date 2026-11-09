import { h } from "../dom";
import { icon } from "../icons";
import { config, isBackendConfigured } from "../config";
import { getFeed, getLeaderboard, getMatches, getNews, getTodayQuiz } from "../data";
import { adPlaceholder, avatar, card, compact, emptyState, matchCard, newsHero, newsRow, postCard, sectionHeader, setupNotice } from "../ui";

const quick = (href: string, ic: string, label: string) => h("a", { href, class: "quick" }, icon(ic, "ic"), h("span", null, label));

export async function homePage(): Promise<Node> {
  const shortcuts = h(
    "nav",
    { class: "quick-grid", "aria-label": "Kısayollar" },
    quick("#/haberler", "news", "Haberler"),
    quick("#/oyuncular", "shirt", "Oyuncular"),
    quick("#/tahmin", "target", "Tahmin"),
    quick("#/premium", "crown", "Premium"),
  );
  if (!isBackendConfigured(config())) {
    return h("div", { class: "stack-lg" }, setupNotice(), shortcuts, emptyState("Maç verisi henüz girilmedi", "Fikstür ve skorlar yalnızca doğrulanmış kaynaklardan girildiğinde gösterilir.", null, "calendar"));
  }
  const [live, upcoming, past, news, feed, shorts, quiz, leaders] = await Promise.all([
    getMatches("live", 2),
    getMatches("upcoming", 1),
    getMatches("past", 1),
    getNews({ limit: 6 }),
    getFeed({ limit: 4 }),
    getFeed({ scope: "shorts", limit: 8 }),
    getTodayQuiz().catch(() => null),
    getLeaderboard(5).catch(() => []),
  ]);
  const next = upcoming[0];
  const last = past[0];
  const breaking = news.filter((n) => n.category === "son_dakika");
  const lead = breaking[0] ?? news[0];

  const matchesSection = h(
    "section",
    null,
    sectionHeader(live.length ? "Canlı maç" : "Maç merkezi", "#/maclar", "Tümü", "trophy"),
    live.length || next || last
      ? h("div", { class: "stack" }, ...live.map((m) => matchCard(m)), !live.length && next ? matchCard(next, "Sıradaki maç") : null, last ? matchCard(last, "Son maç") : null)
      : emptyState("Maç verisi henüz girilmedi", "Uydurma skor gösterilmez.", null, "calendar"),
  );

  const newsSection = h(
    "section",
    null,
    sectionHeader(breaking.length ? "Son dakika" : "Son haberler", "#/haberler", "Tümü", "news"),
    lead ? h("div", { class: "stack" }, newsHero(lead), card("p-xs", ...news.filter((n) => n.id !== lead.id).slice(0, 4).map(newsRow))) : emptyState("Henüz yayınlanmış haber yok", "Haberler yalnızca güvenilir kaynaklardan, kaynak ve tarih bilgisiyle yayınlanır.", null, "news"),
  );

  const shortsSection = h(
    "section",
    null,
    sectionHeader("Shorts", "#/shorts", "Tümü", "shorts"),
    shorts.posts.length
      ? h(
          "div",
          { class: "h-scroll" },
          ...shorts.posts.map((s) =>
            h(
              "a",
              { href: `#/shorts?v=${s.id}`, class: "short-thumb" },
              s.media[0]?.poster_url ? h("img", { src: s.media[0].poster_url, alt: "", loading: "lazy" }) : h("span", { class: "brand-bg hero-fill" }),
              h("span", { class: "short-meta" }, `@${s.author?.username ?? ""}`, h("span", { class: "block" }, `♥ ${compact(s.like_count)}`)),
            ),
          ),
        )
      : emptyState("Henüz Shorts yok", "İlk dikey videoyu sen paylaş.", h("a", { href: "#/paylas?tur=short", class: "btn btn-primary btn-sm" }, "Shorts yükle"), "shorts"),
  );

  const gamesSection = h(
    "section",
    null,
    sectionHeader("Günün tahmini", "#/tahmin", "Oyna", "target"),
    card(
      "p-md stack",
      next ? h("div", null, h("p", { class: "muted small" }, "Sıradaki maç"), h("p", null, h("strong", null, `${next.home?.name ?? ""} – ${next.away?.name ?? ""}`)), h("a", { href: `#/tahmin?mac=${next.id}`, class: "btn btn-primary btn-sm" }, "Skor tahminini yap")) : h("p", { class: "muted small" }, "Tahmine açık maç henüz yok."),
      h("div", { class: "divider" }),
      h("p", { class: "row gap-xs" }, icon("brain", "ic accent"), h("strong", null, "Günlük bilgi yarışması")),
      h("p", { class: "muted small" }, quiz ? quiz.quiz.question : "Bugünün sorusu henüz eklenmedi."),
      h("p", { class: "muted tiny" }, "Yalnızca eğlence amaçlıdır. Para, bahis veya nakit ödül yoktur."),
    ),
  );

  const feedSection = h(
    "section",
    null,
    sectionHeader("Taraftar paylaşımları", "#/akis", "Tümü", "users"),
    feed.posts.length ? h("div", { class: "stack" }, ...feed.posts.map((p) => postCard(p))) : emptyState("Henüz paylaşım yok", undefined, h("a", { href: "#/paylas", class: "btn btn-primary btn-sm" }, "İlk paylaşımı yap"), "users"),
  );

  const leadersSection = leaders.length
    ? h(
        "section",
        null,
        sectionHeader("Liderlik tablosu", "#/tahmin", "Tümü", "star"),
        card("divide", ...leaders.map((l) => h("a", { href: `#/u/${l.username}`, class: "list-row" }, h("span", { class: "rank" }, String(l.rank)), avatar(l.avatar_url, l.display_name || l.username, 30), h("span", { class: "grow" }, `@${l.username}`), h("strong", null, `${l.points} p`)))),
      )
    : null;

  return h(
    "div",
    { class: "stack-lg" },
    matchesSection,
    shortcuts,
    newsSection,
    adPlaceholder("home_feed"),
    shortsSection,
    gamesSection,
    feedSection,
    leadersSection,
    h(
      "a",
      { href: "#/hakkinda", class: "card history-card brand-bg" },
      h("strong", null, "Bağımsız taraftar platformu"),
      h("p", { class: "small" }, "Amedspor kulübünün resmî uygulaması değildir. Ayrıntılar ve yasal metinler →"),
    ),
  );
}
