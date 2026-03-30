import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";

/**
 * API endpoint for cancelling a return (for Customer Account Extension)
 * POST /api/returns/:id/cancel
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { id } = params;

  try {
    const body = await request.json();
    const { shop, customerId } = body;

    if (!shop || !id || !customerId) {
      return json({ error: "Missing parameters" }, { status: 400 });
    }

    const returnRequest = await prisma.returnRequest.findFirst({
      where: { id, shop, customerId },
    });

    if (!returnRequest) {
      return json({ error: "Return not found" }, { status: 404 });
    }

    // Only pending returns can be cancelled by the customer
    if (returnRequest.status !== RETURN_STATUSES.PENDING) {
      return json(
        { error: "Only pending returns can be cancelled." },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.returnRequest.update({
        where: { id },
        data: { status: RETURN_STATUSES.CANCELLED },
      }),
      prisma.returnStatusHistory.create({
        data: {
          returnRequestId: id!,
          fromStatus: returnRequest.status,
          toStatus: RETURN_STATUSES.CANCELLED,
          changedBy: "customer",
          note: "Cancelled by customer",
        },
      }),
    ]);

    return json({ success: true });
  } catch (error) {
    console.error("Error cancelling return:", error);
    return json({ error: "An error occurred" }, { status: 500 });
  }
};
