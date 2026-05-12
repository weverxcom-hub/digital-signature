import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildVerifyUrl } from "@/lib/signature";
import { getOrCreateOrganizationProfile } from "@/lib/profile";
import { renderSignatureStamp } from "@/lib/stamp";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const archive = await prisma.archive.findUnique({
    where: { id: params.id },
    include: { signature: true },
  });
  if (!archive || !archive.signature || archive.signature.revokedAt) {
    return NextResponse.json(
      { error: "No active signature on this archive" },
      { status: 404 }
    );
  }
  const profile = await getOrCreateOrganizationProfile();
  const verifyUrl = buildVerifyUrl(
    archive.signature.token,
    profile.verifyBaseUrl
  );

  const png = await renderSignatureStamp({
    verifyUrl,
    signatoryName: archive.signature.signatoryName,
    signatoryPosition: archive.signature.signatoryPosition,
    signatoryUnit: archive.signature.signatoryUnit,
    organizationName: profile.name,
    footerLine1:
      `Dokumen ini ditandatangani secara elektronik oleh ${profile.name}.`,
    footerLine2: `Pindai QR untuk verifikasi di ${stripScheme(verifyUrl)}.`,
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  });
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
