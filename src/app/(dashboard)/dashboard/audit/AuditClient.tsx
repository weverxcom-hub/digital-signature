"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils";

type Row = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  user: { id: string; name: string | null; email: string } | null;
};

const ACTIONS = [
  "ALL",
  "CREATE",
  "UPDATE",
  "DELETE",
  "SIGN",
  "SIGN_REVOKE",
  "EMBED_PDF",
  "BIND_DOCUMENT",
  "LOGIN",
  "LOGIN_FAILED",
  "PROFILE_UPDATE",
  "PROFILE_LOGO_UPLOAD",
  "PROFILE_LOGO_REMOVE",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DELETE",
  "AUDIT_EXPORT",
];

const ENTITY_TYPES = [
  "ALL",
  "Archive",
  "ArchiveSignature",
  "Signatory",
  "User",
  "OrganizationProfile",
  "AuditLog",
];

const PAGE_SIZE = 50;

export function AuditClient({
  initialRows,
  initialTotal,
}: {
  initialRows: Row[];
  initialTotal: number;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [total, setTotal] = useState<number>(initialTotal);
  const [action, setAction] = useState<string>("ALL");
  const [entityType, setEntityType] = useState<string>("ALL");
  const [entityId, setEntityId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [skip, setSkip] = useState<number>(0);

  const filters = useMemo(
    () => ({ action, entityType, entityId, q, from, to }),
    [action, entityType, entityId, q, from, to]
  );

  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams();
    if (action && action !== "ALL") params.set("action", action);
    if (entityType && entityType !== "ALL") params.set("entityType", entityType);
    if (entityId.trim()) params.set("entityId", entityId.trim());
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    return params;
  }

  async function runFetch(nextSkip: number, append = false) {
    setLoading(true);
    try {
      const params = buildParams({
        skip: String(nextSkip),
        take: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) {
        toast.error("Gagal memuat audit log");
        return;
      }
      const data = await res.json();
      const items: Row[] = Array.isArray(data?.items) ? data.items : [];
      setRows((prev) => (append ? [...prev, ...items] : items));
      if (typeof data?.total === "number") setTotal(data.total);
      setSkip(nextSkip);
    } finally {
      setLoading(false);
    }
  }

  // Re-run the query whenever a filter changes. We debounce free-text
  // inputs by 300 ms so the user doesn't hammer the API while typing.
  useEffect(() => {
    const id = setTimeout(() => {
      runFetch(0, false);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function exportCsv() {
    setExportingCsv(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/audit/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Gagal export CSV");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `audit-log-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  }

  function clearFilters() {
    setAction("ALL");
    setEntityType("ALL");
    setEntityId("");
    setQ("");
    setFrom("");
    setTo("");
  }

  const hasMore = rows.length < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-sm text-slate-500">
            Riwayat aksi yang terjadi di sistem. Gunakan filter untuk
            mempersempit hasil.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Menampilkan {rows.length} dari {total}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? "Mengekspor…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Maks. 10.000 baris per export CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="action">Aksi</Label>
            <select
              id="action"
              className="block h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="entityType">Tipe entitas</Label>
            <select
              id="entityType"
              className="block h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="entityId">Entity ID</Label>
            <Input
              id="entityId"
              placeholder="cuid / id…"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="q">Cari (entityId / action / type)</Label>
            <Input
              id="q"
              placeholder="kata kunci…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="from">Dari</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">Sampai</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={loading}
            >
              Bersihkan filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              {loading
                ? "Memuat…"
                : "Tidak ada audit log untuk filter ini."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Waktu</th>
                    <th className="px-4 py-2">Aksi</th>
                    <th className="px-4 py-2">Entitas</th>
                    <th className="px-4 py-2">Oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={badgeForAction(log.action)}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <span className="font-medium">{log.entityType}</span>
                        <span className="ml-2 break-all text-xs text-slate-400">
                          {log.entityId}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {log.user?.name || log.user?.email || (
                          <span className="text-slate-400">system</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runFetch(skip + PAGE_SIZE, true)}
            disabled={loading}
          >
            {loading ? "Memuat…" : "Muat lebih banyak"}
          </Button>
        </div>
      )}
    </div>
  );
}

function badgeForAction(action: string) {
  switch (action) {
    case "SIGN":
      return "success" as const;
    case "SIGN_REVOKE":
      return "danger" as const;
    case "DELETE":
    case "USER_DELETE":
      return "danger" as const;
    case "CREATE":
    case "USER_CREATE":
      return "info" as const;
    case "PROFILE_UPDATE":
    case "USER_UPDATE":
      return "warning" as const;
    case "LOGIN":
      return "default" as const;
    case "LOGIN_FAILED":
      return "danger" as const;
    case "AUDIT_EXPORT":
      return "info" as const;
    default:
      return "default" as const;
  }
}
