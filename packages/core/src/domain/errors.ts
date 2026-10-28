export class InvalidEpubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEpubError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Provider not configured: ${provider}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class BatchNotSupportedError extends Error {
  constructor(provider: string) {
    super(`Provider does not support batch mode: ${provider}`);
    this.name = "BatchNotSupportedError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class InviteInvalidError extends Error {
  constructor() {
    super("This invite is invalid or has expired");
    this.name = "InviteInvalidError";
  }
}

export class AccountCreationError extends Error {
  constructor() {
    super("Could not create the account");
    this.name = "AccountCreationError";
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super("Too many attempts, try again later");
    this.name = "RateLimitedError";
  }
}

export class LeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaseError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class InvalidWorkResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkResultError";
  }
}

export class FatalProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalProviderError";
  }
}
