import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, FileBarChart, ReceiptIndianRupee, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getTenantContextForUser(user.id);
  if (!context) redirect("/register");

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="muted">Reports</p>
          <h1>Invoice register</h1>
          <div className="meta-row">
            <span>Exports and operational snapshots for your accounting workflow</span>
          </div>
        </div>
      </header>
      <div className="grid stats">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Export</p>
              <h2>Invoice register</h2>
            </div>
            <FileBarChart size={20} />
          </div>
          <p className="muted">Download invoice numbers, buyers, status, totals, receipts, and balances with stable CSV headers for Excel.</p>
          <a className="button" href="/api/reports/invoice-register">
            <Download size={18} />
            Download CSV
          </a>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Receivables</p>
              <h2>Outstanding review</h2>
            </div>
            <ReceiptIndianRupee size={20} />
          </div>
          <p className="muted">Use the invoice register filters to review issued, partially paid, paid, and cancelled invoices before collection follow-up.</p>
          <Link className="button subtle" href="/invoices?status=issued">Review invoices</Link>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Controls</p>
              <h2>Numbering and locks</h2>
            </div>
            <Settings size={20} />
          </div>
          <p className="muted">Manage invoice series, credit note series, default company, default bank account, and locked accounting periods.</p>
          <Link className="button subtle" href="/settings">Open settings</Link>
        </section>
      </div>
    </AppShell>
  );
}
