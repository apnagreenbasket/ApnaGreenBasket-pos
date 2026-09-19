/**
 * Superadmin type definitions & constants.
 *
 * Extracted from superadmin/page.tsx.
 */

import type { PaymentMode, StaffRole } from "@/types";

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
};

export type RestaurantUser = {
  id: string;
  name?: string;
  email: string;
  phone?: string;
  role: StaffRole;
  is_active: boolean;
  status?: string;
  has_pin?: boolean;
  created_at: string;
};

export type RestaurantWithUsers = {
  id: string;
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id?: string | null;
  direct_upi_id?: string | null;
  raw_upi_payload?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  fssai_no?: string | null;
  session_duration_minutes?: number;
  verification_amount_cutoff?: string | number | null;
  flagged_item_ids?: string[];
  email?: string | null;
  bill_qr_url?: string | null;
  place_of_supply?: string | null;
  invoice_terms_conditions?: string | null;
  created_at: string;
  updated_at: string;
  users: RestaurantUser[];
};

export type RestaurantCreateForm = {
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  razorpay_account_id: string;
  direct_upi_id: string;
  raw_upi_payload: string;
  logo_url: string;
  address: string;
  phone: string;
  gstin: string;
  fssai_no: string;
  session_duration_minutes: number;
  verification_amount_cutoff: string;
  email: string;
  bill_qr_url: string;
  place_of_supply: string;
  invoice_terms_conditions: string;
};

export type AdminUserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  pin: string;
  role: StaffRole;
};

export const SA_ACCESS_TOKEN_KEY = "superadmin_access_token";
export const SA_REFRESH_TOKEN_KEY = "superadmin_refresh_token";
