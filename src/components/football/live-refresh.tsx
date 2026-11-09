"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Canlı maçta sayfayı 30 sn'de bir yeniler; sekme arka plandaysa yenilemez (gereksiz istek yok). */
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
