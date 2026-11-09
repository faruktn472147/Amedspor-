"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MODERATION_STATUS, moderateText } from "@/lib/moderation";
import { addCommentForUser, createPostForUser, type CreatePostInput } from "@/lib/social/mutations";
import { fail, isUuid, rateLimit, type ActionResult } from "@/lib/server-utils";

const NOT_CONFIGURED = "Veritabanı bağlantısı yapılandırılmadı.";

export type { CreatePostInput } from "@/lib/social/mutations";

export async function createPostAction(input: CreatePostInput): Promise<ActionResult<{ id: string; status: string }>> {
  const viewer = await requireViewer("/paylas");
  const r = await createPostForUser({ id: viewer.user.id, createdAt: viewer.profile?.created_at ?? null }, input);
  if (r.ok) revalidatePath("/akis");
  return r;
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
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const r = await addCommentForUser(supabase, { id: viewer.user.id, createdAt: viewer.profile?.created_at ?? null }, postId, body, parentId);
  if (r.ok) revalidatePath(`/gonderi/${postId}`);
  return r;
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
