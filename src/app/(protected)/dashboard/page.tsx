import { getSessionUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard";
import { getVisibleProfilesForUser } from "@/lib/profiles";

export default async function DashboardPage() {
  const user = await getSessionUser();
  const isBidder = user?.role === "bidder";
  const visibleProfiles = user ? await getVisibleProfilesForUser(user) : [];
  const stats = await getDashboardStats({
    visibleProfileIds:
      isBidder
        ? visibleProfiles.map((profile) => profile.id)
        : undefined,
    currentUserId: user?.id,
    currentUserRole: user?.role,
  });

  return (
    <div className="grid gap-5">
      <section className="rounded-[32px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-5 shadow-[0_16px_50px_rgba(24,34,24,0.06)] md:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
              Dashboard
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Operations summary</h2>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm text-[color:var(--muted)]">
            {stats.databaseAvailable ? "Live data" : "Fallback data"}
          </div>
        </div>

        <section className="rounded-[28px] border border-[var(--border)] bg-white p-4 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
          <div className="mb-4 text-lg font-semibold">Application</div>
          <div className="grid gap-4 xl:grid-cols-4">
            {Object.values(stats.periods).map((period) => (
              <section
                key={period.label}
                className="rounded-[24px] border border-[var(--border)] bg-[color:var(--background)] p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {period.label}
                </div>
                <div className="mt-4 grid gap-2">
                  <MetricPill label="Total" value={period.totalUrls} />
                  <MetricPill label="Applied" value={period.appliedUrls} tone="success" />
                  <MetricPill label="Failed" value={period.failedUrls} tone="dark" />
                </div>
              </section>
            ))}
          </div>
        </section>

        {!isBidder ? (
          <section className="mt-5 rounded-[28px] border border-[var(--border)] bg-white p-4 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
            <div className="mb-4 text-lg font-semibold">Interview</div>
            <div className="grid gap-4 xl:grid-cols-4">
              {Object.values(stats.interviewPeriods).map((period) => (
                <section
                  key={period.label}
                  className="rounded-[24px] border border-[var(--border)] bg-[color:var(--background)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                      {period.label}
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold">
                      {period.totalInterviews}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[rgba(28,82,54,0.08)] bg-white px-4 py-3">
                    <div className="text-sm text-[color:var(--muted)]">Total interviews</div>
                    <div className="mt-1 text-2xl font-semibold">{period.totalInterviews}</div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {period.callers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--muted)]">
                        No caller interview data.
                      </div>
                    ) : (
                      period.callers.map((caller) => (
                        <div
                          key={`${period.label}-${caller.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(28,82,54,0.08)] bg-white px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{caller.name}</div>
                            <div className="truncate text-xs text-[color:var(--muted)]">
                              {caller.email}
                            </div>
                          </div>
                          <div className="text-lg font-semibold">{caller.count}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "dark";
}) {
  const valueClassName =
    tone === "success"
      ? "text-emerald-700"
      : tone === "dark"
        ? "text-slate-700"
        : "text-[color:var(--foreground)]";

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
      <span className="text-sm text-[color:var(--muted)]">{label}</span>
      <span className={`text-base font-semibold ${valueClassName}`}>{value}</span>
    </div>
  );
}
