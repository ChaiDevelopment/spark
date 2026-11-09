"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { safeNextPath } from "@/lib/utils";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/schemas";

const notConfigured = () => fail("SPARK isn't connected to Supabase yet. See SUPABASE_SETUP.md.");

export async function signUpAction(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // Supabase verifies the address when the link is clicked, then lands on our
    // login page. Must be listed in Supabase → Auth → URL Configuration.
    options: { emailRedirectTo: `${publicEnv.appUrl}/login?verified=1` },
  });
  if (error) {
    if (error.code === "weak_password") return fail(error.message);
    if (error.status === 429) return fail("Too many attempts. Please wait a minute and try again.");
    return fail("We couldn't create your account. Please try again.");
  }
  // When confirmations are on, Supabase returns no session (and does not reveal whether the email exists).
  return ok({ needsConfirmation: !data.session });
}

export async function signInAction(input: unknown, next?: string): Promise<ActionResult<{ redirectTo: string }>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return fail("Please confirm your email first — check your inbox.");
    if (error.status === 429) return fail("Too many attempts. Please wait a minute and try again.");
    return fail("That email and password don't match.");
  }
  return ok({ redirectTo: safeNextPath(next) });
}

export async function signInWithGoogleAction(next?: string): Promise<ActionResult<never> | never> {
  if (!isSupabaseConfigured()) return notConfigured();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}` },
  });
  if (error || !data.url) return fail("Google sign-in isn't available right now.");
  redirect(data.url);
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult<null>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a valid email address.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password`,
  });
  // Always succeed: never reveal whether an account exists for this email.
  return ok(null);
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<null>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return fail("Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === "same_password" ? "Choose a password you haven't used here before." : "Couldn't update your password.");
  return ok(null);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
