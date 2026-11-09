import { getPlacementAds } from "@/lib/ads/server";
import type { PlacementCode } from "@/lib/ads/frequency";
import { AdSlot } from "./ad-slot";

/** Sunucu bileşeni: Premium ise hiçbir şey render etmez (reklam kodu tarayıcıya gönderilmez). */
export async function Ad({ placement, slot = 0, variant }: { placement: PlacementCode; slot?: number; variant?: "card" | "compact" | "short" }) {
  const ads = await getPlacementAds(placement);
  if (!ads.show || !ads.placement) return null;
  const campaigns = ads.campaigns.map((c) => ({
    id: c.id,
    advertiser_name: c.advertiser_name,
    title: c.title,
    body: c.body,
    image_url: c.image_url,
    target_url: c.target_url,
    cta_label: c.cta_label,
    priority: c.priority,
    placement_codes: c.placement_codes,
  }));
  return (
    <AdSlot
      placement={placement}
      campaigns={campaigns}
      dailyCap={ads.settings.per_campaign_daily_cap}
      slot={slot}
      provider={ads.placement.provider}
      adsenseSlotId={ads.placement.adsense_slot_id}
      variant={variant}
    />
  );
}
