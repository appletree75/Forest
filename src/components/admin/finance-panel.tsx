"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addFinanceTransactionAction,
  deleteFinanceTransactionAction,
} from "@/app/admin/actions";
import type { FinanceTransaction, ManagedUser } from "@/lib/types";

type FinancePanelProps = {
  transactions: FinanceTransaction[];
  recipients: Array<Pick<ManagedUser, "id" | "name" | "email" | "role">>;
};

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function FinancePanel({ transactions, recipients }: FinancePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const totalAmount = useMemo(
    () => transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions],
  );
  const messageTone =
    message === "Transaction removed."
      ? "rose"
      : message === "Transaction added."
        ? "emerald"
        : "default";

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-4 shadow-[0_12px_36px_rgba(24,34,24,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Finance</h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Track manual transactions in one simple list.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white"
        >
          Add transaction
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[20px] border border-[var(--border)] bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
            Total Transactions
          </div>
          <div className="mt-2 text-2xl font-semibold">{transactions.length}</div>
        </div>
        <div className="rounded-[20px] border border-[var(--border)] bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
            Total Amount
          </div>
          <div className="mt-2 text-2xl font-semibold">
            ${totalAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${
            messageTone === "rose"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : messageTone === "emerald"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-[var(--border)] bg-white text-[color:var(--foreground)]"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              messageTone === "rose"
                ? "bg-rose-100"
                : messageTone === "emerald"
                  ? "bg-emerald-100"
                  : "bg-[color:var(--background)]"
            }`}
          >
            {messageTone === "rose" ? <TrashIcon /> : <StatusCheckIcon />}
          </span>
          {message}
        </div>
      ) : null}

      <div className="rounded-[20px] border border-[var(--border)] bg-white p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
          Transactions
        </div>
        {transactions.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[color:var(--background)] px-4 py-4 text-sm text-[color:var(--muted)]">
            No transactions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="rounded-2xl border border-[var(--border)] bg-[color:var(--background)] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{transaction.to}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {transaction.date}
                    </div>
                    {transaction.note ? (
                      <div className="mt-2 text-sm text-[color:var(--muted)]">
                        {transaction.note}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start gap-3">
                    <div className="text-right">
                      <div className="text-base font-semibold">
                        ${transaction.amount.toFixed(2)}
                      </div>
                    </div>
                    <form
                      onSubmit={(event) => {
                        if (!window.confirm("Remove this transaction?")) {
                          event.preventDefault();
                          return;
                        }
                        event.preventDefault();

                        const formData = new FormData(event.currentTarget);
                        startTransition(async () => {
                          const nextState = await deleteFinanceTransactionAction(
                            { message: "" },
                            formData,
                          );
                          setMessage(nextState.message);
                          router.refresh();
                        });
                      }}
                    >
                      <input
                        type="hidden"
                        name="transactionId"
                        value={transaction.id}
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 disabled:opacity-60"
                        aria-label={`Remove transaction for ${transaction.to}`}
                        title="Remove transaction"
                      >
                        <TrashIcon />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,26,19,0.38)] p-4">
          <div className="w-full max-w-xl rounded-[30px] border border-[rgba(28,82,54,0.12)] bg-white p-5 shadow-[0_24px_80px_rgba(18,26,19,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Finance
                </div>
                <h3 className="mt-2 text-2xl font-semibold">Add transaction</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]"
              >
                x
              </button>
            </div>

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const formData = new FormData(form);

                startTransition(async () => {
                  const nextState = await addFinanceTransactionAction(
                    { message: "" },
                    formData,
                  );
                  setMessage(nextState.message);

                  if (nextState.message === "Transaction added.") {
                    setIsModalOpen(false);
                    form.reset();
                  }

                  router.refresh();
                });
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">To</span>
                  <select
                    name="to"
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                    defaultValue=""
                  >
                    <option value="">Select user</option>
                    {recipients.map((recipient) => (
                      <option key={recipient.id} value={recipient.name}>
                        {recipient.name} ({recipient.role}) - {recipient.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium">Amount</span>
                  <input
                    type="number"
                    name="amount"
                    min="0"
                    step="0.01"
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-medium">Date</span>
                  <PickerInput name="date" defaultValue={getTodayDateValue()} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-medium">Note</span>
                  <textarea
                    name="note"
                    rows={4}
                    className="min-h-28 rounded-2xl border border-[var(--border)] bg-[color:var(--background)] px-3 py-3 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-sm text-[color:var(--muted)]">
                  {message === "Transaction added." ? "" : message}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="h-10 rounded-xl border border-[var(--border)] bg-[color:var(--background)] px-4 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="h-10 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isPending ? "Saving..." : "Save transaction"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusCheckIcon() {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function TrashIcon() {
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
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8V7" />
      <path d="M6.5 7l.8 11.1c0 .9.7 1.4 1.6 1.4h6.2c.9 0 1.6-.5 1.6-1.4L17.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function PickerInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();

    const pickerInput = input as HTMLInputElement & {
      showPicker?: () => void;
    };

    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <div
      className="relative h-10 w-full rounded-xl border border-[var(--border)] bg-[color:var(--background)]"
      onClick={openPicker}
    >
      <input
        ref={inputRef}
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="h-full w-full rounded-xl bg-transparent px-3 text-sm outline-none"
      />
    </div>
  );
}
