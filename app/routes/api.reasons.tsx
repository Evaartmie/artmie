import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * API endpoint for fetching return reasons (used by Customer Account Extension)
 * GET /api/reasons?shop=...
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  const reasons = await prisma.returnReason.findMany({
    where: { shop, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      requireNote: true,
      requirePhoto: true,
    },
  });

  return json({ reasons });
};
