import { Prisma } from "@prisma/client";

export type PackingCalculationLine = {
  quantity: number | Prisma.Decimal;
  netWeightKg: number | Prisma.Decimal;
  grossWeightKg: number | Prisma.Decimal;
  lengthCm?: number | Prisma.Decimal | null;
  widthCm?: number | Prisma.Decimal | null;
  heightCm?: number | Prisma.Decimal | null;
  packageNo?: string | null;
};

type PackingTotals = {
  packageCount: number;
  quantity: Prisma.Decimal;
  netWeightKg: Prisma.Decimal;
  grossWeightKg: Prisma.Decimal;
  volumeCbm: Prisma.Decimal;
};

const decimal = (value: number | Prisma.Decimal | null | undefined) =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value || 0);

export function lineVolumeCbm(line: PackingCalculationLine): Prisma.Decimal {
  const length = decimal(line.lengthCm);
  const width = decimal(line.widthCm);
  const height = decimal(line.heightCm);

  if (length.lte(0) || width.lte(0) || height.lte(0)) {
    return new Prisma.Decimal(0);
  }

  return length.mul(width).mul(height).div(1_000_000);
}

export function calculatePackingTotals(lines: PackingCalculationLine[]) {
  const packages = new Set<string>();

  const totals = lines.reduce<PackingTotals>(
    (totals, line) => {
      if (line.packageNo) packages.add(line.packageNo);

      return {
        packageCount: packages.size,
        quantity: totals.quantity.add(decimal(line.quantity)),
        netWeightKg: totals.netWeightKg.add(decimal(line.netWeightKg)),
        grossWeightKg: totals.grossWeightKg.add(decimal(line.grossWeightKg)),
        volumeCbm: totals.volumeCbm.add(lineVolumeCbm(line))
      };
    },
    {
      packageCount: 0,
      quantity: new Prisma.Decimal(0),
      netWeightKg: new Prisma.Decimal(0),
      grossWeightKg: new Prisma.Decimal(0),
      volumeCbm: new Prisma.Decimal(0)
    }
  );

  return {
    ...totals,
    packageCount: packages.size || lines.length
  };
}
