import type { LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, Link, useLoaderData, useLocation } from "@remix-run/react";
import { adminSessionCookie } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookieHeader = request.headers.get("Cookie");
  const session = await adminSessionCookie.parse(cookieHeader);
  const isAuthenticated = session?.authenticated === true;

  let counts = { pending: 0, claims: 0, returns: 0, exchanges: 0 };

  if (isAuthenticated) {
    try {
      counts.pending = await prisma.returnRequest.count({ where: { status: "pending" } });
      // Count by type from line items
      const allReturns = await prisma.returnRequest.findMany({
        where: { status: { notIn: ["finished", "cancelled", "closed"] } },
        include: { lineItems: { select: { customerNote: true } } },
      });
      for (const r of allReturns) {
        for (const li of r.lineItems) {
          const note = (li.customerNote?.split("\n")[0] || "").toLowerCase();
          if (note.startsWith("reklamácia") || note.includes("defective") || note.includes("damaged") || note.includes("wrong") || note.includes("missing")) { counts.claims++; break; }
          if (note.startsWith("vrátenie") || note.includes("does not fit") || note.includes("changed mind") || note.includes("not as described")) { counts.returns++; break; }
          if (note.startsWith("výmena") || note.includes("exchange")) { counts.exchanges++; break; }
        }
      }
    } catch (e) { /* ignore if DB not ready */ }
  }

  return json({ isAuthenticated, counts });
};

export default function AdminPanelLayout() {
  const { isAuthenticated, counts } = useLoaderData<typeof loader>();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: adminStyles }} />
        <Outlet />
      </>
    );
  }

  const navItems = [
    { label: "Dashboard", path: "/admin-panel/dashboard", icon: "\u{1F4CA}" },
    { label: "Vratenia", path: "/admin-panel/returns", icon: "\u{1F4E6}" },
    { label: "Reporty", path: "/admin-panel/reports", icon: "\u{1F4C4}" },
    { label: "Obchody", path: "/admin-panel/stores", icon: "\u{1F3EA}" },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: adminStyles }} />
      <div className="admin-layout">
        {/* Sidebar */}
        <aside className="admin-sidebar">
          <div className="sidebar-header">
            <h1>Returns Manager</h1>
            <p>Central Admin Panel</p>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${location.pathname.startsWith(item.path) ? "active" : ""}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.path === "/admin-panel/returns" && counts.pending > 0 && (
                  <span style={{ marginLeft: "auto", background: "#ef4444", color: "white", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                    {counts.pending}
                  </span>
                )}
              </Link>
            ))}

            {/* Typ vrátení s počtami */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ padding: "4px 16px", fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                Na riešenie
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 10px" }}>
                <Link to="/admin-panel/returns?type=claim" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderRadius: 6, background: counts.claims > 0 ? "rgba(239,68,68,0.15)" : "transparent", textDecoration: "none", transition: "background 0.15s" }}>
                  <span style={{ fontSize: 13, color: counts.claims > 0 ? "#fca5a5" : "rgba(255,255,255,0.4)" }}>Reklamácie</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: counts.claims > 0 ? "#fca5a5" : "rgba(255,255,255,0.3)" }}>{counts.claims}</span>
                </Link>
                <Link to="/admin-panel/returns?type=return" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderRadius: 6, background: counts.returns > 0 ? "rgba(59,130,246,0.15)" : "transparent", textDecoration: "none", transition: "background 0.15s" }}>
                  <span style={{ fontSize: 13, color: counts.returns > 0 ? "#93c5fd" : "rgba(255,255,255,0.4)" }}>Vrátenia</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: counts.returns > 0 ? "#93c5fd" : "rgba(255,255,255,0.3)" }}>{counts.returns}</span>
                </Link>
                <Link to="/admin-panel/returns?type=exchange" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderRadius: 6, background: counts.exchanges > 0 ? "rgba(234,179,8,0.15)" : "transparent", textDecoration: "none", transition: "background 0.15s" }}>
                  <span style={{ fontSize: 13, color: counts.exchanges > 0 ? "#fde047" : "rgba(255,255,255,0.4)" }}>Výmeny</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: counts.exchanges > 0 ? "#fde047" : "rgba(255,255,255,0.3)" }}>{counts.exchanges}</span>
                </Link>
              </div>
            </div>
          </nav>
          <div className="sidebar-footer">
            <form method="post" action="/admin-panel/logout">
              <button type="submit" className="logout-btn">
                Odhlasit sa
              </button>
            </form>
          </div>
        </aside>

        {/* Main Content */}
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}

const adminStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f6f6f7;
    color: #1a1a1a;
  }

  .admin-layout {
    display: flex;
    min-height: 100vh;
  }

  .admin-sidebar {
    width: 260px;
    background: #1a1a2e;
    color: white;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
  }

  .sidebar-header {
    padding: 24px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }

  .sidebar-header h1 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .sidebar-header p {
    font-size: 12px;
    color: rgba(255,255,255,0.6);
  }

  .sidebar-nav {
    flex: 1;
    padding: 12px 10px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: rgba(255,255,255,0.7);
    text-decoration: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.15s;
    margin-bottom: 2px;
  }

  .nav-item:hover {
    background: rgba(255,255,255,0.08);
    color: white;
  }

  .nav-item.active {
    background: rgba(255,255,255,0.15);
    color: white;
  }

  .nav-icon { font-size: 18px; }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .logout-btn {
    width: 100%;
    padding: 10px;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.7);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
  }

  .logout-btn:hover {
    background: rgba(255,255,255,0.15);
    color: white;
  }

  .admin-main {
    flex: 1;
    margin-left: 260px;
    padding: 32px;
    min-height: 100vh;
  }

  /* Dashboard Styles */
  .page-header {
    margin-bottom: 32px;
  }

  .page-header h2 {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
  }

  .page-header p {
    font-size: 14px;
    color: #6b7280;
    margin-top: 4px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
  }

  .stat-card .stat-label {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .stat-card .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1;
  }

  .stat-card .stat-sub {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 6px;
  }

  .stat-card.pending { border-left: 4px solid #f59e0b; }
  .stat-card.approved { border-left: 4px solid #3b82f6; }
  .stat-card.transit { border-left: 4px solid #8b5cf6; }
  .stat-card.received { border-left: 4px solid #10b981; }
  .stat-card.refunded { border-left: 4px solid #06b6d4; }
  .stat-card.rejected { border-left: 4px solid #ef4444; }
  .stat-card.total { border-left: 4px solid #1a1a2e; }

  /* Filter bar */
  .filter-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-select {
    padding: 8px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    color: #374151;
    cursor: pointer;
    outline: none;
  }

  .filter-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
  }

  /* Table */
  .data-table {
    width: 100%;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .data-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th {
    background: #f9fafb;
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb;
  }

  .data-table td {
    padding: 12px 16px;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .data-table tr:hover td {
    background: #f9fafb;
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  /* Status badges */
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-approved { background: #dbeafe; color: #1e40af; }
  .badge-in_transit { background: #ede9fe; color: #5b21b6; }
  .badge-received { background: #d1fae5; color: #065f46; }
  .badge-refunded { background: #cffafe; color: #155e75; }
  .badge-rejected { background: #fee2e2; color: #991b1b; }
  .badge-closed { background: #f3f4f6; color: #374151; }
  .badge-finished { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .badge-cancelled { background: #f3f4f6; color: #6b7280; }

  .store-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .store-papilora { background: #fce7f3; color: #9d174d; }
  .store-artmie { background: #e0e7ff; color: #3730a3; }
  .store-other { background: #f3f4f6; color: #374151; }

  /* Cards */
  .card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .card-header h3 {
    font-size: 16px;
    font-weight: 600;
  }

  /* Store breakdown grid */
  .store-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .store-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    transition: all 0.15s;
  }

  .store-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    transform: translateY(-1px);
  }

  .store-card .store-name {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .store-card .store-domain {
    font-size: 12px;
    color: #9ca3af;
    margin-bottom: 12px;
  }

  .store-card .store-stats {
    display: flex;
    gap: 16px;
  }

  .store-card .store-stat {
    text-align: center;
  }

  .store-card .store-stat-value {
    font-size: 20px;
    font-weight: 700;
  }

  .store-card .store-stat-label {
    font-size: 11px;
    color: #6b7280;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
  }

  .empty-state h3 {
    font-size: 18px;
    margin-bottom: 8px;
    color: #374151;
  }

  /* Login page */
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }

  .login-card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }

  .login-card h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    text-align: center;
  }

  .login-card p {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    margin-bottom: 32px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
  }

  .form-group input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: all 0.15s;
  }

  .form-group input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
  }

  .login-btn {
    width: 100%;
    padding: 12px;
    background: #1a1a2e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .login-btn:hover {
    background: #16213e;
  }

  .login-error {
    background: #fee2e2;
    color: #991b1b;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .admin-sidebar {
      width: 100%;
      position: relative;
      flex-direction: row;
      align-items: center;
      padding: 8px;
    }
    .sidebar-header { display: none; }
    .sidebar-footer { display: none; }
    .sidebar-nav { display: flex; gap: 4px; padding: 0; }
    .nav-item { padding: 8px 12px; font-size: 12px; }
    .admin-main { margin-left: 0; padding: 16px; }
    .admin-layout { flex-direction: column; }
  }
`;
