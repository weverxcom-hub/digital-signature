"use client";

import { useState } from "react";
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

type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  password: string;
};

const emptyForm: FormState = {
  id: "",
  email: "",
  name: "",
  role: "USER",
  active: true,
  password: "",
};

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const [list, setList] = useState<User[]>(initialUsers);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const isCreate = !!editing && editing.id === "";

  function openCreate() {
    setEditing({ ...emptyForm });
  }
  function openEdit(u: User) {
    setEditing({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      password: "",
    });
  }
  function cancel() {
    setEditing(null);
  }

  async function save() {
    if (!editing) return;
    if (!editing.email.trim() || !editing.name.trim()) {
      toast.error("Email and name are required.");
      return;
    }
    if (isCreate && editing.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (!isCreate && editing.password && editing.password.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      if (isCreate) {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: editing.email.trim(),
            name: editing.name.trim(),
            password: editing.password,
            role: editing.role,
            active: editing.active,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Could not create user.");
          return;
        }
        const created: User = await res.json();
        setList((prev) => [created, ...prev]);
        toast.success("User created.");
      } else {
        const body: Record<string, unknown> = {
          email: editing.email.trim(),
          name: editing.name.trim(),
          role: editing.role,
          active: editing.active,
        };
        if (editing.password) body.password = editing.password;
        const res = await fetch(`/api/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Could not update user.");
          return;
        }
        const updated: User = await res.json();
        setList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        toast.success("User updated.");
      }
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (u.id === currentUserId) {
      toast.error("You cannot delete your own account.");
      return;
    }
    const ok = window.confirm(
      `Delete user "${u.name}" (${u.email})? This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Could not delete user.");
        return;
      }
      const result = await res.json().catch(() => ({}));
      if (result.softDeleted) {
        // The account had child records (archives/signatures) so we
        // deactivated it instead of hard-deleting. Update the row in
        // place so the user can see the new state.
        setList((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, active: false } : x))
        );
        toast.info(
          "User has linked records; account was deactivated instead of deleted."
        );
      } else {
        setList((prev) => prev.filter((x) => x.id !== u.id));
        toast.success("User deleted.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-slate-500">
            Manage who can sign in to the dashboard. Only super admins
            can change roles or remove accounts.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          Add user
        </Button>
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{isCreate ? "Add user" : "Edit user"}</CardTitle>
            <CardDescription>
              {isCreate
                ? "Create a new dashboard account. The user will sign in with this email and password."
                : "Update the user's profile, role, status, or reset their password."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="userName">Name</Label>
              <Input
                id="userName"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <Label htmlFor="userRole">Role</Label>
              <select
                id="userRole"
                value={editing.role}
                onChange={(e) =>
                  setEditing({ ...editing, role: e.target.value as Role })
                }
                disabled={!isCreate && editing.id === currentUserId}
                className="block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super admin</option>
              </select>
              {!isCreate && editing.id === currentUserId && (
                <p className="mt-1 text-xs text-slate-500">
                  You can&rsquo;t change your own role.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="userPassword">
                {isCreate ? "Password" : "New password (optional)"}
              </Label>
              <Input
                id="userPassword"
                type="password"
                value={editing.password}
                onChange={(e) =>
                  setEditing({ ...editing, password: e.target.value })
                }
                placeholder={isCreate ? "min. 8 characters" : "Leave blank to keep"}
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="userActive"
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
                disabled={!isCreate && editing.id === currentUserId}
                className="h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed"
              />
              <Label htmlFor="userActive" className="mb-0">
                Active
              </Label>
              {!isCreate && editing.id === currentUserId && (
                <span className="text-xs text-slate-500">
                  (you can&rsquo;t deactivate yourself)
                </span>
              )}
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : isCreate ? "Create user" : "Save changes"}
              </Button>
              <Button variant="ghost" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {list.length} account{list.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No users yet. Add one to grant dashboard access.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{u.name}</p>
                      <Badge variant={badgeForRole(u.role)}>
                        {roleLabel(u.role)}
                      </Badge>
                      {u.active ? (
                        <Badge variant="success">active</Badge>
                      ) : (
                        <Badge variant="warning">inactive</Badge>
                      )}
                      {u.id === currentUserId && (
                        <Badge variant="info">you</Badge>
                      )}
                    </div>
                    <p className="break-all text-sm text-slate-600">{u.email}</p>
                    <p className="text-xs text-slate-500">
                      Added {formatDateTime(new Date(u.createdAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(u)}
                      disabled={u.id === currentUserId}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super admin";
    case "ADMIN":
      return "Admin";
    case "USER":
      return "User";
  }
}

function badgeForRole(role: Role) {
  switch (role) {
    case "SUPER_ADMIN":
      return "danger" as const;
    case "ADMIN":
      return "info" as const;
    case "USER":
      return "default" as const;
  }
}
