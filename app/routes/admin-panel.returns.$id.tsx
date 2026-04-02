import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth, getStoreName, getStoreBrand } from "../utils/admin-auth.server";
import { prisma } from "../db.server";
import { getCarriersForShop, getCountryForShop, generateReturnLabel, RETURN_ADDRESS } from "../lib/carriers.server";
import type { CarrierCode } from "../lib/carriers.server";

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

  // Get available carriers for this shop's country
  const carriers = getCarriersForShop(returnRequest.shop);
  const shopCountry = getCountryForShop(returnRequest.shop);

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
    carriers: carriers.map(c => ({ code: c.code, name: c.name, logo: c.logo, apiConfigured: c.apiConfigured })),
    shopCountry,
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
    case "approve": {
      const resolution = formData.get("resolution") as string || "";
      const claimNumber = formData.get("claimNumber") as string || "";
      const refundAmountApprove = formData.get("refundAmountApprove") as string || "";
      const creditNote = formData.get("creditNote") as string || "no";
      const creditNoteNumber = formData.get("creditNoteNumber") as string || "";

      // Build approval note with all details
      const noteParts: string[] = ["Schválené cez admin panel"];
      if (resolution === "send_product") {
        noteParts.push(`Riešenie: Posielame nový tovar`);
        if (claimNumber) noteParts.push(`Č. reklamácie: ${claimNumber}`);
      } else if (resolution === "refund_amount") {
        noteParts.push(`Riešenie: Vraciame čiastku ${refundAmountApprove} ${returnRequest.currency}`);
      }
      if (creditNote === "yes") {
        noteParts.push(`Dobropis: ÁNO${creditNoteNumber ? ` (č. ${creditNoteNumber})` : ""}`);
      }
      const approveNote = noteParts.join(" | ");

      // Build adminNotes with structured data
      const adminDetails: string[] = [];
      if (resolution === "send_product") {
        adminDetails.push(`[SCHVÁLENIE] Posielame nový tovar`);
        if (claimNumber) adminDetails.push(`Č. reklamácie: ${claimNumber}`);
      } else if (resolution === "refund_amount") {
        adminDetails.push(`[SCHVÁLENIE] Vraciame čiastku: ${refundAmountApprove} ${returnRequest.currency}`);
      }
      if (creditNote === "yes") {
        adminDetails.push(`Dobropis: ÁNO${creditNoteNumber ? `, č. ${creditNoteNumber}` : ""}`);
      } else {
        adminDetails.push(`Dobropis: NIE`);
      }
      const existingNotes = returnRequest.adminNotes || "";
      const newAdminNotes = existingNotes
        ? `${existingNotes}\n---\n${adminDetails.join("\n")}`
        : adminDetails.join("\n");

      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: "approved",
            approvedAt: new Date(),
            adminNotes: newAdminNotes,
            totalRefundAmount: resolution === "refund_amount" && refundAmountApprove ? parseFloat(refundAmountApprove) : returnRequest.totalRefundAmount,
          },
        }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "approved", changedBy: "admin-panel", note: approveNote } }),
      ]);
      break;
    }
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
    case "generate-label": {
      const carrierCode = formData.get("carrier") as CarrierCode;
      const weight = parseFloat(formData.get("weight") as string || "1");

      const result = await generateReturnLabel(carrierCode, {
        senderName: returnRequest.customerName,
        senderStreet: "", // Customer address would come from Shopify order
        senderCity: "",
        senderZip: "",
        senderCountry: getCountryForShop(returnRequest.shop),
        senderPhone: "",
        senderEmail: returnRequest.customerEmail,
        weight,
        reference: returnRequest.shopifyOrderName,
        note: `Return: ${returnRequest.shopifyOrderName}`,
      });

      if (result.success && result.trackingNumber) {
        await prisma.$transaction([
          prisma.returnRequest.update({
            where: { id },
            data: {
              status: "in_transit",
              trackingNumber: result.trackingNumber,
              trackingUrl: result.trackingUrl || null,
              shippingCarrier: carrierCode,
            },
          }),
          prisma.returnStatusHistory.create({
            data: {
              returnRequestId: id!,
              fromStatus: returnRequest.status,
              toStatus: "in_transit",
              changedBy: "admin-panel",
              note: `Štítok vygenerovaný: ${carrierCode} / ${result.trackingNumber}`,
            },
          }),
        ]);
      } else {
        // Save error to admin notes so user sees it
        const errorNote = `[ŠTÍTOK CHYBA] ${result.error || "Neznáma chyba"}`;
        const existing = returnRequest.adminNotes || "";
        await prisma.returnRequest.update({
          where: { id },
          data: { adminNotes: existing ? `${existing}\n${errorNote}` : errorNote },
        });
      }
      break;
    }
    case "save-tracking": {
      const trackingNumber = formData.get("trackingNumber") as string || "";
      const carrier = formData.get("trackingCarrier") as string || "";
      const trackingUrl = formData.get("trackingUrl") as string || "";
      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            trackingNumber: trackingNumber || null,
            trackingUrl: trackingUrl || null,
            shippingCarrier: carrier || null,
            status: trackingNumber ? "in_transit" : returnRequest.status,
          },
        }),
        ...(trackingNumber && returnRequest.status !== "in_transit" ? [
          prisma.returnStatusHistory.create({
            data: {
              returnRequestId: id!,
              fromStatus: returnRequest.status,
              toStatus: "in_transit",
              changedBy: "admin-panel",
              note: `Tracking: ${trackingNumber} (${carrier || "manuálne"})`,
            },
          }),
        ] : []),
      ]);
      break;
    }
  }

  return redirect(`/admin-panel/returns/${id}`);
};

export default function AdminReturnDetail() {
  const { ret, carriers, shopCountry } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const [approveResolution, setApproveResolution] = useState("send_product");
  const [approveCreditNote, setApproveCreditNote] = useState("no");
  const [showManualTracking, setShowManualTracking] = useState(false);

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
                        Dôvod: {li.reason?.label || (li.customerNote?.split("\n")[0]) || "Nezadaný"}
                      </span>
                    </div>
                    {li.customerNote && (
                      <div style={{ marginTop: 4, fontSize: 13, color: "#374151", background: "#f9fafb", padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid #6366f1", whiteSpace: "pre-line" }}>
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
              <Form method="post" style={{ marginBottom: 12 }}>
                <input type="hidden" name="intent" value="approve" />

                {/* Typ riešenia */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 6 }}>Typ riešenia</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "8px 10px", background: approveResolution === "send_product" ? "#f0fdf4" : "#f9fafb", border: `1px solid ${approveResolution === "send_product" ? "#86efac" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="send_product" checked={approveResolution === "send_product"} onChange={() => setApproveResolution("send_product")} style={{ accentColor: "#22c55e" }} />
                      <span style={{ fontWeight: 500 }}>📦 Posielame nový tovar</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "8px 10px", background: approveResolution === "refund_amount" ? "#f0f9ff" : "#f9fafb", border: `1px solid ${approveResolution === "refund_amount" ? "#93c5fd" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="refund_amount" checked={approveResolution === "refund_amount"} onChange={() => setApproveResolution("refund_amount")} style={{ accentColor: "#3b82f6" }} />
                      <span style={{ fontWeight: 500 }}>💰 Vraciame čiastku</span>
                    </label>
                  </div>
                </div>

                {/* Číslo reklamácie - pri posielaní nového tovaru */}
                {approveResolution === "send_product" && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Číslo reklamácie</label>
                    <input type="text" name="claimNumber" placeholder="napr. REK-2026-001" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </div>
                )}

                {/* Čiastka - pri vracaní peňazí */}
                {approveResolution === "refund_amount" && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Suma na vrátenie ({ret.currency})</label>
                    <input type="number" name="refundAmountApprove" defaultValue={totalValue.toFixed(2)} step="0.01" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </div>
                )}

                {/* Dobropis */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Dobropis</label>
                  <select name="creditNote" value={approveCreditNote} onChange={(e) => setApproveCreditNote(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>

                {/* Číslo dobropisu */}
                {approveCreditNote === "yes" && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Číslo dobropisu</label>
                    <input type="text" name="creditNoteNumber" placeholder="napr. DOB-2026-001" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </div>
                )}

                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#22c55e", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, marginTop: 4 }}>✓ Schváliť</button>
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

          {/* Shipping / Label section */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Preprava Return</h3>

            {/* Show existing tracking info */}
            {ret.trackingNumber && (
              <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Tracking</div>
                <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 14 }}>
                  {ret.trackingNumber}
                </div>
                {ret.shippingCarrier && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Dopravca: {ret.shippingCarrier}
                  </div>
                )}
                {ret.trackingUrl && (
                  <a href={ret.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#6366f1", marginTop: 6, display: "inline-block" }}>
                    Sledovať zásielku →
                  </a>
                )}
              </div>
            )}

            {/* Generate label - only for approved/pending returns */}
            {["approved", "pending"].includes(ret.status) && !ret.trackingNumber && (
              <>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  Krajina: <strong>{shopCountry}</strong> · {carriers.length} dopravcov
                </div>

                <Form method="post" style={{ marginBottom: 10 }}>
                  <input type="hidden" name="intent" value="generate-label" />
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Dopravca</label>
                    <select name="carrier" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}>
                      {carriers.map((c: any) => (
                        <option key={c.code} value={c.code}>
                          {c.logo} {c.name} {c.apiConfigured ? "✓" : "(nie je API)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Váha (kg)</label>
                    <input type="number" name="weight" defaultValue="1" step="0.1" min="0.1" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </div>
                  <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#0ea5e9", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                    🏷️ Vygenerovať štítok
                  </button>
                </Form>

                {/* Manual tracking entry */}
                <button
                  type="button"
                  onClick={() => setShowManualTracking(!showManualTracking)}
                  style={{ width: "100%", padding: "8px 12px", background: "none", border: "1px dashed #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#6b7280", marginBottom: showManualTracking ? 8 : 0 }}
                >
                  {showManualTracking ? "▲ Skryť" : "✏️ Zadať tracking manuálne"}
                </button>

                {showManualTracking && (
                  <Form method="post" style={{ marginTop: 8, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
                    <input type="hidden" name="intent" value="save-tracking" />
                    <div style={{ marginBottom: 6 }}>
                      <input type="text" name="trackingNumber" placeholder="Tracking číslo" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <input type="text" name="trackingCarrier" placeholder="Dopravca (napr. GLS, SPS)" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <input type="text" name="trackingUrl" placeholder="Tracking URL (voliteľné)" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                    </div>
                    <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "8px 14px", background: "#374151", color: "white", border: "none", borderRadius: 6, fontWeight: 500, cursor: "pointer", fontSize: 13 }}>
                      Uložiť tracking
                    </button>
                  </Form>
                )}
              </>
            )}

            {/* No shipping actions for these statuses */}
            {!["approved", "pending"].includes(ret.status) && !ret.trackingNumber && (
              <div style={{ textAlign: "center", padding: 8, color: "#9ca3af", fontSize: 12 }}>
                {ret.status === "rejected" || ret.status === "cancelled"
                  ? "Zásielka nie je potrebná"
                  : "Žiadne tracking info"}
              </div>
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
