import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";

/**
 * Auto-approve engine
 * Evaluates return requests against store rules and auto-approves if all conditions are met
 */

interface AutoApproveResult {
  shouldApprove: boolean;
  reason: string;
}

/**
 * Evaluate whether a return request should be auto-approved
 */
export async function evaluateAutoApprove(
  shop: string,
  totalValue: number,
  reasonIds: (string | null)[],
  productTags?: string[][]
): Promise<AutoApproveResult> {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    return { shouldApprove: false, reason: "Store settings not found" };
  }

  if (!settings.autoApproveEnabled) {
    return { shouldApprove: false, reason: "Auto-approve is disabled" };
  }

  // Rule 1: Check max value threshold
  if (settings.autoApproveMaxValue !== null && settings.autoApproveMaxValue !== undefined) {
    if (totalValue > settings.autoApproveMaxValue) {
      return {
        shouldApprove: false,
        reason: `Total value (${totalValue}) exceeds auto-approve limit (${settings.autoApproveMaxValue})`,
      };
    }
  }

  // Rule 2: Check return reasons (if specific reasons are configured for auto-approve)
  if (settings.autoApproveReasons) {
    try {
      const allowedReasonIds = JSON.parse(settings.autoApproveReasons) as string[];
      if (allowedReasonIds.length > 0) {
        const validReasons = reasonIds.filter(Boolean) as string[];
        const allReasonsAllowed = validReasons.every((id) =>
          allowedReasonIds.includes(id)
        );
        if (!allReasonsAllowed) {
          return {
            shouldApprove: false,
            reason: "One or more return reasons are not eligible for auto-approval",
          };
        }
      }
    } catch {
      // Invalid JSON, skip this rule
    }
  }

  // Rule 3: Check product tag exclusions
  if (productTags && settings.excludedProductTags) {
    try {
      const excludedTags = JSON.parse(settings.excludedProductTags) as string[];
      if (excludedTags.length > 0) {
        const hasExcludedProduct = productTags.some((tags) =>
          tags.some((tag) => excludedTags.includes(tag))
        );
        if (hasExcludedProduct) {
          return {
            shouldApprove: false,
            reason: "One or more products are excluded from auto-approval",
          };
        }
      }
    } catch {
      // Invalid JSON, skip this rule
    }
  }

  return {
    shouldApprove: true,
    reason: "All auto-approve conditions met",
  };
}

/**
 * Process auto-approval for a return request
 * Returns true if the return was auto-approved
 */
export async function processAutoApproval(
  returnRequestId: string
): Promise<boolean> {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      lineItems: true,
    },
  });

  if (!returnRequest) {
    return false;
  }

  if (returnRequest.status !== RETURN_STATUSES.PENDING) {
    return false;
  }

  const totalValue = returnRequest.lineItems.reduce(
    (sum, item) => sum + item.pricePerItem * item.quantity,
    0
  );

  const reasonIds = returnRequest.lineItems.map((item) => item.reasonId);

  const result = await evaluateAutoApprove(
    returnRequest.shop,
    totalValue,
    reasonIds
  );

  if (result.shouldApprove) {
    await prisma.$transaction([
      prisma.returnRequest.update({
        where: { id: returnRequestId },
        data: {
          status: RETURN_STATUSES.APPROVED,
          approvedAt: new Date(),
        },
      }),
      prisma.returnStatusHistory.create({
        data: {
          returnRequestId,
          fromStatus: RETURN_STATUSES.PENDING,
          toStatus: RETURN_STATUSES.APPROVED,
          changedBy: "system:auto-approve",
          note: `Auto-approved: ${result.reason}`,
        },
      }),
    ]);

    return true;
  }

  return false;
}
