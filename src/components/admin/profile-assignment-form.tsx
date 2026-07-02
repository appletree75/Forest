"use client";

import { useActionState } from "react";

import { saveProfileAssignmentsAction } from "@/app/admin/actions";
import type { PersonalProfile, ProfileAssignmentMap, SessionUser } from "@/lib/types";

type ProfileAssignmentFormProps = {
  assignments: ProfileAssignmentMap;
  bidderUsers: SessionUser[];
  profiles: PersonalProfile[];
};

const initialState = {
  message: "",
};

export function ProfileAssignmentForm({
  assignments,
  bidderUsers,
  profiles,
}: ProfileAssignmentFormProps) {
  const [state, action, pending] = useActionState(
    saveProfileAssignmentsAction,
    initialState,
  );

  return (
    <form
      action={action}
      className="rounded-[24px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-4 shadow-[0_12px_36px_rgba(24,34,24,0.05)]"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Bidder Profile Assignment</h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Assign which profile names each bidder can see in Job Application.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save assignments"}
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
              <th className="px-3 py-2 font-medium">Bidder</th>
              {profiles.map((profile) => (
                <th key={profile.id} className="px-3 py-2 font-medium">
                  {profile.fullName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bidderUsers.map((bidder) => (
              <tr key={bidder.id} className="bg-[color:var(--background)]">
                <td className="rounded-l-xl px-3 py-2 text-sm font-medium">
                  {bidder.name}
                </td>
                {profiles.map((profile, index) => {
                  const checked = (assignments[bidder.id] ?? []).includes(profile.id);

                  return (
                    <td
                      key={`${bidder.id}-${profile.id}`}
                      className={`px-3 py-3 text-center ${
                        index === profiles.length - 1 ? "rounded-r-xl" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`${bidder.id}:${profile.id}`}
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
