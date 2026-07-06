import { AccessGuard } from "@/components/ui/access-guard";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGuard permission="view_interview">{children}</AccessGuard>;
}
