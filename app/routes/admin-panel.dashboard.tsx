import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdminAuth, getStoreName, getStoreBrand } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  // Get all status counts across all stores
  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const counts: Record<string, number> = {};
  let totalReturns = 0;
  statusCounts.forEach((s) => {
    counts[s.status] = s._count.status;
    totalReturns += s._count.status;
  });

  // Get this month's count
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyCount = await prisma.returnRequest.count({
    where: { createdAt: { gte: startOfMonth } },
  });

  // Get last month's count for comparison
  const startOfLastMonth = new Date(startOfMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

  const lastMonthCount = await prisma.returnRequest.count({
    where: {
      createdAt: { gte: startOfLastMonth, lt: startOfMonth },
    },
  });

  // Get per-store breakdown
  const storeBreakdown = await prisma.returnRequest.groupBy({
    by: ["shop"],
    _count: { id: true },
    _sum: { totalRefundAmount: true },
  });

  // Get per-store pending counts
  const pendingByStore = await prisma.returnRequest.groupBy({
    by: ["shop"],
    where: { status: "pending" },
    _count: { id: true },
  });

  const pendingMap: Record<string, number> = {};
  pendingByStore.forEach((s) => {
    pendingMap[s.shop] = s._count.id;
  });

  // Get per-store monthly counts
  const monthlyByStore = await prisma.returnRequest.groupBy({
    by: ["shop"],
    where: { createdAt: { gte: startOfMonth } },
    _count: { id: true },
  });

  const monthlyMap: Record<string, number> = {};
  monthlyByStore.forEach((s) => {
    monthlyMap[s.shop] = s._count.id;
  });

  const stores = storeBreakdown.map((store) => ({
    shop: store.shop,
    name: getStoreName(store.shop),
    brand: getStoreBrand(store.shop),
    totalReturns: store._count.id,
    totalRefundAmount: store._sum.totalRefundAmount || 0,
    pendingReturns: pendingMap[store.shop] || 0,
    monthlyReturns: monthlyMap[store.shop] || 0,
  }));

  // Sort by total returns descending
  stores.sort((a, b) => b.totalReturns - a.totalReturns);

  // Get 15 most recent returns across all stores
  const recentReturns = await prisma.returnRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    include: {
      lineItems: true,
    },
  });

  // Get total refund amount
  const totalRefund = await prisma.returnRequest.aggregate({
    _sum: { totalRefundAmount: true },
  });

  return json({
    counts,
    totalReturns,
    monthlyCount,
    lastMonthCount,
    stores,
    recentReturns: recentReturns.map((r) => ({
      ...r,
      storeName: getStoreName(r.shop),
      storeBrand: getStoreBrand(r.shop),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    totalRefundAmount: totalRefund._sum.totalRefundAmount || 0,
  });
};

export default function AdminDashboard() {
  const {
    counts,
    totalReturns,
    monthlyCount,
    lastMonthCount,
    stores,
    recentReturns,
    totalRefundAmount,
  } = useLoaderData<typeof loader>();

  const monthChange = lastMonthCount > 0
    ? Math.round(((monthlyCount - lastMonthCount) / lastMonthCount) * 100)
    : 0;

  return (
    <div>
      <div className="page-header">
        <h2>Central Dashboard</h2>
        <p>Prehľad všetkých obchodov a vratení</p>
      </div>

      {/* Main Stats */}
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-label">Celkovo vratení</div>
          <div className="stat-value">{totalReturns}</div>
          <div className="stat-sub">zo všetkých obchodov</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-label">Čakajúce</div>
          <div className="stat-value">{counts.pending || 0}</div>
          <div className="stat-sub">vyžadujú pozornosť</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-label">Tento mesiac</div>
          <div className="stat-value">{monthlyCount}</div>
          <div className="stat-sub">
            {monthChange > 0 ? `+${monthChange}%` : monthChange < 0 ? `${monthChange}%` : "—"} oproti minulému
          </div>
        </div>
        <div className="stat-card refunded">
          <div className="stat-label">Celkom refundované</div>
          <div className="stat-value">
            {totalRefundAmount > 0 ? `${totalRefundAmount.toFixed(0)}` : "0"}
          </div>
          <div className="stat-sub">celková suma</div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="stats-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card approved">
          <div className="stat-label">Schválené</div>
          <div className="stat-value">{counts.approved || 0}</div>
        </div>
        <div className="stat-card transit">
          <div className="stat-label">V preprave</div>
          <div className="stat-value">{counts.in_transit || 0}</div>
        </div>
        <div className="stat-card received">
          <div className="stat-label">Prijaté</div>
          <div className="stat-value">{counts.received || 0}</div>
        </div>
        <div className="stat-card refunded">
          <div className="stat-label">Refundované</div>
          <div className="stat-value">{counts.refunded || 0}</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-label">Zamietnuté</div>
          <div className="stat-value">{counts.rejected || 0}</div>
        </div>
      </div>

      {/* Store Breakdown */}
      <div className="card">
        <div className="card-header">
          <h3>Obchody - prehľad</h3>
          <Link to="/admin-panel/stores" style={{ fontSize: 14, color: "#6366f1" }}>
            Zobraziť všetky
          </Link>
        </div>
        {stores.length === 0 ? (
          <div className="empty-state">
            <h3>Žiadne obchody</h3>
            <p>Po inštalácii appky na obchody sa tu zobrazia dáta.</p>
          </div>
        ) : (
          <div className="store-grid">
            {stores.map((store) => (
              <div key={store.shop} className="store-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div className="store-name">{store.name}</div>
                    <div className="store-domain">{store.shop}</div>
                  </div>
                  <span className={`store-badge store-${store.brand.toLowerCase()}`}>
                    {store.brand}
                  </span>
                </div>
                <div className="store-stats">
                  <div className="store-stat">
                    <div className="store-stat-value">{store.totalReturns}</div>
                    <div className="store-stat-label">Celkom</div>
                  </div>
                  <div className="store-stat">
                    <div className="store-stat-value" style={{ color: store.pendingReturns > 0 ? "#f59e0b" : "#10b981" }}>
                      {store.pendingReturns}
                    </div>
                    <div className="store-stat-label">Čakajúce</div>
                  </div>
                  <div className="store-stat">
                    <div className="store-stat-value">{store.monthlyReturns}</div>
                    <div className="store-stat-label">Tento mesiac</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Returns */}
      <div className="card">
        <div className="card-header">
          <h3>Posledné vratenia</h3>
          <Link to="/admin-panel/returns" style={{ fontSize: 14, color: "#6366f1" }}>
            Zobraziť všetky
          </Link>
        </div>
        {recentReturns.length === 0 ? (
          <div className="empty-state">
            <h3>Žiadne vratenia</h3>
            <p>Keď zákazníci požiadajú o vrátenie, zobrazia sa tu.</p>
          </div>
        ) : (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Obchod</th>
                  <th>Objednávka</th>
                  <th>Zákazník</th>
                  <th>Dátum</th>
                  <th>Suma</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentReturns.map((ret) => (
                  <tr key={ret.id}>
                    <td>
                      <span className={`store-badge store-${ret.storeBrand.toLowerCase()}`}>
                        {ret.storeName}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{ret.shopifyOrderName}</td>
                    <td>
                      <div>{ret.customerName}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{ret.customerEmail}</div>
                    </td>
                    <td>{new Date(ret.createdAt).toLocaleDateString("sk-SK")}</td>
                    <td>
                      {ret.totalRefundAmount
                        ? `${ret.totalRefundAmount.toFixed(2)} ${ret.currency || ""}`
                        : "—"}
                    </td>
                    <td>
                      <span className={`badge badge-${ret.status}`}>
                        {ret.status === "pending" && "Čakajúce"}
                        {ret.status === "approved" && "Schválené"}
                        {ret.status === "rejected" && "Zamietnuté"}
                        {ret.status === "in_transit" && "V preprave"}
                        {ret.status === "received" && "Prijaté"}
                        {ret.status === "refunded" && "Refundované"}
                        {ret.status === "closed" && "Uzavreté"}
                        {ret.status === "cancelled" && "Zrušené"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
