import { prisma } from "../db.server";

const API_VERSION = "2025-04";

interface VoucherInput {
  shop: string;
  amount: number;       // e.g. 25.00
  isPercentage: boolean; // true = %, false = fixed amount
  currency: string;      // e.g. EUR
  customerEmail?: string;
  orderName?: string;    // e.g. #1234 — for reference
  returnId: string;
}

interface VoucherResult {
  success: boolean;
  code?: string;
  priceRuleId?: number;
  error?: string;
}

/**
 * Creates a single-use discount code in Shopify via REST Admin API.
 *
 * Flow:
 * 1. Get access token from Session table for the shop
 * 2. Create a Price Rule (defines the discount value)
 * 3. Create a Discount Code under that Price Rule (the actual code customers use)
 */
export async function createShopifyVoucher(input: VoucherInput): Promise<VoucherResult> {
  const { shop, amount, isPercentage, currency, customerEmail, orderName, returnId } = input;

  // 1. Get access token
  const session = await prisma.session.findFirst({
    where: { shop, accessToken: { not: "" } },
    orderBy: { id: "desc" },
  });

  if (!session?.accessToken) {
    return { success: false, error: `Nenájdený access token pre obchod ${shop}. Obchod musí byť znovu pripojený s novými scopes.` };
  }

  const accessToken = session.accessToken;

  // 2. Generate unique code — format: CLA + last 4 digits of order number
  // e.g. order #1234 → CLA1234, repeat → CLA1234B, CLA1234C, etc.
  const orderDigits = (orderName || "").replace(/\D/g, "").slice(-4) || "0000";
  const baseCode = `CLA${orderDigits}`;

  // Check if this code already exists in Shopify — if so, add suffix letter
  let code = baseCode;
  const suffixLetters = "BCDEFGHJKLMNPRSTUVWXYZ"; // skip confusing letters I,O,Q
  for (let attempt = 0; attempt <= suffixLetters.length; attempt++) {
    // Check if discount code already exists
    const checkResp = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/discount_codes/lookup.json?code=${code}`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (checkResp.status === 404 || !checkResp.ok) {
      // Code doesn't exist — we can use it
      break;
    }
    // Code exists — add next suffix letter
    if (attempt < suffixLetters.length) {
      code = `${baseCode}${suffixLetters[attempt]}`;
    }
  }

  try {
    // 3. Create Price Rule
    const priceRulePayload = {
      price_rule: {
        title: `Voucher ${orderName || returnId} — ${code}`,
        target_type: "line_item",
        target_selection: "all",
        allocation_method: "across",
        value_type: isPercentage ? "percentage" : "fixed_amount",
        value: isPercentage ? `-${amount}` : `-${amount}`, // Shopify expects negative values
        customer_selection: "all", // Could restrict to specific customer if needed
        usage_limit: 1, // Single use
        once_per_customer: true,
        starts_at: new Date().toISOString(),
        // Expires in 365 days
        ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    const priceRuleResp = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/price_rules.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify(priceRulePayload),
      }
    );

    if (!priceRuleResp.ok) {
      const errorData = await priceRuleResp.json().catch(() => ({}));
      const errorMsg = errorData?.errors
        ? (typeof errorData.errors === "string" ? errorData.errors : JSON.stringify(errorData.errors))
        : `HTTP ${priceRuleResp.status}`;
      return {
        success: false,
        error: `Shopify Price Rule chyba: ${errorMsg}. Skontrolujte či má obchod scope 'write_price_rules'.`,
      };
    }

    const priceRuleData = await priceRuleResp.json();
    const priceRuleId = priceRuleData.price_rule?.id;

    if (!priceRuleId) {
      return { success: false, error: "Shopify nevrátil price_rule ID" };
    }

    // 4. Create Discount Code under this Price Rule
    const discountCodePayload = {
      discount_code: {
        code: code,
      },
    };

    const discountResp = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify(discountCodePayload),
      }
    );

    if (!discountResp.ok) {
      const errorData = await discountResp.json().catch(() => ({}));
      const errorMsg = errorData?.errors
        ? (typeof errorData.errors === "string" ? errorData.errors : JSON.stringify(errorData.errors))
        : `HTTP ${discountResp.status}`;
      return {
        success: false,
        error: `Shopify Discount Code chyba: ${errorMsg}`,
        priceRuleId,
      };
    }

    return {
      success: true,
      code,
      priceRuleId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Chyba pripojenia k Shopify: ${err.message || err}`,
    };
  }
}
