import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { prisma } from "../db.server";
import { useState } from "react";

// Map of URL slugs to myshopify domains
const SHOP_SLUGS: Record<string, string> = {
  "papilora-sk": "papilora.myshopify.com",
  "papilora-cz": "papilora-cz.myshopify.com",
  "papilora-hu": "papilora-hu.myshopify.com",
  "papilora-pl": "papilora-pl.myshopify.com",
  "papilora-ro": "papilora-ro.myshopify.com",
  "papilora-bg": "papilora-bg.myshopify.com",
  "papilora-hr": "papilora-hr.myshopify.com",
  "papilora-ba": "papilora-ba.myshopify.com",
  "artmie-sk": "artmie.myshopify.com",
  "artmie-cz": "artmie-cz.myshopify.com",
  "artmie-hu": "artmie-hu.myshopify.com",
  "artmie-pl": "artmie-pl.myshopify.com",
  "artmie-ro": "artmie-ro.myshopify.com",
  "artmie-bg": "artmie-bg.myshopify.com",
  "artmie-de": "artmie-de.myshopify.com",
  "artmie-ba": "artmie-ba.myshopify.com",
  "artmie-rs": "artmie-rs.myshopify.com",
};

const SHOP_NAMES: Record<string, string> = {
  "papilora-sk": "Papilora SK",
  "papilora-cz": "Papilora CZ",
  "papilora-hu": "Papilora HU",
  "papilora-pl": "Papilora PL",
  "papilora-ro": "Papilora RO",
  "papilora-bg": "Papilora BG",
  "papilora-hr": "Papilora HR",
  "papilora-ba": "Papilora BA",
  "artmie-sk": "Artmie SK",
  "artmie-cz": "Artmie CZ",
  "artmie-hu": "Artmie HU",
  "artmie-pl": "Artmie PL",
  "artmie-ro": "Artmie RO",
  "artmie-bg": "Artmie BG",
  "artmie-de": "Artmie DE",
  "artmie-ba": "Artmie BA",
  "artmie-rs": "Artmie RS",
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];
  const shopName = SHOP_NAMES[slug] || slug;

  if (!shopDomain) {
    return json({ error: "Store not found", shopName: "", shopDomain: "", reasons: [], brandColor: "#333" });
  }

  const brandColor = slug.startsWith("papilora") ? "#6B2D8B" : "#D4A853";

  // Load return reasons for this store
  const reasons = await prisma.returnReason.findMany({
    where: { shop: shopDomain, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return json({ error: null, shopName, shopDomain, reasons, brandColor });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];

  if (!shopDomain) {
    return json({ error: "Store not found", step: "lookup" });
  }

  // Step 1: Look up order
  if (intent === "lookup") {
    const orderNumber = (formData.get("orderNumber") as string || "").trim();
    const email = (formData.get("email") as string || "").trim().toLowerCase();

    if (!orderNumber || !email) {
      return json({ error: "Zadajte číslo objednávky aj email.", step: "lookup" });
    }

    // Get Shopify admin API access
    try {
      // Try to find any valid session for this shop
      const sessions = await prisma.session.findMany({
        where: { shop: shopDomain },
        orderBy: { expires: "desc" },
      });

      // Find offline session (id contains "offline") or any session with token
      const offlineSession = sessions.find(s => s.id.includes("offline"));
      const session = offlineSession || sessions.find(s => s.accessToken);

      if (!session?.accessToken) {
        return json({ error: `Store nie je pripojený. Nájdené sessions: ${sessions.length}, IDs: ${sessions.map(s => s.id).join(", ")}`, step: "lookup" });
      }

      // Use REST API for reliable order lookup
      const cleanNumber = orderNumber.replace(/^#/, '');
      const restUrl = `https://${shopDomain}/admin/api/2025-04/orders.json?name=${encodeURIComponent(cleanNumber)}&status=any&limit=1`;

      let response = await fetch(restUrl, {
        headers: { "X-Shopify-Access-Token": session.accessToken },
      });

      let data = await response.json();

      // If not found, try with # prefix
      if (!data.orders || data.orders.length === 0) {
        const restUrl2 = `https://${shopDomain}/admin/api/2025-04/orders.json?name=%23${encodeURIComponent(cleanNumber)}&status=any&limit=1`;
        response = await fetch(restUrl2, {
          headers: { "X-Shopify-Access-Token": session.accessToken },
        });
        data = await response.json();
      }

      const order = data.orders?.[0];

      if (!order) {
        return json({ error: `Objednávka nebola nájdená. Skontrolujte číslo objednávky. (Debug: shop=${shopDomain}, num=${cleanNumber})`, step: "lookup" });
      }

      // Verify email
      const orderEmail = (order.email || order.customer?.email || "").toLowerCase();
      if (orderEmail !== email) {
        return json({ error: "Email sa nezhoduje s objednávkou.", step: "lookup" });
      }

      // Check if return already exists
      const existingReturn = await prisma.returnRequest.findFirst({
        where: {
          shop: shopDomain,
          shopifyOrderId: String(order.id),
          status: { notIn: ["cancelled", "closed"] },
        },
      });

      if (existingReturn) {
        return json({ error: "Pre túto objednávku už existuje žiadosť o vrátenie.", step: "lookup" });
      }

      // Map line items
      const lineItems = (order.line_items || []).map((item: any) => ({
        id: String(item.id),
        title: item.title || "",
        variantTitle: item.variant_title || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        price: parseFloat(item.price || "0"),
        currency: order.currency || "EUR",
        imageUrl: "",
      }));

      return json({
        step: "form",
        order: {
          id: `gid://shopify/Order/${order.id}`,
          name: order.name,
          email: orderEmail,
          customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
          customerId: order.customer?.id ? `gid://shopify/Customer/${order.customer.id}` : "",
          currency: order.currency,
          lineItems,
        },
        error: null,
      });
    } catch (err: any) {
      console.error("Order lookup error:", err);
      return json({ error: `Chyba pri vyhľadávaní: ${err.message || "Skúste znova."}`, step: "lookup" });
    }
  }

  // Step 2: Submit return
  if (intent === "submit") {
    const orderData = JSON.parse(formData.get("orderData") as string || "{}");
    const selectedItems = JSON.parse(formData.get("selectedItems") as string || "[]");
    const reasons = JSON.parse(formData.get("reasons") as string || "{}");
    const notes = JSON.parse(formData.get("notes") as string || "{}");
    const customerNotes = formData.get("customerNotes") as string || "";
    const customerIban = formData.get("customerIban") as string || "";

    if (selectedItems.length === 0) {
      return json({ error: "Vyberte aspoň jeden produkt na vrátenie.", step: "form", order: orderData });
    }

    // Build line items for the return
    const returnLineItems = selectedItems.map((itemId: string) => {
      const item = orderData.lineItems.find((li: any) => li.id === itemId);
      return {
        lineItemId: item.id,
        productTitle: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        quantity: 1,
        pricePerItem: item.price,
        reasonId: reasons[itemId] || undefined,
        customerNote: notes[itemId] || undefined,
      };
    });

    const totalRefund = returnLineItems.reduce((sum: number, item: any) => sum + item.pricePerItem * item.quantity, 0);

    try {
      // Create return in our database
      const returnRequest = await prisma.returnRequest.create({
        data: {
          shop: shopDomain,
          shopifyOrderId: orderData.id,
          shopifyOrderName: orderData.name,
          customerId: orderData.customerId,
          customerEmail: orderData.email,
          customerName: orderData.customerName,
          status: "pending",
          totalRefundAmount: totalRefund,
          currency: orderData.currency,
          customerNotes: customerNotes || null,
          customerIban: customerIban || null,
          lineItems: {
            create: returnLineItems.map((item: any) => ({
              shopifyLineItemId: item.lineItemId,
              productTitle: item.productTitle,
              variantTitle: item.variantTitle || null,
              sku: item.sku || null,
              quantity: item.quantity,
              pricePerItem: item.pricePerItem,
              reasonId: item.reasonId || null,
              customerNote: item.customerNote || null,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: "",
              toStatus: "pending",
              changedBy: "customer",
              note: "Žiadosť vytvorená cez returns portál",
            },
          },
        },
      });

      return json({ step: "success", error: null, returnId: returnRequest.id });
    } catch (err: any) {
      console.error("Return create error:", err);
      return json({ error: "Chyba pri vytváraní žiadosti. Skúste znova.", step: "form", order: orderData });
    }
  }

  return json({ error: "Neplatná akcia", step: "lookup" });
};

export default function ReturnsPortal() {
  const { error: loaderError, shopName, shopDomain, reasons, brandColor } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  if (loaderError) {
    return (
      <html lang="sk">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Obchod nebol nájdený</title>
        </head>
        <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <h1>Obchod nebol nájdený</h1>
            <p>Skontrolujte URL adresu.</p>
          </div>
        </body>
      </html>
    );
  }

  const step = (actionData as any)?.step || "lookup";
  const order = (actionData as any)?.order;
  const error = (actionData as any)?.error;

  return (
    <html lang="sk">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Vrátenie tovaru - {shopName}</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f7; color: #333; min-height: 100vh; }
          .header { background: ${brandColor}; color: white; padding: 20px 0; text-align: center; }
          .header h1 { font-size: 24px; font-weight: 600; }
          .header p { opacity: 0.9; margin-top: 4px; }
          .container { max-width: 700px; margin: 30px auto; padding: 0 20px; }
          .card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
          .form-group input, .form-group select, .form-group textarea {
            width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;
            font-size: 16px; transition: border-color 0.2s;
          }
          .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none; border-color: ${brandColor};
          }
          .btn { display: inline-block; padding: 14px 28px; border-radius: 8px; font-size: 16px;
            font-weight: 600; border: none; cursor: pointer; transition: opacity 0.2s; }
          .btn-primary { background: ${brandColor}; color: white; width: 100%; }
          .btn-primary:hover { opacity: 0.9; }
          .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-secondary { background: #eee; color: #333; }
          .error { background: #fee; border: 1px solid #fcc; color: #c33; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; }
          .success { background: #efe; border: 1px solid #cfc; color: #363; padding: 20px; border-radius: 8px; text-align: center; }
          .product-item { display: flex; align-items: flex-start; gap: 12px; padding: 16px 0; border-bottom: 1px solid #eee; }
          .product-item:last-child { border-bottom: none; }
          .product-img { width: 70px; height: 70px; border-radius: 8px; object-fit: cover; background: #f0f0f0; }
          .product-info { flex: 1; }
          .product-title { font-weight: 600; font-size: 15px; }
          .product-variant { color: #777; font-size: 13px; }
          .product-price { font-weight: 600; color: ${brandColor}; }
          .product-checkbox { margin-top: 4px; width: 20px; height: 20px; accent-color: ${brandColor}; }
          .item-details { margin-top: 10px; padding: 12px; background: #f9f9f9; border-radius: 8px; }
          .item-details select, .item-details textarea { margin-top: 6px; }
          .steps { display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; }
          .step { width: 10px; height: 10px; border-radius: 50%; background: #ddd; }
          .step.active { background: ${brandColor}; }
          .footer { text-align: center; padding: 20px; color: #999; font-size: 13px; }
        `}} />
      </head>
      <body>
        <div className="header">
          <h1>{shopName}</h1>
          <p>Žiadosť o vrátenie / reklamáciu</p>
        </div>

        <div className="container">
          {step === "success" ? (
            <div className="card">
              <div className="success">
                <h2 style={{ marginBottom: 10, fontSize: 22 }}>✅ Žiadosť odoslaná!</h2>
                <p>Vaša žiadosť o vrátenie bola úspešne odoslaná.</p>
                <p style={{ marginTop: 8 }}>Budeme vás kontaktovať na váš email s ďalšími inštrukciami.</p>
              </div>
            </div>
          ) : step === "form" && order ? (
            <ReturnForm
              order={order}
              reasons={reasons}
              error={error}
              isSubmitting={isSubmitting}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              itemReasons={itemReasons}
              setItemReasons={setItemReasons}
              itemNotes={itemNotes}
              setItemNotes={setItemNotes}
            />
          ) : (
            <>
              <div className="steps">
                <div className="step active" />
                <div className="step" />
                <div className="step" />
              </div>
              <div className="card">
                <h2 style={{ marginBottom: 20, fontSize: 20 }}>Vyhľadajte vašu objednávku</h2>
                {error && <div className="error">{error}</div>}
                <Form method="post">
                  <input type="hidden" name="intent" value="lookup" />
                  <div className="form-group">
                    <label>Číslo objednávky</label>
                    <input type="text" name="orderNumber" placeholder="napr. 75501019" required />
                  </div>
                  <div className="form-group">
                    <label>Email použitý pri objednávke</label>
                    <input type="email" name="email" placeholder="vas@email.com" required />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Hľadám..." : "Vyhľadať objednávku"}
                  </button>
                </Form>
              </div>
            </>
          )}
        </div>

        <div className="footer">
          Powered by Artmie Returns Manager
        </div>
      </body>
    </html>
  );
}

function ReturnForm({ order, reasons, error, isSubmitting, selectedItems, setSelectedItems, itemReasons, setItemReasons, itemNotes, setItemNotes }: any) {
  const toggleItem = (itemId: string) => {
    setSelectedItems((prev: string[]) =>
      prev.includes(itemId) ? prev.filter((id: string) => id !== itemId) : [...prev, itemId]
    );
  };

  return (
    <>
      <div className="steps">
        <div className="step active" />
        <div className="step active" />
        <div className="step" />
      </div>

      <Form method="post">
        <input type="hidden" name="intent" value="submit" />
        <input type="hidden" name="orderData" value={JSON.stringify(order)} />
        <input type="hidden" name="selectedItems" value={JSON.stringify(selectedItems)} />
        <input type="hidden" name="reasons" value={JSON.stringify(itemReasons)} />
        <input type="hidden" name="notes" value={JSON.stringify(itemNotes)} />

        <div className="card">
          <h2 style={{ marginBottom: 4, fontSize: 20 }}>Objednávka {order.name}</h2>
          <p style={{ color: "#777", marginBottom: 20, fontSize: 14 }}>{order.email}</p>

          {error && <div className="error">{error}</div>}

          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Vyberte produkty na vrátenie:</h3>

          {order.lineItems.map((item: any) => (
            <div key={item.id}>
              <div className="product-item">
                <input
                  type="checkbox"
                  className="product-checkbox"
                  checked={selectedItems.includes(item.id)}
                  onChange={() => toggleItem(item.id)}
                />
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="product-img" />
                ) : (
                  <div className="product-img" />
                )}
                <div className="product-info">
                  <div className="product-title">{item.title}</div>
                  {item.variantTitle && <div className="product-variant">{item.variantTitle}</div>}
                  {item.sku && <div className="product-variant">SKU: {item.sku}</div>}
                  <div className="product-price">{item.price.toFixed(2)} {item.currency} × {item.quantity}</div>
                </div>
              </div>

              {selectedItems.includes(item.id) && (
                <div className="item-details">
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Dôvod vrátenia:</label>
                  <select
                    value={itemReasons[item.id] || ""}
                    onChange={(e) => setItemReasons((prev: any) => ({ ...prev, [item.id]: e.target.value }))}
                    style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  >
                    <option value="">Vyberte dôvod...</option>
                    {reasons.length > 0 ? (
                      reasons.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))
                    ) : (
                      <>
                        <option value="damaged">Poškodený tovar</option>
                        <option value="wrong_item">Nesprávny tovar</option>
                        <option value="not_as_described">Tovar nezodpovedá popisu</option>
                        <option value="changed_mind">Rozmyslel/a som si</option>
                        <option value="defective">Chybný/nefunkčný tovar</option>
                        <option value="other">Iný dôvod</option>
                      </>
                    )}
                  </select>
                  <label style={{ fontSize: 13, fontWeight: 600, marginTop: 8, display: "block" }}>Popis (voliteľné):</label>
                  <textarea
                    value={itemNotes[item.id] || ""}
                    onChange={(e) => setItemNotes((prev: any) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Opíšte problém..."
                    rows={2}
                    style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="form-group">
            <label>IBAN (číslo účtu pre vrátenie peňazí)</label>
            <input type="text" name="customerIban" placeholder="SK89 0200 0000 0012 3456 7890" />
          </div>
          <div className="form-group">
            <label>Poznámka (voliteľné)</label>
            <textarea name="customerNotes" rows={3} placeholder="Doplňujúce informácie..." />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting || selectedItems.length === 0}>
            {isSubmitting ? "Odosielam..." : `Odoslať žiadosť (${selectedItems.length} ${selectedItems.length === 1 ? "produkt" : "produkty"})`}
          </button>
        </div>
      </Form>
    </>
  );
}
