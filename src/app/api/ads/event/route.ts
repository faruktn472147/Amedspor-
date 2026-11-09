import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/server-utils";

const schema = z.object({
  campaignId: z.string().uuid(),
  placement: z.enum(["home_feed", "news_detail", "shorts_feed", "match_center", "player_profile", "community_feed"]),
  kind: z.enum(["impression", "click"]),
});

/** Doğrudan sponsor kampanyaları için GERÇEK gösterim/tıklama sayımı (şişirmeye karşı hız sınırlı). */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const viewer = await getViewer();
  if (viewer?.isPremium) return new NextResponse(null, { status: 204 });
  const ip = await clientIp();
  const key = `ad:${parsed.data.kind}:${parsed.data.campaignId}:${viewer?.user.id ?? ip}`;
  const limit = parsed.data.kind === "impression" ? 10 : 3;
  if (!(await rateLimit(key, limit, 86400))) return new NextResponse(null, { status: 204 });
  await admin.rpc("record_ad_event", { p_campaign: parsed.data.campaignId, p_placement: parsed.data.placement, p_kind: parsed.data.kind });
  return new NextResponse(null, { status: 204 });
}
