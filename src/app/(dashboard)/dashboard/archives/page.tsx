import { prisma } from "@/lib/prisma";
import { ArchivesClient } from "./ArchivesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archives" };

export default async function ArchivesPage() {
  const [archives, signatories] = await Promise.all([
    prisma.archive.findMany({
      include: {
        signature: {
          select: {
            id: true,
            token: true,
            signedAt: true,
            revokedAt: true,
            signatoryName: true,
            signatoryPosition: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.signatory.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <ArchivesClient
      initialArchives={JSON.parse(JSON.stringify(archives))}
      signatories={signatories}
    />
  );
}
