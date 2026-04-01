import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  ResourceList,
  ResourceItem,
  EmptyState,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_COLORS,
  DEFAULT_RETURN_REASONS,
} from "../types/returns";
import type { ReturnStatus } from "../types/returns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // === CRITICAL: Sync the valid token to offline session for portal use ===
  // The embedded app gets a fresh token via token exchange, but the portal
  // needs a valid offline token stored in the database for unauthenticated access.
  if (session.accessToken) {
    const offlineSessionId = `offline_${shop}`;
    try {
      await prisma.session.upsert({
        where: { id: offlineSessionId },
        update: {
          accessToken: session.accessToken,
          scope: session.scope || "",
          isOnline: false,
          expires: null, // offline tokens don't expire
        },
        create: {
          id: offlineSessionId,
          shop: shop,
          state: "active",
          accessToken: session.accessToken,
          scope: session.scope || "",
          isOnline: false,
          expires: null,
        },
      });
      console.log(`[Returns] Synced valid token to offline session for ${shop}. Scope: ${session.scope}`);
    } catch (err) {
      console.error(`[Returns] Failed to sync token for ${shop}:`, err);
    }
  }

  // Ensure store settings exist (seed on first load)
  const existingSettings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!existingSettings) {
    await prisma.storeSettings.create({
      data: { shop },
    });

    // Seed default return reasons
    const reasonsToCreate = DEFAULT_RETURN_REASONS.map((reason) => ({
      shop,
      label: reason.label,
      shopifyReason: reason.shopifyReason,
      sortOrder: reason.sortOrder,
      requirePhoto: "requirePhoto" in reason ? reason.requirePhoto : false,
      requireNote: "requireNote" in reason ? reason.requireNote : false,
    }));

    await prisma.returnReason.createMany({ data: reasonsToCreate });
  }

  // Get status counts
  const statusCounts = await prisma.returnRequest.groupBy({
    by: ["status"],
    where: { shop },
    _count: { status: true },
  });

  const counts: Record<string, number> = {};
  statusCounts.forEach((s) => {
    counts[s.status] = s._count.status;
  });

  // Get recent returns
  const recentReturns = await prisma.returnRequest.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      lineItems: true,
    },
  });

  // Get totals this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyCount = await prisma.returnRequest.count({
    where: {
      shop,
      createdAt: { gte: startOfMonth },
    },
  });

  const totalCount = await prisma.returnRequest.count({
    where: { shop },
  });

  return json({
    counts,
    recentReturns,
    monthlyCount,
    totalCount,
  });
};

export default function Dashboard() {
  const { counts, recentReturns, monthlyCount, totalCount } =
    useLoaderData<typeof loader>();

  const statusCards = [
    { key: "pending", label: "Pending", count: counts.pending || 0, tone: "attention" as const },
    { key: "approved", label: "Approved", count: counts.approved || 0, tone: "info" as const },
    { key: "in_transit", label: "In Transit", count: counts.in_transit || 0, tone: "info" as const },
    { key: "received", label: "Received", count: counts.received || 0, tone: "success" as const },
    { key: "refunded", label: "Refunded", count: counts.refunded || 0, tone: "success" as const },
    { key: "rejected", label: "Rejected", count: counts.rejected || 0, tone: "critical" as const },
  ];

  return (
    <Page title="Returns Manager">
      <Layout>
        {/* Status Overview Cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="300">
            {statusCards.map((card) => (
              <Link
                key={card.key}
                to={`/app/returns?status=${card.key}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card>
                  <BlockStack gap="100" align="center">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {card.label}
                    </Text>
                    <Text as="p" variant="headingXl">
                      {card.count}
                    </Text>
                    <Badge tone={card.tone}>{card.label}</Badge>
                  </BlockStack>
                </Card>
              </Link>
            ))}
          </InlineGrid>
        </Layout.Section>

        {/* Quick Stats */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  This Month
                </Text>
                <Text as="p" variant="headingXl">
                  {monthlyCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  return requests
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  All Time
                </Text>
                <Text as="p" variant="headingXl">
                  {totalCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  total returns
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Pending Action Banner */}
        {(counts.pending || 0) > 0 && (
          <Layout.Section>
            <Card background="bg-surface-warning">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    ⚠️ {counts.pending} return{(counts.pending || 0) > 1 ? "s" : ""} pending review
                  </Text>
                  <Text as="p" variant="bodySm">
                    These requests need your attention.
                  </Text>
                </BlockStack>
                <Link to="/app/returns?status=pending">
                  <button>Review Now</button>
                </Link>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

        {/* Recent Returns */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Recent Returns
                </Text>
                <Link to="/app/returns">View All</Link>
              </InlineStack>

              {recentReturns.length === 0 ? (
                <EmptyState
                  heading="No returns yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    When customers request returns, they will appear here.
                  </p>
                </EmptyState>
              ) : (
                <ResourceList
                  items={recentReturns}
                  renderItem={(returnReq) => {
                    const status = returnReq.status as ReturnStatus;
                    return (
                      <ResourceItem
                        id={returnReq.id}
                        url={`/app/returns/${returnReq.id}`}
                        accessibilityLabel={`View return for order ${returnReq.shopifyOrderName}`}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="bold">
                              {returnReq.shopifyOrderName}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {returnReq.customerName} · {returnReq.customerEmail}
                            </Text>
                          </BlockStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {new Date(returnReq.createdAt).toLocaleDateString()}
                            </Text>
                            <Badge
                              tone={RETURN_STATUS_COLORS[status] || "new"}
                            >
                              {RETURN_STATUS_LABELS[status] || status}
                            </Badge>
                          </InlineStack>
                        </InlineStack>
                      </ResourceItem>
                    );
                  }}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
