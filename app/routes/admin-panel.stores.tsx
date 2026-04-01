import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth, getStoreName, getStoreBrand, STORE_NAMES } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  // Get all store data
  const storeBreakdown = await prisma.returnRequest.groupBy({
    by: ["shop"],
    _count: { id: true },
    _sum: { totalRefundAmount: true },
  });

  // Status breakdown per store
  const statusByStore = await prisma.returnRequest.groupBy({
    by: ["shop", "status"],
    _count: { id: true },
  });

  // Monthly counts per store
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyByStore = await prisma.returnRequest.groupBy({
    by: ["shop"],
    where: { createdAt: { gte: startOfMonth } },
    _count: { id: true },
  });

  const monthlyMap: Record<string, number> = {};
  monthlyByStore.forEach((s) => {
    monthlyMap[s.shop] = s._count.id;
  });

  // Build status maps per store
  const statusMap: Record<string, Record<string, number>> = {};
  statusByStore.forEach((s) => {
    if (!statusMap[s.shop]) statusMap[s.shop] = {};
    statusMap[s.shop][s.status] = s._count.id;
  });

  // Get installed stores (from sessions)
  const sessions = await prisma.session.findMany({
    select: { shop: true },
    distinct: ["shop"],
  });

  const installedShops = new Set(sessions.map((s) => s.shop));

  // Build store list - include all known stores
  const allShops = new Set([
    ...Object.keys(STORE_NAMES),
    ...storeBreakdown.map((s) => s.shop),
    ...sessions.map((s) => s.shop),
  ]);

  const stores = Array.from(allShops).map((shop) => {
    const breakdown = storeBreakdown.find((s) => s.shop === shop);
    return {
      shop,
      name: getStoreName(shop),
      brand: getStoreBrand(shop),
      installed: installedShops.has(shop),
      totalReturns: breakdown?._count.id || 0,
      totalRefundAmount: breakdown?._sum.totalRefundAmount || 0,
      monthlyReturns: monthlyMap[shop] || 0,
      pending: statusMap[shop]?.pending || 0,
      approved: statusMap[shop]?.approved || 0,
      in_transit: statusMap[shop]?.in_transit || 0,
      received: statusMap[shop]?.received || 0,
      refunded: statusMap[shop]?.refunded || 0,
      rejected: statusMap[shop]?.rejected || 0,
    };
  });

  // Sort: installed first, then by brand, then by name
  stores.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return a.name.localeCompare(b.name);
  });

  // Summary by brand
  const papilora = stores.filter((s) => s.brand === "Papilora");
  const artmie = stores.filter((s) => s.brand === "Artmie");

  const summary = {
    papilora: {
      total: papilora.reduce((sum, s) => sum + s.totalReturns, 0),
      pending: papilora.reduce((sum, s) => sum + s.pending, 0),
      installed: papilora.filter((s) => s.installed).length,
      storeCount: papilora.length,
    },
    artmie: {
      total: artmie.reduce((sum, s) => sum + s.totalReturns, 0),
      pending: artmie.reduce((sum, s) => sum + s.pending, 0),
      installed: artmie.filter((s) => s.installed).length,
      storeCount: artmie.length,
    },
  };

  return json({ stores, summary });
};

export default function AdminStores() {
  const { stores, summary } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="page-header">
        <h2>Prehľad obchodov</h2>
        <p>Stav všetkých {stores.length} obchodov</p>
      </div>

      {/* Brand Summary */}
      <div className="stats-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card" style={{ borderLeft: "4px solid #9d174d" }}>
          <div className="stat-label">Papilora</div>
          <div className="stat-value">{summary.papilora.total}</div>
          <div className="stat-sub">
            {summary.papilora.installed}/{summary.papilora.storeCount} nainštalovaných
            {summary.papilora.pending > 0 && ` · ${summary.papilora.pending} čakajúcich`}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #3730a3" }}>
          <div className="stat-label">Artmie</div>
          <div className="stat-value">{summary.artmie.total}</div>
          <div className="stat-sub">
            {summary.artmie.installed}/{summary.artmie.storeCount} nainštalovaných
            {summary.artmie.pending > 0 && ` · ${summary.artmie.pending} čakajúcich`}
          </div>
        </div>
      </div>

      {/* Stores Table */}
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Obchod</th>
              <th>Značka</th>
              <th>Stav</th>
              <th>Celkom</th>
              <th>Čakajúce</th>
              <th>Schválené</th>
              <th>V preprave</th>
              <th>Refundované</th>
              <th>Tento mesiac</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.shop}>
                <td>
                  <div style={{ fontWeight: 600 }}>{store.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{store.shop}</div>
                </td>
                <td>
                  <span className={`store-badge store-${store.brand.toLowerCase()}`}>
                    {store.brand}
                  </span>
                </td>
                <td>
                  {store.installed ? (
                    <span style={{ color: "#10b981", fontWeight: 600, fontSize: 13 }}>
                      Nainštalovaná
                    </span>
                  ) : (
                    <span style={{ color: "#d1d5db", fontSize: 13 }}>
                      Nenainštalovaná
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{store.totalReturns}</td>
                <td>
                  <span style={{ color: store.pending > 0 ? "#f59e0b" : "#d1d5db", fontWeight: store.pending > 0 ? 600 : 400 }}>
                    {store.pending}
                  </span>
                </td>
                <td>{store.approved}</td>
                <td>{store.in_transit}</td>
                <td>{store.refunded}</td>
                <td>{store.monthlyReturns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
