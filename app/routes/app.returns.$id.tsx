import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  Button,
  TextField,
  Banner,
  Divider,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Modal,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { ReturnStatusBadge } from "../components/ReturnStatusBadge";
import { RETURN_STATUSES } from "../types/returns";
import {
  approveShopifyReturn,
  declineShopifyReturn,
  closeShopifyReturn,
} from "../lib/shopify-returns.server";
import { sendNotification, notifyAdmin } from "../lib/notifications.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const returnRequest = await prisma.returnRequest.findFirst({
    where: { id, shop },
    include: {
      lineItems: {
        include: { reason: true },
      },
      photos: true,
      statusHistory: {
        orderBy: { createdAt: "desc" },
      },
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!returnRequest) {
    throw new Response("Return not found", { status: 404 });
  }

  return json({ returnRequest });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const returnRequest = await prisma.returnRequest.findFirst({
    where: { id, shop },
  });

  if (!returnRequest) {
    return json({ error: "Return not found" }, { status: 404 });
  }

  const adminEmail = session.onlineAccessInfo?.associatedUser?.email || "admin";
  const notificationVars = {
    orderName: returnRequest.shopifyOrderName,
    customerName: returnRequest.customerName,
    customerEmail: returnRequest.customerEmail,
    currency: returnRequest.currency,
  };

  switch (intent) {
    case "approve": {
      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: RETURN_STATUSES.APPROVED,
            approvedAt: new Date(),
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus: RETURN_STATUSES.APPROVED,
            changedBy: `admin:${adminEmail}`,
            note: "Return approved",
          },
        }),
      ]);

      // Sync with Shopify API
      if (returnRequest.shopifyReturnId) {
        try {
          await approveShopifyReturn(admin, returnRequest.shopifyReturnId);
        } catch (error: any) {
          console.error("Shopify approve error:", error.message);
        }
      }

      // Get return instructions for the notification
      const storeSettings = await prisma.storeSettings.findUnique({
        where: { shop },
      });

      // Send notification to customer
      await sendNotification(shop, id!, "return_approved", returnRequest.customerEmail, {
        ...notificationVars,
        returnInstructions: storeSettings?.returnInstructions || undefined,
      });

      return json({ success: true, message: "Return approved" });
    }

    case "reject": {
      const rejectReason = formData.get("rejectReason") as string;

      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: RETURN_STATUSES.REJECTED,
            rejectedAt: new Date(),
            adminNotes: rejectReason || undefined,
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus: RETURN_STATUSES.REJECTED,
            changedBy: `admin:${adminEmail}`,
            note: rejectReason || "Return rejected",
          },
        }),
      ]);

      // Sync with Shopify API
      if (returnRequest.shopifyReturnId) {
        try {
          await declineShopifyReturn(admin, returnRequest.shopifyReturnId, rejectReason);
        } catch (error: any) {
          console.error("Shopify decline error:", error.message);
        }
      }

      // Send notification to customer
      await sendNotification(shop, id!, "return_rejected", returnRequest.customerEmail, {
        ...notificationVars,
        adminNotes: rejectReason || undefined,
      });

      return json({ success: true, message: "Return rejected" });
    }

    case "mark-received": {
      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: RETURN_STATUSES.RECEIVED,
            receivedAt: new Date(),
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus: RETURN_STATUSES.RECEIVED,
            changedBy: `admin:${adminEmail}`,
            note: "Items received at warehouse",
          },
        }),
      ]);

      return json({ success: true, message: "Marked as received" });
    }

    case "process-refund": {
      const refundAmount = parseFloat(formData.get("refundAmount") as string);

      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: RETURN_STATUSES.REFUNDED,
            refundedAt: new Date(),
            totalRefundAmount: refundAmount || undefined,
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus: RETURN_STATUSES.REFUNDED,
            changedBy: `admin:${adminEmail}`,
            note: `Refund processed: ${refundAmount} ${returnRequest.currency}`,
          },
        }),
      ]);

      // Create refund in Shopify via GraphQL
      if (returnRequest.shopifyReturnId) {
        try {
          const refundResponse = await admin.graphql(
            `mutation RefundCreate($input: RefundInput!) {
              refundCreate(input: $input) {
                refund { id }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                input: {
                  orderId: returnRequest.shopifyOrderId,
                  note: `Return refund for ${returnRequest.shopifyOrderName}`,
                },
              },
            }
          );
          const refundData = await refundResponse.json();
          if (refundData.data?.refundCreate?.userErrors?.length > 0) {
            console.error("Shopify refund errors:", refundData.data.refundCreate.userErrors);
          }
        } catch (error: any) {
          console.error("Shopify refund error:", error.message);
        }
      }

      // Send notification to customer
      await sendNotification(shop, id!, "return_refunded", returnRequest.customerEmail, {
        ...notificationVars,
        refundAmount: String(refundAmount),
      });

      return json({ success: true, message: "Refund processed" });
    }

    case "update-tracking": {
      const trackingNumber = formData.get("trackingNumber") as string;
      const trackingUrl = formData.get("trackingUrl") as string;
      const shippingCarrier = formData.get("shippingCarrier") as string;

      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            trackingNumber: trackingNumber || undefined,
            trackingUrl: trackingUrl || undefined,
            shippingCarrier: shippingCarrier || undefined,
            status:
              returnRequest.status === RETURN_STATUSES.APPROVED
                ? RETURN_STATUSES.IN_TRANSIT
                : returnRequest.status,
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus:
              returnRequest.status === RETURN_STATUSES.APPROVED
                ? RETURN_STATUSES.IN_TRANSIT
                : returnRequest.status,
            changedBy: `admin:${session.onlineAccessInfo?.associatedUser?.email || "admin"}`,
            note: `Tracking updated: ${trackingNumber}`,
          },
        }),
      ]);

      return json({ success: true, message: "Tracking info updated" });
    }

    case "add-note": {
      const note = formData.get("note") as string;

      await prisma.returnRequest.update({
        where: { id },
        data: {
          adminNotes: note,
        },
      });

      return json({ success: true, message: "Note saved" });
    }

    case "close": {
      await prisma.$transaction([
        prisma.returnRequest.update({
          where: { id },
          data: {
            status: RETURN_STATUSES.CLOSED,
            closedAt: new Date(),
          },
        }),
        prisma.returnStatusHistory.create({
          data: {
            returnRequestId: id!,
            fromStatus: returnRequest.status,
            toStatus: RETURN_STATUSES.CLOSED,
            changedBy: `admin:${adminEmail}`,
            note: "Return closed",
          },
        }),
      ]);

      // Sync with Shopify API
      if (returnRequest.shopifyReturnId) {
        try {
          await closeShopifyReturn(admin, returnRequest.shopifyReturnId);
        } catch (error: any) {
          console.error("Shopify close error:", error.message);
        }
      }

      return json({ success: true, message: "Return closed" });
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
};

export default function ReturnDetailPage() {
  const { returnRequest } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState(
    String(
      returnRequest.lineItems.reduce(
        (sum, item) => sum + item.pricePerItem * item.quantity,
        0
      )
    )
  );
  const [trackingNumber, setTrackingNumber] = useState(
    returnRequest.trackingNumber || ""
  );
  const [trackingUrl, setTrackingUrl] = useState(
    returnRequest.trackingUrl || ""
  );
  const [shippingCarrier, setShippingCarrier] = useState(
    returnRequest.shippingCarrier || ""
  );
  const [adminNote, setAdminNote] = useState(
    returnRequest.adminNotes || ""
  );

  const handleAction = useCallback(
    (intent: string, extraData?: Record<string, string>) => {
      const formData = new FormData();
      formData.set("intent", intent);
      if (extraData) {
        Object.entries(extraData).forEach(([key, value]) => {
          formData.set(key, value);
        });
      }
      submit(formData, { method: "post" });
    },
    [submit]
  );

  const status = returnRequest.status;
  const canApprove = status === "pending";
  const canReject = status === "pending";
  const canMarkReceived = status === "in_transit" || status === "approved";
  const canRefund = status === "received";
  const canClose =
    status !== "closed" && status !== "cancelled" && status !== "refunded";
  const canUpdateTracking =
    status === "approved" || status === "in_transit";

  const totalItemsValue = returnRequest.lineItems.reduce(
    (sum, item) => sum + item.pricePerItem * item.quantity,
    0
  );

  return (
    <Page
      backAction={{ url: "/app/returns" }}
      title={`Return for ${returnRequest.shopifyOrderName}`}
      subtitle={`Requested by ${returnRequest.customerName} on ${new Date(returnRequest.createdAt).toLocaleDateString()}`}
      titleMetadata={<ReturnStatusBadge status={status} />}
    >
      <Layout>
        {/* Main Content - Left Column */}
        <Layout.Section>
          {/* Order & Customer Info */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Order Information
              </Text>
              <InlineStack gap="400">
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Order
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="bold">
                    {returnRequest.shopifyOrderName}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Customer
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {returnRequest.customerName}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Email
                  </Text>
                  <Text as="span" variant="bodyMd">
                    {returnRequest.customerEmail}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Total Value
                  </Text>
                  <Text as="span" variant="bodyMd" fontWeight="bold">
                    {totalItemsValue.toFixed(2)} {returnRequest.currency}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Return Items */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Return Items ({returnRequest.lineItems.length})
              </Text>
              <ResourceList
                items={returnRequest.lineItems}
                renderItem={(item) => (
                  <ResourceItem
                    id={item.id}
                    accessibilityLabel={item.productTitle}
                  >
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {item.productTitle}
                        </Text>
                        {item.variantTitle && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            {item.variantTitle}
                          </Text>
                        )}
                        {item.sku && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            SKU: {item.sku}
                          </Text>
                        )}
                        <Text as="span" variant="bodySm">
                          Reason: {item.reason?.label || "Not specified"}
                        </Text>
                        {item.customerNote && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Note: {item.customerNote}
                          </Text>
                        )}
                      </BlockStack>
                      <BlockStack gap="100" align="end">
                        <Text as="span" variant="bodySm">
                          Qty: {item.quantity}
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {(item.pricePerItem * item.quantity).toFixed(2)}{" "}
                          {returnRequest.currency}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </ResourceItem>
                )}
              />
            </BlockStack>
          </Card>

          {/* Customer IBAN & Notes */}
          {(returnRequest.customerIban || returnRequest.customerNotes) && (
            <Card>
              <BlockStack gap="300">
                {returnRequest.customerIban && (
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      IBAN for Refund
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      {returnRequest.customerIban}
                    </Text>
                  </BlockStack>
                )}
                {returnRequest.customerNotes && (
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Customer Notes
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {returnRequest.customerNotes}
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Photos */}
          {returnRequest.photos.length > 0 && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Photos ({returnRequest.photos.length})
                </Text>
                <InlineStack gap="200">
                  {returnRequest.photos.map((photo) => (
                    <Thumbnail
                      key={photo.id}
                      source={photo.fileUrl}
                      alt={photo.fileName}
                      size="large"
                    />
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Status Timeline */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Timeline
              </Text>
              {returnRequest.statusHistory.map((entry) => (
                <Box key={entry.id} paddingBlockEnd="200">
                  <InlineStack gap="200" blockAlign="start">
                    <Box
                      minWidth="120px"
                    >
                      <Text as="span" variant="bodySm" tone="subdued">
                        {new Date(entry.createdAt).toLocaleString()}
                      </Text>
                    </Box>
                    <BlockStack gap="050">
                      <InlineStack gap="100">
                        {entry.fromStatus && (
                          <>
                            <ReturnStatusBadge status={entry.fromStatus} />
                            <Text as="span" variant="bodySm">→</Text>
                          </>
                        )}
                        <ReturnStatusBadge status={entry.toStatus} />
                      </InlineStack>
                      {entry.note && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {entry.note}
                        </Text>
                      )}
                      {entry.changedBy && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          by {entry.changedBy}
                        </Text>
                      )}
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                </Box>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Sidebar - Right Column */}
        <Layout.Section variant="oneThird">
          {/* Actions */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Actions
              </Text>

              {canApprove && (
                <Button
                  variant="primary"
                  fullWidth
                  loading={isSubmitting}
                  onClick={() => handleAction("approve")}
                >
                  Approve Return
                </Button>
              )}

              {canReject && (
                <Button
                  variant="primary"
                  tone="critical"
                  fullWidth
                  loading={isSubmitting}
                  onClick={() => setShowRejectModal(true)}
                >
                  Reject Return
                </Button>
              )}

              {canMarkReceived && (
                <Button
                  fullWidth
                  loading={isSubmitting}
                  onClick={() => handleAction("mark-received")}
                >
                  Mark as Received
                </Button>
              )}

              {canRefund && (
                <BlockStack gap="200">
                  <TextField
                    label="Refund Amount"
                    type="number"
                    value={refundAmount}
                    onChange={setRefundAmount}
                    suffix={returnRequest.currency}
                    autoComplete="off"
                  />
                  <Button
                    variant="primary"
                    fullWidth
                    loading={isSubmitting}
                    onClick={() =>
                      handleAction("process-refund", { refundAmount })
                    }
                  >
                    Process Refund
                  </Button>
                </BlockStack>
              )}

              {canClose && (
                <>
                  <Divider />
                  <Button
                    fullWidth
                    loading={isSubmitting}
                    onClick={() => handleAction("close")}
                  >
                    Close Return
                  </Button>
                </>
              )}
            </BlockStack>
          </Card>

          {/* Tracking Info */}
          {canUpdateTracking && (
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Return Shipping
                </Text>
                <TextField
                  label="Carrier"
                  value={shippingCarrier}
                  onChange={setShippingCarrier}
                  autoComplete="off"
                  placeholder="e.g. DHL, DPD, GLS"
                />
                <TextField
                  label="Tracking Number"
                  value={trackingNumber}
                  onChange={setTrackingNumber}
                  autoComplete="off"
                />
                <TextField
                  label="Tracking URL"
                  value={trackingUrl}
                  onChange={setTrackingUrl}
                  autoComplete="off"
                  placeholder="https://..."
                />
                <Button
                  fullWidth
                  loading={isSubmitting}
                  onClick={() =>
                    handleAction("update-tracking", {
                      trackingNumber,
                      trackingUrl,
                      shippingCarrier,
                    })
                  }
                >
                  Save Tracking Info
                </Button>
              </BlockStack>
            </Card>
          )}

          {/* Existing Tracking Display */}
          {returnRequest.trackingNumber && !canUpdateTracking && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Tracking Info
                </Text>
                <Text as="p" variant="bodySm">
                  Carrier: {returnRequest.shippingCarrier || "N/A"}
                </Text>
                <Text as="p" variant="bodySm">
                  Number: {returnRequest.trackingNumber}
                </Text>
                {returnRequest.trackingUrl && (
                  <a
                    href={returnRequest.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Track Shipment
                  </a>
                )}
              </BlockStack>
            </Card>
          )}

          {/* Admin Notes */}
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Admin Notes
              </Text>
              <TextField
                label="Internal notes"
                labelHidden
                value={adminNote}
                onChange={setAdminNote}
                multiline={4}
                autoComplete="off"
              />
              <Button
                loading={isSubmitting}
                onClick={() => handleAction("add-note", { note: adminNote })}
              >
                Save Note
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal
          open={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title="Reject Return"
          primaryAction={{
            content: "Reject",
            destructive: true,
            loading: isSubmitting,
            onAction: () => {
              handleAction("reject", { rejectReason });
              setShowRejectModal(false);
            },
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowRejectModal(false),
            },
          ]}
        >
          <Modal.Section>
            <TextField
              label="Reason for rejection"
              value={rejectReason}
              onChange={setRejectReason}
              multiline={3}
              autoComplete="off"
              placeholder="Explain why this return is being rejected..."
            />
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
