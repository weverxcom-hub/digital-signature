import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Filter + paginate audit log entries. Mirrors the pattern used by
// /api/archives so the client can reuse the same skip/take logic.
const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildWhere(searchParams: URLSearchParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const action = searchParams.get("action")?.trim();
  const entityType = searchParams.get("entityType")?.trim();
  const entityId = searchParams.get("entityId")?.trim();
  const q = searchParams.get("q")?.trim();
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));

  if (action && action !== "ALL") where.action = action;
  if (entityType && entityType !== "ALL") where.entityType = entityType;
  if (entityId) {
    where.entityId = { contains: entityId, mode: "insensitive" };
  }
  if (q) {
    where.OR = [
      { entityId: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    // Inclusive end-of-day for `to` so users can pick a single date and
    // catch everything that happened that day.
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt.lte = endOfDay;
    }
  }
  return where;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const take = Math.max(
    1,
    Math.min(
      MAX_TAKE,
      Number.parseInt(searchParams.get("take") ?? "", 10) || DEFAULT_TAKE
    )
  );
  const skip = Math.max(
    0,
    Number.parseInt(searchParams.get("skip") ?? "", 10) || 0
  );

  const where = buildWhere(searchParams);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return NextResponse.json({ items, total, skip, take });
}
