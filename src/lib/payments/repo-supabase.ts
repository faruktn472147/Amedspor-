import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentRepository } from "./webhook";
import type { PaymentRecord, SubscriptionSnapshot } from "./types";

type Row = Record<string, unknown>;
const d = (v: unknown) => (v ? new Date(v as string) : null);
const iso = (v: Date | null | undefined) => (v ? v.toISOString() : null);

export function rowToSubscription(r: Row): SubscriptionSnapshot {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    status: r.status as SubscriptionSnapshot["status"],
    provider: r.provider as SubscriptionSnapshot["provider"],
    providerSubscriptionRef: (r.provider_subscription_ref as string) ?? null,
    providerCustomerRef: (r.provider_customer_ref as string) ?? null,
    priceAmount: Number(r.price_amount),
    currency: r.currency as string,
    currentPeriodStart: d(r.current_period_start),
    currentPeriodEnd: d(r.current_period_end),
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    canceledAt: d(r.canceled_at),
  };
}

export function subscriptionToRow(s: SubscriptionSnapshot): Row {
  return {
    user_id: s.userId,
    status: s.status,
    provider: s.provider,
    provider_subscription_ref: s.providerSubscriptionRef,
    provider_customer_ref: s.providerCustomerRef,
    price_amount: s.priceAmount,
    currency: s.currency,
    current_period_start: iso(s.currentPeriodStart),
    current_period_end: iso(s.currentPeriodEnd),
    cancel_at_period_end: s.cancelAtPeriodEnd,
    canceled_at: iso(s.canceledAt),
  };
}

function rowToPayment(r: Row): PaymentRecord {
  return {
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
    provider: r.provider as PaymentRecord["provider"],
    providerPaymentRef: (r.provider_payment_ref as string) ?? null,
    checkoutToken: (r.checkout_token as string) ?? null,
    kind: r.kind as PaymentRecord["kind"],
    status: r.status as PaymentRecord["status"],
    amountGross: Number(r.amount_gross),
    feeAmount: r.fee_amount == null ? null : Number(r.fee_amount),
    currency: r.currency as string,
    periodStart: d(r.period_start),
    periodEnd: d(r.period_end),
    failureReason: (r.failure_reason as string) ?? null,
    isTest: Boolean(r.is_test),
    paidAt: d(r.paid_at),
  };
}

function paymentPatchToRow(p: Partial<PaymentRecord>): Row {
  const map: [keyof PaymentRecord, string, (v: unknown) => unknown][] = [
    ["status", "status", (v) => v],
    ["providerPaymentRef", "provider_payment_ref", (v) => v],
    ["feeAmount", "fee_amount", (v) => v],
    ["periodStart", "period_start", (v) => iso(v as Date)],
    ["periodEnd", "period_end", (v) => iso(v as Date)],
    ["failureReason", "failure_reason", (v) => v],
    ["paidAt", "paid_at", (v) => iso(v as Date)],
    ["subscriptionId", "subscription_id", (v) => v],
  ];
  const out: Row = {};
  for (const [k, col, f] of map) if (k in p) out[col] = f(p[k]);
  return out;
}

/** service_role istemcisi ile çalışan ödeme deposu (yalnızca webhook ve sunucu işlemleri). */
export class SupabasePaymentRepository implements PaymentRepository {
  constructor(private readonly db: SupabaseClient) {}

  async recordEvent(i: { provider: string; eventId: string; eventType: string; signatureValid: boolean; payload: unknown }) {
    const { error } = await this.db.from("payment_events").insert({
      provider: i.provider,
      event_id: i.eventId,
      event_type: i.eventType,
      signature_valid: i.signatureValid,
      payload: i.payload,
    });
    if (error?.code === "23505") return false;
    if (error) throw new Error(`payment_events: ${error.message}`);
    return true;
  }
  async markEventProcessed(provider: string, eventId: string, result: string) {
    await this.db.from("payment_events").update({ result, processed_at: new Date().toISOString() }).eq("provider", provider).eq("event_id", eventId);
  }
  async findPaymentByCheckoutToken(token: string) {
    const { data } = await this.db.from("payments").select("*").eq("checkout_token", token).maybeSingle();
    return data ? rowToPayment(data) : null;
  }
  async findPaymentByProviderRef(provider: string, ref: string) {
    const { data } = await this.db.from("payments").select("*").eq("provider", provider).eq("provider_payment_ref", ref).maybeSingle();
    return data ? rowToPayment(data) : null;
  }
  async findSubscriptionByUser(userId: string) {
    const { data } = await this.db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
    return data ? rowToSubscription(data) : null;
  }
  async findSubscriptionByProviderRef(provider: string, ref: string) {
    const { data } = await this.db.from("subscriptions").select("*").eq("provider", provider).eq("provider_subscription_ref", ref).maybeSingle();
    return data ? rowToSubscription(data) : null;
  }
  async saveSubscription(s: SubscriptionSnapshot) {
    const { data, error } = await this.db.from("subscriptions").upsert(subscriptionToRow(s), { onConflict: "user_id" }).select("*").single();
    if (error || !data) throw new Error(`subscriptions: ${error?.message}`);
    return rowToSubscription(data);
  }
  async updatePayment(id: string, patch: Partial<PaymentRecord>) {
    await this.db.from("payments").update(paymentPatchToRow(patch)).eq("id", id);
  }
  async insertPayment(p: Omit<PaymentRecord, "id">) {
    const { data, error } = await this.db
      .from("payments")
      .insert({
        user_id: p.userId,
        subscription_id: p.subscriptionId,
        provider: p.provider,
        provider_payment_ref: p.providerPaymentRef,
        checkout_token: p.checkoutToken,
        kind: p.kind,
        status: p.status,
        amount_gross: p.amountGross,
        fee_amount: p.feeAmount,
        currency: p.currency,
        period_start: iso(p.periodStart),
        period_end: iso(p.periodEnd),
        failure_reason: p.failureReason,
        is_test: p.isTest,
        paid_at: iso(p.paidAt),
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`payments: ${error?.message}`);
    return rowToPayment(data);
  }
  async notify(userId: string, message: string) {
    await this.db.from("notifications").insert({ user_id: userId, type: "subscription", message, link: "/premium" });
  }
}
