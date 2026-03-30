import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";
import { subMonths, startOfMonth, endOfMonth, differenceInHours } from "date-fns";

/**
 * Analytics aggregation functions for the returns dashboard
 */

/**
 * Get comprehensive analytics data for a shop
 */
export async function getAnalyticsData(shop: string, monthsBack: number = 6) {
  const now = new Date();

  // Status distribution
  const statusDistribution = await prisma.returnRequest.groupBy({
    by: ["status"],
    where: { shop },
    _count: { status: true },
  });

  // Monthly trend
  const monthlyTrend = await getMonthlyTrend(shop, monthsBack);

  // Top return reasons
  const topReasons = await getTopReturnReasons(shop, 10);

  // Most returned products
  const topProducts = await getMostReturnedProducts(shop, 10);

  // Average resolution time (pending -> refunded/closed)
  const avgResolutionTime = await getAverageResolutionTime(shop);

  // Total refund value
  const refundStats = await prisma.returnRequest.aggregate({
    where: { shop, totalRefundAmount: { not: null } },
    _sum: { totalRefundAmount: true },
    _avg: { totalRefundAmount: true },
    _count: true,
  });

  return {
    statusDistribution: Object.fromEntries(
      statusDistribution.map((s) => [s.status, s._count.status])
    ),
    monthlyTrend,
    topReasons,
    topProducts,
    avgResolutionTimeHours: avgResolutionTime,
    totalRefundValue: refundStats._sum.totalRefundAmount || 0,
    avgRefundValue: refundStats._avg.totalRefundAmount || 0,
    totalRefundedCount: refundStats._count,
  };
}

/**
 * Get monthly return counts for the last N months
 */
async function getMonthlyTrend(shop: string, months: number) {
  const now = new Date();
  const results: Array<{ month: string; year: number; count: number }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = subMonths(now, i);
    const start = startOfMonth(date);
    const end = endOfMonth(date);

    const count = await prisma.returnRequest.count({
      where: {
        shop,
        createdAt: { gte: start, lte: end },
      },
    });

    results.push({
      month: start.toLocaleDateString("en", { month: "short" }),
      year: start.getFullYear(),
      count,
    });
  }

  return results;
}

/**
 * Get top return reasons by frequency
 */
async function getTopReturnReasons(shop: string, limit: number) {
  const grouped = await prisma.returnLineItem.groupBy({
    by: ["reasonId"],
    where: {
      returnRequest: { shop },
      reasonId: { not: null },
    },
    _count: { reasonId: true },
    orderBy: { _count: { reasonId: "desc" } },
    take: limit,
  });

  const reasonIds = grouped.map((g) => g.reasonId).filter(Boolean) as string[];
  const reasons = await prisma.returnReason.findMany({
    where: { id: { in: reasonIds } },
    select: { id: true, label: true },
  });

  const reasonMap = Object.fromEntries(reasons.map((r) => [r.id, r.label]));

  return grouped.map((g) => ({
    reasonId: g.reasonId,
    label: g.reasonId ? reasonMap[g.reasonId] || "Unknown" : "Not specified",
    count: g._count.reasonId,
  }));
}

/**
 * Get most frequently returned products
 */
async function getMostReturnedProducts(shop: string, limit: number) {
  const grouped = await prisma.returnLineItem.groupBy({
    by: ["productTitle"],
    where: { returnRequest: { shop } },
    _count: { productTitle: true },
    _sum: { quantity: true },
    orderBy: { _count: { productTitle: "desc" } },
    take: limit,
  });

  return grouped.map((g) => ({
    productTitle: g.productTitle,
    returnCount: g._count.productTitle,
    totalQuantity: g._sum.quantity || 0,
  }));
}

/**
 * Calculate average time from return creation to resolution (refund or close)
 */
async function getAverageResolutionTime(shop: string): Promise<number | null> {
  const resolvedReturns = await prisma.returnRequest.findMany({
    where: {
      shop,
      OR: [
        { status: RETURN_STATUSES.REFUNDED, refundedAt: { not: null } },
        { status: RETURN_STATUSES.CLOSED, closedAt: { not: null } },
      ],
    },
    select: {
      createdAt: true,
      refundedAt: true,
      closedAt: true,
    },
  });

  if (resolvedReturns.length === 0) return null;

  const totalHours = resolvedReturns.reduce((sum, r) => {
    const resolvedAt = r.refundedAt || r.closedAt;
    if (!resolvedAt) return sum;
    return sum + differenceInHours(new Date(resolvedAt), new Date(r.createdAt));
  }, 0);

  return Math.round(totalHours / resolvedReturns.length);
}

/**
 * Get return rate (returns / orders ratio)
 * Note: This requires order count from Shopify, which we'd get via API
 * For now, returns a placeholder
 */
export async function getReturnRate(
  shop: string,
  totalOrdersCount: number
): Promise<number> {
  if (totalOrdersCount === 0) return 0;

  const returnCount = await prisma.returnRequest.count({
    where: { shop },
  });

  return Math.round((returnCount / totalOrdersCount) * 10000) / 100; // percentage with 2 decimals
}
