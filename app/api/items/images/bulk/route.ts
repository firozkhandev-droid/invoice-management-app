import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { uploadBulkItemImages } from "@/lib/items/item-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";

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
  const files = formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length === 0) {
    redirect("/items?error=Choose+one+or+more+product+images+to+upload.");
  }

  let message: string;
  try {
    const result = await uploadBulkItemImages(context, files);
    message = `${result.linked} image${result.linked === 1 ? "" : "s"} linked${result.unmatched.length ? `, ${result.unmatched.length} unmatched` : ""}.`;
  } catch (error) {
    message = error instanceof Error ? error.message : "Bulk item images could not be uploaded.";
    redirect(`/items?error=${encodeURIComponent(message)}`);
  }

  redirect(`/items?notice=${encodeURIComponent(message)}`);
}
