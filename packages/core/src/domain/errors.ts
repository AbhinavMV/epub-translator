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

export class FatalProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalProviderError";
  }
}
