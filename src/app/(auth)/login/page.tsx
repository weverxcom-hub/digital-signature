import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }
  return <LoginForm />;
}
