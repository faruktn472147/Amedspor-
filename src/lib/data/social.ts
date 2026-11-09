import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import type { Comment, MediaItem, Post, Profile } from "@/lib/types";

export const PAGE_SIZE = 15;

export const PUBLIC_PROFILE =
  "id, username, display_name, bio, avatar_url, is_private, status, followers_count, following_count, posts_count, points, created_at";

const POST_SELECT =
  "id, author_id, kind, body, moderation_status, moderation_reason, like_count, comment_count, edited_at, created_at," +
  " author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url)," +
  " media:post_media(id, media_type, storage_path, poster_path, width, height, duration_seconds, position)," +
  " poll_options(id, label, position, vote_count)";

/** Özel kovadaki medya için kısa süreli imzalı URL üretir (yalnızca RLS ile okunabilen gönderiler için). */
async function signMedia(posts: Post[]): Promise<void> {
  const admin = getSupabaseAdmin();
  const paths = posts.flatMap((p) => p.media.flatMap((m) => [m.storage_path, m.poster_path].filter(Boolean) as string[]));
  if (!admin || paths.length === 0) return;
  const { data } = await admin.storage.from("media").createSignedUrls(paths, 60 * 60);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  for (const p of posts) {
    for (const m of p.media) {
      m.url = map.get(m.storage_path) ?? null;
      m.poster_url = m.poster_path ? (map.get(m.poster_path) ?? null) : null;
    }
  }
}

async function decorate(supabase: SupabaseClient, posts: Post[], userId: string | null): Promise<Post[]> {
  for (const p of posts) {
    p.media = (p.media ?? []).sort((a: MediaItem, b: MediaItem) => a.position - b.position);
    p.poll_options = (p.poll_options ?? []).sort((a, b) => a.position - b.position);
  }
  if (userId && posts.length) {
    const ids = posts.map((p) => p.id);
    const [likes, marks, votes] = await Promise.all([
      supabase.from("likes").select("post_id").eq("user_id", userId).in("post_id", ids),
      supabase.from("bookmarks").select("post_id").eq("user_id", userId).in("post_id", ids),
      supabase.from("poll_votes").select("post_id, option_id").eq("user_id", userId).in("post_id", ids),
    ]);
    const liked = new Set((likes.data ?? []).map((r) => r.post_id as string));
    const saved = new Set((marks.data ?? []).map((r) => r.post_id as string));
    const voted = new Map((votes.data ?? []).map((r) => [r.post_id as string, r.option_id as string]));
    for (const p of posts) {
      p.liked_by_me = liked.has(p.id);
      p.bookmarked_by_me = saved.has(p.id);
      p.my_vote = voted.get(p.id) ?? null;
    }
  }
  await signMedia(posts);
  return posts;
}

async function mutedIds(supabase: SupabaseClient, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data } = await supabase.from("mutes").select("muted_id").eq("muter_id", userId);
  return (data ?? []).map((r) => r.muted_id as string);
}

export interface FeedOptions {
  scope?: "all" | "following" | "popular" | "shorts";
  cursor?: string | null;
  authorId?: string;
  limit?: number;
}

export async function getFeed(opts: FeedOptions = {}): Promise<{ posts: Post[]; nextCursor: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { posts: [], nextCursor: null, error: "not_configured" };
  const user = await getSessionUser();
  const limit = opts.limit ?? PAGE_SIZE;

  let q = supabase.from("posts").select(POST_SELECT).limit(limit);
  if (opts.authorId) {
    q = q.eq("author_id", opts.authorId);
    if (opts.authorId !== user?.id) q = q.eq("moderation_status", "approved");
  } else {
    q = q.eq("moderation_status", "approved");
  }
  if (opts.scope === "shorts") q = q.eq("kind", "short");

  if (opts.scope === "popular") {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    q = q.gte("created_at", since).order("like_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
    if (opts.cursor) q = q.lt("created_at", opts.cursor);
  }

  if (opts.scope === "following" && user) {
    const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
    const ids = [user.id, ...(f ?? []).map((r) => r.following_id as string)];
    q = q.in("author_id", ids);
  }
  const muted = await mutedIds(supabase, user?.id ?? null);
  if (muted.length && !opts.authorId) q = q.not("author_id", "in", `(${muted.join(",")})`);

  const { data, error } = await q;
  if (error) return { posts: [], nextCursor: null, error: error.message };
  const posts = await decorate(supabase, (data ?? []) as unknown as Post[], user?.id ?? null);
  const nextCursor = opts.scope !== "popular" && posts.length === limit ? posts[posts.length - 1].created_at : null;
  return { posts, nextCursor, error: null };
}

export async function getPost(id: string): Promise<Post | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const user = await getSessionUser();
  const { data } = await supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [p] = await decorate(supabase, [data as unknown as Post], user?.id ?? null);
  return p;
}

export async function getBookmarks(): Promise<Post[]> {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from("bookmarks")
    .select(`created_at, post:posts(${POST_SELECT})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const posts = (data ?? []).map((r) => (r as unknown as { post: Post | null }).post).filter(Boolean) as Post[];
  return decorate(supabase, posts, user.id);
}

export async function getComments(postId: string): Promise<Comment[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("comments")
    .select("id, post_id, author_id, parent_id, body, moderation_status, created_at, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(300);
  return (data ?? []) as unknown as Comment[];
}

export async function getRecentComments(limit = 5) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("comments")
    .select("id, post_id, body, created_at, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)")
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Pick<Comment, "id" | "post_id" | "body" | "created_at" | "author">[];
}

export interface ProfilePageData {
  profile: Profile;
  canView: boolean;
  isMe: boolean;
  isFollowing: boolean;
  requested: boolean;
  blockedByMe: boolean;
  mutedByMe: boolean;
  badges: { badge_code: string; badges: { name: string; description: string } | null }[];
}

export async function getProfileByUsername(username: string): Promise<ProfilePageData | null> {
  if (!/^[a-z0-9_.]{3,24}$/i.test(username)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const user = await getSessionUser();
  const { data: profile } = await supabase.from("profiles").select(PUBLIC_PROFILE).eq("username", username.toLowerCase()).maybeSingle();
  if (!profile) return null;
  const p = profile as unknown as Profile;
  const isMe = user?.id === p.id;
  const [canView, follow, req, block, mute, badges] = await Promise.all([
    supabase.rpc("can_view_profile", { owner: p.id, viewer: user?.id ?? null }),
    user ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle() : null,
    user ? supabase.from("follow_requests").select("requester_id").eq("requester_id", user.id).eq("target_id", p.id).maybeSingle() : null,
    user ? supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", p.id).maybeSingle() : null,
    user ? supabase.from("mutes").select("muted_id").eq("muter_id", user.id).eq("muted_id", p.id).maybeSingle() : null,
    supabase.from("user_badges").select("badge_code, badges(name, description)").eq("user_id", p.id),
  ]);
  return {
    profile: p,
    canView: canView.data === true,
    isMe,
    isFollowing: !!follow?.data,
    requested: !!req?.data,
    blockedByMe: !!block?.data,
    mutedByMe: !!mute?.data,
    badges: (badges.data ?? []) as unknown as ProfilePageData["badges"],
  };
}

export async function getFollowList(userId: string, kind: "followers" | "following") {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const col = kind === "followers" ? "follower_id" : "following_id";
  const filterCol = kind === "followers" ? "following_id" : "follower_id";
  const fk = kind === "followers" ? "follows_follower_id_fkey" : "follows_following_id_fkey";
  const { data } = await supabase
    .from("follows")
    .select(`${col}, user:profiles!${fk}(id, username, display_name, avatar_url)`)
    .eq(filterCol, userId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => (r as unknown as { user: Profile }).user).filter(Boolean);
}

export async function getFollowRequests() {
  const supabase = await createSupabaseServerClient();
  const user = await getSessionUser();
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from("follow_requests")
    .select("requester_id, created_at, requester:profiles!follow_requests_requester_id_fkey(id, username, display_name, avatar_url)")
    .eq("target_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as { requester_id: string; created_at: string; requester: Profile }[];
}

export async function searchProfiles(term: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase || term.trim().length < 2) return [];
  const safe = term.replace(/[%_,()]/g, "").slice(0, 30);
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(20);
  return (data ?? []) as Pick<Profile, "id" | "username" | "display_name" | "avatar_url">[];
}
