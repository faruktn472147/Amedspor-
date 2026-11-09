import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/logo";
import { Alert, Card } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-4">
      <div className="mb-5 flex flex-col items-center text-center">
        <LogoMark size={52} />
        <h1 className="mt-3 text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {!isSupabaseConfigured() && (
        <Alert tone="warning" className="mb-4">
          Üyelik sistemi henüz yapılandırılmadı. Kurulum tamamlanana kadar kayıt ve giriş çalışmaz (sahte giriş yapılmaz).
        </Alert>
      )}
      <Card className="p-5">{children}</Card>
      {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
