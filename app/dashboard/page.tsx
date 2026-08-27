import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Building2, CircleDollarSign, FileClock, FileText, Package, ReceiptIndianRupee, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardSummary } from "@/lib/dashboard/dashboard-service";
import { permissionsForRole } from "@/lib/permissions/roles";
import { AppShell } from "@/components/app-shell";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const membership = user.memberships[0];

  if (!membership) {
    redirect("/register");
  }
  const summary = await getDashboardSummary({
    userId: user.id,
    organisationId: membership.organisationId,
    role: membership.role
  });
  const money = (value: { toString(): string }) => Number(value.toString()).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });

  return (
    <AppShell>
        <header className="page-header">
          <div>
            <p className="muted">Organisation</p>
            <h1>{membership.organisation.name}</h1>
            <div className="meta-row">
              <span>{user.email}</span>
              <span className="badge">{membership.role}</span>
            </div>
          </div>
          <div className="toolbar">
            <Link className="button" href="/invoices/new">New invoice</Link>
            <Link className="button subtle" href="/payments">Record payment</Link>
          </div>
        </header>

        <div className="summary-grid">
          <div className="stat">
            <div className="kpi-row">
              <span className="muted">Issued this month</span>
              <span className="kpi-icon"><FileText size={18} /></span>
            </div>
            <strong>{summary.invoicesIssuedThisMonth}</strong>
          </div>
          <div className="stat accent">
            <div className="kpi-row">
              <span className="muted">Invoice value</span>
              <span className="kpi-icon"><ReceiptIndianRupee size={18} /></span>
            </div>
            <strong>INR {money(summary.invoiceValueThisMonth)}</strong>
          </div>
          <div className="stat">
            <div className="kpi-row">
              <span className="muted">Received</span>
              <span className="kpi-icon"><CircleDollarSign size={18} /></span>
            </div>
            <strong>INR {money(summary.receivedThisMonth)}</strong>
          </div>
          <div className="stat warning">
            <div className="kpi-row">
              <span className="muted">Outstanding</span>
              <span className="kpi-icon"><FileClock size={18} /></span>
            </div>
            <strong>INR {money(summary.outstandingBalance)}</strong>
          </div>
          <div className="stat danger">
            <div className="kpi-row">
              <span className="muted">Overdue</span>
              <span className="kpi-icon"><AlertTriangle size={18} /></span>
            </div>
            <strong>{summary.overdueInvoices}</strong>
          </div>
          <div className="stat accent">
            <div className="kpi-row">
              <span className="muted">Drafts</span>
              <span className="kpi-icon"><FileClock size={18} /></span>
            </div>
            <strong>{summary.draftInvoices}</strong>
          </div>
        </div>

        <div className="grid two-column">
          <div className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Activity</p>
                <h2>Recent invoices</h2>
              </div>
              <Link href="/invoices">View all</Link>
            </div>
            {summary.recentInvoices.length === 0 ? <div className="empty-state">No invoices yet.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Invoice</th><th>Buyer</th><th>Status</th><th>Balance</th></tr>
                  </thead>
                  <tbody>
                    {summary.recentInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td><Link href={`/invoices/${invoice.id}`}>{invoice.invoiceNumber || "Draft"}</Link></td>
                        <td>{invoice.buyer?.displayName || "-"}</td>
                        <td><span className={`status-badge ${invoice.status}`}>{invoice.status.replace("_", " ")}</span></td>
                        <td>{invoice.currency} {money(invoice.balanceDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Receipts</p>
                <h2>Recent payments</h2>
              </div>
              <Link href="/payments">View all</Link>
            </div>
            {summary.recentPayments.length === 0 ? <div className="empty-state">No payments yet.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Invoice</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {summary.recentPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.paymentDate.toISOString().slice(0, 10)}</td>
                        <td>{payment.allocations[0]?.invoice.invoiceNumber || "-"}</td>
                        <td>{payment.currency} {money(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="grid stats top-space">
          <div className="panel">
            <div className="kpi-row">
              <div>
                <p className="muted">Setup</p>
                <h2>Master data</h2>
              </div>
              <span className="kpi-icon"><Building2 size={18} /></span>
            </div>
            <ul className="insight-list top-space">
              <li><span>Companies</span><strong>{summary.companyCount}</strong></li>
              <li><span>Buyers</span><strong>{summary.buyerCount}</strong></li>
              <li><span>Items</span><strong>{summary.itemCount}</strong></li>
            </ul>
          </div>
          <div className="panel">
            <div className="kpi-row">
              <div>
                <p className="muted">Shortcuts</p>
                <h2>Next actions</h2>
              </div>
              <span className="kpi-icon"><Package size={18} /></span>
            </div>
            <ul className="insight-list top-space">
              <li><Link href="/companies">Company branding</Link><span className="muted">Logo, bank, signature</span></li>
              <li><Link href="/buyers">Buyer records</Link><span className="muted">Billing and consignee</span></li>
              <li><Link href="/reports">Reports</Link><span className="muted">CSV exports</span></li>
            </ul>
          </div>
          <div className="panel">
            <div className="kpi-row">
              <div>
                <p className="muted">Access</p>
                <h2>Role</h2>
              </div>
              <span className="kpi-icon"><Users size={18} /></span>
            </div>
            <p className="muted top-space">Signed in as {user.email} with {membership.role} permissions.</p>
          </div>
        </div>
        <div className="panel top-space">
          <div className="section-title">
            <div>
              <p className="muted">Access</p>
              <h2>Enabled permissions</h2>
            </div>
          </div>
          <p className="muted">{permissionsForRole(membership.role).join(", ")}</p>
        </div>
    </AppShell>
  );
}
