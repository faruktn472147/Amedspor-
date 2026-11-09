import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_AD_SETTINGS, sanitizeAdSettings, type AdSettings } from "@/lib/ads/frequency";
import type {
  AdCampaign,
  AdPlacement,
  Match,
  MatchEvent,
  NewsItem,
  NotificationItem,
  Player,
  PlayerStat,
} from "@/lib/types";

const MATCH_SELECT =
  "id, competition, season, kickoff_at, venue, status, minute, home_score, away_score, stats, source_name, source_url, verified, predictions_settled_at, updated_at," +
  " home:teams!matches_home_team_id_fkey(id, name, short_name, is_amedspor, logo_url)," +
  " away:teams!matches_away_team_id_fkey(id, name, short_name, is_amedspor, logo_url)";

const NEWS_SELECT =
  "id, title, summary, body, original_url, image_url, image_credit, category, verification, status, is_sensitive, published_at, source_published_at, created_at," +
  " source:news_sources(id, name, homepage_url, kind)";

// ---------------------------------------------------------------- Maçlar
export async function getMatches(kind: "upcoming" | "past" | "live" | "all" = "all", limit = 20): Promise<Match[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const now = new Date().toISOString();
  let q = supabase.from("matches").select(MATCH_SELECT).limit(limit);
  if (kind === "upcoming") q = q.eq("status", "scheduled").gte("kickoff_at", now).order("kickoff_at", { ascending: true });
  else if (kind === "past") q = q.eq("status", "finished").order("kickoff_at", { ascending: false });
  else if (kind === "live") q = q.in("status", ["live", "halftime"]).order("kickoff_at", { ascending: true });
  else q = q.order("kickoff_at", { ascending: false });
  const { data } = await q;
  return (data ?? []) as unknown as Match[];
}

export async function getMatch(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [m, events, lineups] = await Promise.all([
    supabase.from("matches").select(MATCH_SELECT).eq("id", id).maybeSingle(),
    supabase.from("match_events").select("*").eq("match_id", id).order("minute").order("created_at"),
    supabase
      .from("match_lineups")
      .select("player_id, team_id, is_starter, shirt_number, position, player:players(full_name, slug)")
      .eq("match_id", id),
  ]);
  if (!m.data) return null;
  return {
    match: m.data as unknown as Match,
    events: (events.data ?? []) as MatchEvent[],
    lineups: (lineups.data ?? []) as unknown as {
      player_id: string;
      team_id: string;
      is_starter: boolean;
      shirt_number: number | null;
      position: string | null;
      player: { full_name: string; slug: string } | null;
    }[],
  };
}

// ---------------------------------------------------------------- Oyuncular
export async function getPlayers(): Promise<Player[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("players")
    .select("*, team:teams!inner(is_amedspor)")
    .eq("team.is_amedspor", true)
    .eq("is_active", true)
    .order("shirt_number", { ascending: true, nullsFirst: false });
  return (data ?? []) as Player[];
}

export async function getPlayer(slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: player } = await supabase.from("players").select("*").eq("slug", slug).maybeSingle();
  if (!player) return null;
  const [stats, ratings] = await Promise.all([
    supabase.from("player_statistics").select("*").eq("player_id", player.id).order("season", { ascending: false }),
    supabase.from("player_ratings").select("rating").eq("player_id", player.id).limit(5000),
  ]);
  const r = (ratings.data ?? []).map((x) => x.rating as number);
  return {
    player: player as Player,
    stats: (stats.data ?? []) as PlayerStat[],
    fanRating: r.length ? { avg: r.reduce((a, b) => a + b, 0) / r.length, count: r.length } : null,
  };
}

/** Günün futbolcusu: son biten maçta taraftar puanı en yüksek oyuncu (en az 5 oy). */
export async function getPlayerOfTheDay() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: last } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return null;
  const { data } = await supabase
    .from("player_ratings")
    .select("player_id, rating, player:players(full_name, slug, photo_url, shirt_number, position)")
    .eq("match_id", last.id)
    .limit(5000);
  const agg = new Map<string, { sum: number; n: number; player: unknown }>();
  for (const row of data ?? []) {
    const a = agg.get(row.player_id as string) ?? { sum: 0, n: 0, player: row.player };
    a.sum += row.rating as number;
    a.n += 1;
    agg.set(row.player_id as string, a);
  }
  const best = [...agg.values()].filter((a) => a.n >= 5).sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
  if (!best) return null;
  return {
    avg: best.sum / best.n,
    votes: best.n,
    player: best.player as { full_name: string; slug: string; photo_url: string | null; shirt_number: number | null; position: string | null },
  };
}

// ---------------------------------------------------------------- Haberler
export async function getNews(opts: { category?: string; limit?: number; cursor?: string | null } = {}): Promise<NewsItem[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let q = supabase
    .from("news")
    .select(NEWS_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.cursor) q = q.lt("published_at", opts.cursor);
  const { data } = await q;
  return (data ?? []) as unknown as NewsItem[];
}

export async function getNewsItem(id: string): Promise<NewsItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("news").select(NEWS_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as NewsItem) ?? null;
}

export async function getContentPage(slug: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("content_pages").select("*").eq("slug", slug).eq("is_published", true).maybeSingle();
  return data as { slug: string; title: string; body: string; sources: { title: string; url: string }[]; updated_at: string } | null;
}

// ---------------------------------------------------------------- Oyunlar
export async function getLeaderboard(limit = 20) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase.from("leaderboard").select("*").order("rank").limit(limit);
  return (data ?? []) as { user_id: string; username: string; display_name: string; avatar_url: string | null; points: number; rank: number }[];
}

export async function getTodayQuiz() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("quizzes_public").select("*").order("quiz_date", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const user = await getSessionUser();
  let answer: { answer_index: number; is_correct: boolean } | null = null;
  if (user) {
    const { data: a } = await supabase.from("quiz_answers").select("answer_index, is_correct").eq("quiz_id", data.id).eq("user_id", user.id).maybeSingle();
    answer = a as typeof answer;
  }
  return { quiz: data as { id: string; quiz_date: string; question: string; options: string[]; points: number; source_url: string | null }, answer };
}

export async function getMyPrediction(matchId: string) {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return null;
  const { data } = await supabase.from("predictions").select("*").eq("match_id", matchId).eq("user_id", user.id).maybeSingle();
  return data as { home_score: number; away_score: number; first_scorer_id: string | null; motm_player_id: string | null; points: number | null } | null;
}

export async function getMyPredictions() {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from("predictions")
    .select(`id, home_score, away_score, points, created_at, match:matches(${MATCH_SELECT})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as { id: string; home_score: number; away_score: number; points: number | null; match: Match }[];
}

// ---------------------------------------------------------------- Bildirimler
export async function getNotifications(limit = 50): Promise<NotificationItem[]> {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from("notifications")
    .select("id, type, message, link, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as NotificationItem[];
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}

// ---------------------------------------------------------------- Ayarlar ve reklam
export interface PremiumSettings {
  price_try: number;
  currency: "TRY";
  interval: "month";
  tagline: string;
}

export const DEFAULT_PREMIUM: PremiumSettings = {
  price_try: 10,
  currency: "TRY",
  interval: "month",
  tagline: "AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca 10 TL.",
};

export async function getPublicSettings(): Promise<{ premium: PremiumSettings; ads: AdSettings }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { premium: DEFAULT_PREMIUM, ads: DEFAULT_AD_SETTINGS };
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["premium", "ads"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]));
  return {
    premium: { ...DEFAULT_PREMIUM, ...((map.get("premium") as Partial<PremiumSettings>) ?? {}) },
    ads: sanitizeAdSettings(map.get("ads") as Partial<AdSettings>),
  };
}

export async function getAdInventory(): Promise<{ placements: AdPlacement[]; campaigns: AdCampaign[] }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { placements: [], campaigns: [] };
  const now = new Date().toISOString();
  const [p, c] = await Promise.all([
    supabase.from("ad_placements").select("*"),
    supabase.from("ad_campaigns").select("*").eq("is_active", true).lte("starts_at", now).gte("ends_at", now).limit(50),
  ]);
  return { placements: (p.data ?? []) as AdPlacement[], campaigns: (c.data ?? []) as AdCampaign[] };
}

// ---------------------------------------------------------------- Ana sayfa yardımcıları
export async function getTopPerformers(limit = 5) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("player_statistics")
    .select("season, competition, goals, assists, appearances, minutes, source_name, player:players!inner(full_name, slug, shirt_number, position, photo_url, team:teams!inner(is_amedspor))")
    .eq("player.team.is_amedspor", true)
    .order("season", { ascending: false })
    .order("goals", { ascending: false })
    .order("assists", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as {
    season: string;
    competition: string;
    goals: number;
    assists: number;
    appearances: number;
    minutes: number;
    source_name: string | null;
    player: { full_name: string; slug: string; shirt_number: number | null; position: string | null; photo_url: string | null };
  }[];
}

export async function getFeaturedFans(limit = 6) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, followers_count, points")
    .eq("status", "active")
    .order("followers_count", { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null; followers_count: number; points: number }[];
}
