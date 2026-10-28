import { MIN_PASSWORD_LENGTH } from "@et/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { AuthShell, Field, FormError } from "@/auth/auth-shell";
import { Button } from "@/components/ui/button";

export function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status !== "signedIn") {
    return (
      <AuthShell title="Reset your password" description="This reset link is no longer valid.">
        <Link to="/signin" className="text-sm underline">
          Back to sign in
        </Link>
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
      await auth.setPassword(password);
      await navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      description="Pick a password you have not used before."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
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
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
