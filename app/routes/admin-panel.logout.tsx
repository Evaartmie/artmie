import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { adminSessionCookie } from "../utils/admin-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return redirect("/admin-panel", {
    headers: {
      "Set-Cookie": await adminSessionCookie.serialize(null, {
        maxAge: 0,
      }),
    },
  });
};

export const loader = async () => {
  return redirect("/admin-panel");
};
