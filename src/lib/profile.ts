import { cache } from "react";
import { prisma } from "./prisma";

export { getLogoSrc, type OrgProfileForLogo } from "./logoSrc";

export const DEFAULT_PROFILE_ID = "default";

/**
 * Returns the singleton OrganizationProfile row, creating it if missing.
 *
 * This app is single-tenant by design: one deployment = one organization.
 * Uses `upsert` so concurrent calls during a parallel build pass don't
 * race against the unique constraint on `id`.
 *
 * Wrapped in `React.cache` so the same request can call this helper from
 * multiple Server Components / layouts / pages without re-querying the DB.
 *
 * NOTE: we deliberately exclude `logoBytes` here so it isn't dragged into
 * every page render. The bytes are only fetched by /api/profile/logo.
 */
export const getOrCreateOrganizationProfile = cache(async () => {
  return prisma.organizationProfile.upsert({
    where: { id: DEFAULT_PROFILE_ID },
    update: {},
    create: { id: DEFAULT_PROFILE_ID },
    select: {
      id: true,
      name: true,
      shortName: true,
      tagline: true,
      address: true,
      website: true,
      logoUrl: true,
      logoMimeType: true,
      logoUpdatedAt: true,
      primaryColor: true,
      verifyBaseUrl: true,
      setupComplete: true,
      updatedAt: true,
    },
  });
});


