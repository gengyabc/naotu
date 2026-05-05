export const CURRENT_DOCUMENT_VERSION = 1;

export function isSupportedDocumentVersion(version: unknown): boolean {
  return typeof version === "number" && version >= 1 && version <= CURRENT_DOCUMENT_VERSION;
}
