import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth, getStoreName, getStoreBrand } from "../utils/admin-auth.server";
import { prisma } from "../db.server";
import { getCarriersForShop, getCountryForShop, generateReturnLabel, RETURN_ADDRESS } from "../lib/carriers.server";
import type { CarrierCode } from "../lib/carriers.server";
import { createShopifyVoucher } from "../lib/shopify-voucher.server";

const STATUS_LABELS: Record<string, string> = {
  pending: "Čakajúce",
  approved: "Schválené",
  rejected: "Zamietnuté",
  in_transit: "V preprave",
  received: "Prijaté",
  refunded: "Refundované",
  closed: "Uzavreté",
  finished: "Ukončené",
  cancelled: "Zrušené",
};

// Detect return type from customerNote first line (supports both new SK labels and old EN labels)
function detectReturnType(note: string): "claim" | "return" | "exchange" | null {
  if (!note) return null;
  const lower = note.toLowerCase();
  // New SK format
  if (note.startsWith("Reklamácia")) return "claim";
  if (note.startsWith("Vrátenie")) return "return";
  if (note.startsWith("Výmena")) return "exchange";
  // Old EN format (legacy data)
  if (lower.includes("defective") || lower.includes("damaged") || lower.includes("wrong") || lower.includes("missing") || lower.includes("low quality") || lower.includes("nekvalitný") || lower.includes("poškodený") || lower.includes("nesprávny") || lower.includes("chýbajúci")) return "claim";
  if (lower.includes("does not fit") || lower.includes("changed mind") || lower.includes("not as described") || lower.includes("odstúpenie") || lower.includes("return")) return "return";
  if (lower.includes("exchange") || lower.includes("výmena")) return "exchange";
  return null;
}

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
      intakeCompletedAt: returnRequest.intakeCompletedAt?.toISOString() || null,
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
      let voucherCode = formData.get("voucherCode") as string || "";
      const voucherAmount = formData.get("voucherAmount") as string || "";
      const voucherType = formData.get("voucherType") as string || "fixed"; // "fixed" or "percentage"
      const resolutionNote = formData.get("resolutionNote") as string || "";
      const creditNote = formData.get("creditNote") as string || "no";
      const creditNoteNumber = formData.get("creditNoteNumber") as string || "";

      // Auto-create Shopify voucher if resolution is voucher and amount is provided
      let shopifyVoucherError = "";
      // Parse amount — support both "109.9" and "109,9" (European format)
      const parsedVoucherAmount = parseFloat(voucherAmount.replace(",", "."));
      if (resolution === "voucher" && voucherAmount && !isNaN(parsedVoucherAmount)) {
        const voucherResult = await createShopifyVoucher({
          shop: returnRequest.shop,
          amount: parsedVoucherAmount,
          isPercentage: voucherType === "percentage",
          currency: returnRequest.currency,
          customerEmail: returnRequest.customerEmail,
          orderName: returnRequest.shopifyOrderName,
          returnId: id!,
        });

        if (voucherResult.success && voucherResult.code) {
          voucherCode = voucherResult.code; // Auto-fill the generated code
        } else {
          shopifyVoucherError = voucherResult.error || "Neznáma chyba pri vytváraní voucheru";
        }
      }

      // Build approval note with all details
      const noteParts: string[] = ["Schválené cez admin panel"];
      if (resolution === "send_product") {
        noteParts.push(`Riešenie: Posielame nový tovar`);
        if (claimNumber) noteParts.push(`Č. reklamácie: ${claimNumber}`);
      } else if (resolution === "refund_amount") {
        noteParts.push(`Riešenie: Vraciame čiastku ${refundAmountApprove} ${returnRequest.currency}`);
      } else if (resolution === "voucher") {
        const vLabel = voucherType === "percentage" ? `${voucherAmount}%` : `${voucherAmount} ${returnRequest.currency}`;
        noteParts.push(`Riešenie: Voucher ${vLabel}`);
        if (voucherCode) noteParts.push(`Kód: ${voucherCode}`);
        if (shopifyVoucherError) noteParts.push(`⚠️ Shopify chyba: ${shopifyVoucherError}`);
      } else if (resolution === "next_order") {
        noteParts.push(`Riešenie: Posielame pri nasledujúcej objednávke`);
      }
      if (resolutionNote) noteParts.push(`Pozn: ${resolutionNote}`);
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
      } else if (resolution === "voucher") {
        const vLabel = voucherType === "percentage" ? `${voucherAmount}%` : `${voucherAmount} ${returnRequest.currency}`;
        adminDetails.push(`[SCHVÁLENIE] Riešenie voucherom — ${vLabel}`);
        if (voucherCode) adminDetails.push(`Kód voucheru: ${voucherCode}`);
        adminDetails.push(shopifyVoucherError
          ? `⚠️ Shopify: ${shopifyVoucherError} (kód nebol vytvorený v Shopify)`
          : `✅ Voucher automaticky vytvorený v Shopify`
        );
      } else if (resolution === "next_order") {
        adminDetails.push(`[SCHVÁLENIE] Posielame pri nasledujúcej objednávke`);
      }
      if (resolutionNote) adminDetails.push(`Poznámka: ${resolutionNote}`);
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
    case "save-credit-note": {
      const creditNoteValue = formData.get("creditNoteValue") as string || "no";
      const creditNoteNum = formData.get("creditNoteNum") as string || "";
      const existing = returnRequest.adminNotes || "";

      // Build credit note block
      const creditBlock = creditNoteValue === "yes"
        ? `[DOBROPIS] Áno${creditNoteNum ? ` — č. ${creditNoteNum}` : ""}`
        : `[DOBROPIS] Nie`;

      // Replace existing credit note block or append
      const creditRegex = /\[DOBROPIS\].*(?:\n|$)/;
      let newNotes: string;
      if (creditRegex.test(existing)) {
        newNotes = existing.replace(creditRegex, creditBlock);
      } else {
        newNotes = existing ? `${existing}\n${creditBlock}` : creditBlock;
      }
      await prisma.returnRequest.update({ where: { id }, data: { adminNotes: newNotes } });
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
    case "finish": {
      const finishNote = formData.get("finishNote") as string || "";
      const finishDate = formData.get("finishDate") as string || "";
      const closedAtDate = finishDate ? new Date(finishDate) : new Date();
      await prisma.$transaction([
        prisma.returnRequest.update({ where: { id }, data: { status: "finished", closedAt: closedAtDate } }),
        prisma.returnStatusHistory.create({ data: { returnRequestId: id!, fromStatus: returnRequest.status, toStatus: "finished", changedBy: "admin-panel", note: finishNote || "Ukončené - práca so zákazníkom dokončená" } }),
      ]);
      break;
    }
    case "save-claim-details": {
      const faultSource = formData.get("faultSource") as string || "";
      const sendNewProduct = formData.get("sendNewProduct") as string || "no";
      const pickupRequired = formData.get("pickupRequired") as string || "no";
      const orderCancelled = formData.get("orderCancelled") as string || "no";
      const payBack = formData.get("payBack") as string || "no";
      const carrierClaim = formData.get("carrierClaim") as string || "no";
      const claimDetailNote = formData.get("claimDetailNote") as string || "";

      const claimDetails = [
        `[MODUL REKLAMÁCIE]`,
        `Chyba zo strany: ${faultSource || "—"}`,
        `Poslanie nového produktu: ${sendNewProduct === "yes" ? "ÁNO" : "NIE"}`,
        `Vyzdvihnutie: ${pickupRequired === "yes" ? "ÁNO" : "NIE"}`,
        `Zrušená objednávka: ${orderCancelled === "yes" ? "ÁNO" : "NIE"}`,
        `Pay back: ${payBack === "yes" ? "ÁNO" : "NIE"}`,
        `Reklamácia u prepravcu: ${carrierClaim === "yes" ? "ÁNO" : "NIE"}`,
        ...(claimDetailNote ? [`Pozn: ${claimDetailNote}`] : []),
      ].join("\n");

      const existing = returnRequest.adminNotes || "";
      // Replace existing claim details block or append
      const claimBlockRegex = /\[MODUL REKLAMÁCIE\][\s\S]*?(?=\n---|\n\[|$)/;
      let newAdminNotes: string;
      if (claimBlockRegex.test(existing)) {
        newAdminNotes = existing.replace(claimBlockRegex, claimDetails);
      } else {
        newAdminNotes = existing ? `${existing}\n---\n${claimDetails}` : claimDetails;
      }
      await prisma.returnRequest.update({ where: { id }, data: { adminNotes: newAdminNotes } });
      break;
    }
    case "toggle-intake": {
      const intakeValue = formData.get("intakeCompleted") === "true";
      await prisma.returnRequest.update({
        where: { id },
        data: {
          intakeCompleted: intakeValue,
          intakeCompletedAt: intakeValue ? new Date() : null,
        },
      });
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

  // Parse existing claim details from adminNotes
  const claimDefaults = (() => {
    const notes = ret.adminNotes || "";
    const block = notes.match(/\[MODUL REKLAMÁCIE\]([\s\S]*?)(?=\n---|\n\[|$)/);
    if (!block) return { faultSource: "", sendNewProduct: "no", pickupRequired: "no", orderCancelled: "no", payBack: "no", carrierClaim: "no" };
    const text = block[1];
    return {
      faultSource: text.match(/Chyba zo strany: (.+)/)?.[1]?.replace("—", "") || "",
      sendNewProduct: text.includes("Poslanie nového produktu: ÁNO") ? "yes" : "no",
      pickupRequired: text.includes("Vyzdvihnutie: ÁNO") ? "yes" : "no",
      orderCancelled: text.includes("Zrušená objednávka: ÁNO") ? "yes" : "no",
      payBack: text.includes("Pay back: ÁNO") ? "yes" : "no",
      carrierClaim: text.includes("Reklamácia u prepravcu: ÁNO") ? "yes" : "no",
    };
  })();

  // Parse current credit note status from adminNotes
  const creditNoteDefaults = (() => {
    const notes = ret.adminNotes || "";
    const match = notes.match(/\[DOBROPIS\]\s*(.*?)(?:\n|$)/);
    if (!match) {
      // Also check old format from approve action
      const oldMatch = notes.match(/Dobropis:\s*(ÁNO|NIE)(.*?)(?:\n|$)/);
      if (oldMatch) {
        const numMatch = oldMatch[2]?.match(/č\.\s*(.+)/);
        return { value: oldMatch[1] === "ÁNO" ? "yes" : "no", number: numMatch?.[1]?.trim() || "" };
      }
      return { value: "no", number: "" };
    }
    const text = match[1];
    if (text.startsWith("Áno")) {
      const numMatch = text.match(/č\.\s*(.+)/);
      return { value: "yes", number: numMatch?.[1]?.trim() || "" };
    }
    return { value: "no", number: "" };
  })();

  // Detect return type for showing claim module
  const returnType = (() => {
    for (const li of ret.lineItems) {
      const note = li.customerNote?.split("\n")[0] || "";
      const t = detectReturnType(note);
      if (t) return t;
    }
    return detectReturnType(ret.customerNotes?.split("\n")[0] || "");
  })();

  const canApprove = ret.status === "pending";
  const canReject = ret.status === "pending";
  const canMarkReceived = ret.status === "approved" || ret.status === "in_transit";
  const canRefund = ret.status === "received";
  const canClose = !["closed", "finished", "cancelled"].includes(ret.status);
  const canFinish = !["finished", "cancelled"].includes(ret.status);

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
          {/* Typ vrátenia badge */}
          {(() => {
            const types = new Set(ret.lineItems.map((li: any) => detectReturnType(li.customerNote?.split("\n")[0] || "")).filter(Boolean));
            return (
              <>
                {types.has("claim") && <span style={{ marginLeft: 8, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", verticalAlign: "middle" }}>Reklamácia</span>}
                {types.has("return") && <span style={{ marginLeft: 8, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", verticalAlign: "middle" }}>Vrátenie</span>}
                {types.has("exchange") && <span style={{ marginLeft: 8, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a", verticalAlign: "middle" }}>Výmena</span>}
              </>
            );
          })()}
        </h2>
        <p>
          <span className={`store-badge store-${ret.storeBrand.toLowerCase()}`}>{ret.storeName}</span>
          {" · "}Vytvorené: {new Date(ret.createdAt).toLocaleString("sk-SK")}
        </p>
      </div>

      {/* Riešenie banner — ak je schválené, zobrazí riešenie + voucher kód */}
      {ret.status !== "pending" && ret.adminNotes && (() => {
        const notes = ret.adminNotes || "";
        const hasResolution = notes.includes("[SCHVÁLENIE]");
        if (!hasResolution) return null;

        const resolutionLine = notes.split("\n").find((l: string) => l.includes("[SCHVÁLENIE]")) || "";
        const voucherCodeMatch = notes.match(/Kód voucheru:\s*(.+?)(?:\n|$)/);
        const shopifyOk = notes.includes("✅ Voucher automaticky vytvorený");
        const shopifyError = notes.match(/⚠️ Shopify:\s*(.+?)(?:\n|$)/);

        return (
          <div style={{
            marginBottom: 16, padding: "14px 18px", borderRadius: 10,
            background: voucherCodeMatch ? "#f0fdf4" : shopifyError ? "#fef2f2" : "#eff6ff",
            border: `1px solid ${voucherCodeMatch ? "#86efac" : shopifyError ? "#fecaca" : "#93c5fd"}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#374151" }}>
              {resolutionLine.replace("[SCHVÁLENIE] ", "")}
            </div>
            {voucherCodeMatch && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Kód voucheru:</span>
                <span style={{
                  fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#059669",
                  background: "#ecfdf5", padding: "4px 14px", borderRadius: 6, border: "1px solid #a7f3d0",
                  letterSpacing: "1px",
                }}>
                  {voucherCodeMatch[1].trim()}
                </span>
                {shopifyOk && <span style={{ fontSize: 11, color: "#059669" }}>✅ Vytvorený v Shopify</span>}
              </div>
            )}
            {shopifyError && !voucherCodeMatch && (
              <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                ⚠️ {shopifyError[1].trim()}
              </div>
            )}
          </div>
        );
      })()}

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3>Produkty ({ret.lineItems.length})</h3>

              {/* Intake Smema toggle */}
              <Form method="post" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="hidden" name="intent" value="toggle-intake" />
                <input type="hidden" name="intakeCompleted" value={ret.intakeCompleted ? "false" : "true"} />
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: 8,
                  background: ret.intakeCompleted ? "#f0fdf4" : "#fef3c7",
                  border: `1px solid ${ret.intakeCompleted ? "#86efac" : "#fcd34d"}`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: ret.intakeCompleted ? "#166534" : "#92400e" }}>
                    Intake Smema: {ret.intakeCompleted ? "ÁNO" : "NIE"}
                  </span>
                  {ret.intakeCompletedAt && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      ({new Date(ret.intakeCompletedAt).toLocaleDateString("sk-SK")})
                    </span>
                  )}
                  <button type="submit" disabled={isSubmitting} style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none",
                    background: ret.intakeCompleted ? "#fee2e2" : "#dcfce7",
                    color: ret.intakeCompleted ? "#991b1b" : "#166534",
                  }}>
                    {ret.intakeCompleted ? "Zrušiť" : "Označiť"}
                  </button>
                </div>
              </Form>
            </div>

            {ret.lineItems.map((li) => (
              <div key={li.id} style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
                  {/* Product image */}
                  {li.imageUrl ? (
                    <img src={li.imageUrl} alt={li.productTitle} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 24 }}>
                      🖼
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
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
                      <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>Qty: {li.quantity}</div>
                        <div style={{ fontWeight: 600 }}>{(li.pricePerItem * li.quantity).toFixed(2)} {ret.currency}</div>
                      </div>
                    </div>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3>Fotky ({ret.photos.length})</h3>
                {/* Modul reklamácie badge */}
                {ret.lineItems.some((li: any) => detectReturnType(li.customerNote?.split("\n")[0] || "") === "claim") && (
                  <span style={{
                    padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "white",
                    letterSpacing: "0.5px", textTransform: "uppercase",
                  }}>
                    Modul reklamácie
                  </span>
                )}
              </div>
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

          <div className="card" style={{ marginBottom: 16 }}>
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

          {/* Modul reklamácie - pod Históriou v ľavom stĺpci */}
          <div className="card">
            <h3 style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>Reklamácia</span>
              Modul reklamácie
            </h3>
            <Form method="post">
              <input type="hidden" name="intent" value="save-claim-details" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {/* Chyba zo strany */}
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Chyba zo strany</label>
                  <select name="faultSource" defaultValue={claimDefaults.faultSource} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="">— Vybrať —</option>
                    <option value="sklad">Sklad</option>
                    <option value="dodávateľ">Dodávateľ</option>
                    <option value="prepravná spoločnosť">Prepravná spoločnosť</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Poslanie nového produktu</label>
                  <select name="sendNewProduct" defaultValue={claimDefaults.sendNewProduct} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Vyzdvihnutie</label>
                  <select name="pickupRequired" defaultValue={claimDefaults.pickupRequired} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Zrušená objednávka</label>
                  <select name="orderCancelled" defaultValue={claimDefaults.orderCancelled} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Pay back</label>
                  <select name="payBack" defaultValue={claimDefaults.payBack} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Reklamácia u prepravcu</label>
                  <select name="carrierClaim" defaultValue={claimDefaults.carrierClaim} style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <option value="no">Nie</option>
                    <option value="yes">Áno</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 3 }}>Poznámka k reklamácii</label>
                  <input type="text" name="claimDetailNote" placeholder="Voliteľná poznámka..." style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12 }} />
                </div>
                <button type="submit" disabled={isSubmitting} style={{ padding: "6px 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                  Uložiť
                </button>
              </div>
            </Form>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Akcie</h3>
            {canApprove && (
              <Form method="post" style={{ marginBottom: 12 }}>
                <input type="hidden" name="intent" value="approve" />

                {/* Typ riešenia */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 4 }}>Typ riešenia</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "6px 8px", background: approveResolution === "send_product" ? "#f0fdf4" : "#f9fafb", border: `1px solid ${approveResolution === "send_product" ? "#86efac" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="send_product" checked={approveResolution === "send_product"} onChange={() => setApproveResolution("send_product")} style={{ accentColor: "#22c55e" }} />
                      <span style={{ fontWeight: 500 }}>📦 Nový tovar</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "6px 8px", background: approveResolution === "refund_amount" ? "#f0f9ff" : "#f9fafb", border: `1px solid ${approveResolution === "refund_amount" ? "#93c5fd" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="refund_amount" checked={approveResolution === "refund_amount"} onChange={() => setApproveResolution("refund_amount")} style={{ accentColor: "#3b82f6" }} />
                      <span style={{ fontWeight: 500 }}>💰 Vraciame čiastku</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "6px 8px", background: approveResolution === "voucher" ? "#fefce8" : "#f9fafb", border: `1px solid ${approveResolution === "voucher" ? "#fde047" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="voucher" checked={approveResolution === "voucher"} onChange={() => setApproveResolution("voucher")} style={{ accentColor: "#eab308" }} />
                      <span style={{ fontWeight: 500 }}>🎟️ Voucher</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "6px 8px", background: approveResolution === "next_order" ? "#fdf4ff" : "#f9fafb", border: `1px solid ${approveResolution === "next_order" ? "#e879f9" : "#e5e7eb"}`, borderRadius: 6 }}>
                      <input type="radio" name="resolution" value="next_order" checked={approveResolution === "next_order"} onChange={() => setApproveResolution("next_order")} style={{ accentColor: "#a855f7" }} />
                      <span style={{ fontWeight: 500 }}>🚚 Ďalšia obj.</span>
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

                {/* Voucher info */}
                {approveResolution === "voucher" && (
                  <div style={{ marginBottom: 10, padding: 10, background: "#fefce8", borderRadius: 8, border: "1px solid #fde047" }}>
                    <div style={{ fontSize: 12, color: "#854d0e", marginBottom: 8, fontWeight: 600 }}>
                      🎟️ Riešenie voucherom — automaticky sa vytvorí v Shopify
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Typ</label>
                        <select name="voucherType" defaultValue="fixed" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}>
                          <option value="fixed">Fixná suma ({ret.currency})</option>
                          <option value="percentage">Percento (%)</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Hodnota</label>
                        <input type="number" name="voucherAmount" placeholder="napr. 25" step="0.01" min="0" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#92400e", background: "#fef9c3", padding: "6px 10px", borderRadius: 6, marginBottom: 8 }}>
                      ℹ️ Po schválení sa automaticky vytvorí jednorazový kupón v Shopify ({ret.storeName}) a kód sa zapíše nižšie.
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Kód voucheru (vyplní sa automaticky, alebo zadaj manuálne)</label>
                      <input type="text" name="voucherCode" placeholder="automaticky sa vygeneruje..." style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13, background: "#fefce8" }} />
                    </div>
                  </div>
                )}

                {/* Next order info */}
                {approveResolution === "next_order" && (
                  <div style={{ marginBottom: 10, padding: 10, background: "#fdf4ff", borderRadius: 8, border: "1px solid #e879f9" }}>
                    <div style={{ fontSize: 12, color: "#86198f", fontWeight: 600 }}>
                      Tovar bude pribalený k nasledujúcej objednávke zákazníka
                    </div>
                  </div>
                )}

                {/* Poznámka k riešeniu */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Poznámka k riešeniu</label>
                  <textarea name="resolutionNote" rows={2} placeholder="Interná poznámka k tomuto riešeniu..." style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                </div>

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
            {canFinish && ret.status !== "pending" && (
              <Form method="post" style={{ marginTop: 12, borderTop: "2px solid #e5e7eb", paddingTop: 12 }}>
                <input type="hidden" name="intent" value="finish" />
                <div style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Dátum ukončenia</label>
                  <input type="date" name="finishDate" defaultValue={new Date().toISOString().split("T")[0]} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                </div>
                <textarea name="finishNote" rows={2} placeholder="Záverečná poznámka (voliteľné)..." style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 6, fontSize: 13 }} />
                <button type="submit" disabled={isSubmitting} style={{ width: "100%", padding: "10px 16px", background: "#059669", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                  ✅ Ukončené
                </button>
                <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 4 }}>Práca so zákazníkom je dokončená</div>
              </Form>
            )}
            {ret.status === "cancelled" && (
              <div style={{ textAlign: "center", padding: 12, color: "#9ca3af", fontSize: 13 }}>Žiadne dostupné akcie</div>
            )}

            {/* Dobropis — vždy viditeľný, editovateľný kedykoľvek */}
            {ret.status !== "cancelled" && (
              <Form method="post" style={{ marginTop: 12, borderTop: "2px solid #e5e7eb", paddingTop: 12 }}>
                <input type="hidden" name="intent" value="save-credit-note" />
                <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                  <div style={{ minWidth: 100 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 4 }}>Dobropis</label>
                    <select name="creditNoteValue" defaultValue={creditNoteDefaults.value} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}>
                      <option value="no">Nie</option>
                      <option value="yes">Áno</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 4 }}>Číslo dobropisu</label>
                    <input type="text" name="creditNoteNum" defaultValue={creditNoteDefaults.number} placeholder="napr. DOB-2026-001" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </div>
                  <button type="submit" disabled={isSubmitting} style={{ padding: "8px 14px", background: "#374151", color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                    Uložiť
                  </button>
                </div>
                {creditNoteDefaults.value === "yes" && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#059669", fontWeight: 500 }}>
                    ✅ Dobropis: Áno{creditNoteDefaults.number ? ` — č. ${creditNoteDefaults.number}` : ""}
                  </div>
                )}
              </Form>
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
