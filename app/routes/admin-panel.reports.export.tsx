import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireAdminAuth, getStoreName, getStoreBrand, STORE_NAMES } from "../utils/admin-auth.server";
import { prisma } from "../db.server";

// Detect return type from customerNote
function detectReturnType(note: string): string {
  if (!note) return "";
  const lower = note.toLowerCase();
  if (note.startsWith("Reklamácia") || lower.includes("defective") || lower.includes("damaged") || lower.includes("wrong") || lower.includes("missing") || lower.includes("nekvalitný") || lower.includes("poškodený")) return "Reklamácia";
  if (note.startsWith("Vrátenie") || lower.includes("does not fit") || lower.includes("changed mind") || lower.includes("not as described") || lower.includes("odstúpenie")) return "Vrátenie";
  if (note.startsWith("Výmena") || lower.includes("exchange") || lower.includes("výmena")) return "Výmena";
  return "";
}

// Parse resolution type from adminNotes
function parseResolution(notes: string): string {
  if (!notes) return "";
  if (notes.includes("Posielame nový tovar")) return "Nový tovar";
  if (notes.includes("Vraciame čiastku")) return "Vrátenie čiastky";
  if (notes.includes("Riešenie voucherom") || notes.includes("Voucher")) return "Voucher";
  if (notes.includes("nasledujúcej objednávke")) return "Pri ďalšej obj.";
  return "";
}

// Parse claim module details from adminNotes
function parseClaimDetails(notes: string): Record<string, string> {
  const defaults: Record<string, string> = {
    faultSource: "", sendNewProduct: "", pickupRequired: "",
    orderCancelled: "", payBack: "", carrierClaim: "",
  };
  if (!notes || !notes.includes("[MODUL REKLAMÁCIE]")) return defaults;
  const block = notes.match(/\[MODUL REKLAMÁCIE\]([\s\S]*?)(?=\n---|\n\[|$)/);
  if (!block) return defaults;
  const text = block[1];
  defaults.faultSource = text.match(/Chyba zo strany: (.+)/)?.[1]?.replace("—", "").trim() || "";
  defaults.sendNewProduct = text.includes("Poslanie nového produktu: ÁNO") ? "Áno" : "Nie";
  defaults.pickupRequired = text.includes("Vyzdvihnutie: ÁNO") ? "Áno" : "Nie";
  defaults.orderCancelled = text.includes("Zrušená objednávka: ÁNO") ? "Áno" : "Nie";
  defaults.payBack = text.includes("Pay back: ÁNO") ? "Áno" : "Nie";
  defaults.carrierClaim = text.includes("Reklamácia u prepravcu: ÁNO") ? "Áno" : "Nie";
  return defaults;
}

// CSV helper - escape values properly
function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

// BOM for UTF-8 Excel compatibility
const UTF8_BOM = "\uFEFF";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const url = new URL(request.url);
  const reportType = url.searchParams.get("type") || "all-returns";
  const dateFrom = url.searchParams.get("from") || "";
  const dateTo = url.searchParams.get("to") || "";
  const shopFilter = url.searchParams.get("shop") || "all";
  const brandFilter = url.searchParams.get("brand") || "all";
  const statusFilter = url.searchParams.get("status") || "all";

  // Build WHERE clause
  const where: any = {};

  if (dateFrom) {
    where.createdAt = { ...where.createdAt, gte: new Date(dateFrom + "T00:00:00Z") };
  }
  if (dateTo) {
    where.createdAt = { ...where.createdAt, lte: new Date(dateTo + "T23:59:59Z") };
  }
  if (shopFilter !== "all") {
    where.shop = shopFilter;
  }
  if (brandFilter !== "all") {
    const brandShops = Object.keys(STORE_NAMES).filter((shop) => {
      const name = STORE_NAMES[shop];
      if (brandFilter === "papilora") return name.startsWith("Papilora");
      if (brandFilter === "artmie") return name.startsWith("Artmie");
      return false;
    });
    if (brandShops.length > 0 && shopFilter === "all") {
      where.shop = { in: brandShops };
    }
  }
  if (statusFilter !== "all") {
    where.status = statusFilter;
  }

  let csv = "";
  let filename = "";

  switch (reportType) {
    case "all-returns": {
      csv = await generateAllReturnsCSV(where);
      filename = `vratenia-vsetky-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    case "accounting": {
      csv = await generateAccountingCSV(where);
      filename = `uctovny-report-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    case "products": {
      csv = await generateProductsCSV(where);
      filename = `produkty-vratenia-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    case "reasons": {
      csv = await generateReasonsCSV(where);
      filename = `dovody-vrateni-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    case "monthly": {
      csv = await generateMonthlyCSV(where);
      filename = `mesacny-prehlad-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    case "customers": {
      csv = await generateCustomersCSV(where);
      filename = `zakaznici-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      break;
    }
    default:
      return new Response("Unknown report type", { status: 400 });
  }

  return new Response(UTF8_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};

// ── 1. All returns ──────────────────────────────────────────────────────

async function generateAllReturnsCSV(where: any): Promise<string> {
  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      lineItems: { include: { reason: true } },
      photos: true,
    },
  });

  const header = csvRow([
    "ID", "Obchod", "Znacka", "Objednavka", "Datum vytvorenia", "Status",
    "Typ", "Riesenie",
    "Zakaznik - meno", "Zakaznik - email", "IBAN",
    "Produkty", "SKU", "Dovody", "Poznamka zakaznika",
    "Pocet produktov", "Celkova suma", "Mena",
    "Refundovana suma",
    "Intake Smema", "Intake datum",
    "Tracking", "Dopravca",
    "Chyba zo strany", "Novy produkt", "Vyzdvihnutie", "Zrusena obj.", "Pay back", "Reklamacia u prepravcu",
    "Poznamky admin",
    "Pocet fotiek", "Schvalene", "Zamietnute", "Prijate", "Refundovane", "Ukoncene",
  ]);

  const rows = returns.map((r) => {
    const products = r.lineItems.map((li) => li.productTitle).join("; ");
    const skus = r.lineItems.map((li) => li.sku || "").filter(Boolean).join("; ");
    const reasons = r.lineItems.map((li) => {
      const firstLine = li.customerNote?.split("\n")[0] || li.reason?.label || "";
      return firstLine;
    }).filter(Boolean).join("; ");
    const customerItemNotes = r.lineItems.map((li) => {
      const lines = li.customerNote?.split("\n") || [];
      return lines.slice(1).join(" ").trim();
    }).filter(Boolean).join("; ");
    const totalItems = r.lineItems.reduce((sum, li) => sum + li.quantity, 0);
    const totalValue = r.lineItems.reduce((sum, li) => sum + li.pricePerItem * li.quantity, 0);

    // Detect type from first lineItem
    const returnType = r.lineItems.map((li) => detectReturnType(li.customerNote?.split("\n")[0] || "")).find(Boolean) || "";
    const resolution = parseResolution(r.adminNotes || "");
    const claim = parseClaimDetails(r.adminNotes || "");

    return csvRow([
      r.id,
      getStoreName(r.shop),
      getStoreBrand(r.shop),
      r.shopifyOrderName,
      new Date(r.createdAt).toLocaleDateString("sk-SK"),
      r.status,
      returnType,
      resolution,
      r.customerName,
      r.customerEmail,
      r.customerIban || "",
      products,
      skus,
      reasons,
      customerItemNotes || r.customerNotes || "",
      totalItems,
      totalValue.toFixed(2),
      r.currency,
      r.totalRefundAmount?.toFixed(2) || "",
      r.intakeCompleted ? "Áno" : "Nie",
      r.intakeCompletedAt ? new Date(r.intakeCompletedAt).toLocaleDateString("sk-SK") : "",
      r.trackingNumber || "",
      r.shippingCarrier || "",
      claim.faultSource,
      claim.sendNewProduct,
      claim.pickupRequired,
      claim.orderCancelled,
      claim.payBack,
      claim.carrierClaim,
      r.adminNotes || "",
      r.photos.length,
      r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("sk-SK") : "",
      r.rejectedAt ? new Date(r.rejectedAt).toLocaleDateString("sk-SK") : "",
      r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("sk-SK") : "",
      r.refundedAt ? new Date(r.refundedAt).toLocaleDateString("sk-SK") : "",
      r.closedAt ? new Date(r.closedAt).toLocaleDateString("sk-SK") : "",
    ]);
  });

  return [header, ...rows].join("\n");
}

// ── 2. Accounting report ────────────────────────────────────────────────

async function generateAccountingCSV(where: any): Promise<string> {
  // Focus on approved/refunded returns with financial data
  const accountingWhere = {
    ...where,
    status: where.status || { in: ["approved", "refunded", "closed"] },
  };

  const returns = await prisma.returnRequest.findMany({
    where: accountingWhere,
    orderBy: { createdAt: "desc" },
    include: {
      lineItems: true,
    },
  });

  const header = csvRow([
    "Objednavka", "Obchod", "Znacka", "Datum",
    "Typ", "Riesenie",
    "Zakaznik", "Email", "IBAN",
    "Status", "Hodnota tovaru", "Refundovana suma", "Mena",
    "Dobropis info", "Cislo reklamacie",
    "Voucher kod", "Voucher hodnota",
    "Tracking", "Dopravca",
    "Schvalene dna", "Refundovane dna", "Ukoncene dna",
  ]);

  const rows = returns.map((r) => {
    const totalValue = r.lineItems.reduce((sum, li) => sum + li.pricePerItem * li.quantity, 0);
    const notes = r.adminNotes || "";
    const returnType = r.lineItems.map((li) => detectReturnType(li.customerNote?.split("\n")[0] || "")).find(Boolean) || "";
    const resolution = parseResolution(notes);

    // Extract credit note and claim number from admin notes
    const creditNoteMatch = notes.match(/Dobropis:\s*(.+?)(?:\n|$)/);
    const claimMatch = notes.match(/[Cc]\.\s*reklamácie:\s*(.+?)(?:\n|$)/i) || notes.match(/Č\. reklamácie:\s*(.+?)(?:\n|$)/);
    const voucherCodeMatch = notes.match(/Kód voucheru:\s*(.+?)(?:\n|$)/);
    const voucherAmountMatch = notes.match(/hodnota:\s*(.+?)(?:\n|$)/);

    return csvRow([
      r.shopifyOrderName,
      getStoreName(r.shop),
      getStoreBrand(r.shop),
      new Date(r.createdAt).toLocaleDateString("sk-SK"),
      returnType,
      resolution,
      r.customerName,
      r.customerEmail,
      r.customerIban || "",
      r.status,
      totalValue.toFixed(2),
      r.totalRefundAmount?.toFixed(2) || "",
      r.currency,
      creditNoteMatch?.[1]?.trim() || "",
      claimMatch?.[1]?.trim() || "",
      voucherCodeMatch?.[1]?.trim() || "",
      voucherAmountMatch?.[1]?.trim() || "",
      r.trackingNumber || "",
      r.shippingCarrier || "",
      r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("sk-SK") : "",
      r.refundedAt ? new Date(r.refundedAt).toLocaleDateString("sk-SK") : "",
      r.closedAt ? new Date(r.closedAt).toLocaleDateString("sk-SK") : "",
    ]);
  });

  return [header, ...rows].join("\n");
}

// ── 3. Products report ──────────────────────────────────────────────────

async function generateProductsCSV(where: any): Promise<string> {
  const returns = await prisma.returnRequest.findMany({
    where,
    include: { lineItems: true },
  });

  // Aggregate by product
  const productMap = new Map<string, {
    title: string; sku: string; count: number; totalValue: number;
    reasons: Record<string, number>; shops: Set<string>;
  }>();

  for (const r of returns) {
    for (const li of r.lineItems) {
      const key = li.sku || li.productTitle;
      const existing = productMap.get(key) || {
        title: li.productTitle, sku: li.sku || "", count: 0, totalValue: 0,
        reasons: {}, shops: new Set<string>(),
      };
      existing.count += li.quantity;
      existing.totalValue += li.pricePerItem * li.quantity;
      existing.shops.add(r.shop);
      const reason = li.customerNote?.split("\n")[0] || "Neuvedeny";
      existing.reasons[reason] = (existing.reasons[reason] || 0) + 1;
      productMap.set(key, existing);
    }
  }

  // Sort by count desc
  const sorted = Array.from(productMap.values()).sort((a, b) => b.count - a.count);

  const header = csvRow([
    "Produkt", "SKU", "Pocet vrateni", "Celkova hodnota",
    "Hlavny dovod", "Pocet dovodov", "Obchody",
  ]);

  const rows = sorted.map((p) => {
    const topReason = Object.entries(p.reasons).sort((a, b) => b[1] - a[1])[0];
    const shopNames = Array.from(p.shops).map(getStoreName).join("; ");

    return csvRow([
      p.title,
      p.sku,
      p.count,
      p.totalValue.toFixed(2),
      topReason ? `${topReason[0]} (${topReason[1]}x)` : "",
      Object.keys(p.reasons).length,
      shopNames,
    ]);
  });

  return [header, ...rows].join("\n");
}

// ── 4. Reasons report ───────────────────────────────────────────────────

async function generateReasonsCSV(where: any): Promise<string> {
  const returns = await prisma.returnRequest.findMany({
    where,
    include: { lineItems: true },
  });

  // Aggregate by reason per shop
  const reasonMap = new Map<string, {
    reason: string; type: string; total: number; shops: Record<string, number>;
    totalValue: number;
  }>();

  for (const r of returns) {
    for (const li of r.lineItems) {
      const reason = li.customerNote?.split("\n")[0] || "Neuvedeny";
      const rType = detectReturnType(reason);
      const shopName = getStoreName(r.shop);
      const existing = reasonMap.get(reason) || {
        reason, type: rType, total: 0, shops: {}, totalValue: 0,
      };
      existing.total += li.quantity;
      existing.totalValue += li.pricePerItem * li.quantity;
      existing.shops[shopName] = (existing.shops[shopName] || 0) + li.quantity;
      reasonMap.set(reason, existing);
    }
  }

  const sorted = Array.from(reasonMap.values()).sort((a, b) => b.total - a.total);

  // Get all shop names for columns
  const allShops = new Set<string>();
  for (const r of sorted) {
    for (const shop of Object.keys(r.shops)) allShops.add(shop);
  }
  const shopList = Array.from(allShops).sort();

  const header = csvRow([
    "Dovod", "Typ", "Celkom", "Celkova hodnota", ...shopList,
  ]);

  const rows = sorted.map((r) =>
    csvRow([
      r.reason,
      r.type,
      r.total,
      r.totalValue.toFixed(2),
      ...shopList.map((shop) => r.shops[shop] || 0),
    ])
  );

  return [header, ...rows].join("\n");
}

// ── 5. Monthly summary ──────────────────────────────────────────────────

async function generateMonthlyCSV(where: any): Promise<string> {
  const returns = await prisma.returnRequest.findMany({
    where,
    include: { lineItems: true },
    orderBy: { createdAt: "asc" },
  });

  // Aggregate by month + shop
  const monthMap = new Map<string, {
    month: string; shops: Record<string, { count: number; value: number }>;
    totalCount: number; totalValue: number;
  }>();

  for (const r of returns) {
    const d = new Date(r.createdAt);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const shopName = getStoreName(r.shop);
    const value = r.lineItems.reduce((sum, li) => sum + li.pricePerItem * li.quantity, 0);

    const existing = monthMap.get(month) || {
      month, shops: {}, totalCount: 0, totalValue: 0,
    };
    if (!existing.shops[shopName]) existing.shops[shopName] = { count: 0, value: 0 };
    existing.shops[shopName].count += 1;
    existing.shops[shopName].value += value;
    existing.totalCount += 1;
    existing.totalValue += value;
    monthMap.set(month, existing);
  }

  const sorted = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  // Get all shops
  const allShops = new Set<string>();
  for (const m of sorted) {
    for (const shop of Object.keys(m.shops)) allShops.add(shop);
  }
  const shopList = Array.from(allShops).sort();

  // Two columns per shop: count and value
  const shopHeaders: string[] = [];
  for (const shop of shopList) {
    shopHeaders.push(`${shop} - pocet`, `${shop} - suma`);
  }

  const header = csvRow(["Mesiac", "Celkom pocet", "Celkom suma", ...shopHeaders]);

  const rows = sorted.map((m) =>
    csvRow([
      m.month,
      m.totalCount,
      m.totalValue.toFixed(2),
      ...shopList.flatMap((shop) => [
        m.shops[shop]?.count || 0,
        m.shops[shop]?.value?.toFixed(2) || "0.00",
      ]),
    ])
  );

  return [header, ...rows].join("\n");
}

// ── 6. Customers report ─────────────────────────────────────────────────

async function generateCustomersCSV(where: any): Promise<string> {
  const returns = await prisma.returnRequest.findMany({
    where,
    include: { lineItems: true },
  });

  // Aggregate by customer email
  const customerMap = new Map<string, {
    email: string; name: string; iban: string;
    returnCount: number; totalValue: number;
    shops: Set<string>; statuses: Record<string, number>;
    types: Record<string, number>;
    firstReturn: Date; lastReturn: Date;
  }>();

  for (const r of returns) {
    const key = r.customerEmail.toLowerCase();
    const value = r.lineItems.reduce((sum, li) => sum + li.pricePerItem * li.quantity, 0);
    const rType = r.lineItems.map((li) => detectReturnType(li.customerNote?.split("\n")[0] || "")).find(Boolean) || "Neurčený";
    const existing = customerMap.get(key) || {
      email: r.customerEmail, name: r.customerName, iban: r.customerIban || "",
      returnCount: 0, totalValue: 0,
      shops: new Set<string>(), statuses: {}, types: {},
      firstReturn: r.createdAt, lastReturn: r.createdAt,
    };
    existing.returnCount += 1;
    existing.totalValue += value;
    existing.shops.add(getStoreName(r.shop));
    existing.statuses[r.status] = (existing.statuses[r.status] || 0) + 1;
    existing.types[rType] = (existing.types[rType] || 0) + 1;
    if (r.customerName && !existing.name) existing.name = r.customerName;
    if (r.customerIban && !existing.iban) existing.iban = r.customerIban;
    if (new Date(r.createdAt) < new Date(existing.firstReturn)) existing.firstReturn = r.createdAt;
    if (new Date(r.createdAt) > new Date(existing.lastReturn)) existing.lastReturn = r.createdAt;
    customerMap.set(key, existing);
  }

  // Sort by return count desc
  const sorted = Array.from(customerMap.values()).sort((a, b) => b.returnCount - a.returnCount);

  const header = csvRow([
    "Zakaznik", "Email", "IBAN", "Pocet vrateni", "Celkova hodnota",
    "Reklamacie", "Vratenia", "Vymeny",
    "Obchody", "Prve vratenie", "Posledne vratenie",
    "Cakajuce", "Schvalene", "Zamietnute", "Refundovane", "Ukoncene",
  ]);

  const rows = sorted.map((c) =>
    csvRow([
      c.name,
      c.email,
      c.iban,
      c.returnCount,
      c.totalValue.toFixed(2),
      c.types["Reklamácia"] || 0,
      c.types["Vrátenie"] || 0,
      c.types["Výmena"] || 0,
      Array.from(c.shops).join("; "),
      new Date(c.firstReturn).toLocaleDateString("sk-SK"),
      new Date(c.lastReturn).toLocaleDateString("sk-SK"),
      c.statuses["pending"] || 0,
      c.statuses["approved"] || 0,
      c.statuses["rejected"] || 0,
      c.statuses["refunded"] || 0,
      c.statuses["finished"] || 0,
    ])
  );

  return [header, ...rows].join("\n");
}
