import { Prisma } from "@prisma/client";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { readPrivateDocument, writePrivateDocument } from "@/lib/documents/document-storage";
import { prepareFileAsset } from "@/lib/files/file-assets";
import { assertPermission } from "@/lib/permissions/roles";
import { requireTenantContext, type TenantContext } from "@/lib/repositories/tenant-context";
import type { ItemActionInput, ItemInput, ItemUpdateInput, TaxRateInput, UnitInput } from "@/lib/validation/items";

export type ItemListFilters = {
  q?: string;
  category?: string;
  status?: string;
  sort?: string;
};

export async function listItemMasters(context: TenantContext, filters: ItemListFilters = {}) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:read");

  const units = await prisma.unit.findMany({
    where: { organisationId: tenant.organisationId },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }]
  });
  const taxRates = await prisma.taxRate.findMany({
    where: { organisationId: tenant.organisationId },
    orderBy: [{ isDefault: "desc" }, { rate: "asc" }]
  });
  const itemWhere: Prisma.ItemWhereInput = {
    organisationId: tenant.organisationId,
    ...(filters.status === "active" ? { isActive: true } : {}),
    ...(filters.status === "inactive" ? { isActive: false } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q } },
            { sku: { contains: filters.q } },
            { hsnSac: { contains: filters.q } },
            { barcode: { contains: filters.q } },
            { manufacturer: { contains: filters.q } }
          ]
        }
      : {})
  };

  const orderBy: Prisma.ItemOrderByWithRelationInput[] = filters.sort === "oldest"
    ? [{ createdAt: "asc" }]
    : filters.sort === "price"
      ? [{ saleRate: "desc" }, { name: "asc" }]
      : filters.sort === "code"
        ? [{ sku: "asc" }, { name: "asc" }]
        : [{ createdAt: "desc" }, { name: "asc" }];

  const items = await prisma.item.findMany({
    where: itemWhere,
    include: { unit: true, taxRate: true },
    orderBy
  });
  const categories = await prisma.item.findMany({
    where: { organisationId: tenant.organisationId, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" }
  });
  const subcategories = await prisma.item.findMany({
    where: { organisationId: tenant.organisationId, subcategory: { not: null } },
    select: { subcategory: true },
    distinct: ["subcategory"],
    orderBy: { subcategory: "asc" }
  });

  return {
    units,
    taxRates,
    items,
    categories: categories.map((item) => item.category).filter(Boolean) as string[],
    subcategories: subcategories.map((item) => item.subcategory).filter(Boolean) as string[]
  };
}

export async function createUnit(context: TenantContext, input: UnitInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.unit.updateMany({
        where: { organisationId: tenant.organisationId },
        data: { isDefault: false }
      });
    }

    const existingCount = await tx.unit.count({ where: { organisationId: tenant.organisationId } });
    const unit = await tx.unit.create({
      data: {
        ...input,
        isDefault: input.isDefault || existingCount === 0,
        organisationId: tenant.organisationId
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "unit.create",
        entityType: "unit",
        entityId: unit.id
      }
    });

    return unit;
  });
}

export async function createTaxRate(context: TenantContext, input: TaxRateInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.taxRate.updateMany({
        where: { organisationId: tenant.organisationId },
        data: { isDefault: false }
      });
    }

    const existingCount = await tx.taxRate.count({ where: { organisationId: tenant.organisationId } });
    const taxRate = await tx.taxRate.create({
      data: {
        ...input,
        rate: new Prisma.Decimal(input.rate),
        isDefault: input.isDefault || existingCount === 0,
        organisationId: tenant.organisationId
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "tax_rate.create",
        entityType: "tax_rate",
        entityId: taxRate.id
      }
    });

    return taxRate;
  });
}

export async function createItem(context: TenantContext, input: ItemInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    if (input.unitId) {
      const unit = await tx.unit.findFirst({
        where: { id: input.unitId, organisationId: tenant.organisationId }
      });

      if (!unit) {
        throw new Error("Unit not found.");
      }
    }

    if (input.taxRateId) {
      const taxRate = await tx.taxRate.findFirst({
        where: { id: input.taxRateId, organisationId: tenant.organisationId }
      });

      if (!taxRate) {
        throw new Error("Tax rate not found.");
      }
    }

    const item = await tx.item.create({
      data: {
        ...input,
        saleRate: input.saleRate === undefined ? undefined : new Prisma.Decimal(input.saleRate),
        weightKg: input.weightKg === undefined ? undefined : new Prisma.Decimal(input.weightKg),
        imageStatus: input.imageStatus || "pending",
        organisationId: tenant.organisationId
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "item.create",
        entityType: "item",
        entityId: item.id
      }
    });

    return item;
  });
}

export async function updateItem(context: TenantContext, input: ItemUpdateInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    const current = await tx.item.findFirst({
      where: { id: input.itemId, organisationId: tenant.organisationId }
    });

    if (!current) {
      throw new Error("Item not found.");
    }

    if (input.unitId) {
      const unit = await tx.unit.findFirst({
        where: { id: input.unitId, organisationId: tenant.organisationId }
      });
      if (!unit) throw new Error("Unit not found.");
    }

    if (input.taxRateId) {
      const taxRate = await tx.taxRate.findFirst({
        where: { id: input.taxRateId, organisationId: tenant.organisationId }
      });
      if (!taxRate) throw new Error("Tax rate not found.");
    }

    const item = await tx.item.update({
      where: { id: current.id },
      data: {
        sku: input.sku,
        name: input.name,
        description: input.description,
        category: input.category,
        subcategory: input.subcategory,
        hsnSac: input.hsnSac,
        manufacturer: input.manufacturer,
        barcode: input.barcode,
        weightKg: input.weightKg === undefined ? null : new Prisma.Decimal(input.weightKg),
        unitId: input.unitId,
        taxRateId: input.taxRateId,
        saleRate: input.saleRate === undefined ? null : new Prisma.Decimal(input.saleRate),
        currency: input.currency,
        imageAssetId: input.imageAssetId,
        imageStatus: input.imageStatus || "pending",
        isActive: input.isActive
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "item.update",
        entityType: "item",
        entityId: item.id
      }
    });

    return item;
  });
}

export async function duplicateItem(context: TenantContext, input: ItemActionInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    const current = await tx.item.findFirst({
      where: { id: input.itemId, organisationId: tenant.organisationId }
    });

    if (!current) {
      throw new Error("Item not found.");
    }

    const copy = await tx.item.create({
      data: {
        organisationId: tenant.organisationId,
        sku: current.sku ? `${current.sku}-COPY-${Date.now().toString().slice(-5)}` : undefined,
        name: `${current.name} copy`,
        description: current.description,
        category: current.category,
        subcategory: current.subcategory,
        hsnSac: current.hsnSac,
        manufacturer: current.manufacturer,
        barcode: undefined,
        weightKg: current.weightKg,
        unitId: current.unitId,
        taxRateId: current.taxRateId,
        saleRate: current.saleRate,
        currency: current.currency,
        imageAssetId: current.imageAssetId,
        imageStatus: current.imageStatus,
        isActive: false
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "item.duplicate",
        entityType: "item",
        entityId: copy.id,
        metadata: { sourceItemId: current.id }
      }
    });

    return copy;
  });
}

export async function toggleItemActive(context: TenantContext, input: ItemActionInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    const current = await tx.item.findFirst({
      where: { id: input.itemId, organisationId: tenant.organisationId }
    });

    if (!current) {
      throw new Error("Item not found.");
    }

    const item = await tx.item.update({
      where: { id: current.id },
      data: { isActive: !current.isActive }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: item.isActive ? "item.activate" : "item.deactivate",
        entityType: "item",
        entityId: item.id
      }
    });

    return item;
  });
}

export async function deleteItem(context: TenantContext, input: ItemActionInput) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  return prisma.$transaction(async (tx) => {
    const current = await tx.item.findFirst({
      where: { id: input.itemId, organisationId: tenant.organisationId },
      include: { _count: { select: { invoiceItems: true } } }
    });

    if (!current) {
      throw new Error("Item not found.");
    }

    if (current._count.invoiceItems > 0) {
      await tx.item.update({
        where: { id: current.id },
        data: { isActive: false }
      });

      await tx.auditLog.create({
        data: {
          organisationId: tenant.organisationId,
          actorUserId: tenant.userId,
          action: "item.deactivate_used",
          entityType: "item",
          entityId: current.id,
          metadata: { invoiceItemCount: current._count.invoiceItems }
        }
      });

      return { deleted: false, deactivated: true };
    }

    await tx.item.delete({ where: { id: current.id } });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "item.delete",
        entityType: "item",
        entityId: current.id
      }
    });

    return { deleted: true, deactivated: false };
  });
}

export async function uploadItemImage(context: TenantContext, input: { itemId: string; file: File }) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  const prepared = await prepareFileAsset(context, input.file, "item_image");
  const stored = await writePrivateDocument(prepared.storageKey, prepared.data);

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({
      where: { id: input.itemId, organisationId: tenant.organisationId }
    });

    if (!item) {
      throw new Error("Item not found.");
    }

    const asset = await tx.fileAsset.create({
      data: {
        organisationId: prepared.organisationId,
        kind: prepared.kind,
        originalName: prepared.originalName,
        storageKey: prepared.storageKey,
        mimeType: prepared.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256
      }
    });

    const updated = await tx.item.update({
      where: { id: item.id },
      data: {
        imageAssetId: asset.id,
        imageStatus: "linked"
      }
    });

    await tx.auditLog.create({
      data: {
        organisationId: tenant.organisationId,
        actorUserId: tenant.userId,
        action: "item_image.upload",
        entityType: "item",
        entityId: item.id,
        metadata: { assetId: asset.id, originalName: asset.originalName }
      }
    });

    return updated;
  });
}

export async function readItemImage(context: TenantContext, itemId: string) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:read");

  const item = await prisma.item.findFirst({
    where: { id: itemId, organisationId: tenant.organisationId }
  });

  if (!item?.imageAssetId) {
    return null;
  }

  const asset = await prisma.fileAsset.findFirst({
    where: {
      id: item.imageAssetId,
      organisationId: tenant.organisationId,
      kind: "item_image"
    }
  });

  if (!asset) {
    return null;
  }

  return {
    data: await readPrivateDocument(asset.storageKey),
    mimeType: asset.mimeType,
    originalName: asset.originalName
  };
}

export async function uploadBulkItemImages(context: TenantContext, files: File[]) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "masters:manage");

  const items = await prisma.item.findMany({
    where: { organisationId: tenant.organisationId, sku: { not: null } },
    select: { id: true, sku: true }
  });
  const itemByCode = new Map(
    items
      .filter((item): item is { id: string; sku: string } => Boolean(item.sku))
      .map((item) => [item.sku.toLowerCase(), item])
  );

  let linked = 0;
  const unmatched: string[] = [];

  for (const file of files) {
    const code = path.parse(file.name).name.toLowerCase();
    const item = itemByCode.get(code);

    if (!item) {
      unmatched.push(file.name);
      continue;
    }

    await uploadItemImage(context, { itemId: item.id, file });
    linked += 1;
  }

  await prisma.auditLog.create({
    data: {
      organisationId: tenant.organisationId,
      actorUserId: tenant.userId,
      action: "item_image.bulk_upload",
      entityType: "item",
      metadata: { linked, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 20) }
    }
  });

  return { linked, unmatched };
}
