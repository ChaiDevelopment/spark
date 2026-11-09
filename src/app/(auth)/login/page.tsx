import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  // Supabase appends error/error_description when a verification link is expired or reused.
  const linkError = error === "oauth" ? "oauth" : error || typeof sp.error_description === "string" ? "link" : undefined;
  return <LoginForm next={next} error={linkError} verified={sp.verified === "1"} />;
}
