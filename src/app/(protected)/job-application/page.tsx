import { JobApplicationTable } from "@/components/job-applications/job-application-table";
import { getSessionUser } from "@/lib/auth";
import { getJobApplicationTablesForProfiles } from "@/lib/job-application-storage";
import {
  getBidderUsers,
  getProfileAssignments,
  getVisibleProfilesForUser,
} from "@/lib/profiles";
import { getSalarySettings } from "@/lib/salaries";

export default async function JobApplicationPage() {
  const user = await getSessionUser();
  const profiles = user ? await getVisibleProfilesForUser(user) : [];
  const bidderUsers = user?.role === "admin" ? await getBidderUsers() : [];
  const assignments = user?.role === "admin" ? await getProfileAssignments() : {};
  const salarySettings = await getSalarySettings();
  const todayKey = new Date().toISOString().slice(0, 10);
  const initialTables = await getJobApplicationTablesForProfiles(
    profiles,
    todayKey,
  );

  return (
    <>
      <JobApplicationTable
        profiles={profiles}
        initialTables={initialTables}
        role={user?.role ?? "bidder"}
        currentUserId={user?.id ?? ""}
        bidderUsers={bidderUsers}
        assignments={assignments}
        salarySettings={salarySettings}
        serverTodayKey={todayKey}
      />
    </>
  );
}
