import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { uploadItemImage } from "@/lib/items/item-service";
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
  const itemId = formData.get("itemId");
  const file = formData.get("file");

  if (typeof itemId !== "string" || !itemId) {
    redirect("/items?error=Choose+an+item+before+uploading+an+image.");
  }

  if (!(file instanceof File) || file.size === 0) {
    redirect("/items?error=Choose+a+PNG,+JPEG,+or+WebP+image+to+upload.");
  }

  try {
    await uploadItemImage(context, { itemId, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Item image could not be uploaded.";
    redirect(`/items?error=${encodeURIComponent(message)}`);
  }

  redirect("/items");
}
