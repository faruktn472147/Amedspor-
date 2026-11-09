"use client";
import { EmptyState, Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EmptyState title="Bir şeyler ters gitti" description="Beklenmeyen bir hata oluştu. Lütfen tekrar dene." action={<Button onClick={reset}>Tekrar dene</Button>} />;
}
