CREATE UNIQUE INDEX "ArchiveSignature_archiveId_signatoryId_active_key"
    ON "ArchiveSignature"("archiveId", "signatoryId")
    WHERE "revokedAt" IS NULL;
