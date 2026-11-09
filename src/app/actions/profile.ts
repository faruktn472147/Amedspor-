"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteAccountForUser, updateProfileForUser } from "@/lib/social/mutations";
import { fail, isUuid, rateLimit, str, type ActionResult } from "@/lib/server-utils";

const NOT_CONFIGURED = "Veritabanı bağlantısı yapılandırılmadı.";

export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer("/ayarlar");
  const r = await updateProfileForUser(
    { id: viewer.user.id, username: viewer.profile?.username ?? null },
    { username: str(fd, "username", 24), displayName: str(fd, "display_name", 50), bio: str(fd, "bio", 300) },
  );
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function updatePreferencesAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer("/ayarlar");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase
    .from("profiles")
    .update({
      is_private: fd.get("is_private") === "on",
      data_saver: fd.get("data_saver") === "on",
      personalized_ads: fd.get("personalized_ads") === "on",
    })
    .eq("id", viewer.user.id);
  if (error) return fail("Tercihler kaydedilemedi.");
  revalidatePath("/", "layout");
  return { ok: true, message: "Tercihlerin kaydedildi." };
}

export async function setAvatarAction(path: string | null): Promise<ActionResult> {
  const viewer = await requireViewer("/ayarlar");
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();
  if (!supabase || !admin) return fail(NOT_CONFIGURED);
  let url: string | null = null;
  if (path) {
    if (!new RegExp(`^${viewer.user.id}/avatar-[0-9a-f-]{36}\\.(webp|jpg|png)$`).test(path)) return fail("Geçersiz dosya.");
    url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  const old = viewer.profile?.avatar_url;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", viewer.user.id);
  if (error) return fail("Profil fotoğrafı kaydedilemedi.");
  const oldPath = old?.split("/avatars/")[1];
  if (oldPath && oldPath.startsWith(`${viewer.user.id}/`) && oldPath !== path) await admin.storage.from("avatars").remove([oldPath]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil fotoğrafın güncellendi." };
}

export async function followAction(targetId: string): Promise<ActionResult<{ state: "following" | "requested" }>> {
  const viewer = await requireViewer();
  if (!isUuid(targetId) || targetId === viewer.user.id) return fail("Geçersiz istek.");
  if (!(await rateLimit(`follow:${viewer.user.id}`, 60, 3600))) return fail("Çok fazla takip işlemi yaptın.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data: target } = await supabase.from("profiles").select("is_private").eq("id", targetId).maybeSingle();
  if (!target) return fail("Kullanıcı bulunamadı.");
  if (target.is_private) {
    const { error } = await supabase.from("follow_requests").insert({ requester_id: viewer.user.id, target_id: targetId });
    if (error && error.code !== "23505") return fail("Takip isteği gönderilemedi.");
    revalidatePath("/u/[username]", "page");
    return { ok: true, data: { state: "requested" }, message: "Takip isteği gönderildi." };
  }
  const { error } = await supabase.from("follows").insert({ follower_id: viewer.user.id, following_id: targetId });
  if (error && error.code !== "23505") return fail("Takip edilemedi.");
  revalidatePath("/u/[username]", "page");
  return { ok: true, data: { state: "following" } };
}

export async function unfollowAction(targetId: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(targetId)) return fail("Geçersiz istek.");
  await supabase.from("follows").delete().eq("follower_id", viewer.user.id).eq("following_id", targetId);
  await supabase.from("follow_requests").delete().eq("requester_id", viewer.user.id).eq("target_id", targetId);
  revalidatePath("/u/[username]", "page");
  return { ok: true };
}

export async function removeFollowerAction(followerId: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(followerId)) return fail("Geçersiz istek.");
  await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", viewer.user.id);
  revalidatePath("/u/[username]", "page");
  return { ok: true };
}

export async function respondFollowRequestAction(requesterId: string, accept: boolean): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(requesterId)) return fail("Geçersiz istek.");
  if (accept) {
    const { error } = await supabase.rpc("accept_follow_request", { p_requester: requesterId });
    if (error) return fail("İstek kabul edilemedi.");
  } else {
    await supabase.from("follow_requests").delete().eq("requester_id", requesterId).eq("target_id", viewer.user.id);
  }
  revalidatePath("/bildirimler");
  return { ok: true };
}

export async function blockAction(targetId: string, on: boolean): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(targetId) || targetId === viewer.user.id) return fail("Geçersiz istek.");
  if (on) await supabase.from("blocks").insert({ blocker_id: viewer.user.id, blocked_id: targetId });
  else await supabase.from("blocks").delete().eq("blocker_id", viewer.user.id).eq("blocked_id", targetId);
  revalidatePath("/", "layout");
  return { ok: true, message: on ? "Kullanıcı engellendi." : "Engel kaldırıldı." };
}

export async function muteAction(targetId: string, on: boolean): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(targetId) || targetId === viewer.user.id) return fail("Geçersiz istek.");
  if (on) await supabase.from("mutes").insert({ muter_id: viewer.user.id, muted_id: targetId });
  else await supabase.from("mutes").delete().eq("muter_id", viewer.user.id).eq("muted_id", targetId);
  revalidatePath("/", "layout");
  return { ok: true, message: on ? "Kullanıcı sessize alındı." : "Sessiz kaldırıldı." };
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NOT_CONFIGURED);
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.user.id).is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** KVKK: hesabın ve tüm kişisel verilerin kalıcı olarak silinmesi. */
export async function deleteAccountAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer("/ayarlar/hesap");
  const r = await deleteAccountForUser({ id: viewer.user.id, username: viewer.profile?.username ?? null }, str(fd, "confirm", 30));
  if (!r.ok) return r;
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "global" }).catch(() => {});
  redirect("/?hesap=silindi");
}
