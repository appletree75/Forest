import { AccessGuard } from "@/components/ui/access-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_dashboard">{children}</AccessGuard>;
}
