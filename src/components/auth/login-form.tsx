"use client";

import { useState } from "react";
import { useActionState } from "react";

import { loginAction } from "@/app/login/actions";

const initialState = {
  error: "",
};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue="admin@nex.local"
          required
          className="h-12 w-full rounded-2xl border border-[var(--border)] bg-white px-4 outline-none transition-colors focus:border-[color:var(--accent)]"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            defaultValue="admin123"
            required
            className="h-12 w-full rounded-2xl border border-[var(--border)] bg-white px-4 pr-12 outline-none transition-colors focus:border-[color:var(--accent)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[color:var(--muted)]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m3 3 18 18" />
                <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4.91c5.05 0 9.27 3.11 10.5 7.09a10.96 10.96 0 0 1-4.15 5.94" />
                <path d="M6.61 6.61A10.96 10.96 0 0 0 1.5 12c.67 2.17 2.14 4.14 4.11 5.43" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.06 12C3.2 7.85 7.17 4.91 12 4.91S20.8 7.85 21.94 12c-1.14 4.15-5.11 7.09-9.94 7.09S3.2 16.15 2.06 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-2xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
