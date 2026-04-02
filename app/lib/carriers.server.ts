// ── Carrier Configuration ────────────────────────────────────────────────
// Maps shop domains to countries and available carriers per country.
// API keys will be added via environment variables when available.

export type CarrierCode = "sps_sk" | "gls_sk" | "packeta_sk" | "ppl_cz" | "gls_hu" | "fancourier_ro" | "dpd_hr" | "dpd_bg" | "dpd_ba" | "dpd_si" | "dhl_de" | "brt_it" | "acs_gr";

export interface CarrierConfig {
  code: CarrierCode;
  name: string;
  country: string;
  logo: string; // emoji
  apiConfigured: boolean;
  trackingUrlTemplate?: string; // {tracking} placeholder
}

export interface ShipmentResult {
  success: boolean;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string; // PDF URL or base64
  error?: string;
}

// ── Carrier definitions ─────────────────────────────────────────────────

export const CARRIERS: Record<CarrierCode, CarrierConfig> = {
  sps_sk: {
    code: "sps_sk",
    name: "Slovak Parcel Service (SPS/InTime)",
    country: "SK",
    logo: "📮",
    apiConfigured: !!process.env.SPS_API_KEY,
    trackingUrlTemplate: "https://www.sps-sro.sk/tracking/?id={tracking}",
  },
  gls_sk: {
    code: "gls_sk",
    name: "GLS Slovakia",
    country: "SK",
    logo: "🟡",
    apiConfigured: !!process.env.GLS_SK_API_KEY,
    trackingUrlTemplate: "https://gls-group.eu/SK/sk/sledovanie-zasielok?match={tracking}",
  },
  packeta_sk: {
    code: "packeta_sk",
    name: "Packeta (Zásielkovňa)",
    country: "SK",
    logo: "📦",
    apiConfigured: !!process.env.PACKETA_API_KEY,
    trackingUrlTemplate: "https://tracking.packeta.com/sk/?id={tracking}",
  },
  ppl_cz: {
    code: "ppl_cz",
    name: "PPL CZ",
    country: "CZ",
    logo: "🔵",
    apiConfigured: !!process.env.PPL_CZ_API_KEY,
    trackingUrlTemplate: "https://www.ppl.cz/vyhledat-zasilku?shipmentId={tracking}",
  },
  gls_hu: {
    code: "gls_hu",
    name: "GLS Hungary",
    country: "HU",
    logo: "🟡",
    apiConfigured: !!process.env.GLS_HU_API_KEY,
    trackingUrlTemplate: "https://gls-group.eu/HU/hu/csomagkovetes?match={tracking}",
  },
  fancourier_ro: {
    code: "fancourier_ro",
    name: "FAN Courier",
    country: "RO",
    logo: "🟠",
    apiConfigured: !!process.env.FANCOURIER_API_KEY,
    trackingUrlTemplate: "https://www.fancourier.ro/awb-tracking/?tracking={tracking}",
  },
  dpd_hr: {
    code: "dpd_hr",
    name: "DPD Croatia",
    country: "HR",
    logo: "🔴",
    apiConfigured: !!process.env.DPD_HR_API_KEY,
    trackingUrlTemplate: "https://tracking.dpd.de/parcelstatus?query={tracking}&locale=hr_HR",
  },
  dpd_bg: {
    code: "dpd_bg",
    name: "DPD / Speedy Bulgaria",
    country: "BG",
    logo: "🔴",
    apiConfigured: !!process.env.DPD_BG_API_KEY,
    trackingUrlTemplate: "https://tracking.dpd.de/parcelstatus?query={tracking}&locale=bg_BG",
  },
  dpd_ba: {
    code: "dpd_ba",
    name: "DPD Bosnia",
    country: "BA",
    logo: "🔴",
    apiConfigured: !!process.env.DPD_BA_API_KEY,
    trackingUrlTemplate: "https://tracking.dpd.de/parcelstatus?query={tracking}",
  },
  dpd_si: {
    code: "dpd_si",
    name: "DPD Slovenia",
    country: "SI",
    logo: "🔴",
    apiConfigured: !!process.env.DPD_SI_API_KEY,
    trackingUrlTemplate: "https://tracking.dpd.de/parcelstatus?query={tracking}&locale=sl_SI",
  },
  dhl_de: {
    code: "dhl_de",
    name: "DHL Germany",
    country: "DE",
    logo: "🟡",
    apiConfigured: !!process.env.DHL_DE_API_KEY,
    trackingUrlTemplate: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}",
  },
  brt_it: {
    code: "brt_it",
    name: "BRT Italy",
    country: "IT",
    logo: "🟤",
    apiConfigured: !!process.env.BRT_IT_API_KEY,
    trackingUrlTemplate: "https://vas.brt.it/vas/sped_det_show.hsm?reflab={tracking}",
  },
  acs_gr: {
    code: "acs_gr",
    name: "ACS Greece",
    country: "GR",
    logo: "🔵",
    apiConfigured: !!process.env.ACS_GR_API_KEY,
    trackingUrlTemplate: "https://www.acscourier.net/el/track-and-trace?p_p_id=ACSCustomerServicesPortlet&nummer={tracking}",
  },
};

// ── Shop → Country mapping ──────────────────────────────────────────────

const SHOP_COUNTRY: Record<string, string> = {
  // Papilora
  "papilora.myshopify.com": "SK",
  "papilora-cz.myshopify.com": "CZ",
  "papilora-hu.myshopify.com": "HU",
  "papilora-ro.myshopify.com": "RO",
  "papilora-bg.myshopify.com": "BG",
  "papilora-ba.myshopify.com": "BA",
  "papilora-rs.myshopify.com": "RS",
  "papilora-mk.myshopify.com": "MK",
  "papilora-hr.myshopify.com": "HR",
  "papilora-si.myshopify.com": "SI",
  "papilora-gr.myshopify.com": "GR",
  "papilora-it.myshopify.com": "IT",
  "papilora-pl.myshopify.com": "PL",
  // Artmie
  "20a254-6e.myshopify.com": "SK",
  "artmie.myshopify.com": "SK",
  "cz-artmie.myshopify.com": "CZ",
  "artmie-cz.myshopify.com": "CZ",
  "hu-artmie.myshopify.com": "HU",
  "artmie-hu.myshopify.com": "HU",
  "ro-artmie.myshopify.com": "RO",
  "artmie-ro.myshopify.com": "RO",
  "bg-artmie.myshopify.com": "BG",
  "artmie-bg.myshopify.com": "BG",
  "ba-artmie.myshopify.com": "BA",
  "artmie-ba.myshopify.com": "BA",
  "rs-artmie.myshopify.com": "RS",
  "artmie-rs.myshopify.com": "RS",
  "mk-artmie.myshopify.com": "MK",
  "artmie-mk.myshopify.com": "MK",
  "pl-artmie.myshopify.com": "PL",
  "artmie-pl.myshopify.com": "PL",
  "artmie-de.myshopify.com": "DE",
  "artmie-si.myshopify.com": "SI",
  "artmie-gr.myshopify.com": "GR",
  "artmie-it.myshopify.com": "IT",
  // Dev
  "address-validator-test-2.myshopify.com": "SK",
};

// Country → Carriers (CZ, HU use SK carriers too via cross-border)
const COUNTRY_CARRIERS: Record<string, CarrierCode[]> = {
  SK: ["sps_sk", "gls_sk", "packeta_sk"],
  CZ: ["ppl_cz", "sps_sk", "packeta_sk"],
  HU: ["gls_hu", "packeta_sk", "sps_sk"],
  PL: ["packeta_sk"],
  RO: ["fancourier_ro"],
  BG: ["dpd_bg"],
  HR: ["dpd_hr"],
  BA: ["dpd_ba"],
  SI: ["dpd_si"],
  RS: ["dpd_ba"], // Use BA DPD for RS
  MK: ["dpd_bg"], // Use BG DPD for MK
  DE: ["dhl_de"],
  IT: ["brt_it"],
  GR: ["acs_gr"],
};

export function getCountryForShop(shop: string): string {
  return SHOP_COUNTRY[shop] || "SK";
}

export function getCarriersForShop(shop: string): CarrierConfig[] {
  const country = getCountryForShop(shop);
  const carrierCodes = COUNTRY_CARRIERS[country] || ["sps_sk"];
  return carrierCodes.map((code) => CARRIERS[code]);
}

export function getCarrier(code: CarrierCode): CarrierConfig | undefined {
  return CARRIERS[code];
}

// ── Return address (warehouse) ──────────────────────────────────────────

export const RETURN_ADDRESS = {
  name: process.env.RETURN_ADDRESS_NAME || "Returns Manager",
  company: process.env.RETURN_ADDRESS_COMPANY || "",
  street: process.env.RETURN_ADDRESS_STREET || "",
  city: process.env.RETURN_ADDRESS_CITY || "",
  zip: process.env.RETURN_ADDRESS_ZIP || "",
  country: process.env.RETURN_ADDRESS_COUNTRY || "SK",
  phone: process.env.RETURN_ADDRESS_PHONE || "",
  email: process.env.RETURN_ADDRESS_EMAIL || "",
};

// ── Generate label (placeholder - will be replaced per carrier) ─────────

export async function generateReturnLabel(
  carrierCode: CarrierCode,
  shipmentData: {
    senderName: string;
    senderStreet: string;
    senderCity: string;
    senderZip: string;
    senderCountry: string;
    senderPhone: string;
    senderEmail: string;
    weight: number; // kg
    reference: string; // order name
    note?: string;
  }
): Promise<ShipmentResult> {
  const carrier = CARRIERS[carrierCode];
  if (!carrier) {
    return { success: false, error: `Neznámy dopravca: ${carrierCode}` };
  }

  if (!carrier.apiConfigured) {
    return {
      success: false,
      error: `${carrier.name}: API kľúč nie je nakonfigurovaný. Pridajte ${getEnvVarName(carrierCode)} do environment premenných.`,
    };
  }

  // Route to specific carrier implementation
  switch (carrierCode) {
    case "sps_sk":
      return await generateSPS(shipmentData);
    case "gls_sk":
      return await generateGLS("SK", shipmentData);
    case "gls_hu":
      return await generateGLS("HU", shipmentData);
    case "packeta_sk":
      return await generatePacketa(shipmentData);
    case "ppl_cz":
      return await generatePPL(shipmentData);
    case "fancourier_ro":
      return await generateFanCourier(shipmentData);
    default:
      return { success: false, error: `${carrier.name}: integrácia zatiaľ nie je implementovaná.` };
  }
}

function getEnvVarName(code: CarrierCode): string {
  const map: Record<string, string> = {
    sps_sk: "SPS_API_KEY",
    gls_sk: "GLS_SK_API_KEY",
    gls_hu: "GLS_HU_API_KEY",
    packeta_sk: "PACKETA_API_KEY",
    ppl_cz: "PPL_CZ_API_KEY",
    fancourier_ro: "FANCOURIER_API_KEY",
    dpd_hr: "DPD_HR_API_KEY",
    dpd_bg: "DPD_BG_API_KEY",
    dpd_ba: "DPD_BA_API_KEY",
    dpd_si: "DPD_SI_API_KEY",
    dhl_de: "DHL_DE_API_KEY",
    brt_it: "BRT_IT_API_KEY",
    acs_gr: "ACS_GR_API_KEY",
  };
  return map[code] || `${code.toUpperCase()}_API_KEY`;
}

// ── Carrier-specific implementations (stubs - to be filled with real API calls) ──

async function generateSPS(data: any): Promise<ShipmentResult> {
  // TODO: Implement SPS (Slovak Parcel Service / InTime) API
  // Docs: https://www.sps-sro.sk/api/
  // Needs: SPS_API_KEY, SPS_API_SECRET
  return { success: false, error: "SPS/InTime: API integrácia bude doplnená po zadaní API kľúčov." };
}

async function generateGLS(country: string, data: any): Promise<ShipmentResult> {
  // TODO: Implement GLS MyGLS API
  // Docs: https://api.mygls.sk/ (SK) or https://api.mygls.hu/ (HU)
  // Needs: GLS_SK_API_KEY + GLS_SK_CLIENT_NUMBER or GLS_HU_API_KEY + GLS_HU_CLIENT_NUMBER
  return { success: false, error: `GLS ${country}: API integrácia bude doplnená po zadaní API kľúčov.` };
}

async function generatePacketa(data: any): Promise<ShipmentResult> {
  // TODO: Implement Packeta/Zasielkovna API
  // Docs: https://docs.packetery.com/
  // Needs: PACKETA_API_KEY (API password from client section)
  return { success: false, error: "Packeta: API integrácia bude doplnená po zadaní API kľúčov." };
}

async function generatePPL(data: any): Promise<ShipmentResult> {
  // TODO: Implement PPL API
  // Docs: https://www.ppl.cz/nastroje/api
  // Needs: PPL_CZ_API_KEY, PPL_CZ_CLIENT_ID
  return { success: false, error: "PPL: API integrácia bude doplnená po zadaní API kľúčov." };
}

async function generateFanCourier(data: any): Promise<ShipmentResult> {
  // TODO: Implement FAN Courier API
  // Docs: https://www.fancourier.ro/wp-content/uploads/2023/API-documentation.pdf
  // Needs: FANCOURIER_API_KEY, FANCOURIER_CLIENT_ID, FANCOURIER_USERNAME
  return { success: false, error: "FAN Courier: API integrácia bude doplnená po zadaní API kľúčov." };
}
