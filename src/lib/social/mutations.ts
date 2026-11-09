import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MODERATION_STATUS, moderateFields, moderateText } from "@/lib/moderation";
import { isOwnedPath, sniffMime, UPLOAD_LIMITS, validateUpload } from "@/lib/uploads/validate";
import { fail, isUuid, rateLimit, type ActionResult } from "@/lib/server-utils";

/*
 * Moderasyon gerektiren yazma işlemlerinin TEK kaynağı. Web sitesinin sunucu
 * işlemleri (src/app/actions) ve mobil uygulamanın API'si (src/app/api/mobile)
 * bu fonksiyonları kullanır; böylece kurallar iki yerde ayrışamaz.
 */

const NOT_CONFIGURED = "Veritabanı bağlantısı yapılandırılmadı.";

const mediaSchema = z.object({
  path: z.string().max(200),
  mime: z.string().max(40),
  size: z.number().int().positive(),
  width: z.number().int().positive().max(8000).optional(),
  height: z.number().int().positive().max(8000).optional(),
  duration: z.number().nonnegative().max(600).optional(),
  posterPath: z.string().max(200).optional(),
});

export const postSchema = z.object({
  kind: z.enum(["post", "short", "poll"]),
  body: z.string().max(2200),
  media: z.array(mediaSchema).max(UPLOAD_LIMITS.maxImagesPerPost),
  pollOptions: z.array(z.string().trim().min(1).max(80)).max(4).optional(),
});

export type CreatePostInput = z.infer<typeof postSchema>;

/** Yüklenen dosyanın gerçekten kullanıcıya ait olduğunu ve türünün beyan edilenle eşleştiğini doğrular. */
async function verifyStoredMedia(userId: string, m: z.infer<typeof mediaSchema>): Promise<string | null> {
  if (!isOwnedPath(userId, m.path)) return "Geçersiz dosya yolu.";
  const kind = m.mime.startsWith("video/") ? "video" : "image";
  const err = validateUpload({ kind, mime: m.mime, size: m.size, width: m.width, height: m.height, durationSeconds: m.duration });
  if (err) return err;
  const admin = getSupabaseAdmin();
  if (!admin) return NOT_CONFIGURED;
  const { data } = await admin.storage.from("media").createSignedUrl(m.path, 60);
  if (!data?.signedUrl) return "Dosya bulunamadı. Lütfen yeniden yükle.";
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-63" } });
  if (!res.ok && res.status !== 206) return "Dosya doğrulanamadı.";
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 64);
  const real = sniffMime(head);
  const compatible = real === m.mime || (real === "video/mp4" && m.mime === "video/mp4");
  if (!compatible) {
    await admin.storage.from("media").remove([m.path]);
    return "Dosya içeriği beyan edilen türle uyuşmuyor ve silindi.";
  }
  return null;
}

export interface Actor {
  id: string;
  /** Profil oluşturulma tarihi (yeni hesap kuralı için) */
  createdAt: string | null;
}

/** Gönderi oluşturma çekirdeği — web sunucu işlemi ve mobil API aynı kuralları kullanır. */
export async function createPostForUser(actor: Actor, input: unknown): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fail("Gönderi bilgileri geçersiz.");
  const { kind, body, media, pollOptions } = parsed.data;

  if (!body.trim() && media.length === 0) return fail("Boş gönderi paylaşılamaz.");
  if (kind === "short" && (media.length !== 1 || !media[0].mime.startsWith("video/"))) return fail("Shorts için tek bir dikey video gerekli.");
  if (kind === "poll" && (!pollOptions || pollOptions.length < 2)) return fail("Anket için en az 2 seçenek gerekli.");
  if (media.filter((m) => m.mime.startsWith("video/")).length > 1) return fail("Bir gönderide en fazla 1 video olabilir.");

  if (!(await rateLimit(`post:${actor.id}`, 10, 3600))) return fail("Saatte en fazla 10 gönderi paylaşabilirsin.");

  const texts = [body, ...(pollOptions ?? [])].join("\n");
  const mod = moderateText(texts, "post");
  if (mod.decision === "block") return fail(mod.message ?? "İçerik topluluk kurallarına aykırı.");

  for (const m of media) {
    const err = await verifyStoredMedia(actor.id, m);
    if (err) return fail(err);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return fail(NOT_CONFIGURED);

  // Medyalı gönderiler: görsel içerik otomatik denetlenemediği için yeni hesaplarda incelemeye alınır.
  const accountAgeDays = actor.createdAt ? (Date.now() - new Date(actor.createdAt).getTime()) / 86400000 : 0;
  let status = MODERATION_STATUS[mod.decision];
  let reason = mod.decision === "review" ? mod.message : null;
  if (status === "approved" && media.length > 0 && accountAgeDays < 3) {
    status = "pending";
    reason = "Yeni hesapların medya paylaşımları kısa bir incelemeden geçer.";
  }

  const { data: post, error } = await admin
    .from("posts")
    .insert({ author_id: actor.id, kind, body, moderation_status: status, moderation_reason: reason })
    .select("id")
    .single();
  if (error || !post) return fail("Gönderi kaydedilemedi.");

  if (media.length) {
    const { error: mErr } = await admin.from("post_media").insert(
      media.map((m, i) => ({
        post_id: post.id,
        owner_id: actor.id,
        media_type: m.mime.startsWith("video/") ? "video" : "image",
        storage_path: m.path,
        poster_path: m.posterPath && isOwnedPath(actor.id, m.posterPath) ? m.posterPath : null,
        mime_type: m.mime,
        size_bytes: m.size,
        width: m.width ?? null,
        height: m.height ?? null,
        duration_seconds: m.duration ?? null,
        position: i,
      })),
    );
    if (mErr) {
      await admin.from("posts").delete().eq("id", post.id);
      return fail("Medya kaydedilemedi.");
    }
  }
  if (kind === "poll" && pollOptions) {
    await admin.from("poll_options").insert(pollOptions.map((label, i) => ({ post_id: post.id, label, position: i })));
  }
  if (status === "pending" && mod.decision === "review") {
    await admin.from("moderation_actions").insert({
      target_type: "post",
      target_id: post.id,
      target_owner_id: actor.id,
      action: "auto_flag",
      reason: mod.hits.map((h) => h.category).join(","),
      automated: true,
    });
  }
  return {
    ok: true,
    data: { id: post.id, status },
    message: status === "approved" ? "Gönderin paylaşıldı." : (reason ?? "Gönderin incelemeye alındı."),
  };
}

/** Yorum çekirdeği. `db` kullanıcının kendi oturumuyla (RLS altında) çalışan istemcidir. */
export async function addCommentForUser(db: SupabaseClient, actor: Actor, postId: string, body: string, parentId?: string | null): Promise<ActionResult<{ status: string }>> {
  const text = body.trim();
  if (!isUuid(postId) || (parentId && !isUuid(parentId))) return fail("Geçersiz istek.");
  if (text.length < 1 || text.length > 1000) return fail("Yorum 1-1000 karakter olmalı.");
  if (!(await rateLimit(`comment:${actor.id}`, 30, 600))) return fail("Çok hızlı yorum yapıyorsun. Biraz bekle.");
  const mod = moderateText(text, "comment");
  if (mod.decision === "block") return fail(mod.message ?? "Yorum topluluk kurallarına aykırı.");
  const admin = getSupabaseAdmin();
  if (!admin) return fail(NOT_CONFIGURED);
  const { data: visible } = await db.rpc("can_view_post", { p_post_id: postId, viewer: actor.id });
  if (visible !== true) return fail("Bu gönderiye yorum yapamazsın.");
  const status = MODERATION_STATUS[mod.decision];
  const { error } = await admin.from("comments").insert({
    post_id: postId,
    author_id: actor.id,
    parent_id: parentId ?? null,
    body: text,
    moderation_status: status,
    moderation_reason: mod.decision === "review" ? mod.message : null,
  });
  if (error) return fail("Yorum kaydedilemedi.");
  return { ok: true, data: { status }, message: status === "approved" ? undefined : "Yorumun incelemeye alındı." };
}

/** Profil metin alanları (kullanıcı adı, görünen ad, biyografi) — moderasyonla. */
export async function updateProfileForUser(
  actor: { id: string; username: string | null },
  input: { username: string; displayName: string; bio: string },
): Promise<ActionResult> {
  const username = String(input.username ?? "").trim().toLowerCase().slice(0, 24);
  const displayName = String(input.displayName ?? "").trim().slice(0, 50);
  const bio = String(input.bio ?? "").trim().slice(0, 300);
  if (!/^[a-z0-9_.]{3,24}$/.test(username)) return fail("Kullanıcı adı 3-24 karakter; küçük harf, rakam, nokta ve alt çizgi.");
  const mod = moderateFields({ username, display_name: displayName, bio });
  if (mod.decision !== "allow") return fail("Profil bilgilerin topluluk kurallarına uygun değil. Lütfen düzenle.");
  if (!(await rateLimit(`profile:${actor.id}`, 10, 3600))) return fail("Çok sık değişiklik yapıyorsun.");
  const admin = getSupabaseAdmin();
  if (!admin) return fail(NOT_CONFIGURED);
  if (username !== actor.username) {
    const { data: taken } = await admin.from("profiles").select("id").eq("username", username).neq("id", actor.id).maybeSingle();
    if (taken) return fail("Bu kullanıcı adı alınmış.");
  }
  const { error } = await admin.from("profiles").update({ username, display_name: displayName, bio }).eq("id", actor.id);
  if (error) return fail("Profil güncellenemedi.");
  return { ok: true, message: "Profilin güncellendi." };
}

/** KVKK / Google Play: hesabın ve tüm kişisel verilerin kalıcı olarak silinmesi. */
export async function deleteAccountForUser(actor: { id: string; username: string | null }, confirm: string): Promise<ActionResult> {
  if (!actor.username || String(confirm ?? "").trim().toLowerCase() !== actor.username) return fail("Onay için kullanıcı adını aynen yazmalısın.");
  const admin = getSupabaseAdmin();
  if (!admin) return fail(NOT_CONFIGURED);
  const { data: sub } = await admin.from("subscriptions").select("status, provider").eq("user_id", actor.id).maybeSingle();
  if (sub && ["active", "renewal_pending"].includes(sub.status) && sub.provider !== "test") {
    return fail("Önce Premium aboneliğini iptal etmelisin; aksi halde ödeme kuruluşu tahsilata devam edebilir.");
  }
  for (const bucket of ["media", "avatars"]) {
    const { data: entries } = await admin.storage.from(bucket).list(actor.id, { limit: 1000 });
    const paths: string[] = [];
    for (const entry of entries ?? []) {
      if (entry.id) paths.push(`${actor.id}/${entry.name}`);
      else {
        const { data: files } = await admin.storage.from(bucket).list(`${actor.id}/${entry.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`${actor.id}/${entry.name}/${f.name}`);
      }
    }
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  await admin.from("audit_logs").insert({ actor_id: null, action: "account_deleted", target_type: "user", target_id: actor.id });
  const { error } = await admin.auth.admin.deleteUser(actor.id);
  if (error) return fail("Hesap silinemedi. Lütfen destek ile iletişime geç.");
  return { ok: true, message: "Hesabın ve verilerin silindi." };
}
