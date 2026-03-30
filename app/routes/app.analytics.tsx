import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Total returns
  const totalReturns = await prisma.returnRequest.count({ where: { shop } });

  // Returns by status
  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    where: { shop },
    _count: { status: true },
  });

  // Average refund amount
  const avgRefund = await prisma.returnRequest.aggregate({
    where: { shop, totalRefundAmount: { not: null } },
    _avg: { totalRefundAmount: true },
  });

  // Returns this month vs last month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthCount, lastMonthCount] = await Promise.all([
    prisma.returnRequest.count({
      where: { shop, createdAt: { gte: startOfMonth } },
    }),
    prisma.returnRequest.count({
      where: {
        shop,
        createdAt: { gte: startOfLastMonth, lt: startOfMonth },
      },
    }),
  ]);

  // Top return reasons
  const topReasons = await prisma.returnLineItem.groupBy({
    by: ["reasonId"],
    where: {
      returnRequest: { shop },
      reasonId: { not: null },
    },
    _count: { reasonId: true },
    orderBy: { _count: { reasonId: "desc" } },
    take: 10,
  });

  // Fetch reason labels
  const reasonIds = topReasons
    .map((r) => r.reasonId)
    .filter(Boolean) as string[];
  const reasonLabels = await prisma.returnReason.findMany({
    where: { id: { in: reasonIds } },
    select: { id: true, label: true },
  });
  const reasonMap = Object.fromEntries(
    reasonLabels.map((r) => [r.id, r.label])
  );

  const topReasonsWithLabels = topReasons.map((r) => ({
    label: r.reasonId ? reasonMap[r.reasonId] || "Unknown" : "Not specified",
    count: r._count.reasonId,
  }));

  // Approval rate
  const approvedCount =
    statusCounts.find((s) => s.status === "approved")?._count.status || 0;
  const refundedCount =
    statusCounts.find((s) => s.status === "refunded")?._count.status || 0;
  const rejectedCount =
    statusCounts.find((s) => s.status === "rejected")?._count.status || 0;
  const decidedCount = approvedCount + refundedCount + rejectedCount;
  const approvalRate =
    decidedCount > 0
      ? Math.round(((approvedCount + refundedCount) / decidedCount) * 100)
      : 0;

  // Returns per month (last 6 months)
  const monthlyData: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = await prisma.returnRequest.count({
      where: { shop, createdAt: { gte: start, lt: end } },
    });
    monthlyData.push({
      month: start.toLocaleDateString("en", {
        year: "numeric",
        month: "short",
      }),
      count,
    });
  }

  return json({
    totalReturns,
    thisMonthCount,
    lastMonthCount,
    avgRefundAmount: avgRefund._avg.totalRefundAmount || 0,
    approvalRate,
    topReasons: topReasonsWithLabels,
    monthlyData,
  });
};

export default function AnalyticsPage() {
  const {
    totalReturns,
    thisMonthCount,
    lastMonthCount,
    avgRefundAmount,
    approvalRate,
    topReasons,
    monthlyData,
  } = useLoaderData<typeof loader>();

  const monthChange =
    lastMonthCount > 0
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : thisMonthCount > 0
      ? 100
      : 0;

  if (totalReturns === 0) {
    return (
      <Page title="Analytics">
        <Layout>
          <Layout.Section>
            <EmptyState
              heading="No data yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Analytics will appear once you start processing returns.</p>
            </EmptyState>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Analytics">
      <Layout>
        {/* Key Metrics */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Total Returns
                </Text>
                <Text as="p" variant="headingXl">
                  {totalReturns}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  This Month
                </Text>
                <Text as="p" variant="headingXl">
                  {thisMonthCount}
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone={monthChange >= 0 ? "critical" : "success"}
                >
                  {monthChange >= 0 ? "+" : ""}
                  {monthChange}% vs last month
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Avg. Refund
                </Text>
                <Text as="p" variant="headingXl">
                  {avgRefundAmount.toFixed(2)} €
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Approval Rate
                </Text>
                <Text as="p" variant="headingXl">
                  {approvalRate}%
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Monthly Trend */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Returns per Month
              </Text>
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={["Month", "Returns"]}
                rows={monthlyData.map((m) => [m.month, m.count])}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Top Return Reasons */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Top Return Reasons
              </Text>
              {topReasons.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "numeric"]}
                  headings={["Reason", "Count"]}
                  rows={topReasons.map((r) => [r.label, r.count])}
                />
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  No return reasons data yet.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
