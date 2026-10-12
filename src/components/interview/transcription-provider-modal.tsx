"use client";

import { useEffect, useState } from "react";

import type {
  TranscriptionProvider,
  TranscriptionProviderSetting,
} from "@/lib/types";

const defaultModels: Record<TranscriptionProvider, string> = {
  openai: "gpt-4o-mini-transcribe",
  deepgram: "nova-3",
};

export function TranscriptionProviderModal({ onClose }: { onClose: () => void }) {
  const [providers, setProviders] = useState<TranscriptionProviderSetting[]>([]);
  const [provider, setProvider] = useState<TranscriptionProvider>("openai");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(defaultModels.openai);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/transcription/providers", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          providers?: TranscriptionProviderSetting[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load providers.");
        }
        if (active) {
          setProviders(payload.providers ?? []);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Unable to load providers.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const addProvider = async () => {
    if (!name.trim() || !apiKey.trim()) {
      setMessage("Name and API key are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/transcription/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, name, apiKey, model }),
      });
      const payload = await readProviderPayload(response);
      setProviders(payload.providers);
      setName("");
      setApiKey("");
      setMessage("Provider added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add provider.");
    } finally {
      setSaving(false);
    }
  };

  const selectProvider = async (id: string) => {
    await updateProviders("PATCH", id, "Provider selected.");
  };

  const removeProvider = async (id: string) => {
    await updateProviders("DELETE", id, "Provider removed.");
  };

  const updateProviders = async (
    method: "PATCH" | "DELETE",
    id: string,
    successMessage: string,
  ) => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/transcription/providers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await readProviderPayload(response);
      setProviders(payload.providers);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update provider.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,15,0.35)] p-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-[var(--border)] bg-white p-6 shadow-[0_24px_80px_rgba(24,34,24,0.2)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Transcription settings</h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              Add credentials and select the provider used by every interview room.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]"
            aria-label="Close transcription settings"
          >
            X
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Provider</span>
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value as TranscriptionProvider;
                setProvider(next);
                setModel(defaultModels[next]);
              }}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[color:var(--background)] px-3 outline-none"
            >
              <option value="openai">OpenAI</option>
              <option value="deepgram">Deepgram</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Primary transcription"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[color:var(--background)] px-3 outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[color:var(--background)] px-3 outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Model</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[color:var(--background)] px-3 outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void addProvider()}
            disabled={saving}
            className="h-10 rounded-lg bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Add provider
          </button>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <div className="mb-3 text-sm font-semibold">Configured providers</div>
          {loading ? (
            <div className="text-sm text-[color:var(--muted)]">Loading providers...</div>
          ) : providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[color:var(--muted)]">
              Using the selected OpenAI key from Settings when available. Add a provider here to use a separate key or Deepgram.
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[color:var(--background)] p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.isSelected ? (
                        <span className="rounded-full bg-[#dceadb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#214930]">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {item.provider} · {item.model} · {item.apiKeyMasked}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!item.isSelected ? (
                      <button
                        type="button"
                        onClick={() => void selectProvider(item.id)}
                        disabled={saving}
                        className="h-8 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-medium disabled:opacity-60"
                      >
                        Select
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void removeProvider(item.id)}
                      disabled={saving}
                      className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {message ? <div className="mt-4 text-sm text-[color:var(--muted)]">{message}</div> : null}
      </div>
    </div>
  );
}

async function readProviderPayload(response: Response) {
  const payload = (await response.json()) as {
    providers?: TranscriptionProviderSetting[];
    message?: string;
  };
  if (!response.ok || !payload.providers) {
    throw new Error(payload.message || "Unable to update transcription providers.");
  }
  return { providers: payload.providers };
}
