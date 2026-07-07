"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";
import type { PermissionKey, SessionUser } from "@/lib/types";

type SidebarProps = {
  user: SessionUser;
  permissions: PermissionKey[];
};

export function Sidebar({ user, permissions }: SidebarProps) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("forest_sidebar_collapsed") === "true";
  });

  useEffect(() => {
    if (pendingHref !== pathname) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingHref("");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [pathname, pendingHref]);

  const activeHref = pendingHref || pathname;

  const visibleItems = navItems.filter((item) =>
    permissions.includes(item.permission),
  );

  const topItems = visibleItems.filter((item) => item.section !== "bottom");
  const bottomItems = visibleItems.filter((item) => item.section === "bottom");

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[color:var(--panel)]/90 px-3 py-4 backdrop-blur transition-[width] duration-200 ${
        isCollapsed ? "w-[88px]" : "w-72"
      }`}
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            const nextValue = !isCollapsed;
            setIsCollapsed(nextValue);
            window.localStorage.setItem(
              "forest_sidebar_collapsed",
              String(nextValue),
            );
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[color:var(--muted)] transition-colors hover:bg-[color:var(--accent-soft)]"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col justify-between gap-6">
        <div className="space-y-2 overflow-y-auto pr-1">
          {topItems.map((item) => {
            const active = activeHref === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setPendingHref(item.href)}
                className={`flex items-center rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
                } ${isCollapsed ? "justify-center" : "gap-3"}`}
                title={item.label}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    active
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-current/10 bg-white/10"
                  }`}
                >
                  <SidebarIcon icon={item.shortLabel} />
                </span>
                {!isCollapsed ? (
                  <span className={active ? "text-white" : ""}>{item.label}</span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="space-y-2 pt-2">
          {bottomItems.map((item) => {
            const active = activeHref === item.href;
            const label = item.href === "/profile" ? user.email : item.label;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setPendingHref(item.href)}
                className={`flex items-center rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
                } ${isCollapsed ? "justify-center" : "gap-3"}`}
                title={label}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    active
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-current/10 bg-white/10"
                  }`}
                >
                  <SidebarIcon icon={item.shortLabel} />
                </span>
                {!isCollapsed ? (
                  <span className={active ? "text-white" : ""}>{label}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function SidebarIcon({ icon }: { icon: string }) {
  const className = "h-[18px] w-[18px]";

  switch (icon) {
    case "DB":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5C4 5.1 7.6 4 12 4s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5Z" />
          <path d="M4 6.5V12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6.5" />
          <path d="M4 12v5.5C4 18.9 7.6 20 12 20s8-1.1 8-2.5V12" />
        </svg>
      );
    case "JA":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          <path d="M16 4v4h4" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case "IV":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M3 10h18" />
          <path d="M8 14h3v3H8z" />
        </svg>
      );
    case "CH":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 17.5A3.5 3.5 0 0 1 2.5 14V7A3.5 3.5 0 0 1 6 3.5h12A3.5 3.5 0 0 1 21.5 7v7a3.5 3.5 0 0 1-3.5 3.5H10l-4 3v-3Z" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </svg>
      );
    case "AD":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.6 1.6 0 0 1 0 2.3 1.6 1.6 0 0 1-2.3 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1-1.6-1.6v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.6 1.6 0 0 1-2.3 0 1.6 1.6 0 0 1 0-2.3l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a1.6 1.6 0 0 1-1.6-1.6A1.6 1.6 0 0 1 5 11h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.6 1.6 0 0 1 0-2.3 1.6 1.6 0 0 1 2.3 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V5A1.6 1.6 0 0 1 12 3.4 1.6 1.6 0 0 1 13.6 5v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.6 1.6 0 0 1 2.3 0 1.6 1.6 0 0 1 0 2.3l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.2A1.6 1.6 0 0 1 20.6 12 1.6 1.6 0 0 1 19 13.6h-.2a1 1 0 0 0-.4 1.4Z" />
        </svg>
      );
    case "PF":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
          <path d="M18 4h3" />
          <path d="M19.5 2.5v3" />
        </svg>
      );
    case "ME":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return <span className="text-[10px] font-bold">{icon}</span>;
  }
}
