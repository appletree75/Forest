import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await getSessionUser();
  const roleLabel = user?.role
    ? user.role[0].toUpperCase() + user.role.slice(1)
    : "Not assigned";
  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "ME";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My profile"
      />

      <section className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_16px_44px_rgba(24,34,24,0.06)]">
        <div className="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--accent)] text-base font-semibold tracking-[0.12em] text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {user?.name || "Unnamed user"}
              </h2>
              <p className="mt-1 truncate text-sm text-[color:var(--muted)]">
                {user?.email || "No email address"}
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-[rgba(35,68,43,0.14)] bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)]">
            {roleLabel}
          </span>
        </div>

        <dl className="divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
          <ProfileRow label="Full name" value={user?.name || "Not provided"} />
          <ProfileRow label="Email address" value={user?.email || "Not provided"} />
          <ProfileRow label="Role" value={roleLabel} />
          <ProfileRow label="Account status" value="Active" status />
        </dl>

        <div className="flex justify-end bg-[color:var(--panel)] px-5 py-5 sm:px-7">
          <div className="w-full sm:w-36">
            <SignOutButton />
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  status = false,
}: {
  label: string;
  value: string;
  status?: boolean;
}) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-5 sm:px-7">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-medium sm:text-right">
        {status ? (
          <span className="inline-flex items-center gap-2 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
