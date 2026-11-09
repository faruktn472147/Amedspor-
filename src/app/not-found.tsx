import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return <EmptyState title="Sayfa bulunamadı" description="Aradığın sayfa taşınmış, silinmiş veya hiç var olmamış olabilir." action={<LinkButton href="/">Ana sayfaya dön</LinkButton>} />;
}
