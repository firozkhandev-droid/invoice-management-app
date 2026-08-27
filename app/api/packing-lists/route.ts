import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createPackingListDraft, updatePackingListDraft } from "@/lib/packing-lists/packing-list-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { packingListDraftSchema } from "@/lib/validation/packing-lists";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

  const context = await getTenantContextForUser(user.id);
  if (!context) return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });

  const form = Object.fromEntries(await request.formData());
  const parsed = packingListDraftSchema.safeParse(form);
  if (!parsed.success) return Response.json({ ok: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });

  const packingListId = typeof form.packingListId === "string" ? form.packingListId : "";
  const packingList = packingListId
    ? await updatePackingListDraft(context, packingListId, parsed.data)
    : await createPackingListDraft(context, parsed.data);

  redirect(`/packing-lists/${packingList.id}`);
}
