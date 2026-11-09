import Link from "next/link";
import { signInAction, signInWithGoogleAction } from "@/app/actions/auth";
import { AuthShell, GoogleIcon } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Button, Input, Label } from "@/components/ui";
import { safeNext } from "@/lib/utils";

export const metadata = { title: "Giriş yap" };

const ERRORS: Record<string, string> = {
  baglanti: "Giriş bağlantısı geçersiz veya süresi dolmuş.",
  google: "Google ile giriş başlatılamadı. Google girişinin yapılandırıldığından emin olun.",
  yapilandirma: "Üyelik sistemi yapılandırılmadı.",
  dogrulama: "Doğrulama bağlantısı geçersiz veya süresi dolmuş.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; hata?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <AuthShell title="Tekrar hoş geldin" subtitle="Taraftar hesabınla giriş yap" footer={<>Hesabın yok mu? <Link href="/kayit" className="font-semibold text-green">Kayıt ol</Link></>}>
      {sp.hata && ERRORS[sp.hata] && <Alert tone="error" className="mb-4">{ERRORS[sp.hata]}</Alert>}
      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="outline" className="w-full"><GoogleIcon /> Google ile devam et</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-fg-muted"><span className="h-px flex-1 bg-border" />veya<span className="h-px flex-1 bg-border" /></div>
      <ActionForm action={signInAction}>
        <input type="hidden" name="next" value={next} />
        <div><Label htmlFor="email">E-posta</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div>
          <div className="flex items-center justify-between"><Label htmlFor="password">Şifre</Label><Link href="/sifremi-unuttum" className="mb-1.5 text-xs font-semibold text-green">Şifremi unuttum</Link></div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="w-full" pendingText="Giriş yapılıyor…">Giriş yap</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
