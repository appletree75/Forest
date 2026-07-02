"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser, signOut } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { createFinanceTransaction, deleteFinanceTransaction } from "@/lib/finance";
import {
  clearAllBlockedLoginRateLimits,
  clearLoginRateLimit,
} from "@/lib/login-rate-limit";
import {
  matrixPermissionKeys,
  sanitizePermissionMatrix,
} from "@/lib/permission-config";
import { getPermissionMatrix, setPermissionMatrix } from "@/lib/permissions";
import { getProfiles, setProfileAssignments } from "@/lib/profiles";
import {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  revokeSession,
  revokeUserSessions,
  updateUser,
} from "@/lib/user-storage";
import type { ManagedUser, PermissionKey, Role } from "@/lib/types";

type ActionState = {
  message: string;
};

const roles: Role[] = ["admin", "bidder", "caller", "supportor"];

export async function savePermissionMatrixAction(
  _: ActionState,
  formData: FormData,
) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can change permissions.",
    };
  }

  const currentMatrix = await getPermissionMatrix();
  const matrix = sanitizePermissionMatrix(
    roles.reduce(
      (acc, role) => {
        const visiblePermissions = matrixPermissionKeys.filter((permission) =>
          formData.has(`${role}:${permission}`),
        ) as PermissionKey[];
        const hiddenPermissions = currentMatrix[role].filter(
          (permission) => !matrixPermissionKeys.includes(permission),
        );

        acc[role] = [...visiblePermissions, ...hiddenPermissions];
        return acc;
      },
      {} as Partial<Record<Role, PermissionKey[]>>,
    ),
  );

  await setPermissionMatrix(matrix);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.permissions_updated",
    targetType: "permission_matrix",
    targetLabel: "Role permissions",
  });
  revalidateTag("permission-matrix");

  return {
    message: "Permissions updated.",
  };
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

export async function saveProfileAssignmentsAction(
  _: ActionState,
  formData: FormData,
) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can change profile assignments.",
    };
  }

  const bidderUsers = (await getUsers()).filter(
    (candidate) => candidate.role === "bidder",
  );
  const profiles = await getProfiles();
  const assignments = bidderUsers.reduce<Record<string, string[]>>((acc, bidder) => {
    acc[bidder.id] = profiles
      .filter((profile) => formData.has(`${bidder.id}:${profile.id}`))
      .map((profile) => profile.id);
    return acc;
  }, {});

  await setProfileAssignments(assignments);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.profile_assignments_updated",
    targetType: "profile_assignments",
    targetLabel: "Bidder profile assignments",
    metadata: {
      bidderCount: bidderUsers.length,
      profileCount: profiles.length,
    },
  });
  revalidateTag("profile-assignments");
  revalidateTag("users");

  return {
    message: "Profile assignments updated for bidders.",
  };
}

export async function createUserAction(_: ActionState, formData: FormData) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can manage users.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;

  const validationMessage = validateUserInput({ name, email, password, role });

  if (validationMessage) {
    return {
      message: validationMessage,
    };
  }

  const users = await getUsers();

  if (users.some((candidate) => candidate.email.toLowerCase() === email)) {
    return {
      message: "Email already exists.",
    };
  }

  const createdUser = await createUser({
    name,
    email,
    password,
    role,
  });
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.user_created",
    targetType: "user",
    targetId: createdUser.id,
    targetLabel: createdUser.email,
    metadata: { role: createdUser.role },
  });
  revalidateTag("users");
  revalidateTag("salary-settings");

  return {
    message: "User created.",
  };
}

export async function updateUserAction(_: ActionState, formData: FormData) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      message: "Only administrators can manage users.",
    };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const bidderAppliedRate = Number(formData.get("bidderAppliedRate") ?? 0);
  const bidderFailedRate = Number(formData.get("bidderFailedRate") ?? 0);
  const callerHourlyRate = Number(formData.get("callerHourlyRate") ?? 0);

  if (!userId) {
    return {
      message: "User ID is required.",
    };
  }

  const validationMessage = validateUserInput({
    name,
    email,
    password: password || "unchanged",
    role,
  });

  if (validationMessage) {
    return {
      message: validationMessage,
    };
  }

  const users = await getUsers();
  const existing = users.find((candidate) => candidate.id === userId);

  if (!existing) {
    return {
      message: "User not found.",
    };
  }

  if (
    users.some(
      (candidate) =>
        candidate.id !== userId && candidate.email.toLowerCase() === email,
    )
  ) {
    return {
      message: "Email already exists.",
    };
  }

  const updatedUser = await updateUser(userId, {
    name,
    email,
    role,
    bidderAppliedRate,
    bidderFailedRate,
    callerHourlyRate,
    ...(password ? { password } : {}),
  });
  await createAuditLog({
    actorUserId: sessionUser.id,
    actorEmail: sessionUser.email,
    action: "admin.user_updated",
    targetType: "user",
    targetId: updatedUser.id,
    targetLabel: updatedUser.email,
    metadata: {
      role: updatedUser.role,
      bidderAppliedRate,
      bidderFailedRate,
      callerHourlyRate,
    },
  });
  revalidateTag("users");
  revalidateTag("salary-settings");

  return {
    message: "User updated.",
  };
}

export async function deleteUserAction(_: ActionState, formData: FormData) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      message: "Only administrators can manage users.",
    };
  }

  const userId = String(formData.get("userId") ?? "").trim();

  if (!userId) {
    return {
      message: "User ID is required.",
    };
  }

  const targetUser = await getUserById(userId);

  if (!targetUser) {
    return {
      message: "User not found.",
    };
  }

  if (targetUser.id === sessionUser.id) {
    return {
      message: "You cannot delete the current signed-in admin.",
    };
  }

  const users = await getUsers();
  const nextUsers = users.filter((candidate) => candidate.id !== userId);

  if (!nextUsers.some((candidate) => candidate.role === "admin")) {
    return {
      message: "At least one admin user must remain.",
    };
  }

  await deleteUser(userId);
  await createAuditLog({
    actorUserId: sessionUser.id,
    actorEmail: sessionUser.email,
    action: "admin.user_deleted",
    targetType: "user",
    targetId: targetUser.id,
    targetLabel: targetUser.email,
    metadata: { role: targetUser.role },
  });
  revalidateTag("users");
  revalidateTag("salary-settings");

  return {
    message: "User deleted.",
  };
}

export async function manageUserSessionsAction(_: ActionState, formData: FormData) {
  const sessionUser = await getSessionUser();

  if (!sessionUser || sessionUser.role !== "admin") {
    return {
      message: "Only administrators can manage sessions.",
    };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();

  if (!userId) {
    return {
      message: "User ID is required.",
    };
  }

  const targetUser = await getUserById(userId);

  if (!targetUser) {
    return {
      message: "User not found.",
    };
  }

  if (sessionId) {
    await revokeSession(sessionId);
    await createAuditLog({
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      action: "admin.session_revoked",
      targetType: "session",
      targetId: sessionId,
      targetLabel: targetUser.email,
      metadata: { userId },
    });
    revalidateTag("users");
    return {
      message: "Session revoked.",
    };
  }

  await revokeUserSessions(userId);
  await createAuditLog({
    actorUserId: sessionUser.id,
    actorEmail: sessionUser.email,
    action: "admin.user_sessions_revoked",
    targetType: "user",
    targetId: targetUser.id,
    targetLabel: targetUser.email,
  });
  revalidateTag("users");

  return {
    message: "All sessions revoked.",
  };
}

export async function addFinanceTransactionAction(
  _: ActionState,
  formData: FormData,
) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can manage finance.",
    };
  }

  const to = String(formData.get("to") ?? "").trim();
  const amount = formData.get("amount");
  const date = String(formData.get("date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!to) {
    return {
      message: "Recipient is required.",
    };
  }

  if (!date) {
    return {
      message: "Date is required.",
    };
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      message: "Valid amount is required.",
    };
  }

  const transaction = await createFinanceTransaction({
    to,
    amount: numericAmount,
    date,
    note,
  });
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.finance_transaction_added",
    targetType: "finance_transaction",
    targetId: transaction.id,
    targetLabel: transaction.to,
    metadata: {
      amount: transaction.amount,
      date: transaction.date,
    },
  });

  return {
    message: "Transaction added.",
  };
}

export async function deleteFinanceTransactionAction(
  _: ActionState,
  formData: FormData,
) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can manage finance.",
    };
  }

  const transactionId = String(formData.get("transactionId") ?? "").trim();

  if (!transactionId) {
    return {
      message: "Transaction ID is required.",
    };
  }

  await deleteFinanceTransaction(transactionId);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.finance_transaction_deleted",
    targetType: "finance_transaction",
    targetId: transactionId,
    targetLabel: transactionId,
  });

  return {
    message: "Transaction removed.",
  };
}

export async function clearBlockedLoginRateLimitAction(
  _: ActionState,
  formData: FormData,
) {
  const user = await getSessionUser();

  if (!user || user.role !== "admin") {
    return {
      message: "Only administrators can manage blocked logins.",
    };
  }

  const mode = String(formData.get("mode") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();

  if (mode === "all") {
    await clearAllBlockedLoginRateLimits();
    await createAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "admin.blocked_logins_cleared_all",
      targetType: "login_rate_limit",
      targetLabel: "All blocked logins",
    });
    return {
      message: "All blocked logins cleared.",
    };
  }

  if (!key) {
    return {
      message: "Blocked login key is required.",
    };
  }

  await clearLoginRateLimit(key);
  await createAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "admin.blocked_login_cleared",
    targetType: "login_rate_limit",
    targetId: key,
    targetLabel: key,
  });

  return {
    message: "Blocked login cleared.",
  };
}

function validateUserInput(user: Partial<ManagedUser>) {
  if (!user.name) {
    return "Name is required.";
  }

  if (!user.email || !user.email.includes("@")) {
    return "Valid email is required.";
  }

  if (!user.password) {
    return "Password is required.";
  }

  if (!roles.includes(user.role as Role)) {
    return "Valid role is required.";
  }

  return "";
}
