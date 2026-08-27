import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, Download, PackagePlus, Save, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { getPackingList, getPackingListWorkspace, packingListIssueRequirements } from "@/lib/packing-lists/packing-list-service";

export default async function PackingListDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const context = await getTenantContextForUser(user.id);
  if (!context) redirect("/register");

  const { id } = await params;
  const [packingList, workspace] = await Promise.all([
    getPackingList(context, id),
    getPackingListWorkspace(context)
  ]);

  if (!packingList) notFound();

  const canEdit = packingList.status === "draft";
  const issueRequirements = packingListIssueRequirements(packingList);
  const canIssue = canEdit && issueRequirements.length === 0;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="muted">Packing list</p>
          <h1>{packingList.packingListNumber || "Unnumbered draft"}</h1>
          <div className="meta-row">
            <span className={`status-badge ${packingList.status}`}>{packingList.status}</span>
            <span>Version {packingList.version}</span>
            <span>{packingList.packingListDate.toISOString().slice(0, 10)}</span>
          </div>
        </div>
        <div className="toolbar">
          {packingList.status === "issued" ? (
            <a className="button" href={`/api/packing-lists/${packingList.id}/pdf`} target="_blank">
              <Download size={18} />
              Download PDF
            </a>
          ) : null}
          <Link className="button subtle" href="/packing-lists">Back to list</Link>
        </div>
      </header>

      <div className="summary-grid">
        <div className="stat">
          <span className="muted">Packages</span>
          <strong>{packingList.totalPackages}</strong>
        </div>
        <div className="stat accent">
          <span className="muted">Net weight</span>
          <strong>{packingList.totalNetWeightKg.toString()} kg</strong>
        </div>
        <div className="stat warning">
          <span className="muted">Gross weight</span>
          <strong>{packingList.totalGrossWeightKg.toString()} kg</strong>
        </div>
      </div>

      <div className="grid two-column wide-left">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Shipment snapshot</p>
              <h2>Document overview</h2>
            </div>
            <ClipboardCheck size={20} />
          </div>
          <table className="table compact">
            <tbody>
              <tr><th>Invoice</th><td>{packingList.invoice ? <Link href={`/invoices/${packingList.invoice.id}`}>{packingList.invoice.invoiceNumber || packingList.invoice.id}</Link> : "-"}</td></tr>
              <tr><th>Company</th><td>{packingList.company?.legalName || "-"}</td></tr>
              <tr><th>Buyer</th><td>{packingList.buyer?.displayName || "-"}</td></tr>
              <tr><th>Consignee</th><td>{packingList.consigneeBuyer?.displayName || "-"}</td></tr>
              <tr><th>Container / seal</th><td>{packingList.containerNumber || "-"} / {packingList.sealNumber || "-"}</td></tr>
              <tr><th>Ports</th><td>{packingList.portOfLoading || "-"} to {packingList.portOfDischarge || "-"}</td></tr>
              <tr><th>Final destination</th><td>{packingList.finalDestination || "-"}</td></tr>
              <tr><th>CBM</th><td>{packingList.totalVolumeCbm.toString()}</td></tr>
            </tbody>
          </table>

          <div className="section-title top-space">
            <div>
              <p className="muted">Package rows</p>
              <h2>{packingList.lines.length} lines</h2>
            </div>
          </div>
          {packingList.lines.length === 0 ? (
            <div className="empty-state">No packing rows yet. Add package details before issuing.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Package</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Net</th>
                    <th>Gross</th>
                    <th>CBM</th>
                    {canEdit ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {packingList.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.sortOrder}</td>
                      <td>
                        <strong>{line.packageNo || "-"}</strong>
                        <p className="muted">{line.marksAndNumbers || line.sku || "-"}</p>
                      </td>
                      <td>
                        {line.description}
                        <p className="muted">HSN/SAC: {line.hsnSac || "-"} | {line.lengthCm?.toString() || "-"} x {line.widthCm?.toString() || "-"} x {line.heightCm?.toString() || "-"} cm</p>
                      </td>
                      <td>{line.quantity.toString()} {line.unitCode || ""}</td>
                      <td>{line.netWeightKg.toString()} kg</td>
                      <td>{line.grossWeightKg.toString()} kg</td>
                      <td>{line.volumeCbm.toString()}</td>
                      {canEdit ? (
                        <td>
                          <form action="/api/packing-lists/lines/delete" method="post">
                            <input type="hidden" name="packingListId" value={packingList.id} />
                            <input type="hidden" name="lineId" value={line.id} />
                            <input type="hidden" name="expectedVersion" value={packingList.version} />
                            <button className="icon-button danger" title="Delete packing line" type="submit"><Trash2 size={16} /></button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="grid">
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Finalise</p>
                <h2>Issue packing list</h2>
              </div>
              <Send size={20} />
            </div>
            {canEdit && issueRequirements.length > 0 ? (
              <p className="notice error">Before issuing: {issueRequirements.join(", ")}.</p>
            ) : null}
            <form action="/api/packing-lists/issue" method="post">
              <input type="hidden" name="packingListId" value={packingList.id} />
              <input type="hidden" name="expectedVersion" value={packingList.version} />
              <button className="button" type="submit" disabled={!canIssue}>
                <Send size={18} />
                Issue packing list
              </button>
            </form>
          </section>

          {canEdit ? (
            <>
              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="muted">Draft details</p>
                    <h2>Update shipment</h2>
                  </div>
                  <Save size={20} />
                </div>
                <form className="form" action="/api/packing-lists" method="post">
                  <input type="hidden" name="packingListId" value={packingList.id} />
                  <input type="hidden" name="version" value={packingList.version} />
                  <PackingListFields packingList={packingList} workspace={workspace} />
                  <button className="button" type="submit">Save draft</button>
                </form>
              </section>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="muted">Package row</p>
                    <h2>Add line</h2>
                  </div>
                  <PackagePlus size={20} />
                </div>
                <form className="form" action="/api/packing-lists/lines" method="post">
                  <input type="hidden" name="packingListId" value={packingList.id} />
                  <input type="hidden" name="expectedVersion" value={packingList.version} />
                  <input type="hidden" name="sortOrder" value={packingList.lines.length + 1} />
                  <div className="field">
                    <label htmlFor="invoiceItemId">Source invoice line</label>
                    <select id="invoiceItemId" name="invoiceItemId" defaultValue="">
                      <option value="">Manual row</option>
                      {packingList.invoice?.items.map((item) => (
                        <option key={item.id} value={item.id}>{item.sortOrder} - {item.description.slice(0, 80)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="itemId">Catalog item</label>
                    <select id="itemId" name="itemId" defaultValue="">
                      <option value="">None</option>
                      {workspace.items.map((item) => <option key={item.id} value={item.id}>{item.sku || item.name} - {item.name}</option>)}
                    </select>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="packageNo">Package no</label><input id="packageNo" name="packageNo" /></div>
                    <div className="field"><label htmlFor="marksAndNumbers">Marks</label><input id="marksAndNumbers" name="marksAndNumbers" /></div>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="sku">SKU</label><input id="sku" name="sku" /></div>
                    <div className="field"><label htmlFor="hsnSac">HSN/SAC</label><input id="hsnSac" name="hsnSac" /></div>
                  </div>
                  <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" required /></div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" type="number" step="0.0001" min="0" required /></div>
                    <div className="field"><label htmlFor="unitCode">Unit</label><input id="unitCode" name="unitCode" /></div>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="netWeightKg">Net KG</label><input id="netWeightKg" name="netWeightKg" type="number" step="0.0001" min="0" defaultValue="0" /></div>
                    <div className="field"><label htmlFor="grossWeightKg">Gross KG</label><input id="grossWeightKg" name="grossWeightKg" type="number" step="0.0001" min="0" defaultValue="0" /></div>
                  </div>
                  <div className="form-grid three">
                    <div className="field"><label htmlFor="lengthCm">L cm</label><input id="lengthCm" name="lengthCm" type="number" step="0.0001" min="0" /></div>
                    <div className="field"><label htmlFor="widthCm">W cm</label><input id="widthCm" name="widthCm" type="number" step="0.0001" min="0" /></div>
                    <div className="field"><label htmlFor="heightCm">H cm</label><input id="heightCm" name="heightCm" type="number" step="0.0001" min="0" /></div>
                  </div>
                  <button className="button" type="submit">Add line</button>
                </form>
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

function PackingListFields({
  packingList,
  workspace
}: {
  packingList: NonNullable<Awaited<ReturnType<typeof getPackingList>>>;
  workspace: Awaited<ReturnType<typeof getPackingListWorkspace>>;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="packingListDate">Date</label>
        <input id="packingListDate" name="packingListDate" type="date" defaultValue={packingList.packingListDate.toISOString().slice(0, 10)} required />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="companyId">Company</label>
          <select id="companyId" name="companyId" defaultValue={packingList.companyId || ""}>
            <option value="">None</option>
            {workspace.companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="buyerId">Buyer</label>
          <select id="buyerId" name="buyerId" defaultValue={packingList.buyerId || ""}>
            <option value="">None</option>
            {workspace.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.displayName}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="consigneeBuyerId">Consignee</label>
        <select id="consigneeBuyerId" name="consigneeBuyerId" defaultValue={packingList.consigneeBuyerId || ""}>
          <option value="">Same as buyer / none</option>
          {workspace.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.displayName}</option>)}
        </select>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="exportReference">Export reference</label><input id="exportReference" name="exportReference" defaultValue={packingList.exportReference || ""} /></div>
        <div className="field"><label htmlFor="shipmentMode">Shipment mode</label><input id="shipmentMode" name="shipmentMode" defaultValue={packingList.shipmentMode || ""} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="containerNumber">Container no</label><input id="containerNumber" name="containerNumber" defaultValue={packingList.containerNumber || ""} /></div>
        <div className="field"><label htmlFor="sealNumber">Seal no</label><input id="sealNumber" name="sealNumber" defaultValue={packingList.sealNumber || ""} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="portOfLoading">Port of loading</label><input id="portOfLoading" name="portOfLoading" defaultValue={packingList.portOfLoading || ""} /></div>
        <div className="field"><label htmlFor="portOfDischarge">Port of discharge</label><input id="portOfDischarge" name="portOfDischarge" defaultValue={packingList.portOfDischarge || ""} /></div>
      </div>
      <div className="field"><label htmlFor="finalDestination">Final destination</label><input id="finalDestination" name="finalDestination" defaultValue={packingList.finalDestination || ""} /></div>
      <div className="field"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" defaultValue={packingList.notes || ""} /></div>
    </>
  );
}
