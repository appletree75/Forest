import { AccessGuard } from "@/components/ui/access-guard";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_profile">{children}</AccessGuard>;
}
