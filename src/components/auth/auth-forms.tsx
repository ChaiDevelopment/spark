"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
} from "@/server/actions/auth";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/schemas";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

export function GoogleButton({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      size="lg"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await signInWithGoogleAction(next);
          if (res && !res.ok) toast.error(res.error);
        })
      }
    >
      <GoogleIcon /> Continue with Google
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className="pr-12" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-faint hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------- Login
export function LoginForm({ next, error, verified }: { next?: string; error?: string; verified?: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(
    error === "link" ? "That link is invalid or has expired." : error === "oauth" ? "Google sign-in was cancelled or failed." : null,
  );
  const form = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const res = await signInAction(values, next);
    if (!res.ok) return setFormError(res.error);
    router.replace(res.data.redirectTo);
    router.refresh();
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Welcome back</h1>
      <p className="mt-2 text-ink-soft">Good to see you. Let&apos;s find your spark.</p>
      <div className="mt-8">
        <GoogleButton next={next} />
      </div>
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {verified && !formError && (
          <p role="status" className="rounded-2xl bg-mint/15 px-4 py-3 text-sm font-medium text-ink">
            Email verified — sign in to continue.
          </p>
        )}
        {formError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-coral-deep hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        New to SPARK?{" "}
        <Link href="/signup" className="font-semibold text-coral-deep hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- Sign up
export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", acceptTerms: false as unknown as true },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const res = await signUpAction(values);
    if (!res.ok) return setFormError(res.error);
    if (res.data.needsConfirmation) router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    else {
      router.replace("/onboarding");
      router.refresh();
    }
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Create your account</h1>
      <p className="mt-2 text-ink-soft">It takes about five minutes to set up a profile people want to read.</p>
      <div className="mt-8">
        <GoogleButton next="/onboarding" />
      </div>
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} hint="8+ characters with a letter and a number.">
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <label className="flex items-start gap-3 rounded-2xl bg-cream/60 p-4 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[#ff6482]" {...form.register("acceptTerms")} />
          <span>
            I&apos;m 18 or older and agree to the <Link href="/terms" className="font-semibold underline">Terms</Link>,{" "}
            <Link href="/privacy" className="font-semibold underline">Privacy Policy</Link> and{" "}
            <Link href="/guidelines" className="font-semibold underline">Community Guidelines</Link>.
          </span>
        </label>
        {errors.acceptTerms && <p className="text-sm font-medium text-danger">{errors.acceptTerms.message}</p>}
        <Button type="submit" size="lg" variant="spark" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
        <p className="text-xs text-ink-faint">We&apos;ll also verify your date of birth during setup.</p>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-coral-deep hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- Forgot / reset
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await forgotPasswordAction(values);
    if (!res.ok) return toast.error(res.error);
    setSent(true);
  });

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-14 text-mint-deep" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-extrabold">Check your inbox</h1>
        <p className="mt-2 text-ink-soft">If an account exists for that email, we&apos;ve sent a link to reset your password.</p>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Reset your password</h1>
      <p className="mt-2 text-ink-soft">Enter your email and we&apos;ll send you a reset link.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-coral-deep hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await resetPasswordAction(values);
    if (!res.ok) return toast.error(res.error);
    setDone(true);
    setTimeout(() => router.replace("/discover"), 1200);
  });
  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-14 text-mint-deep" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-extrabold">Password updated</h1>
        <p className="mt-2 text-ink-soft">Taking you back to SPARK…</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </div>
  );
}
