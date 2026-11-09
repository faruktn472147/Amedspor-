"use client";
import { useRef, useState } from "react";
import { Play } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Çoklu fotoğraf kaydırma + video (video yalnızca dokunulunca yüklenir: gereksiz veri tüketimi yok). */
export function MediaCarousel({ media, dataSaver }: { media: MediaItem[]; dataSaver: boolean }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!media.length) return null;
  return (
    <div className="relative bg-black">
      <div
        ref={ref}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {media.map((m) => (
          <div key={m.id} className="relative aspect-[4/5] w-full shrink-0 snap-center">
            {m.media_type === "image" ? (
              m.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- imzalı Supabase URL'si; boyut yükleme sırasında küçültülür
                <img src={m.url} alt="Gönderi görseli" loading="lazy" decoding="async" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/60">Görsel yüklenemedi</div>
              )
            ) : playing === m.id && m.url ? (
              <video src={m.url} controls autoPlay playsInline className="h-full w-full object-contain" />
            ) : (
              <button type="button" onClick={() => setPlaying(m.id)} className="group relative h-full w-full" aria-label="Videoyu oynat">
                {m.poster_url && !dataSaver ? (
                  // eslint-disable-next-line @next/next/no-img-element -- video kapağı
                  <img src={m.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="brand-gradient absolute inset-0 opacity-60" />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white transition group-hover:scale-105">
                    <Play className="h-8 w-8 fill-white" />
                  </span>
                </span>
                {m.duration_seconds != null && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    0:{String(Math.round(Number(m.duration_seconds))).padStart(2, "0")}
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5" aria-hidden>
          {media.map((m, i) => (
            <span key={m.id} className={cn("h-1.5 w-1.5 rounded-full", i === index ? "bg-white" : "bg-white/40")} />
          ))}
        </div>
      )}
    </div>
  );
}
