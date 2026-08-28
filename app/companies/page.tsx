import { redirect } from "next/navigation";
import { BadgeCheck, Image as ImageIcon, Landmark, PenLine, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/organisations/membership";
import { listCompanies } from "@/lib/companies/company-service";

export default async function CompaniesPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const context = await getTenantContextForUser(user.id);

  if (!context) {
    redirect("/register");
  }

  const companies = await listCompanies(context);
  const query = await searchParams;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="muted">Master data</p>
          <h1>Companies</h1>
          <div className="meta-row">
            <span>Legal details, branding, bank accounts, and invoice defaults</span>
          </div>
        </div>
      </header>
      {query?.error ? <p className="notice error">{query.error}</p> : null}
      <div className="summary-grid">
        <div className="stat">
          <div className="kpi-row">
            <span className="muted">Companies</span>
            <span className="kpi-icon"><BadgeCheck size={18} /></span>
          </div>
          <strong>{companies.length}</strong>
        </div>
        <div className="stat accent">
          <div className="kpi-row">
            <span className="muted">Bank accounts</span>
            <span className="kpi-icon"><Landmark size={18} /></span>
          </div>
          <strong>{companies.reduce((count, company) => count + company.bankAccounts.length, 0)}</strong>
        </div>
        <div className="stat warning">
          <div className="kpi-row">
            <span className="muted">Branding</span>
            <span className="kpi-icon"><ImageIcon size={18} /></span>
          </div>
          <strong>{companies.filter((company) => company.logoAssetId || company.signatureAssetId).length}</strong>
        </div>
      </div>
      <div className="grid two-column">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Legal entities</p>
              <h2>{companies.length} companies</h2>
            </div>
          </div>
          {companies.length === 0 ? (
            <div className="empty-state">No companies yet. Add your first legal entity.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Tax IDs</th>
                    <th>Address</th>
                    <th>Branding</th>
                    <th>Bank accounts</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <strong>{company.legalName}</strong>
                        {company.isDefault ? <span className="badge">Default</span> : null}
                        <p className="muted">{company.tradingName || "-"}</p>
                        {!company.isActive ? <span className="badge neutral">Inactive</span> : null}
                      </td>
                      <td>
                        <div>GSTIN: {company.gstin || "-"}</div>
                        <div>PAN: {company.pan || "-"}</div>
                        <div>IEC: {company.iec || "-"}</div>
                      </td>
                      <td>
                        {company.addressLine1}
                        {company.addressLine2 ? `, ${company.addressLine2}` : ""}
                        <br />
                        {company.city}, {company.state} {company.postcode}
                        <br />
                        <span className="muted">{company.phone || "-"} {company.email ? `| ${company.email}` : ""}</span>
                      </td>
                      <td>
                        <div className="brand-asset-list">
                          <span className={company.logoAsset ? "badge success" : "badge neutral"}>
                            Logo: {company.logoAsset?.originalName || "Pending"}
                          </span>
                          <span className={company.signatureAsset ? "badge success" : "badge neutral"}>
                            Signature: {company.signatureAsset?.originalName || "Pending"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {company.bankAccounts.length === 0 ? (
                          <span className="muted">No bank account</span>
                        ) : (
                          company.bankAccounts.map((account) => (
                            <div key={account.id}>
                              <strong>{account.bankName}</strong>
                              {account.isDefault ? <span className="badge">Default</span> : null}
                              <br />
                              <span className="muted">{account.maskedAccountNumber}</span>
                            </div>
                          ))
                        )}
                      </td>
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
                <p className="muted">Brand assets</p>
                <h2>Logo and signature</h2>
              </div>
              <PenLine size={20} />
            </div>
            <div className="grid">
              {companies.length === 0 ? (
                <div className="empty-state compact">Create a company first, then upload logo and signature assets.</div>
              ) : (
                <>
                  <BrandAssetForm companies={companies} kind="company_logo" title="Company logo" />
                  <BrandAssetForm companies={companies} kind="company_signature" title="Authorised signature" />
                </>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Legal profile</p>
                <h2>Add company</h2>
              </div>
            </div>
            <form className="form" action="/api/companies" method="post">
              <div className="field">
                <label htmlFor="legalName">Legal name</label>
                <input id="legalName" name="legalName" required />
              </div>
              <div className="field">
                <label htmlFor="tradingName">Trading name</label>
                <input id="tradingName" name="tradingName" />
              </div>
              <div className="field">
                <label htmlFor="addressLine1">Address line 1</label>
                <input id="addressLine1" name="addressLine1" required />
              </div>
              <div className="field">
                <label htmlFor="addressLine2">Address line 2</label>
                <input id="addressLine2" name="addressLine2" />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="city">City</label>
                  <input id="city" name="city" required />
                </div>
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input id="state" name="state" placeholder="Uttar Pradesh" required />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="stateCode">State code</label>
                  <input id="stateCode" name="stateCode" maxLength={10} placeholder="09" />
                </div>
                <div className="field">
                  <label htmlFor="postcode">Postcode</label>
                  <input id="postcode" name="postcode" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="country">Country</label>
                <input id="country" name="country" defaultValue="India" required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" name="phone" />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" />
                </div>
              </div>
              <div className="form-grid three">
                <div className="field">
                  <label htmlFor="gstin">GSTIN</label>
                  <input id="gstin" name="gstin" maxLength={15} />
                </div>
                <div className="field">
                  <label htmlFor="pan">PAN</label>
                  <input id="pan" name="pan" maxLength={10} />
                </div>
                <div className="field">
                  <label htmlFor="iec">IEC</label>
                  <input id="iec" name="iec" maxLength={20} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="signatoryName">Signatory name</label>
                <input id="signatoryName" name="signatoryName" />
              </div>
              <div className="field">
                <label htmlFor="signatoryDesignation">Signatory designation</label>
                <input id="signatoryDesignation" name="signatoryDesignation" />
              </div>
              <div className="field">
                <label htmlFor="defaultDeclaration">Default declaration</label>
                <textarea id="defaultDeclaration" name="defaultDeclaration" />
              </div>
              <div className="field">
                <label htmlFor="defaultTerms">Default terms</label>
                <textarea id="defaultTerms" name="defaultTerms" />
              </div>
              <label className="checkbox">
                <input type="checkbox" name="isDefault" value="true" />
                Default company
              </label>
              <button className="button" type="submit">
                Save company
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Payment details</p>
                <h2>Add bank account</h2>
              </div>
            </div>
            {companies.length === 0 ? (
              <div className="empty-state">Create a company first.</div>
            ) : (
              <form className="form" action="/api/companies/bank-accounts" method="post">
                <div className="field">
                  <label htmlFor="companyId">Company</label>
                  <select id="companyId" name="companyId" required>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.legalName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bankName">Bank name</label>
                  <input id="bankName" name="bankName" required />
                </div>
                <div className="field">
                  <label htmlFor="accountHolderName">Account holder</label>
                  <input id="accountHolderName" name="accountHolderName" required />
                </div>
                <div className="field">
                  <label htmlFor="accountNumber">Account number</label>
                  <input id="accountNumber" name="accountNumber" required />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="ifsc">IFSC</label>
                    <input id="ifsc" name="ifsc" />
                  </div>
                  <div className="field">
                    <label htmlFor="swiftBic">SWIFT/BIC</label>
                    <input id="swiftBic" name="swiftBic" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="branchName">Branch name</label>
                  <input id="branchName" name="branchName" />
                </div>
                <div className="field">
                  <label htmlFor="branchAddress">Branch address</label>
                  <textarea id="branchAddress" name="branchAddress" />
                </div>
                <div className="field">
                  <label htmlFor="currency">Currency</label>
                  <input id="currency" name="currency" defaultValue="INR" required />
                </div>
                <label className="checkbox">
                  <input type="checkbox" name="isDefault" value="true" />
                  Default bank account
                </label>
                <button className="button" type="submit">
                  Save bank account
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function BrandAssetForm({
  companies,
  kind,
  title
}: {
  companies: Awaited<ReturnType<typeof listCompanies>>;
  kind: "company_logo" | "company_signature";
  title: string;
}) {
  return (
    <form className="asset-upload-card" action="/api/companies/brand-assets" method="post" encType="multipart/form-data">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <strong>{title}</strong>
        <p className="helper-text">PNG, JPEG, or WebP up to 2MB. Used on invoice and packing-list PDFs where supported.</p>
      </div>
      <div className="field">
        <label htmlFor={`${kind}-company`}>Company</label>
        <select id={`${kind}-company`} name="companyId" required>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.legalName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${kind}-file`}>Image file</label>
        <input id={`${kind}-file`} name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
      </div>
      <button className="button subtle" type="submit">
        <Upload size={16} />
        Upload
      </button>
    </form>
  );
}
