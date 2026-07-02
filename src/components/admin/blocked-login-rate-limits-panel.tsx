"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clearBlockedLoginRateLimitAction } from "@/app/admin/actions";
import type { BlockedLoginRateLimitEntry } from "@/lib/login-rate-limit";

type BlockedLoginRateLimitsPanelProps = {
  entries: BlockedLoginRateLimitEntry[];
};

export function BlockedLoginRateLimitsPanel({
  entries,
}: BlockedLoginRateLimitsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredEntries = useMemo(() => {
    const query = filter.trim().toLowerCase();

    if (!query) {
      return entries;
    }

    return entries.filter((entry) =>
      `${entry.email} ${entry.ipAddress}`.toLowerCase().includes(query),
    );
  }, [entries, filter]);

  return (
    <section className="rounded-[24px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-4 shadow-[0_12px_36px_rgba(24,34,24,0.05)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Blocked Logins</h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Active login blocks by email and IP.
          </p>
        </div>
        {entries.length > 0 ? (
          <form
            onSubmit={(event) => {
              if (!window.confirm("Clear all blocked login entries?")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                await clearBlockedLoginRateLimitAction({ message: "" }, formData);
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="mode" value="all" />
            <button
              type="submit"
              disabled={isPending}
              className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 disabled:opacity-60"
            >
              Clear all
            </button>
          </form>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <div className="mb-4">
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by email or IP"
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none"
          />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
          No blocked login entries.
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
          No blocked entries match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.key}
              className="rounded-2xl border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{entry.email}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    IP {entry.ipAddress || "unknown"} - {entry.failedCount} failed attempts
                  </div>
                  <div className="mt-2 text-xs text-[color:var(--muted)]">
                    Blocked until {formatDate(entry.blockedUntil)}
                  </div>
                  <div className="mt-1 text-xs font-medium text-amber-700">
                    Remaining {formatRemainingTime(new Date(entry.blockedUntil).getTime() - now)}
                  </div>
                </div>
                <form
                  onSubmit={(event) => {
                    if (!window.confirm(`Clear login block for ${entry.email}?`)) {
                      event.preventDefault();
                      return;
                    }
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    startTransition(async () => {
                      await clearBlockedLoginRateLimitAction({ message: "" }, formData);
                      router.refresh();
                    });
                  }}
                >
                  <input type="hidden" name="mode" value="single" />
                  <input type="hidden" name="key" value={entry.key} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRemainingTime(ms: number) {
  if (ms <= 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
