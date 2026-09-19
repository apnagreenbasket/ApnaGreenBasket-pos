import type {
  InventoryUnit,
  OrderStatus,
  PaymentMode,
  PricingMode,
  RolePermissions,
  StaffMember,
  StaffRole,
  WastageReason,
} from "@/types";

export const ACCESS_TOKEN_KEY = "agb_access_token";
export const REFRESH_TOKEN_KEY = "agb_refresh_token";
export const RESTAURANT_DATA_KEY = "agb_restaurant_data";

export type AdminTab =
  | "orders"
  | "billing"
  | "menu"
  | "staff"
  | "analytics"
  | "inventory"
  | "customerservices"
  | "sessions"
  | "qrcodes"
  | "settings";

export interface ActiveRoleContext {
  staff_id: string;
  name: string;
  role: StaffRole;
  token?: string;
}

export interface StaffPunchStatus {
  is_exempt: boolean;
  is_punched_in: boolean;
  session_id?: string | null;
  punch_in_at?: string | null;
  elapsed_seconds: number;
  max_shift_seconds: number;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
  restaurant_id?: string;
  outlet_id?: string;
  restaurant_slug?: string;
  outlet_slug?: string;
  restaurant_name?: string;
  outlet_name?: string;
  user?: StaffMember | null;
  staff?: StaffMember | null;
}

export interface RestaurantProfile {
  id: string;
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  fssai_no?: string | null;
  upi_id?: string | null;
  direct_upi_id?: string | null;
  razorpay_account_id?: string | null;
  raw_upi_payload?: string | null;
  public_basket_number?: string | null;
  dashboard_reset_time?: string;
  session_duration_minutes?: number;
  session_grace_period_minutes?: number;
  basket_locking_enabled?: boolean;
  verification_cutoff_amount?: string | number | null;
  verification_amount_cutoff?: string | number | null;
  flagged_item_ids?: string[] | null;
  evening_price_active?: boolean;
  evening_pricing_mode?: "OFF" | "MANUAL" | "AUTO";
  evening_auto_enabled?: boolean;
  evening_auto_start_time?: string | null;  // "HH:MM" IST
  evening_auto_end_time?: string | null;    // "HH:MM" IST
  near_expiry_threshold_days?: number;
  notification_emails?: string[] | null;
  notification_phones?: string[] | null;
  weighing_scale_barcode_format?: string | null;
  email?: string | null;
  bill_qr_url?: string | null;
  place_of_supply?: string | null;
  loyalty_points_per_100_inr?: number;
  loyalty_redemption_tiers?: { min_points: number; max_points?: number | null; discount_percentage: number }[];
  loyalty_max_bill_percentage?: string | number;
  invoice_terms_conditions?: string | null;
  interstate_mode?: "OFF" | "PER_BILL" | "ALWAYS_ON";
  b2b_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RestaurantFormState {
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  logo_url: string;
  address: string;
  phone: string;
  gstin: string;
  fssai_no: string;
  direct_upi_id: string;
  razorpay_account_id: string;
  raw_upi_payload?: string | null;
  dashboard_reset_time: string;
  session_duration_minutes: number;
  session_grace_period_minutes?: number;
  basket_locking_enabled?: boolean;
  public_basket_number?: string | null;
  verification_amount_cutoff?: string | null;
  verification_cutoff_amount?: string;
  flagged_item_ids: string[];
  near_expiry_threshold_days: number;
  notification_emails: string[];
  notification_phones: string[];
  weighing_scale_barcode_format: string;
  email: string;
  bill_qr_url: string;
  place_of_supply: string;
  loyalty_points_per_100_inr: number;
  loyalty_redemption_tiers: { min_points: number; max_points?: number | null; discount_percentage: number }[];
  loyalty_max_bill_percentage: string;
  invoice_terms_conditions: string;
  interstate_mode: "OFF" | "PER_BILL" | "ALWAYS_ON";
  b2b_enabled: boolean;
}

export type AdminCategory = import("@/types").Category;

export type AdminVariant = import("@/types").Variant;

export type AdminMenuItem = import("@/types").MenuItem;

export type AdminOrderItem = import("@/types").OrderItemResponse;

export type AdminOrder = import("@/types").OrderResponse;

export const lanes: OrderStatus[] = [
  "PENDING_VERIFICATION",
  "PAYMENT_PENDING",
  "COMPLETED",
  "CANCELLED",
];

export const LANE_NAMES: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PENDING_VERIFICATION: "Pending Exit Check",
  PAID: "Paid Orders",
  PAYMENT_PENDING: "Counter Queue",
  COMPLETED: "Exited / Settled",
  CANCELLED: "Cancelled / Refunded",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REFUNDED: "Refunded",
};

export interface MenuItemFormState {
  category_id: string;
  inventory_item_id?: string | null;
  name: string;
  barcode: string;
  image_url?: string;
  price: string;
  wholesale_price?: string;
  evening_price?: string;
  description: string;
  is_available: boolean;
  is_on_offer: boolean;
  is_verification_required: boolean;
  offer_price: string;
  offer_label: string;
  offer_expires_at?: string | null;
  mrp: string;
  tax_category: string;
  tax_rate: string;
  hsn_code?: string;
  pricing_mode: PricingMode;
  unit_label: string;
  alternate_units: Array<{unit_label: string; conversion_factor: number}>;
  allow_oversell?: boolean;
}

export interface VariantFormState {
  name: string;
  price_delta: string;
  is_available: boolean;
}

export interface OfferFormState {
  is_on_offer: boolean;
  offer_price: string;
  offer_label: string;
  expires_at_midnight: boolean;
}

export interface StaffFormState {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  status: "active" | "inactive";
}
