"use client";
import { useState, useTransition } from "react";
import { cancelSubscriptionAction, simulateTestPaymentAction, startCheckoutAction } from "@/app/actions/premium";
import { Alert, Button } from "@/components/ui";

export function BuyButton({ label }: { label: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full bg-amber-500 text-black hover:bg-amber-400" disabled={pending} onClick={() => start(async () => { const r = await startCheckoutAction(); if (r && !r.ok) setErr(r.error); })}>
        {pending ? "Güvenli ödeme sayfası açılıyor…" : label}
      </Button>
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}

export function CancelButton() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <Alert tone="success">{msg.t}</Alert>;
  return (
    <div className="space-y-2">
      <Button variant="outline" className="w-full" disabled={pending} onClick={() => {
        if (!confirm("Premium aboneliğini iptal etmek istiyor musun? Ödediğin dönem sonuna kadar reklamsız devam edersin; sonra ücret alınmaz.")) return;
        start(async () => { const r = await cancelSubscriptionAction(); setMsg(r.ok ? { ok: true, t: r.message ?? "İptal edildi." } : { ok: false, t: r.error }); });
      }}>
        Aboneliği iptal et
      </Button>
      {msg && <Alert tone="error">{msg.t}</Alert>}
    </div>
  );
}

export function TestPayButtons({ token }: { token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await simulateTestPaymentAction(token, "success"); if (r && !r.ok) setErr(r.error); })}>Başarılı ödeme simüle et</Button>
        <Button variant="danger" disabled={pending} onClick={() => start(async () => { const r = await simulateTestPaymentAction(token, "failure"); if (r && !r.ok) setErr(r.error); })}>Başarısız ödeme simüle et</Button>
      </div>
      {err && <Alert tone="error">{err}</Alert>}
    </div>
  );
}
