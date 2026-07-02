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
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[color:var(--panel)]/90 px-3 py-4 backdrop-blur">
      <nav className="flex min-h-0 flex-1 flex-col justify-between gap-6">
        <div className="space-y-2 overflow-y-auto pr-1">
          {topItems.map((item) => {
            const active = activeHref === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setPendingHref(item.href)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${
                    active
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-current/10 bg-white/10"
                  }`}
                >
                  {item.shortLabel}
                </span>
                <span className={active ? "text-white" : ""}>{item.label}</span>
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
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[color:var(--foreground)] hover:bg-[color:var(--accent-soft)]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${
                    active
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-current/10 bg-white/10"
                  }`}
                >
                  {item.shortLabel}
                </span>
                <span className={active ? "text-white" : ""}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
