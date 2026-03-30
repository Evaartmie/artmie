// ─── Return Status ──────────────────────────────────────────────────────

export const RETURN_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  IN_TRANSIT: "in_transit",
  RECEIVED: "received",
  REFUNDED: "refunded",
  CLOSED: "closed",
  CANCELLED: "cancelled",
} as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[keyof typeof RETURN_STATUSES];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  in_transit: "In Transit",
  received: "Received",
  refunded: "Refunded",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const RETURN_STATUS_COLORS: Record<ReturnStatus, "info" | "success" | "warning" | "critical" | "new" | "attention"> = {
  pending: "attention",
  approved: "info",
  rejected: "critical",
  in_transit: "info",
  received: "success",
  refunded: "success",
  closed: "new",
  cancelled: "new",
};

// ─── Shopify Return Reason Mapping ──────────────────────────────────────

export const SHOPIFY_RETURN_REASONS = [
  "DEFECTIVE",
  "WRONG_ITEM",
  "STYLE",
  "SIZE_TOO_SMALL",
  "SIZE_TOO_LARGE",
  "UNWANTED",
  "OTHER",
  "COLOR",
  "UNKNOWN",
] as const;

export type ShopifyReturnReason = (typeof SHOPIFY_RETURN_REASONS)[number];

// ─── Default Return Reasons (seeded on first install) ───────────────────

export const DEFAULT_RETURN_REASONS = [
  { label: "Defective / Damaged", shopifyReason: "DEFECTIVE", sortOrder: 1, requirePhoto: true },
  { label: "Wrong item received", shopifyReason: "WRONG_ITEM", sortOrder: 2, requirePhoto: true },
  { label: "Does not fit - too small", shopifyReason: "SIZE_TOO_SMALL", sortOrder: 3 },
  { label: "Does not fit - too large", shopifyReason: "SIZE_TOO_LARGE", sortOrder: 4 },
  { label: "Not as described / Wrong color", shopifyReason: "COLOR", sortOrder: 5 },
  { label: "Changed my mind", shopifyReason: "UNWANTED", sortOrder: 6 },
  { label: "Other", shopifyReason: "OTHER", sortOrder: 7, requireNote: true },
] as const;

// ─── Email Template Types ───────────────────────────────────────────────

export const EMAIL_TEMPLATE_TYPES = [
  "return_confirmed",
  "return_approved",
  "return_rejected",
  "return_refunded",
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

// ─── Notification Types ─────────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  RETURN_CONFIRMED: "return_confirmed",
  RETURN_APPROVED: "return_approved",
  RETURN_REJECTED: "return_rejected",
  RETURN_REFUNDED: "return_refunded",
} as const;
