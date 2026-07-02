"use client";

import { useEffect, useRef, useState } from "react";

import type { ApplicationStatus } from "@/lib/types";

type StatusSelectProps = {
  value: ApplicationStatus;
  onChange: (value: ApplicationStatus) => void;
  disabled?: boolean;
};

const statusOptions: Array<{
  value: ApplicationStatus;
  label: string;
  buttonClassName: string;
  optionClassName: string;
}> = [
  {
    value: "",
    label: "",
    buttonClassName:
      "border-[var(--border)] bg-white text-[color:var(--foreground)]",
    optionClassName: "bg-white text-[color:var(--foreground)] hover:bg-slate-100",
  },
  {
    value: "Applied",
    label: "Applied",
    buttonClassName: "border-emerald-200 bg-emerald-100 text-emerald-800",
    optionClassName: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  },
  {
    value: "Failed",
    label: "Failed",
    buttonClassName: "border-slate-500 bg-slate-700 text-white",
    optionClassName: "bg-slate-700 text-white hover:bg-slate-800",
  },
];

function getOption(value: ApplicationStatus) {
  return statusOptions.find((option) => option.value === value) ?? statusOptions[0];
}

export function StatusSelect({
  value,
  onChange,
  disabled = false,
}: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = getOption(value);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-28">
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        disabled={disabled}
        className={`flex h-8 w-full items-center justify-between border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70 ${selected.buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.label || "\u00A0"}</span>
        <span className="ml-3 text-xs">▼</span>
      </button>

      {open && !disabled ? (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-full border border-[var(--border)] bg-white shadow-lg"
          role="listbox"
        >
          {statusOptions
            .filter((option) => option.value !== "")
            .map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${option.optionClassName}`}
              >
                {option.label || "\u00A0"}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
