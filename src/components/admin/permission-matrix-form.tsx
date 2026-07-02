"use client";

import { useActionState } from "react";

import { savePermissionMatrixAction } from "@/app/admin/actions";
import {
  matrixPermissionKeys,
  permissionLabels,
} from "@/lib/permission-config";
import type { PermissionMatrix, Role } from "@/lib/types";

const roles: Role[] = ["admin", "bidder", "caller", "supportor"];

type PermissionMatrixFormProps = {
  matrix: PermissionMatrix;
};

const initialState = {
  message: "",
};

export function PermissionMatrixForm({ matrix }: PermissionMatrixFormProps) {
  const [state, action, pending] = useActionState(
    savePermissionMatrixAction,
    initialState,
  );

  return (
    <form action={action} className="rounded-[24px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-4 shadow-[0_12px_36px_rgba(24,34,24,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Role Permission Matrix</h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Manage which roles can view sections and access admin controls.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>

      {state.message ? (
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[color:var(--accent-soft)] px-4 py-3 text-sm">
          {state.message}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-left text-xs text-[color:var(--muted)]">
              <th className="px-3 py-2 font-medium">Permission</th>
              {roles.map((role) => (
                <th key={role} className="px-3 py-2 font-medium capitalize">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixPermissionKeys.map((permission) => (
              <tr key={permission} className="bg-[color:var(--background)]">
                <td className="rounded-l-xl px-3 py-2 text-sm font-medium">
                  {permissionLabels[permission]}
                </td>
                {roles.map((role, index) => {
                  const checked = matrix[role].includes(permission);

                  return (
                    <td
                      key={`${role}-${permission}`}
                      className={`px-3 py-3 text-center ${
                        index === roles.length - 1 ? "rounded-r-xl" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`${role}:${permission}`}
                        defaultChecked={checked}
                        className="h-4 w-4 accent-[color:var(--accent)]"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
