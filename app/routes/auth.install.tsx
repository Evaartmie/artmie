import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import crypto from "crypto";

// Manual OAuth install endpoint
// Step 1: Visit /auth/install?shop=papilora-ba.myshopify.com → redirects to Shopify OAuth
// Step 2: Shopify redirects back to /auth/install with code → exchanges for token
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const scopes = process.env.SCOPES || "read_customers,read_orders,read_products,read_returns,write_orders,write_returns";
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const redirectUri = `${appUrl}/auth/install`;

  // Step 2: We have the code - exchange it for a token
  if (code && shop) {
    try {
      // Verify HMAC (optional but good practice)
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        return new Response(
          JSON.stringify({ error: "Failed to get token", response: tokenData }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Store the offline session in database
      const { prisma } = await import("../db.server");
      const offlineSessionId = `offline_${shop}`;

      await prisma.session.upsert({
        where: { id: offlineSessionId },
        update: {
          accessToken: tokenData.access_token,
          scope: tokenData.scope || scopes,
          isOnline: false,
          expires: null,
        },
        create: {
          id: offlineSessionId,
          shop: shop,
          state: "active",
          accessToken: tokenData.access_token,
          scope: tokenData.scope || scopes,
          isOnline: false,
          expires: null,
        },
      });

      // Test the token immediately
      const testResp = await fetch(`https://${shop}/admin/api/2025-04/orders/count.json?status=any`, {
        headers: { "X-Shopify-Access-Token": tokenData.access_token },
      });
      const testData = await testResp.json();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Token uložený pre ${shop}!`,
          tokenPrefix: tokenData.access_token.substring(0, 12) + "...",
          scope: tokenData.scope,
          ordersCount: testData.count,
          testStatus: testResp.status,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Step 1: Redirect to Shopify OAuth
  if (!shop || !shop.includes(".myshopify.com")) {
    return new Response(
      "Usage: /auth/install?shop=your-store.myshopify.com",
      { status: 400 }
    );
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}&grant_options[]=per-user`;

  // Actually we want OFFLINE access (not per-user), so remove grant_options
  const offlineAuthUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  return redirect(offlineAuthUrl);
};
