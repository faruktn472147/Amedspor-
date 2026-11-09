"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MODERATION_STATUS, moderateText } from "@/lib/moderation";
import { isOwnedPath, sniffMime, UPLOAD_LIMITS, validateUpload } from "@/lib/uploads/validate";
import { fail, isUuid, rateLimit, type ActionResult } from "@/lib/server-utils";

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

const postSchema = z.object({
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

export async function createPostAction(input: CreatePostInput): Promise<ActionResult<{ id: string; status: string }>> {
  const viewer = await requireViewer("/paylas");
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fail("Gönderi bilgileri geçersiz.");
  const { kind, body, media, pollOptions } = parsed.data;

  if (!body.trim() && media.length === 0) return fail("Boş gönderi paylaşılamaz.");
  if (kind === "short" && (media.length !== 1 || !media[0].mime.startsWith("video/"))) return fail("Shorts için tek bir dikey video gerekli.");
  if (kind === "poll" && (!pollOptions || pollOptions.length < 2)) return fail("Anket için en az 2 seçenek gerekli.");
  if (media.filter((m) => m.mime.startsWith("video/")).length > 1) return fail("Bir gönderide en fazla 1 video olabilir.");

  if (!(await rateLimit(`post:${viewer.user.id}`, 10, 3600))) return fail("Saatte en fazla 10 gönderi paylaşabilirsin.");

  const texts = [body, ...(pollOptions ?? [])].join("\n");
  const mod = moderateText(texts, "post");
  if (mod.decision === "block") return fail(mod.message ?? "İçerik topluluk kurallarına aykırı.");

  for (const m of media) {
    const err = await verifyStoredMedia(viewer.user.id, m);
    if (err) return fail(err);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return fail(NOT_CONFIGURED);

  // Medyalı gönderiler: görsel içerik otomatik denetlenemediği için yeni hesaplarda incelemeye alınır.
  const accountAgeDays = viewer.profile ? (Date.now() - new Date(viewer.profile.created_at).getTime()) / 86400000 : 0;
  let status = MODERATION_STATUS[mod.decision];
  let reason = mod.decision === "review" ? mod.message : null;
  if (status === "approved" && media.length > 0 && accountAgeDays < 3) {
    status = "pending";
    reason = "Yeni hesapların medya paylaşımları kısa bir incelemeden geçer.";
  }

  const { data: post, error } = await admin
    .from("posts")
    .insert({ author_id: viewer.user.id, kind, body, moderation_status: status, moderation_reason: reason })
    .select("id")
    .single();
  if (error || !post) return fail("Gönderi kaydedilemedi.");

  if (media.length) {
    const { error: mErr } = await admin.from("post_media").insert(
      media.map((m, i) => ({
        post_id: post.id,
        owner_id: viewer.user.id,
        media_type: m.mime.startsWith("video/") ? "video" : "image",
        storage_path: m.path,
        poster_path: m.posterPath && isOwnedPath(viewer.user.id, m.posterPath) ? m.posterPath : null,
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
      target_owner_id: viewer.user.id,
      action: "auto_flag",
      reason: mod.hits.map((h) => h.category).join(","),
      automated: true,
    });
  }
  revalidatePath("/akis");
  return {
    ok: true,
    data: { id: post.id, status },
    message: status === "approved" ? "Gönderin paylaşıldı." : (reason ?? "Gönderin incelemeye alındı."),
  };
}

export async function editPostAction(postId: string, body: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(postId) || body.length > 2200) return fail("Geçersiz istek.");
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();
  if (!supabase || !admin) return fail(NOT_CONFIGURED);
  const { data: post } = await supabase.from("posts").select("author_id, moderation_status").eq("id", postId).maybeSingle();
  if (!post || post.author_id !== viewer.user.id) return fail("Bu gönderiyi düzenleme yetkin yok.");
  if (post.moderation_status === "removed") return fail("Kaldırılan gönderi düzenlenemez.");
  const mod = moderateText(body, "post");
  if (mod.decision === "block") return fail(mod.message ?? "İçerik topluluk kurallarına aykırı.");
  await admin
    .from("posts")
    .update({ body, edited_at: new Date().toISOString(), moderation_status: MODERATION_STATUS[mod.decision], moderation_reason: mod.decision === "review" ? mod.message : null })
    .eq("id", postId)
    .eq("author_id", viewer.user.id);
  revalidatePath(`/gonderi/${postId}`);
  return { ok: true, message: mod.decision === "allow" ? "Gönderi güncellendi." : "Düzenleme incelemeye alındı." };
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(postId)) return fail("Geçersiz istek.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data: media } = await supabase.from("post_media").select("storage_path, poster_path").eq("post_id", postId).eq("owner_id", viewer.user.id);
  const { error, count } = await supabase.from("posts").delete({ count: "exact" }).eq("id", postId).eq("author_id", viewer.user.id);
  if (error || !count) return fail("Gönderi silinemedi.");
  const paths = (media ?? []).flatMap((m) => [m.storage_path, m.poster_path].filter(Boolean) as string[]);
  if (paths.length) await getSupabaseAdmin()?.storage.from("media").remove(paths);
  revalidatePath("/akis");
  return { ok: true, message: "Gönderi silindi." };
}

export async function addCommentAction(postId: string, body: string, parentId?: string | null): Promise<ActionResult<{ status: string }>> {
  const viewer = await requireViewer();
  const text = body.trim();
  if (!isUuid(postId) || (parentId && !isUuid(parentId))) return fail("Geçersiz istek.");
  if (text.length < 1 || text.length > 1000) return fail("Yorum 1-1000 karakter olmalı.");
  if (!(await rateLimit(`comment:${viewer.user.id}`, 30, 600))) return fail("Çok hızlı yorum yapıyorsun. Biraz bekle.");
  const mod = moderateText(text, "comment");
  if (mod.decision === "block") return fail(mod.message ?? "Yorum topluluk kurallarına aykırı.");
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();
  if (!supabase || !admin) return fail(NOT_CONFIGURED);
  const { data: visible } = await supabase.rpc("can_view_post", { p_post_id: postId, viewer: viewer.user.id });
  if (visible !== true) return fail("Bu gönderiye yorum yapamazsın.");
  const status = MODERATION_STATUS[mod.decision];
  const { error } = await admin.from("comments").insert({
    post_id: postId,
    author_id: viewer.user.id,
    parent_id: parentId ?? null,
    body: text,
    moderation_status: status,
    moderation_reason: mod.decision === "review" ? mod.message : null,
  });
  if (error) return fail("Yorum kaydedilemedi.");
  revalidatePath(`/gonderi/${postId}`);
  return { ok: true, data: { status }, message: status === "approved" ? undefined : "Yorumun incelemeye alındı." };
}

export async function deleteCommentAction(commentId: string, postId: string): Promise<ActionResult> {
  await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(commentId)) return fail("Geçersiz istek.");
  const { count } = await supabase.from("comments").delete({ count: "exact" }).eq("id", commentId);
  if (!count) return fail("Yorumu silme yetkin yok.");
  revalidatePath(`/gonderi/${postId}`);
  return { ok: true };
}

async function toggle(table: "likes" | "bookmarks", postId: string, on: boolean): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(postId)) return fail("Geçersiz istek.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  if (on) {
    if (!(await rateLimit(`${table}:${viewer.user.id}`, 120, 600))) return fail("Çok hızlı işlem yapıyorsun.");
    const { error } = await supabase.from(table).insert({ user_id: viewer.user.id, post_id: postId });
    if (error && error.code !== "23505") return fail("İşlem yapılamadı.");
  } else {
    await supabase.from(table).delete().eq("user_id", viewer.user.id).eq("post_id", postId);
  }
  return { ok: true };
}

export async function toggleLikeAction(postId: string, on: boolean) {
  return toggle("likes", postId, on);
}
export async function toggleBookmarkAction(postId: string, on: boolean) {
  return toggle("bookmarks", postId, on);
}

export async function votePollAction(postId: string, optionId: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(postId) || !isUuid(optionId)) return fail("Geçersiz istek.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from("poll_votes").insert({ post_id: postId, option_id: optionId, user_id: viewer.user.id });
  if (error) return fail(error.code === "23505" ? "Bu ankette zaten oy kullandın." : "Oy kaydedilemedi.");
  revalidatePath(`/gonderi/${postId}`);
  return { ok: true };
}

const REPORT_REASONS = [
  "kufur", "hakaret", "tehdit", "irkcilik", "nefret", "taciz", "siddet",
  "spam", "dolandiricilik", "kisisel_bilgi", "uygunsuz_gorsel", "telif", "diger",
] as const;

export async function reportAction(targetType: "post" | "comment" | "profile" | "news", targetId: string, reason: string, details: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(targetId) || !(REPORT_REASONS as readonly string[]).includes(reason)) return fail("Geçersiz şikâyet.");
  if (!(await rateLimit(`report:${viewer.user.id}`, 20, 3600))) return fail("Çok fazla şikâyet gönderdin. Daha sonra tekrar dene.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from("reports").insert({
    reporter_id: viewer.user.id,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details.slice(0, 1000),
  });
  if (error?.code === "23505") return { ok: true, message: "Bu içeriği daha önce şikâyet ettin; inceleniyor." };
  if (error) return fail("Şikâyet gönderilemedi.");
  return { ok: true, message: "Şikâyetin moderatörlere iletildi. Teşekkürler." };
}

export async function appealAction(actionId: string, message: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(actionId) || message.trim().length < 10) return fail("İtirazını en az 10 karakterle açıkla.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from("appeals").insert({ action_id: actionId, user_id: viewer.user.id, message: message.trim().slice(0, 1000) });
  if (error?.code === "23505") return fail("Bu karar için zaten itiraz ettin.");
  if (error) return fail("İtiraz gönderilemedi.");
  return { ok: true, message: "İtirazın alındı. Bir moderatör inceleyecek." };
}
