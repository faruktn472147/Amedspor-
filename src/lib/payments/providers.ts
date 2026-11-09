import { z } from "zod";
import { TEST_SIGNATURE_HEADER, verifySignature } from "./signature";
import {
  ProviderNotConfiguredError,
  WebhookSignatureError,
  type CheckoutInput,
  type CheckoutResult,
  type PaymentEvent,
  type PaymentProvider,
  type ProviderId,
  type WebhookRequest,
} from "./types";

const testEventSchema = z.object({
  id: z.string().min(8).max(100),
  type: z.enum([
    "payment.succeeded",
    "payment.failed",
    "subscription.renewed",
    "subscription.renewal_failed",
    "subscription.canceled",
    "payment.refunded",
  ]),
  created: z.number().int(),
  data: z.object({
    checkout_token: z.string().max(100).optional(),
    payment_ref: z.string().max(100).optional(),
    subscription_ref: z.string().max(100).optional(),
    customer_ref: z.string().max(100).optional(),
    amount: z.number().nonnegative().optional(),
    fee: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).optional(),
    failure_reason: z.string().max(200).optional(),
  }),
});

/**
 * TEST MODU sağlayıcısı. Gerçek para tahsil ETMEZ.
 * Webhook'lar gerçek bir ödeme kuruluşunda olduğu gibi HMAC-SHA256 ile imzalanır ve
 * doğrulanır; böylece canlı sisteme geçmeden tüm akış uçtan uca test edilebilir.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id: ProviderId = "test";
  readonly isLive = false;
  constructor(private readonly secret: string, private readonly siteUrl: string) {
    if (!secret || secret.length < 32) {
      throw new ProviderNotConfiguredError("PAYMENT_TEST_WEBHOOK_SECRET en az 32 karakter olmalı");
    }
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const url = new URL("/premium/test-odeme", this.siteUrl);
    url.searchParams.set("token", input.checkoutToken);
    return { redirectUrl: url.pathname + url.search, providerPaymentRef: `test_pay_${input.checkoutToken}` };
  }

  async parseWebhook(req: WebhookRequest, now = new Date()): Promise<PaymentEvent> {
    const v = verifySignature(this.secret, req.rawBody, req.headers.get(TEST_SIGNATURE_HEADER), now);
    if (!v.ok) throw new WebhookSignatureError(`İmza doğrulanamadı: ${v.reason}`);
    let json: unknown;
    try {
      json = JSON.parse(req.rawBody);
    } catch {
      throw new WebhookSignatureError("Geçersiz JSON");
    }
    const parsed = testEventSchema.safeParse(json);
    if (!parsed.success) throw new WebhookSignatureError("Geçersiz olay biçimi");
    const e = parsed.data;
    return {
      provider: "test",
      eventId: e.id,
      type: e.type,
      occurredAt: new Date(e.created * 1000),
      checkoutToken: e.data.checkout_token,
      providerPaymentRef: e.data.payment_ref,
      providerSubscriptionRef: e.data.subscription_ref,
      providerCustomerRef: e.data.customer_ref,
      amount: e.data.amount,
      fee: e.data.fee ?? null,
      currency: e.data.currency,
      failureReason: e.data.failure_reason,
    };
  }

  async cancelSubscription(): Promise<void> {
    // Test modunda karşı tarafta iptal edilecek gerçek bir abonelik yoktur.
  }
}

/**
 * iyzico adaptörü — HENÜZ BAĞLI DEĞİL.
 *
 * iyzico'nun abonelik API'si (checkout form, IYZWSv2 kimlik doğrulama, X-IYZ-SIGNATURE-V3
 * webhook imzası) resmî dokümandan doğrulanmadan kodlanmamıştır; tahmini bir imza formülü
 * sahte ödemelerin kabul edilmesine yol açabilir. Üye işyeri hesabı açıldığında ve
 * sandbox anahtarları alındığında bu sınıf docs/ODEME-VE-GELIR.md'deki adımlarla
 * tamamlanmalıdır.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly id: ProviderId = "iyzico";
  readonly isLive = true;
  private fail(): never {
    throw new ProviderNotConfiguredError(
      "iyzico entegrasyonu henüz etkin değil. Üye işyeri başvurusu ve resmî doküman doğrulaması gerekiyor.",
    );
  }
  async createCheckout(): Promise<CheckoutResult> {
    this.fail();
  }
  async parseWebhook(): Promise<PaymentEvent> {
    throw new WebhookSignatureError("iyzico webhook doğrulaması henüz etkin değil");
  }
  async cancelSubscription(): Promise<void> {
    this.fail();
  }
}

export interface PaymentConfig {
  provider: string | undefined;
  testSecret: string | undefined;
  siteUrl: string;
  nodeEnv: string | undefined;
  allowTestInProduction: boolean;
}

export type ProviderAvailability =
  | { available: true; provider: PaymentProvider }
  | { available: false; reason: string };

/**
 * Aktif ödeme sağlayıcısını döndürür. Test modu, canlı ortamda açıkça izin
 * verilmedikçe KAPALIDIR — aksi halde herkes ücretsiz Premium alabilirdi.
 */
export function resolveProvider(cfg: PaymentConfig): ProviderAvailability {
  const id = (cfg.provider ?? "").toLowerCase();
  if (!id || id === "none") return { available: false, reason: "Ödeme sistemi henüz yapılandırılmadı." };
  if (id === "test") {
    if (cfg.nodeEnv === "production" && !cfg.allowTestInProduction) {
      return { available: false, reason: "Ödeme sistemi henüz canlıya alınmadı." };
    }
    try {
      return { available: true, provider: new TestPaymentProvider(cfg.testSecret ?? "", cfg.siteUrl) };
    } catch (e) {
      return { available: false, reason: (e as Error).message };
    }
  }
  if (id === "iyzico") {
    return { available: false, reason: "iyzico entegrasyonu henüz etkin değil." };
  }
  return { available: false, reason: `Bilinmeyen ödeme sağlayıcısı: ${id}` };
}

export function paymentConfigFromEnv(): PaymentConfig {
  return {
    provider: process.env.PAYMENT_PROVIDER,
    testSecret: process.env.PAYMENT_TEST_WEBHOOK_SECRET,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV,
    allowTestInProduction: process.env.ALLOW_TEST_PAYMENTS === "true",
  };
}

export function getProviderById(id: string): PaymentProvider | null {
  if (id === "iyzico") return new IyzicoPaymentProvider();
  if (id === "test") {
    const r = resolveProvider({ ...paymentConfigFromEnv(), provider: "test" });
    return r.available ? r.provider : null;
  }
  return null;
}
