import Link from "next/link";
import { Search } from "lucide-react";
import { searchProfiles } from "@/lib/data/social";
import { Avatar, Card, EmptyState, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Ara" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = q.trim().length >= 2 ? await searchProfiles(q) : [];
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Taraftar ara" />
      <form action="/ara" className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Kullanıcı adı veya isim" aria-label="Arama" minLength={2} maxLength={30} />
        <button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green text-white" aria-label="Ara"><Search className="h-5 w-5" /></button>
      </form>
      {q && (results.length ? (
        <Card className="divide-y divide-border">
          {results.map((u) => <Link key={u.id} href={`/u/${u.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted"><Avatar src={u.avatar_url} name={u.display_name || u.username} size={40} /><span><b className="block">{u.display_name || u.username}</b><span className="text-sm text-fg-muted">@{u.username}</span></span></Link>)}
        </Card>
      ) : <EmptyState title="Sonuç bulunamadı" />)}
    </div>
  );
}
