import { redirect } from "next/navigation";

import { getSessionState } from "@/lib/auth";
import { permissionLabels } from "@/lib/permission-config";
import type { PermissionKey } from "@/lib/types";

type AccessGuardProps = {
  permission: PermissionKey;
  children: React.ReactNode;
};

export async function AccessGuard({
  permission,
  children,
}: AccessGuardProps) {
  const { user, permissions } = await getSessionState();

  if (!user) {
    redirect("/login");
  }

  if (!permissions.includes(permission)) {
    return (
      <div className="rounded-[32px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
          Access Restricted
        </div>
        <h1 className="mt-3 text-3xl font-semibold">
          You cannot access {permissionLabels[permission]}.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
          Your current role does not include this permission. An administrator
          can change this in the admin page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
