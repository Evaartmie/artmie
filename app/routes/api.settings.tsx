import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * API endpoint for fetching public store settings (used by Customer Account Extension)
 * GET /api/settings?shop=...
 * Returns only public-facing settings (not admin-only config)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
    select: {
      returnWindowDays: true,
      requirePhotos: true,
      maxPhotosPerItem: true,
      returnInstructions: true,
    },
  });

  if (!settings) {
    return json({ error: "Store not configured" }, { status: 404 });
  }

  return json({ settings });
};
