import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const revokeSchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Only a super admin can revoke a signature." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const archive = await prisma.archive.findUnique({
    where: { id: params.id },
    include: { signature: true },
  });
  if (!archive || !archive.signature) {
    return NextResponse.json({ error: "No signature on this archive" }, { status: 404 });
  }
  if (archive.signature.revokedAt) {
    return NextResponse.json({ error: "Signature already revoked" }, { status: 409 });
  }
  const updated = await prisma.archiveSignature.update({
    where: { id: archive.signature.id },
    data: {
      revokedAt: new Date(),
      revokedReason: parsed.data.reason,
      revokedById: session.user.id,
    },
  });
  await logAudit({
    action: "SIGN_REVOKE",
    entityType: "Archive",
    entityId: archive.id,
    userId: session.user.id,
    metadata: { reason: parsed.data.reason },
  });
  return NextResponse.json(updated);
}
