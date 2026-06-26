import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { adminLangCookie } from "../utils/admin-i18n";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const lang = formData.get("lang") === "en" ? "en" : "sk";
  const redirectTo = (formData.get("redirectTo") as string) || "/admin-panel/dashboard";

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await adminLangCookie.serialize(lang),
    },
  });
};
