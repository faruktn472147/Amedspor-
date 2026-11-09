import { createHash } from "node:crypto";
import { applyPaymentEvent } from "./state";
import {
  WebhookSignatureError,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentRecord,
  type SubscriptionSnapshot,
  type WebhookRequest,
} from "./types";

/** Webhook işlemenin ihtiyaç duyduğu veritabanı işlemleri (test edilebilirlik için soyut). */
export interface PaymentRepository {
  /** Olayı kaydeder. Daha önce kaydedildiyse false döner (tekrar işleme önlenir). */
  recordEvent(input: {
    provider: string;
    eventId: string;
    eventType: string;
    signatureValid: boolean;
    payload: unknown;
  }): Promise<boolean>;
  markEventProcessed(provider: string, eventId: string, result: string): Promise<void>;
  findPaymentByCheckoutToken(token: string): Promise<PaymentRecord | null>;
  findPaymentByProviderRef(provider: string, ref: string): Promise<PaymentRecord | null>;
  findSubscriptionByUser(userId: string): Promise<SubscriptionSnapshot | null>;
  findSubscriptionByProviderRef(provider: string, ref: string): Promise<SubscriptionSnapshot | null>;
  saveSubscription(sub: SubscriptionSnapshot): Promise<SubscriptionSnapshot>;
  updatePayment(id: string, patch: Partial<PaymentRecord>): Promise<void>;
  insertPayment(p: Omit<PaymentRecord, "id">): Promise<PaymentRecord>;
  notify(userId: string, message: string): Promise<void>;
}

export interface WebhookOutcome {
  status: number;
  result: string;
}

function safePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { unparsable: true };
  }
}

/**
 * Ödeme kuruluşu webhook'unu işler.
 *  1. İmza doğrulanır; geçersizse olay reddedilir ve kayıt altına alınır.
 *  2. Olay kimliği tekilse işlenir; aynı olay ikinci kez gelirse yok sayılır.
 *  3. Tutar ve para birimi beklenenle eşleşmezse Premium VERİLMEZ.
 */
export async function processWebhook(
  provider: PaymentProvider,
  req: WebhookRequest,
  repo: PaymentRepository,
  now = new Date(),
): Promise<WebhookOutcome> {
  let event: PaymentEvent;
  try {
    event = await provider.parseWebhook(req, now);
  } catch (e) {
    if (e instanceof WebhookSignatureError) {
      const digest = createHash("sha256").update(req.rawBody).digest("hex").slice(0, 32);
      await repo
        .recordEvent({
          provider: provider.id,
          eventId: `invalid_${digest}`,
          eventType: "invalid_signature",
          signatureValid: false,
          payload: { reason: e.message },
        })
        .catch(() => false);
      return { status: 401, result: "invalid_signature" };
    }
    throw e;
  }

  const fresh = await repo.recordEvent({
    provider: event.provider,
    eventId: event.eventId,
    eventType: event.type,
    signatureValid: true,
    payload: safePayload(req.rawBody),
  });
  if (!fresh) return { status: 200, result: "duplicate_ignored" };

  const finish = async (status: number, result: string): Promise<WebhookOutcome> => {
    await repo.markEventProcessed(event.provider, event.eventId, result);
    return { status, result };
  };

  // İlgili ödemeyi ve aboneliği bul
  let payment: PaymentRecord | null = null;
  if (event.checkoutToken) payment = await repo.findPaymentByCheckoutToken(event.checkoutToken);
  if (!payment && event.providerPaymentRef) {
    payment = await repo.findPaymentByProviderRef(event.provider, event.providerPaymentRef);
  }

  let sub: SubscriptionSnapshot | null = null;
  if (payment?.userId) sub = await repo.findSubscriptionByUser(payment.userId);
  if (!sub && event.providerSubscriptionRef) {
    sub = await repo.findSubscriptionByProviderRef(event.provider, event.providerSubscriptionRef);
  }
  if (!sub) return finish(200, "unknown_subscription");
  if (payment && payment.userId !== sub.userId) return finish(200, "user_mismatch");

  if (event.type === "payment.succeeded") {
    if (!payment) return finish(200, "unknown_payment");
    if (payment.status === "succeeded") return finish(200, "already_succeeded");
    if (payment.status !== "pending") return finish(200, `payment_not_pending:${payment.status}`);
    const expectedAmount = Math.round(payment.amountGross * 100);
    if (event.amount === undefined || Math.round(event.amount * 100) !== expectedAmount) {
      await repo.updatePayment(payment.id, { status: "failed", failureReason: "Tutar uyuşmazlığı" });
      return finish(200, "amount_mismatch");
    }
    if (event.currency && event.currency !== payment.currency) {
      await repo.updatePayment(payment.id, { status: "failed", failureReason: "Para birimi uyuşmazlığı" });
      return finish(200, "currency_mismatch");
    }
  }
  if (event.type === "payment.failed" && payment && payment.status !== "pending") {
    return finish(200, `payment_not_pending:${payment.status}`);
  }

  const t = applyPaymentEvent(sub, payment, event, now);
  const saved = await repo.saveSubscription(t.subscription);

  if (t.createRenewalPayment) {
    await repo.insertPayment({
      userId: saved.userId,
      subscriptionId: saved.id ?? null,
      provider: event.provider,
      providerPaymentRef: event.providerPaymentRef ?? `${event.provider}_${event.eventId}`,
      checkoutToken: null,
      kind: "renewal",
      status: t.payment?.status ?? "pending",
      amountGross: event.amount ?? saved.priceAmount,
      feeAmount: event.fee ?? null,
      currency: event.currency ?? saved.currency,
      periodStart: t.payment?.periodStart ?? null,
      periodEnd: t.payment?.periodEnd ?? null,
      failureReason: t.payment?.failureReason ?? null,
      isTest: !provider.isLive,
      paidAt: t.payment?.paidAt ?? null,
    });
  } else if (t.payment) {
    const target =
      payment ??
      (event.providerPaymentRef ? await repo.findPaymentByProviderRef(event.provider, event.providerPaymentRef) : null);
    if (target) await repo.updatePayment(target.id, { ...t.payment, subscriptionId: saved.id ?? null });
  }

  await repo.notify(saved.userId, t.note);
  return finish(200, t.note);
}
