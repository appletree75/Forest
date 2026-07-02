import type { PermissionKey, PermissionMatrix, Role } from "@/lib/types";

export const permissionLabels: Record<PermissionKey, string> = {
  view_dashboard: "Dashboard",
  view_job_application: "Job Application",
  view_interview: "Interview",
  view_chat: "Chat",
  view_profile: "My Profile",
  view_profiles: "Profiles",
  view_admin: "Admin",
  manage_permissions: "Manage permissions",
  manage_users: "Manage users",
};

export const defaultPermissionMatrix: PermissionMatrix = {
  admin: [
    "view_dashboard",
    "view_job_application",
    "view_interview",
    "view_chat",
    "view_profile",
    "view_profiles",
    "view_admin",
    "manage_permissions",
    "manage_users",
  ],
  bidder: [
    "view_dashboard",
    "view_job_application",
    "view_chat",
    "view_profile",
  ],
  caller: [
    "view_dashboard",
    "view_interview",
    "view_chat",
    "view_profile",
  ],
  supportor: ["view_dashboard", "view_chat", "view_profile"],
};

export const managedPermissionKeys = Object.keys(
  permissionLabels,
) as PermissionKey[];

export const matrixPermissionKeys = managedPermissionKeys.filter(
  (key) =>
    key !== "manage_permissions" &&
    key !== "manage_users" &&
    key !== "view_profile",
) as PermissionKey[];

export function getRolePermissions(
  matrix: PermissionMatrix,
  role: Role,
): PermissionKey[] {
  return matrix[role] ?? [];
}

export function hasPermission(
  matrix: PermissionMatrix,
  role: Role,
  permission: PermissionKey,
) {
  return getRolePermissions(matrix, role).includes(permission);
}

export function sanitizePermissionMatrix(
  input: Partial<Record<Role, PermissionKey[]>>,
): PermissionMatrix {
  const filteredEntries = (role: Role) => {
    const values = input[role] ?? [];
    return managedPermissionKeys.filter((key) => values.includes(key));
  };

  return {
    admin: filteredEntries("admin"),
    bidder: filteredEntries("bidder"),
    caller: filteredEntries("caller"),
    supportor: filteredEntries("supportor"),
  };
}
