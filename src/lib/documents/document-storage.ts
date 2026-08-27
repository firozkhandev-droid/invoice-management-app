import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { env } from "@/lib/env";

export type StoredDocument = {
  storageKey: string;
  checksumSha256: string;
  byteSize: number;
};

const DOCUMENT_ROOT = "generated-documents";

export function documentStorageRoot(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR, DOCUMENT_ROOT);
}

export function invoicePdfStorageKey(organisationId: string, invoiceId: string): string {
  return path.posix.join(DOCUMENT_ROOT, organisationId, invoiceId, `${randomUUID()}.pdf`);
}

export function creditNotePdfStorageKey(organisationId: string, creditNoteId: string): string {
  return path.posix.join(DOCUMENT_ROOT, organisationId, "credit-notes", creditNoteId, `${randomUUID()}.pdf`);
}

export async function writePrivateDocument(storageKey: string, data: Buffer): Promise<StoredDocument> {
  const uploadRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOAD_DIR);
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOAD_DIR, storageKey);

  if (!absolutePath.startsWith(uploadRoot + path.sep)) {
    throw new Error("Invalid document storage path.");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);

  return {
    storageKey,
    checksumSha256: createHash("sha256").update(data).digest("hex"),
    byteSize: data.byteLength
  };
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  const uploadRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOAD_DIR);
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOAD_DIR, storageKey);

  if (!absolutePath.startsWith(uploadRoot + path.sep)) {
    throw new Error("Invalid document storage path.");
  }

  return readFile(absolutePath);
}
