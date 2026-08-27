import { describe, expect, it } from "vitest";
import { calculatePackingTotals, lineVolumeCbm } from "@/lib/packing-lists/calculation";
import { InMemoryTenantRepository, type TenantRecord } from "@/lib/repositories/tenant-repository";
import type { TenantContext } from "@/lib/repositories/tenant-context";

type PackingLike = TenantRecord & {
  packingListNumber: string;
};

const ownerA: TenantContext = {
  userId: "user-a",
  organisationId: "org-a",
  role: "owner"
};

const ownerB: TenantContext = {
  userId: "user-b",
  organisationId: "org-b",
  role: "owner"
};

describe("packing list calculations", () => {
  it("calculates volume in CBM from centimetres", () => {
    expect(lineVolumeCbm({ quantity: 1, netWeightKg: 1, grossWeightKg: 1, lengthCm: 100, widthCm: 50, heightCm: 40 }).toString()).toBe("0.2");
  });

  it("totals unique packages and weights", () => {
    const totals = calculatePackingTotals([
      { packageNo: "1", quantity: 2, netWeightKg: 3, grossWeightKg: 4, lengthCm: 10, widthCm: 10, heightCm: 10 },
      { packageNo: "1", quantity: 1, netWeightKg: 2, grossWeightKg: 3, lengthCm: 20, widthCm: 10, heightCm: 10 },
      { packageNo: "2", quantity: 5, netWeightKg: 6, grossWeightKg: 7 }
    ]);

    expect(totals.packageCount).toBe(2);
    expect(totals.quantity.toString()).toBe("8");
    expect(totals.netWeightKg.toString()).toBe("11");
    expect(totals.grossWeightKg.toString()).toBe("14");
    expect(totals.volumeCbm.toString()).toBe("0.003");
  });
});

describe("packing list tenant isolation", () => {
  it("blocks lookup of another organisation packing list", () => {
    const repo = new InMemoryTenantRepository<PackingLike>([
      { id: "packing-a", organisationId: "org-a", packingListNumber: "PL/2026/0001" },
      { id: "packing-b", organisationId: "org-b", packingListNumber: "PL/2026/0002" }
    ]);

    expect(repo.findById(ownerA, "packing-b", "documents:download")).toBeNull();
    expect(repo.findById(ownerB, "packing-b", "documents:download")?.packingListNumber).toBe("PL/2026/0002");
  });
});
