import { AccessGuard } from "@/components/ui/access-guard";

export default function JobApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AccessGuard permission="view_job_application">{children}</AccessGuard>
  );
}
