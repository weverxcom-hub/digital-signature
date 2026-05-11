import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildVerifyUrl } from "@/lib/signature";
import { getOrCreateOrganizationProfile } from "@/lib/profile";

export async function GET(req: Request, { params }: { params: { id: string } }) {
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
  const url = buildVerifyUrl(archive.signature.token, profile.verifyBaseUrl);

  const format = new URL(req.url).searchParams.get("format") ?? "png";
  if (format === "svg") {
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  }
  if (format === "dataurl" || format === "json") {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    return NextResponse.json({ url, dataUrl });
  }
  const buffer = await QRCode.toBuffer(url, { margin: 1, width: 320 });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png" },
  });
}
