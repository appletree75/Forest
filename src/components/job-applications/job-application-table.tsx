"use client";

import { useEffect, useRef, useState } from "react";

import {
  createBlankRow,
  createInitialRows,
  platformOptions,
  stackOptions,
} from "@/lib/job-applications";
import { StatusSelect } from "@/components/job-applications/status-select";
import type {
  ApplicationStatus,
  JobApplication,
  JobApplicationTables,
  PersonalProfile,
  Platform,
  ProfileAssignmentMap,
  Role,
  SalarySettings,
  SessionUser,
  Stack,
} from "@/lib/types";

const tableCopyStorageKey = "forest_job_application_table_copy";

const copyableColumns = [
  { key: "platform", label: "Platform" },
  { key: "company", label: "Company" },
  { key: "url", label: "URL" },
  { key: "stack", label: "Stack" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
] as const;

type CopyableColumnKey = (typeof copyableColumns)[number]["key"];

type CopiedTablePayload = {
  columns: CopyableColumnKey[];
  dayKey: string;
  profileId: string;
  profileName: string;
  rows: JobApplication[];
};

type JobApplicationTableProps = {
  profiles: PersonalProfile[];
  initialTables: JobApplicationTables;
  role: Role;
  currentUserId: string;
  bidderUsers: SessionUser[];
  assignments: ProfileAssignmentMap;
  salarySettings: SalarySettings;
  serverTodayKey: string;
};

export function JobApplicationTable({
  profiles,
  initialTables,
  role,
  currentUserId,
  bidderUsers,
  assignments,
  salarySettings,
  serverTodayKey,
}: JobApplicationTableProps) {
  const dayInputRef = useRef<HTMLInputElement>(null);
  const hasMountedRef = useRef(false);
  const isAdmin = role === "admin";
  const [selectedBidderId, setSelectedBidderId] = useState("all");
  const [selectedProfileId, setSelectedProfileId] = useState(
    profiles[0]?.id ?? "",
  );
  const [selectedDayKey, setSelectedDayKey] = useState(serverTodayKey);
  const [copiedKey, setCopiedKey] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [pasteStatus, setPasteStatus] = useState("");
  const [isToolsSidebarOpen, setIsToolsSidebarOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<CopyableColumnKey[]>([
    "platform",
    "company",
    "url",
    "stack",
    "description",
    "status",
  ]);
  const [copiedTable, setCopiedTable] = useState<CopiedTablePayload | null>(null);
  const [tablesByProfile, setTablesByProfile] =
    useState<JobApplicationTables>(initialTables);
  const filteredProfiles = getFilteredProfiles(
    profiles,
    selectedBidderId,
    assignments,
  );
  const activeProfileId = getActiveProfileId(selectedProfileId, filteredProfiles);
  const activeRows =
    activeProfileId && selectedDayKey
      ? tablesByProfile[activeProfileId]?.[selectedDayKey] ??
        createInitialRows().map((row) => ({ ...row }))
      : [];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCopiedTable(getStoredCopiedTable());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const rowsToSave =
        activeProfileId && selectedDayKey
          ? tablesByProfile[activeProfileId]?.[selectedDayKey] ??
            createInitialRows().map((row) => ({ ...row }))
          : [];

      await fetch("/api/job-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: activeProfileId,
          dayKey: selectedDayKey,
          rows: rowsToSave,
        }),
      });
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [activeProfileId, selectedDayKey, tablesByProfile]);
  const updateRow = <K extends keyof JobApplication>(
    profileId: string,
    dayKey: string,
    id: number,
    field: K,
    value: JobApplication[K],
  ) => {
    setTablesByProfile((currentTables) => ({
      ...currentTables,
      [profileId]: {
        ...(currentTables[profileId] ?? {}),
        [dayKey]: (
          currentTables[profileId]?.[dayKey] ??
          createInitialRows().map((row) => ({ ...row }))
        ).map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      },
    }));
  };

  const addRows = () => {
    if (!activeProfileId || !selectedDayKey) {
      return;
    }

    setTablesByProfile((currentTables) => {
      const currentRows =
        currentTables[activeProfileId]?.[selectedDayKey] ??
        createInitialRows().map((row) => ({ ...row }));
      const nextId =
        currentRows.length === 0
          ? 1
          : Math.max(...currentRows.map((row) => row.id)) + 1;

      const newRows = Array.from({ length: 10 }, (_, index) =>
        createBlankRow(nextId + index),
      );

      return {
        ...currentTables,
        [activeProfileId]: {
          ...(currentTables[activeProfileId] ?? {}),
          [selectedDayKey]: [...currentRows, ...newRows],
        },
      };
    });
  };

  const insertRowAfter = (rowId: number) => {
    if (!activeProfileId || !selectedDayKey || !isAdmin) {
      return;
    }

    setTablesByProfile((currentTables) => {
      const currentRows =
        currentTables[activeProfileId]?.[selectedDayKey] ??
        createInitialRows().map((row) => ({ ...row }));
      const insertIndex = currentRows.findIndex((row) => row.id === rowId);

      if (insertIndex === -1) {
        return currentTables;
      }

      const nextRows = [...currentRows];
      nextRows.splice(insertIndex + 1, 0, createBlankRow(0));

      return {
        ...currentTables,
        [activeProfileId]: {
          ...(currentTables[activeProfileId] ?? {}),
          [selectedDayKey]: renumberRows(nextRows),
        },
      };
    });
  };

  const removeRow = (rowId: number) => {
    if (!activeProfileId || !selectedDayKey || !isAdmin) {
      return;
    }

    setTablesByProfile((currentTables) => {
      const currentRows =
        currentTables[activeProfileId]?.[selectedDayKey] ??
        createInitialRows().map((row) => ({ ...row }));
      const nextRows = currentRows.filter((row) => row.id !== rowId);

      return {
        ...currentTables,
        [activeProfileId]: {
          ...(currentTables[activeProfileId] ?? {}),
          [selectedDayKey]:
            nextRows.length > 0 ? renumberRows(nextRows) : [createBlankRow(1)],
        },
      };
    });
  };

  const toggleColumn = (column: CopyableColumnKey) => {
    setSelectedColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : [...current, column],
    );
  };

  const copyTable = () => {
    if (!activeProfileId || selectedColumns.length === 0) {
      return;
    }

    const activeProfile = filteredProfiles.find(
      (profile) => profile.id === activeProfileId,
    );
    const payload: CopiedTablePayload = {
      columns: selectedColumns,
      dayKey: selectedDayKey,
      profileId: activeProfileId,
      profileName: activeProfile?.fullName ?? "",
      rows: rows.map((row) => ({ ...row })),
    };

    window.localStorage.setItem(tableCopyStorageKey, JSON.stringify(payload));
    setCopiedTable(payload);
    setCopyStatus("Copied");
    window.setTimeout(() => {
      setCopyStatus((current) => (current === "Copied" ? "" : current));
    }, 1500);
  };

  const pasteTable = () => {
    if (!activeProfileId || !selectedDayKey || !copiedTable) {
      return;
    }

    const columnsToPaste = copiedTable.columns;

    if (columnsToPaste.length === 0) {
      return;
    }

    setTablesByProfile((currentTables) => {
      const currentRows =
        currentTables[activeProfileId]?.[selectedDayKey] ??
        createInitialRows().map((row) => ({ ...row }));
      const currentRowsMap = new Map(currentRows.map((row) => [row.id, row]));
      const sourceRowsMap = new Map(copiedTable.rows.map((row) => [row.id, row]));
      const maxId = Math.max(
        currentRows.length === 0 ? 0 : Math.max(...currentRows.map((row) => row.id)),
        copiedTable.rows.length === 0
          ? 0
          : Math.max(...copiedTable.rows.map((row) => row.id)),
      );

      const mergedRows = Array.from({ length: maxId }, (_, index) => {
        const id = index + 1;
        const baseRow = currentRowsMap.get(id) ?? createBlankRow(id);
        const sourceRow = sourceRowsMap.get(id);

        if (!sourceRow) {
          return baseRow;
        }

        return applyCopiedColumns(baseRow, sourceRow, columnsToPaste);
      });

      return {
        ...currentTables,
        [activeProfileId]: {
          ...(currentTables[activeProfileId] ?? {}),
          [selectedDayKey]: mergedRows,
        },
      };
    });

    setPasteStatus("Pasted");
    window.setTimeout(() => {
      setPasteStatus((current) => (current === "Pasted" ? "" : current));
    }, 1500);
  };

  const clearTable = () => {
    if (!activeProfileId || !selectedDayKey) {
      return;
    }

    const confirmed = window.confirm(
      "Clear all rows for the current profile and selected day?",
    );

    if (!confirmed) {
      return;
    }

    setTablesByProfile((currentTables) => ({
      ...currentTables,
      [activeProfileId]: {
        ...(currentTables[activeProfileId] ?? {}),
        [selectedDayKey]: createInitialRows().map((row) => ({ ...row })),
      },
    }));
  };

  const rows = activeRows;
  const bidderReadOnly = role === "bidder";
  const bidderEditLocked =
    bidderReadOnly && isBidderTableLocked(selectedDayKey, serverTodayKey);
  const duplicateUrlSet = getDuplicateUrlSet(rows);
  const currentBidderRates = getCurrentBidderRates(
    salarySettings,
    role,
    currentUserId,
    selectedBidderId,
  );
  const totalUrls = rows.filter((row) => row.url.trim() !== "").length;
  const appliedUrls = rows.filter(
    (row) => row.url.trim() !== "" && row.status === "Applied",
  ).length;
  const failedUrls = rows.filter(
    (row) => row.url.trim() !== "" && row.status === "Failed",
  ).length;
  const appliedBudget = appliedUrls * currentBidderRates.bidderAppliedRate;
  const failedBudget = failedUrls * currentBidderRates.bidderFailedRate;
  const totalBudget = appliedBudget + failedBudget;

  const copyUrl = async (url: string, rowId: number) => {
    if (!url) {
      return;
    }

    await navigator.clipboard.writeText(url);
    const key = `${activeProfileId}:${selectedDayKey}:${rowId}`;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? "" : current));
    }, 1500);
  };

  const openUrl = (url: string) => {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (profiles.length === 0) {
    return (
      <section className="rounded-[32px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-6 shadow-[0_16px_50px_rgba(24,34,24,0.06)]">
        <h2 className="text-xl font-semibold">Application Table</h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
          No profiles are available for this user yet. An administrator needs to
          assign at least one profile.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-6 shadow-[0_16px_50px_rgba(24,34,24,0.06)]">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Application Table</h2>
      </div>

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isAdmin ? (
            <div className="grid w-72 gap-2">
              <label
                htmlFor="bidder-select"
                className="text-sm font-medium text-[color:var(--muted)]"
              >
                Bidder
              </label>
              <select
                id="bidder-select"
                value={selectedBidderId}
                onChange={(event) => {
                  const bidderId = event.target.value;
                  const nextProfiles = getFilteredProfiles(
                    profiles,
                    bidderId,
                    assignments,
                  );
                  setSelectedBidderId(bidderId);
                  setSelectedProfileId(
                    nextProfiles.some((profile) => profile.id === selectedProfileId)
                      ? selectedProfileId
                      : (nextProfiles[0]?.id ?? ""),
                  );
                }}
                className="h-10 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none"
              >
                <option value="all">All</option>
                {bidderUsers.map((bidder) => (
                  <option key={bidder.id} value={bidder.id}>
                    {bidder.name} ({bidder.email})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid w-72 gap-2">
            <label
              htmlFor="profile-select"
              className="text-sm font-medium text-[color:var(--muted)]"
            >
              Profile
            </label>
            <select
              id="profile-select"
              value={activeProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
              className="h-10 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none"
            >
              {filteredProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid w-64 gap-2">
            <label
              htmlFor="day-select"
              className="text-sm font-medium text-[color:var(--muted)]"
            >
              Day
            </label>
            <div
              className="w-full cursor-pointer border border-[var(--border)] bg-white"
              onClick={() => dayInputRef.current?.showPicker?.()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  dayInputRef.current?.showPicker?.();
                }
              }}
            >
              <input
                ref={dayInputRef}
                id="day-select"
                type="date"
                value={selectedDayKey}
                onChange={(event) => setSelectedDayKey(event.target.value)}
                className="h-10 w-full cursor-pointer border-0 bg-white px-3 text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:min-w-[420px]">
          <div className="border border-[var(--border)] bg-[color:var(--background)] px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">
              Total
            </div>
            <div className="mt-1 text-lg font-semibold">{totalUrls}</div>
          </div>
          <div className="border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">
              Applied
            </div>
            <div className="mt-1 text-lg font-semibold text-emerald-800">
              {appliedUrls}
            </div>
          </div>
          <div className="border border-slate-500 bg-slate-700 px-3 py-2 text-white">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-200">
              Failed
            </div>
            <div className="mt-1 text-lg font-semibold">{failedUrls}</div>
          </div>
        </div>
      </div>

      {filteredProfiles.length === 0 ? (
        <div className="border border-[var(--border)] bg-[color:var(--background)] px-4 py-3 text-sm text-[color:var(--muted)]">
          No profiles are assigned to the selected bidder.
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="min-w-0">
          <datalist id="job-application-stack-options">
            {stackOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-y-0">
              <thead>
                <tr className="text-left text-sm text-[color:var(--muted)]">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Stack</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {isAdmin ? (
                    <th className="px-3 py-2 font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="bg-[color:var(--background)]">
                    <td className="px-3 py-2 text-sm font-semibold">{row.id}</td>
                    <td className="px-3 py-2">
                      <select
                        value={row.platform}
                        onChange={(event) =>
                          updateRow(
                            activeProfileId,
                            selectedDayKey,
                            row.id,
                            "platform",
                            event.target.value as Platform,
                          )
                        }
                        disabled={bidderReadOnly || bidderEditLocked}
                        className="h-8 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        {platformOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.company}
                        onChange={(event) =>
                          updateRow(
                            activeProfileId,
                            selectedDayKey,
                            row.id,
                            "company",
                            event.target.value,
                          )
                        }
                        readOnly={bidderEditLocked}
                        className="h-8 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none read-only:bg-slate-50 read-only:text-slate-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const isCopied =
                          copiedKey ===
                          `${activeProfileId}:${selectedDayKey}:${row.id}`;
                        const normalizedUrl = normalizeUrl(row.url);
                        const isDuplicateUrl =
                          normalizedUrl !== "" && duplicateUrlSet.has(normalizedUrl);

                        return (
                          <div className="flex items-center gap-2">
                            <input
                              value={row.url}
                              onChange={(event) =>
                                updateRow(
                                  activeProfileId,
                                  selectedDayKey,
                                  row.id,
                                  "url",
                                  event.target.value,
                                )
                              }
                              readOnly={bidderReadOnly || bidderEditLocked}
                              className={`h-8 min-w-0 flex-1 border px-3 text-sm outline-none read-only:text-slate-500 ${
                                isDuplicateUrl
                                  ? "border-rose-200 bg-rose-50"
                                  : "border-[var(--border)] bg-white read-only:bg-slate-50"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => copyUrl(row.url, row.id)}
                              className="flex h-8 min-w-14 items-center justify-center border border-[var(--border)] bg-white px-2 text-xs text-[color:var(--foreground)]"
                              aria-label="Copy URL"
                              title="Copy URL"
                            >
                              {isCopied ? (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#16a34a"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              ) : (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <rect x="9" y="9" width="13" height="13" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openUrl(row.url)}
                              className="flex h-8 w-8 items-center justify-center border border-[var(--border)] bg-white text-[color:var(--foreground)]"
                              aria-label="Open URL in new tab"
                              title="Open URL"
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
                                aria-hidden="true"
                              >
                                <path d="M14 3h7v7" />
                                <path d="M10 14 21 3" />
                                <path d="M21 14v7h-7" />
                                <path d="M3 10V3h7" />
                                <path d="M3 21h7v-7" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        list="job-application-stack-options"
                        value={row.stack}
                        onChange={(event) =>
                          updateRow(
                            activeProfileId,
                            selectedDayKey,
                            row.id,
                            "stack",
                            event.target.value as Stack,
                          )
                        }
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();

                          if (!nextValue) {
                            updateRow(
                              activeProfileId,
                              selectedDayKey,
                              row.id,
                              "stack",
                              "" as Stack,
                            );
                            return;
                          }

                          if (!stackOptions.some((option) => option === nextValue)) {
                            updateRow(
                              activeProfileId,
                              selectedDayKey,
                              row.id,
                              "stack",
                              "" as Stack,
                            );
                          }
                        }}
                        disabled={bidderReadOnly || bidderEditLocked}
                        className="h-8 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.description}
                        onChange={(event) =>
                          updateRow(
                            activeProfileId,
                            selectedDayKey,
                            row.id,
                            "description",
                            event.target.value,
                          )
                        }
                        readOnly={bidderEditLocked}
                        className="h-8 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none read-only:bg-slate-50 read-only:text-slate-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusSelect
                        value={row.status}
                        onChange={(value) =>
                          updateRow(
                            activeProfileId,
                            selectedDayKey,
                            row.id,
                            "status",
                            value as ApplicationStatus,
                          )
                        }
                        disabled={bidderEditLocked}
                      />
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => insertRowAfter(row.id)}
                            className="flex h-8 w-8 items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-700"
                            aria-label={`Insert row after ${row.id}`}
                            title="Insert row"
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
                              aria-hidden="true"
                            >
                              <path d="M12 5v14" />
                              <path d="M5 12h14" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove row ${row.id} from this application table?`,
                                )
                              ) {
                                removeRow(row.id);
                              }
                            }}
                            className="flex h-8 w-8 items-center justify-center border border-rose-200 bg-rose-50 text-rose-700"
                            aria-label={`Remove row ${row.id}`}
                            title="Remove row"
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
                              aria-hidden="true"
                            >
                              <path d="M5 12h14" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={addRows}
              disabled={bidderEditLocked}
              className="h-11 rounded-2xl bg-[color:var(--accent)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add 10 rows
            </button>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <aside className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
          <div className="relative flex w-[320px] justify-end">
            <button
              type="button"
              onClick={() => setIsToolsSidebarOpen((current) => !current)}
              className={`${
                isToolsSidebarOpen
                  ? "absolute right-4 top-4"
                  : "relative"
              } z-20 ml-auto flex h-[56px] w-[56px] items-center justify-center text-[color:var(--accent)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isToolsSidebarOpen ? "translate-x-0" : "hover:-translate-x-1"
              }`}
              aria-expanded={isToolsSidebarOpen}
              aria-controls="job-application-tools-sidebar"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[color:var(--accent)] shadow-[0_10px_24px_rgba(31,93,61,0.16)]"
                aria-hidden="true"
              >
                {isToolsSidebarOpen ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12h16" />
                    <path d="M12 4v16" />
                  </svg>
                )}
              </span>
            </button>

            <div
              id="job-application-tools-sidebar"
              className={`absolute right-0 top-1/2 w-full origin-right -translate-y-1/2 overflow-hidden rounded-[24px] border border-[rgba(26,79,52,0.16)] bg-[linear-gradient(180deg,rgba(248,251,246,0.97),rgba(238,244,236,0.97))] shadow-[0_22px_64px_rgba(21,43,29,0.18)] backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isToolsSidebarOpen
                  ? "translate-x-0 scale-100 opacity-100"
                  : "pointer-events-none translate-x-6 scale-95 opacity-0"
              }`}
            >
              <div className="min-h-0 max-h-[calc(100vh-48px)] overflow-y-auto">
                <div className="sticky top-0 z-10 flex items-center rounded-t-[24px] bg-[linear-gradient(135deg,#1f5d3d,#2c7a52)] px-5 py-5 text-white">
                  <span className="text-xs uppercase tracking-[0.28em] text-white/78">
                    Tools
                  </span>
                </div>
                <div className="grid gap-4 bg-white/88 p-5">
                <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    Budget
                  </div>
                  <div className="grid gap-2.5">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                      <span className="text-[color:var(--muted)]">Applied</span>
                      <span className="font-semibold">
                        {appliedUrls} / {formatCurrency(appliedBudget)}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                      <span className="text-[color:var(--muted)]">Failed</span>
                      <span className="font-semibold">
                        {failedUrls} / {formatCurrency(failedBudget)}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[var(--border)] pt-2.5 text-sm">
                      <span className="font-medium">Total</span>
                      <span className="font-semibold">{formatCurrency(totalBudget)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    Copy Columns
                  </div>
                  <div className="grid gap-2">
                    {copyableColumns.map((column) => (
                      <label
                        key={column.key}
                        className="grid grid-cols-[18px_1fr] items-center gap-3 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                          className="h-4 w-4"
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[20px] border border-[var(--border)] bg-white px-4 py-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    Actions
                  </div>
                  <div className="grid gap-2.5">
                    <button
                      type="button"
                      onClick={copyTable}
                      disabled={!activeProfileId || selectedColumns.length === 0}
                      className="h-10 rounded-2xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                    >
                      {copyStatus || "Copy Table"}
                    </button>
                    <button
                      type="button"
                      onClick={pasteTable}
                      disabled={!activeProfileId || !copiedTable}
                      className="h-10 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {pasteStatus || "Paste Table"}
                    </button>
                    <button
                      type="button"
                      onClick={clearTable}
                      disabled={!activeProfileId}
                      className="h-10 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Clear Table
                    </button>
                  </div>
                </div>

                <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[color:var(--background)] px-4 py-3 text-xs leading-5 text-[color:var(--muted)]">
                  {copiedTable
                    ? `Source: ${copiedTable.profileName || copiedTable.profileId} / ${copiedTable.dayKey}`
                    : "No copied table"}
                </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function getFilteredProfiles(
  profiles: PersonalProfile[],
  bidderId: string,
  assignments: ProfileAssignmentMap,
) {
  if (bidderId === "all") {
    return profiles;
  }

  const allowedProfileIds = assignments[bidderId] ?? [];
  return profiles.filter((profile) => allowedProfileIds.includes(profile.id));
}

function getActiveProfileId(selectedProfileId: string, profiles: PersonalProfile[]) {
  if (profiles.some((profile) => profile.id === selectedProfileId)) {
    return selectedProfileId;
  }

  return profiles[0]?.id ?? "";
}

function applyCopiedColumns(
  targetRow: JobApplication,
  sourceRow: JobApplication,
  columns: CopyableColumnKey[],
) {
  const nextRow = { ...targetRow };

  for (const column of columns) {
    switch (column) {
      case "platform":
        nextRow.platform = sourceRow.platform;
        break;
      case "company":
        nextRow.company = sourceRow.company;
        break;
      case "url":
        nextRow.url = sourceRow.url;
        break;
      case "stack":
        nextRow.stack = sourceRow.stack;
        break;
      case "description":
        nextRow.description = sourceRow.description;
        break;
      case "status":
        nextRow.status = sourceRow.status;
        break;
    }
  }

  return nextRow;
}

function getStoredCopiedTable() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(tableCopyStorageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CopiedTablePayload;
  } catch {
    window.localStorage.removeItem(tableCopyStorageKey);
    return null;
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCurrentBidderRates(
  salarySettings: SalarySettings,
  role: Role,
  currentUserId: string,
  selectedBidderId: string,
) {
  const bidderId =
    role === "bidder"
      ? currentUserId
      : selectedBidderId !== "all"
        ? selectedBidderId
        : "";
  const bidderRates = salarySettings.bidders.find(
    (bidder) => bidder.userId === bidderId,
  );

  return {
    bidderAppliedRate: bidderRates?.bidderAppliedRate ?? 0,
    bidderFailedRate: bidderRates?.bidderFailedRate ?? 0,
  };
}

function isBidderTableLocked(dayKey: string, serverTodayKey: string) {
  const tableDate = parseDayKey(dayKey);
  const serverToday = parseDayKey(serverTodayKey);

  if (!tableDate || !serverToday) {
    return false;
  }

  const diffInDays = Math.floor(
    (serverToday.getTime() - tableDate.getTime()) / 86_400_000,
  );

  return diffInDays >= 2;
}

function normalizeUrl(value: string) {
  return value.trim().toLowerCase();
}

function getDuplicateUrlSet(rows: JobApplication[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalizedUrl = normalizeUrl(row.url);

    if (!normalizedUrl) {
      continue;
    }

    counts.set(normalizedUrl, (counts.get(normalizedUrl) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([url]) => url),
  );
}

function parseDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return null;
  }

  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function renumberRows(rows: JobApplication[]) {
  return rows.map((row, index) => ({
    ...row,
    id: index + 1,
  }));
}
