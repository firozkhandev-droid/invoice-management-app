import { redirect } from "next/navigation";
import { uploadCompanyBrandAsset } from "@/lib/companies/company-service";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import type { FileAssetKind } from "@/lib/files/file-assets";

const assetKinds = new Set<FileAssetKind>(["company_logo", "company_signature"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const context = await getTenantContextForUser(user.id);

  if (!context) {
    return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });
  }

  const formData = await request.formData();
  const companyId = formData.get("companyId");
  const kind = formData.get("kind");
  const file = formData.get("file");

  if (typeof companyId !== "string" || !companyId) {
    redirect("/companies?error=Choose+a+company+before+uploading+branding.");
  }

  if (typeof kind !== "string" || !assetKinds.has(kind as FileAssetKind)) {
    redirect("/companies?error=Choose+logo+or+signature+upload.");
  }

  if (!(file instanceof File) || file.size === 0) {
    redirect("/companies?error=Choose+a+PNG,+JPEG,+or+WebP+file+to+upload.");
  }

  try {
    await uploadCompanyBrandAsset(context, {
      companyId,
      kind: kind as FileAssetKind,
      file
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Branding asset could not be uploaded.";
    redirect(`/companies?error=${encodeURIComponent(message)}`);
  }

  redirect("/companies");
}
