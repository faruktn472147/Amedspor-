export type AdConsent = "none" | "non_personalized" | "personalized";
export const CONSENT_COOKIE = "amed_consent";
export const CONSENT_VERSION = 1;

export function parseConsent(raw: string | undefined | null): AdConsent | null {
  if (!raw) return null;
  const m = /^v(\d+):(none|non_personalized|personalized)$/.exec(decodeURIComponent(raw));
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null;
  return m[2] as AdConsent;
}

export function readConsentClient(): AdConsent | null {
  if (typeof document === "undefined") return null;
  const c = document.cookie.split("; ").find((x) => x.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(c?.split("=")[1]);
}

export function writeConsentClient(value: AdConsent) {
  const maxAge = 60 * 60 * 24 * 180; // 6 ay
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`v${CONSENT_VERSION}:${value}`)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
  window.dispatchEvent(new Event("amed-consent"));
}
