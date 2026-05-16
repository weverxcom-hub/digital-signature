import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!isSuperAdmin(session.user.role)) {
    // ADMIN / USER roles can't manage other accounts.
    redirect("/dashboard");
  }
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return (
    <UsersClient
      initialUsers={users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      }))}
      currentUserId={session.user.id}
    />
  );
}
