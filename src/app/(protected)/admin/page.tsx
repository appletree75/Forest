import { AuditLogPanel } from "@/components/admin/audit-log-panel";
import { BlockedLoginRateLimitsPanel } from "@/components/admin/blocked-login-rate-limits-panel";
import { FinancePanel } from "@/components/admin/finance-panel";
import { ProfileAssignmentForm } from "@/components/admin/profile-assignment-form";
import { UserManagementForm } from "@/components/admin/user-management-form";
import { PermissionMatrixForm } from "@/components/admin/permission-matrix-form";
import { getRecentAuditLogs } from "@/lib/audit-log";
import { getFinanceTransactions } from "@/lib/finance";
import { getBlockedLoginRateLimits } from "@/lib/login-rate-limit";
import { getBidderUsers, getProfileAssignments, getProfiles } from "@/lib/profiles";
import { getPermissionMatrix } from "@/lib/permissions";
import { getUsers } from "@/lib/user-storage";

export default async function AdminPage() {
  const matrix = await getPermissionMatrix();
  const users = await getUsers();
  const bidderUsers = await getBidderUsers();
  const profiles = await getProfiles();
  const assignments = await getProfileAssignments();
  const financeTransactions = await getFinanceTransactions();
  const auditLogEntries = await getRecentAuditLogs();
  const blockedLoginEntries = await getBlockedLoginRateLimits();
  const financeRecipients = users.filter(
    (user) => user.role === "bidder" || user.role === "caller",
  );

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
        <div className="min-w-0">
          <UserManagementForm users={users} />
        </div>
        <div className="grid min-w-0 gap-4 content-start">
          <BlockedLoginRateLimitsPanel entries={blockedLoginEntries} />
          <AuditLogPanel entries={auditLogEntries} />
          <FinancePanel
            transactions={financeTransactions}
            recipients={financeRecipients}
          />
          <PermissionMatrixForm matrix={matrix} />
          <ProfileAssignmentForm
            assignments={assignments}
            bidderUsers={bidderUsers}
            profiles={profiles}
          />
        </div>
      </div>
    </div>
  );
}
