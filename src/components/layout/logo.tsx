/**
 * Özgün, geçici AMEDSPOR taraftar platformu işareti.
 * Kulübün resmî logosu DEĞİLDİR; resmî ortaklık izlenimi vermemek için sade bir monogram kullanılır.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden role="img">
      <defs>
        <linearGradient id="lg-amed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c8102e" />
          <stop offset="0.5" stopColor="#a50d26" />
          <stop offset="1" stopColor="#00843d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg-amed)" />
      <path d="M32 12 L50 52 H41.5 L38 43.5 H26 L22.5 52 H14 Z M29 36.5 H35 L32 28.5 Z" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={30} />
      <span className="text-lg font-black tracking-tight">
        AMED<span className="text-red">SPOR</span>
        <span className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-fg-muted sm:inline">
          Taraftar
        </span>
      </span>
    </span>
  );
}
