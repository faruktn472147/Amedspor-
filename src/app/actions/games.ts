"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, isUuid, type ActionResult } from "@/lib/server-utils";

export async function savePredictionAction(
  matchId: string,
  home: number,
  away: number,
  firstScorerId: string | null,
  motmId: string | null,
): Promise<ActionResult> {
  const viewer = await requireViewer("/tahminler");
  if (!isUuid(matchId)) return fail("Geçersiz maç.");
  if (![home, away].every((n) => Number.isInteger(n) && n >= 0 && n <= 20)) return fail("Skor 0-20 arasında olmalı.");
  if ((firstScorerId && !isUuid(firstScorerId)) || (motmId && !isUuid(motmId))) return fail("Geçersiz oyuncu.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Veritabanı bağlantısı yapılandırılmadı.");
  const row = { match_id: matchId, user_id: viewer.user.id, home_score: home, away_score: away, first_scorer_id: firstScorerId, motm_player_id: motmId };
  const { data: existing } = await supabase.from("predictions").select("id").eq("match_id", matchId).eq("user_id", viewer.user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("predictions").update({ home_score: home, away_score: away, first_scorer_id: firstScorerId, motm_player_id: motmId }).eq("id", existing.id)
    : await supabase.from("predictions").insert(row);
  if (error) return fail(error.message.includes("süresi doldu") ? "Maç başladığı için tahmin süresi doldu." : "Tahmin kaydedilemedi.");
  revalidatePath("/tahminler");
  return { ok: true, message: "Tahminin kaydedildi. Maç başlayana kadar değiştirebilirsin." };
}

export async function answerQuizAction(quizId: string, answer: number): Promise<ActionResult<{ correct: boolean }>> {
  await requireViewer("/tahminler");
  if (!isUuid(quizId) || !Number.isInteger(answer) || answer < 0 || answer > 5) return fail("Geçersiz cevap.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Veritabanı bağlantısı yapılandırılmadı.");
  const { data, error } = await supabase.rpc("answer_quiz", { p_quiz_id: quizId, p_answer: answer });
  if (error) return fail(error.code === "23505" ? "Bu soruyu zaten cevapladın." : "Cevap kaydedilemedi.");
  revalidatePath("/tahminler");
  return { ok: true, data: { correct: data === true } };
}

export async function ratePlayerAction(matchId: string, playerId: string, rating: number): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isUuid(matchId) || !isUuid(playerId) || !Number.isInteger(rating) || rating < 1 || rating > 10) return fail("Geçersiz puan.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Veritabanı bağlantısı yapılandırılmadı.");
  const { error } = await supabase.from("player_ratings").insert({ match_id: matchId, player_id: playerId, user_id: viewer.user.id, rating });
  if (error) return fail(error.code === "23505" ? "Bu oyuncuyu bu maç için zaten puanladın." : "Puan yalnızca maç başladıktan sonra verilebilir.");
  revalidatePath(`/maclar/${matchId}`);
  return { ok: true, message: "Puanın kaydedildi." };
}
