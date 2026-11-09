"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwnerAal2, requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeAdSettings } from "@/lib/ads/frequency";
import { ingestAllSources } from "@/lib/news/ingest";
import { audit, fail, isUuid, str, type ActionResult } from "@/lib/server-utils";

const NC = "Veritabanı bağlantısı yapılandırılmadı.";
const optUrl = (v: string) => (v ? (/^https:\/\//.test(v) ? v : null) : "");

// ============================================================ Moderasyon
export async function moderateContentAction(
  targetType: "post" | "comment",
  targetId: string,
  decision: "approve" | "reject" | "remove" | "restore",
  reason: string,
): Promise<ActionResult> {
  const v = await requireRole("moderator");
  const admin = getSupabaseAdmin();
  if (!admin || !isUuid(targetId)) return fail(NC);
  const table = targetType === "post" ? "posts" : "comments";
  const status = { approve: "approved", restore: "approved", reject: "rejected", remove: "removed" }[decision];
  const { data: row } = await admin.from(table).select("author_id").eq("id", targetId).maybeSingle();
  if (!row) return fail("İçerik bulunamadı.");
  await admin.from(table).update({ moderation_status: status, moderation_reason: reason || null }).eq("id", targetId);
  const { data: act } = await admin
    .from("moderation_actions")
    .insert({ moderator_id: v.user.id, target_type: targetType, target_id: targetId, target_owner_id: row.author_id, action: decision, reason })
    .select("id")
    .single();
  if (decision === "reject" || decision === "remove") {
    await admin.from("notifications").insert({
      user_id: row.author_id,
      type: "moderation",
      message: `Bir ${targetType === "post" ? "gönderin" : "yorumun"} topluluk kuralları nedeniyle kaldırıldı${reason ? `: ${reason}` : ""}. İtiraz edebilirsin.`,
      link: act ? `/itiraz/${act.id}` : null,
    });
  }
  await admin.from("reports").update({ status: "resolved", resolved_by: v.user.id, resolved_at: new Date().toISOString() }).eq("target_id", targetId).in("status", ["open", "reviewing"]);
  await audit(v.user.id, `moderation_${decision}`, targetType, targetId, { reason });
  revalidatePath("/admin/moderasyon");
  return { ok: true };
}

export async function dismissReportAction(reportId: string): Promise<ActionResult> {
  const v = await requireRole("moderator");
  const admin = getSupabaseAdmin();
  if (!admin || !isUuid(reportId)) return fail(NC);
  await admin.from("reports").update({ status: "dismissed", resolved_by: v.user.id, resolved_at: new Date().toISOString() }).eq("id", reportId);
  await audit(v.user.id, "report_dismissed", "report", reportId);
  revalidatePath("/admin/moderasyon");
  return { ok: true };
}

export async function reviewAppealAction(appealId: string, accept: boolean): Promise<ActionResult> {
  const v = await requireRole("moderator");
  const admin = getSupabaseAdmin();
  if (!admin || !isUuid(appealId)) return fail(NC);
  const { data: ap } = await admin.from("appeals").select("id, user_id, action:moderation_actions(target_type, target_id)").eq("id", appealId).maybeSingle();
  if (!ap) return fail("İtiraz bulunamadı.");
  await admin.from("appeals").update({ status: accept ? "accepted" : "rejected", reviewer_id: v.user.id, reviewed_at: new Date().toISOString() }).eq("id", appealId);
  const action = ap.action as unknown as { target_type: string; target_id: string } | null;
  if (accept && action && (action.target_type === "post" || action.target_type === "comment")) {
    await admin.from(action.target_type === "post" ? "posts" : "comments").update({ moderation_status: "approved", moderation_reason: null }).eq("id", action.target_id);
  }
  await admin.from("notifications").insert({
    user_id: ap.user_id,
    type: "moderation",
    message: accept ? "İtirazın kabul edildi ve içeriğin yeniden yayına alındı." : "İtirazın incelendi ve karar değişmedi.",
  });
  await audit(v.user.id, accept ? "appeal_accepted" : "appeal_rejected", "appeal", appealId);
  revalidatePath("/admin/moderasyon");
  return { ok: true };
}

export async function setUserStatusAction(userId: string, status: "active" | "suspended" | "banned", reason: string): Promise<ActionResult> {
  const v = await requireRole("moderator");
  const admin = getSupabaseAdmin();
  if (!admin || !isUuid(userId) || userId === v.user.id) return fail("Geçersiz istek.");
  const { data: roles } = await admin.from("admin_roles").select("role").eq("user_id", userId);
  if ((roles ?? []).some((r) => r.role === "owner")) return fail("Sahip hesabı askıya alınamaz.");
  await admin.from("profiles").update({ status }).eq("id", userId);
  await admin.from("moderation_actions").insert({
    moderator_id: v.user.id,
    target_type: "profile",
    target_id: userId,
    target_owner_id: userId,
    action: status === "active" ? "unban" : status === "suspended" ? "suspend" : "ban",
    reason,
  });
  if (status !== "active") await admin.auth.admin.signOut(userId).catch(() => {});
  await audit(v.user.id, `user_${status}`, "user", userId, { reason });
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}

/** Rol yönetimi yalnızca sahip (2FA) tarafından yapılabilir. Sahip rolü buradan verilemez. */
export async function setRoleAction(userId: string, role: "admin" | "moderator" | "editor", grant: boolean): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const admin = getSupabaseAdmin();
  if (!admin || !isUuid(userId)) return fail(NC);
  if (grant) await admin.from("admin_roles").upsert({ user_id: userId, role, granted_by: v.user.id });
  else await admin.from("admin_roles").delete().eq("user_id", userId).eq("role", role);
  await audit(v.user.id, grant ? "role_granted" : "role_revoked", "user", userId, { role });
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}

export async function broadcastNotificationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("admin");
  const admin = getSupabaseAdmin();
  if (!admin) return fail(NC);
  const message = str(fd, "message", 300);
  const link = str(fd, "link", 200);
  if (message.length < 5) return fail("Mesaj en az 5 karakter olmalı.");
  if (link && !link.startsWith("/")) return fail("Bağlantı site içi bir yol olmalı (/ ile başlamalı).");
  // Bildirim spam'ini önlemek için günde en fazla 3 toplu bildirim
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "broadcast").gte("created_at", since);
  if ((count ?? 0) >= 3) return fail("Günlük toplu bildirim sınırına (3) ulaşıldı.");
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("profiles").select("id").eq("status", "active").range(from, from + 999);
    if (!data?.length) break;
    await admin.from("notifications").insert(data.map((p) => ({ user_id: p.id, type: "system", message, link: link || null })));
    total += data.length;
    if (data.length < 1000) break;
  }
  await audit(v.user.id, "broadcast", "notification", null, { message, total });
  return { ok: true, message: `${total} kullanıcıya bildirim gönderildi.` };
}

// ============================================================ Haberler
const newsSchema = z.object({
  title: z.string().min(5).max(300),
  summary: z.string().max(1200),
  body: z.string().max(20000),
  original_url: z.string().max(500),
  image_url: z.string().max(500),
  image_credit: z.string().max(200),
  category: z.enum(["son_dakika", "resmi", "haber", "transfer", "mac", "roportaj"]),
  verification: z.enum(["official", "verified", "unverified", "rumor"]),
  source_id: z.string(),
});

export async function saveNewsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const parsed = newsSchema.safeParse(Object.fromEntries(["title", "summary", "body", "original_url", "image_url", "image_credit", "category", "verification", "source_id"].map((k) => [k, str(fd, k, 20000)])));
  if (!parsed.success) return fail("Haber bilgileri eksik veya hatalı (başlık en az 5 karakter).");
  const n = parsed.data;
  const original = optUrl(n.original_url);
  const image = optUrl(n.image_url);
  if (original === null || image === null) return fail("Bağlantılar https:// ile başlamalı.");
  const publish = fd.get("publish") === "on";
  if (publish && !original && !n.source_id && !n.body.trim()) return fail("Kaynaksız haber yayınlanamaz: kaynak, özgün bağlantı veya editör metni gerekli.");
  if (publish && n.verification === "rumor" && n.category !== "transfer") return fail("Söylenti yalnızca 'transfer' kategorisinde ve etiketiyle yayınlanabilir.");
  const id = str(fd, "id", 40);
  const row = {
    title: n.title,
    summary: n.summary,
    body: n.body,
    original_url: original || null,
    image_url: image || null,
    image_credit: n.image_credit || null,
    category: n.category,
    verification: n.verification,
    source_id: isUuid(n.source_id) ? n.source_id : null,
    status: publish ? "published" : "pending",
    published_at: publish ? new Date().toISOString() : null,
    approved_by: publish ? v.user.id : null,
    ...(id ? {} : { author_id: v.user.id }),
  };
  const { error } = id && isUuid(id) ? await supabase.from("news").update(row).eq("id", id) : await supabase.from("news").insert(row);
  if (error) return fail(`Haber kaydedilemedi: ${error.message}`);
  await audit(v.user.id, id ? "news_updated" : "news_created", "news", id || null, { publish });
  revalidatePath("/admin/haberler");
  revalidatePath("/haberler");
  return { ok: true, message: publish ? "Haber yayınlandı." : "Haber taslak/onay bekliyor olarak kaydedildi." };
}

export async function setNewsStatusAction(id: string, status: "published" | "rejected" | "removed"): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(id)) return fail(NC);
  const patch: Record<string, unknown> = { status };
  if (status === "published") Object.assign(patch, { published_at: new Date().toISOString(), approved_by: v.user.id });
  const { error } = await supabase.from("news").update(patch).eq("id", id);
  if (error) return fail(error.message);
  await audit(v.user.id, `news_${status}`, "news", id);
  revalidatePath("/admin/haberler");
  revalidatePath("/haberler");
  return { ok: true };
}

export async function saveSourceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("admin");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const homepage = optUrl(str(fd, "homepage_url", 500));
  const feed = optUrl(str(fd, "feed_url", 500));
  if (!homepage || feed === null) return fail("Ana sayfa adresi zorunlu; adresler https:// ile başlamalı.");
  const kind = str(fd, "kind", 30);
  const trust = str(fd, "trust_level", 20);
  if (!["official_club", "official_social", "federation", "media", "journalist", "aggregator"].includes(kind)) return fail("Geçersiz kaynak türü.");
  if (!["official", "trusted", "review"].includes(trust)) return fail("Geçersiz güven seviyesi.");
  const keywords = str(fd, "keywords", 500).split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
  const row = {
    name: str(fd, "name", 80),
    homepage_url: homepage,
    feed_url: feed || null,
    kind,
    trust_level: trust,
    auto_publish: fd.get("auto_publish") === "on",
    republish_allowed: fd.get("republish_allowed") === "on",
    is_active: fd.get("is_active") === "on",
    keywords: keywords.length ? keywords : ["amedspor"],
  };
  const id = str(fd, "id", 40);
  const { error } = id && isUuid(id) ? await supabase.from("news_sources").update(row).eq("id", id) : await supabase.from("news_sources").insert(row);
  if (error) return fail(error.message);
  await audit(v.user.id, "source_saved", "news_source", id || null, { name: row.name });
  revalidatePath("/admin/kaynaklar");
  return { ok: true, message: "Kaynak kaydedildi." };
}

export async function runIngestNowAction(): Promise<ActionResult> {
  const v = await requireRole("admin");
  const admin = getSupabaseAdmin();
  if (!admin) return fail(NC);
  const r = await ingestAllSources(admin);
  await audit(v.user.id, "news_ingest_manual", null, null, { ...r });
  revalidatePath("/admin/haberler");
  return { ok: true, message: `${r.sources} kaynak tarandı, ${r.inserted} yeni haber (${r.published} otomatik yayın). Hata: ${r.errors.length}` };
}

// ============================================================ Maç ve oyuncu verisi
export async function saveTeamAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const name = str(fd, "name", 80);
  if (name.length < 2) return fail("Takım adı gerekli.");
  const { error } = await supabase.from("teams").insert({ name, short_name: str(fd, "short_name", 10) || null, is_amedspor: fd.get("is_amedspor") === "on" });
  if (error) return fail(error.code === "23505" ? "Bu takım zaten var veya Amedspor takımı zaten tanımlı." : error.message);
  await audit(v.user.id, "team_created", "team", null, { name });
  revalidatePath("/admin/maclar");
  return { ok: true, message: "Takım eklendi." };
}

export async function saveMatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const id = str(fd, "id", 40);
  const num = (k: string) => {
    const s = str(fd, k, 4);
    return s === "" ? null : Number(s);
  };
  const kickoff = str(fd, "kickoff_at", 40);
  const sourceUrl = optUrl(str(fd, "source_url", 500));
  if (sourceUrl === null) return fail("Kaynak bağlantısı https:// ile başlamalı.");
  const row = {
    competition: str(fd, "competition", 80),
    season: str(fd, "season", 9),
    home_team_id: str(fd, "home_team_id", 40),
    away_team_id: str(fd, "away_team_id", 40),
    // Form "datetime-local" değeri Türkiye saatidir (UTC+3); sunucu saat diliminden bağımsız yorumlanır.
    kickoff_at: kickoff && !Number.isNaN(Date.parse(`${kickoff}:00+03:00`)) ? new Date(`${kickoff}:00+03:00`).toISOString() : null,
    venue: str(fd, "venue", 120) || null,
    status: str(fd, "status", 20) || "scheduled",
    minute: num("minute"),
    home_score: num("home_score"),
    away_score: num("away_score"),
    source_name: str(fd, "source_name", 80) || null,
    source_url: sourceUrl || null,
    verified: fd.get("verified") === "on",
    updated_by: v.user.id,
  };
  if (!row.competition || !/^\d{4}-\d{2,4}$/.test(row.season) || !isUuid(row.home_team_id) || !isUuid(row.away_team_id) || !row.kickoff_at) {
    return fail("Lig, sezon (ör. 2026-27), takımlar ve tarih zorunlu.");
  }
  if (row.verified && !row.source_name) return fail("Doğrulanmış işaretlemek için veri kaynağı belirtilmeli.");
  const statsRaw = str(fd, "stats", 4000);
  let stats: Record<string, [number, number]> | undefined;
  if (statsRaw) {
    try {
      stats = JSON.parse(statsRaw);
    } catch {
      return fail('İstatistikler JSON biçiminde olmalı, ör. {"Topla oynama": [52, 48]}');
    }
  }
  const payload = stats ? { ...row, stats } : row;
  const { error } = id && isUuid(id) ? await supabase.from("matches").update(payload).eq("id", id) : await supabase.from("matches").insert(payload);
  if (error) return fail(error.message);
  await audit(v.user.id, id ? "match_updated" : "match_created", "match", id || null);
  revalidatePath("/maclar");
  revalidatePath("/admin/maclar");
  return { ok: true, message: "Maç kaydedildi." };
}

export async function addMatchEventAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const matchId = str(fd, "match_id", 40);
  const playerId = str(fd, "player_id", 40);
  const teamId = str(fd, "team_id", 40);
  const row = {
    match_id: matchId,
    team_id: isUuid(teamId) ? teamId : null,
    player_id: isUuid(playerId) ? playerId : null,
    player_name: str(fd, "player_name", 80) || null,
    type: str(fd, "type", 20),
    minute: Number(str(fd, "minute", 3)),
    extra_minute: str(fd, "extra_minute", 2) ? Number(str(fd, "extra_minute", 2)) : null,
    detail: str(fd, "detail", 200),
  };
  if (!isUuid(matchId) || !Number.isInteger(row.minute)) return fail("Maç ve dakika zorunlu.");
  const { error } = await supabase.from("match_events").insert(row);
  if (error) return fail(error.message);
  await audit(v.user.id, "match_event_added", "match", matchId, { type: row.type });
  revalidatePath(`/maclar/${matchId}`);
  return { ok: true, message: "Olay eklendi." };
}

export async function settleMatchAction(matchId: string, motmId: string | null): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(matchId)) return fail(NC);
  const { data, error } = await supabase.rpc("settle_match_predictions", { p_match_id: matchId, p_motm: motmId && isUuid(motmId) ? motmId : null });
  if (error) return fail(error.message);
  await audit(v.user.id, "predictions_settled", "match", matchId, { count: data });
  revalidatePath("/tahminler");
  return { ok: true, message: `${data ?? 0} tahmin puanlandı.` };
}

export async function savePlayerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const photo = optUrl(str(fd, "photo_url", 500));
  const sourceUrl = optUrl(str(fd, "source_url", 500));
  if (photo === null || sourceUrl === null) return fail("Bağlantılar https:// ile başlamalı.");
  if (photo && !str(fd, "photo_credit", 200)) return fail("Fotoğraf kullanıyorsan telif/izin bilgisini (kaynak) yazmalısın.");
  const number = str(fd, "shirt_number", 2);
  const row = {
    team_id: str(fd, "team_id", 40) || null,
    full_name: str(fd, "full_name", 80),
    slug: str(fd, "slug", 80).toLowerCase(),
    shirt_number: number ? Number(number) : null,
    position: str(fd, "position", 20) || null,
    nationality: str(fd, "nationality", 40) || null,
    birth_date: str(fd, "birth_date", 10) || null,
    photo_url: photo || null,
    photo_credit: str(fd, "photo_credit", 200) || null,
    bio: str(fd, "bio", 2000),
    source_name: str(fd, "source_name", 80) || null,
    source_url: sourceUrl || null,
    is_active: fd.get("is_active") === "on",
  };
  if (!row.full_name || !/^[a-z0-9-]{2,80}$/.test(row.slug)) return fail("Ad ve URL adı (ör. ahmet-yilmaz) zorunlu.");
  const id = str(fd, "id", 40);
  const { error } = id && isUuid(id) ? await supabase.from("players").update(row).eq("id", id) : await supabase.from("players").insert(row);
  if (error) return fail(error.code === "23505" ? "Bu URL adı kullanılıyor." : error.message);
  await audit(v.user.id, id ? "player_updated" : "player_created", "player", id || null);
  revalidatePath("/oyuncular");
  return { ok: true, message: "Oyuncu kaydedildi." };
}

export async function savePlayerStatAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const n = (k: string) => Math.max(0, Number(str(fd, k, 6)) || 0);
  const sourceUrl = optUrl(str(fd, "source_url", 500));
  if (sourceUrl === null) return fail("Bağlantı https:// ile başlamalı.");
  const row = {
    player_id: str(fd, "player_id", 40),
    season: str(fd, "season", 9),
    competition: str(fd, "competition", 80),
    appearances: n("appearances"),
    minutes: n("minutes"),
    goals: n("goals"),
    assists: n("assists"),
    yellow_cards: n("yellow_cards"),
    red_cards: n("red_cards"),
    source_name: str(fd, "source_name", 80) || null,
    source_url: sourceUrl || null,
    updated_at: new Date().toISOString(),
  };
  if (!isUuid(row.player_id) || !row.season || !row.competition) return fail("Oyuncu, sezon ve turnuva zorunlu.");
  if (!row.source_name) return fail("İstatistiklerin kaynağı belirtilmeli (uydurma veri girilmez).");
  const { error } = await supabase.from("player_statistics").upsert(row, { onConflict: "player_id,season,competition" });
  if (error) return fail(error.message);
  await audit(v.user.id, "player_stat_saved", "player", row.player_id);
  revalidatePath("/oyuncular");
  return { ok: true, message: "İstatistik kaydedildi." };
}

export async function saveQuizAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const options = [1, 2, 3, 4].map((i) => str(fd, `option${i}`, 120)).filter(Boolean);
  const correct = Number(str(fd, "correct", 1)) - 1;
  const sourceUrl = optUrl(str(fd, "source_url", 500));
  if (options.length < 2 || correct < 0 || correct >= options.length) return fail("En az 2 seçenek ve geçerli doğru cevap gerekli.");
  if (!sourceUrl) return fail("Sorunun doğruluğu için https:// kaynak bağlantısı zorunlu.");
  const { error } = await supabase.from("quizzes").insert({
    quiz_date: str(fd, "quiz_date", 10),
    question: str(fd, "question", 300),
    options,
    correct_index: correct,
    explanation: str(fd, "explanation", 500),
    source_url: sourceUrl,
    created_by: v.user.id,
  });
  if (error) return fail(error.code === "23505" ? "Bu tarih için zaten bir soru var." : error.message);
  await audit(v.user.id, "quiz_created", "quiz", null);
  return { ok: true, message: "Soru eklendi." };
}

export async function saveContentPageAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireRole("editor");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const sources = str(fd, "sources", 4000)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [title, url] = l.split("|").map((x) => x.trim());
      return { title, url };
    })
    .filter((s) => s.title && /^https:\/\//.test(s.url ?? ""));
  const publish = fd.get("is_published") === "on";
  if (publish && sources.length === 0) return fail("Yayınlamak için en az bir kaynak (Başlık | https://...) gerekli.");
  const { error } = await supabase.from("content_pages").upsert({
    slug: str(fd, "slug", 60),
    title: str(fd, "title", 200),
    body: str(fd, "body", 50000),
    sources,
    is_published: publish,
    updated_by: v.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);
  await audit(v.user.id, "content_page_saved", "content_page", str(fd, "slug", 60));
  revalidatePath("/tarihce");
  return { ok: true, message: "Sayfa kaydedildi." };
}

// ============================================================ Gelir yönetimi (SAHİP + 2FA)
export async function updatePremiumPriceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const price = Math.round(Number(str(fd, "price_try", 10).replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(price) || price < 1 || price > 1000) return fail("Fiyat 1 ile 1000 TL arasında olmalı.");
  const { data: cur } = await supabase.from("app_settings").select("value").eq("key", "premium").single();
  const value = { ...(cur?.value as object), price_try: price, tagline: `AMEDSPOR Premium ile reklamları kaldır, taraftar deneyimini kesintisiz yaşa. Aylık yalnızca ${price.toLocaleString("tr-TR")} TL.` };
  const { error, count } = await supabase.from("app_settings").update({ value, updated_by: v.user.id }, { count: "exact" }).eq("key", "premium");
  if (error || !count) return fail("Fiyat güncellenemedi (yetki: sahip + 2FA gerekir).");
  await audit(v.user.id, "premium_price_changed", "settings", "premium", { price });
  revalidatePath("/premium");
  return { ok: true, message: `Yeni fiyat: ${price} TL/ay. Mevcut aboneler mevcut dönemlerini eski fiyattan tamamlar. Ödeme kuruluşu panelindeki plan fiyatını da güncellemeyi unutma.` };
}

export async function updateAdSettingsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const value = sanitizeAdSettings({
    enabled: fd.get("enabled") === "on",
    feed_first_after: Number(str(fd, "feed_first_after", 3)),
    feed_every: Number(str(fd, "feed_every", 3)),
    shorts_every: Number(str(fd, "shorts_every", 3)),
    max_per_page: Number(str(fd, "max_per_page", 2)),
    per_campaign_daily_cap: Number(str(fd, "per_campaign_daily_cap", 2)),
  });
  const { error, count } = await supabase.from("app_settings").update({ value, updated_by: v.user.id }, { count: "exact" }).eq("key", "ads");
  if (error || !count) return fail("Reklam ayarları güncellenemedi.");
  for (const code of ["home_feed", "news_detail", "shorts_feed", "match_center", "player_profile", "community_feed"]) {
    const provider = str(fd, `provider_${code}`, 30);
    const slot = str(fd, `slot_${code}`, 20);
    await supabase
      .from("ad_placements")
      .update({
        enabled: fd.get(`enabled_${code}`) === "on",
        provider: ["direct", "adsense", "direct_then_adsense"].includes(provider) ? provider : "direct",
        adsense_slot_id: /^\d{6,20}$/.test(slot) ? slot : null,
      })
      .eq("code", code);
  }
  await audit(v.user.id, "ad_settings_changed", "settings", "ads", value as unknown as Record<string, unknown>);
  revalidatePath("/", "layout");
  return { ok: true, message: "Reklam ayarları kaydedildi (güvenli aralıklara göre düzenlendi)." };
}

export async function saveCampaignAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const target = str(fd, "target_url", 500);
  const image = optUrl(str(fd, "image_url", 500));
  if (!/^https:\/\//.test(target) || image === null) return fail("Bağlantılar https:// ile başlamalı.");
  const placements = fd.getAll("placement_codes").map(String).filter((c) => ["home_feed", "news_detail", "shorts_feed", "match_center", "player_profile", "community_feed"].includes(c));
  if (!placements.length) return fail("En az bir yerleşim seç.");
  const contract = str(fd, "contract_amount", 12);
  const row = {
    name: str(fd, "name", 120),
    advertiser_name: str(fd, "advertiser_name", 120),
    placement_codes: placements,
    title: str(fd, "title", 90),
    body: str(fd, "body", 200),
    image_url: image || null,
    target_url: target,
    cta_label: str(fd, "cta_label", 24) || "İncele",
    starts_at: new Date(`${str(fd, "starts_at", 10)}T00:00:00+03:00`).toISOString(),
    ends_at: new Date(`${str(fd, "ends_at", 10)}T23:59:59+03:00`).toISOString(),
    is_active: fd.get("is_active") === "on",
    priority: Number(str(fd, "priority", 3)) || 0,
    contract_amount: contract ? Number(contract.replace(",", ".")) : null,
    created_by: v.user.id,
  };
  const { error } = await supabase.from("ad_campaigns").insert(row);
  if (error) return fail(error.message);
  await audit(v.user.id, "campaign_created", "ad_campaign", null, { name: row.name });
  revalidatePath("/admin/reklamlar");
  return { ok: true, message: "Sponsor kampanyası kaydedildi." };
}

export async function toggleCampaignAction(id: string, active: boolean): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !isUuid(id)) return fail(NC);
  await supabase.from("ad_campaigns").update({ is_active: active }).eq("id", id);
  await audit(v.user.id, active ? "campaign_enabled" : "campaign_disabled", "ad_campaign", id);
  revalidatePath("/admin/reklamlar");
  return { ok: true };
}

export async function addRevenueEntryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const provider = str(fd, "provider", 10);
  const status = str(fd, "revenue_status", 10);
  const source = str(fd, "source", 20);
  const amount = Number(str(fd, "amount", 14).replace(",", "."));
  if (!["adsense", "admob", "direct"].includes(provider) || !["estimated", "finalized", "received"].includes(status) || !["provider_api", "provider_report", "contract"].includes(source)) {
    return fail("Geçersiz alanlar.");
  }
  if (!Number.isFinite(amount) || amount < 0) return fail("Tutar geçersiz.");
  const { error } = await supabase.from("ad_revenue_entries").insert({
    provider,
    period_start: str(fd, "period_start", 10),
    period_end: str(fd, "period_end", 10),
    amount,
    impressions: str(fd, "impressions", 12) ? Number(str(fd, "impressions", 12)) : null,
    clicks: str(fd, "clicks", 12) ? Number(str(fd, "clicks", 12)) : null,
    revenue_status: status,
    source,
    notes: str(fd, "notes", 500),
    entered_by: v.user.id,
  });
  if (error) return fail(error.message);
  await audit(v.user.id, "ad_revenue_entry", "finance", null, { provider, amount, status });
  revalidatePath("/admin/gelir");
  return { ok: true, message: "Reklam geliri kaydı eklendi." };
}

export async function addPayoutAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await requireOwnerAal2();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail(NC);
  const amount = Number(str(fd, "amount", 14).replace(",", "."));
  const status = str(fd, "status", 10);
  if (!Number.isFinite(amount) || amount < 0 || !["scheduled", "paid", "failed"].includes(status)) return fail("Geçersiz alanlar.");
  const ref = str(fd, "provider_ref", 100);
  if (status === "paid" && !ref) return fail("Bankaya aktarıldı olarak işaretlemek için ödeme kuruluşu referans numarası zorunlu.");
  const { error } = await supabase.from("payouts").insert({
    provider: str(fd, "provider", 20),
    provider_ref: ref || null,
    amount,
    status,
    expected_date: str(fd, "expected_date", 10) || null,
    paid_at: status === "paid" ? new Date(str(fd, "paid_at", 10) || Date.now()).toISOString() : null,
    source: "provider_report",
    notes: str(fd, "notes", 500),
    entered_by: v.user.id,
  });
  if (error) return fail(error.code === "23505" ? "Bu referans numarası zaten kayıtlı." : error.message);
  await audit(v.user.id, "payout_recorded", "finance", ref || null, { amount, status });
  revalidatePath("/admin/gelir");
  return { ok: true, message: "Aktarım kaydı eklendi." };
}
