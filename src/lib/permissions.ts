import { unstable_cache } from "next/cache";

import { defaultPermissionMatrix } from "@/lib/permission-config";
import { ensureDatabaseConnected, getSettingsId } from "@/lib/database";
import { prisma } from "@/lib/prisma";
import type { PermissionMatrix } from "@/lib/types";

const getCachedPermissionMatrix = unstable_cache(
  async (): Promise<PermissionMatrix> => {
  await ensureDatabaseConnected();

  const settings = await prisma.appSettings.findUnique({
    where: { id: getSettingsId() },
  });

  if (!settings) {
    return defaultPermissionMatrix;
  }

  const parsed = settings.permissionMatrix as Partial<PermissionMatrix> | null;

  return {
    admin: parsed?.admin ?? defaultPermissionMatrix.admin,
    bidder: parsed?.bidder ?? defaultPermissionMatrix.bidder,
    caller: parsed?.caller ?? defaultPermissionMatrix.caller,
    supportor: parsed?.supportor ?? defaultPermissionMatrix.supportor,
  };
  },
  ["permission-matrix"],
  { tags: ["permission-matrix"] },
);

export async function getPermissionMatrix() {
  return getCachedPermissionMatrix();
}

export async function setPermissionMatrix(matrix: PermissionMatrix) {
  await ensureDatabaseConnected();

  await prisma.appSettings.update({
    where: { id: getSettingsId() },
    data: {
      permissionMatrix: matrix,
    },
  });
}

export {
  getRolePermissions,
  hasPermission,
  managedPermissionKeys,
  permissionLabels,
  sanitizePermissionMatrix,
} from "@/lib/permission-config";
