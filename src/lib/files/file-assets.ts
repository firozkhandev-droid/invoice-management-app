import crypto from "node:crypto";
import path from "node:path";
import { env } from "@/lib/env";
import type { TenantContext } from "@/lib/repositories/tenant-context";

export type FileAssetKind = "company_logo" | "company_signature";

export type PreparedFileAsset = {
  organisationId: string;
  kind: FileAssetKind;
  originalName: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  data: Buffer;
};

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateCompanyImageAsset(file: File, kind: FileAssetKind): void {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error(`${kind} must be a PNG, JPEG, or WebP image.`);
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error(`${kind} must be 2 MB or smaller.`);
  }
}

export async function prepareFileAsset(
  context: TenantContext,
  file: File,
  kind: FileAssetKind
): Promise<PreparedFileAsset> {
  validateCompanyImageAsset(file, kind);
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name).toLowerCase();
  const storageKey = path.posix.join(
    context.organisationId,
    kind,
    `${crypto.randomUUID()}${extension}`
  );

  return {
    organisationId: context.organisationId,
    kind,
    originalName: file.name,
    storageKey,
    mimeType: file.type,
    byteSize: file.size,
    checksumSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    data: bytes
  };
}

export function privateUploadRoot(): string {
  return env.UPLOAD_DIR;
}
