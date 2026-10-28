import { UnknownLanguageError } from "@et/contracts";
import {
  AccountCreationError,
  AssetTooLargeError,
  BatchNotSupportedError,
  ConflictError,
  FatalProviderError,
  ForbiddenError,
  InvalidEpubError,
  InvalidWorkResultError,
  InviteInvalidError,
  LeaseError,
  NotFoundError,
  ProviderNotConfiguredError,
  RateLimitedError,
  UnauthorizedError,
} from "@et/core";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { InvalidUploadPathError } from "../infra/supabase-uploads.ts";

export function errorStatus(err: unknown): ContentfulStatusCode {
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof AssetTooLargeError) return 413;
  if (err instanceof ConflictError) return 409;
  if (err instanceof RateLimitedError) return 429;
  if (err instanceof InviteInvalidError) return 400;
  if (err instanceof AccountCreationError) return 422;
  if (err instanceof InvalidEpubError) return 422;
  if (err instanceof InvalidUploadPathError) return 400;
  if (
    err instanceof InvalidWorkResultError ||
    err instanceof ProviderNotConfiguredError ||
    err instanceof BatchNotSupportedError ||
    err instanceof UnknownLanguageError
  ) {
    return 400;
  }
  if (err instanceof LeaseError || err instanceof ConflictError) return 409;
  if (err instanceof FatalProviderError) return 502;
  return 500;
}

export function handleError(err: Error, c: Context) {
  const status = errorStatus(err);
  if (status === 500) {
    console.error(`[api] ${c.req.method} ${c.req.path} failed: ${err.name}`);
    return c.json({ error: "Internal server error" }, 500);
  }
  return c.json({ error: err.message }, status);
}
