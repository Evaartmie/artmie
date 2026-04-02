import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

// Debug: show all returns with their data
// Visit: /api/debug-returns
export const loader = async () => {
  const returns = await prisma.returnRequest.findMany({
    include: {
      lineItems: { include: { reason: true } },
      photos: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return json(returns.map(r => ({
    id: r.id,
    order: r.shopifyOrderName,
    customer: r.customerName,
    email: r.customerEmail,
    iban: r.customerIban,
    notes: r.customerNotes,
    status: r.status,
    items: r.lineItems.map(li => ({
      product: li.productTitle,
      reason: li.reason?.label || li.reasonId,
      note: li.customerNote,
      price: li.pricePerItem,
    })),
    photosCount: r.photos.length,
    photos: r.photos.map(p => ({
      fileName: p.fileName,
      size: p.fileSize,
      mimeType: p.mimeType,
      hasData: !!p.fileUrl && p.fileUrl.length > 10,
    })),
  })));
};
