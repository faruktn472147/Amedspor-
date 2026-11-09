export type SubscriptionStatus =
  | "active"
  | "pending_payment"
  | "payment_failed"
  | "canceled"
  | "expired"
  | "renewal_pending";

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Aktif",
  pending_payment: "Ödeme bekleniyor",
  payment_failed: "Ödeme başarısız",
  canceled: "İptal edildi",
  expired: "Süresi doldu",
  renewal_pending: "Yenileme bekleniyor",
};

export type ProviderId = "test" | "iyzico" | "paytr";

export interface SubscriptionSnapshot {
  id?: string;
  userId: string;
  status: SubscriptionStatus;
  provider: ProviderId;
  providerSubscriptionRef: string | null;
  providerCustomerRef: string | null;
  priceAmount: number;
  currency: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "canceled";

export interface PaymentRecord {
  id: string;
  userId: string | null;
  subscriptionId: string | null;
  provider: ProviderId;
  providerPaymentRef: string | null;
  checkoutToken: string | null;
  kind: "initial" | "renewal" | "refund";
  status: PaymentStatus;
  amountGross: number;
  feeAmount: number | null;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  failureReason: string | null;
  isTest: boolean;
  paidAt: Date | null;
}

export type PaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.renewed"
  | "subscription.renewal_failed"
  | "subscription.canceled"
  | "payment.refunded";

/** Ödeme kuruluşundan gelen, imzası doğrulanmış ve normalize edilmiş olay. */
export interface PaymentEvent {
  provider: ProviderId;
  eventId: string;
  type: PaymentEventType;
  occurredAt: Date;
  checkoutToken?: string;
  providerPaymentRef?: string;
  providerSubscriptionRef?: string;
  providerCustomerRef?: string;
  amount?: number;
  /** Ödeme kuruluşunun bildirdiği komisyon (bilinmiyorsa null) */
  fee?: number | null;
  currency?: string;
  failureReason?: string;
}

export interface CheckoutInput {
  userId: string;
  email: string;
  amount: number;
  currency: "TRY";
  checkoutToken: string;
  callbackUrl: string;
}

export interface CheckoutResult {
  redirectUrl: string;
  providerPaymentRef?: string;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
}

export class WebhookSignatureError extends Error {
  constructor(message = "Geçersiz webhook imzası") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Gerçek para tahsil ediyor mu? Test modunda false. */
  readonly isLive: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** İmzayı doğrular; geçersizse WebhookSignatureError fırlatır. */
  parseWebhook(req: WebhookRequest, now?: Date): Promise<PaymentEvent>;
  cancelSubscription(providerSubscriptionRef: string): Promise<void>;
}
