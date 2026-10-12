"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addApiKeyAction,
  removeApiKeyAction,
  selectApiKeyAction,
  updateApiKeyModelAction,
  updateApiKeyProviderAction,
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
  const [providerState, providerAction, providerPending] = useActionState(
    updateApiKeyProviderAction,
    initialState,
  );
  const message = addState.message || selectState.message || removeState.message || providerState.message;

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
          <select
            name="provider"
            defaultValue="deepseek"
            className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
          </select>
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
            <div className="flex flex-wrap items-center gap-2">
              <ModelPicker key={`${apiKey.id}-${apiKey.provider}-${apiKey.model}`} apiKey={apiKey} />
              <form action={providerAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={apiKey.id} />
                <select
                  key={`${apiKey.id}-${apiKey.provider}`}
                  name="provider"
                  defaultValue={apiKey.provider}
                  aria-label={`Provider for ${apiKey.name}`}
                  className="h-10 rounded-xl border border-[var(--border)] bg-white px-2 text-sm"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                </select>
                <button type="submit" disabled={providerPending} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold disabled:opacity-60">
                  Save provider
                </button>
              </form>
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

function ModelPicker({ apiKey }: { apiKey: ApiKeySetting }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateApiKeyModelAction, initialState);
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState(apiKey.model ?? "");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (state.message === "Model updated.") router.refresh();
  }, [state.message, router]);

  async function loadModels() {
    if (models.length || loading) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(apiKey.id)}/models`, { cache: "no-store" });
      const payload = (await response.json()) as { models?: string[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to load models.");
      setModels(payload.models ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load models.");
    } finally {
      setLoading(false);
    }
  }

  const choices = [...new Set([apiKey.model, ...models].filter(Boolean))];
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={apiKey.id} />
      <input type="hidden" name="model" value={selected === "custom" ? custom : selected} />
      <label className="sr-only" htmlFor={`model-${apiKey.id}`}>Model for {apiKey.name}</label>
      <select
        id={`model-${apiKey.id}`}
        value={selected}
        onFocus={loadModels}
        onChange={(event) => setSelected(event.target.value)}
        className="h-10 max-w-56 rounded-xl border border-[var(--border)] bg-white px-2 text-sm"
      >
        <option value="">Default model</option>
        {choices.map((model) => <option key={model} value={model}>{model}</option>)}
        <option value="custom">Custom model ID...</option>
      </select>
      <button type="button" onClick={loadModels} disabled={loading} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm disabled:opacity-60">
        {loading ? "Loading..." : "Load models"}
      </button>
      {selected === "custom" ? (
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Model ID"
          aria-label={`Custom model ID for ${apiKey.name}`}
          required
          className="h-10 w-40 rounded-xl border border-[var(--border)] bg-white px-2 text-sm"
        />
      ) : null}
      <button type="submit" disabled={pending || loading} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving..." : "Save model"}
      </button>
      {loadError || (state.message && state.message !== "Model updated.") ? (
        <span role="alert" className="text-xs text-rose-700">{loadError || state.message}</span>
      ) : null}
    </form>
  );
}
