"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

type Signatory = {
  id: string;
  name: string;
  position: string;
  unit: string | null;
  nip: string | null;
  active: boolean;
};

const emptyForm = {
  id: "",
  name: "",
  position: "",
  unit: "",
  nip: "",
  active: true,
};

export function SignatoriesClient({ initial }: { initial: Signatory[] }) {
  const router = useRouter();
  const [list, setList] = useState<Signatory[]>(initial);
  const [editing, setEditing] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline confirmation pattern: tracks which row the user has armed
  // for deletion. Renders an explicit "Yakin hapus?" prompt next to the
  // row instead of relying on the browser's blocking window.confirm()
  // dialog (which is not accessible and gets blocked on iOS PWA).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingBusyId, setRemovingBusyId] = useState<string | null>(null);

  function openCreate() {
    setEditing({ ...emptyForm });
  }
  function openEdit(s: Signatory) {
    setEditing({
      id: s.id,
      name: s.name,
      position: s.position,
      unit: s.unit ?? "",
      nip: s.nip ?? "",
      active: s.active,
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    const body = {
      name: editing.name,
      position: editing.position,
      unit: editing.unit || null,
      nip: editing.nip || null,
      active: editing.active,
    };
    const isUpdate = !!editing.id;
    const res = await fetch(
      isUpdate ? `/api/signatories/${editing.id}` : "/api/signatories",
      {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      toast.error(data?.error || "Could not save");
      return;
    }
    toast.success(isUpdate ? "Signatory updated" : "Signatory added");
    setEditing(null);
    setList((prev) =>
      isUpdate
        ? prev.map((s) => (s.id === data.id ? data : s))
        : [data, ...prev]
    );
    router.refresh();
  }

  async function remove(id: string) {
    setRemovingBusyId(id);
    const res = await fetch(`/api/signatories/${id}`, { method: "DELETE" });
    setRemovingBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Gagal menghapus");
      return;
    }
    toast.success("Signatory dihapus");
    setDeletingId(null);
    setList((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Signatories</h1>
          <p className="text-sm text-slate-500">
            Orang yang dapat dipilih sebagai signer ketika admin
            menandatangani arsip.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          Tambah signatory
        </Button>
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editing.id ? "Edit signatory" : "Tambah signatory"}
            </CardTitle>
            <CardDescription>
              Nama lengkap dan jabatan akan di-snapshot ke setiap tanda
              tangan sehingga mengganti nama orang di kemudian hari
              tidak akan mengubah atestasi yang lama.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Nama lengkap *</Label>
                <Input
                  id="name"
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="Prof. Dr. Ir. ... M.T."
                />
              </div>
              <div>
                <Label htmlFor="position">Jabatan *</Label>
                <Input
                  id="position"
                  required
                  value={editing.position}
                  onChange={(e) =>
                    setEditing({ ...editing, position: e.target.value })
                  }
                  placeholder="Rektor, Wakil Rektor I, Dekan FE, …"
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit / fakultas</Label>
                <Input
                  id="unit"
                  value={editing.unit}
                  onChange={(e) =>
                    setEditing({ ...editing, unit: e.target.value })
                  }
                  placeholder="Opsional"
                />
              </div>
              <div>
                <Label htmlFor="nip">NIP / ID pegawai</Label>
                <Input
                  id="nip"
                  value={editing.nip}
                  onChange={(e) =>
                    setEditing({ ...editing, nip: e.target.value })
                  }
                  placeholder="Opsional"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
              Aktif (boleh menandatangani)
            </label>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Belum ada signatory. Tambahkan terlebih dahulu agar bisa
              menandatangani.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((s) => {
                const armed = deletingId === s.id;
                const busyDel = removingBusyId === s.id;
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{s.name}</p>
                        {s.active ? (
                          <Badge variant="success">aktif</Badge>
                        ) : (
                          <Badge variant="warning">nonaktif</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{s.position}</p>
                      {(s.unit || s.nip) && (
                        <p className="text-xs text-slate-500">
                          {[s.unit, s.nip && `NIP ${s.nip}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(s)}
                        disabled={armed}
                      >
                        Edit
                      </Button>
                      {armed ? (
                        <>
                          <span className="self-center text-xs text-slate-600">
                            Yakin hapus?
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => remove(s.id)}
                            disabled={busyDel}
                          >
                            {busyDel ? "Menghapus…" : "Ya, hapus"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                            disabled={busyDel}
                          >
                            Batal
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(s.id)}
                        >
                          Hapus
                        </Button>
                      )}
                    </div>
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
