"use client";
import { useState, useTransition } from "react";
import { Flag, X } from "lucide-react";
import { reportAction } from "@/app/actions/social";
import { Alert, Button, Select, Textarea } from "@/components/ui";

const REASONS: [string, string][] = [
  ["kufur", "Küfür"],
  ["hakaret", "Hakaret"],
  ["tehdit", "Tehdit"],
  ["irkcilik", "Irkçılık"],
  ["nefret", "Nefret söylemi"],
  ["taciz", "Taciz"],
  ["siddet", "Şiddet çağrısı"],
  ["spam", "Spam"],
  ["dolandiricilik", "Dolandırıcılık"],
  ["kisisel_bilgi", "Kişisel bilgi ifşası"],
  ["uygunsuz_gorsel", "Uygunsuz görsel"],
  ["telif", "Telif hakkı ihlali"],
  ["diger", "Diğer"],
];

export function ReportButton({ targetType, targetId, label = "Şikâyet et", className }: { targetType: "post" | "comment" | "profile" | "news"; targetId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("kufur");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-red"}>
        <Flag className="h-4 w-4" aria-hidden /> {label}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Şikâyet et" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-elevated p-4 text-fg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">İçeriği şikâyet et</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded-full p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            {result ? (
              <Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert>
            ) : (
              <div className="space-y-3">
                <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Şikâyet nedeni">
                  {REASONS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
                <Textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="İsteğe bağlı açıklama" />
                <Button
                  className="w-full"
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await reportAction(targetType, targetId, reason, details);
                      setResult(r.ok ? { ok: true, text: r.message ?? "Gönderildi." } : { ok: false, text: r.error });
                    })
                  }
                >
                  Şikâyeti gönder
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
