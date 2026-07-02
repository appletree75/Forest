"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";

import {
  createProfileAction,
  deleteProfileAction,
  updateProfileAction,
} from "@/app/(protected)/profiles/actions";
import type { PersonalProfile } from "@/lib/types";

const initialState = {
  message: "",
};

type ProfileDirectoryProps = {
  profiles: PersonalProfile[];
};

export function ProfileDirectory({ profiles }: ProfileDirectoryProps) {
  const [createState, createAction, createPending] = useActionState(
    createProfileAction,
    initialState,
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (createState.message !== "Profile created.") {
      return;
    }

    const closeTimeoutId = window.setTimeout(() => {
      setCreateModalOpen(false);
    }, 0);

    return () => window.clearTimeout(closeTimeoutId);
  }, [createState.message]);

  return (
    <section className="rounded-[34px] border border-[rgba(28,82,54,0.12)] bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(243,247,240,0.98))] p-5 shadow-[0_20px_56px_rgba(24,34,24,0.08)] md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => exportProfilesAsTxt(profiles)}
          className="h-11 rounded-xl border border-[var(--border)] bg-white px-5 text-sm font-semibold"
        >
          Export All TXT
        </button>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="h-11 rounded-xl bg-[color:var(--accent)] px-5 text-sm font-semibold text-white"
        >
          New Profile
        </button>
      </div>

      <div className="grid gap-4">
        {profiles.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-3xl rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Profiles
                </div>
                <h3 className="mt-2 text-2xl font-semibold">New profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
                aria-label="Close new profile modal"
              >
                <CloseIcon />
              </button>
            </div>

            <form action={createAction} className="mt-5 grid gap-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <ModalField label="Full Name" name="fullName" />
                <ModalField label="Email" name="email" type="email" />
                <ModalField label="DOB" name="dob" />
                <ModalField label="Phone Number" name="phoneNumber" />
                <div className="xl:col-span-2">
                  <ModalField label="Address" name="address" />
                </div>
                <div className="xl:col-span-2">
                  <ModalField label="LinkedIn URL" name="linkedinUrl" />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[rgba(28,82,54,0.08)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className={`rounded-xl px-3 py-2 text-sm ${
                    createState.message && createState.message !== "Profile created."
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : "text-[color:var(--muted)]"
                  }`}
                >
                  {createState.message === "Profile created." ? "" : createState.message}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="h-11 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createPending}
                    className="h-11 rounded-xl bg-[color:var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {createPending ? "Creating..." : "Create profile"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProfileCard({ profile }: { profile: PersonalProfile }) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateProfileAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProfileAction,
    initialState,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (updateState.message !== "Profile updated.") {
      return;
    }

    const showTimeoutId = window.setTimeout(() => {
      setShowSaved(true);
    }, 0);
    const hideTimeoutId = window.setTimeout(() => {
      setShowSaved(false);
    }, 2200);

    return () => {
      window.clearTimeout(showTimeoutId);
      window.clearTimeout(hideTimeoutId);
    };
  }, [updateState.message]);

  return (
    <article className="overflow-hidden rounded-[26px] border border-[rgba(28,82,54,0.1)] bg-white shadow-[0_12px_36px_rgba(24,34,24,0.05)]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
            Profile
          </div>
          <div className="mt-2 text-xl font-semibold">{profile.fullName}</div>
          <div className="mt-1 truncate text-sm text-[color:var(--muted)]">
            {profile.email || "No email"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[rgba(28,82,54,0.1)] bg-[color:var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            {isOpen ? "Open" : "Closed"}
          </span>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <ChevronDownIcon />
          </span>
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-[rgba(28,82,54,0.08)] bg-[linear-gradient(180deg,rgba(251,252,248,0.86),rgba(246,249,243,0.86))] px-5 py-5">
          <form action={updateAction} className="grid gap-4">
            <input type="hidden" name="id" value={profile.id} />
            <div className="grid gap-4 xl:grid-cols-2">
              <EditableField label="Full Name" name="fullName" defaultValue={profile.fullName} />
              <EditableField label="Email" name="email" defaultValue={profile.email} type="email" />
              <EditableField label="DOB" name="dob" defaultValue={profile.dob} />
              <EditableField label="Phone Number" name="phoneNumber" defaultValue={profile.phoneNumber} />
              <div className="xl:col-span-2">
                <EditableField label="Address" name="address" defaultValue={profile.address} />
              </div>
              <div className="xl:col-span-2">
                <EditableField label="LinkedIn URL" name="linkedinUrl" defaultValue={profile.linkedinUrl} />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[rgba(28,82,54,0.08)] pt-4">
              <div
                className={`rounded-xl px-3 py-2 text-sm ${
                  showSaved
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : updateState.message && updateState.message !== "Profile updated."
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : deleteState.message
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "text-[color:var(--muted)]"
                }`}
              >
                {showSaved
                  ? "Profile updated."
                  : updateState.message || deleteState.message}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    formAction={deleteAction}
                    onClick={(event) => {
                      if (!window.confirm(`Delete profile ${profile.fullName}?`)) {
                        event.preventDefault();
                      }
                    }}
                    disabled={deletePending}
                    className="h-11 rounded-xl border border-rose-200 bg-rose-50 px-5 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    {deletePending ? "Deleting..." : "Delete Profile"}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportProfileAsTxt(profile)}
                    className="h-11 rounded-xl border border-[var(--border)] bg-white px-5 text-sm font-semibold"
                  >
                    Export TXT
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={updatePending}
                  className="h-11 rounded-xl bg-[color:var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {updatePending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </article>
  );
}

function EditableField({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3">
        <input
          type={type}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-full min-w-0 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={copyValue}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[var(--border)] bg-white text-[color:var(--muted)]"
          }`}
          aria-label={`Copy ${label}`}
          title={copied ? "Copied" : `Copy ${label}`}
        >
          <CopyIcon />
        </button>
      </div>
    </label>
  );
}

function ModalField({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        name={name}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
      />
    </label>
  );
}

function exportProfileAsTxt(profile: PersonalProfile) {
  const content = serializeProfile(profile);
  downloadTxtFile(`${slugify(profile.fullName || "profile")}.txt`, content);
}

function exportProfilesAsTxt(profiles: PersonalProfile[]) {
  const content = profiles.map(serializeProfile).join("\n\n------------------------------\n\n");
  downloadTxtFile("profiles.txt", content);
}

function serializeProfile(profile: PersonalProfile) {
  return [
    `Full Name: ${profile.fullName}`,
    `Email: ${profile.email}`,
    `DOB: ${profile.dob}`,
    `Address: ${profile.address}`,
    `Phone Number: ${profile.phoneNumber}`,
    `LinkedIn URL: ${profile.linkedinUrl}`,
  ].join("\n");
}

function downloadTxtFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
