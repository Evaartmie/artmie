import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import { requireAdminAuth, getStoreName, getStoreBrand, STORE_NAMES } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const url = new URL(request.url);
  const shopFilter = url.searchParams.get("shop") || "all";
  const statusFilter = url.searchParams.get("status") || "all";
  const brandFilter = url.searchParams.get("brand") || "all";
  const page = parseInt(url.searchParams.get("page") || "1");
  const perPage = 50;

  // Build where clause
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

  // Get total count
  const totalCount = await prisma.returnRequest.count({ where });

  // Get returns with pagination
  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
    include: {
      lineItems: true,
    },
  });

  // Get unique shops for filter dropdown
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

  // Get status counts for filter
  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    where: shopFilter !== "all" ? { shop: shopFilter } : undefined,
    _count: { status: true },
  });

  const statuses = statusCounts.map((s) => ({
    status: s.status,
    count: s._count.status,
  }));

  const totalPages = Math.ceil(totalCount / perPage);

  return json({
    returns: returns.map((r) => ({
      ...r,
      storeName: getStoreName(r.shop),
      storeBrand: getStoreBrand(r.shop),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      itemCount: r.lineItems.length,
    })),
    shops,
    statuses,
    totalCount,
    totalPages,
    currentPage: page,
    filters: { shop: shopFilter, status: statusFilter, brand: brandFilter },
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

export default function AdminReturns() {
  const { returns, shops, statuses, totalCount, totalPages, currentPage, filters } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page"); // Reset page on filter change
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

      {/* Filters */}
      <div className="filter-bar">
        <select
          className="filter-select"
          value={filters.brand}
          onChange={(e) => updateFilter("brand", e.target.value)}
        >
          <option value="all">Všetky značky</option>
          <option value="papilora">Papilora</option>
          <option value="artmie">Artmie</option>
        </select>

        <select
          className="filter-select"
          value={filters.shop}
          onChange={(e) => updateFilter("shop", e.target.value)}
        >
          <option value="all">Všetky obchody ({totalCount})</option>
          {shops.map((s) => (
            <option key={s.shop} value={s.shop}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
        >
          <option value="all">Všetky statusy</option>
          {statuses.map((s) => (
            <option key={s.status} value={s.status}>
              {STATUS_LABELS[s.status] || s.status} ({s.count})
            </option>
          ))}
        </select>
      </div>

      {/* Returns Table */}
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
                  <th>Produkty</th>
                  <th>Dátum</th>
                  <th>Suma</th>
                  <th>Status</th>
                  <th>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr key={ret.id} onClick={() => navigate(`/admin-panel/returns/${ret.id}`)} style={{ cursor: "pointer" }} className="clickable-row">
                    <td>
                      <span className={`store-badge store-${ret.storeBrand.toLowerCase()}`}>
                        {ret.storeName}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{ret.shopifyOrderName}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{ret.customerName}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{ret.customerEmail}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13 }}>
                        {ret.itemCount} {ret.itemCount === 1 ? "položka" : ret.itemCount < 5 ? "položky" : "položiek"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(ret.createdAt).toLocaleDateString("sk-SK")}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {ret.totalRefundAmount
                        ? `${ret.totalRefundAmount.toFixed(2)} ${ret.currency || ""}`
                        : "—"}
                    </td>
                    <td>
                      <span className={`badge badge-${ret.status}`}>
                        {STATUS_LABELS[ret.status] || ret.status}
                      </span>
                    </td>
                    <td>
                      {ret.trackingNumber ? (
                        ret.trackingUrl ? (
                          <a
                            href={ret.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#6366f1", fontSize: 13 }}
                          >
                            {ret.trackingNumber}
                          </a>
                        ) : (
                          <span style={{ fontSize: 13 }}>{ret.trackingNumber}</span>
                        )
                      ) : (
                        <span style={{ color: "#d1d5db" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
              <button
                className="filter-select"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                style={{ cursor: currentPage <= 1 ? "not-allowed" : "pointer", opacity: currentPage <= 1 ? 0.5 : 1 }}
              >
                Predošlá
              </button>
              <span style={{ padding: "8px 14px", fontSize: 14, color: "#6b7280" }}>
                Strana {currentPage} z {totalPages}
              </span>
              <button
                className="filter-select"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                style={{ cursor: currentPage >= totalPages ? "not-allowed" : "pointer", opacity: currentPage >= totalPages ? 0.5 : 1 }}
              >
                Ďalšia
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
