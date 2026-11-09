import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

/** KVKK m.11: kullanıcının kendi verilerini indirmesi (yalnızca kendi verisi, RLS ile). */
export async function GET() {
  const viewer = await getViewer();
  const supabase = await createSupabaseServerClient();
  if (!viewer || !supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`export:${viewer.user.id}`, 3, 86400))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const uid = viewer.user.id;
  const [posts, comments, likes, bookmarks, follows, predictions, subscription, payments, notifications] = await Promise.all([
    supabase.from("posts").select("id, kind, body, moderation_status, created_at").eq("author_id", uid),
    supabase.from("comments").select("id, post_id, body, created_at").eq("author_id", uid),
    supabase.from("likes").select("post_id, created_at").eq("user_id", uid),
    supabase.from("bookmarks").select("post_id, created_at").eq("user_id", uid),
    supabase.from("follows").select("follower_id, following_id, created_at").or(`follower_id.eq.${uid},following_id.eq.${uid}`),
    supabase.from("predictions").select("match_id, home_score, away_score, points, created_at").eq("user_id", uid),
    supabase.from("subscriptions").select("status, provider, price_amount, current_period_start, current_period_end, cancel_at_period_end, created_at").eq("user_id", uid),
    supabase.from("payments").select("kind, status, amount_gross, currency, paid_at, created_at").eq("user_id", uid),
    supabase.from("notifications").select("type, message, created_at, read_at").eq("user_id", uid).limit(1000),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    account: { id: uid, email: viewer.user.email },
    profile: viewer.profile,
    posts: posts.data,
    comments: comments.data,
    likes: likes.data,
    bookmarks: bookmarks.data,
    follows: follows.data,
    predictions: predictions.data,
    subscription: subscription.data,
    payments: payments.data,
    notifications: notifications.data,
    note: "Kart bilgileri bu platformda saklanmaz; ödeme kuruluşu tarafından işlenir.",
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="amedspor-verilerim-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
