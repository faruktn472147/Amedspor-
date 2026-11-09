"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readConsentClient, writeConsentClient, type AdConsent } from "./consent";

/**
 * KVKK uyumlu çerez bildirimi. Zorunlu çerezler (oturum, güvenlik, tercih) dışında
 * hiçbir üçüncü taraf reklam çerezi, kullanıcı açıkça seçmeden yüklenmez.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(readConsentClient() === null);
    show();
    const reopen = () => setOpen(true);
    window.addEventListener("amed-consent-open", reopen);
    return () => window.removeEventListener("amed-consent-open", reopen);
  }, []);
  if (!open) return null;
  const choose = (v: AdConsent) => {
    writeConsentClient(v);
    setOpen(false);
  };
  return (
    <div role="dialog" aria-labelledby="cookie-title" aria-live="polite" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-lg rounded-2xl border border-border bg-elevated p-4 shadow-2xl lg:bottom-6">
      <p id="cookie-title" className="font-bold">Çerez tercihleri</p>
      <p className="mt-1 text-sm text-fg-muted">
        Oturumunuzu güvenle sürdürmek için zorunlu çerezler kullanılır. Reklam ortaklarının çerezleri yalnızca izin verirseniz
        yüklenir. Ayrıntılar: <Link href="/yasal/cerezler" className="underline">Çerez Politikası</Link>.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button className="h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted" onClick={() => choose("none")}>
          Yalnızca zorunlu
        </button>
        <button className="h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted" onClick={() => choose("non_personalized")}>
          Kişiselleştirilmemiş reklam
        </button>
        <button className="h-10 rounded-xl bg-green text-sm font-semibold text-white hover:bg-green-strong" onClick={() => choose("personalized")}>
          Tümüne izin ver
        </button>
      </div>
    </div>
  );
}

export function OpenConsentButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("amed-consent-open"))}>
      Çerez tercihlerini değiştir
    </button>
  );
}
