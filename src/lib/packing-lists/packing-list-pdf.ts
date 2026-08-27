import PDFDocument from "pdfkit";

type JsonRecord = Record<string, unknown>;

export type PackingListPdfLine = {
  sortOrder: number;
  packageNo?: string | null;
  marksAndNumbers?: string | null;
  sku?: string | null;
  description: string;
  hsnSac?: string | null;
  quantity: string | number;
  unitCode?: string | null;
  netWeightKg: string | number;
  grossWeightKg: string | number;
  lengthCm?: string | number | null;
  widthCm?: string | number | null;
  heightCm?: string | number | null;
  volumeCbm: string | number;
};

export type PackingListPdfData = {
  packingListNumber: string;
  packingListDate: Date;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  exportReference?: string | null;
  containerNumber?: string | null;
  sealNumber?: string | null;
  shipmentMode?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  finalDestination?: string | null;
  company: JsonRecord | null;
  buyer: JsonRecord | null;
  consignee: JsonRecord | null;
  lines: PackingListPdfLine[];
  totals: {
    packages: string | number;
    quantity: string | number;
    netWeightKg: string | number;
    grossWeightKg: string | number;
    volumeCbm: string | number;
  };
  notes?: string | null;
};

const page = { margin: 28, right: 567, bottom: 812 };
const tableX = page.margin;
const tableWidth = page.right - page.margin;
const widths = { marks: 78, sku: 58, description: 170, quantity: 48, net: 52, gross: 52, dimensions: 64, cbm: 48 };
const colors = {
  ink: "#111827",
  muted: "#475569",
  border: "#cbd5e1",
  soft: "#f8fafc",
  primary: "#0f766e",
  primaryLight: "#e6f4f1"
};

export function renderPackingListPdf(data: PackingListPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: page.margin, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawPackingList(doc, data);
    addPageNumbers(doc);
    doc.end();
  });
}

export function packingListPdfFilename(packingListNumber: string): string {
  return `${packingListNumber.replace(/[^a-z0-9-_]+/gi, "-") || "packing-list"}.pdf`;
}

function drawPackingList(doc: PDFKit.PDFDocument, data: PackingListPdfData) {
  doc.lineWidth(0.6).strokeColor(colors.border).fillColor(colors.ink);
  drawDocumentTitle(doc);

  let y = drawHeader(doc, data, 72);
  y = drawPartyGrid(doc, data, y);
  y = drawShipmentGrid(doc, data, y);
  y = drawLinesTable(doc, data.lines, y);
  y = drawTotals(doc, data, y);
  drawDeclaration(doc, data, y);
}

function drawDocumentTitle(doc: PDFKit.PDFDocument) {
  doc.roundedRect(page.margin, 26, tableWidth, 34, 6).fill(colors.primary);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15).text("Packing List", page.margin + 14, 36, {
    width: 250
  });
  doc.font("Helvetica").fontSize(8).text(`Generated ${formatDate(new Date())}`, page.margin, 38, {
    width: tableWidth - 14,
    align: "right"
  });
  doc.fillColor(colors.ink);
}

function drawHeader(doc: PDFKit.PDFDocument, data: PackingListPdfData, y: number): number {
  const leftW = 300;
  const rightW = tableWidth - leftW;
  const companyName = text(data.company, "legalName", "Company");
  drawCell(doc, tableX, y, leftW, 98, "Exporter", [
    companyName,
    text(data.company, "tradingName"),
    ...formatAddressLines(data.company),
    ids(data.company).join(" | ")
  ], true);
  drawMonogram(doc, tableX + leftW - 48, y + 12, companyName);

  const rightX = tableX + leftW;
  drawCell(doc, rightX, y, rightW / 2, 49, "Packing list no.", [data.packingListNumber], true);
  drawCell(doc, rightX + rightW / 2, y, rightW / 2, 49, "Packing list date", [formatDate(data.packingListDate)]);
  drawCell(doc, rightX, y + 49, rightW / 2, 49, "Invoice reference", [
    [data.invoiceNumber, data.invoiceDate ? formatDate(data.invoiceDate) : ""].filter(Boolean).join(" - ") || "-"
  ]);
  drawCell(doc, rightX + rightW / 2, y + 49, rightW / 2, 49, "Export reference", [data.exportReference || text(data.company, "iec") || "-"]);

  return y + 98;
}

function drawPartyGrid(doc: PDFKit.PDFDocument, data: PackingListPdfData, y: number): number {
  const half = tableWidth / 2;
  drawCell(doc, tableX, y, half, 88, "Buyer", [
    text(data.buyer, "displayName", text(data.buyer, "legalName", "-")),
    ...formatAddressLines(data.buyer),
    ids(data.buyer).join(" | ")
  ]);
  drawCell(doc, tableX + half, y, half, 88, "Consignee / ship to", [
    text(data.consignee, "displayName", text(data.buyer, "displayName", "-")),
    ...formatAddressLines(data.consignee),
    ids(data.consignee).join(" | ")
  ]);
  return y + 88;
}

function drawShipmentGrid(doc: PDFKit.PDFDocument, data: PackingListPdfData, y: number): number {
  const third = tableWidth / 3;
  drawCell(doc, tableX, y, third, 38, "Shipment mode", [data.shipmentMode || "-"]);
  drawCell(doc, tableX + third, y, third, 38, "Container no.", [data.containerNumber || "-"]);
  drawCell(doc, tableX + third * 2, y, third, 38, "Seal no.", [data.sealNumber || "-"]);
  drawCell(doc, tableX, y + 38, third, 38, "Port of loading", [data.portOfLoading || "-"]);
  drawCell(doc, tableX + third, y + 38, third, 38, "Port of discharge", [data.portOfDischarge || "-"]);
  drawCell(doc, tableX + third * 2, y + 38, third, 38, "Final destination", [data.finalDestination || "-"]);
  return y + 76;
}

function drawLinesTable(doc: PDFKit.PDFDocument, lines: PackingListPdfLine[], startY: number): number {
  let y = startY;
  drawLineHeader(doc, y);
  y += 36;

  lines.forEach((line) => {
    const rowHeight = Math.max(32, doc.heightOfString(line.description, { width: widths.description - 8 }) + 15);
    if (y + rowHeight + 112 > page.bottom) {
      doc.addPage();
      y = page.margin;
      drawLineHeader(doc, y);
      y += 36;
    }

    const dimensions = [line.lengthCm, line.widthCm, line.heightCm].filter(Boolean).join(" x ");
    const cells = [
      { value: [line.packageNo || `Line ${line.sortOrder}`, line.marksAndNumbers || ""].filter(Boolean).join("\n"), width: widths.marks, align: "left" as const },
      { value: line.sku || line.hsnSac || "-", width: widths.sku, align: "left" as const },
      { value: line.description, width: widths.description, align: "left" as const },
      { value: `${formatQty(line.quantity)} ${line.unitCode || ""}`.trim(), width: widths.quantity, align: "right" as const },
      { value: formatQty(line.netWeightKg), width: widths.net, align: "right" as const },
      { value: formatQty(line.grossWeightKg), width: widths.gross, align: "right" as const },
      { value: dimensions || "-", width: widths.dimensions, align: "center" as const },
      { value: formatCbm(line.volumeCbm), width: widths.cbm, align: "right" as const }
    ];

    let x = tableX;
    cells.forEach((cell) => {
      drawPlainCell(doc, x, y, cell.width, rowHeight, cell.value, cell.align);
      x += cell.width;
    });
    y += rowHeight;
  });

  return y;
}

function drawLineHeader(doc: PDFKit.PDFDocument, y: number) {
  const headers = [
    ["Package / Marks", widths.marks],
    ["Item / HSN", widths.sku],
    ["Description", widths.description],
    ["Qty", widths.quantity],
    ["Net KG", widths.net],
    ["Gross KG", widths.gross],
    ["Dimensions CM", widths.dimensions],
    ["CBM", widths.cbm]
  ] as const;

  let x = tableX;
  headers.forEach(([label, width]) => {
    doc.rect(x, y, width, 36).fillAndStroke(colors.soft, colors.border);
    doc.fillColor(colors.ink).font("Helvetica-Bold").fontSize(7.3).text(label, x + 3, y + 9, {
      width: width - 6,
      align: width <= 64 ? "center" : "left"
    });
    x += width;
  });
}

function drawTotals(doc: PDFKit.PDFDocument, data: PackingListPdfData, y: number): number {
  if (y + 80 > page.bottom) {
    doc.addPage();
    y = page.margin;
  }

  const width = tableWidth / 5;
  const rows = [
    ["Packages", String(data.totals.packages)],
    ["Quantity", formatQty(data.totals.quantity)],
    ["Net weight", `${formatQty(data.totals.netWeightKg)} KG`],
    ["Gross weight", `${formatQty(data.totals.grossWeightKg)} KG`],
    ["Volume", `${formatCbm(data.totals.volumeCbm)} CBM`]
  ] as const;

  rows.forEach(([label, value], index) => {
    drawCell(doc, tableX + width * index, y, width, 58, label, [value], true);
  });

  return y + 58;
}

function drawDeclaration(doc: PDFKit.PDFDocument, data: PackingListPdfData, y: number) {
  if (y + 112 > page.bottom) {
    doc.addPage();
    y = page.margin;
  }

  const leftW = 335;
  drawCell(doc, tableX, y, leftW, 92, "Notes / declaration", [
    data.notes || "We certify that the particulars above are true and correct as per the shipment packing details."
  ]);
  drawCell(doc, tableX + leftW, y, tableWidth - leftW, 92, "Signature", [
    `For, ${text(data.company, "legalName", "Company")}`,
    "",
    "",
    text(data.company, "signatoryName"),
    text(data.company, "signatoryDesignation", "Authorised Signatory")
  ]);
  doc.moveTo(tableX + leftW + 18, y + 64).lineTo(tableX + tableWidth - 18, y + 64).strokeColor(colors.border).stroke();
}

function drawCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, title: string, rows: string[], headline = false) {
  doc.rect(x, y, width, height).fillAndStroke("#ffffff", colors.border);
  doc.rect(x, y, width, 16).fill(colors.soft);
  doc.fillColor(colors.muted).font("Helvetica-Bold").fontSize(7).text(title.toUpperCase(), x + 5, y + 5, { width: width - 10 });
  doc.fillColor(colors.ink).font(headline ? "Helvetica-Bold" : "Helvetica").fontSize(headline ? 8 : 7.5).text(rows.filter(Boolean).join("\n"), x + 5, y + 21, {
    width: width - 8,
    height: height - 24,
    ellipsis: true
  });
}

function drawPlainCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, value: string, align: "left" | "right" | "center") {
  doc.rect(x, y, width, height).fillAndStroke("#ffffff", colors.border);
  doc.fillColor(colors.ink).font("Helvetica").fontSize(7.3).text(value, x + 3, y + 7, {
    width: width - 6,
    height: height - 8,
    align,
    ellipsis: true
  });
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor(colors.muted);
    doc.text(`Page ${i + 1} of ${range.count}`, page.margin, 820, { width: tableWidth, align: "center" });
  }
}

function drawMonogram(doc: PDFKit.PDFDocument, x: number, y: number, name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PL";
  doc.roundedRect(x, y, 34, 34, 5).fill(colors.primaryLight);
  doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(11).text(initials, x, y + 11, {
    width: 34,
    align: "center"
  });
  doc.fillColor(colors.ink);
}

function text(record: JsonRecord | null | undefined, key: string, fallback = ""): string {
  const value = record?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function ids(record: JsonRecord | null): string[] {
  return [
    text(record, "gstin") ? `GSTIN - ${text(record, "gstin")}` : "",
    text(record, "pan") ? `PAN - ${text(record, "pan")}` : "",
    text(record, "iec") ? `IEC - ${text(record, "iec")}` : ""
  ].filter(Boolean);
}

function formatAddressLines(record: JsonRecord | null): string[] {
  return [
    text(record, "addressLine1"),
    text(record, "addressLine2"),
    [text(record, "city"), text(record, "state"), text(record, "postcode")].filter(Boolean).join(", "),
    text(record, "country"),
    text(record, "phone") ? `Mobile# ${text(record, "phone")}` : "",
    text(record, "email")
  ].filter(Boolean);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatQty(value: string | number): string {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function formatCbm(value: string | number): string {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
}
