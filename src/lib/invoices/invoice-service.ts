import { Prisma, type InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateInvoiceTotals, type InvoiceCalculationLine, type TaxModeInput } from "@/lib/invoices/calculation";
import { canDeleteDraftInvoiceStatus, draftIssueRequirements } from "@/lib/invoices/lifecycle";
import type { InvoicePdfData, InvoicePdfLine } from "@/lib/invoices/invoice-pdf";
import { assertPermission } from "@/lib/permissions/roles";
import { requireTenantContext, type TenantContext } from "@/lib/repositories/tenant-context";
import { financialYearLabel } from "@/lib/settings/financial-year";
import { renderInvoiceNumber, resetKeyForRule } from "@/lib/settings/number-series";
import type {
  CancelInvoiceInput,
  DeleteDraftInvoiceInput,
  InvoiceDraftInput,
  InvoiceItemDeleteInput,
  InvoiceItemInput,
  InvoiceItemUpdateInput,
  IssueInvoiceInput
} from "@/lib/validation/invoices";

export type InvoiceListFilters = {
  q?: string;
  status?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
};

type InvoiceSnapshotSource = {
  company: unknown | null;
  buyer: unknown | null;
  consigneeBuyer: unknown | null;
  billingAddress: unknown | null;
  shippingAddress: unknown | null;
  bankAccount: unknown | null;
  subtotal: Prisma.Decimal;
  invoiceDiscount: Prisma.Decimal;
  otherCharges: Prisma.Decimal;
  taxableTotal: Prisma.Decimal;
  igstTotal: Prisma.Decimal;
  cgstTotal: Prisma.Decimal;
  sgstTotal: Prisma.Decimal;
  roundOff: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  items: unknown[];
};

type InvoicePdfSource = InvoiceSnapshotSource & {
  invoiceNumber: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  currency: string;
  buyerOrderNumber: string | null;
  buyerOrderDate: Date | null;
  exporterReference: string | null;
  preCarriageBy: string | null;
  placeOfReceipt: string | null;
  vesselFlightNo: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  finalDestination: string | null;
  termsOfDelivery: string | null;
  companySnapshot: unknown | null;
  buyerSnapshot: unknown | null;
  consigneeSnapshot: unknown | null;
  bankSnapshot: unknown | null;
  calculationSnapshot: unknown | null;
  notes: string | null;
  declaration: string | null;
};

export async function listInvoices(context: TenantContext, filters: InvoiceListFilters = {}) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:read");
  const where: Prisma.InvoiceWhereInput = {
    organisationId: tenant.organisationId,
    ...(filters.status ? { status: filters.status as InvoiceStatus } : {}),
    ...(filters.currency ? { currency: filters.currency.toUpperCase() } : {}),
    ...(filters.dateFrom || filters.dateTo ? {
      invoiceDate: {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {})
      }
    } : {}),
    ...(filters.q ? {
      OR: [
        { invoiceNumber: { contains: filters.q } },
        { buyer: { displayName: { contains: filters.q } } },
        { company: { legalName: { contains: filters.q } } }
      ]
    } : {})
  };

  return prisma.invoice.findMany({
    where,
    include: { company: true, buyer: true, items: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }]
  });
}

export async function getInvoice(context: TenantContext, invoiceId: string) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:read");

  return prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId: tenant.organisationId },
    include: {
      company: { include: { logoAsset: true, signatureAsset: true } },
      buyer: true,
      consigneeBuyer: true,
      billingAddress: true,
      shippingAddress: true,
      bankAccount: true,
      items: { orderBy: { sortOrder: "asc" } },
      revisions: {
        include: { createdBy: true },
        orderBy: { revisionNumber: "desc" }
      },
      creditNotes: {
        include: { createdBy: true },
        orderBy: { createdAt: "desc" }
      },
      packingLists: {
        include: { lines: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ packingListDate: "desc" }, { createdAt: "desc" }]
      }
    }
  });
}

export async function getInvoiceEditorData(context: TenantContext) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: tenant.organisationId }
  });
  const companies = await prisma.company.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    orderBy: { legalName: "asc" }
  });
  const buyers = await prisma.buyer.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    include: { addresses: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { displayName: "asc" }
  });
  const bankAccounts = await prisma.companyBankAccount.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    orderBy: { bankName: "asc" }
  });
  const masterItems = await prisma.item.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    include: { unit: true, taxRate: true },
    orderBy: { name: "asc" }
  });
  const settings = await prisma.organisationSettings.findUnique({
    where: { organisationId: tenant.organisationId }
  });
  const series = await prisma.invoiceNumberSeries.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });

  return { organisation, companies, buyers, bankAccounts, masterItems, settings, series };
}

export async function getInvoiceIssueOptions(context: TenantContext) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:issue");

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: tenant.organisationId }
  });
  const series = await prisma.invoiceNumberSeries.findMany({
    where: { organisationId: tenant.organisationId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });

  return { organisation, series };
}

export async function createInvoiceDraft(context: TenantContext, input: InvoiceDraftInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    await validateReferences(tx, tenant.organisationId, input);
    const totals = calculateInvoiceTotals([], input.taxMode, input.invoiceDiscount, input.otherCharges);

    const invoice = await tx.invoice.create({
      data: {
        ...input,
        organisationId: tenant.organisationId,
        createdById: tenant.userId,
        subtotal: totals.subtotal,
        taxableTotal: totals.taxableTotal,
        igstTotal: totals.igstTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidTotal: new Prisma.Decimal(0),
        balanceDue: new Prisma.Decimal(0)
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_draft.create",
        entityType: "invoice",
        entityId: invoice.id
      }
    });

    return invoice;
  });
}

export async function updateInvoiceDraft(
  context: TenantContext,
  invoiceId: string,
  input: InvoiceDraftInput
) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findFirst({
      where: { id: invoiceId, organisationId: tenant.organisationId },
      include: { items: true }
    });

    if (!current) throw new Error("Invoice not found.");
    if (current.status !== "draft") throw new Error("Only draft invoices can be edited.");
    if (input.version && input.version !== current.version) throw new Error("Invoice was changed elsewhere. Refresh and try again.");

    await validateReferences(tx, tenant.organisationId, input);

    const totals = calculateInvoiceTotals(
      current.items.map((line) => ({
        quantity: line.quantity,
        rate: line.rate,
        discountAmount: line.discountAmount,
        gstRate: line.gstRate
      })),
      input.taxMode,
      input.invoiceDiscount,
      input.otherCharges
    );

    const invoice = await tx.invoice.update({
      where: { id: current.id },
      data: {
        ...input,
        updatedById: tenant.userId,
        subtotal: totals.subtotal,
        taxableTotal: totals.taxableTotal,
        igstTotal: totals.igstTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidTotal: new Prisma.Decimal(0),
        balanceDue: new Prisma.Decimal(0),
        version: { increment: 1 }
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_draft.update",
        entityType: "invoice",
        entityId: invoice.id
      }
    });

    return invoice;
  });
}

export async function deleteDraftInvoice(context: TenantContext, input: DeleteDraftInvoiceInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organisationId: tenant.organisationId },
      select: { id: true, status: true, invoiceNumber: true }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (!canDeleteDraftInvoiceStatus(invoice.status)) throw new Error("Only draft invoices can be deleted.");

    await tx.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id, organisationId: tenant.organisationId }
    });
    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_draft.delete",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber }
      }
    });
    await tx.invoice.delete({
      where: { id: invoice.id }
    });

    return invoice;
  });
}

export async function addInvoiceItem(context: TenantContext, input: InvoiceItemInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organisationId: tenant.organisationId },
      include: { items: true }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be edited.");
    if (invoice.version !== input.expectedVersion) throw new Error("Invoice was changed elsewhere. Refresh and try again.");

    if (input.itemId) {
      const item = await tx.item.findFirst({
        where: { id: input.itemId, organisationId: tenant.organisationId }
      });
      if (!item) throw new Error("Item not found.");
    }

    const lineTotals = calculateInvoiceTotals([input], invoice.taxMode);
    const line = lineTotals.lines[0];

    await tx.invoiceItem.create({
      data: {
        organisationId: tenant.organisationId,
        invoiceId: invoice.id,
        itemId: input.itemId,
        sortOrder: input.sortOrder,
        sku: input.sku,
        description: input.description,
        hsnSac: input.hsnSac,
        quantity: new Prisma.Decimal(input.quantity),
        unitCode: input.unitCode,
        rate: new Prisma.Decimal(input.rate),
        discountAmount: new Prisma.Decimal(input.discountAmount),
        taxableAmount: line.taxableAmount,
        gstRate: new Prisma.Decimal(input.gstRate),
        igstAmount: line.igstAmount,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        lineTotal: line.lineTotal
      }
    });

    const allLines = [...invoice.items, {
      quantity: new Prisma.Decimal(input.quantity),
      rate: new Prisma.Decimal(input.rate),
      discountAmount: new Prisma.Decimal(input.discountAmount),
      gstRate: new Prisma.Decimal(input.gstRate)
    }];
    const totals = calculateInvoiceTotals(allLines, invoice.taxMode, invoice.invoiceDiscount, invoice.otherCharges);

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: totals.subtotal,
        taxableTotal: totals.taxableTotal,
        igstTotal: totals.igstTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidTotal: new Prisma.Decimal(0),
        balanceDue: new Prisma.Decimal(0),
        updatedById: tenant.userId,
        version: { increment: 1 }
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_item.create",
        entityType: "invoice",
        entityId: invoice.id
      }
    });

    return updatedInvoice;
  });
}

export async function updateInvoiceItem(context: TenantContext, input: InvoiceItemUpdateInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organisationId: tenant.organisationId },
      include: { items: true }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "draft") throw new Error("Only draft invoice lines can be edited.");
    if (invoice.version !== input.expectedVersion) throw new Error("Invoice was changed elsewhere. Refresh and try again.");

    const currentLine = invoice.items.find((item) => item.id === input.lineItemId);
    if (!currentLine) throw new Error("Invoice line item not found.");

    if (input.itemId) {
      const item = await tx.item.findFirst({
        where: { id: input.itemId, organisationId: tenant.organisationId }
      });
      if (!item) throw new Error("Item not found.");
    }

    const lineTotals = calculateInvoiceTotals([input], invoice.taxMode);
    const line = lineTotals.lines[0];

    await tx.invoiceItem.update({
      where: { id: currentLine.id },
      data: {
        itemId: input.itemId,
        sortOrder: input.sortOrder,
        sku: input.sku,
        description: input.description,
        hsnSac: input.hsnSac,
        quantity: new Prisma.Decimal(input.quantity),
        unitCode: input.unitCode,
        rate: new Prisma.Decimal(input.rate),
        discountAmount: new Prisma.Decimal(input.discountAmount),
        taxableAmount: line.taxableAmount,
        gstRate: new Prisma.Decimal(input.gstRate),
        igstAmount: line.igstAmount,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        lineTotal: line.lineTotal
      }
    });

    const allLines = invoice.items.map((item) => item.id === currentLine.id
      ? {
          quantity: new Prisma.Decimal(input.quantity),
          rate: new Prisma.Decimal(input.rate),
          discountAmount: new Prisma.Decimal(input.discountAmount),
          gstRate: new Prisma.Decimal(input.gstRate)
        }
      : item
    );
    const updatedInvoice = await updateInvoiceTotals(tx, invoice, allLines, tenant.userId);

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_item.update",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { lineItemId: currentLine.id }
      }
    });

    return updatedInvoice;
  });
}

export async function deleteInvoiceItem(context: TenantContext, input: InvoiceItemDeleteInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organisationId: tenant.organisationId },
      include: { items: true }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "draft") throw new Error("Only draft invoice lines can be deleted.");
    if (invoice.version !== input.expectedVersion) throw new Error("Invoice was changed elsewhere. Refresh and try again.");

    const currentLine = invoice.items.find((item) => item.id === input.lineItemId);
    if (!currentLine) throw new Error("Invoice line item not found.");

    await tx.invoiceItem.delete({
      where: { id: currentLine.id }
    });

    const remainingLines = invoice.items.filter((item) => item.id !== currentLine.id);
    const updatedInvoice = await updateInvoiceTotals(tx, invoice, remainingLines, tenant.userId);

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice_item.delete",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { lineItemId: currentLine.id }
      }
    });

    return updatedInvoice;
  });
}

async function updateInvoiceTotals(
  tx: Prisma.TransactionClient,
  invoice: {
    id: string;
    taxMode: TaxModeInput;
    invoiceDiscount: Prisma.Decimal;
    otherCharges: Prisma.Decimal;
  },
  lines: InvoiceCalculationLine[],
  userId: string
) {
  const totals = calculateInvoiceTotals(lines, invoice.taxMode, invoice.invoiceDiscount, invoice.otherCharges);

  return tx.invoice.update({
    where: { id: invoice.id },
    data: {
      subtotal: totals.subtotal,
      taxableTotal: totals.taxableTotal,
      igstTotal: totals.igstTotal,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      paidTotal: new Prisma.Decimal(0),
      balanceDue: new Prisma.Decimal(0),
      updatedById: userId,
      version: { increment: 1 }
    }
  });
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  organisationId: string,
  input: InvoiceDraftInput
) {
  if (input.companyId) {
    const exists = await tx.company.count({ where: { id: input.companyId, organisationId } });
    if (!exists) throw new Error("Company not found.");
  }
  if (input.buyerId) {
    const exists = await tx.buyer.count({ where: { id: input.buyerId, organisationId } });
    if (!exists) throw new Error("Buyer not found.");
  }
  if (input.consigneeBuyerId) {
    const exists = await tx.buyer.count({ where: { id: input.consigneeBuyerId, organisationId } });
    if (!exists) throw new Error("Consignee not found.");
  }
  if (input.billingAddressId) {
    const exists = await tx.buyerAddress.count({ where: { id: input.billingAddressId, organisationId } });
    if (!exists) throw new Error("Billing address not found.");
  }
  if (input.shippingAddressId) {
    const exists = await tx.buyerAddress.count({ where: { id: input.shippingAddressId, organisationId } });
    if (!exists) throw new Error("Shipping address not found.");
  }
  if (input.bankAccountId) {
    const exists = await tx.companyBankAccount.count({ where: { id: input.bankAccountId, organisationId } });
    if (!exists) throw new Error("Bank account not found.");
  }
}

export async function issueInvoice(context: TenantContext, input: IssueInvoiceInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:issue");

  return prisma.$transaction(
    async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, organisationId: tenant.organisationId },
        include: {
          company: true,
          buyer: true,
          consigneeBuyer: true,
          billingAddress: true,
          shippingAddress: true,
          bankAccount: true,
          items: { orderBy: { sortOrder: "asc" } }
        }
      });

      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status !== "draft") throw new Error("Only draft invoices can be issued.");
      if (invoice.version !== input.expectedVersion) throw new Error("Invoice was changed elsewhere. Refresh and try again.");
      const requirements = draftIssueRequirements({
        status: invoice.status,
        companyId: invoice.companyId,
        buyerId: invoice.buyerId,
        itemCount: invoice.items.length,
        grandTotal: invoice.grandTotal
      });
      if (requirements.length > 0) throw new Error(`Before issuing: ${requirements.join(", ")}.`);

      const organisation = await tx.organisation.findUniqueOrThrow({
        where: { id: tenant.organisationId }
      });
      const series = await tx.invoiceNumberSeries.findFirst({
        where: { id: input.seriesId, organisationId: tenant.organisationId, isActive: true }
      });
      if (!series) throw new Error("Invoice number series not found.");

      const resetKey = resetKeyForRule(series.resetRule, invoice.invoiceDate, organisation.financialYearStart);
      const shouldReset = resetKey !== null && series.lastResetKey !== resetKey;
      let sequenceNumber = shouldReset ? series.startingNumber : series.nextSequence;
      let invoiceNumber = renderInvoiceNumber({
        pattern: series.pattern,
        prefix: series.prefix,
        sequence: sequenceNumber,
        date: invoice.invoiceDate,
        financialYearStartMonth: organisation.financialYearStart
      });
      let numberAvailable = false;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const existingInvoice = await tx.invoice.findFirst({
          where: {
            organisationId: tenant.organisationId,
            invoiceNumber,
            NOT: { id: invoice.id }
          },
          select: { id: true }
        });
        const voidedNumber = await tx.invoiceNumberVoid.findFirst({
          where: { organisationId: tenant.organisationId, invoiceNumber },
          select: { id: true }
        });
        if (!existingInvoice && !voidedNumber) {
          numberAvailable = true;
          break;
        }

        sequenceNumber += 1;
        invoiceNumber = renderInvoiceNumber({
          pattern: series.pattern,
          prefix: series.prefix,
          sequence: sequenceNumber,
          date: invoice.invoiceDate,
          financialYearStartMonth: organisation.financialYearStart
        });
      }
      if (!numberAvailable) throw new Error("Could not allocate an unused invoice number.");

      await tx.invoiceNumberSeries.update({
        where: { id: series.id },
        data: {
          nextSequence: sequenceNumber + 1,
          lastResetKey: resetKey
        }
      });

      const snapshot = buildInvoiceSnapshot(invoice);
      const issued = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "issued",
          seriesId: series.id,
          invoiceNumber,
          sequenceNumber,
          financialYear: financialYearLabel(invoice.invoiceDate, organisation.financialYearStart),
          companySnapshot: snapshot.company,
          buyerSnapshot: snapshot.buyer,
          consigneeSnapshot: snapshot.consignee,
          bankSnapshot: snapshot.bank,
          calculationSnapshot: snapshot.calculation,
          documentSnapshot: snapshot.document,
          paidTotal: new Prisma.Decimal(0),
          balanceDue: invoice.grandTotal,
          issuedById: tenant.userId,
          issuedAt: new Date(),
          updatedById: tenant.userId,
          version: { increment: 1 }
        }
      });

      await tx.invoiceRevision.create({
        data: {
          organisationId: tenant.organisationId,
          invoiceId: invoice.id,
          revisionNumber: 1,
          reason: "Initial issue",
          snapshot,
          createdById: tenant.userId
        }
      });

      await tx.generatedDocument.create({
        data: {
          organisationId: tenant.organisationId,
          invoiceId: invoice.id,
          documentType: "invoice_pdf",
          templateVersion: "a4-reference-v1",
          generatedById: tenant.userId
        }
      });

      await tx.auditLog.create({
        data: {
          organisationId: tenant.organisationId,
          actorUserId: tenant.userId,
          action: "invoice.issue",
          entityType: "invoice",
          entityId: invoice.id,
          metadata: { invoiceNumber, sequenceNumber }
        }
      });

      return issued;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function cancelInvoice(context: TenantContext, input: CancelInvoiceInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:cancel");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organisationId: tenant.organisationId },
      include: { items: true }
    });

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "issued") throw new Error("Only issued invoices can be cancelled.");

    const cancelled = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "cancelled",
        cancelledById: tenant.userId,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        updatedById: tenant.userId,
        version: { increment: 1 }
      }
    });

    await tx.invoiceRevision.create({
      data: {
        organisationId: tenant.organisationId,
        invoiceId: invoice.id,
        revisionNumber: 2,
        reason: `Cancelled: ${input.reason}`,
        snapshot: JSON.parse(JSON.stringify(invoice)),
        createdById: tenant.userId
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "invoice.cancel",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { reason: input.reason }
      }
    });

    return cancelled;
  });
}

export async function generateInvoicePdf(context: TenantContext, invoiceId: string) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:read");
  assertPermission(tenant.role, "documents:download");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId: tenant.organisationId },
    include: {
      company: true,
      buyer: true,
      consigneeBuyer: true,
      billingAddress: true,
      shippingAddress: true,
      bankAccount: true,
      items: { orderBy: { sortOrder: "asc" } }
    }
  });

  if (!invoice) throw new Error("Invoice not found.");
  if (!["issued", "partially_paid", "paid"].includes(invoice.status)) {
    throw new Error("Only issued invoices can be generated as PDF.");
  }
  if (!invoice.invoiceNumber) throw new Error("Issued invoice is missing its invoice number.");

  const [{ invoicePdfFilename, renderInvoicePdf }, { invoicePdfStorageKey, readPrivateDocument, writePrivateDocument }] = await Promise.all([
    import("@/lib/invoices/invoice-pdf"),
    import("@/lib/documents/document-storage")
  ]);
  const companyAssets = invoice.company as (typeof invoice.company & {
    logoAsset?: { storageKey: string; mimeType: string } | null;
    signatureAsset?: { storageKey: string; mimeType: string } | null;
  }) | null;
  const [logo, signature] = await Promise.all([
    companyAssets?.logoAsset ? readAssetForPdf(readPrivateDocument, companyAssets.logoAsset) : Promise.resolve(null),
    companyAssets?.signatureAsset ? readAssetForPdf(readPrivateDocument, companyAssets.signatureAsset) : Promise.resolve(null)
  ]);
  const pdfData = {
    ...buildInvoicePdfData(invoice),
    logo,
    signature
  };
  const buffer = await renderInvoicePdf(pdfData);
  const stored = await writePrivateDocument(
    invoicePdfStorageKey(tenant.organisationId, invoice.id),
    buffer
  );

  const document = await prisma.generatedDocument.create({
    data: {
      organisationId: tenant.organisationId,
      invoiceId: invoice.id,
      documentType: "invoice_pdf",
      templateVersion: "a4-reference-v1",
      storageKey: stored.storageKey,
      checksumSha256: stored.checksumSha256,
      generatedById: tenant.userId
    }
  });

  await prisma.auditLog.create({
    data: {
      organisationId: tenant.organisationId,
      actorUserId: tenant.userId,
      action: "invoice_pdf.generate",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        documentId: document.id,
        storageKey: stored.storageKey,
        byteSize: stored.byteSize
      }
    }
  });

  return {
    buffer,
    filename: invoicePdfFilename(invoice.invoiceNumber),
    document
  };
}

function buildInvoiceSnapshot(invoice: InvoiceSnapshotSource) {
  return {
    company: invoice?.company ? JSON.parse(JSON.stringify(invoice.company)) : null,
    buyer: invoice?.buyer ? JSON.parse(JSON.stringify(invoice.buyer)) : null,
    consignee: {
      buyer: invoice?.consigneeBuyer ? JSON.parse(JSON.stringify(invoice.consigneeBuyer)) : null,
      billingAddress: invoice?.billingAddress ? JSON.parse(JSON.stringify(invoice.billingAddress)) : null,
      shippingAddress: invoice?.shippingAddress ? JSON.parse(JSON.stringify(invoice.shippingAddress)) : null
    },
    bank: invoice?.bankAccount ? JSON.parse(JSON.stringify(invoice.bankAccount)) : null,
    calculation: {
      subtotal: invoice?.subtotal.toString(),
      invoiceDiscount: invoice?.invoiceDiscount.toString(),
      otherCharges: invoice?.otherCharges.toString(),
      taxableTotal: invoice?.taxableTotal.toString(),
      igstTotal: invoice?.igstTotal.toString(),
      cgstTotal: invoice?.cgstTotal.toString(),
      sgstTotal: invoice?.sgstTotal.toString(),
      roundOff: invoice?.roundOff.toString(),
      grandTotal: invoice?.grandTotal.toString(),
      items: invoice?.items ? JSON.parse(JSON.stringify(invoice.items)) : []
    },
    document: {
      templateVersion: "a4-reference-v1",
      generatedFrom: "issued_snapshot"
    }
  };
}

function buildInvoicePdfData(invoice: InvoicePdfSource): InvoicePdfData {
  const company = asRecord(invoice.companySnapshot) ?? asRecord(invoice.company);
  const buyer = asRecord(invoice.buyerSnapshot) ?? asRecord(invoice.buyer);
  const consigneeSnapshot = asRecord(invoice.consigneeSnapshot);
  const bank = asRecord(invoice.bankSnapshot) ?? asRecord(invoice.bankAccount);
  const calculation = asRecord(invoice.calculationSnapshot);

  return {
    invoiceNumber: invoice.invoiceNumber || "invoice",
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    buyerOrderNumber: invoice.buyerOrderNumber,
    buyerOrderDate: invoice.buyerOrderDate,
    exporterReference: invoice.exporterReference,
    preCarriageBy: invoice.preCarriageBy,
    placeOfReceipt: invoice.placeOfReceipt,
    vesselFlightNo: invoice.vesselFlightNo,
    portOfLoading: invoice.portOfLoading,
    portOfDischarge: invoice.portOfDischarge,
    finalDestination: invoice.finalDestination,
    termsOfDelivery: invoice.termsOfDelivery,
    company,
    buyer,
    consignee: asRecord(consigneeSnapshot?.buyer) ?? asRecord(invoice.consigneeBuyer),
    billingAddress: asRecord(consigneeSnapshot?.billingAddress) ?? asRecord(invoice.billingAddress),
    shippingAddress: asRecord(consigneeSnapshot?.shippingAddress) ?? asRecord(invoice.shippingAddress),
    bank,
    lines: invoiceLinesFromSnapshot(calculation, invoice.items),
    totals: {
      subtotal: valueOrDecimal(calculation?.subtotal, invoice.subtotal),
      invoiceDiscount: valueOrDecimal(calculation?.invoiceDiscount, invoice.invoiceDiscount),
      otherCharges: valueOrDecimal(calculation?.otherCharges, invoice.otherCharges),
      taxableTotal: valueOrDecimal(calculation?.taxableTotal, invoice.taxableTotal),
      igstTotal: valueOrDecimal(calculation?.igstTotal, invoice.igstTotal),
      cgstTotal: valueOrDecimal(calculation?.cgstTotal, invoice.cgstTotal),
      sgstTotal: valueOrDecimal(calculation?.sgstTotal, invoice.sgstTotal),
      roundOff: valueOrDecimal(calculation?.roundOff, invoice.roundOff),
      grandTotal: valueOrDecimal(calculation?.grandTotal, invoice.grandTotal)
    },
    notes: invoice.notes,
    declaration: invoice.declaration
  };
}

function invoiceLinesFromSnapshot(
  calculation: Record<string, unknown> | null,
  fallbackLines: unknown[]
): InvoicePdfLine[] {
  const snapshotLines = Array.isArray(calculation?.items) ? calculation.items : fallbackLines;

  return snapshotLines.map((line, index) => {
    const record = asRecord(line) ?? {};
    return {
      sortOrder: numberValue(record.sortOrder, index + 1),
      description: stringValue(record.description, "-"),
      hsnSac: nullableString(record.hsnSac),
      sku: nullableString(record.sku),
      quantity: stringValue(record.quantity, "0"),
      unitCode: nullableString(record.unitCode),
      rate: stringValue(record.rate, "0"),
      taxableAmount: stringValue(record.taxableAmount, "0"),
      gstRate: stringValue(record.gstRate, "0"),
      igstAmount: stringValue(record.igstAmount, "0"),
      cgstAmount: stringValue(record.cgstAmount, "0"),
      sgstAmount: stringValue(record.sgstAmount, "0"),
      lineTotal: stringValue(record.lineTotal, "0")
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function readAssetForPdf(
  readPrivateDocument: (storageKey: string) => Promise<Buffer>,
  asset: { storageKey: string; mimeType: string }
) {
  try {
    return {
      data: await readPrivateDocument(asset.storageKey),
      mimeType: asset.mimeType
    };
  } catch {
    return null;
  }
}

function valueOrDecimal(value: unknown, fallback: Prisma.Decimal): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback.toString();
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value instanceof Prisma.Decimal) return value.toString();
  return fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : Number(value || fallback);
}
