import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => (value ? value : undefined));

const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined);
const optionalNumber = z.coerce.number().min(0).optional().or(z.literal("")).transform((value) => value === "" ? undefined : value);

export const packingListDraftSchema = z.object({
  invoiceId: optionalUuid,
  companyId: optionalUuid,
  buyerId: optionalUuid,
  consigneeBuyerId: optionalUuid,
  packingListDate: z.coerce.date(),
  exportReference: optionalText(120),
  containerNumber: optionalText(120),
  sealNumber: optionalText(120),
  shipmentMode: optionalText(80),
  portOfLoading: optionalText(120),
  portOfDischarge: optionalText(120),
  finalDestination: optionalText(120),
  notes: optionalText(5000),
  version: z.coerce.number().int().min(1).optional()
});

export const packingListLineSchema = z.object({
  packingListId: z.string().uuid(),
  itemId: optionalUuid,
  invoiceItemId: optionalUuid,
  sortOrder: z.coerce.number().int().min(1).default(1),
  packageNo: optionalText(80),
  marksAndNumbers: optionalText(160),
  sku: optionalText(80),
  description: z.string().trim().min(1).max(5000),
  hsnSac: optionalText(20),
  quantity: z.coerce.number().min(0),
  unitCode: optionalText(20),
  netWeightKg: z.coerce.number().min(0).default(0),
  grossWeightKg: z.coerce.number().min(0).default(0),
  lengthCm: optionalNumber,
  widthCm: optionalNumber,
  heightCm: optionalNumber,
  expectedVersion: z.coerce.number().int().min(1)
});

export const packingListLineDeleteSchema = z.object({
  packingListId: z.string().uuid(),
  lineId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1)
});

export const packingListIssueSchema = z.object({
  packingListId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1)
});

export type PackingListDraftInput = z.infer<typeof packingListDraftSchema>;
export type PackingListLineInput = z.infer<typeof packingListLineSchema>;
export type PackingListLineDeleteInput = z.infer<typeof packingListLineDeleteSchema>;
export type PackingListIssueInput = z.infer<typeof packingListIssueSchema>;
