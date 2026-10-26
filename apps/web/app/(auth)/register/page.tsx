"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { useSessionStore } from "@/stores/use-session-store";
import {
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-form";

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

export default function RegisterPage() {
  const router = useRouter();
  const ensure = useSessionStore((s) => s.ensure);
  const setUser = useSessionStore((s) => s.setUser);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    let active = true;
    ensure().then((user) => {
      if (active && user) router.replace("/overview");
    });
    return () => {
      active = false;
    };
  }, [ensure, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Shape checks first: nothing reaches the API until every field passes
    // the same contract the server enforces (email format, 12–128, name ≤ 120).
    const errors = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirm:
        confirm !== password ? "Passwords do not match." : undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.email || errors.password || errors.confirm) return;

    setSubmitting(true);
    try {
      const { user } = await apiClient.authRegister({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      setUser(user);
      toast.success(`Account created. Welcome, ${user.name}.`);
      router.replace("/overview");
    } catch (err) {
      // 409 (email taken) is intentionally generic from the API.
      toast.error(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Set up your Company Intelligence workspace in under a minute.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Name{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Farhan Alam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            disabled={submitting}
          />
          {fieldErrors.name && (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          )}
        </div>

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
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={submitting}
          />
          {fieldErrors.password && (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-sm font-medium">
            Confirm password
          </label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(fieldErrors.confirm)}
            disabled={submitting}
          />
          {fieldErrors.confirm && (
            <p className="text-xs text-destructive">{fieldErrors.confirm}</p>
          )}
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <CircleNotch className="size-4 animate-spin" />}
          {submitting ? "Creating account…" : "Create account"}
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
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
