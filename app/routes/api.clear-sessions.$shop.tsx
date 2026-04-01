import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

// Visit this URL to clear old sessions for a shop and force re-auth
// Example: /api/clear-sessions/papilora-ba.myshopify.com
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const shop = params.shop;

  if (!shop || !shop.includes(".myshopify.com")) {
    return json({ error: "Invalid shop domain. Use: /api/clear-sessions/your-store.myshopify.com" });
  }

  // Find all sessions for this shop
  const sessions = await prisma.session.findMany({
    where: { shop },
  });

  const sessionInfo = sessions.map(s => ({
    id: s.id,
    isOnline: s.isOnline,
    scope: s.scope,
    tokenPreview: s.accessToken ? s.accessToken.substring(0, 12) + "..." : "NONE",
    expires: s.expires,
  }));

  // Delete all sessions for this shop
  const deleted = await prisma.session.deleteMany({
    where: { shop },
  });

  return json({
    message: `Deleted ${deleted.count} sessions for ${shop}. Now open the app in Shopify admin to create a fresh token.`,
    deletedSessions: sessionInfo,
  });
};
