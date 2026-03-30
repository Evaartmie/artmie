import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { RETURN_STATUSES } from "../types/returns";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook from ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED": {
      // Clean up store data when app is uninstalled
      console.log(`App uninstalled from ${shop}, cleaning up data...`);

      await prisma.$transaction([
        prisma.notification.deleteMany({
          where: { returnRequest: { shop } },
        }),
        prisma.returnStatusHistory.deleteMany({
          where: { returnRequest: { shop } },
        }),
        prisma.returnPhoto.deleteMany({
          where: { returnRequest: { shop } },
        }),
        prisma.returnLineItem.deleteMany({
          where: { returnRequest: { shop } },
        }),
        prisma.returnRequest.deleteMany({ where: { shop } }),
        prisma.returnReason.deleteMany({ where: { shop } }),
        prisma.emailTemplate.deleteMany({ where: { shop } }),
        prisma.storeSettings.deleteMany({ where: { shop } }),
        prisma.session.deleteMany({ where: { shop } }),
      ]);

      break;
    }

    case "ORDERS_FULFILLED": {
      // Log fulfilled orders - these are now eligible for returns after the return window
      console.log(`Order fulfilled in ${shop}:`, (payload as any)?.id);
      break;
    }

    case "RETURNS_REQUEST": {
      // A return was requested through Shopify admin or another channel
      // Sync it to our database
      const returnData = payload as any;
      console.log(`Return requested in ${shop}:`, returnData?.id);

      // TODO: Sync return from Shopify to our DB if it wasn't created by our app
      break;
    }

    case "RETURNS_APPROVE": {
      // A return was approved in Shopify admin
      const returnData = payload as any;
      const shopifyReturnId = returnData?.admin_graphql_api_id;

      if (shopifyReturnId) {
        const existing = await prisma.returnRequest.findFirst({
          where: { shop, shopifyReturnId },
        });

        if (existing && existing.status !== RETURN_STATUSES.APPROVED) {
          await prisma.$transaction([
            prisma.returnRequest.update({
              where: { id: existing.id },
              data: {
                status: RETURN_STATUSES.APPROVED,
                approvedAt: new Date(),
              },
            }),
            prisma.returnStatusHistory.create({
              data: {
                returnRequestId: existing.id,
                fromStatus: existing.status,
                toStatus: RETURN_STATUSES.APPROVED,
                changedBy: "shopify-admin",
                note: "Approved via Shopify Admin",
              },
            }),
          ]);
        }
      }
      break;
    }

    case "RETURNS_DECLINE": {
      const returnData = payload as any;
      const shopifyReturnId = returnData?.admin_graphql_api_id;

      if (shopifyReturnId) {
        const existing = await prisma.returnRequest.findFirst({
          where: { shop, shopifyReturnId },
        });

        if (existing && existing.status !== RETURN_STATUSES.REJECTED) {
          await prisma.$transaction([
            prisma.returnRequest.update({
              where: { id: existing.id },
              data: {
                status: RETURN_STATUSES.REJECTED,
                rejectedAt: new Date(),
              },
            }),
            prisma.returnStatusHistory.create({
              data: {
                returnRequestId: existing.id,
                fromStatus: existing.status,
                toStatus: RETURN_STATUSES.REJECTED,
                changedBy: "shopify-admin",
                note: "Declined via Shopify Admin",
              },
            }),
          ]);
        }
      }
      break;
    }

    case "RETURNS_CLOSE": {
      const returnData = payload as any;
      const shopifyReturnId = returnData?.admin_graphql_api_id;

      if (shopifyReturnId) {
        const existing = await prisma.returnRequest.findFirst({
          where: { shop, shopifyReturnId },
        });

        if (existing && existing.status !== RETURN_STATUSES.CLOSED) {
          await prisma.$transaction([
            prisma.returnRequest.update({
              where: { id: existing.id },
              data: {
                status: RETURN_STATUSES.CLOSED,
                closedAt: new Date(),
              },
            }),
            prisma.returnStatusHistory.create({
              data: {
                returnRequestId: existing.id,
                fromStatus: existing.status,
                toStatus: RETURN_STATUSES.CLOSED,
                changedBy: "shopify-admin",
                note: "Closed via Shopify Admin",
              },
            }),
          ]);
        }
      }
      break;
    }

    case "REFUNDS_CREATE": {
      // A refund was created - try to link it to a return
      const refundData = payload as any;
      console.log(`Refund created in ${shop}:`, refundData?.id);
      // TODO: Link refund to return if applicable
      break;
    }

    default: {
      console.log(`Unhandled webhook topic: ${topic}`);
    }
  }

  return new Response();
};
