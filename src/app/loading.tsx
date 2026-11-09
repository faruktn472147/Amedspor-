import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Yükleniyor">
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
