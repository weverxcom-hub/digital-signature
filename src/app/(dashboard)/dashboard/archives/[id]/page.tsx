import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateOrganizationProfile } from "@/lib/profile";
import { buildVerifyUrl } from "@/lib/signature";
import { ArchiveDetailClient } from "./ArchiveDetailClient";

export const dynamic = "force-dynamic";

export default async function ArchiveDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [archive, signatories, profile] = await Promise.all([
    prisma.archive.findUnique({
      where: { id: params.id },
      include: {
        signature: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.signatory.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
    }),
    getOrCreateOrganizationProfile(),
  ]);
  if (!archive) notFound();

  const verifyUrl = archive.signature
    ? buildVerifyUrl(archive.signature.token, profile.verifyBaseUrl)
    : null;

  return (
    <ArchiveDetailClient
      archive={JSON.parse(JSON.stringify(archive))}
      signatories={signatories}
      verifyUrl={verifyUrl}
      profile={{
        name: profile.name,
        shortName: profile.shortName,
        logoUrl: profile.logoUrl,
        primaryColor: profile.primaryColor,
      }}
    />
  );
}
