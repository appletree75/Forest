"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";

type LoginState = {
  error: string;
};

export async function loginAction(_: LoginState, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "Email and password are required.",
    };
  }

  const result = await signIn(email, password);

  if (!result.ok) {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard");
}
