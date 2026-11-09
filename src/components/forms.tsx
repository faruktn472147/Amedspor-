"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";

export type FormResult = { ok: true; message?: string } | { ok: false; error: string } | null;
type FormAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

export function SubmitButton({ children, variant, className, pendingText }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "outline"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className={className} aria-busy={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? "Gönderiliyor…") : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: FormResult }) {
  if (!state) return null;
  if (state.ok) return state.message ? <Alert tone="success">{state.message}</Alert> : null;
  return <Alert tone="error">{state.error}</Alert>;
}

/** Sunucu işlemine bağlı form: sonucu (başarı/hata) otomatik gösterir. */
export function ActionForm({ action, children, className, resetOnSuccess }: { action: FormAction; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}
