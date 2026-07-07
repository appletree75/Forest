"use client";

import { useMemo, useState } from "react";

import type { AuditLogEntry } from "@/lib/audit-log";

type AuditLogPanelProps = {
  entries: AuditLogEntry[];
};

export function AuditLogPanel({ entries }: AuditLogPanelProps) {
  const [mode, setMode] = useState<"all" | "auth">("all");
  const [filter, setFilter] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    const source =
      mode === "auth"
        ? entries.filter((entry) => entry.action.startsWith("auth."))
        : entries;
    const query = filter.trim().toLowerCase();

    if (!query) {
      return source;
    }

    return source.filter((entry) =>
      [
        entry.actorEmail,
        entry.action,
        entry.targetLabel,
        entry.targetType,
        entry.ipAddress,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [entries, filter, mode]);

  return (
    <section className="rounded-[24px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-4 shadow-[0_12px_36px_rgba(24,34,24,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Audit Log</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--muted)]"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse audit log" : "Expand audit log"}
          title={isOpen ? "Collapse" : "Expand"}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {isOpen ? (
        <>
          <div className="mb-4 mt-4 flex items-start justify-between gap-4">
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
              <button
                type="button"
                onClick={() => setMode("all")}
                className={`h-8 rounded-lg px-3 text-sm font-medium ${
                  mode === "all"
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--muted)]"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setMode("auth")}
                className={`h-8 rounded-lg px-3 text-sm font-medium ${
                  mode === "auth"
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--muted)]"
                }`}
              >
                Auth
              </button>
            </div>
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter actor, action, target, or IP"
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
            />
          </div>

          {entries.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
              No audit entries yet.
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
              No audit entries match the current filter.
            </div>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-[var(--border)] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{formatAction(entry.action)}</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        {entry.actorEmail || "System"} - {formatAuditDate(entry.createdAt)}
                      </div>
                    </div>
                    <div className="rounded-full border border-[var(--border)] bg-[color:var(--background)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                      {entry.targetType.replaceAll("_", " ")}
                    </div>
                  </div>
                  {entry.targetLabel || entry.ipAddress ? (
                    <div className="mt-3 text-sm text-[color:var(--muted)]">
                      {entry.targetLabel ? `Target: ${entry.targetLabel}` : ""}
                      {entry.targetLabel && (entry.locationName || entry.ipAddress) ? " - " : ""}
                      {entry.locationName ? `Location ${entry.locationName} · ` : ""}
                      {entry.ipAddress ? `IP ${entry.ipAddress}` : ""}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
          Collapsed. Expand to view recent audit entries.
        </div>
      )}
    </section>
  );
}

function formatAction(value: string) {
  return value
    .split(".")
    .join(" ")
    .split("_")
    .join(" ");
}

function formatAuditDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
