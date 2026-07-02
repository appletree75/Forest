import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getSessionState } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, permissions } = await getSessionState();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user} permissions={permissions}>{children}</AppShell>;
}
