import { AlertTriangle } from "lucide-react";
import { useHosted } from "@/keys/hosted-context";

const AUTH = /HTTP 40[13]|authentication/i;
const QUOTA = /HTTP 429|rate.?limit|quota|credit/i;

function hintFor(message: string, hosted: boolean): string | null {
  if (AUTH.test(message)) {
    return hosted
      ? "Check the key under AI keys, then translate again."
      : "Fix the key in apps/api/.env, restart the app, then translate again.";
  }
  if (QUOTA.test(message)) {
    return "The provider is limiting requests. Wait a little, or check your plan's credit, then try again.";
  }
  return null;
}

export function TranslationError({
  chapterError,
  jobError,
}: {
  chapterError: string | null | undefined;
  jobError: string | null | undefined;
}) {
  const hosted = useHosted() !== null;
  const message = chapterError ?? jobError;
  if (!message) return null;
  const hint = hintFor(message, hosted);
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium break-words">Translation stopped: {message}</p>
        {hint ? <p className="text-destructive/80">{hint}</p> : null}
      </div>
    </div>
  );
}
