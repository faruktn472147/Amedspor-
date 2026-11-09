import { verifyMfaAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Label } from "@/components/ui";
import { safeNext } from "@/lib/utils";

export const metadata = { title: "İki adımlı doğrulama" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="İki adımlı doğrulama" subtitle="Doğrulama uygulamandaki (Google Authenticator vb.) 6 haneli kodu gir.">
      <ActionForm action={verifyMfaAction}>
        <input type="hidden" name="next" value={safeNext(next)} />
        <div><Label htmlFor="code">Kod</Label><Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required /></div>
        <SubmitButton className="w-full">Doğrula</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
