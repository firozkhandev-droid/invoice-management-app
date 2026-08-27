import { redirect } from "next/navigation";
import {
  Boxes,
  Copy,
  Download,
  FileSpreadsheet,
  ImagePlus,
  PackagePlus,
  Search,
  Tags,
  Trash2,
  Upload,
  Wrench
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { listItemMasters } from "@/lib/items/item-service";
import { getTenantContextForUser } from "@/lib/organisations/membership";

export default async function ItemsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; category?: string; status?: string; sort?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const context = await getTenantContextForUser(user.id);

  if (!context) {
    redirect("/register");
  }

  const filters = await searchParams;
  const { units, taxRates, items, categories } = await listItemMasters(context, filters);
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const exportHref = `/api/items/export${query.size ? `?${query.toString()}` : ""}`;
  const activeCount = items.filter((item) => item.isActive).length;
  const imageReadyCount = items.filter((item) => item.imageAssetId).length;

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="muted">Inventory master</p>
          <h1>Items catalog</h1>
          <div className="meta-row">
            <span>Products, tax codes, units, prices, weights, barcodes, and image readiness</span>
          </div>
        </div>
        <div className="toolbar">
          <a className="button subtle" href="/api/items/template">
            <FileSpreadsheet size={18} />
            Template
          </a>
          <a className="button subtle" href={exportHref}>
            <Download size={18} />
            Export CSV
          </a>
          <a className="button" href="#add-item">
            <PackagePlus size={18} />
            Add item
          </a>
        </div>
      </header>

      <div className="summary-grid">
        <div className="stat">
          <div className="kpi-row"><span className="muted">Items</span><span className="kpi-icon"><Boxes size={18} /></span></div>
          <strong>{items.length}</strong>
        </div>
        <div className="stat accent">
          <div className="kpi-row"><span className="muted">Active</span><span className="kpi-icon"><Tags size={18} /></span></div>
          <strong>{activeCount}</strong>
        </div>
        <div className="stat warning">
          <div className="kpi-row"><span className="muted">Images linked</span><span className="kpi-icon"><ImagePlus size={18} /></span></div>
          <strong>{imageReadyCount}</strong>
        </div>
      </div>

      <div className="item-action-strip">
        <details className="action-card">
          <summary><FileSpreadsheet size={18} /> Import Excel / CSV</summary>
          <div className="upload-zone">
            <Upload size={28} />
            <h3>Upload item sheet</h3>
            <p className="muted">Service boundary ready. Use the template now; parser/import approval can be wired in the next phase.</p>
            <a className="button subtle" href="/api/items/template">Download template</a>
          </div>
        </details>
        <details className="action-card">
          <summary><ImagePlus size={18} /> Bulk images</summary>
          <div className="upload-zone">
            <ImagePlus size={28} />
            <h3>Upload product images</h3>
            <p className="muted">Name images with item codes for future auto-match, for example IND-0001.jpg. Storage is intentionally not activated yet.</p>
          </div>
        </details>
        <details className="action-card">
          <summary><Wrench size={18} /> Image tools</summary>
          <div className="upload-zone">
            <Wrench size={28} />
            <h3>Fix images / smart fill</h3>
            <p className="muted">Reserved for background cleanup, gallery review, and AI-assisted field suggestions after uploads are enabled.</p>
          </div>
        </details>
      </div>

      <section className="panel">
        <div className="section-title">
          <div>
            <p className="muted">Search and filter</p>
            <h2>Catalog controls</h2>
          </div>
          <Search size={20} />
        </div>
        <form className="form" method="get">
          <div className="form-grid four">
            <div className="field">
              <label htmlFor="q">Search</label>
              <input id="q" name="q" defaultValue={filters?.q || ""} placeholder="Name, SKU, HSN, barcode" />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={filters?.category || ""}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={filters?.status || ""}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sort">Sort</label>
              <select id="sort" name="sort" defaultValue={filters?.sort || "newest"}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="code">Item code</option>
                <option value="price">Highest price</option>
              </select>
            </div>
          </div>
          <button className="button" type="submit">Apply filters</button>
        </form>
      </section>

      <div className="grid two-column wide-left">
        <section className="panel">
          <div className="section-title">
            <div>
              <p className="muted">Results</p>
              <h2>{items.length} items</h2>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty-state">No items match this view. Add your first catalog item or clear filters.</div>
          ) : (
            <div className="table-wrap">
              <table className="table catalog-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th>Barcode</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="thumb-placeholder">
                          {item.imageAssetId ? <ImagePlus size={18} /> : (item.sku || item.name).slice(0, 2).toUpperCase()}
                        </div>
                      </td>
                      <td>
                        <strong>{item.sku || "Uncoded"}</strong>
                        <p>{item.name}</p>
                        <p className="muted">HSN/SAC: {item.hsnSac || "-"} | Unit: {item.unit?.code || "-"}</p>
                      </td>
                      <td>
                        <span className="badge neutral">{item.category || "Uncategorised"}</span>
                        <p className="muted">{item.subcategory || item.manufacturer || "-"}</p>
                      </td>
                      <td>{item.saleRate ? `${item.currency} ${item.saleRate.toString()}` : "-"}</td>
                      <td>{item.weightKg ? `${item.weightKg.toString()} kg` : "-"}</td>
                      <td>
                        <span className={item.isActive ? "badge success" : "badge neutral"}>{item.isActive ? "Active" : "Inactive"}</span>
                        <p className="muted">{item.imageAssetId ? "Image linked" : "Image pending"}</p>
                      </td>
                      <td>{item.barcode || "-"}</td>
                      <td>
                        <div className="row-actions">
                          <details className="inline-edit">
                            <summary>Edit</summary>
                            <form className="form compact-form" action="/api/items/update" method="post">
                              <input type="hidden" name="itemId" value={item.id} />
                              <ItemFields item={item} units={units} taxRates={taxRates} />
                              <button className="button" type="submit">Update item</button>
                            </form>
                          </details>
                          <form action="/api/items/duplicate" method="post">
                            <input type="hidden" name="itemId" value={item.id} />
                            <button className="icon-button" title="Duplicate item" type="submit"><Copy size={16} /></button>
                          </form>
                          <form action="/api/items/toggle-active" method="post">
                            <input type="hidden" name="itemId" value={item.id} />
                            <button className="button subtle tiny" type="submit">{item.isActive ? "Deactivate" : "Activate"}</button>
                          </form>
                          <form action="/api/items/delete" method="post">
                            <input type="hidden" name="itemId" value={item.id} />
                            <button className="icon-button danger" title="Delete unused item" type="submit"><Trash2 size={16} /></button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="grid">
          <section className="panel" id="add-item">
            <div className="section-title">
              <div>
                <p className="muted">Catalog item</p>
                <h2>Add item</h2>
              </div>
              <PackagePlus size={20} />
            </div>
            <form className="form" action="/api/items" method="post">
              <ItemFields units={units} taxRates={taxRates} />
              <button className="button" type="submit">Save item</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">Measurement</p>
                <h2>Add unit</h2>
              </div>
            </div>
            <form className="form" action="/api/items/units" method="post">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="code">Code</label>
                  <input id="code" name="code" placeholder="PCS" required />
                </div>
                <div className="field">
                  <label htmlFor="precision">Precision</label>
                  <input id="precision" name="precision" type="number" defaultValue="2" min="0" max="6" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="unitName">Name</label>
                <input id="unitName" name="name" placeholder="Pieces" required />
              </div>
              <label className="checkbox">
                <input type="checkbox" name="isDefault" value="true" />
                Default unit
              </label>
              <button className="button" type="submit">Save unit</button>
            </form>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <p className="muted">GST setup</p>
                <h2>Add tax rate</h2>
              </div>
            </div>
            <form className="form" action="/api/items/tax-rates" method="post">
              <div className="field">
                <label htmlFor="taxName">Name</label>
                <input id="taxName" name="name" placeholder="GST 5%" required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="rate">Rate %</label>
                  <input id="rate" name="rate" type="number" step="0.0001" min="0" max="100" required />
                </div>
                <div className="field">
                  <label htmlFor="taxType">Type</label>
                  <select id="taxType" name="taxType" defaultValue="gst">
                    <option value="gst">GST</option>
                    <option value="export_zero_rated">Export zero-rated</option>
                    <option value="no_tax">No tax</option>
                  </select>
                </div>
              </div>
              <label className="checkbox">
                <input type="checkbox" name="isDefault" value="true" />
                Default tax rate
              </label>
              <button className="button" type="submit">Save tax rate</button>
            </form>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function ItemFields({
  item,
  units,
  taxRates
}: {
  item?: {
    sku: string | null;
    name: string;
    description: string | null;
    category: string | null;
    subcategory: string | null;
    hsnSac: string | null;
    manufacturer: string | null;
    barcode: string | null;
    weightKg: { toString(): string } | null;
    unitId: string | null;
    taxRateId: string | null;
    saleRate: { toString(): string } | null;
    currency: string;
    imageAssetId: string | null;
    imageStatus: string;
    isActive: boolean;
  };
  units: { id: string; code: string; name: string }[];
  taxRates: { id: string; name: string; rate: { toString(): string } }[];
}) {
  const suffix = item ? `-${item.sku || item.name}` : "";

  return (
    <>
      <div className="form-grid three">
        <div className="field">
          <label htmlFor={`sku${suffix}`}>Item code / SKU</label>
          <input id={`sku${suffix}`} name="sku" defaultValue={item?.sku || ""} placeholder="IND-0001" />
        </div>
        <div className="field">
          <label htmlFor={`hsnSac${suffix}`}>HSN/SAC</label>
          <input id={`hsnSac${suffix}`} name="hsnSac" defaultValue={item?.hsnSac || ""} placeholder="7113" />
        </div>
        <div className="field">
          <label htmlFor={`barcode${suffix}`}>Barcode</label>
          <input id={`barcode${suffix}`} name="barcode" defaultValue={item?.barcode || ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`itemName${suffix}`}>Name</label>
        <input id={`itemName${suffix}`} name="name" defaultValue={item?.name || ""} required />
      </div>
      <div className="field">
        <label htmlFor={`description${suffix}`}>Description</label>
        <textarea id={`description${suffix}`} name="description" defaultValue={item?.description || ""} placeholder="Detailed product description..." />
      </div>
      <div className="form-grid three">
        <div className="field">
          <label htmlFor={`category${suffix}`}>Category</label>
          <input id={`category${suffix}`} name="category" defaultValue={item?.category || ""} placeholder="Jewellery" />
        </div>
        <div className="field">
          <label htmlFor={`subcategory${suffix}`}>Subcategory</label>
          <input id={`subcategory${suffix}`} name="subcategory" defaultValue={item?.subcategory || ""} placeholder="Necklaces" />
        </div>
        <div className="field">
          <label htmlFor={`manufacturer${suffix}`}>Manufacturer</label>
          <input id={`manufacturer${suffix}`} name="manufacturer" defaultValue={item?.manufacturer || ""} />
        </div>
      </div>
      <div className="form-grid three">
        <div className="field">
          <label htmlFor={`unitId${suffix}`}>Unit</label>
          <select id={`unitId${suffix}`} name="unitId" defaultValue={item?.unitId || ""}>
            <option value="">None</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.code} - {unit.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`taxRateId${suffix}`}>Tax rate</label>
          <select id={`taxRateId${suffix}`} name="taxRateId" defaultValue={item?.taxRateId || ""}>
            <option value="">None</option>
            {taxRates.map((taxRate) => (
              <option key={taxRate.id} value={taxRate.id}>
                {taxRate.name} - {taxRate.rate.toString()}%
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`weightKg${suffix}`}>Weight KG</label>
          <input id={`weightKg${suffix}`} name="weightKg" type="number" min="0" step="0.0001" defaultValue={item?.weightKg?.toString() || ""} />
        </div>
      </div>
      <div className="form-grid three">
        <div className="field">
          <label htmlFor={`saleRate${suffix}`}>Unit price</label>
          <input id={`saleRate${suffix}`} name="saleRate" type="number" min="0" step="0.0001" defaultValue={item?.saleRate?.toString() || ""} />
        </div>
        <div className="field">
          <label htmlFor={`currency${suffix}`}>Currency</label>
          <input id={`currency${suffix}`} name="currency" defaultValue={item?.currency || "INR"} required />
        </div>
        <div className="field">
          <label htmlFor={`imageStatus${suffix}`}>Image status</label>
          <select id={`imageStatus${suffix}`} name="imageStatus" defaultValue={item?.imageStatus || "pending"}>
            <option value="pending">Pending</option>
            <option value="linked">Linked</option>
            <option value="needs_fix">Needs fix</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`imageAssetId${suffix}`}>Image reference</label>
        <input id={`imageAssetId${suffix}`} name="imageAssetId" defaultValue={item?.imageAssetId || ""} placeholder="Reserved upload asset id or image filename" />
      </div>
      <label className="checkbox">
        <input type="checkbox" name="isActive" value="true" defaultChecked={item?.isActive ?? true} />
        Active item
      </label>
    </>
  );
}
