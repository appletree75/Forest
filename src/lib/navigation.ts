import type { PermissionKey } from "@/lib/types";

export type NavItem = {
  href:
    | "/dashboard"
    | "/job-application"
    | "/interview"
    | "/chat"
    | "/admin"
    | "/profiles"
    | "/profile";
  label: string;
  shortLabel: string;
  permission: PermissionKey;
  section?: "top" | "bottom";
};

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "DB",
    permission: "view_dashboard",
    section: "top",
  },
  {
    href: "/job-application",
    label: "Job Application",
    shortLabel: "JA",
    permission: "view_job_application",
    section: "top",
  },
  {
    href: "/interview",
    label: "Interview",
    shortLabel: "IV",
    permission: "view_interview",
    section: "top",
  },
  {
    href: "/chat",
    label: "Chat",
    shortLabel: "CH",
    permission: "view_chat",
    section: "top",
  },
  {
    href: "/admin",
    label: "Admin",
    shortLabel: "AD",
    permission: "view_admin",
    section: "top",
  },
  {
    href: "/profiles",
    label: "Profiles",
    shortLabel: "PF",
    permission: "view_profiles",
    section: "top",
  },
  {
    href: "/profile",
    label: "My Profile",
    shortLabel: "ME",
    permission: "view_profile",
    section: "bottom",
  },
];
