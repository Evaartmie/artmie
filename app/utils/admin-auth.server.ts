import { createCookie, redirect } from "@remix-run/node";

// Simple cookie-based authentication for admin panel
export const adminSessionCookie = createCookie("admin-session", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24, // 24 hours
  path: "/",
});

export async function requireAdminAuth(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const session = await adminSessionCookie.parse(cookieHeader);

  if (!session || session.authenticated !== true) {
    throw redirect("/admin-panel");
  }

  return session;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ADMIN_PASSWORD environment variable not set!");
    return false;
  }
  return password === adminPassword;
}

// Map of shop domains to friendly names
export const STORE_NAMES: Record<string, string> = {
  // Papilora stores
  "papilora.myshopify.com": "Papilora SK",
  "papilora-cz.myshopify.com": "Papilora CZ",
  "papilora-hu.myshopify.com": "Papilora HU",
  "papilora-rs.myshopify.com": "Papilora RS",
  "papilora-ro.myshopify.com": "Papilora RO",
  "papilora-mk.myshopify.com": "Papilora MK",
  "papilora-bg.myshopify.com": "Papilora BG",
  "papilora-ba.myshopify.com": "Papilora BA",
  // Artmie stores
  "20a254-6e.myshopify.com": "Artmie SK",
  "cz-artmie.myshopify.com": "Artmie CZ",
  "bg-artmie.myshopify.com": "Artmie BG",
  "pl-artmie.myshopify.com": "Artmie PL",
  "ba-artmie.myshopify.com": "Artmie BA",
  "rs-artmie.myshopify.com": "Artmie RS",
  "mk-artmie.myshopify.com": "Artmie MK",
  "hu-artmie.myshopify.com": "Artmie HU",
  "ro-artmie.myshopify.com": "Artmie RO",
  // Dev store
  "address-validator-test-2.myshopify.com": "Test Store",
};

export function getStoreName(shop: string): string {
  return STORE_NAMES[shop] || shop.replace(".myshopify.com", "");
}

export function getStoreCountry(shop: string): string {
  const name = getStoreName(shop);
  const parts = name.split(" ");
  return parts[parts.length - 1] || "";
}

export function getStoreBrand(shop: string): string {
  const name = getStoreName(shop);
  if (name.startsWith("Papilora")) return "Papilora";
  if (name.startsWith("Artmie")) return "Artmie";
  return "Other";
}
