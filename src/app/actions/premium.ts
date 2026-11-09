"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPublicSettings } from "@/lib/data/content";
import { getProviderById, paymentConfigFromEnv, resolveProvider } from "@/lib/payments/providers";
import { cancelByUser, isPremiumActive } from "@/lib/payments/state";
import { signPayload, TEST_SIGNATURE_HEADER } from "@/lib/payments/signature";
import { processWebhook } from "@/lib/payments/webhook";
import { SupabasePaymentRepository, subscriptionToRow } from "@/lib/payments/repo-supabase";
import { audit, fail, rateLimit, type ActionResult } from "@/lib/server-utils";

export async function startCheckoutAction(): Promise<ActionResult> {
  const viewer = await requireViewer("/premium");
  const availability = resolveProvider(paymentConfigFromEnv());
  if (!availability.available) return fail(availability.reason);
  const provider = availability.provider;
  const admin = getSupabaseAdmin();
  if (!admin) return fail("Veritabanı bağlantısı yapılandırılmadı.");
  if (!(await rateLimit(`checkout:${viewer.user.id}`, 5, 600))) return fail("Çok fazla ödeme denemesi. Lütfen biraz bekle.");

  const repo = new SupabasePaymentRepository(admin);
  const existing = await repo.findSubscriptionByUser(viewer.user.id);
  if (existing && isPremiumActive(existing) && !existing.cancelAtPeriodEnd) {
    return fail("Premium üyeliğin zaten aktif.");
  }

  const { premium } = await getPublicSettings();
  const price = Number(premium.price_try);
  if (!Number.isFinite(price) || price <= 0) return fail("Premium fiyatı tanımlı değil.");

  // Abonelik kaydı: kalan ödenmiş süre varsa korunur, yoksa "ödeme bekleniyor".
  const sub = await repo.saveSubscription({
    ...(existing ?? {
      userId: viewer.user.id,
      providerSubscriptionRef: null,
      providerCustomerRef: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      canceledAt: null,
    }),
    userId: viewer.user.id,
    provider: provider.id,
    priceAmount: price,
    currency: "TRY",
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
    status: existing && isPremiumActive(existing) ? existing.status : "pending_payment",
    providerSubscriptionRef: existing?.providerSubscriptionRef ?? (provider.isLive ? null : `test_sub_${randomUUID()}`),
  });

  const checkoutToken = randomBytes(24).toString("hex");
  const checkout = await provider.createCheckout({
    userId: viewer.user.id,
    email: viewer.user.email ?? "",
    amount: price,
    currency: "TRY",
    checkoutToken,
    callbackUrl: "/premium?durum=sonuc",
  });
  await repo.insertPayment({
    userId: viewer.user.id,
    subscriptionId: sub.id ?? null,
    provider: provider.id,
    providerPaymentRef: checkout.providerPaymentRef ?? null,
    checkoutToken,
    kind: "initial",
    status: "pending",
    amountGross: price,
    feeAmount: null,
    currency: "TRY",
    periodStart: null,
    periodEnd: null,
    failureReason: null,
    isTest: !provider.isLive,
    paidAt: null,
  });
  redirect(checkout.redirectUrl);
}

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const viewer = await requireViewer("/premium");
  const admin = getSupabaseAdmin();
  if (!admin) return fail("Veritabanı bağlantısı yapılandırılmadı.");
  const repo = new SupabasePaymentRepository(admin);
  const sub = await repo.findSubscriptionByUser(viewer.user.id);
  if (!sub || !["active", "renewal_pending", "pending_payment"].includes(sub.status)) return fail("İptal edilecek aktif bir abonelik yok.");
  const provider = getProviderById(sub.provider);
  if (sub.providerSubscriptionRef && provider) {
    try {
      await provider.cancelSubscription(sub.providerSubscriptionRef);
    } catch (e) {
      return fail(`İptal ödeme kuruluşuna iletilemedi: ${(e as Error).message}`);
    }
  }
  const next = cancelByUser(sub);
  await admin.from("subscriptions").update(subscriptionToRow(next)).eq("user_id", viewer.user.id);
  await audit(viewer.user.id, "subscription_canceled_by_user", "subscription", sub.id ?? null);
  revalidatePath("/", "layout");
  const until = next.currentPeriodEnd && isPremiumActive(next) ? next.currentPeriodEnd.toLocaleDateString("tr-TR") : null;
  return {
    ok: true,
    message: until
      ? `Aboneliğin iptal edildi. Ödediğin dönem sonuna (${until}) kadar Premium devam eder; sonrasında ücret alınmaz.`
      : "Aboneliğin iptal edildi.",
  };
}

/**
 * YALNIZCA TEST MODU: ödeme kuruluşunun göndereceği webhook'u, gerçek imza ile üretip
 * aynı doğrulama kodundan geçirir. Canlı ortamda test sağlayıcı kapalı olduğu için çalışmaz.
 */
export async function simulateTestPaymentAction(token: string, outcome: "success" | "failure"): Promise<ActionResult> {
  const viewer = await requireViewer("/premium");
  const availability = resolveProvider(paymentConfigFromEnv());
  if (!availability.available || availability.provider.id !== "test") return fail("Test ödeme modu kapalı.");
  const admin = getSupabaseAdmin();
  if (!admin || !/^[0-9a-f]{48}$/.test(token)) return fail("Geçersiz istek.");
  const repo = new SupabasePaymentRepository(admin);
  const payment = await repo.findPaymentByCheckoutToken(token);
  if (!payment || payment.userId !== viewer.user.id) return fail("Bu ödeme oturumu sana ait değil.");
  if (payment.status !== "pending") return fail("Bu ödeme oturumu zaten tamamlandı.");

  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: outcome === "success" ? "payment.succeeded" : "payment.failed",
    created: Math.floor(Date.now() / 1000),
    data: {
      checkout_token: token,
      payment_ref: payment.providerPaymentRef ?? undefined,
      amount: payment.amountGross,
      currency: payment.currency,
      fee: null,
      failure_reason: outcome === "failure" ? "Test: kart reddedildi" : undefined,
    },
  });
  const secret = process.env.PAYMENT_TEST_WEBHOOK_SECRET ?? "";
  const headers = new Headers({ [TEST_SIGNATURE_HEADER]: signPayload(secret, body) });
  const result = await processWebhook(availability.provider, { rawBody: body, headers }, repo);
  revalidatePath("/", "layout");
  if (result.status !== 200) return fail("Webhook doğrulanamadı.");
  redirect(`/premium?durum=${outcome === "success" ? "basarili" : "basarisiz"}`);
}
