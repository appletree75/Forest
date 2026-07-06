import { AccessGuard } from "@/components/ui/access-guard";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_chat">{children}</AccessGuard>;
}
