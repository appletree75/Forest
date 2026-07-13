import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 md:p-10">
      <section className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md rounded-[32px] border border-[var(--border)] bg-[color:var(--panel)] p-8 shadow-[0_20px_80px_rgba(18,26,19,0.08)]">
          <div className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
            Secure Login
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Sign in to Nex
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
            Use email and password to access your role-specific dashboard.
            Registration is intentionally disabled for this phase.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
