import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const RoleEnum = z.enum(["SUPER_ADMIN", "ADMIN", "USER"]);

const updateUserSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(200).optional(),
    role: RoleEnum.optional(),
    active: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, active: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Self-protection: a super admin can't lock themselves out, demote
  // themselves, or be the only one left and toggled off. Other super
  // admins can be deactivated, but at least one active super admin must
  // always remain in the system.
  const isSelf = target.id === session.user.id;
  if (isSelf && parsed.data.role && parsed.data.role !== target.role) {
    return NextResponse.json(
      { error: "You cannot change your own role." },
      { status: 400 }
    );
  }
  if (isSelf && parsed.data.active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 }
    );
  }
  if (
    target.role === "SUPER_ADMIN" &&
    (parsed.data.role === "ADMIN" || parsed.data.role === "USER" ||
      parsed.data.active === false)
  ) {
    const otherActiveSuperAdmins = await prisma.user.count({
      where: {
        role: "SUPER_ADMIN",
        active: true,
        id: { not: target.id },
      },
    });
    if (otherActiveSuperAdmins === 0) {
      return NextResponse.json(
        { error: "At least one active super admin must remain." },
        { status: 400 }
      );
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.email !== undefined) {
    data.email = parsed.data.email.toLowerCase();
  }
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password !== undefined) {
    data.password = await bcrypt.hash(parsed.data.password, 10);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: target.id },
      data,
      select: USER_SELECT,
    });
    await logAudit({
      action: "USER_UPDATE",
      entityType: "User",
      entityId: updated.id,
      userId: session.user.id,
      metadata: {
        fields: Object.keys(data),
        passwordReset: parsed.data.password !== undefined ? true : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Another user already uses this email." },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (params.id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "SUPER_ADMIN") {
    const otherSuperAdmins = await prisma.user.count({
      where: { role: "SUPER_ADMIN", id: { not: target.id } },
    });
    if (otherSuperAdmins === 0) {
      return NextResponse.json(
        { error: "At least one super admin must remain." },
        { status: 400 }
      );
    }
  }

  // Hard delete is safe because User -> Archive/Signature/AuditLog
  // relations are nullable on the FK side (the schema sets userId to
  // null on parent delete via Prisma's default Restrict if not). If a
  // FK conflict surfaces, we fall back to deactivation to preserve
  // audit history.
  try {
    await prisma.user.delete({ where: { id: target.id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2003" || err.code === "P2014")
    ) {
      await prisma.user.update({
        where: { id: target.id },
        data: { active: false },
      });
      await logAudit({
        action: "USER_DELETE",
        entityType: "User",
        entityId: target.id,
        userId: session.user.id,
        metadata: { email: target.email, softDelete: true },
      });
      return NextResponse.json({ softDeleted: true });
    }
    throw err;
  }

  await logAudit({
    action: "USER_DELETE",
    entityType: "User",
    entityId: target.id,
    userId: session.user.id,
    metadata: { email: target.email },
  });
  return NextResponse.json({ deleted: true });
}
