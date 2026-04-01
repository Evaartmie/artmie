import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";

// Debug: show ALL sessions in database
// Visit: /api/debug-sessions
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const allSessions = await prisma.session.findMany();

  const sessions = allSessions.map(s => ({
    id: s.id,
    shop: s.shop,
    isOnline: s.isOnline,
    scope: s.scope,
    tokenPrefix: s.accessToken ? s.accessToken.substring(0, 15) + "..." : "NONE",
    tokenLength: s.accessToken?.length || 0,
    expires: s.expires,
    userId: s.userId ? String(s.userId) : null,
  }));

  return json({
    totalSessions: sessions.length,
    sessions,
  });
};
