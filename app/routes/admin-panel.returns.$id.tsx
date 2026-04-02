import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useNavigate } from "@remix-run/react";
import { requireAdminAuth, getStoreName, getStoreBrand } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);
  const { id } = params;

  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      lineItems: { include: { reason: true } },
      photos: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!returnRequest) {
    throw new Response("Return not found", { status: 404 });
  }

  return json({
    ret: {
      ...returnRequest,
      storeName: getStoreName(returnRequest.shop),
      storeBrand: getStoreBrand(returnRequest.shop),
      createdAt: returnRequest.createdAt.toISOString(),
      updatedAt: returnRequest.updatedAt.toISOString(),
      approvedAt: returnRequest.approvedAt?.toISOString() || null,
      rejectedAt: returnRequest.rejectedAt?.toISOString() || null,
      receivedAt: returnRequest.receivedAt?.toISOString() || null,
      refundedAt: returnRequest.refundedAt?.toISOString() || null,
      closedAt: returnRequest.closedAt?.toISOString() || null,
      statusHistory: returnRequest.statusHistory.map(h => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      })),
    },
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await requireAdminAuth(request);
  const { id } = params;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const returnRequest = await prisma.returnRequest.findUnique({ where: { id } });
  if (!returnRequest) return json({ error: "Not found" }, { status: 404 });

  switch (intent) {
    case "approve":
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "approved", approvedAt: new Date() } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "approved", changedBy: "admin-panel", note: "Schválené cez admin panel" } }),
      ]);
      break;
    case "reject": {
      const reason = formData.get("rejectReason") as string || "";
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "rejected", rejectedAt: new Date(), adminNotes: reason || undefined } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "rejected", changedBy: "admin-panel", note: reason || "Zamietnuté cez admin panel" } }),
      ]);
      break;
    }
    case "mark-received":
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "received", receivedAt: new Date() } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "received", changedBy: "admin-panel", note: "Tovar prijatý" } }),
      ]);
      break;
    case "refund": {
      const amount = parseFloat(formData.get("refundAmount") as string || "0");
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "refunded", refundedAt: new Date(), totalRefundAmount: amount || undefined } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "refunded", changedBy: "admin-panel", note: `Refundované: ${amount} ${returnRequest.currency}` } }),
      ]);
      break;
    }
    case "close":
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "closed", closedAt: new Date() } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "closed", changedBy: "admin-panel", note: "Uzavreté" } }),
      ]);
      break;
    case "save-note": {
      const note = formData.get("adminNotes") as string || "";
      await prisma.returnRequest.update({ where: { id }, data: { adminNotes: note } });
      break;
    }
  }

  return redirect(`/admin-panel/returns/${id}`);
};

export default function AdminReturnDetail() {
  const { ret } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const totalValue = ret.lineItems.reduce((sum, li) => sum + li.pricePerItem * li.quantity, 0);
  const canApprove = ret.status === "pending";
  const canReject = ret.status === "pending";
  const canMarkReceived = ret.status === "approved" || ret.status === "in_transit";
  const canRefund = ret.status === "received";
  const canClose = !["closed", "cancelled", "refunded"].includes(ret.status);

  return (
    <div>
      <button onClick={() => navigate("/admin-panel/returns")} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 14, marginBottom: 16, padding: 0 }}>
        ← Späť na zoznam
      </button>

      <div className="page-header">
        <h2>
          Vratenie {ret.shopifyOrderName}
          <span className={`badge badge-${ret.status}`} style={{ marginLeft: 12, verticalAlign: "middle" }}>
            {STATUS_LABELS[ret.status] || ret.status}
          </span>
        </h2>
        <p>
          <span className={`store-badge store-${ret.storeBrand.toLowerCase()}`}>{ret.storeName}</span>
          {" · "}Vytvorené: {new Date(ret.createdAt).toLocaleString("sk-SK")}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 24, alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Zákazník</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Meno</div>
                <div style={{ fontWeight: 600 }}>{ret.customerName}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Email</div>
                <div>{ret.customerEmail}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>IBAN pre vrátenie</div>
                <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 15 }}>
                  {ret.customerIban || <span style={{ color: "#d1d5db" }}>Nezadaný</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Celková hodnota</div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{totalValue.toFixed(2)} {ret.currency}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Produkty ({ret.lineItems.length})</h3>
            {ret.lineItems.map((li) => (
              <div key={li.id} style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{li.productTitle}</div>
                    {li.variantTitle && <div style={{ fontSize: 13, color: "#6b7280" }}>{li.variantTitle}</div>}
                    {li.sku && <div style={{ fontSize: 12, color: "#9ca3af" }}>SKU: {li.sku}</div>}
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#dc2626" }}>
                        Dôvod: {li.reason?.label || "Nezadaný"}
                      </span>
                    </div>
                    {li.customerNote && (
                      <div style={{ marginTop: 4, fontSize: 13, color: "#374151", background: "#f9fafb", padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid #6366f1" }}>
                        {li.customerNote}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>Qty: {li.quantity}</div>
                    <div style={{ fontWeight: 600 }}>{(li.pricePerItem * li.quantity).toFixed(2)} {ret.currency}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {ret.customerNotes && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Poznámka zákazníka</h3>
              <div style={{ background: "#f9fafb", padding: "10px 14px", borderRadius: 8, fontSize: 14, lineHeight: 1.5 }}>
                {ret.customerNotes}
              </div>
            </div>
          )}

          {ret.photos.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Fotky ({ret.photos.length})</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {ret.photos.map((photo) => (
                  <a key={photo.id} href={photo.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                    <img src={photo.fileUrl} alt={photo.fileName} style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }} />
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, textAlign: "center" }}>
                      {photo.fileName} ({photo.fileSize ? `${(photo.fileSize / 1024).toFixed(0)} KB` : ""})
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>História</h3>
            {ret.statusHistory.map((h) => (
              <div key={h.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 140, fontSize: 12, color: "#9ca3af" }}>
                  {new Date(h.createdAt).toLocaleString("sk-SK")}
                </div>
                <div>
                  {h.fromStatus && (
                    <><span className={`badge badge-${h.fromStatus}`} style={{ fontSize: 11 }}>{STATUS_LABELS[h.fromStatus] || h.fromStatus}</span>{" → "}</>
                  )}
                  <span className={`badge badge-${h.toStatus}`} style={{ fontSize: 11 }}>{STATUS_LABELS[h.toStatus] || h.toStatus}</span>
                  {h.note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{h.note}</div>}
                  {h.changedBy && <div style={{ fontSize: 11, color: "#9ca3af" }}>{h.changedBy}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Akcie</h3>
            {canApprove && (
              <Form method="post" style={{ marginBottom: 8 }}>
                <input type="hidden" name="intent" value="approve" />
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#22c55e", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>✓ Schváliť</button>
              </Form>
            )}
            {canReject && (
              <Form method="post" style={{ marginBottom: 8 }}>
                <input type="hidden" name="intent" value="reject" />
                <textarea name="rejectReason" placeholder="Dôvod zamietnutia..." rows={2} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 6, fontSize: 13 }} />
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>✕ Zamietnuť</button>
              </Form>
            )}
            {canMarkReceived && (
              <Form method="post" style={{ marginBottom: 8 }}>
                <input type="hidden" name="intent" value="mark-received" />
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Tovar prijatý</button>
              </Form>
            )}
            {canRefund && (
              <Form method="post" style={{ marginBottom: 8 }}>
                <input type="hidden" name="intent" value="refund" />
                <div style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 12, color: "#6b7280" }}>Suma refundácie</label>
                  <input type="number" name="refundAmount" defaultValue={totalValue.toFixed(2)} step="0.01" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 14 }} />
                </div>
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#8b5cf6", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Refundovať</button>
              </Form>
            )}
            {canClose && (
              <Form method="post">
                <input type="hidden" name="intent" value="close" />
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#6b7280", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, marginTop: 8 }}>Uzavrieť</button>
              </Form>
            )}
            {(ret.status === "refunded" || ret.status === "closed" || ret.status === "cancelled") && (
              <div style={{ textAlign: "center", padding: 12, color: "#9ca3af", fontSize: 13 }}>Žiadne dostupné akcie</div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Interné poznámky</h3>
            <Form method="post">
              <input type="hidden" name="intent" value="save-note" />
              <textarea name="adminNotes" defaultValue={ret.adminNotes || ""} rows={4} placeholder="Interné poznámky..." style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, marginBottom: 8 }} />
              <button type="submit" disabled={isSubmitting} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Uložiť poznámku</button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
