import { createHmac, timingSafeEqual } from "node:crypto";

export const TEST_SIGNATURE_HEADER = "x-amedspor-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

/** Sabit zamanlı karşılaştırma (zamanlama saldırılarına karşı). */
export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** "t=<unix>,v1=<hex>" biçiminde imza başlığı üretir. */
export function signPayload(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | null,
  now = new Date(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): VerifyResult {
  if (!secret) return { ok: false, reason: "secret_missing" };
  if (!header) return { ok: false, reason: "header_missing" };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isFinite(ts) || !sig) return { ok: false, reason: "header_malformed" };
  const age = Math.abs(now.getTime() / 1000 - ts);
  if (age > toleranceSeconds) return { ok: false, reason: "timestamp_out_of_tolerance" };
  const expected = hmacSha256Hex(secret, `${ts}.${rawBody}`);
  return safeEqualHex(expected, sig) ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}
