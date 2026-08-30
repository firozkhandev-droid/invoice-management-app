import { getCurrentUser } from "@/lib/auth/session";
import { readItemImage } from "@/lib/items/item-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const context = await getTenantContextForUser(user.id);

  if (!context) {
    return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });
  }

  const { id } = await params;
  const image = await readItemImage(context, id);

  if (!image) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${image.originalName.replace(/"/g, "")}"`,
      "Content-Type": image.mimeType
    }
  });
}
