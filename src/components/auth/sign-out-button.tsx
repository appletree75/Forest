import { signOutAction } from "@/app/admin/actions";

type SignOutButtonProps = {
  collapsed?: boolean;
};

export function SignOutButton({ collapsed = false }: SignOutButtonProps) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`flex w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[color:var(--panel-strong)] py-3 text-sm font-medium ${
          collapsed ? "px-2" : "px-4"
        }`}
      >
        {collapsed ? "OUT" : "Sign out"}
      </button>
    </form>
  );
}
