import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, Form } from "@remix-run/react";
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
    return json({ error: "Nespravne heslo" }, { status: 401 });
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
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      margin: 0,
      padding: 0,
    }}>
      <div style={{
        background: "white",
        borderRadius: 16,
        padding: 40,
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          marginBottom: 8,
          textAlign: "center",
          color: "#1a1a1a",
        }}>
          Returns Manager
        </h1>
        <p style={{
          fontSize: 14,
          color: "#6b7280",
          textAlign: "center",
          marginBottom: 32,
        }}>
          Central Admin Panel
        </p>

        {actionData?.error && (
          <div style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
            textAlign: "center",
          }}>
            {actionData.error}
          </div>
        )}

        <Form method="post">
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              marginBottom: 6,
            }}>
              Heslo
            </label>
            <input
              name="password"
              type="password"
              placeholder="Zadajte admin heslo"
              autoFocus
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: 12,
              background: "#1a1a2e",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Prihlasit sa
          </button>
        </Form>
      </div>
    </div>
  );
}
