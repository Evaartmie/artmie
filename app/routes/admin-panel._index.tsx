import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, Form } from "@remix-run/react";
import {
  adminSessionCookie,
  verifyAdminPassword,
} from "../utils/admin-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookieHeader = request.headers.get("Cookie");
  const session = await adminSessionCookie.parse(cookieHeader);

  if (session?.authenticated === true) {
    return redirect("/admin-panel/dashboard");
  }

  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  if (!password) {
    return json({ error: "Zadajte heslo" }, { status: 400 });
  }

  const isValid = await verifyAdminPassword(password);

  if (!isValid) {
    return json({ error: "Nesprávne heslo" }, { status: 401 });
  }

  return redirect("/admin-panel/dashboard", {
    headers: {
      "Set-Cookie": await adminSessionCookie.serialize({
        authenticated: true,
        loginAt: new Date().toISOString(),
      }),
    },
  });
};

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Returns Manager</h1>
        <p>Central Admin Panel - prihlásenie</p>

        {actionData?.error && (
          <div className="login-error">{actionData.error}</div>
        )}

        <Form method="post">
          <div className="form-group">
            <label htmlFor="password">Heslo</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Zadajte admin heslo"
              autoFocus
              required
            />
          </div>
          <button type="submit" className="login-btn">
            Prihlásiť sa
          </button>
        </Form>
      </div>
    </div>
  );
}
