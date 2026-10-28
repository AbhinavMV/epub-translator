import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { AuthShell, Field, FormError } from "@/auth/auth-shell";
import { Button } from "@/components/ui/button";

export function SignInPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "signedIn") void navigate({ to: "/", replace: true });
  }, [auth.status, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" description="Access is by invitation only.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error ?? auth.error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
