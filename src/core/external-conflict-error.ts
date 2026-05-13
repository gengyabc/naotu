export class ExternalConflictError extends Error {
  constructor(message?: string) {
    super(message ?? "File modified externally, please reopen and try saving again.");
    this.name = "ExternalConflictError";
  }
}
