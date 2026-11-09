import { NextResponse } from "next/server";
import { corsHeaders, mobileContext } from "@/lib/mobile";
import { addCommentForUser, createPostForUser, deleteAccountForUser, updateProfileForUser } from "@/lib/social/mutations";
import type { ActionResult } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

const OPS = ["post", "comment", "profile", "delete-account"] as const;
type Op = (typeof OPS)[number];

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/**
 * Mobil uygulamanın moderasyon gerektiren işlemleri. Web sitesindeki sunucu
 * işlemleriyle AYNI çekirdek fonksiyonlar kullanılır (src/lib/social/mutations.ts).
 */
export async function POST(request: Request, ctx: { params: Promise<{ op: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  const { op } = await ctx.params;
  if (!OPS.includes(op as Op)) return json({ error: "Bilinmeyen işlem." }, 404);

  const raw = await request.text();
  if (raw.length > 64 * 1024) return json({ error: "İstek çok büyük." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const user = await mobileContext(request);
  if (!user) return json({ error: "Oturumun sona erdi. Lütfen yeniden giriş yap." }, 401);
  if (user.profile && user.profile.status !== "active") return json({ error: "Hesabın kısıtlanmış." }, 403);
  const actor = { id: user.userId, createdAt: user.profile?.created_at ?? null, username: user.profile?.username ?? null };

  let r: ActionResult<unknown>;
  switch (op as Op) {
    case "post":
      r = await createPostForUser(actor, body);
      break;
    case "comment":
      r = await addCommentForUser(user.db, actor, String(body.postId ?? ""), String(body.body ?? ""), body.parentId ? String(body.parentId) : null);
      break;
    case "profile":
      r = await updateProfileForUser(actor, { username: String(body.username ?? ""), displayName: String(body.displayName ?? ""), bio: String(body.bio ?? "") });
      break;
    case "delete-account":
      r = await deleteAccountForUser(actor, String(body.confirm ?? ""));
      break;
  }
  if (!r.ok) return json({ ok: false, error: r.error }, 400);
  return json({ ok: true, message: r.message, ...((r.data as object | undefined) ?? {}) });
}
