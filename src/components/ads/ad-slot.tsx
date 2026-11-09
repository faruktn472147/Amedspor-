"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { pickCampaign, type PlacementCode } from "@/lib/ads/frequency";
import { readConsentClient, type AdConsent } from "@/components/consent/consent";
import type { AdCampaign } from "@/lib/types";
import { cn } from "@/lib/utils";

type AdCampaignPublic = Pick<AdCampaign, "id" | "advertiser_name" | "title" | "body" | "image_url" | "target_url" | "cta_label" | "priority" | "placement_codes">;

const todayKey = () => `amed-ad-seen:${new Date().toISOString().slice(0, 10)}`;

function readSeen(): { counts: Record<string, number>; last: string | null } {
  try {
    const raw = localStorage.getItem(todayKey());
    return raw ? JSON.parse(raw) : { counts: {}, last: null };
  } catch {
    return { counts: {}, last: null };
  }
}

function markSeen(id: string) {
  try {
    const s = readSeen();
    s.counts[id] = (s.counts[id] ?? 0) + 1;
    s.last = id;
    localStorage.setItem(todayKey(), JSON.stringify(s));
  } catch {
    /* depolama kapalıysa sıklık sınırı oturum içinde uygulanmaz */
  }
}

function send(campaignId: string, placement: string, kind: "impression" | "click") {
  const body = JSON.stringify({ campaignId, placement, kind });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/ads/event", new Blob([body], { type: "application/json" }));
  else fetch("/api/ads/event", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
}

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  }
}

function AdSense({ client, slot, consent }: { client: string; slot: string; consent: AdConsent }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    const id = "adsbygoogle-js";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(s);
    }
    window.adsbygoogle = window.adsbygoogle || ([] as unknown as Window["adsbygoogle"]);
    if (consent === "non_personalized" && window.adsbygoogle) window.adsbygoogle.requestNonPersonalizedAds = 1;
    try {
      window.adsbygoogle?.push({});
    } catch {
      /* reklam yüklenemezse sayfa çalışmaya devam eder */
    }
  }, [client, consent]);
  return (
    <ins
      ref={ref}
      className="adsbygoogle block"
      style={{ display: "block", minHeight: 90 }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

export function AdSlot({
  placement,
  campaigns,
  dailyCap,
  slot = 0,
  provider,
  adsenseSlotId,
  variant = "card",
}: {
  placement: PlacementCode;
  campaigns: AdCampaignPublic[];
  dailyCap: number;
  slot?: number;
  provider: "direct" | "adsense" | "direct_then_adsense";
  adsenseSlotId: string | null;
  variant?: "card" | "compact" | "short";
}) {
  const [choice, setChoice] = useState<{ campaign: AdCampaignPublic | null; consent: AdConsent | null } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);

  useEffect(() => {
    const seen = readSeen();
    const campaign = provider === "adsense" ? null : pickCampaign(campaigns, placement, seen.counts, dailyCap, seen.last, slot);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcıya özel (localStorage/çerez) karar istemcide verilir
    setChoice({ campaign, consent: readConsentClient() });
  }, [campaigns, placement, dailyCap, slot, provider]);

  useEffect(() => {
    const el = ref.current;
    const c = choice?.campaign;
    if (!el || !c || tracked.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer = setTimeout(() => {
            if (tracked.current) return;
            tracked.current = true;
            markSeen(c.id);
            send(c.id, placement, "impression");
          }, 1000);
        } else if (timer) clearTimeout(timer);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [choice, placement]);

  if (!choice) return null;
  const { campaign, consent } = choice;
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  if (!campaign) {
    const canAdsense = provider !== "direct" && adsenseClient && adsenseSlotId && consent && consent !== "none";
    if (!canAdsense) return null; // reklam yoksa boş alan bırakılmaz
    return (
      <aside aria-label="Reklam" className="rounded-2xl border border-border bg-elevated p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-fg-muted">Reklam</p>
        <AdSense client={adsenseClient} slot={adsenseSlotId} consent={consent} />
      </aside>
    );
  }

  const isShort = variant === "short";
  return (
    <aside
      ref={ref}
      aria-label={`Sponsorlu içerik: ${campaign.advertiser_name}`}
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-elevated",
        isShort && "flex h-full flex-col justify-center border-0 bg-black text-white",
      )}
    >
      <div className={cn("flex items-center justify-between px-4 pt-3 text-xs", isShort ? "text-white/70" : "text-fg-muted")}>
        <span className="font-bold uppercase tracking-wide">Sponsorlu</span>
        <span>{campaign.advertiser_name}</span>
      </div>
      {campaign.image_url && variant !== "compact" && (
        // eslint-disable-next-line @next/next/no-img-element -- reklam görseli harici sponsor adresinden gelir
        <img src={campaign.image_url} alt="" loading="lazy" className={cn("mt-2 w-full object-cover", isShort ? "max-h-[60%]" : "aspect-[16/9]")} />
      )}
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{campaign.title}</p>
          {campaign.body && <p className={cn("mt-0.5 text-sm", isShort ? "text-white/80" : "text-fg-muted")}>{campaign.body}</p>}
        </div>
        <a
          href={campaign.target_url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={() => send(campaign.id, placement, "click")}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-green px-3 text-sm font-semibold text-white hover:bg-green-strong"
        >
          {campaign.cta_label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </aside>
  );
}
