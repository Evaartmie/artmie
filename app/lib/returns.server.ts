import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";
import type { ReturnStatus } from "../types/returns";
import { differenceInDays } from "date-fns";

/**
 * Core business logic for returns management
 */

/**
 * Check if an order is eligible for return
 */
export async function checkReturnEligibility(
  shop: string,
  orderId: string,
  deliveredAt?: Date | string | null
): Promise<{ eligible: boolean; reason?: string }> {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    return { eligible: false, reason: "Store not configured" };
  }

  // Check return window
  if (deliveredAt) {
    const deliveryDate =
      typeof deliveredAt === "string" ? new Date(deliveredAt) : deliveredAt;
    const daysSinceDelivery = differenceInDays(new Date(), deliveryDate);

    if (daysSinceDelivery > settings.returnWindowDays) {
      return {
        eligible: false,
        reason: `Return window expired. Returns must be requested within ${settings.returnWindowDays} days of delivery.`,
      };
    }
  }

  // Check if a return already exists for this order
  const existingReturn = await prisma.returnRequest.findFirst({
    where: {
      shop,
      shopifyOrderId: orderId,
      status: {
        notIn: [
          RETURN_STATUSES.CLOSED,
          RETURN_STATUSES.CANCELLED,
          RETURN_STATUSES.REJECTED,
        ],
      },
    },
  });

  if (existingReturn) {
    return {
      eligible: false,
      reason: "A return request already exists for this order.",
    };
  }

  return { eligible: true };
}

/**
 * Check if a product is eligible for return based on tags
 */
export function checkProductEligibility(
  productTags: string[],
  eligibleTags: string | null,
  excludedTags: string | null
): boolean {
  // Check excluded tags first
  if (excludedTags) {
    const excluded = JSON.parse(excludedTags) as string[];
    if (excluded.some((tag) => productTags.includes(tag))) {
      return false;
    }
  }

  // Check eligible tags (empty = all eligible)
  if (eligibleTags) {
    const eligible = JSON.parse(eligibleTags) as string[];
    if (eligible.length > 0) {
      return eligible.some((tag) => productTags.includes(tag));
    }
  }

  return true;
}

/**
 * Check if a return should be auto-approved
 */
export async function shouldAutoApprove(
  shop: string,
  totalValue: number,
  reasonIds: string[]
): Promise<boolean> {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings || !settings.autoApproveEnabled) {
    return false;
  }

  // Check max value
  if (settings.autoApproveMaxValue && totalValue > settings.autoApproveMaxValue) {
    return false;
  }

  // Check reason-based auto-approve
  if (settings.autoApproveReasons) {
    const autoApproveReasonIds = JSON.parse(settings.autoApproveReasons) as string[];
    if (autoApproveReasonIds.length > 0) {
      const allReasonsMatch = reasonIds.every((id) =>
        autoApproveReasonIds.includes(id)
      );
      if (!allReasonsMatch) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Update return status with history tracking
 */
export async function updateReturnStatus(
  returnId: string,
  newStatus: ReturnStatus,
  changedBy: string,
  note?: string
) {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnId },
  });

  if (!returnRequest) {
    throw new Error("Return not found");
  }

  const updateData: any = { status: newStatus };

  switch (newStatus) {
    case RETURN_STATUSES.APPROVED:
      updateData.approvedAt = new Date();
      break;
    case RETURN_STATUSES.REJECTED:
      updateData.rejectedAt = new Date();
      break;
    case RETURN_STATUSES.RECEIVED:
      updateData.receivedAt = new Date();
      break;
    case RETURN_STATUSES.REFUNDED:
      updateData.refundedAt = new Date();
      break;
    case RETURN_STATUSES.CLOSED:
      updateData.closedAt = new Date();
      break;
  }

  return prisma.$transaction([
    prisma.returnRequest.update({
      where: { id: returnId },
      data: updateData,
    }),
    prisma.returnStatusHistory.create({
      data: {
        returnRequestId: returnId,
        fromStatus: returnRequest.status,
        toStatus: newStatus,
        changedBy,
        note,
      },
    }),
  ]);
}

/**
 * Get return statistics for a shop
 */
export async function getReturnStats(shop: string) {
  const [total, pending, approved, rejected, refunded] = await Promise.all([
    prisma.returnRequest.count({ where: { shop } }),
    prisma.returnRequest.count({
      where: { shop, status: RETURN_STATUSES.PENDING },
    }),
    prisma.returnRequest.count({
      where: { shop, status: RETURN_STATUSES.APPROVED },
    }),
    prisma.returnRequest.count({
      where: { shop, status: RETURN_STATUSES.REJECTED },
    }),
    prisma.returnRequest.count({
      where: { shop, status: RETURN_STATUSES.REFUNDED },
    }),
  ]);

  return { total, pending, approved, rejected, refunded };
}
