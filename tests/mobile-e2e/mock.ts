import type { Page, Request } from "@playwright/test";

/**
 * YALNIZCA TEST İÇİN sahte Supabase + web sitesi API'si. Uygulamanın gerçek
 * ağ isteklerini yakalar ve test verisiyle yanıtlar; istekleri kaydeder.
 */
export const SUPA = "https://mock-proj.supabase.co";
export const SITE = "https://site.example";
export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const TOKEN = "test-access-token-abcdefghijklmnopqrstuvwxyz";

const team = (id: string, name: string, amed = false) => ({ id, name, short_name: name.slice(0, 3).toUpperCase(), is_amedspor: amed, logo_url: null });
const AMED = team("aaaaaaaa-0000-4000-8000-000000000001", "Amedspor", true);
const RIVAL = team("aaaaaaaa-0000-4000-8000-000000000002", "Test Rakip SK");
const match = (id: string, status: string, kickoff: string, hs: number | null, as: number | null) => ({
  id, competition: "Test Ligi", season: "2026-27", kickoff_at: kickoff, venue: "Test Stadı", status, minute: status === "live" ? 63 : null,
  home_score: hs, away_score: as, stats: { "Şut": [12, 7] }, source_name: "Test Kaynağı", source_url: "https://kaynak.example/mac",
  verified: true, predictions_settled_at: null, updated_at: "2026-11-09T12:00:00Z", home: AMED, away: RIVAL,
});
export const NEXT_MATCH = match("bbbbbbbb-0000-4000-8000-000000000001", "scheduled", "2099-01-01T17:00:00Z", null, null);
export const LAST_MATCH = match("bbbbbbbb-0000-4000-8000-000000000002", "finished", "2026-11-01T17:00:00Z", 2, 1);
export const NEWS = [
  { id: "cccccccc-0000-4000-8000-000000000001", title: "Test haberi: hazırlık maçı tamamlandı", summary: "Test özeti.", body: "", original_url: "https://kaynak.example/haber/1", image_url: null, image_credit: null, category: "mac", verification: "verified", status: "published", is_sensitive: false, published_at: "2026-11-09T10:00:00Z", source_published_at: "2026-11-09T09:30:00Z", created_at: "2026-11-09T10:00:00Z", source: { id: "s1", name: "Test Spor Gazetesi", homepage_url: "https://kaynak.example", kind: "media" } },
  { id: "cccccccc-0000-4000-8000-000000000002", title: "Test söylentisi: transfer iddiası", summary: "İddia.", body: "", original_url: "https://kaynak.example/haber/2", image_url: null, image_credit: null, category: "transfer", verification: "rumor", status: "published", is_sensitive: true, published_at: "2026-11-09T08:00:00Z", source_published_at: "2026-11-09T07:00:00Z", created_at: "2026-11-09T08:00:00Z", source: { id: "s1", name: "Test Spor Gazetesi", homepage_url: "https://kaynak.example", kind: "media" } },
];
const author = { id: "22222222-2222-4222-8222-222222222222", username: "test_taraftar", display_name: "Test Taraftar", avatar_url: null };
export const POSTS = [
  { id: "dddddddd-0000-4000-8000-000000000001", author_id: author.id, kind: "post", body: "Test gönderisi: harika maçtı!", moderation_status: "approved", moderation_reason: null, like_count: 3, comment_count: 1, edited_at: null, created_at: "2026-11-09T11:00:00Z", author, media: [], poll_options: [] },
  { id: "dddddddd-0000-4000-8000-000000000002", author_id: author.id, kind: "post", body: '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>', moderation_status: "approved", moderation_reason: null, like_count: 0, comment_count: 0, edited_at: null, created_at: "2026-11-09T10:00:00Z", author, media: [], poll_options: [] },
];
export const SHORTS = [0, 1, 2].map((i) => ({
  id: `eeeeeeee-0000-4000-8000-00000000000${i}`, author_id: author.id, kind: "short", body: `Test short ${i}`, moderation_status: "approved", moderation_reason: null,
  like_count: i, comment_count: 0, edited_at: null, created_at: `2026-11-0${i + 1}T10:00:00Z`, author, poll_options: [],
  media: [{ id: `m${i}`, media_type: "video", storage_path: `${author.id}/2026-11/v${i}.mp4`, poster_path: null, width: 1080, height: 1920, duration_seconds: 10, position: 0 }],
}));
const CAMPAIGN = { id: "ffffffff-0000-4000-8000-000000000001", name: "Test", advertiser_name: "Test Sponsor A.Ş.", placement_codes: ["home_feed", "community_feed", "news_detail"], title: "Test sponsor kartı", body: "Test metni", image_url: null, target_url: "https://sponsor.example", cta_label: "İncele", starts_at: "2026-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", is_active: true, priority: 0, contract_amount: null };
export const ME = { id: USER_ID, username: "deneme_kullanici", display_name: "Deneme", bio: "", avatar_url: null, is_private: false, data_saver: false, personalized_ads: false, status: "active", followers_count: 0, following_count: 0, posts_count: 0, points: 0, created_at: "2026-10-01T00:00:00Z" };

export interface MockState {
  premium: boolean;
  calls: { method: string; url: string; body: unknown; auth: string | null }[];
}

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

export async function mockBackend(page: Page, opts: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = { premium: false, calls: [], ...opts };
  const record = (req: Request) => {
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    state.calls.push({ method: req.method(), url: req.url(), body, auth: req.headers()["authorization"] ?? null });
  };

  await page.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    record(req);
    const u = new URL(req.url());
    const p = u.pathname;
    const q = u.searchParams;
    const m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });

    // Kimlik doğrulama
    if (p === "/auth/v1/token" && q.get("grant_type") === "password") {
      const b = req.postDataJSON() as { email: string; password: string };
      if (b.password !== "Dogru123") return route.fulfill(json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400));
      return route.fulfill(json({ access_token: TOKEN, refresh_token: "r", expires_in: 3600, user: { id: USER_ID, email: b.email } }));
    }
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (p === "/auth/v1/signup") return route.fulfill(json({ id: USER_ID }));

    // RPC
    if (p === "/rest/v1/rpc/is_premium") return route.fulfill(json(state.premium));
    if (p === "/rest/v1/rpc/get_my_profile") return route.fulfill(json([ME]));
    if (p === "/rest/v1/rpc/can_view_profile") return route.fulfill(json(true));

    // Depolama: imzalı URL
    if (p === "/storage/v1/object/sign/media") {
      const b = req.postDataJSON() as { paths: string[] };
      return route.fulfill(json(b.paths.map((path) => ({ path, signedURL: `/object/sign/media/${path}?token=t`, error: null }))));
    }
    if (p.startsWith("/storage/v1/object/sign/media/")) return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });

    // Yazma işlemleri
    if (m === "POST" || m === "PATCH" || m === "DELETE") return route.fulfill({ status: m === "POST" ? 201 : 204, body: "" });

    // Okuma (PostgREST)
    const table = p.replace("/rest/v1/", "");
    const status = q.get("status") ?? "";
    switch (table) {
      case "matches":
        if (q.get("id")) return route.fulfill(json([LAST_MATCH, NEXT_MATCH].filter((x) => `eq.${x.id}` === q.get("id"))));
        if (status.includes("live")) return route.fulfill(json([]));
        if (status === "eq.scheduled") return route.fulfill(json([NEXT_MATCH]));
        if (status === "eq.finished") return route.fulfill(json([LAST_MATCH]));
        return route.fulfill(json([]));
      case "match_events":
        return route.fulfill(json([{ id: "ev1", match_id: LAST_MATCH.id, team_id: AMED.id, player_id: null, player_name: "Test Oyuncu", type: "goal", minute: 23, extra_minute: null, detail: "" }]));
      case "match_lineups":
        return route.fulfill(json([]));
      case "news":
        if (q.get("id")) return route.fulfill(json(NEWS.filter((n) => `eq.${n.id}` === q.get("id"))));
        return route.fulfill(json(NEWS));
      case "posts":
        if (q.get("id")) return route.fulfill(json([...POSTS, ...SHORTS].filter((x) => `eq.${x.id}` === q.get("id"))));
        if (q.get("kind") === "eq.short") return route.fulfill(json(SHORTS));
        return route.fulfill(json(POSTS));
      case "comments":
        return route.fulfill(json([]));
      case "app_settings":
        return route.fulfill(json([{ key: "premium", value: { price_try: 10, tagline: "AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL." } }, { key: "ads", value: { enabled: true, feed_first_after: 5, feed_every: 10, shorts_every: 15, max_per_page: 2, per_campaign_daily_cap: 3 } }]));
      case "ad_placements":
        return route.fulfill(json(["home_feed", "community_feed", "news_detail", "shorts_feed", "match_center", "player_profile"].map((code) => ({ code, name: code, enabled: true, provider: "direct", adsense_slot_id: null }))));
      case "ad_campaigns":
        return route.fulfill(json([CAMPAIGN]));
      case "subscriptions":
        return route.fulfill(json(state.premium ? [{ status: "active", current_period_end: "2099-01-01T00:00:00Z", cancel_at_period_end: false, price_amount: 10, provider: "iyzico" }] : []));
      default:
        return route.fulfill(json([])); // likes, bookmarks, poll_votes, mutes, follows, notifications, leaderboard, quizzes_public, players ...
    }
  });

  await page.route(`${SITE}/**`, async (route) => {
    const req = route.request();
    record(req);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (req.url().endsWith("/api/ads/event")) return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (req.url().endsWith("/api/mobile/comment")) return route.fulfill(json({ ok: true, status: "approved" }));
    return route.fulfill(json({ ok: false, error: "bilinmiyor" }, 404));
  });
  return state;
}

/** Oturum açmış kullanıcıyı localStorage'a yerleştirir. */
export async function loggedIn(page: Page) {
  await page.addInitScript(([uid, token]) => {
    localStorage.setItem("amed.session.v1", JSON.stringify({ access_token: token, refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: "deneme@example.com" } }));
  }, [USER_ID, TOKEN]);
}
