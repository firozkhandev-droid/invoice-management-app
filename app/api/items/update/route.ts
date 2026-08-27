import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { updateItem } from "@/lib/items/item-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { itemUpdateSchema } from "@/lib/validation/items";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

  const context = await getTenantContextForUser(user.id);
  if (!context) return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });

  const parsed = itemUpdateSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.json({ ok: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });

  await updateItem(context, parsed.data);
  redirect("/items");
}
