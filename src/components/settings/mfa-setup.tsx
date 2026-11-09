"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, Button, Input } from "@/components/ui";

type Factor = { id: string; status: string; friendly_name?: string };

/** TOTP tabanlı iki aşamalı doğrulama (Supabase Auth, ücretsiz). */
export function MfaSetup() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- faktör listesi istemci oturumundan okunur
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supabase) return <Alert tone="warning">Kimlik doğrulama servisi yapılandırılmadı.</Alert>;
  const verified = factors?.find((f) => f.status === "verified");

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      {verified ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm"><b className="text-green">Açık.</b> Girişte doğrulama uygulamasından kod istenir.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!confirm("İki aşamalı doğrulamayı kapatmak hesabını daha az güvenli hale getirir. Emin misin?")) return;
                const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
                setMsg(error ? { ok: false, text: "Kapatılamadı. Önce yeniden giriş yapıp 2FA kodunu girmen gerekebilir." } : { ok: true, text: "İki aşamalı doğrulama kapatıldı." });
                await load();
              })
            }
          >
            Kapat
          </Button>
        </div>
      ) : enroll ? (
        <div className="space-y-3">
          <p className="text-sm">Google Authenticator, Microsoft Authenticator veya benzeri bir uygulamayla bu QR kodu tara:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase'in ürettiği SVG QR kodu */}
          <img src={enroll.qr} alt="İki aşamalı doğrulama QR kodu" className="h-44 w-44 rounded-xl bg-white p-2" />
          <p className="break-all text-xs text-fg-muted">Elle giriş anahtarı: <code>{enroll.secret}</code></p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 haneli kod" aria-label="Doğrulama kodu" />
          <Button
            disabled={pending || code.length !== 6}
            onClick={() =>
              start(async () => {
                const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
                if (e1 || !ch) return setMsg({ ok: false, text: "Doğrulama başlatılamadı." });
                const { error } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code });
                if (error) return setMsg({ ok: false, text: "Kod hatalı. Tekrar dene." });
                setEnroll(null);
                setMsg({ ok: true, text: "İki aşamalı doğrulama açıldı." });
                await load();
                router.refresh();
              })
            }
          >
            Etkinleştir
          </Button>
        </div>
      ) : (
        <Button
          disabled={pending || factors === null}
          onClick={() =>
            start(async () => {
              for (const f of factors ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
              const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `AMEDSPOR ${Date.now()}` });
              if (error || !data) return setMsg({ ok: false, text: "Kurulum başlatılamadı." });
              setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
            })
          }
        >
          İki aşamalı doğrulamayı aç
        </Button>
      )}
    </div>
  );
}
