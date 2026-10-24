"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { useSessionStore } from "@/stores/use-session-store";
import {
  validateEmail,
  validateLoginPassword,
} from "@/lib/auth-form";

/** Google OAuth failure codes come back as /login?error=<code> (see the API's
 * callback). Human-readable here, keyed to what the API can actually emit. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "Sign-in session expired. Please try again.",
  google_conflict:
    "This email already has an email/password account. Sign in with your password instead.",
  google_email_unverified:
    "Your Google email is not verified, so we cannot confirm it is you.",
  google_failed: "Google sign-in failed. Please try again.",
  rate_limited: "Too many attempts. Please wait a bit and try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-3 3.9v3.2h3c1.8-1.7 3-4.2 3-9.3z"
      />
      <path
        fill="#34A853"
        d="M12 24c2.7 0 5-.9 6.6-2.4l-3-2.3c-.8.5-2 1-3.6 1-2.9 0-5.3-1.9-6.2-4.5H2.9v3.3C4.9 21.9 8.2 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.8 15.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3V7.9H2.9C2.3 9.2 2 10.6 2 12s.3 2.8.9 4.1l2.9-3.3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c2 0 3.4.9 4.2 1.6l3.1-3C17.5 1.6 15.1.5 12 .5 8.2.5 4.9 2.6 2.9 7.9l2.9 3.3C6.7 8.7 9.1 4.8 12 4.8z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ensure = useSessionStore((s) => s.ensure);
  const setUser = useSessionStore((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get("next") ?? "/overview";

  // Already signed in (e.g. back-button to /login): straight to the dashboard.
  useEffect(() => {
    let active = true;
    ensure().then((user) => {
      if (active && user) router.replace("/overview");
    });
    return () => {
      active = false;
    };
  }, [ensure, router]);

  // Google OAuth failure surfaced by the API redirect.
  useEffect(() => {
    const code = searchParams.get("error");
    if (code) toast.error(GOOGLE_ERRORS[code] ?? "Sign-in failed. Please try again.");
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = {
      email: validateEmail(email) ?? undefined,
      password: validateLoginPassword(password) ?? undefined,
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      const { user } = await apiClient.authLogin({
        email: email.trim(),
        password,
      });
      setUser(user);
      toast.success(`Welcome back, ${user.name}.`);
      // Same-site redirect to the guard-checked dashboard.
      router.replace(nextPath);
    } catch (err) {
      // The API answers unknown email vs wrong password with one 401 body.
      toast.error(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your Company Intelligence workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            disabled={submitting}
          />
          {fieldErrors.email && (
            <p className="text-xs text-destructive">{fieldErrors.email}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={submitting}
          />
          {fieldErrors.password && (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          )}
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <CircleNotch className="size-4 animate-spin" />}
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="w-full" asChild>
        <a href={apiClient.googleStartUrl}>
          <GoogleMark />
          Continue with Google
        </a>
      </Button>

      <p className="mt-8 text-sm text-muted-foreground">
        New to ag-ui?{" "}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // `next`/`error` arrive as query params, so the form must be inside a
  // Suspense boundary to stay statically renderable (Next 16 requirement).
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
