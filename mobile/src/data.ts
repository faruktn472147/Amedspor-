import { api, inList, qs } from "./api";
import { sanitizeAdSettings, type AdSettings } from "@/lib/ads/frequency";
import type { AdCampaign, AdPlacement, Comment, Match, MatchEvent, NewsItem, NotificationItem, Player, PlayerStat, Post, Profile } from "@/lib/types";

export const PUBLIC_PROFILE = "id,username,display_name,bio,avatar_url,is_private,status,followers_count,following_count,posts_count,points,created_at";
const AUTHOR = "author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)";
export const POST_SELECT =
  `id,author_id,kind,body,moderation_status,moderation_reason,like_count,comment_count,edited_at,created_at,${AUTHOR},` +
  "media:post_media(id,media_type,storage_path,poster_path,width,height,duration_seconds,position),poll_options(id,label,position,vote_count)";
const MATCH_SELECT =
  "id,competition,season,kickoff_at,venue,status,minute,home_score,away_score,stats,source_name,source_url,verified,predictions_settled_at,updated_at," +
  "home:teams!matches_home_team_id_fkey(id,name,short_name,is_amedspor,logo_url),away:teams!matches_away_team_id_fkey(id,name,short_name,is_amedspor,logo_url)";
const NEWS_SELECT =
  "id,title,summary,body,original_url,image_url,image_credit,category,verification,status,is_sensitive,published_at,source_published_at,created_at,source:news_sources(id,name,homepage_url,kind)";

export const PAGE_SIZE = 15;

// ---------------------------------------------------------------- Gönderiler
async function decorate(posts: Post[]): Promise<Post[]> {
  for (const p of posts) {
    p.media = (p.media ?? []).sort((a, b) => a.position - b.position);
    p.poll_options = (p.poll_options ?? []).sort((a, b) => a.position - b.position);
  }
  const uid = api.userId;
  if (uid && posts.length) {
    const ids = inList(posts.map((p) => p.id));
    const [likes, marks, votes] = await Promise.all([
      api.select<{ post_id: string }[]>("likes", qs({ select: "post_id", user_id: `eq.${uid}`, post_id: ids })),
      api.select<{ post_id: string }[]>("bookmarks", qs({ select: "post_id", user_id: `eq.${uid}`, post_id: ids })),
      api.select<{ post_id: string; option_id: string }[]>("poll_votes", qs({ select: "post_id,option_id", user_id: `eq.${uid}`, post_id: ids })),
    ]);
    const liked = new Set(likes.map((r) => r.post_id));
    const saved = new Set(marks.map((r) => r.post_id));
    const voted = new Map(votes.map((r) => [r.post_id, r.option_id]));
    for (const p of posts) {
      p.liked_by_me = liked.has(p.id);
      p.bookmarked_by_me = saved.has(p.id);
      p.my_vote = voted.get(p.id) ?? null;
    }
  }
  const paths = posts.flatMap((p) => p.media.flatMap((m) => [m.storage_path, m.poster_path].filter(Boolean) as string[]));
  const signed = await api.signUrls("media", paths);
  for (const p of posts) for (const m of p.media) {
    m.url = signed.get(m.storage_path) ?? null;
    m.poster_url = m.poster_path ? (signed.get(m.poster_path) ?? null) : null;
  }
  return posts;
}

export async function getFeed(opts: { scope?: "all" | "following" | "popular" | "shorts"; cursor?: string | null; authorId?: string; limit?: number } = {}) {
  const limit = opts.limit ?? PAGE_SIZE;
  const p: Record<string, string | number> = { select: POST_SELECT, limit };
  const uid = api.userId;
  if (opts.authorId) {
    p.author_id = `eq.${opts.authorId}`;
    if (opts.authorId !== uid) p.moderation_status = "eq.approved";
  } else p.moderation_status = "eq.approved";
  if (opts.scope === "shorts") p.kind = "eq.short";
  if (opts.scope === "popular") {
    p.created_at = `gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`;
    p.order = "like_count.desc,created_at.desc";
  } else {
    p.order = "created_at.desc";
    if (opts.cursor) p.created_at = `lt.${opts.cursor}`;
  }
  if (opts.scope === "following" && uid) {
    const f = await api.select<{ following_id: string }[]>("follows", qs({ select: "following_id", follower_id: `eq.${uid}` }));
    p.author_id = inList([uid, ...f.map((r) => r.following_id)]);
  }
  if (uid && !opts.authorId) {
    const m = await api.select<{ muted_id: string }[]>("mutes", qs({ select: "muted_id", muter_id: `eq.${uid}` }));
    if (m.length) p.and = `(author_id.not.${inList(m.map((r) => r.muted_id))})`;
  }
  const posts = await decorate(await api.select<Post[]>("posts", qs(p)));
  const nextCursor = opts.scope !== "popular" && posts.length === limit ? posts[posts.length - 1].created_at : null;
  return { posts, nextCursor };
}

export async function getPost(id: string): Promise<Post | null> {
  const row = await api.maybeSingle<Post>("posts", qs({ select: POST_SELECT, id: `eq.${id}` }));
  return row ? (await decorate([row]))[0] : null;
}

export async function getComments(postId: string): Promise<Comment[]> {
  return api.select<Comment[]>(
    "comments",
    qs({
      select: "id,post_id,author_id,parent_id,body,moderation_status,created_at,author:profiles!comments_author_id_fkey(id,username,display_name,avatar_url)",
      post_id: `eq.${postId}`,
      order: "created_at.asc",
      limit: 300,
    }),
  );
}

export async function getBookmarks(): Promise<Post[]> {
  const uid = api.userId;
  if (!uid) return [];
  const rows = await api.select<{ post: Post | null }[]>("bookmarks", qs({ select: `post:posts(${POST_SELECT})`, user_id: `eq.${uid}`, order: "created_at.desc", limit: 50 }));
  return decorate(rows.map((r) => r.post).filter(Boolean) as Post[]);
}

// ---------------------------------------------------------------- Profiller
export const getMyProfile = async (): Promise<Profile | null> => {
  if (!api.userId) return null;
  const rows = await api.rpc<Profile[] | Profile | null>("get_my_profile");
  return Array.isArray(rows) ? (rows[0] ?? null) : rows;
};

export async function getProfile(username: string) {
  const p = await api.maybeSingle<Profile>("profiles", qs({ select: PUBLIC_PROFILE, username: `eq.${username.toLowerCase()}` }));
  if (!p) return null;
  const uid = api.userId;
  const [canView, follow, req, block, badges] = await Promise.all([
    api.rpc<boolean>("can_view_profile", { owner: p.id, viewer: uid }),
    uid ? api.maybeSingle("follows", qs({ select: "follower_id", follower_id: `eq.${uid}`, following_id: `eq.${p.id}` })) : null,
    uid ? api.maybeSingle("follow_requests", qs({ select: "requester_id", requester_id: `eq.${uid}`, target_id: `eq.${p.id}` })) : null,
    uid ? api.maybeSingle("blocks", qs({ select: "blocked_id", blocker_id: `eq.${uid}`, blocked_id: `eq.${p.id}` })) : null,
    api.select<{ badge_code: string; badges: { name: string } | null }[]>("user_badges", qs({ select: "badge_code,badges(name)", user_id: `eq.${p.id}` })),
  ]);
  return { profile: p, canView: canView === true, isMe: uid === p.id, isFollowing: !!follow, requested: !!req, blocked: !!block, badges };
}

export async function searchProfiles(term: string) {
  const safe = term.replace(/[%_,()*]/g, "").trim().slice(0, 30);
  if (safe.length < 2) return [];
  return api.select<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">[]>(
    "profiles",
    qs({ select: "id,username,display_name,avatar_url", or: `(username.ilike.*${safe}*,display_name.ilike.*${safe}*)`, limit: 20 }),
  );
}

// ---------------------------------------------------------------- Maçlar, oyuncular, haberler
export function getMatches(kind: "upcoming" | "past" | "live", limit = 10): Promise<Match[]> {
  const p: Record<string, string | number> = { select: MATCH_SELECT, limit };
  if (kind === "upcoming") Object.assign(p, { status: "eq.scheduled", kickoff_at: `gte.${new Date().toISOString()}`, order: "kickoff_at.asc" });
  if (kind === "past") Object.assign(p, { status: "eq.finished", order: "kickoff_at.desc" });
  if (kind === "live") Object.assign(p, { status: "in.(live,halftime)", order: "kickoff_at.asc" });
  return api.select<Match[]>("matches", qs(p));
}

export async function getMatch(id: string) {
  const [m, events, lineups] = await Promise.all([
    api.maybeSingle<Match>("matches", qs({ select: MATCH_SELECT, id: `eq.${id}` })),
    api.select<MatchEvent[]>("match_events", qs({ select: "*", match_id: `eq.${id}`, order: "minute.asc,created_at.asc" })),
    api.select<{ player_id: string; team_id: string; is_starter: boolean; shirt_number: number | null; player: { full_name: string; slug: string } | null }[]>(
      "match_lineups",
      qs({ select: "player_id,team_id,is_starter,shirt_number,player:players(full_name,slug)", match_id: `eq.${id}` }),
    ),
  ]);
  return m ? { match: m, events, lineups } : null;
}

export function getPlayers(): Promise<Player[]> {
  return api.select<Player[]>("players", qs({ select: "*,team:teams!inner(is_amedspor)", "team.is_amedspor": "is.true", is_active: "is.true", order: "shirt_number.asc.nullslast" }));
}

export async function getPlayer(slug: string) {
  const player = await api.maybeSingle<Player>("players", qs({ select: "*", slug: `eq.${slug}` }));
  if (!player) return null;
  const [stats, ratings] = await Promise.all([
    api.select<PlayerStat[]>("player_statistics", qs({ select: "*", player_id: `eq.${player.id}`, order: "season.desc" })),
    api.select<{ rating: number }[]>("player_ratings", qs({ select: "rating", player_id: `eq.${player.id}`, limit: 5000 })),
  ]);
  const r = ratings.map((x) => x.rating);
  return { player, stats, fanRating: r.length ? { avg: r.reduce((a, b) => a + b, 0) / r.length, count: r.length } : null };
}

export function getNews(opts: { category?: string; limit?: number; cursor?: string | null } = {}): Promise<NewsItem[]> {
  return api.select<NewsItem[]>(
    "news",
    qs({
      select: NEWS_SELECT,
      status: "eq.published",
      category: opts.category ? `eq.${opts.category}` : undefined,
      published_at: opts.cursor ? `lt.${opts.cursor}` : undefined,
      order: "published_at.desc",
      limit: opts.limit ?? 20,
    }),
  );
}

export const getNewsItem = (id: string) => api.maybeSingle<NewsItem>("news", qs({ select: NEWS_SELECT, id: `eq.${id}`, status: "eq.published" }));

// ---------------------------------------------------------------- Oyunlar
export const getLeaderboard = (limit = 20) =>
  api.select<{ user_id: string; username: string; display_name: string; avatar_url: string | null; points: number; rank: number }[]>("leaderboard", qs({ select: "*", order: "rank.asc", limit }));

export async function getTodayQuiz() {
  const quiz = await api.maybeSingle<{ id: string; quiz_date: string; question: string; options: string[]; points: number; source_url: string | null }>(
    "quizzes_public",
    qs({ select: "*", order: "quiz_date.desc" }),
  );
  if (!quiz) return null;
  const uid = api.userId;
  const answer = uid ? await api.maybeSingle<{ answer_index: number; is_correct: boolean }>("quiz_answers", qs({ select: "answer_index,is_correct", quiz_id: `eq.${quiz.id}`, user_id: `eq.${uid}` })) : null;
  return { quiz, answer };
}

export const getMyPrediction = (matchId: string) =>
  api.userId
    ? api.maybeSingle<{ id: string; home_score: number; away_score: number; first_scorer_id: string | null; motm_player_id: string | null; points: number | null }>(
        "predictions",
        qs({ select: "*", match_id: `eq.${matchId}`, user_id: `eq.${api.userId}` }),
      )
    : Promise.resolve(null);

// ---------------------------------------------------------------- Bildirimler
export const getNotifications = () =>
  api.select<NotificationItem[]>(
    "notifications",
    qs({ select: "id,type,message,link,read_at,created_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)", user_id: `eq.${api.userId}`, order: "created_at.desc", limit: 50 }),
  );

export async function getUnreadCount(): Promise<number> {
  if (!api.userId) return 0;
  const rows = await api.select<{ id: number }[]>("notifications", qs({ select: "id", user_id: `eq.${api.userId}`, read_at: "is.null", limit: 100 }));
  return rows.length;
}

export const getFollowRequests = () =>
  api.select<{ requester_id: string; requester: Profile }[]>(
    "follow_requests",
    qs({ select: "requester_id,requester:profiles!follow_requests_requester_id_fkey(id,username,display_name,avatar_url)", target_id: `eq.${api.userId}`, order: "created_at.desc" }),
  );

// ---------------------------------------------------------------- Ayarlar, Premium, reklam
export interface PublicSettings {
  premium: { price_try: number; tagline: string };
  ads: AdSettings;
}

let settingsCache: Promise<PublicSettings> | null = null;
export function getSettings(): Promise<PublicSettings> {
  settingsCache ??= api
    .select<{ key: string; value: Record<string, unknown> }[]>("app_settings", qs({ select: "key,value", key: "in.(premium,ads)" }))
    .then((rows) => {
      const m = new Map(rows.map((r) => [r.key, r.value]));
      const premium = (m.get("premium") ?? {}) as { price_try?: number; tagline?: string };
      return {
        premium: {
          price_try: Number(premium.price_try ?? 10),
          tagline: premium.tagline ?? "AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.",
        },
        ads: sanitizeAdSettings(m.get("ads") as Partial<AdSettings> | undefined),
      };
    })
    .catch((e) => {
      settingsCache = null;
      throw e;
    });
  return settingsCache;
}

let premiumCache: { uid: string | null; value: Promise<boolean> } | null = null;
export function isPremium(): Promise<boolean> {
  const uid = api.userId;
  if (!uid) return Promise.resolve(false);
  if (premiumCache?.uid !== uid) premiumCache = { uid, value: api.rpc<boolean>("is_premium").then((v) => v === true).catch(() => false) };
  return premiumCache.value;
}
export const resetPremiumCache = () => (premiumCache = null);

let adCache: Promise<{ placements: Map<string, AdPlacement>; campaigns: AdCampaign[] }> | null = null;
export function getAdInventory() {
  const now = new Date().toISOString();
  adCache ??= Promise.all([
    api.select<AdPlacement[]>("ad_placements", qs({ select: "*" })),
    api.select<AdCampaign[]>("ad_campaigns", qs({ select: "*", is_active: "is.true", starts_at: `lte.${now}`, ends_at: `gte.${now}`, limit: 50 })),
  ])
    .then(([p, c]) => ({ placements: new Map(p.map((x) => [x.code, x])), campaigns: c }))
    .catch(() => ({ placements: new Map(), campaigns: [] }));
  return adCache;
}

export const getMySubscription = () =>
  api.userId
    ? api.maybeSingle<{ status: string; current_period_end: string | null; cancel_at_period_end: boolean; price_amount: number; provider: string }>(
        "subscriptions",
        qs({ select: "status,current_period_end,cancel_at_period_end,price_amount,provider", user_id: `eq.${api.userId}` }),
      )
    : Promise.resolve(null);
