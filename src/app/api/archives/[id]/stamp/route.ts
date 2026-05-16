import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildVerifyUrl } from "@/lib/signature";
import { getOrCreateOrganizationProfile } from "@/lib/profile";
import { renderSignatureStamp } from "@/lib/stamp";
import { pickPrimarySignature } from "@/lib/archiveSignature";
import { resolveOrgLogoBytes } from "@/lib/qrLogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sigId = new URL(req.url).searchParams.get("sigId") ?? undefined;
  const archive = await prisma.archive.findUnique({
    where: { id: params.id },
    include: { signatures: { orderBy: { signedAt: "desc" } } },
  });
  if (!archive) {
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  }
  const signature = sigId
    ? archive.signatures.find((s) => s.id === sigId)
    : pickPrimarySignature(archive.signatures);
  if (!signature || signature.revokedAt) {
    return NextResponse.json(
      { error: "No active signature on this archive" },
      { status: 404 }
    );
  }
  const profile = await getOrCreateOrganizationProfile();
  const verifyUrl = buildVerifyUrl(signature.token, profile.verifyBaseUrl);

  // Resolves uploaded bytes first, otherwise fetches the remote
  // `logoUrl` once (cached per lambda). Returns null on any failure so
  // we never break the stamp because of a slow logo host.
  const qrLogo = await resolveOrgLogoBytes(profile);

  try {
    const png = await renderSignatureStamp({
      verifyUrl,
      signatoryName: signature.signatoryName,
      signatoryPosition: signature.signatoryPosition,
      signatoryUnit: signature.signatoryUnit,
      organizationName: profile.name,
      footerLine1:
        `Dokumen ini ditandatangani secara elektronik oleh ${profile.name}.`,
      footerLine2: `Pindai QR untuk verifikasi di ${stripScheme(verifyUrl)}.`,
      qrLogo,
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    // Surface the failure so we can debug it in Vercel logs instead of
    // serving a blank/broken image to the admin.
    console.error("[stamp] render failed", {
      archiveId: params.id,
      signatureId: signature.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to render signature visualization" },
      { status: 500 }
    );
  }
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
