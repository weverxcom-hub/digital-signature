import { prisma } from "./prisma";
import { DEFAULT_PROFILE_ID } from "./profile";

export type QrLogoBytes = {
  bytes: Buffer | Uint8Array;
  mimeType: string | null;
} | null;

/**
 * Cache of fetched remote-URL logos. Vercel functions are short-lived,
 * but warm invocations within the same lambda will reuse this cache so
 * we don't re-fetch the same image on every stamp / QR request.
 */
const remoteLogoCache = new Map<string, { bytes: Buffer; mimeType: string }>();

/**
 * Resolves the org's logo bytes for QR / stamp compositing.
 *
 * Order of resolution:
 *   1. If admin uploaded a file (logoBytes + logoMimeType in DB), use that.
 *   2. Else, if `logoUrl` is set, fetch the image once and cache it.
 *   3. Else, return null and the renderer falls back to a plain QR.
 *
 * Any network failure on (2) returns null so a slow / blocked logo URL
 * never breaks the QR.
 */
export async function resolveOrgLogoBytes(profile: {
  logoMimeType: string | null;
  logoUrl: string | null;
}): Promise<QrLogoBytes> {
  if (profile.logoMimeType) {
    const row = await prisma.organizationProfile.findUnique({
      where: { id: DEFAULT_PROFILE_ID },
      select: { logoBytes: true, logoMimeType: true },
    });
    if (row?.logoBytes && row.logoMimeType) {
      return { bytes: row.logoBytes, mimeType: row.logoMimeType };
    }
  }
  if (!profile.logoUrl) return null;
  const cached = remoteLogoCache.get(profile.logoUrl);
  if (cached) return cached;
  try {
    // Guard against pathologically slow or huge images.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(profile.logoUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    // 5 MB cap. sharp can handle larger but QR overlay is tiny, no benefit.
    if (ab.byteLength > 5 * 1024 * 1024) return null;
    const bytes = Buffer.from(ab);
    remoteLogoCache.set(profile.logoUrl, { bytes, mimeType });
    return { bytes, mimeType };
  } catch {
    return null;
  }
}
