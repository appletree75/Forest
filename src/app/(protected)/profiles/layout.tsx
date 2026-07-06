import { AccessGuard } from "@/components/ui/access-guard";

export default function ProfilesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_profiles">{children}</AccessGuard>;
}
