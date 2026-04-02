import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useRef, useEffect } from "react";
import { requireAdminAuth, getStoreName, getStoreBrand, STORE_NAMES } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

// Reason code → label mapping (same as in returns portal)
const REASON_LABELS: Record<string, string> = {
  "Reklamácia: Nesprávny produkt": "Nesprávny produkt",
  "Reklamácia: Chýbajúci produkt": "Chýbajúci produkt",
  "Reklamácia: Poškodený produkt": "Poškodený produkt",
  "Reklamácia: Nekvalitný produkt": "Nekvalitný produkt",
  "Vrátenie: Odstúpenie do 14 dní": "Odstúpenie 14 dní",
  "Vrátenie: Do 30 dní": "Vrátenie 30 dní",
  "Vrátenie: Do 100 dní": "Vrátenie 100 dní",
  "Výmena tovaru": "Výmena tovaru",
};

const REASON_CATEGORIES: Record<string, string[]> = {
  "Reklamácia": [
    "Reklamácia: Nesprávny produkt",
    "Reklamácia: Chýbajúci produkt",
    "Reklamácia: Poškodený produkt",
    "Reklamácia: Nekvalitný produkt",
  ],
  "Vrátenie": [
    "Vrátenie: Odstúpenie do 14 dní",
    "Vrátenie: Do 30 dní",
    "Vrátenie: Do 100 dní",
  ],
  "Výmena": [
    "Výmena tovaru",
  ],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const url = new URL(request.url);
  const shopFilter = url.searchParams.get("shop") || "all";
  const statusFilter = url.searchParams.get("status") || "all";
  const brandFilter = url.searchParams.get("brand") || "all";
  const reasonFilter = url.searchParams.get("reasons") || "all"; // comma-separated reason keys
  const page = parseInt(url.searchParams.get("page") || "1");
  const perPage = 50;

  const where: any = {};

  if (shopFilter !== "all") {
    where.shop = shopFilter;
  }

  if (brandFilter !== "all") {
    const brandShops = Object.keys(STORE_NAMES).filter((shop) => {
      const name = STORE_NAMES[shop];
      if (brandFilter === "papilora") return name.startsWith("Papilora");
      if (brandFilter === "artmie") return name.startsWith("Artmie");
      return false;
    });
    if (brandShops.length > 0) {
      where.shop = { in: brandShops };
    }
  }

  if (statusFilter !== "all") {
    where.status = statusFilter;
  }

  // Reason filter - filter returns that have lineItems with matching customerNote prefix
  const selectedReasons = reasonFilter !== "all" ? reasonFilter.split(",") : [];
  if (selectedReasons.length > 0) {
    where.lineItems = {
      some: {
        OR: selectedReasons.map((r: string) => ({
          customerNote: { startsWith: r },
        })),
      },
    };
  }

  const totalCount = await prisma.returnRequest.count({ where });

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
    include: {
      lineItems: { include: { reason: true } },
    },
  });

  const uniqueShops = await prisma.returnRequest.groupBy({
    by: ["shop"],
    _count: { id: true },
  });

  const shops = uniqueShops.map((s) => ({
    shop: s.shop,
    name: getStoreName(s.shop),
    brand: getStoreBrand(s.shop),
    count: s._count.id,
  }));

  shops.sort((a, b) => a.name.localeCompare(b.name));

  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    where: shopFilter !== "all" ? { shop: shopFilter } : undefined,
    _count: { status: true },
  });

  const statuses = statusCounts.map((s) => ({
    status: s.status,
    count: s._count.status,
  }));

  // Collect unique reasons from all line items
  const allLineItems = await prisma.returnLineItem.findMany({
    select: { customerNote: true },
    where: { customerNote: { not: null } },
    distinct: ["customerNote"],
  });
  const uniqueReasons: { reason: string; label: string }[] = [];
  const seenReasons = new Set<string>();
  for (const li of allLineItems) {
    const firstLine = li.customerNote?.split("\n")[0] || "";
    if (firstLine && !seenReasons.has(firstLine)) {
      seenReasons.add(firstLine);
      uniqueReasons.push({ reason: firstLine, label: REASON_LABELS[firstLine] || firstLine });
    }
  }

  const totalPages = Math.ceil(totalCount / perPage);

  return json({
    returns: returns.map((r) => ({
      ...r,
      storeName: getStoreName(r.shop),
      storeBrand: getStoreBrand(r.shop),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      itemCount: r.lineItems.length,
      productNames: r.lineItems.map(li => li.productTitle).join(", "),
      reasons: [...new Set(r.lineItems.map(li => li.reason?.label || li.customerNote?.split("\n")[0] || "").filter(Boolean))].join(", "),
    })),
    shops,
    statuses,
    uniqueReasons,
    totalCount,
    totalPages,
    currentPage: page,
    filters: { shop: shopFilter, status: statusFilter, brand: brandFilter, reasons: reasonFilter },
  });
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Čakajúce",
  approved: "Schválené",
  rejected: "Zamietnuté",
  in_transit: "V preprave",
  received: "Prijaté",
  refunded: "Refundované",
  closed: "Uzavreté",
  cancelled: "Zrušené",
};

export default function AdminReturnsList() {
  const { returns, shops, statuses, uniqueReasons, totalCount, totalPages, currentPage, filters } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [reasonDropdownOpen, setReasonDropdownOpen] = useState(false);
  const reasonDropdownRef = useRef<HTMLDivElement>(null);

  const selectedReasons = filters.reasons !== "all" ? filters.reasons.split(",") : [];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (reasonDropdownRef.current && !reasonDropdownRef.current.contains(e.target as Node)) {
        setReasonDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    navigate(`/admin-panel/returns?${params.toString()}`);
  }

  function toggleReason(reason: string) {
    const current = new Set(selectedReasons);
    if (current.has(reason)) {
      current.delete(reason);
    } else {
      current.add(reason);
    }
    const params = new URLSearchParams(searchParams);
    if (current.size === 0) {
      params.delete("reasons");
    } else {
      params.set("reasons", Array.from(current).join(","));
    }
    params.delete("page");
    navigate(`/admin-panel/returns?${params.toString()}`);
  }

  function clearReasons() {
    const params = new URLSearchParams(searchParams);
    params.delete("reasons");
    params.delete("page");
    navigate(`/admin-panel/returns?${params.toString()}`);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", page.toString());
    }
    navigate(`/admin-panel/returns?${params.toString()}`);
  }

  return (
    <div>
      <div className="page-header">
        <h2>Všetky vratenia</h2>
        <p>{totalCount} vratení celkom</p>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={filters.brand} onChange={(e) => updateFilter("brand", e.target.value)}>
          <option value="all">Všetky značky</option>
          <option value="papilora">Papilora</option>
          <option value="artmie">Artmie</option>
        </select>
        <select className="filter-select" value={filters.shop} onChange={(e) => updateFilter("shop", e.target.value)}>
          <option value="all">Všetky obchody ({totalCount})</option>
          {shops.map((s) => (
            <option key={s.shop} value={s.shop}>{s.name} ({s.count})</option>
          ))}
        </select>
        <select className="filter-select" value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
          <option value="all">Všetky statusy</option>
          {statuses.map((s) => (
            <option key={s.status} value={s.status}>{STATUS_LABELS[s.status] || s.status} ({s.count})</option>
          ))}
        </select>

        {/* Multi-select reason filter */}
        <div ref={reasonDropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="filter-select"
            onClick={() => setReasonDropdownOpen(!reasonDropdownOpen)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: selectedReasons.length > 0 ? "#eef2ff" : "white",
              borderColor: selectedReasons.length > 0 ? "#6366f1" : "#d1d5db",
              color: selectedReasons.length > 0 ? "#4338ca" : "#374151",
              fontWeight: selectedReasons.length > 0 ? 600 : 400,
            }}
          >
            {selectedReasons.length === 0
              ? "Všetky dôvody"
              : `Dôvody (${selectedReasons.length})`}
            <span style={{ fontSize: 10, marginLeft: 4 }}>{reasonDropdownOpen ? "▲" : "▼"}</span>
          </button>

          {reasonDropdownOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 50,
              background: "white", border: "1px solid #e5e7eb", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 280, maxHeight: 380, overflowY: "auto",
            }}>
              {/* Header */}
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Filtrovať podľa dôvodu</span>
                {selectedReasons.length > 0 && (
                  <button type="button" onClick={clearReasons} style={{ fontSize: 12, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
                    Zrušiť všetky
                  </button>
                )}
              </div>

              {/* Categories with checkboxes */}
              {Object.entries(REASON_CATEGORIES).map(([category, reasons]) => (
                <div key={category}>
                  <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {category}
                  </div>
                  {reasons.map((reason) => {
                    const isSelected = selectedReasons.includes(reason);
                    const matchingFromDB = uniqueReasons.find(r => r.reason === reason);
                    return (
                      <label
                        key={reason}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
                          cursor: "pointer", fontSize: 13, transition: "background 0.1s",
                          background: isSelected ? "#f5f3ff" : "transparent",
                        }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
                        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReason(reason)}
                          style={{ accentColor: "#6366f1", width: 16, height: 16 }}
                        />
                        <span style={{ flex: 1, color: isSelected ? "#4338ca" : "#374151", fontWeight: isSelected ? 500 : 400 }}>
                          {REASON_LABELS[reason] || reason}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}

              {/* Also show any DB reasons not in categories (legacy/old data) */}
              {uniqueReasons.filter(r => !Object.values(REASON_CATEGORIES).flat().includes(r.reason)).length > 0 && (
                <div>
                  <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Ostatné
                  </div>
                  {uniqueReasons
                    .filter(r => !Object.values(REASON_CATEGORIES).flat().includes(r.reason))
                    .map((r) => {
                      const isSelected = selectedReasons.includes(r.reason);
                      return (
                        <label
                          key={r.reason}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
                            cursor: "pointer", fontSize: 13,
                            background: isSelected ? "#f5f3ff" : "transparent",
                          }}
                          onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
                          onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleReason(r.reason)}
                            style={{ accentColor: "#6366f1", width: 16, height: 16 }}
                          />
                          <span style={{ flex: 1, color: isSelected ? "#4338ca" : "#374151", fontWeight: isSelected ? 500 : 400 }}>
                            {r.label}
                          </span>
                        </label>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {returns.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>Žiadne vratenia</h3>
            <p>Pre vybrané filtre neboli nájdené žiadne vratenia.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Obchod</th>
                  <th>Objednávka</th>
                  <th>Zákazník</th>
                  <th>Produkt / Dôvod</th>
                  <th>Dátum</th>
                  <th>Suma</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr key={ret.id} onClick={() => navigate(`/admin-panel/returns/${ret.id}`)} style={{ cursor: "pointer" }}>
                    <td>
                      <span className={`store-badge store-${ret.storeBrand.toLowerCase()}`}>{ret.storeName}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{ret.shopifyOrderName}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{ret.customerName}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{ret.customerEmail}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{ret.productNames.length > 50 ? ret.productNames.substring(0, 47) + "..." : ret.productNames}</div>
                      <div style={{ fontSize: 12, color: "#dc2626" }}>{ret.reasons || "—"}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(ret.createdAt).toLocaleDateString("sk-SK")}</td>
                    <td style={{ fontWeight: 500 }}>
                      {ret.totalRefundAmount ? `${ret.totalRefundAmount.toFixed(2)} ${ret.currency || ""}` : "—"}
                    </td>
                    <td>
                      <span className={`badge badge-${ret.status}`}>{STATUS_LABELS[ret.status] || ret.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button className="filter-select" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} style={{ cursor: currentPage <= 1 ? "not-allowed" : "pointer", opacity: currentPage <= 1 ? 0.5 : 1 }}>Predošlá</button>
              <span style={{ padding: "8px 14px", fontSize: 14, color: "#6b7280" }}>Strana {currentPage} z {totalPages}</span>
              <button className="filter-select" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} style={{ cursor: currentPage >= totalPages ? "not-allowed" : "pointer", opacity: currentPage >= totalPages ? 0.5 : 1 }}>Ďalšia</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
