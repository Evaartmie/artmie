import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import { checkReturnEligibility } from "../lib/returns.server";

/**
 * API endpoint for checking return eligibility (used by Customer Account Extension)
 * GET /api/eligibility?shop=...&orderId=...&deliveredAt=...
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const orderId = url.searchParams.get("orderId");
  const deliveredAt = url.searchParams.get("deliveredAt");

  if (!shop || !orderId) {
    return json({ error: "Missing shop or orderId" }, { status: 400 });
  }

  const result = await checkReturnEligibility(shop, orderId, deliveredAt);

  // Also check if a return already exists
  const existingReturn = await prisma.returnRequest.findFirst({
    where: {
      shop,
      shopifyOrderId: orderId,
      status: {
        notIn: ["closed", "cancelled", "rejected"],
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  return json({
    eligible: result.eligible,
    reason: result.reason,
    existingReturn: existingReturn || null,
  });
};
