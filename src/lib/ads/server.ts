import "server-only";
import { cache } from "react";
import { getViewer } from "@/lib/auth";
import { getAdInventory, getPublicSettings } from "@/lib/data/content";
import { shouldShowAds, type AdSettings, type PlacementCode } from "./frequency";
import type { AdCampaign, AdPlacement } from "@/lib/types";

export interface AdState {
  isPremium: boolean;
  settings: AdSettings;
  placements: Map<string, AdPlacement>;
  campaigns: AdCampaign[];
}

/** İstek başına bir kez hesaplanır. Premium kullanıcı için reklam envanteri hiç sorgulanmaz. */
export const getAdState = cache(async (): Promise<AdState> => {
  const [viewer, { ads }] = await Promise.all([getViewer(), getPublicSettings()]);
  const isPremium = viewer?.isPremium ?? false;
  if (isPremium || !ads.enabled) return { isPremium, settings: ads, placements: new Map(), campaigns: [] };
  const inv = await getAdInventory();
  return { isPremium, settings: ads, placements: new Map(inv.placements.map((p) => [p.code, p])), campaigns: inv.campaigns };
});

export async function getPlacementAds(code: PlacementCode) {
  const s = await getAdState();
  const placement = s.placements.get(code);
  const show = shouldShowAds({ isPremium: s.isPremium, settings: s.settings, placementEnabled: placement?.enabled ?? false });
  return {
    show,
    settings: s.settings,
    placement: placement ?? null,
    campaigns: show ? s.campaigns.filter((c) => c.placement_codes.includes(code)) : [],
  };
}
