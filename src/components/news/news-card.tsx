import Link from "next/link";
import { BadgeCheck, CircleAlert, ExternalLink, Newspaper } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { VERIFICATION_LABEL } from "@/lib/news/classify";
import { formatDateTime, timeAgo, cn } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";

export const NEWS_CATEGORY_LABEL: Record<NewsItem["category"], string> = {
  son_dakika: "Son dakika",
  resmi: "Resmî açıklama",
  haber: "Haber",
  transfer: "Transfer",
  mac: "Maç",
  roportaj: "Röportaj",
};

export function VerificationBadge({ v }: { v: NewsItem["verification"] }) {
  const tone = v === "official" || v === "verified" ? "green" : v === "rumor" ? "amber" : "neutral";
  const Icon = v === "official" || v === "verified" ? BadgeCheck : CircleAlert;
  return (
    <Badge tone={tone} className="normal-case tracking-normal">
      <Icon className="h-3 w-3" /> {VERIFICATION_LABEL[v]}
    </Badge>
  );
}

export function NewsCard({ item, variant = "row" }: { item: NewsItem; variant?: "hero" | "row" }) {
  const date = item.source_published_at ?? item.published_at;
  if (variant === "hero") {
    return (
      <Link href={`/haberler/${item.id}`} className="block">
        <Card className="group overflow-hidden">
          <div className="relative aspect-[16/9] bg-muted">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- izinli kaynak görseli
              <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
            ) : (
              <div className="brand-gradient flex h-full items-center justify-center opacity-90">
                <Newspaper className="h-14 w-14 text-white/80" aria-hidden />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-16 text-white">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge tone={item.category === "son_dakika" ? "live" : "neutral"} className={item.category === "son_dakika" ? "" : "bg-white/20 text-white"}>{NEWS_CATEGORY_LABEL[item.category]}</Badge>
                <VerificationBadge v={item.verification} />
              </div>
              <h3 className="text-xl font-extrabold leading-snug">{item.title}</h3>
              <p className="mt-1 text-xs text-white/80">
                {item.source?.name ?? "AMEDSPOR editör"} · <time dateTime={date ?? undefined}>{date ? timeAgo(date) : ""}</time>
              </p>
            </div>
          </div>
        </Card>
      </Link>
    );
  }
  return (
    <Link href={`/haberler/${item.id}`} className="group flex gap-3 rounded-2xl p-2 hover:bg-muted">
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- izinli kaynak görseli
          <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="brand-gradient flex h-full items-center justify-center opacity-80"><Newspaper className="h-7 w-7 text-white/80" aria-hidden /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={cn("text-[11px] font-bold uppercase", item.category === "son_dakika" ? "text-live" : "text-green")}>{NEWS_CATEGORY_LABEL[item.category]}</span>
          {item.verification === "rumor" && <VerificationBadge v="rumor" />}
        </div>
        <h3 className="line-clamp-2 font-bold leading-snug group-hover:underline">{item.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
          {item.source?.name ?? "AMEDSPOR editör"} · {date ? formatDateTime(date) : "tarih yok"}
          {item.original_url && <ExternalLink className="h-3 w-3" aria-label="dış kaynak" />}
        </p>
      </div>
    </Link>
  );
}
