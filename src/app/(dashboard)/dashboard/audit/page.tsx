import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditClient } from "./AuditClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  // Audit data can include LOGIN_FAILED attempts (which contain
  // attempted emails) and details about other users; restrict to
  // admins.
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <AuditClient
      initialRows={items.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))}
      initialTotal={total}
    />
  );
}
