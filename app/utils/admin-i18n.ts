import { createCookie } from "@remix-run/node";

export const adminLangCookie = createCookie("admin-lang", {
  httpOnly: false,
  secure: false,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
});

export type AdminLang = "sk" | "en";

export async function getAdminLang(request: Request): Promise<AdminLang> {
  const cookieHeader = request.headers.get("Cookie");
  const lang = await adminLangCookie.parse(cookieHeader);
  return lang === "en" ? "en" : "sk";
}

const translations = {
  sk: {
    // Sidebar
    appTitle: "Returns Manager",
    appSubtitle: "Centrálny Admin Panel",
    navDashboard: "Dashboard",
    navTickets: "Nové Tickety",
    navReports: "Reporty",
    navStores: "Obchody",
    navEmbed: "Embed kódy",
    sidebarPending: "Na riešenie",
    typeClaims: "Reklamácie",
    typeReturns: "Vrátenia",
    typeExchanges: "Výmeny",
    typeWithdrawals: "Odstúpenia",
    logout: "Odhlásiť sa",

    // Returns list
    allTickets: "Všetky tickety",
    filterBrand: "Značka",
    filterShop: "Obchod",
    filterStatus: "Stav",
    filterType: "Typ",
    filterReason: "Dôvod",
    filterAll: "Všetky",
    colOrder: "Objednávka",
    colCustomer: "Zákazník",
    colStore: "Obchod",
    colProducts: "Produkty / Dôvod",
    colDate: "Dátum",
    colAmount: "Suma",
    colStatus: "Stav",
    noResults: "Žiadne tickety",
    page: "Strana",
    of: "z",
    prev: "Predchádzajúca",
    next: "Nasledujúca",

    // Status labels
    statusPending: "Čakajúce",
    statusApproved: "Schválené",
    statusRejected: "Zamietnuté",
    statusInTransit: "V preprave",
    statusReceived: "Prijaté",
    statusRefunded: "Refundované",
    statusClosed: "Uzavreté",
    statusCancelled: "Zrušené",
    statusFinished: "Dokončené",

    // Type badges
    badgeClaim: "Reklamácia",
    badgeReturn: "Vrátenie",
    badgeExchange: "Výmena",
    badgeWithdrawal: "Odstúpenie",

    // Dashboard
    dashTitle: "Dashboard",
    dashPending: "Čakajúce",
    dashApproved: "Schválené",
    dashInTransit: "V preprave",
    dashTotal: "Celkom",
    dashRecent: "Posledné tickety",
    dashNone: "Žiadne tickety",

    // Stores
    storesTitle: "Pripojené obchody",
    storesBrand: "Značka",
    storesStatus: "Stav",
    storesInstalled: "Nainštalovaná",
    storesNotInstalled: "Nenainštalovaná",
    storesTotal: "Celkom",
    storesPending: "Čakajúce",
    storesApproved: "Schválené",
    storesTransit: "V preprave",

    // Embed
    embedTitle: "Embed kódy pre Shopify",
    embedInstructions: "Skopíruj iframe kód a vlož ho do Shopify stránky:",
    embedSteps: "Pages → Add page → prepni na HTML (<>) → vlož kód → ulož",
    embedReturns: "Vrátenia / Reklamácie",
    embedWithdrawal: "Odstúpenie od zmluvy",
    embedWithdrawalDesc: "Formulár na zrušenie objednávky pred odoslaním (EU smernica). Objednávka sa automaticky zruší v Shopify.",
    embedOpen: "Otvoriť portál",
    embedCopy: "Kopírovať",
    embedCopied: "Skopírované!",

    // Reports
    reportsTitle: "Reporty",
    reportsFrom: "Od",
    reportsTo: "Do",
    reportsExport: "Exportovať CSV",
    reportsType: "Typ reportu",

    // Detail
    detailBack: "Späť",
    detailOrder: "Objednávka",
    detailCustomer: "Zákazník",
    detailEmail: "Email",
    detailDate: "Dátum",
    detailStatus: "Stav",
    detailProducts: "Produkty",
    detailReason: "Dôvod",
    detailPhotos: "Fotky",
    detailIban: "IBAN",
    detailNotes: "Poznámky",
    detailAdminNotes: "Admin poznámky",
    detailApprove: "Schváliť",
    detailReject: "Zamietnuť",
    detailSave: "Uložiť",
    detailIntake: "Príjem Tovaru",
    detailIntakeYes: "ÁNO",
    detailIntakeNo: "NIE",
    detailCarrier: "Prepravca",
    detailTracking: "Tracking číslo",
    detailWeight: "Hmotnosť (kg)",

    // Login
    loginTitle: "Prihlásenie",
    loginPassword: "Heslo",
    loginButton: "Prihlásiť sa",
    loginError: "Nesprávne heslo",

    // Language
    langLabel: "Jazyk",
  },
  en: {
    // Sidebar
    appTitle: "Returns Manager",
    appSubtitle: "Central Admin Panel",
    navDashboard: "Dashboard",
    navTickets: "New Tickets",
    navReports: "Reports",
    navStores: "Stores",
    navEmbed: "Embed Codes",
    sidebarPending: "Pending",
    typeClaims: "Claims",
    typeReturns: "Returns",
    typeExchanges: "Exchanges",
    typeWithdrawals: "Withdrawals",
    logout: "Log out",

    // Returns list
    allTickets: "All tickets",
    filterBrand: "Brand",
    filterShop: "Store",
    filterStatus: "Status",
    filterType: "Type",
    filterReason: "Reason",
    filterAll: "All",
    colOrder: "Order",
    colCustomer: "Customer",
    colStore: "Store",
    colProducts: "Products / Reason",
    colDate: "Date",
    colAmount: "Amount",
    colStatus: "Status",
    noResults: "No tickets",
    page: "Page",
    of: "of",
    prev: "Previous",
    next: "Next",

    // Status labels
    statusPending: "Pending",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusInTransit: "In Transit",
    statusReceived: "Received",
    statusRefunded: "Refunded",
    statusClosed: "Closed",
    statusCancelled: "Cancelled",
    statusFinished: "Finished",

    // Type badges
    badgeClaim: "Claim",
    badgeReturn: "Return",
    badgeExchange: "Exchange",
    badgeWithdrawal: "Withdrawal",

    // Dashboard
    dashTitle: "Dashboard",
    dashPending: "Pending",
    dashApproved: "Approved",
    dashInTransit: "In Transit",
    dashTotal: "Total",
    dashRecent: "Recent tickets",
    dashNone: "No tickets",

    // Stores
    storesTitle: "Connected Stores",
    storesBrand: "Brand",
    storesStatus: "Status",
    storesInstalled: "Installed",
    storesNotInstalled: "Not Installed",
    storesTotal: "Total",
    storesPending: "Pending",
    storesApproved: "Approved",
    storesTransit: "In Transit",

    // Embed
    embedTitle: "Embed Codes for Shopify",
    embedInstructions: "Copy the iframe code and paste it into a Shopify page:",
    embedSteps: "Pages → Add page → switch to HTML (<>) → paste code → save",
    embedReturns: "Returns / Claims",
    embedWithdrawal: "Contract Withdrawal",
    embedWithdrawalDesc: "Order cancellation form before shipment (EU directive). Order is automatically cancelled in Shopify.",
    embedOpen: "Open portal",
    embedCopy: "Copy",
    embedCopied: "Copied!",

    // Reports
    reportsTitle: "Reports",
    reportsFrom: "From",
    reportsTo: "To",
    reportsExport: "Export CSV",
    reportsType: "Report type",

    // Detail
    detailBack: "Back",
    detailOrder: "Order",
    detailCustomer: "Customer",
    detailEmail: "Email",
    detailDate: "Date",
    detailStatus: "Status",
    detailProducts: "Products",
    detailReason: "Reason",
    detailPhotos: "Photos",
    detailIban: "IBAN",
    detailNotes: "Notes",
    detailAdminNotes: "Admin notes",
    detailApprove: "Approve",
    detailReject: "Reject",
    detailSave: "Save",
    detailIntake: "Goods Intake",
    detailIntakeYes: "YES",
    detailIntakeNo: "NO",
    detailCarrier: "Carrier",
    detailTracking: "Tracking number",
    detailWeight: "Weight (kg)",

    // Login
    loginTitle: "Login",
    loginPassword: "Password",
    loginButton: "Log in",
    loginError: "Incorrect password",

    // Language
    langLabel: "Language",
  },
} as const;

export type AdminT = typeof translations.sk;

export function getAdminT(lang: AdminLang): AdminT {
  return translations[lang];
}

export function getStatusLabel(status: string, lang: AdminLang): string {
  const t = translations[lang];
  const map: Record<string, string> = {
    pending: t.statusPending,
    approved: t.statusApproved,
    rejected: t.statusRejected,
    in_transit: t.statusInTransit,
    received: t.statusReceived,
    refunded: t.statusRefunded,
    closed: t.statusClosed,
    cancelled: t.statusCancelled,
    finished: t.statusFinished,
  };
  return map[status] || status;
}
