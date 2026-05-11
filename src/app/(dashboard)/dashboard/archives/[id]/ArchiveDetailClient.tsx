"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { formatDate, formatDateTime } from "@/lib/utils";

type Signature = {
  id: string;
  token: string;
  signatoryName: string;
  signatoryPosition: string;
  signatoryUnit: string | null;
  signedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
} | null;

type Archive = {
  id: string;
  number: string;
  subject: string;
  description: string | null;
  issuedAt: string;
  createdBy: { id: string; name: string; email: string };
  signature: Signature;
};

type Signatory = { id: string; name: string; position: string };

type Profile = {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string;
};

export function ArchiveDetailClient({
  archive,
  signatories,
  verifyUrl,
  profile,
}: {
  archive: Archive;
  signatories: Signatory[];
  verifyUrl: string | null;
  profile: Profile;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [selectedSignatory, setSelectedSignatory] = useState(
    signatories[0]?.id ?? ""
  );
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    number: archive.number,
    subject: archive.subject,
    description: archive.description ?? "",
    issuedAt: archive.issuedAt.slice(0, 10),
  });

  const isSigned = !!archive.signature && !archive.signature.revokedAt;

  async function sign() {
    if (!selectedSignatory) {
      toast.error("Pick a signatory first");
      return;
    }
    setWorking(true);
    const res = await fetch(`/api/archives/${archive.id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatoryId: selectedSignatory }),
    });
    setWorking(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Could not sign archive");
      return;
    }
    toast.success("Archive signed");
    router.refresh();
  }

  async function revoke() {
    if (!revokeReason.trim()) {
      toast.error("Please provide a reason for revocation");
      return;
    }
    setRevoking(true);
    const res = await fetch(`/api/archives/${archive.id}/sign/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason }),
    });
    setRevoking(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Could not revoke signature");
      return;
    }
    toast.success("Signature revoked");
    router.refresh();
  }

  async function saveEdits() {
    setWorking(true);
    const res = await fetch(`/api/archives/${archive.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: form.number,
        subject: form.subject,
        description: form.description || null,
        issuedAt: new Date(form.issuedAt).toISOString(),
      }),
    });
    setWorking(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Could not save");
      return;
    }
    toast.success("Archive updated");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{archive.number}</h1>
          <p className="text-sm text-slate-600">{archive.subject}</p>
          <p className="text-xs text-slate-500">
            Issued {formatDate(archive.issuedAt)} · created by{" "}
            {archive.createdBy.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archive.signature?.revokedAt && (
            <Badge variant="danger">revoked</Badge>
          )}
          {isSigned && <Badge variant="success">signed</Badge>}
          {!archive.signature && <Badge variant="default">draft</Badge>}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Document metadata</CardTitle>
                  <CardDescription>
                    {isSigned
                      ? "Locked while signature is active. Revoke first to edit."
                      : "Edit the document metadata before signing."}
                  </CardDescription>
                </div>
                {!isSigned &&
                  (editing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  ))}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="number">Number</Label>
                      <Input
                        id="number"
                        value={form.number}
                        onChange={(e) =>
                          setForm({ ...form, number: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="issuedAt">Issued at</Label>
                      <Input
                        id="issuedAt"
                        type="date"
                        value={form.issuedAt}
                        onChange={(e) =>
                          setForm({ ...form, issuedAt: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={form.subject}
                      onChange={(e) =>
                        setForm({ ...form, subject: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      rows={3}
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                    />
                  </div>
                  <Button onClick={saveEdits} disabled={working}>
                    {working ? "Saving…" : "Save"}
                  </Button>
                </div>
              ) : (
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <Field label="Number">{archive.number}</Field>
                  <Field label="Issued at">{formatDate(archive.issuedAt)}</Field>
                  <Field label="Subject" wide>
                    {archive.subject}
                  </Field>
                  <Field label="Description" wide>
                    {archive.description || (
                      <span className="text-slate-400">—</span>
                    )}
                  </Field>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signature</CardTitle>
              <CardDescription>
                {isSigned
                  ? "This archive is signed. Anyone with the QR can verify it."
                  : "Pick a signatory and sign the archive. A unique QR code will be generated."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!archive.signature && (
                <div className="space-y-3">
                  {signatories.length === 0 ? (
                    <p className="text-sm text-amber-700">
                      No active signatory available. Add one in the Signatories
                      page first.
                    </p>
                  ) : (
                    <div>
                      <Label htmlFor="signatory">Signatory</Label>
                      <select
                        id="signatory"
                        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                        value={selectedSignatory}
                        onChange={(e) => setSelectedSignatory(e.target.value)}
                      >
                        {signatories.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.position}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Button onClick={sign} disabled={working || signatories.length === 0}>
                    {working ? "Signing…" : "Sign archive"}
                  </Button>
                </div>
              )}

              {archive.signature && (
                <div className="space-y-3">
                  <dl className="grid gap-3 text-sm md:grid-cols-2">
                    <Field label="Signatory">
                      {archive.signature.signatoryName}
                    </Field>
                    <Field label="Position">
                      {archive.signature.signatoryPosition}
                    </Field>
                    {archive.signature.signatoryUnit && (
                      <Field label="Unit">
                        {archive.signature.signatoryUnit}
                      </Field>
                    )}
                    <Field label="Signed at">
                      {formatDateTime(archive.signature.signedAt)}
                    </Field>
                    <Field label="Token" wide>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {archive.signature.token}
                      </code>
                    </Field>
                  </dl>
                  {archive.signature.revokedAt ? (
                    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p className="font-medium">
                        Revoked on{" "}
                        {formatDateTime(archive.signature.revokedAt)}
                      </p>
                      {archive.signature.revokedReason && (
                        <p className="mt-1">
                          Reason: {archive.signature.revokedReason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="revokeReason">Revoke signature</Label>
                      <Input
                        id="revokeReason"
                        placeholder="Reason (required)"
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={revoke}
                        disabled={revoking}
                      >
                        {revoking ? "Revoking…" : "Revoke signature"}
                      </Button>
                      <p className="text-xs text-slate-500">
                        Only super-admin can revoke. The verification page will
                        show this archive as revoked.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verification QR</CardTitle>
              <CardDescription>
                Embed this on the printed/PDF version of your document.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSigned && verifyUrl ? (
                <div className="space-y-3 text-center">
                  <div className="mx-auto inline-block rounded-lg border border-slate-200 bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/archives/${archive.id}/qr`}
                      alt="Verification QR"
                      width={240}
                      height={240}
                      className="h-60 w-60"
                    />
                  </div>
                  <p className="break-all rounded bg-slate-100 p-2 text-xs">
                    {verifyUrl}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <a
                      href={`/api/archives/${archive.id}/qr`}
                      download={`qr-${archive.number}.png`}
                    >
                      <Button size="sm" variant="outline">
                        Download PNG
                      </Button>
                    </a>
                    <a
                      href={`/api/archives/${archive.id}/qr?format=svg`}
                      download={`qr-${archive.number}.svg`}
                    >
                      <Button size="sm" variant="outline">
                        Download SVG
                      </Button>
                    </a>
                    <a href={verifyUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        Open
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Sign this archive first to generate a QR code.
                </p>
              )}
            </CardContent>
          </Card>

          {profile.logoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Branding preview</CardTitle>
                <CardDescription>
                  Public verification page will show this org identity.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Image
                  src={profile.logoUrl}
                  alt={profile.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded object-contain"
                  unoptimized
                />
                <div>
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-xs text-slate-500">
                    Brand color{" "}
                    <span
                      className="ml-1 inline-block h-3 w-3 rounded"
                      style={{ backgroundColor: profile.primaryColor }}
                    />
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}
