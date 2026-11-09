import { h } from "../dom";
import { icon } from "../icons";
import { api } from "../api";
import { config, isBackendConfigured } from "../config";
import { getLeaderboard, getMatch, getMatches, getMyPrediction, getNews, getNewsItem, getPlayer, getPlayers, getTodayQuiz } from "../data";
import {
  adPlaceholder,
  alertBox,
  avatar,
  badge,
  button,
  card,
  emptyState,
  externalLink,
  fmtDateTime,
  fmtDate,
  matchCard,
  newsHero,
  newsRow,
  NEWS_CATEGORY,
  openReport,
  requireLogin,
  run,
  sectionHeader,
  setupNotice,
  verificationBadge,
} from "../ui";
import type { NewsItem } from "@/lib/types";

const notReady = () => (!isBackendConfigured(config()) ? setupNotice() : null);
const pageTitle = (t: string, sub?: string) => h("header", { class: "page-title" }, h("h1", null, t), sub ? h("p", { class: "muted small" }, sub) : null);

// ---------------------------------------------------------------- Haberler
const CATS = ["son_dakika", "resmi", "mac", "transfer", "roportaj", "haber"] as const;

export async function newsPage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  const cat = CATS.find((c) => c === q.get("kategori"));
  const head = pageTitle("Haber Merkezi", "Her haberde kaynak, tarih ve doğrulama durumu gösterilir. Söylentiler açıkça etiketlenir.");
  const chips = h(
    "nav",
    { class: "chips", "aria-label": "Kategoriler" },
    h("a", { href: "#/haberler", class: `chip ${!cat ? "on" : ""}` }, "Tümü"),
    ...CATS.map((c) => h("a", { href: `#/haberler?kategori=${c}`, class: `chip ${cat === c ? "on" : ""}` }, NEWS_CATEGORY[c])),
  );
  if (!isBackendConfigured(config())) return h("div", { class: "stack" }, head, setupNotice());
  const items = await getNews({ category: cat, limit: 30 });
  return h(
    "div",
    { class: "stack" },
    head,
    chips,
    items.length
      ? h("div", { class: "stack" }, newsHero(items[0]), card("p-xs", ...items.slice(1).map(newsRow)))
      : emptyState("Bu kategoride yayınlanmış haber yok", "Haberler güvenilir kaynaklardan geldikçe ve onaylandıkça burada görünür.", null, "news"),
  );
}

export async function newsDetailPage(p: Record<string, string>): Promise<Node> {
  const n = (await getNewsItem(p.id)) as NewsItem | null;
  if (!n) return emptyState("Haber bulunamadı", "Kaldırılmış veya hiç yayınlanmamış olabilir.");
  return h(
    "article",
    { class: "stack" },
    h("div", { class: "row gap-xs wrap" }, badge(NEWS_CATEGORY[n.category], n.category === "son_dakika" ? "live" : "green"), verificationBadge(n.verification)),
    h("h1", { class: "article-title" }, n.title),
    h(
      "dl",
      { class: "meta muted small" },
      h("div", null, h("dt", null, "Kaynak: "), h("dd", null, n.source?.name ?? "AMEDSPOR editör ekibi")),
      h("div", null, h("dt", null, "Kaynakta yayın: "), h("dd", null, fmtDateTime(n.source_published_at))),
      h("div", null, h("dt", null, "Platformda yayın: "), h("dd", null, fmtDateTime(n.published_at))),
    ),
    n.verification === "rumor" ? alertBox("Bu bir söylentidir ve kulüp tarafından doğrulanmamıştır. Kesin bilgi olarak değerlendirmeyin.", "warning") : null,
    n.image_url ? h("figure", { class: "figure" }, h("img", { src: n.image_url, alt: "" }), n.image_credit ? h("figcaption", null, `Görsel: ${n.image_credit}`) : null) : null,
    n.summary ? h("p", { class: "lead" }, n.summary) : null,
    n.body ? h("div", { class: "prose" }, n.body) : null,
    n.original_url ? card("p-md row between wrap", h("span", { class: "small" }, "Haberin tamamı kaynağında"), externalLink(n.original_url, "Kaynağa git", "btn btn-primary btn-sm")) : null,
    api.userId ? h("button", { type: "button", class: "link small", onclick: () => openReport("news", n.id) }, "Hatalı haber bildir") : null,
    adPlaceholder("news_detail"),
  );
}

// ---------------------------------------------------------------- Maçlar
export async function matchesPage(): Promise<Node> {
  const head = pageTitle("Maç Merkezi", "Fikstür, skorlar, goller ve kadrolar. Eksik veri uydurulmaz.");
  if (!isBackendConfigured(config())) return h("div", { class: "stack" }, head, setupNotice());
  const [live, upcoming, past] = await Promise.all([getMatches("live", 5), getMatches("upcoming", 10), getMatches("past", 10)]);
  return h(
    "div",
    { class: "stack-lg" },
    head,
    live.length ? h("section", null, sectionHeader("Şu an oynanıyor"), h("div", { class: "stack" }, ...live.map((m) => matchCard(m)))) : null,
    h("section", null, sectionHeader("Yaklaşan maçlar"), upcoming.length ? h("div", { class: "stack" }, ...upcoming.map((m) => matchCard(m))) : emptyState("Planlanmış maç bilgisi yok", undefined, null, "calendar")),
    adPlaceholder("match_center"),
    h("section", null, sectionHeader("Sonuçlar"), past.length ? h("div", { class: "stack" }, ...past.map((m) => matchCard(m, undefined, true))) : emptyState("Henüz sonuç girilmedi")),
  );
}

const EVENT_LABEL: Record<string, string> = {
  goal: "⚽ Gol",
  penalty_goal: "⚽ Penaltı golü",
  own_goal: "⚽ Kendi kalesine",
  penalty_miss: "✕ Kaçan penaltı",
  yellow: "🟨 Sarı kart",
  second_yellow: "🟨🟥 İkinci sarı",
  red: "🟥 Kırmızı kart",
  substitution: "⇄ Değişiklik",
  var: "VAR",
  note: "Not",
};

let liveTimer: ReturnType<typeof setInterval> | null = null;
export function stopLiveRefresh() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
}

export async function matchDetailPage(p: Record<string, string>): Promise<Node> {
  const data = await getMatch(p.id);
  if (!data) return emptyState("Maç bulunamadı");
  const { match: m, events, lineups } = data;
  const live = m.status === "live" || m.status === "halftime";
  if (live) {
    // Canlı maçta 30 sn'de bir yenile; uygulama arka plandaysa yenileme yapılmaz
    liveTimer = setInterval(() => {
      if (document.visibilityState === "visible" && location.hash.startsWith(`#/mac/${m.id}`)) window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, 30000);
  }
  const side = (id?: string) => lineups.filter((l) => l.team_id === id);
  const stats = Object.entries(m.stats ?? {});
  return h(
    "div",
    { class: "stack-lg" },
    matchCard(m),
    h("p", { class: "muted tiny center" }, `Son güncelleme: ${fmtDateTime(m.updated_at)} · `, m.source_url ? externalLink(m.source_url, `Kaynak: ${m.source_name ?? ""}`) : m.source_name ? `Kaynak: ${m.source_name}` : "Kaynak belirtilmedi"),
    m.status === "scheduled" && new Date(m.kickoff_at) > new Date() ? h("a", { href: `#/tahmin?mac=${m.id}`, class: "btn btn-primary" }, "Skor tahmini yap") : null,
    h(
      "section",
      null,
      sectionHeader("Maç olayları"),
      events.length
        ? card(
            "divide",
            ...events.map((e) =>
              h("div", { class: `event ${e.team_id === m.home?.id ? "" : "away"}` }, h("strong", { class: "minute" }, `${e.minute}${e.extra_minute ? `+${e.extra_minute}` : ""}'`), h("span", null, EVENT_LABEL[e.type] ?? e.type, " ", h("strong", null, e.player_name ?? ""), e.detail ? h("span", { class: "muted" }, ` · ${e.detail}`) : null)),
            ),
          )
        : emptyState(m.status === "scheduled" ? "Maç henüz başlamadı" : "Olay verisi girilmedi"),
    ),
    adPlaceholder("match_center"),
    h(
      "section",
      null,
      sectionHeader("Kadrolar"),
      lineups.length
        ? h(
            "div",
            { class: "stack" },
            ...[m.home, m.away].map((t) =>
              card(
                "p-md",
                h("strong", null, t?.name ?? ""),
                h("p", { class: "kicker" }, "İlk 11"),
                h("ul", { class: "plain" }, ...side(t?.id).filter((l) => l.is_starter).map((l) => h("li", null, `${l.shirt_number ?? ""} `, l.player ? h("a", { href: `#/oyuncu/${l.player.slug}` }, l.player.full_name) : "—"))),
                h("p", { class: "kicker" }, "Yedekler"),
                h("ul", { class: "plain muted" }, ...side(t?.id).filter((l) => !l.is_starter).map((l) => h("li", null, `${l.shirt_number ?? ""} ${l.player?.full_name ?? ""}`))),
              ),
            ),
          )
        : emptyState("Kadro bilgisi henüz açıklanmadı"),
    ),
    h(
      "section",
      null,
      sectionHeader("Maç istatistikleri"),
      stats.length
        ? card(
            "p-md stack",
            ...stats.map(([k, [a, b]]) => {
              const total = a + b || 1;
              return h("div", null, h("div", { class: "row between small" }, h("strong", null, String(a)), h("span", { class: "muted" }, k), h("strong", null, String(b))), h("div", { class: "statbar" }, h("span", { class: "home", style: `width:${(a / total) * 100}%` }), h("span", { class: "away", style: `width:${(b / total) * 100}%` })));
            }),
          )
        : emptyState("İstatistik verisi yok"),
    ),
  );
}

// ---------------------------------------------------------------- Oyuncular
export async function playersPage(): Promise<Node> {
  const head = pageTitle("Oyuncular", "Güncel kadro ve kaynaklı sezon istatistikleri.");
  if (!isBackendConfigured(config())) return h("div", { class: "stack" }, head, setupNotice());
  const players = await getPlayers();
  if (!players.length) return h("div", { class: "stack" }, head, emptyState("Kadro bilgisi henüz girilmedi", "Oyuncu bilgileri doğrulanabilir kaynaklardan girildiğinde görünür.", null, "shirt"));
  const order = ["Kaleci", "Defans", "Orta Saha", "Forvet"];
  const groups = [...order.map((pos) => ({ pos, list: players.filter((x) => x.position === pos) })), { pos: "Diğer", list: players.filter((x) => !x.position || !order.includes(x.position)) }].filter((g) => g.list.length);
  return h(
    "div",
    { class: "stack-lg" },
    head,
    ...groups.map((g) =>
      h(
        "section",
        null,
        h("h2", { class: "h2" }, g.pos),
        h("div", { class: "grid2" }, ...g.list.map((pl) => h("a", { href: `#/oyuncu/${pl.slug}`, class: "card player-card" }, h("span", { class: "shirt-no" }, String(pl.shirt_number ?? "")), avatar(pl.photo_url, pl.full_name, 56), h("strong", null, pl.full_name), h("span", { class: "muted tiny" }, pl.position ?? "Mevki bilgisi yok")))),
      ),
    ),
  );
}

export async function playerDetailPage(p: Record<string, string>): Promise<Node> {
  const d = await getPlayer(p.slug);
  if (!d) return emptyState("Oyuncu bulunamadı");
  const { player: pl, stats, fanRating } = d;
  const total = (k: "appearances" | "goals" | "assists" | "minutes") => (stats.length ? String(stats.reduce((a, s) => a + (s[k] ?? 0), 0)) : "—");
  return h(
    "div",
    { class: "stack-lg" },
    h(
      "div",
      { class: "card brand-bg player-hero" },
      h("span", { class: "hero-no" }, String(pl.shirt_number ?? "")),
      avatar(pl.photo_url, pl.full_name, 84),
      h("div", null, h("h1", null, pl.full_name), h("p", null, `${pl.position ?? "Mevki bilgisi yok"}${pl.shirt_number ? ` · #${pl.shirt_number}` : ""}`), h("p", { class: "small" }, `${pl.nationality ?? ""}${pl.birth_date ? ` · ${fmtDate(pl.birth_date)}` : ""}`)),
      pl.photo_credit ? h("p", { class: "tiny" }, `Fotoğraf: ${pl.photo_credit}`) : null,
    ),
    h("div", { class: "grid4" }, ...(["appearances", "goals", "assists", "minutes"] as const).map((k) => card("p-sm center", h("strong", { class: "big" }, total(k)), h("span", { class: "muted tiny block" }, { appearances: "Maç", goals: "Gol", assists: "Asist", minutes: "Dakika" }[k])))),
    card("p-md row between", h("span", { class: "row gap-xs" }, icon("star", "ic amber"), "Taraftar puanı"), h("strong", null, fanRating ? `${fanRating.avg.toFixed(1)} / 10 (${fanRating.count} oy)` : "Henüz oy yok")),
    h(
      "section",
      null,
      sectionHeader("Sezon istatistikleri"),
      stats.length
        ? card(
            "table-wrap",
            h(
              "table",
              null,
              h("thead", null, h("tr", null, ...["Sezon", "Turnuva", "Maç", "Gol", "Ast", "Sarı", "Kır."].map((x) => h("th", null, x)))),
              h("tbody", null, ...stats.map((s) => h("tr", null, h("td", null, s.season), h("td", null, s.competition), h("td", null, String(s.appearances)), h("td", null, h("strong", null, String(s.goals))), h("td", null, String(s.assists)), h("td", null, String(s.yellow_cards)), h("td", null, String(s.red_cards))))),
            ),
            h("p", { class: "muted tiny p-sm" }, "Kaynak: ", stats[0].source_url ? externalLink(stats[0].source_url, stats[0].source_name ?? "") : (stats[0].source_name ?? "")),
          )
        : emptyState("İstatistik verisi yok", "Kaynağı doğrulanmış istatistikler girildiğinde burada görünür."),
    ),
    pl.bio ? card("p-md prose", pl.bio) : null,
    adPlaceholder("player_profile"),
  );
}

// ---------------------------------------------------------------- Tahmin & oyunlar
function stepper(label: string, value: number, onChange: (n: number) => void): HTMLElement {
  const out = h("span", { class: "step-val", "aria-live": "polite" }, String(value));
  const set = (n: number) => {
    value = Math.max(0, Math.min(20, n));
    out.textContent = String(value);
    onChange(value);
  };
  return h("div", { class: "stepper", role: "group", "aria-label": label }, h("button", { type: "button", "aria-label": `${label} azalt`, onclick: () => set(value - 1) }, "−"), out, h("button", { type: "button", "aria-label": `${label} artır`, onclick: () => set(value + 1) }, "+"));
}

export async function gamesPage(_: Record<string, string>, q: URLSearchParams): Promise<Node> {
  const head = pageTitle("Tahmin & Oyunlar", "Skor tahmini, günlük bilgi yarışması ve liderlik tablosu.");
  const disclaimer = alertBox("Bu oyunlar yalnızca eğlence içindir. Gerçek para, bahis, para yatırma/çekme veya nakit ödül yoktur.", "info");
  const nr = notReady();
  if (nr) return h("div", { class: "stack" }, head, disclaimer, nr);
  const [upcoming, players, quiz, leaders] = await Promise.all([getMatches("upcoming", 5), getPlayers(), getTodayQuiz(), getLeaderboard(20)]);
  const target = upcoming.find((m) => m.id === q.get("mac")) ?? upcoming[0];
  const mine = target ? await getMyPrediction(target.id) : null;

  let predSection: HTMLElement;
  if (!target) predSection = emptyState("Tahmine açık maç yok", "Bir sonraki maç fikstüre eklendiğinde tahmin açılır.");
  else if (!api.userId) predSection = card("p-md center", h("p", null, `${target.home?.name} – ${target.away?.name}`), h("a", { href: "#/giris?next=%23%2Ftahmin", class: "btn btn-primary" }, "Tahmin için giriş yap"));
  else {
    let home = mine?.home_score ?? 0;
    let away = mine?.away_score ?? 0;
    const opt = (sel: string | null) => [h("option", { value: "" }, "Seçme"), ...players.map((pl) => h("option", { value: pl.id, selected: pl.id === sel }, pl.full_name))];
    const scorer = h("select", { class: "input", "aria-label": "İlk golü atan" }, ...opt(mine?.first_scorer_id ?? null)) as HTMLSelectElement;
    const motm = h("select", { class: "input", "aria-label": "Maçın oyuncusu" }, ...opt(mine?.motm_player_id ?? null)) as HTMLSelectElement;
    predSection = card(
      "p-md stack",
      h("p", { class: "muted tiny center" }, `${target.competition} · ${fmtDateTime(target.kickoff_at)} · Maç başlayınca kilitlenir`),
      h("div", { class: "row between" }, h("div", { class: "center grow" }, h("strong", null, target.home?.name ?? ""), stepper(`${target.home?.name} golü`, home, (n) => (home = n))), h("span", { class: "muted" }, "–"), h("div", { class: "center grow" }, h("strong", null, target.away?.name ?? ""), stepper(`${target.away?.name} golü`, away, (n) => (away = n)))),
      players.length ? h("label", { class: "field" }, "İlk golü atan (Amedspor)", scorer) : null,
      players.length ? h("label", { class: "field" }, "Maçın oyuncusu", motm) : null,
      button(mine ? "Tahmini güncelle" : "Tahmini kaydet", async (e) => {
        const row = { home_score: home, away_score: away, first_scorer_id: scorer.value || null, motm_player_id: motm.value || null };
        await run(
          e.currentTarget as HTMLButtonElement,
          async () => {
            const existing = await getMyPrediction(target.id);
            if (existing) await api.update("predictions", `id=eq.${existing.id}`, row);
            else await api.insert("predictions", { ...row, match_id: target.id, user_id: api.userId });
          },
          "Tahminin kaydedildi. Maç başlayana kadar değiştirebilirsin.",
        );
      }),
      h("p", { class: "muted tiny center" }, "Puanlama: tam skor 5 · doğru sonuç 2 · ilk golcü 2 · maçın oyuncusu 1"),
    );
  }

  let quizSection: HTMLElement;
  if (!quiz) quizSection = card("p-md", h("p", { class: "muted small" }, "Bugünün sorusu henüz eklenmedi."));
  else {
    const result = h("p", { class: "small" });
    const opts = h("div", { class: "stack-sm" });
    const show = (ans: { answer_index: number; is_correct: boolean } | null) => {
      opts.replaceChildren(
        ...quiz.quiz.options.map((o, i) =>
          h(
            "button",
            {
              type: "button",
              class: `quiz-opt ${ans?.answer_index === i ? (ans.is_correct ? "right" : "wrong") : ""}`,
              disabled: !!ans,
              onclick: async (e: Event) => {
                if (!requireLogin()) return;
                const ok = await run(e.currentTarget as HTMLButtonElement, () => api.rpc<boolean>("answer_quiz", { p_quiz_id: quiz.quiz.id, p_answer: i }));
                if (ok !== undefined) show({ answer_index: i, is_correct: ok === true });
              },
            },
            o,
          ),
        ),
      );
      result.textContent = ans ? (ans.is_correct ? `Doğru! +${quiz.quiz.points} puan` : "Bu sefer olmadı. Yarın yeni soru var.") : "";
      result.className = `small ${ans?.is_correct ? "accent" : "danger"}`;
    };
    show(quiz.answer);
    quizSection = card("p-md stack", h("strong", null, quiz.quiz.question), opts, result, quiz.quiz.source_url ? externalLink(quiz.quiz.source_url, "Kaynak", "link tiny") : null);
  }

  return h(
    "div",
    { class: "stack-lg" },
    head,
    disclaimer,
    h("section", null, sectionHeader("Maç tahmini", undefined, undefined, "target"), predSection),
    h("section", { id: "yarisma" }, sectionHeader("Günlük bilgi yarışması", undefined, undefined, "brain"), quizSection),
    h(
      "section",
      null,
      sectionHeader("Liderlik tablosu", undefined, undefined, "star"),
      leaders.length
        ? card("divide", ...leaders.map((l) => h("a", { href: `#/u/${l.username}`, class: `list-row ${l.user_id === api.userId ? "me" : ""}` }, h("span", { class: "rank" }, String(l.rank)), avatar(l.avatar_url, l.display_name || l.username, 30), h("span", { class: "grow" }, `@${l.username}`), h("strong", null, `${l.points} p`))))
        : emptyState("Henüz puan kazanan yok", "İlk tahminini yap, listeye gir."),
    ),
  );
}
