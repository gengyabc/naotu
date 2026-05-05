import { CURRENT_DOCUMENT_VERSION } from "../core/versioning";
import type { MindmapDocument } from "../types/mindmap";

export type Migration = (doc: unknown) => unknown;

const migrations: Record<number, Migration> = {};

export function runMigrations(input: unknown): MindmapDocument {
  let doc = input as Record<string, unknown>;
  let version = typeof doc.version === "number" ? doc.version : 1;

  while (version < CURRENT_DOCUMENT_VERSION) {
    const migration = migrations[version];
    if (!migration) {
      throw new Error(`Missing migration for document version ${version}`);
    }

    doc = migration(doc) as Record<string, unknown>;
    version += 1;
    doc.version = version;
  }

  return doc as unknown as MindmapDocument;
}
