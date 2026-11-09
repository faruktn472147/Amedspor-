/**
 * Premium abonelik ve ödeme webhook senaryoları (test modu sağlayıcısı ile).
 * Gerçek imza doğrulama kodu kullanılır; yalnızca veritabanı bellek içi taklittir.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { TestPaymentProvider, resolveProvider } from "@/lib/payments/providers";
import { signPayload, TEST_SIGNATURE_HEADER } from "@/lib/payments/signature";
import { addMonths, cancelByUser, isPremiumActive } from "@/lib/payments/state";
import { processWebhook, type PaymentRepository } from "@/lib/payments/webhook";
import type { PaymentRecord, SubscriptionSnapshot } from "@/lib/payments/types";

const SECRET = "test_secret_".padEnd(40, "x");

class MemoryRepo implements PaymentRepository {
  events = new Map<string, { result?: string; signatureValid: boolean }>();
  payments = new Map<string, PaymentRecord>();
  subs = new Map<string, SubscriptionSnapshot>();
  notes: string[] = [];
  async recordEvent(i: { provider: string; eventId: string; signatureValid: boolean }) {
    const k = `${i.provider}:${i.eventId}`;
    if (this.events.has(k)) return false;
    this.events.set(k, { signatureValid: i.signatureValid });
    return true;
  }
  async markEventProcessed(p: string, id: string, result: string) {
    const e = this.events.get(`${p}:${id}`);
    if (e) e.result = result;
  }
  async findPaymentByCheckoutToken(t: string) {
    return [...this.payments.values()].find((p) => p.checkoutToken === t) ?? null;
  }
  async findPaymentByProviderRef(provider: string, ref: string) {
    return [...this.payments.values()].find((p) => p.provider === provider && p.providerPaymentRef === ref) ?? null;
  }
  async findSubscriptionByUser(u: string) {
    return this.subs.get(u) ?? null;
  }
  async findSubscriptionByProviderRef(provider: string, ref: string) {
    return [...this.subs.values()].find((s) => s.provider === provider && s.providerSubscriptionRef === ref) ?? null;
  }
  async saveSubscription(s: SubscriptionSnapshot) {
    const saved = { ...s, id: s.id ?? randomUUID() };
    this.subs.set(s.userId, saved);
    return saved;
  }
  async updatePayment(id: string, patch: Partial<PaymentRecord>) {
    const p = this.payments.get(id);
    if (p) this.payments.set(id, { ...p, ...patch });
  }
  async insertPayment(p: Omit<PaymentRecord, "id">) {
    const rec = { ...p, id: randomUUID() };
    this.payments.set(rec.id, rec);
    return rec;
  }
  async notify(_u: string, m: string) {
    this.notes.push(m);
  }
}

const provider = new TestPaymentProvider(SECRET, "http://localhost:3000");

function startCheckout(repo: MemoryRepo, userId: string, amount = 10) {
  const token = `chk_${randomUUID()}`;
  const id = randomUUID();
  repo.payments.set(id, {
    id,
    userId,
    subscriptionId: null,
    provider: "test",
    providerPaymentRef: `test_pay_${token}`,
    checkoutToken: token,
    kind: "initial",
    status: "pending",
    amountGross: amount,
    feeAmount: null,
    currency: "TRY",
    periodStart: null,
    periodEnd: null,
    failureReason: null,
    isTest: true,
    paidAt: null,
  });
  const existing = repo.subs.get(userId);
  repo.subs.set(userId, {
    ...(existing ?? {
      id: randomUUID(),
      userId,
      provider: "test",
      providerSubscriptionRef: `test_sub_${userId}`,
      providerCustomerRef: null,
      priceAmount: amount,
      currency: "TRY",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }),
    status: existing && isPremiumActive(existing) ? existing.status : "pending_payment",
  } as SubscriptionSnapshot);
  return token;
}

function event(type: string, data: Record<string, unknown>, now: Date, id = `evt_${randomUUID()}`) {
  const body = JSON.stringify({ id, type, created: Math.floor(now.getTime() / 1000), data });
  return { body, id };
}

async function send(repo: MemoryRepo, body: string, now: Date, secret = SECRET) {
  const headers = new Headers({ [TEST_SIGNATURE_HEADER]: signPayload(secret, body, Math.floor(now.getTime() / 1000)) });
  return processWebhook(provider, { rawBody: body, headers }, repo, now);
}

describe("Premium abonelik senaryoları", () => {
  let repo: MemoryRepo;
  const user = randomUUID();
  const now = new Date("2026-11-09T12:00:00Z");
  beforeEach(() => {
    repo = new MemoryRepo();
  });

  it("1-4: ücretsiz kullanıcı Premium değildir; başarılı ödeme sonrası Premium olur", async () => {
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(false);
    const token = startCheckout(repo, user);
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(false); // ödeme bekleniyor ≠ Premium
    const { body } = event("payment.succeeded", { checkout_token: token, amount: 10, currency: "TRY", fee: 0.6 }, now);
    const r = await send(repo, body, now);
    expect(r.status).toBe(200);
    const sub = repo.subs.get(user)!;
    expect(sub.status).toBe("active");
    expect(isPremiumActive(sub, now)).toBe(true);
    expect(sub.currentPeriodEnd?.toISOString()).toBe(addMonths(now, 1).toISOString());
    const pay = [...repo.payments.values()][0];
    expect(pay.status).toBe("succeeded");
    expect(pay.feeAmount).toBe(0.6);
  });

  it("6: süresi dolunca Premium otomatik biter", async () => {
    const token = startCheckout(repo, user);
    await send(repo, event("payment.succeeded", { checkout_token: token, amount: 10 }, now).body, now);
    const later = addMonths(now, 1);
    expect(isPremiumActive(repo.subs.get(user), new Date(later.getTime() + 1000))).toBe(false);
  });

  it("7: iptal edilince ödenmiş dönem sonuna kadar Premium sürer, sonra biter", async () => {
    const token = startCheckout(repo, user);
    await send(repo, event("payment.succeeded", { checkout_token: token, amount: 10 }, now).body, now);
    const canceled = cancelByUser(repo.subs.get(user)!, now);
    expect(canceled.status).toBe("canceled");
    expect(isPremiumActive(canceled, new Date(now.getTime() + 86400000))).toBe(true);
    expect(isPremiumActive(canceled, new Date(addMonths(now, 1).getTime() + 1))).toBe(false);
  });

  it("8: ödeme başarısız olursa Premium verilmez", async () => {
    const token = startCheckout(repo, user);
    await send(repo, event("payment.failed", { checkout_token: token, failure_reason: "Kart reddedildi" }, now).body, now);
    const sub = repo.subs.get(user)!;
    expect(sub.status).toBe("payment_failed");
    expect(isPremiumActive(sub, now)).toBe(false);
    expect([...repo.payments.values()][0].status).toBe("failed");
  });

  it("9: başarısızlık sonrası tekrar satın alınabilir", async () => {
    const t1 = startCheckout(repo, user);
    await send(repo, event("payment.failed", { checkout_token: t1 }, now).body, now);
    const t2 = startCheckout(repo, user);
    await send(repo, event("payment.succeeded", { checkout_token: t2, amount: 10 }, now).body, now);
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(true);
  });

  it("10: sahte (imzasız / yanlış anahtarla imzalı / eski) bildirim reddedilir", async () => {
    const token = startCheckout(repo, user);
    const { body } = event("payment.succeeded", { checkout_token: token, amount: 10 }, now);
    const noSig = await processWebhook(provider, { rawBody: body, headers: new Headers() }, repo, now);
    expect(noSig.status).toBe(401);
    const wrong = await send(repo, body, now, "baska_bir_anahtar".padEnd(40, "y"));
    expect(wrong.status).toBe(401);
    const old = new Date(now.getTime() - 10 * 60 * 1000);
    const headers = new Headers({ [TEST_SIGNATURE_HEADER]: signPayload(SECRET, body, Math.floor(old.getTime() / 1000)) });
    expect((await processWebhook(provider, { rawBody: body, headers }, repo, now)).status).toBe(401);
    // Gövde değiştirilmişse
    const tampered = body.replace('"amount":10', '"amount":1');
    const h2 = new Headers({ [TEST_SIGNATURE_HEADER]: signPayload(SECRET, body, Math.floor(now.getTime() / 1000)) });
    expect((await processWebhook(provider, { rawBody: tampered, headers: h2 }, repo, now)).status).toBe(401);
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(false);
  });

  it("aynı ödeme bildirimi iki kez gelirse bir kez işlenir", async () => {
    const token = startCheckout(repo, user);
    const { body } = event("payment.succeeded", { checkout_token: token, amount: 10 }, now, "evt_tekil_123");
    await send(repo, body, now);
    const end1 = repo.subs.get(user)!.currentPeriodEnd!.getTime();
    const second = await send(repo, body, now);
    expect(second.result).toBe("duplicate_ignored");
    expect(repo.subs.get(user)!.currentPeriodEnd!.getTime()).toBe(end1);
  });

  it("tutar uyuşmazsa Premium verilmez", async () => {
    const token = startCheckout(repo, user, 10);
    const r = await send(repo, event("payment.succeeded", { checkout_token: token, amount: 1 }, now).body, now);
    expect(r.result).toBe("amount_mismatch");
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(false);
  });

  it("11: bir kullanıcının ödemesi başka kullanıcıya Premium vermez", async () => {
    const other = randomUUID();
    const token = startCheckout(repo, user);
    startCheckout(repo, other);
    await send(repo, event("payment.succeeded", { checkout_token: token, amount: 10 }, now).body, now);
    expect(isPremiumActive(repo.subs.get(user), now)).toBe(true);
    expect(isPremiumActive(repo.subs.get(other), now)).toBe(false);
  });

  it("yenileme dönemi uzatır; yenileme başarısızsa Premium biter", async () => {
    const token = startCheckout(repo, user);
    await send(repo, event("payment.succeeded", { checkout_token: token, amount: 10 }, now).body, now);
    const ref = repo.subs.get(user)!.providerSubscriptionRef!;
    const renewAt = addMonths(now, 1);
    await send(repo, event("subscription.renewed", { subscription_ref: ref, amount: 10, payment_ref: "r1" }, renewAt).body, renewAt);
    expect(repo.subs.get(user)!.currentPeriodEnd!.toISOString()).toBe(addMonths(now, 2).toISOString());
    expect([...repo.payments.values()].filter((p) => p.kind === "renewal")).toHaveLength(1);
    const failAt = addMonths(now, 2);
    await send(repo, event("subscription.renewal_failed", { subscription_ref: ref, payment_ref: "r2" }, failAt).body, failAt);
    expect(isPremiumActive(repo.subs.get(user), failAt)).toBe(false);
  });

  it("iade Premium hakkını derhal sonlandırır", async () => {
    const token = startCheckout(repo, user);
    await send(repo, event("payment.succeeded", { checkout_token: token, amount: 10 }, now).body, now);
    const pay = [...repo.payments.values()][0];
    const later = new Date(now.getTime() + 3600000);
    await send(repo, event("payment.refunded", { payment_ref: pay.providerPaymentRef }, later).body, later);
    expect(isPremiumActive(repo.subs.get(user), later)).toBe(false);
    expect(repo.payments.get(pay.id)!.status).toBe("refunded");
  });
});

describe("ödeme sağlayıcı seçimi", () => {
  it("test modu canlı ortamda açıkça izin verilmedikçe kapalıdır", () => {
    const base = { provider: "test", testSecret: SECRET, siteUrl: "https://x.test", allowTestInProduction: false };
    expect(resolveProvider({ ...base, nodeEnv: "production" }).available).toBe(false);
    expect(resolveProvider({ ...base, nodeEnv: "development" }).available).toBe(true);
  });
  it("sağlayıcı yoksa ödeme kapalı görünür (sahte ödeme yok)", () => {
    const r = resolveProvider({ provider: undefined, testSecret: "", siteUrl: "", nodeEnv: "production", allowTestInProduction: false });
    expect(r.available).toBe(false);
  });
  it("iyzico henüz bağlı değil olarak döner", () => {
    const r = resolveProvider({ provider: "iyzico", testSecret: "", siteUrl: "", nodeEnv: "production", allowTestInProduction: false });
    expect(r.available).toBe(false);
  });
  it("kısa test anahtarı kabul edilmez", () => {
    expect(resolveProvider({ provider: "test", testSecret: "kisa", siteUrl: "", nodeEnv: "development", allowTestInProduction: false }).available).toBe(false);
  });
});

describe("tarih hesabı", () => {
  it("ay sonu taşmalarını doğru kırpar", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });
});
