import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const archiveSchema = z.object({
  number: z.string().min(1).max(200),
  subject: z.string().min(2).max(500),
  description: z.string().max(2000).optional().nullable(),
  issuedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const archives = await prisma.archive.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q } },
            { subject: { contains: q } },
          ],
        }
      : undefined,
    include: {
      signatures: {
        select: {
          id: true,
          token: true,
          signedAt: true,
          revokedAt: true,
          signatoryName: true,
          signatoryPosition: true,
        },
        orderBy: { signedAt: "desc" },
      },
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(archives);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const created = await prisma.archive.create({
    data: {
      number: parsed.data.number,
      subject: parsed.data.subject,
      description: parsed.data.description || null,
      issuedAt: new Date(parsed.data.issuedAt),
      createdById: session.user.id,
    },
  });
  await logAudit({
    action: "CREATE",
    entityType: "Archive",
    entityId: created.id,
    userId: session.user.id,
  });
  return NextResponse.json(created, { status: 201 });
}
