import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * API endpoint for fetching a single return (for Customer Account Extension)
 * GET /api/returns/:id?shop=...
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id } = params;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !id) {
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  const returnRequest = await prisma.returnRequest.findFirst({
    where: { id, shop },
    include: {
      lineItems: {
        include: { reason: true },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
      },
      photos: true,
    },
  });

  if (!returnRequest) {
    return json({ error: "Return not found" }, { status: 404 });
  }

  return json({ returnRequest });
};
