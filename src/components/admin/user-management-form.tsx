"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";

import {
  createUserAction,
  deleteUserAction,
  manageUserSessionsAction,
  updateUserAction,
} from "@/app/admin/actions";
import type { ManagedUser, Role } from "@/lib/types";

const roles: Role[] = ["admin", "bidder", "caller", "supportor"];

const initialState = {
  message: "",
};

type UserManagementFormProps = {
  users: ManagedUser[];
};

export function UserManagementForm({ users }: UserManagementFormProps) {
  const [createState, createAction, createPending] = useActionState(
    createUserAction,
    initialState,
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const roleCounts = roles.map((role) => ({
    role,
    count: users.filter((user) => user.role === role).length,
  }));
  const usersByRole = roles.map((role) => ({
    role,
    users: users.filter((user) => user.role === role),
  }));

  return (
    <section className="overflow-hidden rounded-[26px] border border-[rgba(28,82,54,0.12)] bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(244,248,241,0.98))] shadow-[0_16px_44px_rgba(24,34,24,0.07)]">
      <div className="border-b border-[rgba(28,82,54,0.1)] bg-[linear-gradient(135deg,rgba(30,82,52,0.96),rgba(60,104,74,0.92))] px-5 py-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/65">
          Admin Control
        </div>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold">User Management</h2>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-white/78">
              Create, edit, delete, and assign roles for application users.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {roleCounts.map(({ role, count }) => (
              <div
                key={role}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur"
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                  {role}
                </div>
                <div className="mt-1 text-lg font-semibold">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 rounded-[22px] border border-[rgba(28,82,54,0.1)] bg-white p-4 shadow-[0_8px_24px_rgba(24,34,24,0.04)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                Create User
              </div>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Add a new account and assign the initial role.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="h-10 min-w-[120px] rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white"
            >
              Add user
            </button>
          </div>
        </div>

        {createState.message ? (
          <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[color:var(--accent-soft)] px-4 py-3 text-sm">
            {createState.message}
          </div>
        ) : null}

        <div className="grid gap-4">
          {usersByRole.map(({ role, users: roleUsers }) => (
            <RoleSection
              key={role}
              role={role}
              users={roleUsers}
            />
          ))}
        </div>
      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Create User
                </div>
                <h3 className="mt-2 text-2xl font-semibold">Add new account</h3>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Create a user and assign the initial role.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
                aria-label="Close create user modal"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <form
              action={createAction}
              className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-2"
            >
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Name</span>
                <input
                  type="text"
                  name="name"
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Email</span>
                <input
                  type="email"
                  name="email"
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Password</span>
                <PasswordField name="password" placeholder="Set password" />
              </label>
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium">Role</span>
                <select
                  name="role"
                  defaultValue="bidder"
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="h-10 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPending}
                  className="h-10 min-w-[120px] rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createPending ? "Creating..." : "Add user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RoleSection({
  role,
  users,
}: {
  role: Role;
  users: ManagedUser[];
}) {
  const [open, setOpen] = useState(false);
  const roleLabel = `${role.charAt(0).toUpperCase()}${role.slice(1)}s`;

  return (
    <section className="overflow-hidden rounded-[22px] border border-[rgba(28,82,54,0.1)] bg-white shadow-[0_8px_24px_rgba(24,34,24,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full border border-[rgba(28,82,54,0.1)] bg-[color:var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            {roleLabel}
          </div>
          <div className="text-sm text-[color:var(--muted)]">
            {users.length} total
          </div>
        </div>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="border-t border-[rgba(28,82,54,0.08)] bg-[linear-gradient(180deg,rgba(251,252,248,0.92),rgba(246,249,243,0.92))] p-3">
          {users.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
              No users in this role.
            </div>
          ) : (
            <div className="grid gap-3">
              {users.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function UserRow({ user }: { user: ManagedUser }) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateUserAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteUserAction,
    initialState,
  );
  const [sessionState, sessionAction, sessionPending] = useActionState(
    manageUserSessionsAction,
    initialState,
  );
  const [showUpdatedState, setShowUpdatedState] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(user.role);

  useEffect(() => {
    if (updateState.message !== "User updated.") {
      return;
    }

    const showTimeoutId = window.setTimeout(() => {
      setShowUpdatedState(true);
    }, 0);
    const hideTimeoutId = window.setTimeout(() => {
      setShowUpdatedState(false);
    }, 2000);

    return () => {
      window.clearTimeout(showTimeoutId);
      window.clearTimeout(hideTimeoutId);
    };
  }, [updateState.message]);

  return (
    <div className="rounded-[22px] border border-[rgba(28,82,54,0.1)] bg-white p-4 shadow-[0_8px_24px_rgba(24,34,24,0.04)]">
      <div className="mb-3 flex flex-col gap-3 border-b border-[var(--border)] pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-base font-semibold">{user.name}</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">
            {user.email}
          </div>
        </div>
        <div className="inline-flex w-fit rounded-full border border-[rgba(28,82,54,0.1)] bg-[color:var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          {user.role}
        </div>
      </div>

      <form
        action={updateAction}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <input type="hidden" name="userId" value={user.id} />
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            name="name"
            defaultValue={user.name}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
          />
        </label>
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            defaultValue={user.email}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
          />
        </label>
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Password</span>
          <PasswordField
            name="password"
            placeholder="Leave blank to keep current password"
          />
        </label>
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium">Role</span>
          <select
            name="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as Role)}
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        {selectedRole === "bidder" ? (
          <>
            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Per Applied Bid</span>
              <input
                type="number"
                name="bidderAppliedRate"
                min="0"
                step="0.01"
                defaultValue={user.bidderAppliedRate}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
              />
            </label>
            <label className="grid min-w-0 gap-2">
              <span className="text-sm font-medium">Per Failed Bid</span>
              <input
                type="number"
                name="bidderFailedRate"
                min="0"
                step="0.01"
                defaultValue={user.bidderFailedRate}
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
              />
            </label>
          </>
        ) : null}
        {selectedRole === "caller" ? (
          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium">Hourly Salary</span>
            <input
              type="number"
              name="callerHourlyRate"
              min="0"
              step="0.01"
              defaultValue={user.callerHourlyRate}
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
            />
          </label>
        ) : null}
        <div
          className={`flex items-end gap-3 ${
            selectedRole === "bidder"
              ? "xl:col-span-2"
              : selectedRole === "caller"
                ? "xl:col-span-3"
                : "xl:col-span-4"
          }`}
        >
          <button
            type="submit"
            disabled={updatePending}
            className={`h-10 min-w-[110px] rounded-xl px-4 text-sm font-semibold disabled:opacity-60 ${
              showUpdatedState
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-[var(--border)] bg-[color:var(--background)]"
            }`}
          >
            {updatePending ? (
              "Saving..."
            ) : showUpdatedState ? (
              <span className="flex items-center justify-center">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            ) : (
              "Update"
            )}
          </button>
          <button
            type="submit"
            formAction={deleteAction}
            onClick={(event) => {
              if (!window.confirm(`Delete user ${user.email}?`)) {
                event.preventDefault();
              }
            }}
            disabled={deletePending}
            className="h-10 min-w-[110px] rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
          >
            {deletePending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-[20px] border border-[rgba(28,82,54,0.08)] bg-[color:var(--background)] p-4">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
              Sessions
            </div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              {user.sessions.length} active session{user.sessions.length === 1 ? "" : "s"}
            </div>
          </div>
          <form action={sessionAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button
              type="submit"
              disabled={sessionPending || user.sessions.length === 0}
              onClick={(event) => {
                if (!window.confirm(`Revoke all sessions for ${user.email}?`)) {
                  event.preventDefault();
                }
              }}
              className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 disabled:opacity-60"
            >
              Revoke all
            </button>
          </form>
        </div>

        <div className="mt-3 grid gap-2">
          {user.sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--muted)]">
              No active sessions.
            </div>
          ) : (
            user.sessions.map((session) => (
              <form
                key={session.id}
                action={sessionAction}
                className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="sessionId" value={session.id} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Session {session.id.slice(0, 8)}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    Started {formatSessionDate(session.createdAt)} · Expires {formatSessionDate(session.expiresAt)}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    IP {session.ipAddress || "Unavailable"} · Device {session.deviceInfo || "Unavailable"}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={sessionPending}
                  onClick={(event) => {
                    if (!window.confirm(`Revoke this session for ${user.email}?`)) {
                      event.preventDefault();
                    }
                  }}
                  className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
                >
                  Revoke
                </button>
              </form>
            ))
          )}
        </div>
      </div>

      {updateState.message && updateState.message !== "User updated." ? (
        <div className="mt-4 inline-flex w-fit max-w-full items-center rounded-full border border-[var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium">
          {updateState.message}
        </div>
      ) : null}

      {!showUpdatedState && !updateState.message && deleteState.message ? (
        <div className="mt-4 inline-flex w-fit max-w-full items-center rounded-full border border-[var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium">
          {deleteState.message}
        </div>
      ) : null}

      {sessionState.message ? (
        <div className="mt-4 inline-flex w-fit max-w-full items-center rounded-full border border-[var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium">
          {sessionState.message}
        </div>
      ) : null}
    </div>
  );
}

function PasswordField({
  name,
  placeholder,
}: {
  name: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 pr-10 text-sm outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-[color:var(--muted)]"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 1.01-2.85 2.89-5.08 5.23-6.47" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.76 11.76 0 0 1-1.67 2.68" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="m1 1 22 22" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.06 12C3.8 7.11 8.06 4 12 4s8.2 3.11 9.94 8c-1.74 4.89-6 8-9.94 8s-8.2-3.11-9.94-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
