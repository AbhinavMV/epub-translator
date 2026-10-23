import { UnknownLanguageError } from "@et/contracts";
import {
  BatchNotSupportedError,
  FatalProviderError,
  InvalidEpubError,
  NotFoundError,
  ProviderNotConfiguredError,
} from "@et/core";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function errorStatus(err: unknown): ContentfulStatusCode {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof InvalidEpubError) return 422;
  if (
    err instanceof ProviderNotConfiguredError ||
    err instanceof BatchNotSupportedError ||
    err instanceof UnknownLanguageError
  ) {
    return 400;
  }
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
