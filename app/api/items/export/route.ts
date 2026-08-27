import { getCurrentUser } from "@/lib/auth/session";
import { listItemMasters } from "@/lib/items/item-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthenticated" }, { status: 401 });

  const context = await getTenantContextForUser(user.id);
  if (!context) return Response.json({ ok: false, error: "No active organisation." }, { status: 403 });

  const url = new URL(request.url);
  const { items } = await listItemMasters(context, {
    q: url.searchParams.get("q") || undefined,
    category: url.searchParams.get("category") || undefined,
    status: url.searchParams.get("status") || undefined,
    sort: url.searchParams.get("sort") || undefined
  });

  const headers = [
    "SKU",
    "Name",
    "Description",
    "Category",
    "Subcategory",
    "HSN/SAC",
    "Manufacturer",
    "Barcode",
    "Weight KG",
    "Unit",
    "Tax rate",
    "Sale rate",
    "Currency",
    "Active",
    "Image status"
  ];
  const rows = items.map((item) => [
    item.sku,
    item.name,
    item.description,
    item.category,
    item.subcategory,
    item.hsnSac,
    item.manufacturer,
    item.barcode,
    item.weightKg?.toString(),
    item.unit?.code,
    item.taxRate ? `${item.taxRate.name} ${item.taxRate.rate.toString()}%` : "",
    item.saleRate?.toString(),
    item.currency,
    item.isActive ? "Active" : "Inactive",
    item.imageStatus
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");

  return new Response(`${csv}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=items-catalog.csv"
    }
  });
}
