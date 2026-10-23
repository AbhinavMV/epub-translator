export class PlaceholderMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaceholderMismatchError";
  }
}
