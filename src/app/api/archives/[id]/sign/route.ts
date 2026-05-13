import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { computeSignatureHmac, generateSignatureToken } from "@/lib/signature";
import { deriveArchiveStatus } from "@/lib/archiveSignature";

const signSchema = z.object({
  signatoryId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = signSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const archive = await prisma.archive.findUnique({
    where: { id: params.id },
    include: { signatures: true },
  });
  if (!archive) {
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  }
  // Preserve single-signer behaviour at MVP: block while any active
  // signature exists. Schema supports 1:N for the future.
  const hasActiveSignature = archive.signatures.some((s) => !s.revokedAt);
  if (hasActiveSignature) {
    return NextResponse.json(
      { error: "This archive is already signed. Revoke the existing signature first." },
      { status: 409 }
    );
  }
  const signatory = await prisma.signatory.findUnique({
    where: { id: parsed.data.signatoryId },
  });
  if (!signatory || signatory.deletedAt || !signatory.active) {
    return NextResponse.json(
      { error: "Signatory not found or inactive" },
      { status: 400 }
    );
  }

  const token = generateSignatureToken();
  const signedAt = new Date();
  const hmac = computeSignatureHmac(
    {
      archiveId: archive.id,
      number: archive.number,
      subject: archive.subject,
      issuedAt: archive.issuedAt,
      signatoryId: signatory.id,
      signatoryName: signatory.name,
      signatoryPosition: signatory.position,
      signedAt,
    },
    token
  );

  const signature = await prisma.archiveSignature.create({
    data: {
      archiveId: archive.id,
      signatoryId: signatory.id,
      signatoryName: signatory.name,
      signatoryPosition: signatory.position,
      signatoryUnit: signatory.unit,
      token,
      hmac,
      signedById: session.user.id,
      signedAt,
    },
  });

  await prisma.archive.update({
    where: { id: archive.id },
    data: {
      status: deriveArchiveStatus([...archive.signatures, signature]),
    },
  });

  await logAudit({
    action: "SIGN",
    entityType: "Archive",
    entityId: archive.id,
    userId: session.user.id,
    metadata: {
      signatoryId: signatory.id,
      signatoryName: signatory.name,
      token,
    },
  });

  return NextResponse.json(signature, { status: 201 });
}
