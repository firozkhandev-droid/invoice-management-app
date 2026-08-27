import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, CreditCard, FileClock, FileText, PackageCheck, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvoice, getInvoiceEditorData } from "@/lib/invoices/invoice-service";
import { draftIssueRequirements } from "@/lib/invoices/lifecycle";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { renderInvoiceNumber, resetKeyForRule } from "@/lib/settings/number-series";

export default async function InvoiceEditorPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const context = await getTenantContextForUser(user.id);
  if (!context) redirect("/register");
  const { id } = await params;
  const invoice = await getInvoice(context, id);
  const editorData = await getInvoiceEditorData(context);
  if (!invoice) redirect("/invoices");
  const query = await searchParams;
  const errorMessage = query?.error;
  const isDraft = invoice.status === "draft";
  const canOpenPdf = ["issued", "partially_paid", "paid"].includes(invoice.status);
  const canRecordPayment = ["issued", "partially_paid"].includes(invoice.status) && invoice.balanceDue.gt(0);
  const canCreateCreditNote = ["issued", "partially_paid", "paid"].includes(invoice.status);
  const canCreatePackingList = canCreateCreditNote;
  const issuedPackingLists = invoice.packingLists.filter((packingList) => packingList.status === "issued");
  const draftPackingLists = invoice.packingLists.filter((packingList) => packingList.status === "draft");
  const issuedCreditNotes = invoice.creditNotes.filter((creditNote) => creditNote.status === "issued");
  const canIssue = Boolean(invoice.companyId && invoice.buyerId && invoice.items.length > 0 && invoice.grandTotal.gt(0) && editorData.series.length > 0);
  const statusLabel = invoice.status.replace("_", " ");
  const issueRequirements = [
    ...draftIssueRequirements({
      status: invoice.status,
      companyId: invoice.companyId,
      buyerId: invoice.buyerId,
      itemCount: invoice.items.length,
      grandTotal: invoice.grandTotal
    }),
    editorData.series.length === 0 ? "create an invoice number series" : null
  ].filter((requirement): requirement is string => Boolean(requirement));

  return (
    <AppShell>
      {errorMessage ? <p className="notice error">{errorMessage}</p> : null}

      <header className="page-header">
        <div>
          <p className="muted">Invoice workspace</p>
          <h1>{invoice.invoiceNumber || "Unnumbered draft"}</h1>
          <div className="meta-row">
            <span className={`status-badge ${invoice.status}`}>{statusLabel}</span>
            <span>Version {invoice.version}</span>
            <span>{invoice.invoiceDate.toISOString().slice(0, 10)}</span>
          </div>
        </div>
        <div className="toolbar">
          <Link className="button subtle" href="/invoices">Invoices</Link>
          {canOpenPdf ? (
            <a className="button" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
              <FileText size={18} />
              Open PDF
            </a>
          ) : null}
          {canRecordPayment ? (
            <Link className="button subtle" href="/payments">
              <CreditCard size={18} />
              Record payment
            </Link>
          ) : null}
        </div>
      </header>

      <div className="summary-grid">
        <div className="stat">
          <span className="muted">Grand total</span>
          <strong>{invoice.currency} {invoice.grandTotal.toString()}</strong>
        </div>
        <div className="stat">
          <span className="muted">Paid</span>
          <strong>{invoice.currency} {invoice.paidTotal.toString()}</strong>
        </div>
        <div className="stat">
          <span className="muted">Balance</span>
          <strong>{invoice.currency} {invoice.balanceDue.toString()}</strong>
        </div>
      </div>

      <div className="grid two-column">
        <div className="grid">
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Snapshot</p>
                <h2>Invoice overview</h2>
              </div>
            </div>
            <table className="table compact">
            <tbody>
              <tr><th>Buyer</th><td>{invoice.buyer?.displayName || "-"}</td></tr>
              <tr><th>Company</th><td>{invoice.company?.legalName || "-"}</td></tr>
              <tr><th>Bank account</th><td>{invoice.bankAccount ? `${invoice.bankAccount.bankName} - ${invoice.bankAccount.accountNumberLast4}` : "-"}</td></tr>
              <tr><th>Due date</th><td>{invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "-"}</td></tr>
              <tr><th>Buyer order</th><td>{invoice.buyerOrderNumber || "-"}</td></tr>
              <tr><th>Exporter reference</th><td>{invoice.exporterReference || "-"}</td></tr>
              <tr><th>Tax mode</th><td>{invoice.taxMode}</td></tr>
              <tr><th>Subtotal</th><td>{invoice.subtotal.toString()}</td></tr>
              <tr><th>IGST</th><td>{invoice.igstTotal.toString()}</td></tr>
              <tr><th>CGST</th><td>{invoice.cgstTotal.toString()}</td></tr>
              <tr><th>SGST</th><td>{invoice.sgstTotal.toString()}</td></tr>
              <tr><th>Round off</th><td>{invoice.roundOff.toString()}</td></tr>
              <tr><th>Grand total</th><td>{invoice.currency} {invoice.grandTotal.toString()}</td></tr>
              <tr><th>Paid total</th><td>{invoice.currency} {invoice.paidTotal.toString()}</td></tr>
              <tr><th>Balance due</th><td>{invoice.currency} {invoice.balanceDue.toString()}</td></tr>
            </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Goods and services</p>
                <h2>Line items</h2>
              </div>
              <span className="badge">{invoice.items.length} lines</span>
            </div>
            {invoice.items.length === 0 ? (
              <p className="muted">No line items yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>GST</th>
                    <th>Total</th>
                    {isDraft ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.sortOrder}</td>
                      <td>{item.description}</td>
                      <td>{item.quantity.toString()} {item.unitCode || ""}</td>
                      <td>{item.rate.toString()}</td>
                      <td>{item.gstRate.toString()}%</td>
                      <td>{item.lineTotal.toString()}</td>
                      {isDraft ? (
                        <td>
                          <div className="line-actions">
                            <details className="details compact">
                              <summary>Edit</summary>
                              <form className="form compact-form" action="/api/invoices/items/update" method="post">
                                <input type="hidden" name="invoiceId" value={invoice.id} />
                                <input type="hidden" name="lineItemId" value={item.id} />
                                <input type="hidden" name="expectedVersion" value={invoice.version} />
                                <input type="hidden" name="sortOrder" value={item.sortOrder} />
                                <input type="hidden" name="itemId" value={item.itemId || ""} />
                                <input type="hidden" name="sku" value={item.sku || ""} />
                                <input type="hidden" name="hsnSac" value={item.hsnSac || ""} />
                                <div className="field">
                                  <label htmlFor={`description-${item.id}`}>Description</label>
                                  <textarea id={`description-${item.id}`} name="description" defaultValue={item.description} required />
                                </div>
                                <div className="form-grid">
                                  <div className="field">
                                    <label htmlFor={`quantity-${item.id}`}>Qty</label>
                                    <input id={`quantity-${item.id}`} name="quantity" type="number" step="0.0001" min="0" defaultValue={item.quantity.toString()} required />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`unit-${item.id}`}>Unit</label>
                                    <input id={`unit-${item.id}`} name="unitCode" defaultValue={item.unitCode || ""} />
                                  </div>
                                </div>
                                <div className="form-grid">
                                  <div className="field">
                                    <label htmlFor={`rate-${item.id}`}>Rate</label>
                                    <input id={`rate-${item.id}`} name="rate" type="number" step="0.0001" min="0" defaultValue={item.rate.toString()} required />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`gst-${item.id}`}>GST %</label>
                                    <input id={`gst-${item.id}`} name="gstRate" type="number" step="0.0001" min="0" max="100" defaultValue={item.gstRate.toString()} />
                                  </div>
                                </div>
                                <div className="field">
                                  <label htmlFor={`discount-${item.id}`}>Discount</label>
                                  <input id={`discount-${item.id}`} name="discountAmount" type="number" step="0.01" min="0" defaultValue={item.discountAmount.toString()} />
                                </div>
                                <button className="button" type="submit">
                                  <Save size={18} />
                                  Save line
                                </button>
                              </form>
                            </details>
                            <form action="/api/invoices/items/delete" method="post">
                              <input type="hidden" name="invoiceId" value={invoice.id} />
                              <input type="hidden" name="lineItemId" value={item.id} />
                              <input type="hidden" name="expectedVersion" value={invoice.version} />
                              <button className="inline-action danger" type="submit">
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </form>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Immutable history</p>
                <h2>Revision history</h2>
              </div>
              <FileClock size={20} />
            </div>
            {invoice.revisions.length === 0 ? (
              <p className="muted">No issued snapshot has been recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Revision</th><th>Reason</th><th>Created</th><th>By</th></tr>
                  </thead>
                  <tbody>
                    {invoice.revisions.map((revision) => (
                      <tr key={revision.id}>
                        <td>v{revision.revisionNumber}</td>
                        <td>{revision.reason}</td>
                        <td>{revision.createdAt.toISOString().slice(0, 10)}</td>
                        <td>{revision.createdBy.name || revision.createdBy.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Corrections</p>
                <h2>Credit notes</h2>
              </div>
              <Undo2 size={20} />
            </div>
            {invoice.creditNotes.length === 0 ? (
              <p className="muted">No credit notes have been drafted for this invoice.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Number</th><th>Status</th><th>Total</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {invoice.creditNotes.map((creditNote) => (
                      <tr key={creditNote.id}>
                        <td>{creditNote.creditNoteDate.toISOString().slice(0, 10)}</td>
                        <td>{creditNote.creditNoteNumber || "Draft"}</td>
                        <td><span className={`status-badge ${creditNote.status}`}>{creditNote.status}</span></td>
                        <td>{creditNote.currency} {creditNote.grandTotal.toString()}</td>
                        <td>{creditNote.reason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="grid">
          {canCreateCreditNote ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Correction draft</p>
                  <h2>Create credit note</h2>
                </div>
                <Undo2 size={20} />
              </div>
              <form className="form" action="/api/credit-notes" method="post">
                <input type="hidden" name="originalInvoiceId" value={invoice.id} />
                <div className="field">
                  <label htmlFor="credit-note-reason">Reason</label>
                  <textarea id="credit-note-reason" name="reason" placeholder="Short correction reason" />
                </div>
                <button className="button" type="submit">
                  <Undo2 size={18} />
                  Create draft
                </button>
              </form>
            </section>
          ) : null}

          {isDraft ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Finalise</p>
                  <h2>Issue invoice</h2>
                </div>
                <Send size={20} />
              </div>
              {issueRequirements.length > 0 ? (
                <p className="notice error">Before issuing: {issueRequirements.join(", ")}.</p>
              ) : null}
              {editorData.series.length === 0 ? (
                <p className="muted">Create an invoice number series in Settings first.</p>
              ) : (
                <form className="form" action="/api/invoices/issue" method="post">
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <input type="hidden" name="expectedVersion" value={invoice.version} />
                  <div className="field">
                    <label htmlFor="seriesId">Number series</label>
                    <select id="seriesId" name="seriesId" required>
                      {editorData.series.map((series) => (
                        <option key={series.id} value={series.id}>
                          {series.name} - next {previewInvoiceNumber(series, invoice.invoiceDate, editorData.organisation.financialYearStart)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="button" type="submit" disabled={!canIssue}>
                    <Send size={18} />
                    Issue invoice
                  </button>
                </form>
              )}
            </section>
          ) : null}

          {canOpenPdf ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Export output</p>
                  <h2>Documents</h2>
                </div>
                <FileText size={20} />
              </div>
              <div className="action-stack">
                <a className="button" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                  <FileText size={18} />
                  Invoice PDF
                </a>
                {issuedPackingLists.map((packingList) => (
                  <a key={packingList.id} className="button subtle" href={`/api/packing-lists/${packingList.id}/pdf`} target="_blank" rel="noreferrer">
                    <PackageCheck size={18} />
                    Packing list {packingList.packingListNumber || ""}
                  </a>
                ))}
                {draftPackingLists.map((packingList) => (
                  <Link key={packingList.id} className="button subtle" href={`/packing-lists/${packingList.id}`}>
                    <PackageCheck size={18} />
                    Continue packing draft
                  </Link>
                ))}
                {issuedCreditNotes.map((creditNote) => (
                  <a key={creditNote.id} className="button subtle" href={`/api/credit-notes/${creditNote.id}/pdf`} target="_blank" rel="noreferrer">
                    <Undo2 size={18} />
                    Credit note {creditNote.creditNoteNumber || ""}
                  </a>
                ))}
                {canCreatePackingList ? (
                  <form className="form" action="/api/packing-lists" method="post">
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="packingListDate" value={new Date().toISOString().slice(0, 10)} />
                    <button className="button subtle" type="submit">
                      <PackageCheck size={18} />
                      Create packing list
                    </button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          {canRecordPayment ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Payment</p>
                  <h2>Receivable</h2>
                </div>
                <CreditCard size={20} />
              </div>
              <Link className="button subtle" href="/payments">
                <CreditCard size={18} />
                Record payment
              </Link>
            </section>
          ) : null}

          {invoice.status === "issued" ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Control</p>
                  <h2>Cancel invoice</h2>
                </div>
                <Ban size={20} />
              </div>
              <form className="form" action="/api/invoices/cancel" method="post">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="field">
                  <label htmlFor="reason">Reason</label>
                  <textarea id="reason" name="reason" required />
                </div>
                <button className="button" type="submit">
                  <Ban size={18} />
                  Cancel invoice
                </button>
              </form>
            </section>
          ) : null}

          {isDraft ? (
          <>
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Draft control</p>
                <h2>Delete draft</h2>
              </div>
              <Trash2 size={20} />
            </div>
            <form className="form" action="/api/invoices/delete" method="post">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="button danger" type="submit">
                <Trash2 size={18} />
                Delete draft
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Draft details</p>
                <h2>Update invoice</h2>
              </div>
              <Save size={20} />
            </div>
            <form className="form" action="/api/invoices" method="post">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="version" value={invoice.version} />
              <div className="field">
                <label htmlFor="companyId">Company</label>
                <select id="companyId" name="companyId" defaultValue={invoice.companyId || ""}>
                  <option value="">None</option>
                  {editorData.companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="buyerId">Buyer</label>
                <select id="buyerId" name="buyerId" defaultValue={invoice.buyerId || ""}>
                  <option value="">None</option>
                  {editorData.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.displayName}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bankAccountId">Bank account</label>
                <select id="bankAccountId" name="bankAccountId" defaultValue={invoice.bankAccountId || ""}>
                  <option value="">None</option>
                  {editorData.bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.bankName} - {account.accountNumberLast4}</option>
                  ))}
                </select>
              </div>
              <div className="form-grid">
                <div className="field"><label htmlFor="invoiceDate">Invoice date</label><input id="invoiceDate" name="invoiceDate" type="date" defaultValue={invoice.invoiceDate.toISOString().slice(0, 10)} required /></div>
                <div className="field"><label htmlFor="dueDate">Due date</label><input id="dueDate" name="dueDate" type="date" defaultValue={invoice.dueDate?.toISOString().slice(0, 10) || ""} /></div>
                <div className="field"><label htmlFor="currency">Currency</label><input id="currency" name="currency" defaultValue={invoice.currency} required /></div>
              </div>
              <div className="field">
                <label htmlFor="taxMode">Tax mode</label>
                <select id="taxMode" name="taxMode" defaultValue={invoice.taxMode}>
                  <option value="automatic">Automatic</option>
                  <option value="igst">IGST</option>
                  <option value="cgst_sgst">CGST + SGST</option>
                  <option value="zero_rated_export">Zero-rated export</option>
                  <option value="no_tax">No tax</option>
                </select>
              </div>
              <div className="form-grid">
                <div className="field"><label htmlFor="buyerOrderNumber">Buyer order number</label><input id="buyerOrderNumber" name="buyerOrderNumber" defaultValue={invoice.buyerOrderNumber || ""} /></div>
                <div className="field"><label htmlFor="exporterReference">Exporter reference</label><input id="exporterReference" name="exporterReference" defaultValue={invoice.exporterReference || ""} /></div>
              </div>
              <details className="details">
                <summary>Shipping and export fields</summary>
                <div className="form-grid">
                  <div className="field"><label htmlFor="preCarriageBy">Pre-carriage by</label><input id="preCarriageBy" name="preCarriageBy" defaultValue={invoice.preCarriageBy || ""} /></div>
                  <div className="field"><label htmlFor="placeOfReceipt">Place of receipt</label><input id="placeOfReceipt" name="placeOfReceipt" defaultValue={invoice.placeOfReceipt || ""} /></div>
                  <div className="field"><label htmlFor="vesselFlightNo">Vessel/flight no.</label><input id="vesselFlightNo" name="vesselFlightNo" defaultValue={invoice.vesselFlightNo || ""} /></div>
                  <div className="field"><label htmlFor="portOfLoading">Port of loading</label><input id="portOfLoading" name="portOfLoading" defaultValue={invoice.portOfLoading || ""} /></div>
                  <div className="field"><label htmlFor="portOfDischarge">Port of discharge</label><input id="portOfDischarge" name="portOfDischarge" defaultValue={invoice.portOfDischarge || ""} /></div>
                  <div className="field"><label htmlFor="finalDestination">Final destination</label><input id="finalDestination" name="finalDestination" defaultValue={invoice.finalDestination || ""} /></div>
                </div>
                <div className="field"><label htmlFor="termsOfDelivery">Terms of delivery and payment</label><textarea id="termsOfDelivery" name="termsOfDelivery" defaultValue={invoice.termsOfDelivery || ""} /></div>
              </details>
              <div className="field"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" defaultValue={invoice.notes || ""} /></div>
              <div className="field"><label htmlFor="declaration">Declaration</label><textarea id="declaration" name="declaration" defaultValue={invoice.declaration || ""} /></div>
              <input type="hidden" name="invoiceDiscount" value={invoice.invoiceDiscount.toString()} />
              <input type="hidden" name="otherCharges" value={invoice.otherCharges.toString()} />
              <button className="button" type="submit">
                <Save size={18} />
                Save draft
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Invoice rows</p>
                <h2>Add line item</h2>
              </div>
              <Plus size={20} />
            </div>
            <form className="form" action="/api/invoices/items" method="post">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="expectedVersion" value={invoice.version} />
              <input type="hidden" name="sortOrder" value={invoice.items.length + 1} />
              <div className="field">
                <label htmlFor="itemId">Catalog item</label>
                <select id="itemId" name="itemId" defaultValue="">
                  <option value="">Manual line</option>
                  {editorData.masterItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" required /></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" type="number" step="0.0001" min="0" required /></div>
                <div className="field"><label htmlFor="unitCode">Unit</label><input id="unitCode" name="unitCode" /></div>
              </div>
              <div className="form-grid">
                <div className="field"><label htmlFor="rate">Rate</label><input id="rate" name="rate" type="number" step="0.0001" min="0" required /></div>
                <div className="field"><label htmlFor="gstRate">GST %</label><input id="gstRate" name="gstRate" type="number" step="0.0001" min="0" max="100" defaultValue="0" /></div>
              </div>
              <input type="hidden" name="discountAmount" value="0" />
              <button className="button" type="submit">
                <Plus size={18} />
                Add line
              </button>
            </form>
          </section>
          </>
          ) : (
            <section className="panel">
              <div className="section-title">
                <div>
                  <p className="muted">Locked</p>
                  <h2>Draft editing closed</h2>
                </div>
              </div>
              <p className="muted">This invoice has been issued, so changes must be handled through payments, cancellation, or a new invoice.</p>
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function previewInvoiceNumber(
  series: {
    pattern: string;
    prefix: string | null;
    nextSequence: number;
    startingNumber: number;
    resetRule: "never" | "calendar_year" | "financial_year";
    lastResetKey: string | null;
  },
  invoiceDate: Date,
  financialYearStartMonth: number
) {
  const resetKey = resetKeyForRule(series.resetRule, invoiceDate, financialYearStartMonth);
  const sequence = resetKey !== null && series.lastResetKey !== resetKey
    ? series.startingNumber
    : series.nextSequence;

  return renderInvoiceNumber({
    pattern: series.pattern,
    prefix: series.prefix,
    sequence,
    date: invoiceDate,
    financialYearStartMonth
  });
}
