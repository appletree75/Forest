"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  addApiKeyAction,
  removeApiKeyAction,
  selectApiKeyAction,
} from "@/app/(protected)/settings/actions";
import type { ApiKeySetting } from "@/lib/types";

const initialState = { message: "" };

export function ApiKeySettings({
  apiKeys,
}: {
  apiKeys: ApiKeySetting[];
}) {
  const router = useRouter();
  const [addState, addAction, addPending] = useActionState(
    addApiKeyAction,
    initialState,
  );
  const [selectState, selectAction, selectPending] = useActionState(
    selectApiKeyAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeApiKeyAction,
    initialState,
  );
  const message = addState.message || selectState.message || removeState.message;

  useEffect(() => {
    if (!message) {
      return;
    }

    router.refresh();
  }, [message, router]);

  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-white p-5 shadow-[0_18px_50px_rgba(24,34,24,0.06)]">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
          Settings
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">API keys</h1>
      </div>

      <form action={addAction} className="grid gap-4 rounded-[22px] border border-[var(--border)] bg-[color:var(--background)] p-4 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Provider</span>
          <input
            name="provider"
            defaultValue="deepseek"
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            placeholder="DeepSeek Secondary"
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">API key</span>
          <input
            name="apiKey"
            type="password"
            placeholder="sk-..."
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={addPending}
          className="h-11 rounded-xl bg-[color:var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {addPending ? "Adding..." : "Add key"}
        </button>
      </form>

      {message ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {apiKeys.map((apiKey) => (
          <div
            key={apiKey.id}
            className="flex flex-col gap-3 rounded-[22px] border border-[var(--border)] bg-[color:var(--background)] px-4 py-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{apiKey.name}</span>
                {apiKey.isSelected ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    Selected
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-[color:var(--muted)]">
                {apiKey.provider} · {apiKey.apiKeyMasked}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!apiKey.isSelected ? (
                <form action={selectAction}>
                  <input type="hidden" name="id" value={apiKey.id} />
                  <button
                    type="submit"
                    disabled={selectPending}
                    className="h-10 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
                  >
                    Use
                  </button>
                </form>
              ) : null}
              <form
                action={removeAction}
                onSubmit={(event) => {
                  if (!window.confirm("Remove this API key?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={apiKey.id} />
                <button
                  type="submit"
                  disabled={removePending}
                  className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
                >
                  Remove
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
