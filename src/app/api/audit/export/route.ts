import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard cap on rows that can be exported in a single request. Picked to
// stay well below Vercel's serverless response-size and execution
// budgets while still being practical for routine archival.
const MAX_EXPORT_ROWS = 10_000;

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Escape one field for CSV.
 *
 * Per RFC 4180:
 *  - wrap in double quotes if the field contains a comma, quote, or newline
 *  - escape embedded double quotes by doubling them
 */
function csvEscape(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function csvRow(fields: (string | null | undefined)[]): string {
  return fields.map((f) => csvEscape(f ?? "")).join(",");
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
  const where = buildWhere(searchParams);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
    include: { user: { select: { name: true, email: true } } },
  });

  // The export action itself is also worth auditing so admins can see
  // who has dumped the audit log offline.
  await logAudit({
    action: "AUDIT_EXPORT",
    entityType: "AuditLog",
    entityId: "export",
    userId: session.user.id,
    metadata: {
      filters: Object.fromEntries(searchParams.entries()),
      rowCount: rows.length,
      truncated: rows.length === MAX_EXPORT_ROWS,
    },
  });

  const header = csvRow([
    "When",
    "Action",
    "Entity Type",
    "Entity ID",
    "By",
    "Metadata",
  ]);
  const body = rows.map((r) =>
    csvRow([
      r.createdAt.toISOString(),
      r.action,
      r.entityType,
      r.entityId,
      r.user?.name || r.user?.email || "",
      r.metadata == null ? "" : JSON.stringify(r.metadata),
    ])
  );
  // Include a BOM so Excel auto-detects UTF-8 for Indonesian names with
  // diacritics.
  const csv = "\ufeff" + [header, ...body].join("\r\n") + "\r\n";

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
