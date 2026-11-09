"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { moderateText } from "@/lib/moderation";
import { clientIp, rateLimit, str, type ActionResult } from "@/lib/server-utils";
import { safeNext, siteUrl } from "@/lib/utils";
import { getSessionUser } from "@/lib/auth";

const NOT_CONFIGURED = "Üyelik sistemi henüz yapılandırılmadı (Supabase bağlantısı yok).";

const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı.")
  .max(72, "Şifre en fazla 72 karakter olabilir.")
  .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, "Şifre en az bir harf içermeli.")
  .regex(/\d/, "Şifre en az bir rakam içermeli.");

const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_.]{3,24}$/, "Kullanıcı adı 3-24 karakter; yalnızca küçük harf, rakam, nokta ve alt çizgi.");

const signUpSchema = z.object({
  email: z.string().email("Geçerli bir e-posta gir.").max(254),
  password: passwordSchema,
  username: usernameSchema,
  terms: z.literal("on", { message: "Kullanım şartlarını ve KVKK aydınlatma metnini kabul etmelisin." }),
  age: z.literal("on", { message: "Platformu kullanmak için en az 13 yaşında olmalısın." }),
});

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-posta veya şifre hatalı.";
  if (m.includes("email not confirmed")) return "E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Bu e-posta ile kayıtlı bir hesap var.";
  if (m.includes("rate limit") || m.includes("too many")) return "Çok fazla deneme yapıldı. Lütfen biraz bekle.";
  if (m.includes("token has expired") || m.includes("otp") || m.includes("invalid")) return "Kod hatalı veya süresi dolmuş.";
  if (m.includes("weak") || m.includes("pwned")) return "Bu şifre güvenli değil, lütfen daha güçlü bir şifre seç.";
  return "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

export async function signUpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: str(fd, "email", 254).toLowerCase(),
    password: (fd.get("password") as string) ?? "",
    username: str(fd, "username", 24).toLowerCase(),
    terms: fd.get("terms"),
    age: fd.get("age"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { email, password, username } = parsed.data;

  if (moderateText(username, "username").decision !== "allow") {
    return { ok: false, error: "Bu kullanıcı adı topluluk kurallarımıza uygun değil." };
  }
  if (!(await rateLimit(`signup:${await clientIp()}`, 5, 3600))) {
    return { ok: false, error: "Çok fazla kayıt denemesi. Lütfen daha sonra tekrar dene." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return { ok: false, error: "Bu kullanıcı adı alınmış." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, accepted_terms: "true" },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/hosgeldin`,
    },
  });
  if (error) return { ok: false, error: friendly(error.message) };
  redirect(`/dogrula?email=${encodeURIComponent(email)}`);
}

export async function verifyEmailOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email", 254).toLowerCase();
  const token = str(fd, "token", 10).replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { ok: false, error: "E-postana gelen 6 haneli kodu gir." };
  if (!(await rateLimit(`otp:${email}`, 10, 900))) return { ok: false, error: "Çok fazla deneme. 15 dakika sonra tekrar dene." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: friendly(error.message) };
  redirect("/hosgeldin");
}

export async function resendOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email", 254).toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Geçerli bir e-posta gir." };
  if (!(await rateLimit(`resend:${email}`, 3, 3600))) return { ok: false, error: "Kod en fazla saatte 3 kez gönderilebilir." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, message: "Yeni doğrulama kodu e-posta adresine gönderildi." };
}

export async function signInAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email", 254).toLowerCase();
  const password = (fd.get("password") as string) ?? "";
  const next = safeNext(str(fd, "next", 200));
  if (!email || !password) return { ok: false, error: "E-posta ve şifre gerekli." };
  if (!(await rateLimit(`login:${await clientIp()}`, 20, 900))) return { ok: false, error: "Çok fazla giriş denemesi. 15 dakika bekle." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: friendly(error.message) };
  // İki aşamalı doğrulama etkinse ikinci adıma yönlendir
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect(`/giris/iki-adim?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function signInWithGoogleAction(fd: FormData) {
  const supabase = await createSupabaseServerClient();
  const next = safeNext(str(fd, "next", 200));
  if (!supabase) redirect("/giris?hata=yapilandirma");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/giris?hata=google");
  redirect(data.url);
}

export async function requestPasswordResetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email", 254).toLowerCase();
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Geçerli bir e-posta gir." };
  if (!(await rateLimit(`reset:${email}`, 3, 3600))) return { ok: false, error: "Çok fazla istek. Bir saat sonra tekrar dene." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/sifre-yenile` });
  // Hesap var mı yok mu bilgisini sızdırmamak için her durumda aynı mesaj
  redirect(`/sifre-yenile?email=${encodeURIComponent(email)}`);
}

export async function resetPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const pw = passwordSchema.safeParse(fd.get("password"));
  if (!pw.success) return { ok: false, error: pw.error.issues[0].message };
  if (fd.get("password") !== fd.get("password2")) return { ok: false, error: "Şifreler eşleşmiyor." };

  const user = await getSessionUser();
  if (!user) {
    const email = str(fd, "email", 254).toLowerCase();
    const token = str(fd, "token", 10).replace(/\s/g, "");
    if (!email || !/^\d{6,10}$/.test(token)) return { ok: false, error: "E-posta ve 6 haneli kod gerekli." };
    if (!(await rateLimit(`resetotp:${email}`, 10, 900))) return { ok: false, error: "Çok fazla deneme." };
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (error) return { ok: false, error: friendly(error.message) };
  }
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { ok: false, error: friendly(error.message) };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Şifren güncellendi. Diğer cihazlardaki oturumlar kapatıldı." };
}

export async function signOutAction(fd: FormData) {
  const scope = fd.get("scope") === "global" ? "global" : fd.get("scope") === "others" ? "others" : "local";
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope });
  redirect(scope === "others" ? "/ayarlar/guvenlik?cikis=diger" : "/");
}

export async function verifyMfaAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const code = str(fd, "code", 6);
  const next = safeNext(str(fd, "next", 200));
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Doğrulama uygulamasındaki 6 haneli kodu gir." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "Kayıtlı doğrulama uygulaması bulunamadı." };
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (chErr || !ch) return { ok: false, error: "Doğrulama başlatılamadı." };
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code });
  if (error) return { ok: false, error: "Kod hatalı." };
  redirect(next);
}
