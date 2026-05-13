import type { ArchiveStatus } from "@prisma/client";

/**
 * Multi-signer support landed in the schema, but most UI/API surfaces still
 * expose a single "primary" signature per archive. These helpers pick that
 * primary signature consistently and derive the archive's overall status
 * from its signatures.
 */

export type SigLike = {
  revokedAt: Date | string | null;
  signedAt: Date | string;
};

/**
 * Pick the signature that represents the archive's current state for UX.
 * Priority:
 *   1. Most recently signed non-revoked signature.
 *   2. Most recently signed revoked signature (so UI still shows the
 *      revoked state instead of "no signature").
 *   3. null if the archive has no signatures yet.
 */
export function pickPrimarySignature<T extends SigLike>(
  signatures: T[] | null | undefined
): T | null {
  if (!signatures || signatures.length === 0) return null;
  const sorted = [...signatures].sort(
    (a, b) => +new Date(b.signedAt) - +new Date(a.signedAt)
  );
  const active = sorted.find((s) => !s.revokedAt);
  return active ?? sorted[0]!;
}

/**
 * Compute the archive-level status from its signatures.
 * The `PENDING` state is reserved for a future "required signers" feature;
 * at MVP every signed archive resolves to either FULLY_SIGNED or REVOKED.
 */
export function deriveArchiveStatus(signatures: SigLike[]): ArchiveStatus {
  if (!signatures.length) return "DRAFT";
  const hasActive = signatures.some((s) => !s.revokedAt);
  return hasActive ? "FULLY_SIGNED" : "REVOKED";
}
