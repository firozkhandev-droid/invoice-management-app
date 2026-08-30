import PDFDocument from "pdfkit";

type JsonRecord = Record<string, unknown>;

export type InvoicePdfLine = {
  sortOrder: number;
  description: string;
  hsnSac?: string | null;
  sku?: string | null;
  quantity: string | number;
  unitCode?: string | null;
  rate: string | number;
  taxableAmount: string | number;
  gstRate: string | number;
  igstAmount: string | number;
  cgstAmount: string | number;
  sgstAmount: string | number;
  lineTotal: string | number;
};

export type InvoicePdfData = {
  documentTitle?: string;
  originalInvoiceNumber?: string | null;
  originalInvoiceDate?: Date | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  currency: string;
  buyerOrderNumber?: string | null;
  buyerOrderDate?: Date | null;
  exporterReference?: string | null;
  preCarriageBy?: string | null;
  placeOfReceipt?: string | null;
  vesselFlightNo?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  finalDestination?: string | null;
  termsOfDelivery?: string | null;
  company: JsonRecord | null;
  buyer: JsonRecord | null;
  consignee: JsonRecord | null;
  billingAddress: JsonRecord | null;
  shippingAddress: JsonRecord | null;
  bank: JsonRecord | null;
  logo?: {
    data: Buffer;
    mimeType: string;
  } | null;
  signature?: {
    data: Buffer;
    mimeType: string;
  } | null;
  lines: InvoicePdfLine[];
  totals: {
    subtotal: string | number;
    invoiceDiscount: string | number;
    otherCharges: string | number;
    taxableTotal: string | number;
    igstTotal: string | number;
    cgstTotal: string | number;
    sgstTotal: string | number;
    roundOff: string | number;
    grandTotal: string | number;
  };
  notes?: string | null;
  declaration?: string | null;
};

const page = { margin: 28, right: 567, bottom: 812 };
const tableX = page.margin;
const tableWidth = page.right - page.margin;
const widths = { marks: 70, hsn: 45, sku: 55, description: 174, quantity: 48, unit: 34, rate: 55, amount: 58 };
const colors = {
  ink: "#111827",
  muted: "#475569",
  border: "#cbd5e1",
  soft: "#f8fafc",
  primary: "#0f766e",
  primaryLight: "#e6f4f1"
};

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: page.margin, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    drawInvoice(doc, data);
    addPageNumbers(doc);
    doc.end();
  });
}

export function invoicePdfFilename(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[^a-z0-9-_]+/gi, "-") || "invoice"}.pdf`;
}

function drawInvoice(doc: PDFKit.PDFDocument, data: InvoicePdfData) {
  doc.lineWidth(0.6).strokeColor(colors.border).fillColor(colors.ink);
  drawDocumentTitle(doc, data);

  let y = drawHeaderGrid(doc, data, 72);
  y = drawPartyGrid(doc, data, y);
  y = drawLogisticsGrid(doc, data, y);
  y = drawItemsTable(doc, data.lines, y, data.currency);
  y = drawTotalsAndWords(doc, data, y);
  drawBankDeclarationSignature(doc, data, y);
}

function drawDocumentTitle(doc: PDFKit.PDFDocument, data: InvoicePdfData) {
  const title = data.documentTitle || "Tax Invoice";
  doc.roundedRect(page.margin, 26, tableWidth, 34, 6).fill(colors.primary);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15).text(title, page.margin + 14, 36, {
    width: 250
  });
  doc.font("Helvetica").fontSize(8).text(`Generated ${formatDate(new Date())}`, page.margin, 38, {
    width: tableWidth - 14,
    align: "right"
  });
  doc.fillColor(colors.ink);
}

function drawHeaderGrid(doc: PDFKit.PDFDocument, data: InvoicePdfData, y: number): number {
  const leftW = 300;
  const rightW = tableWidth - leftW;
  const companyName = text(data.company, "legalName", "Company");
  drawCell(doc, tableX, y, leftW, 98, "Exporter", [
    companyName,
    text(data.company, "tradingName"),
    ...formatAddressLines(data.company),
    ids(data.company).join(" | ")
  ], true);
  drawBrandMark(doc, tableX + leftW - 48, y + 12, companyName, data.logo);

  const rightX = tableX + leftW;
  drawCell(doc, rightX, y, rightW / 2, 49, data.documentTitle === "Credit Note" ? "Credit note no." : "Invoice no.", [data.invoiceNumber], true);
  drawCell(doc, rightX + rightW / 2, y, rightW / 2, 49, "Document date", [formatDate(data.invoiceDate), data.dueDate ? `Due ${formatDate(data.dueDate)}` : ""]);
  drawCell(doc, rightX, y + 49, rightW / 2, 49, "Exporter ref.", [data.exporterReference || text(data.company, "iec") || "-"]);
  drawCell(doc, rightX + rightW / 2, y + 49, rightW / 2, 49, data.documentTitle === "Credit Note" ? "Original invoice" : "Buyer order", [
    data.documentTitle === "Credit Note"
      ? [data.originalInvoiceNumber, data.originalInvoiceDate ? formatDate(data.originalInvoiceDate) : ""].filter(Boolean).join(" - ")
      : [data.buyerOrderNumber, data.buyerOrderDate ? formatDate(data.buyerOrderDate) : ""].filter(Boolean).join(" - ")
  ]);

  return y + 98;
}

function drawPartyGrid(doc: PDFKit.PDFDocument, data: InvoicePdfData, y: number): number {
  const half = tableWidth / 2;
  drawCell(doc, tableX, y, half, 100, "Consignee / ship to", [
    text(data.consignee, "displayName", text(data.buyer, "displayName", "-")),
    ...formatAddressLines(data.shippingAddress),
    ids(data.consignee).join(" | ")
  ]);
  drawCell(doc, tableX + half, y, half, 100, "Buyer / bill to", [
    text(data.buyer, "displayName", text(data.buyer, "legalName", "-")),
    ...formatAddressLines(data.billingAddress),
    ids(data.buyer).join(" | ")
  ]);
  drawCell(doc, tableX, y + 100, half, 34, "Country of origin", [text(data.company, "country", "India")]);
  drawCell(doc, tableX + half, y + 100, half, 34, "Country of final destination", [
    text(data.shippingAddress, "country", data.finalDestination || text(data.buyer, "country", ""))
  ]);
  return y + 134;
}

function drawLogisticsGrid(doc: PDFKit.PDFDocument, data: InvoicePdfData, y: number): number {
  const third = tableWidth / 3;
  drawCell(doc, tableX, y, third, 36, "Pre-Carriage by", [data.preCarriageBy || ""]);
  drawCell(doc, tableX + third, y, third, 36, "Place of Receipt by Pre-Carrier", [data.placeOfReceipt || ""]);
  drawCell(doc, tableX + third * 2, y, third, 36, "Terms of Delivery and Payment", [data.termsOfDelivery || ""]);
  drawCell(doc, tableX, y + 36, third, 36, "Vessel/Flight No.", [data.vesselFlightNo || ""]);
  drawCell(doc, tableX + third, y + 36, third, 36, "Port of Loading", [data.portOfLoading || ""]);
  drawCell(doc, tableX + third * 2, y + 36, third, 36, "Port of Discharge / Final Destination", [
    [data.portOfDischarge, data.finalDestination].filter(Boolean).join(" / ")
  ]);
  return y + 72;
}

function drawItemsTable(doc: PDFKit.PDFDocument, lines: InvoicePdfLine[], startY: number, currency: string): number {
  let y = startY;
  drawItemHeader(doc, y, currency);
  y += 36;

  lines.forEach((item, index) => {
    const rowHeight = Math.max(28, doc.heightOfString(item.description, { width: widths.description - 8 }) + 14);
    if (y + rowHeight + 172 > page.bottom) {
      doc.addPage();
      y = page.margin;
      drawItemHeader(doc, y, currency);
      y += 36;
    }

    const cells = [
      { value: index === 0 ? "Marks & No.\nContainer No." : "", width: widths.marks, align: "left" as const },
      { value: item.hsnSac || "-", width: widths.hsn, align: "left" as const },
      { value: item.sku || String(item.sortOrder), width: widths.sku, align: "left" as const },
      { value: item.description, width: widths.description, align: "left" as const },
      { value: formatQty(item.quantity), width: widths.quantity, align: "right" as const },
      { value: item.unitCode || "", width: widths.unit, align: "center" as const },
      { value: money(item.rate), width: widths.rate, align: "right" as const },
      { value: money(item.lineTotal), width: widths.amount, align: "right" as const }
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

function drawItemHeader(doc: PDFKit.PDFDocument, y: number, currency: string) {
  const headers = [
    ["Marks & No.\nContainer No.", widths.marks],
    ["HSN Code", widths.hsn],
    ["Item No.", widths.sku],
    ["Description of Goods", widths.description],
    ["Quantity", widths.quantity],
    ["Unit", widths.unit],
    [`Rate in ${currency}`, widths.rate],
    [`Amount in ${currency}`, widths.amount]
  ] as const;

  let x = tableX;
  headers.forEach(([label, width]) => {
    doc.rect(x, y, width, 36).fillAndStroke(colors.soft, colors.border);
    doc.fillColor(colors.ink).font("Helvetica-Bold").fontSize(7.5).text(label, x + 3, y + 7, { width: width - 6, align: width <= 58 ? "center" : "left" });
    x += width;
  });
}

function drawTotalsAndWords(doc: PDFKit.PDFDocument, data: InvoicePdfData, y: number): number {
  if (y + 150 > page.bottom) {
    doc.addPage();
    y = page.margin;
  }

  const leftW = 335;
  const rightLabelW = 120;
  const amountW = tableWidth - leftW - rightLabelW;
  const totalRows = visibleTotalRows(data);
  const boxH = 24 + totalRows.length * 20;

  drawCell(doc, tableX, y, leftW, boxH, "Amount chargeable (in words)", [
    amountInWords(Number(data.totals.grandTotal), data.currency)
  ]);

  let rowY = y;
  totalRows.forEach(([label, value], index) => {
    const h = index === totalRows.length - 1 ? 24 : 20;
    drawPlainCell(doc, tableX + leftW, rowY, rightLabelW, h, label, "left", index === totalRows.length - 1);
    drawPlainCell(doc, tableX + leftW + rightLabelW, rowY, amountW, h, money(value), "right", index === totalRows.length - 1);
    rowY += h;
  });

  return y + boxH;
}

function drawBankDeclarationSignature(doc: PDFKit.PDFDocument, data: InvoicePdfData, y: number) {
  if (y + 146 > page.bottom) {
    doc.addPage();
    y = page.margin;
  }

  const leftW = 335;
  const rightW = tableWidth - leftW;
  drawCell(doc, tableX, y, leftW, 82, "Bank details", [
    text(data.bank, "bankName") ? `Bank Name - ${text(data.bank, "bankName")}` : "",
    text(data.bank, "accountHolderName") ? `Company Name - ${text(data.bank, "accountHolderName")}` : "",
    text(data.bank, "accountNumberLast4") ? `Account Number - xxxxxx${text(data.bank, "accountNumberLast4")}` : "",
    [text(data.bank, "ifsc") ? `IFSC - ${text(data.bank, "ifsc")}` : "", text(data.bank, "swiftBic") ? `Swift Code - ${text(data.bank, "swiftBic")}` : ""].filter(Boolean).join(", "),
    text(data.bank, "branchName") ? `Branch - ${text(data.bank, "branchName")}` : ""
  ]);
  drawCell(doc, tableX + leftW, y, rightW, 82, "Signature", [
    `For, ${text(data.company, "legalName", "Company")}`,
    "",
    "",
    text(data.company, "signatoryName"),
    text(data.company, "signatoryDesignation", "Authorised Signatory")
  ]);
  drawSignatureImage(doc, tableX + leftW + 18, y + 31, rightW - 36, 22, data.signature);
  doc.moveTo(tableX + leftW + 18, y + 56).lineTo(tableX + leftW + rightW - 18, y + 56).strokeColor(colors.border).stroke();
  drawCell(doc, tableX, y + 82, tableWidth, 58, "Declaration", [
    data.declaration || "We declare that this Invoice shows the actual prices of the goods described and that all particulars are true and correct."
  ]);
}

function visibleTotalRows(data: InvoicePdfData): Array<[string, string | number]> {
  const rows: Array<[string, string | number]> = [
    ["TOTAL Amount", data.totals.subtotal],
    ["IGST", data.totals.igstTotal],
    ["CGST", data.totals.cgstTotal],
    ["SGST", data.totals.sgstTotal],
    ["Discount", data.totals.invoiceDiscount],
    ["Other Charges", data.totals.otherCharges],
    ["Round Off", data.totals.roundOff],
    [data.currency === "INR" ? "Grand Total in Rs." : `Grand Total in ${data.currency}`, data.totals.grandTotal]
  ];
  return rows.filter(([label, value]) => label.startsWith("Grand") || Number(value || 0) !== 0 || label === "TOTAL Amount");
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

function drawPlainCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, value: string, align: "left" | "right" | "center", bold = false) {
  doc.rect(x, y, width, height).fillAndStroke("#ffffff", colors.border);
  doc.fillColor(colors.ink).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 7.5).text(value, x + 3, y + 7, {
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

function drawBrandMark(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  name: string,
  logo: InvoicePdfData["logo"]
) {
  if (logo && canDrawImage(logo.mimeType)) {
    try {
      doc.image(logo.data, x - 6, y - 2, { fit: [46, 42], align: "center", valign: "center" });
      return;
    } catch {
      // Fall back to initials if an uploaded image cannot be decoded by PDFKit.
    }
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "IM";
  doc.roundedRect(x, y, 34, 34, 5).fill(colors.primaryLight);
  doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(11).text(initials, x, y + 11, {
    width: 34,
    align: "center"
  });
  doc.fillColor(colors.ink);
}

function drawSignatureImage(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  signature: InvoicePdfData["signature"]
) {
  if (!signature || !canDrawImage(signature.mimeType)) return;

  try {
    doc.image(signature.data, x, y, { fit: [width, height], valign: "center" });
  } catch {
    // Keep the signature line visible if the uploaded image cannot be decoded.
  }
}

function canDrawImage(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/jpg";
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

function money(value: string | number): string {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: string | number): string {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function amountInWords(value: number, currency: string): string {
  if (currency !== "INR") return `${money(value)} ${currency} Only`;
  const rupees = Math.floor(Math.abs(value));
  if (rupees === 0) return "Zero Rupees Only";
  return `${numberToIndianWords(rupees)} Rupees Only`;
}

function numberToIndianWords(value: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowHundred = (n: number) => n < 20 ? ones[n] : [tens[Math.floor(n / 10)], ones[n % 10]].filter(Boolean).join(" ");
  const belowThousand = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : "", n % 100 ? belowHundred(n % 100) : ""].filter(Boolean).join(" ");

  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (value) parts.push(belowThousand(value));
  return parts.join(" ");
}
