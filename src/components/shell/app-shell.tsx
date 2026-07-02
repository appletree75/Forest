import type { ReactNode } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import type { PermissionKey, SessionUser } from "@/lib/types";

type AppShellProps = {
  children: ReactNode;
  user: SessionUser;
  permissions: PermissionKey[];
};

export function AppShell({ children, user, permissions }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} permissions={permissions} />
      <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
