"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Sunucuda yetkisi tekrar doğrulanan bir yönetici işlemini çalıştırır. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirmText,
  size = "sm",
}: {
  action: () => Promise<Result>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  confirmText?: string;
  size?: "sm" | "md";
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => {
            const r = await action();
            setMsg(r.ok ? (r.message ?? null) : r.error);
            router.refresh();
          });
        }}
      >
        {children}
      </Button>
      {msg && <span className="text-xs text-fg-muted">{msg}</span>}
    </span>
  );
}
