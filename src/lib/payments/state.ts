import type { PaymentEvent, PaymentRecord, SubscriptionSnapshot } from "./types";

/** Takvim ayı ekler; ay sonu taşmalarını kırpar (31 Ocak + 1 ay = 28/29 Şubat). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Abonelik Premium hakkı veriyor mu? (veritabanındaki is_premium ile aynı kural) */
export function isPremiumActive(sub: SubscriptionSnapshot | null | undefined, now = new Date()): boolean {
  if (!sub || !sub.currentPeriodEnd) return false;
  if (!["active", "canceled", "renewal_pending"].includes(sub.status)) return false;
  return sub.currentPeriodEnd.getTime() > now.getTime();
}

export interface TransitionResult {
  subscription: SubscriptionSnapshot;
  payment: Partial<PaymentRecord> | null;
  /** Bu olay için yeni bir yenileme ödeme kaydı oluşturulmalı mı? */
  createRenewalPayment: boolean;
  note: string;
}

/**
 * Doğrulanmış bir ödeme olayını aboneliğe uygular. Saf fonksiyondur; veritabanı
 * yazımı çağıran tarafta yapılır. Kurallar:
 *  - Ödeme başarılı olmadan Premium verilmez.
 *  - Yeni dönem, kalan ödenmiş süre varsa onun sonundan başlar (çift ödeme haksızlığı olmaz).
 *  - İade, Premium hakkını derhal sonlandırır.
 */
export function applyPaymentEvent(
  current: SubscriptionSnapshot,
  payment: PaymentRecord | null,
  event: PaymentEvent,
  now = new Date(),
): TransitionResult {
  const sub: SubscriptionSnapshot = { ...current };
  switch (event.type) {
    case "payment.succeeded": {
      const remaining = sub.currentPeriodEnd && sub.currentPeriodEnd > now && isPremiumActive(sub, now);
      const start = remaining ? (sub.currentPeriodEnd as Date) : now;
      const end = addMonths(start, 1);
      sub.status = "active";
      sub.currentPeriodStart = start;
      sub.currentPeriodEnd = end;
      sub.cancelAtPeriodEnd = false;
      sub.canceledAt = null;
      if (event.providerSubscriptionRef) sub.providerSubscriptionRef = event.providerSubscriptionRef;
      if (event.providerCustomerRef) sub.providerCustomerRef = event.providerCustomerRef;
      return {
        subscription: sub,
        payment: {
          status: "succeeded",
          paidAt: event.occurredAt,
          periodStart: start,
          periodEnd: end,
          providerPaymentRef: event.providerPaymentRef ?? payment?.providerPaymentRef ?? null,
          feeAmount: event.fee ?? null,
        },
        createRenewalPayment: false,
        note: "Premium etkinleştirildi",
      };
    }
    case "payment.failed": {
      if (sub.status === "pending_payment" || sub.status === "payment_failed" || sub.status === "expired") {
        sub.status = isPremiumActive(current, now) ? current.status : "payment_failed";
      }
      return {
        subscription: sub,
        payment: { status: "failed", failureReason: event.failureReason ?? "Ödeme reddedildi" },
        createRenewalPayment: false,
        note: "Ödeme başarısız; Premium verilmedi",
      };
    }
    case "subscription.renewed": {
      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const end = addMonths(base, 1);
      sub.status = "active";
      sub.currentPeriodStart = base;
      sub.currentPeriodEnd = end;
      sub.cancelAtPeriodEnd = false;
      return {
        subscription: sub,
        payment: {
          status: "succeeded",
          paidAt: event.occurredAt,
          periodStart: base,
          periodEnd: end,
          providerPaymentRef: event.providerPaymentRef ?? null,
          feeAmount: event.fee ?? null,
        },
        createRenewalPayment: true,
        note: "Abonelik yenilendi",
      };
    }
    case "subscription.renewal_failed": {
      sub.status = "payment_failed";
      return {
        subscription: sub,
        payment: { status: "failed", failureReason: event.failureReason ?? "Yenileme tahsil edilemedi" },
        createRenewalPayment: true,
        note: "Yenileme başarısız; Premium sona erdi",
      };
    }
    case "subscription.canceled": {
      if (sub.status !== "expired") {
        sub.status = "canceled";
        sub.cancelAtPeriodEnd = true;
        sub.canceledAt = sub.canceledAt ?? now;
      }
      return { subscription: sub, payment: null, createRenewalPayment: false, note: "Abonelik iptal edildi" };
    }
    case "payment.refunded": {
      sub.status = "expired";
      sub.currentPeriodEnd = now;
      sub.cancelAtPeriodEnd = true;
      return {
        subscription: sub,
        payment: { status: "refunded" },
        createRenewalPayment: false,
        note: "Ödeme iade edildi; Premium sonlandırıldı",
      };
    }
  }
}

/** Kullanıcının kendi isteğiyle iptal: ödenmiş dönem sonuna kadar Premium sürer. */
export function cancelByUser(current: SubscriptionSnapshot, now = new Date()): SubscriptionSnapshot {
  if (!isPremiumActive(current, now)) {
    return { ...current, status: current.status === "active" ? "expired" : current.status, cancelAtPeriodEnd: true };
  }
  return { ...current, status: "canceled", cancelAtPeriodEnd: true, canceledAt: now };
}
