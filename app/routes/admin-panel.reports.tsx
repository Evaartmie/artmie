import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth, getStoreName, getStoreBrand, STORE_NAMES } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

// ── Loader: stats for the page ──────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const totalReturns = await prisma.returnRequest.count();

  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const shopCounts = await prisma.returnRequest.groupBy({
    by: ["shop"],
    _count: { id: true },
  });

  const shops = shopCounts.map((s) => ({
    shop: s.shop,
    name: getStoreName(s.shop),
    brand: getStoreBrand(s.shop),
    count: s._count.id,
  }));
  shops.sort((a, b) => a.name.localeCompare(b.name));

  // Date range - earliest and latest return
  const earliest = await prisma.returnRequest.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const latest = await prisma.returnRequest.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });

  return json({
    totalReturns,
    statuses: statusCounts.map((s) => ({ status: s.status, count: s._count.id })),
    shops,
    dateRange: {
      from: earliest?.createdAt?.toISOString().split("T")[0] || "",
      to: latest?.createdAt?.toISOString().split("T")[0] || "",
    },
  });
};

// ── Reason labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Cakajuce",
  approved: "Schvalene",
  rejected: "Zamietnute",
  in_transit: "V preprave",
  received: "Prijate",
  refunded: "Refundovane",
  closed: "Uzavrete",
  cancelled: "Zrusene",
};

// ── Component ───────────────────────────────────────────────────────────

export default function AdminReports() {
  const { totalReturns, statuses, shops, dateRange } = useLoaderData<typeof loader>();

  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [shopFilter, setShopFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloading, setDownloading] = useState<string | null>(null);

  const filteredShops = brandFilter === "all"
    ? shops
    : shops.filter((s) => s.brand.toLowerCase() === brandFilter);

  async function downloadReport(reportType: string) {
    setDownloading(reportType);
    try {
      const params = new URLSearchParams({
        type: reportType,
        from: dateFrom,
        to: dateTo,
        shop: shopFilter,
        brand: brandFilter,
        status: statusFilter,
      });
      const response = await fetch(`/admin-panel/reports/export?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "")
        || `report-${reportType}-${dateFrom}-${dateTo}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Chyba pri exporte. Skuste znova.");
    }
    setDownloading(null);
  }

  const inputStyle = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    background: "white",
    color: "#374151",
    outline: "none",
  };

  const cardStyle = {
    background: "white",
    borderRadius: 12,
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb",
    marginBottom: 20,
  };

  const reportBtnStyle = (color: string, isDownloading: boolean) => ({
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 12,
    width: "100%",
    padding: "16px 20px",
    background: isDownloading ? "#f3f4f6" : "white",
    border: `1px solid ${isDownloading ? "#d1d5db" : "#e5e7eb"}`,
    borderRadius: 10,
    cursor: isDownloading ? "wait" as const : "pointer" as const,
    transition: "all 0.15s",
    textAlign: "left" as const,
    opacity: isDownloading ? 0.7 : 1,
  });

  return (
    <div>
      <div className="page-header">
        <h2>Reporty a exporty</h2>
        <p>{totalReturns} vrateni celkom v systeme</p>
      </div>

      {/* Filters */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#374151" }}>Filtre pre export</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>Od</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>Do</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>Znacka</label>
            <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setShopFilter("all"); }} style={inputStyle}>
              <option value="all">Vsetky znacky</option>
              <option value="papilora">Papilora</option>
              <option value="artmie">Artmie</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>Obchod</label>
            <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} style={inputStyle}>
              <option value="all">Vsetky obchody</option>
              {filteredShops.map((s) => (
                <option key={s.shop} value={s.shop}>{s.name} ({s.count})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, fontWeight: 500 }}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
              <option value="all">Vsetky statusy</option>
              {statuses.map((s) => (
                <option key={s.status} value={s.status}>{STATUS_LABELS[s.status] || s.status} ({s.count})</option>
              ))}
            </select>
          </div>

          {/* Quick date buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "end", paddingBottom: 1 }}>
            <button
              type="button"
              onClick={() => { setDateFrom(firstOfMonth); setDateTo(today); }}
              style={{ ...inputStyle, cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6366f1", borderColor: "#c7d2fe", background: "#eef2ff" }}
            >Tento mesiac</button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setMonth(d.getMonth() - 1);
                const prevFirst = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
                const prevLast = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
                setDateFrom(prevFirst);
                setDateTo(prevLast);
              }}
              style={{ ...inputStyle, cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6366f1", borderColor: "#c7d2fe", background: "#eef2ff" }}
            >Minuly mesiac</button>
            <button
              type="button"
              onClick={() => {
                const year = new Date().getFullYear();
                setDateFrom(`${year}-01-01`);
                setDateTo(today);
              }}
              style={{ ...inputStyle, cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6366f1", borderColor: "#c7d2fe", background: "#eef2ff" }}
            >Tento rok</button>
            <button
              type="button"
              onClick={() => { setDateFrom(dateRange.from || "2020-01-01"); setDateTo(today); }}
              style={{ ...inputStyle, cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6366f1", borderColor: "#c7d2fe", background: "#eef2ff" }}
            >Vsetko</button>
          </div>
        </div>
      </div>

      {/* Reports grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* 1. All returns export */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("all-returns")}
            disabled={downloading !== null}
            style={reportBtnStyle("#22c55e", downloading === "all-returns")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#22c55e"; e.currentTarget.style.background = "#f0fdf4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              📋
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "all-returns" ? "Exportujem..." : "Vsetky vratenia"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Kompletny zoznam so vsetkymi udajmi - objednavka, zakaznik, produkty, dovody, IBAN, sumy, statusy
              </div>
              <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

        {/* 2. Accounting report */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("accounting")}
            disabled={downloading !== null}
            style={reportBtnStyle("#8b5cf6", downloading === "accounting")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#8b5cf6"; e.currentTarget.style.background = "#f5f3ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              💰
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "accounting" ? "Exportujem..." : "Uctovny report"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Dobropisy, refundovane sumy, IBAN-y, cisla reklamacii - pre uctovnictvo
              </div>
              <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

        {/* 3. Products report */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("products")}
            disabled={downloading !== null}
            style={reportBtnStyle("#f59e0b", downloading === "products")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.background = "#fffbeb"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              📦
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "products" ? "Exportujem..." : "Najvracanejsie produkty"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Produkty zoradene podla poctu vrateni, dovody, sumy - identifikacia problematickych produktov
              </div>
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

        {/* 4. Reasons report */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("reasons")}
            disabled={downloading !== null}
            style={reportBtnStyle("#3b82f6", downloading === "reasons")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.background = "#eff6ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              📊
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "reasons" ? "Exportujem..." : "Dovody vrateni"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Statistika dovodov - reklamacie, vratenia, vymeny per obchod / znacka
              </div>
              <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

        {/* 5. Monthly summary */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("monthly")}
            disabled={downloading !== null}
            style={reportBtnStyle("#10b981", downloading === "monthly")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.background = "#ecfdf5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              📅
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "monthly" ? "Exportujem..." : "Mesacny prehlad"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Pocty a sumy per mesiac per obchod - trend vrateni v case
              </div>
              <div style={{ fontSize: 11, color: "#10b981", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

        {/* 6. Customers report */}
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => downloadReport("customers")}
            disabled={downloading !== null}
            style={reportBtnStyle("#ec4899", downloading === "customers")}
            onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.borderColor = "#ec4899"; e.currentTarget.style.background = "#fdf2f8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fce7f3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              👥
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>
                {downloading === "customers" ? "Exportujem..." : "Zakaznici"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Zakaznici s najvacsim poctom vrateni - identifikacia opakovanych returnerov
              </div>
              <div style={{ fontSize: 11, color: "#ec4899", marginTop: 4, fontWeight: 600 }}>CSV</div>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
