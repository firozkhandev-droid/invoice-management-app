import { Prisma, type PackingListStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertPermission } from "@/lib/permissions/roles";
import { requireTenantContext, type TenantContext } from "@/lib/repositories/tenant-context";
import { calculatePackingTotals, lineVolumeCbm } from "@/lib/packing-lists/calculation";
import type {
  PackingListDraftInput,
  PackingListIssueInput,
  PackingListLineDeleteInput,
  PackingListLineInput
} from "@/lib/validation/packing-lists";

type InvoiceWithPackingSourceLines = Prisma.InvoiceGetPayload<{
  include: { items: { include: { item: true }, orderBy: { sortOrder: "asc" } } };
}>;

export type PackingListFilters = {
  status?: string;
  q?: string;
};

export async function listPackingLists(context: TenantContext, filters: PackingListFilters = {}) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "documents:download");

  const where: Prisma.PackingListWhereInput = {
    organisationId: tenant.organisationId,
    ...(filters.status ? { status: filters.status as PackingListStatus } : {}),
    ...(filters.q
      ? {
          OR: [
            { packingListNumber: { contains: filters.q } },
            { exportReference: { contains: filters.q } },
            { invoice: { invoiceNumber: { contains: filters.q } } },
            { buyer: { displayName: { contains: filters.q } } },
            { company: { legalName: { contains: filters.q } } }
          ]
        }
      : {})
  };

  return prisma.packingList.findMany({
    where,
    include: {
      invoice: true,
      company: true,
      buyer: true,
      consigneeBuyer: true,
      lines: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: [{ packingListDate: "desc" }, { createdAt: "desc" }]
  });
}

export async function getPackingList(context: TenantContext, packingListId: string) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "documents:download");

  return prisma.packingList.findFirst({
    where: { id: packingListId, organisationId: tenant.organisationId },
    include: {
      invoice: { include: { items: { include: { item: true }, orderBy: { sortOrder: "asc" } } } },
      company: true,
      buyer: true,
      consigneeBuyer: true,
      lines: { include: { item: true, invoiceItem: true }, orderBy: { sortOrder: "asc" } }
    }
  });
}

export async function getPackingListWorkspace(context: TenantContext) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "documents:download");

  const [invoices, companies, buyers, items] = await Promise.all([
    prisma.invoice.findMany({
      where: { organisationId: tenant.organisationId, status: { in: ["issued", "partially_paid", "paid"] } },
      include: { buyer: true, company: true },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.company.findMany({ where: { organisationId: tenant.organisationId, isActive: true }, orderBy: { legalName: "asc" } }),
    prisma.buyer.findMany({ where: { organisationId: tenant.organisationId, isActive: true }, orderBy: { displayName: "asc" } }),
    prisma.item.findMany({ where: { organisationId: tenant.organisationId, isActive: true }, orderBy: { name: "asc" } })
  ]);

  return { invoices, companies, buyers, items };
}

export async function createPackingListDraft(context: TenantContext, input: PackingListDraftInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    let invoice: InvoiceWithPackingSourceLines | null = null;

    if (input.invoiceId) {
      invoice = await tx.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organisationId: tenant.organisationId,
          status: { in: ["issued", "partially_paid", "paid"] }
        },
        include: { items: { include: { item: true }, orderBy: { sortOrder: "asc" } } }
      });

      if (!invoice) throw new Error("Issued invoice not found.");
    }

    await validateMasterRefs(tx, tenant.organisationId, input);

    const packingList = await tx.packingList.create({
      data: {
        organisationId: tenant.organisationId,
        invoiceId: invoice?.id,
        companyId: input.companyId || invoice?.companyId,
        buyerId: input.buyerId || invoice?.buyerId,
        consigneeBuyerId: input.consigneeBuyerId || invoice?.consigneeBuyerId,
        packingListDate: input.packingListDate,
        exportReference: input.exportReference || invoice?.exporterReference,
        containerNumber: input.containerNumber,
        sealNumber: input.sealNumber,
        shipmentMode: input.shipmentMode,
        portOfLoading: input.portOfLoading || invoice?.portOfLoading,
        portOfDischarge: input.portOfDischarge || invoice?.portOfDischarge,
        finalDestination: input.finalDestination || invoice?.finalDestination,
        notes: input.notes,
        createdById: tenant.userId
      }
    });

    if (invoice?.items?.length) {
      await tx.packingListLine.createMany({
        data: invoice.items.map((line) => {
          const itemWeight = line.item?.weightKg || new Prisma.Decimal(0);
          const quantity = line.quantity;
          const netWeight = itemWeight.mul(quantity);

          return {
            organisationId: tenant.organisationId,
            packingListId: packingList.id,
            invoiceItemId: line.id,
            itemId: line.itemId,
            sortOrder: line.sortOrder,
            sku: line.sku,
            description: line.description,
            hsnSac: line.hsnSac,
            quantity,
            unitCode: line.unitCode,
            netWeightKg: netWeight,
            grossWeightKg: netWeight
          };
        })
      });
    }

    const saved = await updatePackingTotals(tx, packingList.id, tenant.organisationId, tenant.userId);

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "packing_list.create",
        entityType: "packing_list",
        entityId: saved.id,
        metadata: { invoiceId: invoice?.id || null }
      }
    });

    return saved;
  });
}

export async function updatePackingListDraft(context: TenantContext, packingListId: string, input: PackingListDraftInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const current = await tx.packingList.findFirst({ where: { id: packingListId, organisationId: tenant.organisationId } });
    if (!current) throw new Error("Packing list not found.");
    if (current.status !== "draft") throw new Error("Only draft packing lists can be edited.");
    if (input.version && input.version !== current.version) throw new Error("Packing list was changed elsewhere. Refresh and try again.");

    await validateMasterRefs(tx, tenant.organisationId, input);

    const packingList = await tx.packingList.update({
      where: { id: current.id },
      data: {
        companyId: input.companyId,
        buyerId: input.buyerId,
        consigneeBuyerId: input.consigneeBuyerId,
        packingListDate: input.packingListDate,
        exportReference: input.exportReference,
        containerNumber: input.containerNumber,
        sealNumber: input.sealNumber,
        shipmentMode: input.shipmentMode,
        portOfLoading: input.portOfLoading,
        portOfDischarge: input.portOfDischarge,
        finalDestination: input.finalDestination,
        notes: input.notes,
        version: { increment: 1 },
        updatedById: tenant.userId
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "packing_list.update",
        entityType: "packing_list",
        entityId: packingList.id
      }
    });

    return packingList;
  });
}

export async function addPackingListLine(context: TenantContext, input: PackingListLineInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const packingList = await tx.packingList.findFirst({
      where: { id: input.packingListId, organisationId: tenant.organisationId }
    });
    if (!packingList) throw new Error("Packing list not found.");
    if (packingList.status !== "draft") throw new Error("Only draft packing lists can be edited.");
    if (packingList.version !== input.expectedVersion) throw new Error("Packing list was changed elsewhere. Refresh and try again.");

    if (input.itemId) {
      const item = await tx.item.findFirst({ where: { id: input.itemId, organisationId: tenant.organisationId } });
      if (!item) throw new Error("Item not found.");
    }

    if (input.invoiceItemId) {
      const invoiceItem = await tx.invoiceItem.findFirst({
        where: { id: input.invoiceItemId, organisationId: tenant.organisationId }
      });
      if (!invoiceItem) throw new Error("Invoice item not found.");
    }

    const line = await tx.packingListLine.create({
      data: {
        organisationId: tenant.organisationId,
        packingListId: packingList.id,
        itemId: input.itemId,
        invoiceItemId: input.invoiceItemId,
        sortOrder: input.sortOrder,
        packageNo: input.packageNo,
        marksAndNumbers: input.marksAndNumbers,
        sku: input.sku,
        description: input.description,
        hsnSac: input.hsnSac,
        quantity: new Prisma.Decimal(input.quantity),
        unitCode: input.unitCode,
        netWeightKg: new Prisma.Decimal(input.netWeightKg),
        grossWeightKg: new Prisma.Decimal(input.grossWeightKg),
        lengthCm: input.lengthCm === undefined ? undefined : new Prisma.Decimal(input.lengthCm),
        widthCm: input.widthCm === undefined ? undefined : new Prisma.Decimal(input.widthCm),
        heightCm: input.heightCm === undefined ? undefined : new Prisma.Decimal(input.heightCm),
        volumeCbm: lineVolumeCbm(input)
      }
    });

    const updated = await updatePackingTotals(tx, packingList.id, tenant.organisationId, tenant.userId);

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "packing_list_line.create",
        entityType: "packing_list_line",
        entityId: line.id,
        metadata: { packingListId: packingList.id }
      }
    });

    return updated;
  });
}

export async function deletePackingListLine(context: TenantContext, input: PackingListLineDeleteInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:create");

  return prisma.$transaction(async (tx) => {
    const packingList = await tx.packingList.findFirst({
      where: { id: input.packingListId, organisationId: tenant.organisationId },
      include: { lines: true }
    });
    if (!packingList) throw new Error("Packing list not found.");
    if (packingList.status !== "draft") throw new Error("Only draft packing lists can be edited.");
    if (packingList.version !== input.expectedVersion) throw new Error("Packing list was changed elsewhere. Refresh and try again.");

    const line = packingList.lines.find((item) => item.id === input.lineId);
    if (!line) throw new Error("Packing list line not found.");

    await tx.packingListLine.delete({ where: { id: line.id } });
    const updated = await updatePackingTotals(tx, packingList.id, tenant.organisationId, tenant.userId);

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "packing_list_line.delete",
        entityType: "packing_list_line",
        entityId: line.id,
        metadata: { packingListId: packingList.id }
      }
    });

    return updated;
  });
}

export async function issuePackingList(context: TenantContext, input: PackingListIssueInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "invoices:issue");

  return prisma.$transaction(async (tx) => {
    const packingList = await tx.packingList.findFirst({
      where: { id: input.packingListId, organisationId: tenant.organisationId },
      include: { lines: true }
    });
    if (!packingList) throw new Error("Packing list not found.");
    if (packingList.status !== "draft") throw new Error("Only draft packing lists can be issued.");
    if (packingList.version !== input.expectedVersion) throw new Error("Packing list was changed elsewhere. Refresh and try again.");
    if (!packingList.companyId || !packingList.buyerId || packingList.lines.length === 0) {
      throw new Error("Select a company, buyer, and at least one packing line before issuing.");
    }

    const year = packingList.packingListDate.getFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const count = await tx.packingList.count({
      where: {
        organisationId: tenant.organisationId,
        status: "issued",
        packingListDate: { gte: start, lt: end }
      }
    });
    const sequence = count + 1;
    const packingListNumber = `PL/${year}/${String(sequence).padStart(4, "0")}`;

    const issued = await tx.packingList.update({
      where: { id: packingList.id },
      data: {
        status: "issued",
        packingListNumber,
        sequenceNumber: sequence,
        issuedById: tenant.userId,
        issuedAt: new Date(),
        version: { increment: 1 }
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "packing_list.issue",
        entityType: "packing_list",
        entityId: issued.id,
        metadata: { packingListNumber }
      }
    });

    return issued;
  });
}

export async function generatePackingListPdf(context: TenantContext, packingListId: string) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "documents:download");

  const packingList = await getPackingList(context, packingListId);
  if (!packingList) throw new Error("Packing list not found.");
  if (packingList.status !== "issued") throw new Error("Only issued packing lists can be generated as PDF.");
  if (!packingList.packingListNumber) throw new Error("Issued packing list is missing its number.");

  const { packingListPdfFilename, renderPackingListPdf } = await import("@/lib/packing-lists/packing-list-pdf");
  const buffer = await renderPackingListPdf({
    packingListNumber: packingList.packingListNumber,
    packingListDate: packingList.packingListDate,
    invoiceNumber: packingList.invoice?.invoiceNumber,
    invoiceDate: packingList.invoice?.invoiceDate,
    exportReference: packingList.exportReference,
    containerNumber: packingList.containerNumber,
    sealNumber: packingList.sealNumber,
    shipmentMode: packingList.shipmentMode,
    portOfLoading: packingList.portOfLoading,
    portOfDischarge: packingList.portOfDischarge,
    finalDestination: packingList.finalDestination,
    company: asRecord(packingList.company),
    buyer: asRecord(packingList.buyer),
    consignee: asRecord(packingList.consigneeBuyer || packingList.buyer),
    lines: packingList.lines.map((line) => ({
      sortOrder: line.sortOrder,
      packageNo: line.packageNo,
      marksAndNumbers: line.marksAndNumbers,
      sku: line.sku,
      description: line.description,
      hsnSac: line.hsnSac,
      quantity: line.quantity.toString(),
      unitCode: line.unitCode,
      netWeightKg: line.netWeightKg.toString(),
      grossWeightKg: line.grossWeightKg.toString(),
      lengthCm: line.lengthCm?.toString(),
      widthCm: line.widthCm?.toString(),
      heightCm: line.heightCm?.toString(),
      volumeCbm: line.volumeCbm.toString()
    })),
    totals: {
      packages: packingList.totalPackages,
      quantity: packingList.totalQuantity.toString(),
      netWeightKg: packingList.totalNetWeightKg.toString(),
      grossWeightKg: packingList.totalGrossWeightKg.toString(),
      volumeCbm: packingList.totalVolumeCbm.toString()
    },
    notes: packingList.notes
  });

  await prisma.auditLog.create({
    data: {
      organisationId: tenant.organisationId,
      actorUserId: tenant.userId,
      action: "packing_list_pdf.generate",
      entityType: "packing_list",
      entityId: packingList.id,
      metadata: { byteSize: buffer.byteLength }
    }
  });

  return { buffer, filename: packingListPdfFilename(packingList.packingListNumber) };
}

async function validateMasterRefs(
  tx: Prisma.TransactionClient,
  organisationId: string,
  input: Pick<PackingListDraftInput, "companyId" | "buyerId" | "consigneeBuyerId">
) {
  if (input.companyId) {
    const count = await tx.company.count({ where: { id: input.companyId, organisationId } });
    if (!count) throw new Error("Company not found.");
  }

  if (input.buyerId) {
    const count = await tx.buyer.count({ where: { id: input.buyerId, organisationId } });
    if (!count) throw new Error("Buyer not found.");
  }

  if (input.consigneeBuyerId) {
    const count = await tx.buyer.count({ where: { id: input.consigneeBuyerId, organisationId } });
    if (!count) throw new Error("Consignee not found.");
  }
}

async function updatePackingTotals(
  tx: Prisma.TransactionClient,
  packingListId: string,
  organisationId: string,
  userId: string
) {
  const lines = await tx.packingListLine.findMany({
    where: { packingListId, organisationId },
    orderBy: { sortOrder: "asc" }
  });
  const totals = calculatePackingTotals(lines);

  return tx.packingList.update({
    where: { id: packingListId },
    data: {
      totalPackages: totals.packageCount,
      totalQuantity: totals.quantity,
      totalNetWeightKg: totals.netWeightKg,
      totalGrossWeightKg: totals.grossWeightKg,
      totalVolumeCbm: totals.volumeCbm,
      version: { increment: 1 },
      updatedById: userId
    }
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
