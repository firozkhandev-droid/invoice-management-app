import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { issuePackingList } from "@/lib/packing-lists/packing-list-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { packingListIssueSchema } from "@/lib/validation/packing-lists";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

  const context = await getTenantContextForUser(user.id);
  if (!context) return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });

  const parsed = packingListIssueSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return Response.json({ ok: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });

  const packingList = await issuePackingList(context, parsed.data);
  redirect(`/packing-lists/${packingList.id}`);
}
