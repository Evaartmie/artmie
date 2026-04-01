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
      // Find ALL sessions for this shop
      const sessions = await prisma.session.findMany({
        where: { shop: shopDomain },
      });

      if (sessions.length === 0) {
        return json({ error: `Store nie je pripojený. Žiadne sessions v databáze pre ${shopDomain}.`, step: "lookup" });
      }

      // Show ALL sessions for debug
      const allSessionsDebug = sessions.map(s =>
        `[${s.id}] online=${s.isOnline} scope=${s.scope || 'none'} token=${s.accessToken ? s.accessToken.substring(0, 10) + '...' : 'NONE'} expires=${s.expires || 'never'}`
      ).join(" || ");

      // Try EVERY session token until one works
      let workingSession: any = null;
      let workingCount = 0;
      const triedTokens: string[] = [];

      for (const sess of sessions) {
        if (!sess.accessToken) continue;
        const tokenPreview = sess.accessToken.substring(0, 10) + "...";
        try {
          const testUrl = `https://${shopDomain}/admin/api/2025-04/orders/count.json?status=any`;
          const testResp = await fetch(testUrl, {
            headers: { "X-Shopify-Access-Token": sess.accessToken },
          });
          triedTokens.push(`${sess.id}=${testResp.status}`);
          if (testResp.status === 200) {
            const testData = await testResp.json();
            workingSession = sess;
            workingCount = testData.count || 0;
            break;
          }
        } catch (e) {
          triedTokens.push(`${sess.id}=error`);
        }
      }

      if (!workingSession) {
        return json({
          error: `Žiadny token nefunguje! Sessions(${sessions.length}): ${allSessionsDebug}. Tried: ${triedTokens.join(", ")}`,
          step: "lookup"
        });
      }

      const session = workingSession;
      const totalOrders = workingCount;
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

      let order = data.orders?.[0];

      if (!order) {
        // Debug: fetch last 5 orders to see what's available
        const debugUrl = `https://${shopDomain}/admin/api/2025-04/orders.json?status=any&limit=5`;
        const debugResp = await fetch(debugUrl, {
          headers: { "X-Shopify-Access-Token": session.accessToken },
        });
        const debugData = await debugResp.json();
        const recentNames = (debugData.orders || []).map((o: any) => `${o.name}(${o.id})`).join(", ");
        return json({
          error: `Objednávka nebola nájdená. Total orders: ${totalOrders}. Posledné: ${recentNames || "žiadne"}. Session: ${session.id}`,
          step: "lookup"
        });
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

      // Fetch product images for all line items
      const productIds = [...new Set((order.line_items || []).map((item: any) => item.product_id).filter(Boolean))];
      const productImages: Record<string, string> = {};

      // Fetch images in batches (max 250 per request via REST)
      if (productIds.length > 0) {
        try {
          const idsParam = productIds.join(",");
          const productsUrl = `https://${shopDomain}/admin/api/2025-04/products.json?ids=${idsParam}&fields=id,image,images`;
          const productsResp = await fetch(productsUrl, {
            headers: { "X-Shopify-Access-Token": session.accessToken },
          });
          if (productsResp.ok) {
            const productsData = await productsResp.json();
            for (const product of (productsData.products || [])) {
              if (product.image?.src) {
                productImages[String(product.id)] = product.image.src;
              } else if (product.images?.[0]?.src) {
                productImages[String(product.id)] = product.images[0].src;
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch product images:", e);
        }
      }

      // Map line items with images
      const lineItems = (order.line_items || []).map((item: any) => ({
        id: String(item.id),
        title: item.title || "",
        variantTitle: item.variant_title || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        price: parseFloat(item.price || "0"),
        currency: order.currency || "EUR",
        imageUrl: productImages[String(item.product_id)] || "",
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
    const photoMapping = JSON.parse(formData.get("photoMapping") as string || "{}");

    // Collect uploaded photos per item
    const uploadedPhotos: Record<string, { fileName: string; data: string; mimeType: string; size: number }[]> = {};
    for (const [itemId, fieldNames] of Object.entries(photoMapping) as [string, string[]][]) {
      uploadedPhotos[itemId] = [];
      for (const fieldName of fieldNames) {
        const file = formData.get(fieldName);
        if (file && file instanceof File && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const base64 = buffer.toString("base64");
          uploadedPhotos[itemId].push({
            fileName: file.name,
            data: `data:${file.type};base64,${base64}`,
            mimeType: file.type,
            size: file.size,
          });
        }
      }
    }

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

      // Save uploaded photos
      const allPhotos: { returnRequestId: string; fileName: string; fileUrl: string; fileSize: number; mimeType: string }[] = [];
      for (const [itemId, photos] of Object.entries(uploadedPhotos)) {
        for (const photo of photos) {
          allPhotos.push({
            returnRequestId: returnRequest.id,
            fileName: photo.fileName,
            fileUrl: photo.data, // base64 data URL
            fileSize: photo.size,
            mimeType: photo.mimeType,
          });
        }
      }
      if (allPhotos.length > 0) {
        await prisma.returnPhoto.createMany({ data: allPhotos });
      }

      return json({ step: "success", error: null, returnId: returnRequest.id, photosUploaded: allPhotos.length });
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
  const [itemPhotos, setItemPhotos] = useState<Record<string, { file: File; preview: string }[]>>({});

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
          .photo-upload-area { margin-top: 8px; }
          .photo-previews { display: flex; gap: 10px; flex-wrap: wrap; }
          .photo-preview { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #e0e0e0; }
          .photo-preview img { width: 100%; height: 100%; object-fit: cover; }
          .photo-remove { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; }
          .photo-remove:hover { background: rgba(200,0,0,0.8); }
          .photo-add { width: 80px; height: 80px; border-radius: 8px; border: 2px dashed #ccc; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
          .photo-add:hover { border-color: ${brandColor}; background: #f5f0fa; }
          .photo-add-icon { font-size: 24px; color: #999; line-height: 1; }
          .photo-add:hover .photo-add-icon { color: ${brandColor}; }
          .photo-add-text { font-size: 10px; color: #999; margin-top: 4px; }
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
              itemPhotos={itemPhotos}
              setItemPhotos={setItemPhotos}
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

function ReturnForm({ order, reasons, error, isSubmitting, selectedItems, setSelectedItems, itemReasons, setItemReasons, itemNotes, setItemNotes, itemPhotos, setItemPhotos }: any) {
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

      <Form method="post" encType="multipart/form-data">
        <input type="hidden" name="intent" value="submit" />
        <input type="hidden" name="orderData" value={JSON.stringify(order)} />
        <input type="hidden" name="selectedItems" value={JSON.stringify(selectedItems)} />
        <input type="hidden" name="reasons" value={JSON.stringify(itemReasons)} />
        <input type="hidden" name="notes" value={JSON.stringify(itemNotes)} />
        <input type="hidden" name="photoMapping" value={JSON.stringify(
          Object.fromEntries(
            Object.entries(itemPhotos).map(([itemId, photos]: [string, any[]]) => [
              itemId,
              photos.map((_: any, idx: number) => `photo_${itemId}_${idx}`)
            ])
          )
        )} />

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

                  <label style={{ fontSize: 13, fontWeight: 600, marginTop: 12, display: "block" }}>
                    Fotky poškodenia (max 4):
                  </label>
                  <div className="photo-upload-area">
                    <div className="photo-previews">
                      {(itemPhotos[item.id] || []).map((photo: any, idx: number) => (
                        <div key={idx} className="photo-preview">
                          <img src={photo.preview} alt={`Foto ${idx + 1}`} />
                          <button
                            type="button"
                            className="photo-remove"
                            onClick={() => {
                              URL.revokeObjectURL(photo.preview);
                              setItemPhotos((prev: any) => ({
                                ...prev,
                                [item.id]: (prev[item.id] || []).filter((_: any, i: number) => i !== idx),
                              }));
                            }}
                          >×</button>
                        </div>
                      ))}
                      {(itemPhotos[item.id] || []).length < 4 && (
                        <label className="photo-add">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              const currentPhotos = itemPhotos[item.id] || [];
                              const remaining = 4 - currentPhotos.length;
                              const newPhotos = files.slice(0, remaining).map(file => ({
                                file,
                                preview: URL.createObjectURL(file),
                              }));
                              setItemPhotos((prev: any) => ({
                                ...prev,
                                [item.id]: [...currentPhotos, ...newPhotos],
                              }));
                              e.target.value = "";
                            }}
                          />
                          <span className="photo-add-icon">+</span>
                          <span className="photo-add-text">Pridať foto</span>
                        </label>
                      )}
                    </div>
                  </div>
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

          {/* Hidden file inputs for photo uploads */}
          <div style={{ display: "none" }}>
            {Object.entries(itemPhotos).map(([itemId, photos]: [string, any[]]) =>
              photos.map((photo: any, idx: number) => {
                const dt = new DataTransfer();
                dt.items.add(photo.file);
                return (
                  <input
                    key={`photo_${itemId}_${idx}`}
                    type="file"
                    name={`photo_${itemId}_${idx}`}
                    ref={(el) => { if (el) el.files = dt.files; }}
                  />
                );
              })
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting || selectedItems.length === 0}>
            {isSubmitting ? "Odosielam..." : `Odoslať žiadosť (${selectedItems.length} ${selectedItems.length === 1 ? "produkt" : "produkty"})`}
          </button>
        </div>
      </Form>
    </>
  );
}
