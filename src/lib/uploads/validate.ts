/**
 * Medya yükleme kuralları — Supabase Free planının depolama ve trafik
 * sınırları göz önünde bulundurularak belirlenmiştir.
 */
export const UPLOAD_LIMITS = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxDimension: 4096,
    /** İstemci yüklemeden önce bu boyuta küçültür */
    targetDimension: 1600,
  },
  video: {
    // Supabase Free planında tek dosya üst sınırı 50 MB'tır.
    maxBytes: 50 * 1024 * 1024,
    mimes: ["video/mp4", "video/webm"] as const,
    maxDurationSeconds: 60,
    maxWidth: 1080,
    maxHeight: 1920,
  },
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"] as const,
  },
  maxImagesPerPost: 10,
} as const;

export type UploadKind = "image" | "video" | "avatar";

export interface UploadMeta {
  kind: UploadKind;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export function validateUpload(m: UploadMeta): string | null {
  const rules = UPLOAD_LIMITS[m.kind];
  if (!(rules.mimes as readonly string[]).includes(m.mime)) {
    return m.kind === "video" ? "Yalnızca MP4 veya WebM video yüklenebilir." : "Yalnızca JPEG, PNG veya WebP görsel yüklenebilir.";
  }
  if (!Number.isFinite(m.size) || m.size <= 0) return "Dosya boş görünüyor.";
  if (m.size > rules.maxBytes) {
    return `Dosya çok büyük. En fazla ${Math.round(rules.maxBytes / 1024 / 1024)} MB yüklenebilir.`;
  }
  if (m.kind === "video") {
    const v = UPLOAD_LIMITS.video;
    if (m.durationSeconds == null || !Number.isFinite(m.durationSeconds)) return "Video süresi okunamadı.";
    if (m.durationSeconds > v.maxDurationSeconds) return `Shorts videoları en fazla ${v.maxDurationSeconds} saniye olabilir.`;
    if (m.width && m.height) {
      const long = Math.max(m.width, m.height);
      const short = Math.min(m.width, m.height);
      if (long > v.maxHeight || short > v.maxWidth) return "Video çözünürlüğü en fazla 1080×1920 olabilir.";
    }
  }
  if (m.kind === "image" && m.width && m.height) {
    if (Math.max(m.width, m.height) > UPLOAD_LIMITS.image.maxDimension) return "Görsel çözünürlüğü çok yüksek.";
  }
  return null;
}

/** Dosyanın ilk baytlarından gerçek türünü tespit eder (uzantı/MIME sahteciliğine karşı). */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

/** Kullanıcıya ait güvenli depolama yolu üretir: "<uid>/<yyyy-mm>/<uuid>.<ext>" */
export function buildStoragePath(userId: string, mime: string, id: string, now = new Date()): string {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Geçersiz kimlik");
  const e = ext[mime];
  if (!e) throw new Error("Desteklenmeyen tür");
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${userId}/${ym}/${id}.${e}`;
}

export function isOwnedPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes("..") && /^[0-9a-f-]{36}\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(path);
}
