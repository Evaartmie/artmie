import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

/**
 * API endpoint for Customer Account Extension
 * GET /api/returns?customerId=...&orderId=...
 * Returns list of returns for a customer or a specific order
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the request from the customer account extension
  const { sessionToken } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const orderId = url.searchParams.get("orderId");
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  const where: any = { shop };

  if (customerId) {
    where.customerId = customerId;
  }

  if (orderId) {
    where.shopifyOrderId = orderId;
  }

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      lineItems: {
        include: { reason: true },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return json({ returns });
};
