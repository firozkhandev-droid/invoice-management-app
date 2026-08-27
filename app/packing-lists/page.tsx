import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, FilePlus2, PackageCheck, Search, Truck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { getPackingListWorkspace, listPackingLists } from "@/lib/packing-lists/packing-list-service";

export default async function PackingListsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getTenantContextForUser(user.id);
  if (!context) redirect("/register");

  const filters = await searchParams;
  const [packingLists, workspace] = await Promise.all([
    listPackingLists(context, filters),
    getPackingListWorkspace(context)
  ]);
  const draftCount = packingLists.filter((item) => item.status === "draft").length;
  const issuedCount = packingLists.filter((item) => item.status === "issued").length;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="muted">Export documents</p>
          <h1>Packing lists</h1>
          <div className="meta-row">
            <span>Create shipment package details from issued invoices or manual product rows</span>
          </div>
        </div>
      </header>

      <div className="summary-grid">
        <div className="stat">
          <div className="kpi-row"><span className="muted">Packing lists</span><span className="kpi-icon"><PackageCheck size={18} /></span></div>
          <strong>{packingLists.length}</strong>
        </div>
        <div className="stat accent">
          <div className="kpi-row"><span className="muted">Issued</span><span className="kpi-icon"><ClipboardList size={18} /></span></div>
          <strong>{issuedCount}</strong>
        </div>
        <div className="stat warning">
          <div className="kpi-row"><span className="muted">Drafts</span><span className="kpi-icon"><Truck size={18} /></span></div>
          <strong>{draftCount}</strong>
        </div>
      </div>

      <div className="grid two-column wide-left">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Search and filter</p>
              <h2>Shipment register</h2>
            </div>
            <Search size={20} />
          </div>
          <form className="form" method="get">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="q">Search</label>
                <input id="q" name="q" defaultValue={filters?.q || ""} placeholder="Packing list, invoice, buyer" />
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={filters?.status || ""}>
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <button className="button" type="submit">Apply filters</button>
          </form>

          <div className="top-space">
            {packingLists.length === 0 ? (
              <div className="empty-state">No packing lists yet. Create one from an issued invoice or start a manual draft.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Number</th>
                      <th>Invoice</th>
                      <th>Buyer</th>
                      <th>Status</th>
                      <th>Packages</th>
                      <th>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packingLists.map((packingList) => (
                      <tr key={packingList.id}>
                        <td><Link href={`/packing-lists/${packingList.id}`}>{packingList.packingListDate.toISOString().slice(0, 10)}</Link></td>
                        <td>{packingList.packingListNumber || "-"}</td>
                        <td>{packingList.invoice?.invoiceNumber || "-"}</td>
                        <td>{packingList.buyer?.displayName || "-"}</td>
                        <td><span className={`status-badge ${packingList.status}`}>{packingList.status}</span></td>
                        <td>{packingList.totalPackages}</td>
                        <td>{packingList.totalGrossWeightKg.toString()} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <aside className="grid">
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">New document</p>
                <h2>Create packing list</h2>
              </div>
              <FilePlus2 size={20} />
            </div>
            <form className="form" action="/api/packing-lists" method="post">
              <div className="field">
                <label htmlFor="invoiceId">Source invoice</label>
                <select id="invoiceId" name="invoiceId" defaultValue="">
                  <option value="">Manual packing list</option>
                  {workspace.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber || invoice.id} - {invoice.buyer?.displayName || "Buyer"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="packingListDate">Packing list date</label>
                <input id="packingListDate" name="packingListDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="companyId">Company</label>
                  <select id="companyId" name="companyId" defaultValue="">
                    <option value="">From invoice / none</option>
                    {workspace.companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="buyerId">Buyer</label>
                  <select id="buyerId" name="buyerId" defaultValue="">
                    <option value="">From invoice / none</option>
                    {workspace.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="exportReference">Export reference</label>
                <input id="exportReference" name="exportReference" />
              </div>
              <button className="button" type="submit">Create draft</button>
            </form>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
