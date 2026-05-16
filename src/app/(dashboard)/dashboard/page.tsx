import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getOrCreateOrganizationProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    archives,
    signed,
    signatories,
    audit,
    statusBreakdown,
    needsAction,
    archivesThisMonth,
    signaturesThisMonth,
    profile,
  ] = await Promise.all([
    prisma.archive.count(),
    prisma.archiveSignature.count({ where: { revokedAt: null } }),
    prisma.signatory.count({ where: { deletedAt: null } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    }),
    // Distribution of archives across their lifecycle states.
    prisma.archive.groupBy({ by: ["status"], _count: { _all: true } }),
    // Anything still requiring at least one signer is surfaced as
    // "needs action" so the admin sees what to attend to first.
    prisma.archive.findMany({
      where: { status: { in: ["DRAFT", "PENDING"] } },
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: {
        id: true,
        number: true,
        subject: true,
        issuedAt: true,
        status: true,
      },
    }),
    prisma.archive.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.archiveSignature.count({
      where: { signedAt: { gte: monthStart } },
    }),
    getOrCreateOrganizationProfile(),
  ]);

  const statusMap = new Map(
    statusBreakdown.map((b) => [b.status, b._count._all])
  );
  const statusItems: Array<{
    key: "DRAFT" | "PENDING" | "FULLY_SIGNED" | "REVOKED";
    label: string;
    variant: "default" | "warning" | "success" | "danger";
  }> = [
    { key: "DRAFT", label: "Draft", variant: "default" },
    { key: "PENDING", label: "Menunggu", variant: "warning" },
    { key: "FULLY_SIGNED", label: "Fully signed", variant: "success" },
    { key: "REVOKED", label: "Dicabut", variant: "danger" },
  ];

  // Surface unfinished setup steps as warnings so the admin can fix
  // them before they bite a verifier.
  const configWarnings: { title: string; href: string; body: string }[] = [];
  if (!profile.verifyBaseUrl) {
    configWarnings.push({
      title: "verifyBaseUrl belum diset",
      href: "/dashboard/profile",
      body: "QR akan menggunakan URL aplikasi (Vercel) sebagai fallback. Set ke domain resmi institusi untuk public trust.",
    });
  }
  if (!profile.logoMimeType && !profile.logoUrl) {
    configWarnings.push({
      title: "Logo belum diatur",
      href: "/dashboard/profile",
      body: "Upload logo agar muncul di header dashboard, halaman verifikasi, dan di tengah QR code.",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Ringkasan</h1>
          <p className="text-sm text-slate-500">
            Sekilas pandang arsip dan aktivitas tanda tangan.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/dashboard/archives">
            <Button>Arsip baru</Button>
          </Link>
        </div>
      </div>

      {configWarnings.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {configWarnings.map((w) => (
            <Link key={w.title} href={w.href}>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 transition hover:bg-amber-100">
                <p className="font-medium">{w.title}</p>
                <p className="mt-1 text-xs text-amber-800">{w.body}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Total arsip"
          value={archives}
          hint={`${archivesThisMonth} bulan ini`}
          href="/dashboard/archives"
        />
        <Stat
          label="Tanda tangan aktif"
          value={signed}
          hint={`${signaturesThisMonth} bulan ini`}
          href="/dashboard/archives"
        />
        <Stat
          label="Signatories"
          value={signatories}
          href="/dashboard/signatories"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribusi status arsip</CardTitle>
          <CardDescription>
            Ringkasan jumlah arsip per status lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {statusItems.map((s) => {
              const count = statusMap.get(s.key) ?? 0;
              return (
                <div
                  key={s.key}
                  className="flex items-center justify-between rounded border border-slate-100 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <span className="text-lg font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {needsAction.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Perlu tindakan</CardTitle>
            <CardDescription>
              Arsip yang masih berstatus draft atau menunggu tanda tangan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {needsAction.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/archives/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.number}
                    </Link>
                    <p className="truncate text-slate-600">{a.subject}</p>
                    <p className="text-xs text-slate-500">
                      Diterbitkan {formatDate(a.issuedAt)}
                    </p>
                  </div>
                  <Badge
                    variant={a.status === "DRAFT" ? "default" : "warning"}
                  >
                    {a.status === "DRAFT" ? "draft" : "menunggu"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <CardTitle>Aktivitas terbaru</CardTitle>
              <CardDescription>8 kejadian terakhir dari audit log.</CardDescription>
            </div>
            <Link
              href="/dashboard/audit"
              className="text-xs text-slate-500 hover:underline"
            >
              Lihat semua
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada aktivitas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {audit.map((log) => {
                const entityHref =
                  log.entityType === "Archive"
                    ? `/dashboard/archives/${log.entityId}`
                    : null;
                return (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badgeForAction(log.action)}>
                          {log.action}
                        </Badge>
                        <span className="font-medium">{log.entityType}</span>
                        {entityHref ? (
                          <Link
                            href={entityHref}
                            className="break-all text-xs text-slate-500 hover:underline"
                          >
                            {log.entityId}
                          </Link>
                        ) : (
                          <span className="break-all text-xs text-slate-400">
                            {log.entityId}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        oleh {log.user?.name || log.user?.email || "system"}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
}) {
  const content = (
    <Card className={href ? "transition hover:border-slate-300" : undefined}>
      <CardContent>
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold">{value}</p>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{hint ?? ""}</span>
          {href && <span className="hover:underline">Lihat semua →</span>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function badgeForAction(action: string) {
  switch (action) {
    case "SIGN":
      return "success" as const;
    case "SIGN_REVOKE":
    case "DELETE":
    case "USER_DELETE":
    case "LOGIN_FAILED":
      return "danger" as const;
    case "CREATE":
    case "USER_CREATE":
    case "AUDIT_EXPORT":
      return "info" as const;
    case "PROFILE_UPDATE":
    case "USER_UPDATE":
      return "warning" as const;
    default:
      return "default" as const;
  }
}
