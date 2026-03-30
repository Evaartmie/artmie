import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";
import { z } from "zod";

const CreateReturnSchema = z.object({
  shop: z.string(),
  orderId: z.string(),
  orderName: z.string(),
  customerId: z.string(),
  customerEmail: z.string().email(),
  customerName: z.string(),
  currency: z.string().default("EUR"),
  customerNotes: z.string().optional(),
  lineItems: z.array(
    z.object({
      lineItemId: z.string(),
      variantId: z.string().optional(),
      productTitle: z.string(),
      variantTitle: z.string().optional(),
      sku: z.string().optional(),
      quantity: z.number().min(1),
      pricePerItem: z.number(),
      reasonId: z.string().optional(),
      customerNote: z.string().optional(),
    })
  ).min(1),
});

/**
 * API endpoint for creating return requests from Customer Account Extension
 * POST /api/returns/create
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const data = CreateReturnSchema.parse(body);

    // Validate the store settings
    const settings = await prisma.storeSettings.findUnique({
      where: { shop: data.shop },
    });

    if (!settings) {
      return json(
        { error: "Store not configured. Please contact the store." },
        { status: 400 }
      );
    }

    // Check if a return already exists for this order
    const existingReturn = await prisma.returnRequest.findFirst({
      where: {
        shop: data.shop,
        shopifyOrderId: data.orderId,
        status: {
          notIn: [RETURN_STATUSES.CLOSED, RETURN_STATUSES.CANCELLED, RETURN_STATUSES.REJECTED],
        },
      },
    });

    if (existingReturn) {
      return json(
        { error: "A return request already exists for this order." },
        { status: 400 }
      );
    }

    // Calculate total value
    const totalValue = data.lineItems.reduce(
      (sum, item) => sum + item.pricePerItem * item.quantity,
      0
    );

    // Check auto-approve eligibility
    let initialStatus = RETURN_STATUSES.PENDING;
    if (
      settings.autoApproveEnabled &&
      (!settings.autoApproveMaxValue || totalValue <= settings.autoApproveMaxValue)
    ) {
      initialStatus = RETURN_STATUSES.APPROVED;
    }

    // Create the return request
    const returnRequest = await prisma.returnRequest.create({
      data: {
        shop: data.shop,
        shopifyOrderId: data.orderId,
        shopifyOrderName: data.orderName,
        customerId: data.customerId,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        currency: data.currency,
        customerNotes: data.customerNotes,
        status: initialStatus,
        totalRefundAmount: totalValue,
        approvedAt:
          initialStatus === RETURN_STATUSES.APPROVED ? new Date() : undefined,
        lineItems: {
          create: data.lineItems.map((item) => ({
            shopifyLineItemId: item.lineItemId,
            shopifyVariantId: item.variantId,
            productTitle: item.productTitle,
            variantTitle: item.variantTitle,
            sku: item.sku,
            quantity: item.quantity,
            pricePerItem: item.pricePerItem,
            reasonId: item.reasonId,
            customerNote: item.customerNote,
          })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: initialStatus,
            changedBy: "customer",
            note:
              initialStatus === RETURN_STATUSES.APPROVED
                ? "Return auto-approved"
                : "Return requested by customer",
          },
        },
      },
      include: {
        lineItems: true,
        statusHistory: true,
      },
    });

    // Sync with Shopify - create return request via GraphQL
    // Note: This requires admin API access. In production, we'd use the
    // unauthenticated admin API with the stored session token.
    try {
      const session = await prisma.session.findFirst({
        where: { shop: data.shop, isOnline: false },
      });

      if (session) {
        const { unauthenticated } = await import("../shopify.server");
        const { admin } = await unauthenticated.admin(data.shop);

        // Map our reason IDs to Shopify reasons
        const reasonMap: Record<string, string> = {};
        if (data.lineItems.some((item) => item.reasonId)) {
          const reasons = await prisma.returnReason.findMany({
            where: {
              id: { in: data.lineItems.map((item) => item.reasonId).filter(Boolean) as string[] },
            },
          });
          reasons.forEach((r) => { reasonMap[r.id] = r.shopifyReason; });
        }

        const RETURN_REQUEST_MUTATION = `
          mutation ReturnRequest($input: ReturnRequestInput!) {
            returnRequest(input: $input) {
              return { id status }
              userErrors { field message }
            }
          }
        `;

        const response = await admin.graphql(RETURN_REQUEST_MUTATION, {
          variables: {
            input: {
              orderId: data.orderId,
              returnLineItems: data.lineItems.map((item) => ({
                fulfillmentLineItemId: item.lineItemId,
                quantity: item.quantity,
                returnReason: item.reasonId ? (reasonMap[item.reasonId] || "OTHER") : "OTHER",
                customerNote: item.customerNote || "",
              })),
            },
          },
        });

        const result = await response.json();
        const shopifyReturn = result.data?.returnRequest?.return;

        if (shopifyReturn?.id) {
          await prisma.returnRequest.update({
            where: { id: returnRequest.id },
            data: { shopifyReturnId: shopifyReturn.id },
          });
        }

        if (result.data?.returnRequest?.userErrors?.length > 0) {
          console.error("Shopify return request errors:", result.data.returnRequest.userErrors);
        }
      }
    } catch (error: any) {
      console.error("Shopify sync error (non-blocking):", error.message);
    }

    // Send confirmation email to customer
    try {
      const { sendNotification, notifyAdmin } = await import("../lib/notifications.server");

      await sendNotification(data.shop, returnRequest.id, "return_confirmed", data.customerEmail, {
        orderName: data.orderName,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        itemsList: data.lineItems
          .map((item) => `<li>${item.productTitle} (x${item.quantity})</li>`)
          .join(""),
      });

      // Notify admin about new return
      await notifyAdmin(data.shop, returnRequest.id, {
        orderName: data.orderName,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
      });
    } catch (error: any) {
      console.error("Notification error (non-blocking):", error.message);
    }

    return json({
      success: true,
      returnRequest: {
        id: returnRequest.id,
        status: returnRequest.status,
        createdAt: returnRequest.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creating return:", error);
    return json(
      { error: "An error occurred while creating the return request." },
      { status: 500 }
    );
  }
};
