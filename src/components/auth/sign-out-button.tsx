import { signOutAction } from "@/app/admin/actions";

type SignOutButtonProps = {
  collapsed?: boolean;
};

export function SignOutButton({ collapsed = false }: SignOutButtonProps) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`flex w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-medium text-rose-700 hover:bg-rose-100 ${
          collapsed ? "px-2" : "px-4"
        }`}
      >
        {collapsed ? "OUT" : "Sign out"}
      </button>
    </form>
  );
}
