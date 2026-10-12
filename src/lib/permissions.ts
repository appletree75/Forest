import { defaultPermissionMatrix } from "@/lib/permission-config";
import { isDatabaseUnavailable } from "@/lib/database";
import {
  getAppSettingsRow,
  updateAppSettingsPermissionMatrix,
} from "@/lib/app-settings";
import type { PermissionMatrix } from "@/lib/types";

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  try {
    const settings = await getAppSettingsRow();
    const parsed = settings.permissionMatrix as Partial<PermissionMatrix> | null;

    return {
      admin: parsed?.admin ?? defaultPermissionMatrix.admin,
      bidder: parsed?.bidder ?? defaultPermissionMatrix.bidder,
      caller: parsed?.caller ?? defaultPermissionMatrix.caller,
      supportor: parsed?.supportor ?? defaultPermissionMatrix.supportor,
    };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return defaultPermissionMatrix;
  }
}

export async function setPermissionMatrix(matrix: PermissionMatrix) {
  await updateAppSettingsPermissionMatrix(matrix as unknown as Record<string, unknown>);
}

export {
  getRolePermissions,
  hasPermission,
  managedPermissionKeys,
  permissionLabels,
  sanitizePermissionMatrix,
} from "@/lib/permission-config";
