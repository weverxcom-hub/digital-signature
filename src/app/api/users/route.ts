import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const RoleEnum = z.enum(["SUPER_ADMIN", "ADMIN", "USER"]);

const createUserSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  role: RoleEnum.optional(),
  active: z.boolean().optional(),
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const email = parsed.data.email.toLowerCase();
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        password: passwordHash,
        role: parsed.data.role ?? "USER",
        active: parsed.data.active ?? true,
      },
      select: USER_SELECT,
    });
    await logAudit({
      action: "USER_CREATE",
      entityType: "User",
      entityId: user.id,
      userId: session.user.id,
      metadata: { email: user.email, role: user.role },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }
    throw err;
  }
}
