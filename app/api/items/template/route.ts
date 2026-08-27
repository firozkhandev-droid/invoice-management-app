const headers = [
  "sku",
  "name",
  "description",
  "category",
  "subcategory",
  "hsnSac",
  "manufacturer",
  "barcode",
  "weightKg",
  "unitCode",
  "taxRateName",
  "saleRate",
  "currency",
  "isActive"
];

const sample = [
  "IND-0001",
  "Brass pooja set",
  "Brass pooja set with intricate design",
  "Metal Handicrafts",
  "Pooja",
  "8306",
  "Decorative Handicrafts",
  "890000000001",
  "1.5000",
  "PCS",
  "GST 12%",
  "1200.00",
  "INR",
  "true"
];

export async function GET() {
  const csv = `${headers.join(",")}\n${sample.map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(",")}\n`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=item-import-template.csv"
    }
  });
}
