"use client";
import { useState, useTransition } from "react";
import { appealAction } from "@/app/actions/social";
import { Alert, Button, Textarea } from "@/components/ui";

export function AppealForm({ actionId }: { actionId: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <Alert tone="success">{msg.t}</Alert>;
  return (
    <div className="space-y-3">
      {msg && <Alert tone="error">{msg.t}</Alert>}
      <Textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kararın neden yanlış olduğunu düşündüğünü açıkla (en az 10 karakter)" />
      <Button disabled={pending || text.trim().length < 10} onClick={() => start(async () => { const r = await appealAction(actionId, text); setMsg(r.ok ? { ok: true, t: r.message ?? "Alındı" } : { ok: false, t: r.error }); })}>İtiraz et</Button>
    </div>
  );
}
