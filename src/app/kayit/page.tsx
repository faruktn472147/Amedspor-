import Link from "next/link";
import { signInWithGoogleAction, signUpAction } from "@/app/actions/auth";
import { AuthShell, GoogleIcon } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Input, Label } from "@/components/ui";

export const metadata = { title: "Kayıt ol" };

export default function SignUpPage() {
  return (
    <AuthShell title="Taraftar hesabı oluştur" subtitle="Ücretsiz. Tüm temel özellikler ücretsiz üyelikte açık." footer={<>Zaten hesabın var mı? <Link href="/giris" className="font-semibold text-green">Giriş yap</Link></>}>
      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value="/hosgeldin" />
        <Button type="submit" variant="outline" className="w-full"><GoogleIcon /> Google ile kayıt ol</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-fg-muted"><span className="h-px flex-1 bg-border" />veya e-posta ile<span className="h-px flex-1 bg-border" /></div>
      <ActionForm action={signUpAction}>
        <div><Label htmlFor="username">Kullanıcı adı</Label><Input id="username" name="username" autoComplete="username" pattern="[a-z0-9_.]{3,24}" minLength={3} maxLength={24} placeholder="ornek: amedli_21" required /></div>
        <div><Label htmlFor="email">E-posta</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div>
          <Label htmlFor="password">Şifre</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
          <p className="mt-1 text-xs text-fg-muted">En az 8 karakter, en az bir harf ve bir rakam.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" required className="mt-1 h-4 w-4 accent-[var(--brand-green)]" />
          <span><Link href="/yasal/kullanim-sartlari" className="underline">Kullanım Şartları</Link>, <Link href="/yasal/topluluk-kurallari" className="underline">Topluluk Kuralları</Link> ve <Link href="/yasal/kvkk" className="underline">KVKK Aydınlatma Metni</Link>&apos;ni okudum, kabul ediyorum.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="age" required className="mt-1 h-4 w-4 accent-[var(--brand-green)]" />
          <span>13 yaşından büyüğüm. (18 yaşından küçüksem velimin onayı var.)</span>
        </label>
        <SubmitButton className="w-full" pendingText="Hesap oluşturuluyor…">Kayıt ol</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
