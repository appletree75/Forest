import { AccessGuard } from "@/components/ui/access-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_admin">{children}</AccessGuard>;
}
