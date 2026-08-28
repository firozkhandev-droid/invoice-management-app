import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Eye, FilePlus2, FileText, PackagePlus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { getPackingListWorkspace, listPackingLists } from "@/lib/packing-lists/packing-list-service";

export default async function PackingListsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; source?: string }>;
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
      <div className="export-workspace">
        <ExportDocumentNav />

        <aside className="export-list-rail">
          <div className="rail-header">
            <div>
              <h2>Packing Lists</h2>
              <p className="muted">{packingLists.length} documents | {draftCount} drafts | {issuedCount} issued</p>
            </div>
          </div>
          <form className="rail-search" method="get">
            <Search size={16} />
            <input id="q" name="q" defaultValue={filters?.q || ""} placeholder="Search packing lists..." />
            <select aria-label="Status" name="status" defaultValue={filters?.status || ""}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select aria-label="Source" name="source" defaultValue={filters?.source || ""}>
              <option value="">All sources</option>
              <option value="invoice">From invoice</option>
              <option value="manual">Manual</option>
            </select>
            <button className="button tiny" type="submit">Apply</button>
          </form>
          <div className="document-list">
            {packingLists.length === 0 ? (
              <div className="empty-state compact">No packing lists found.</div>
            ) : packingLists.map((packingList) => {
              const actionState = packingListActionState(packingList);

              return (
                <Link className="document-list-item" href={`/packing-lists/${packingList.id}`} key={packingList.id}>
                  <span>
                    <strong>{packingList.buyer?.displayName || "No buyer"}</strong>
                    <small>{packingList.packingListNumber || "Draft packing list"}</small>
                    <small>{packingList.invoice?.invoiceNumber || "Manual"} | {packingList.totalGrossWeightKg.toString()} kg</small>
                  </span>
                  <span className={`badge ${actionState.tone}`}>{actionState.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>

        <main className="document-editor">
          <div className="document-toolbar">
            <div className="document-crumb">
              <strong>Documents</strong>
              <span>|</span>
              <span>Packing Lists</span>
            </div>
            <div className="toolbar">
              <button className="button tiny" form="new-packing-list-form" type="submit">
                <FilePlus2 size={16} />
                Create Draft
              </button>
            </div>
          </div>

          <section className="document-canvas">
            <div className="document-title-row">
              <h1>PACKING LIST</h1>
              <span>New draft</span>
            </div>
            <form id="new-packing-list-form" className="document-grid" action="/api/packing-lists" method="post">
              <div className="doc-field span-2 tall">
                <label htmlFor="invoiceId">Source Invoice</label>
                <select id="invoiceId" name="invoiceId" defaultValue="">
                  <option value="">Manual packing list</option>
                  {workspace.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber || invoice.id} - {invoice.buyer?.displayName || "Buyer"}
                    </option>
                  ))}
                </select>
                <p>Choose an issued invoice to copy exporter, buyer, export fields, and invoice line rows.</p>
              </div>
              <div className="doc-field">
                <label htmlFor="packingListDate">Packing List Date</label>
                <input id="packingListDate" name="packingListDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="doc-field">
                <label htmlFor="exportReference">Exporter Reference</label>
                <input id="exportReference" name="exportReference" />
              </div>
              <div className="doc-field">
                <label htmlFor="companyId">Exporter</label>
                <select id="companyId" name="companyId" defaultValue="">
                  <option value="">From invoice / none</option>
                  {workspace.companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
                </select>
              </div>
              <div className="doc-field">
                <label htmlFor="buyerId">Buyer</label>
                <select id="buyerId" name="buyerId" defaultValue="">
                  <option value="">From invoice / none</option>
                  {workspace.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.displayName}</option>)}
                </select>
              </div>
              <div className="doc-field"><label htmlFor="shipmentMode">Shipment Mode</label><input id="shipmentMode" name="shipmentMode" placeholder="By road / Sea / Air" /></div>
              <div className="doc-field"><label htmlFor="containerNumber">Container No</label><input id="containerNumber" name="containerNumber" /></div>
              <div className="doc-field"><label htmlFor="sealNumber">Seal No</label><input id="sealNumber" name="sealNumber" /></div>
              <div className="doc-field"><label htmlFor="portOfLoading">Port of Loading</label><input id="portOfLoading" name="portOfLoading" /></div>
              <div className="doc-field"><label htmlFor="portOfDischarge">Port of Discharge</label><input id="portOfDischarge" name="portOfDischarge" /></div>
              <div className="doc-field"><label htmlFor="finalDestination">Country / Final Destination</label><input id="finalDestination" name="finalDestination" /></div>
              <div className="doc-field span-3"><label htmlFor="notes">Notes / Declaration</label><textarea id="notes" name="notes" /></div>
            </form>

            {packingLists.length > 0 ? (
              <section className="document-lines top-space">
                <div className="document-section-heading">
                  <h2>Recent Packing Lists</h2>
                  <span className="badge neutral">{packingLists.length} total</span>
                </div>
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
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packingLists.map((packingList) => (
                        <tr key={packingList.id}>
                          <td>{packingList.packingListDate.toISOString().slice(0, 10)}</td>
                          <td>{packingList.packingListNumber || "Draft"}</td>
                          <td>{packingList.invoice?.invoiceNumber || "Manual"}</td>
                          <td>{packingList.buyer?.displayName || "-"}</td>
                          <td><span className={`status-badge ${packingList.status}`}>{packingList.status}</span></td>
                          <td>{packingList.totalPackages}</td>
                          <td>
                            <div className="row-actions compact">
                              <Link className="icon-button" href={`/packing-lists/${packingList.id}`} title="View packing list"><Eye size={16} /></Link>
                              {packingList.status === "issued" ? (
                                <a className="icon-button" href={`/api/packing-lists/${packingList.id}/pdf`} target="_blank" rel="noreferrer" title="Open packing list PDF">
                                  <Download size={16} />
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </section>
        </main>
      </div>
    </AppShell>
  );
}

function packingListActionState(packingList: {
  status: string;
  companyId: string | null;
  buyerId: string | null;
  shipmentMode: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  finalDestination: string | null;
  lines: unknown[];
}) {
  if (packingList.status === "issued") return { label: "PDF ready", tone: "success" };
  if (packingList.status === "cancelled") return { label: "Closed", tone: "neutral" };
  if (!packingList.companyId || !packingList.buyerId) return { label: "Needs company/buyer", tone: "neutral" };
  if (packingList.lines.length === 0) return { label: "Needs package line", tone: "neutral" };
  if (!packingList.shipmentMode || !packingList.portOfLoading || !packingList.portOfDischarge || !packingList.finalDestination) {
    return { label: "Needs shipment details", tone: "warning" };
  }
  return { label: "Ready to issue", tone: "success" };
}

function ExportDocumentNav() {
  return (
    <aside className="export-doc-nav">
      <div className="rail-header">
        <h2>Export Documents</h2>
      </div>
      <nav>
        <Link href="/invoices"><FileText size={16} /><span>Commercial Invoices<small>Final export invoices</small></span></Link>
        <Link className="active" href="/packing-lists"><PackagePlus size={16} /><span>Packing Lists<small>Export package contents</small></span></Link>
      </nav>
    </aside>
  );
}
