import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertPermission } from "@/lib/permissions/roles";
import { requireTenantContext, type TenantContext } from "@/lib/repositories/tenant-context";

export async function getDashboardSummary(context: TenantContext) {
  const tenant = requireTenantContext(context);
  assertPermission(tenant.role, "reports:read");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const issuedThisMonth = await prisma.invoice.aggregate({
    where: {
      organisationId: tenant.organisationId,
      status: { in: ["issued", "partially_paid", "paid"] },
      invoiceDate: { gte: monthStart, lt: nextMonth },
      currency: "INR"
    },
    _count: true,
    _sum: { grandTotal: true }
  });
  const receivedThisMonth = await prisma.payment.aggregate({
    where: {
      organisationId: tenant.organisationId,
      status: "posted",
      currency: "INR",
      paymentDate: { gte: monthStart, lt: nextMonth }
    },
    _sum: { amount: true }
  });
  const outstandingInvoices = await prisma.invoice.aggregate({
    where: {
      organisationId: tenant.organisationId,
      status: { in: ["issued", "partially_paid"] },
      currency: "INR"
    },
    _sum: { balanceDue: true }
  });
  const overdueInvoices = await prisma.invoice.count({
    where: {
      organisationId: tenant.organisationId,
      status: { in: ["issued", "partially_paid"] },
      dueDate: { lt: now },
      balanceDue: { gt: new Prisma.Decimal(0) }
    }
  });
  const draftInvoices = await prisma.invoice.count({
    where: {
      organisationId: tenant.organisationId,
      status: "draft"
    }
  });
  const [companyCount, buyerCount, itemCount] = await Promise.all([
    prisma.company.count({ where: { organisationId: tenant.organisationId, isActive: true } }),
    prisma.buyer.count({ where: { organisationId: tenant.organisationId, isActive: true } }),
    prisma.item.count({ where: { organisationId: tenant.organisationId, isActive: true } })
  ]);
  const recentInvoices = await prisma.invoice.findMany({
    where: { organisationId: tenant.organisationId },
    include: { buyer: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 5
  });
  const recentPayments = await prisma.payment.findMany({
    where: { organisationId: tenant.organisationId },
    include: { allocations: { include: { invoice: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 5
  });

  return {
    invoicesIssuedThisMonth: issuedThisMonth._count,
    invoiceValueThisMonth: issuedThisMonth._sum.grandTotal ?? new Prisma.Decimal(0),
    receivedThisMonth: receivedThisMonth._sum.amount ?? new Prisma.Decimal(0),
    outstandingBalance: outstandingInvoices._sum.balanceDue ?? new Prisma.Decimal(0),
    overdueInvoices,
    draftInvoices,
    companyCount,
    buyerCount,
    itemCount,
    recentInvoices,
    recentPayments
  };
}
