import { MIN_PASSWORD_LENGTH } from "@et/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useAdminApi } from "@/auth/admin-api";
import { useAuth } from "@/auth/auth-context";
import { AuthShell, Field, FormError } from "@/auth/auth-shell";
import { Button } from "@/components/ui/button";

export function readInviteToken(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return value && value.length > 0 ? value : null;
}

export function InvitePage() {
  const api = useAdminApi();
  const auth = useAuth();
  const navigate = useNavigate();
  const [token] = useState(() => readInviteToken(window.location.hash));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <AuthShell title="Invite link incomplete" description="This link is missing its invite code.">
        <p className="text-sm text-muted-foreground">
          Ask the person who invited you for a fresh link.
        </p>
      </AuthShell>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvite({ token, email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invite");
      setBusy(false);
      return;
    }
    try {
      await auth.signIn(email.trim(), password);
      await navigate({ to: "/", replace: true });
    } catch {
      await navigate({ to: "/signin", replace: true });
    }
  };

  return (
    <AuthShell title="Create your account" description="You have been invited to EPUB Translator.">
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
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
