import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await getSessionUser();
  const roleLabel = user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : "";
  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="My Profile"
        title="Profile and role details"
        description="Keep personal information and access level visible so role-based behavior is easy to verify during development."
      />
      <section className="rounded-[36px] border border-[rgba(28,82,54,0.12)] bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(244,248,241,0.98))] p-6 shadow-[0_20px_60px_rgba(24,34,24,0.08)]">
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[30px] bg-[linear-gradient(135deg,rgba(30,82,52,0.96),rgba(60,104,74,0.92))] p-6 text-white shadow-[0_18px_48px_rgba(24,34,24,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/12 bg-white/10 text-xl font-semibold tracking-[0.16em] backdrop-blur">
                {initials || "ME"}
              </div>
              <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/78">
                {roleLabel}
              </div>
            </div>

            <div className="mt-8">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/65">
                Signed In
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {user?.name}
              </h2>
              <p className="mt-2 text-sm text-white/78">{user?.email}</p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">
                  Status
                </div>
                <div className="mt-2 text-lg font-semibold">Active</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 backdrop-blur">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">
                  Access
                </div>
                <div className="mt-2 text-lg font-semibold">{roleLabel}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <dl className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] border border-[rgba(28,82,54,0.08)] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Name
                </dt>
                <dd className="mt-3 text-2xl font-semibold">{user?.name}</dd>
              </div>
              <div className="rounded-[28px] border border-[rgba(28,82,54,0.08)] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Email
                </dt>
                <dd className="mt-3 break-all text-2xl font-semibold">
                  {user?.email}
                </dd>
              </div>
              <div className="rounded-[28px] border border-[rgba(28,82,54,0.08)] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Role
                </dt>
                <dd className="mt-3 text-2xl font-semibold">{roleLabel}</dd>
              </div>
              <div className="rounded-[28px] border border-[rgba(28,82,54,0.08)] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
                <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  Session
                </dt>
                <dd className="mt-3 text-2xl font-semibold">Current</dd>
              </div>
            </dl>

            <section className="rounded-[30px] border border-[rgba(28,82,54,0.08)] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,24,0.04)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Account Actions</h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                    End the current session from your profile page.
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <SignOutButton />
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
