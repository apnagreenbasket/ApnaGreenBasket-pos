import { FormEvent, useState, useEffect } from "react";
import type {
  RestaurantFormState,
  RestaurantProfile,
} from "../adminTypes";

type UseSettingsManagementProps = {
  accessToken: string | null;
  restaurant: RestaurantProfile | null;
  setRestaurant: (rest: RestaurantProfile | null) => void;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

function normalizeStringList(val: any): string[] {
  if (Array.isArray(val)) {
    const list = val.map(String).map((s) => s.trim()).filter(Boolean);
    return list.length > 0 ? list : [""];
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const list = val.split(",").map((s) => s.trim()).filter(Boolean);
    return list.length > 0 ? list : [""];
  }
  return [""];
}

export function useSettingsManagement({
  accessToken,
  restaurant,
  setRestaurant,
  apiRequest,
  setNotice,
  setError,
}: UseSettingsManagementProps) {
  const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
    raw_upi_payload: "",
    logo_url: "",
    address: "",
    phone: "",
    gstin: "",
    fssai_no: "",
    dashboard_reset_time: "00:00",
    session_duration_minutes: 30,
    public_basket_number: "",
    verification_amount_cutoff: "",
    flagged_item_ids: [],
    near_expiry_threshold_days: 7,
    notification_emails: [""],
    notification_phones: [""],
    email: "",
    bill_qr_url: "",
    place_of_supply: "",
    loyalty_points_per_100_inr: 0,
    loyalty_redemption_tiers: [],
    loyalty_max_bill_percentage: "100.00",
    invoice_terms_conditions: "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.",
    weighing_scale_barcode_format: "21_5I_5W_GRAMS",
    interstate_mode: "OFF",
    b2b_enabled: false,
  });
  const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setRestaurantForm({
        name: restaurant.name || "",
        slug: restaurant.slug || "",
        payment_mode: restaurant.payment_mode || "PAY_AT_COUNTER",
        razorpay_account_id: restaurant.razorpay_account_id || "",
        direct_upi_id: restaurant.direct_upi_id || "",
        raw_upi_payload: restaurant.raw_upi_payload || "",
        logo_url: restaurant.logo_url || "",
        address: restaurant.address || "",
        phone: restaurant.phone || "",
        gstin: restaurant.gstin || "",
        fssai_no: restaurant.fssai_no || "",
        dashboard_reset_time: restaurant.dashboard_reset_time || "00:00",
        session_duration_minutes: restaurant.session_duration_minutes ?? 30,
        public_basket_number: restaurant.public_basket_number || "",
        verification_amount_cutoff:
          restaurant.verification_amount_cutoff !== null && restaurant.verification_amount_cutoff !== undefined
            ? String(restaurant.verification_amount_cutoff)
            : "",
        flagged_item_ids: restaurant.flagged_item_ids || [],
        near_expiry_threshold_days: restaurant.near_expiry_threshold_days ?? 7,
        notification_emails: normalizeStringList(restaurant.notification_emails),
        notification_phones: normalizeStringList(restaurant.notification_phones),
        email: restaurant.email || "",
        bill_qr_url: restaurant.bill_qr_url || "",
        place_of_supply: restaurant.place_of_supply || "",
        loyalty_points_per_100_inr: restaurant.loyalty_points_per_100_inr || 0,
        loyalty_redemption_tiers: restaurant.loyalty_redemption_tiers || [],
        loyalty_max_bill_percentage: restaurant.loyalty_max_bill_percentage !== null && restaurant.loyalty_max_bill_percentage !== undefined
          ? String(restaurant.loyalty_max_bill_percentage)
          : "100.00",
        invoice_terms_conditions: restaurant.invoice_terms_conditions || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.",
        weighing_scale_barcode_format: restaurant.weighing_scale_barcode_format || "21_5I_5W_GRAMS",
        interstate_mode: (restaurant as any).interstate_mode || "OFF",
        b2b_enabled: Boolean(restaurant.b2b_enabled),
      });
    }
  }, [restaurant]);

  const onSubmitRestaurantSettings = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setIsSavingRestaurant(true);
    setError(null);

    try {
      const payload = {
        name: restaurantForm.name.trim(),
        slug: restaurantForm.slug.trim(),
        payment_mode: restaurantForm.payment_mode,
        razorpay_account_id: restaurantForm.razorpay_account_id.trim() || null,
        direct_upi_id: restaurantForm.direct_upi_id.trim() || null,
        raw_upi_payload: restaurantForm.raw_upi_payload?.trim() || null,
        logo_url: restaurantForm.logo_url?.trim() || null,
        address: restaurantForm.address?.trim() || null,
        phone: restaurantForm.phone?.trim() || null,
        gstin: restaurantForm.gstin?.trim() || null,
        fssai_no: restaurantForm.fssai_no?.trim() || null,
        session_duration_minutes: restaurantForm.session_duration_minutes,
        public_basket_number: restaurantForm.public_basket_number?.trim() || null,
        verification_amount_cutoff: restaurantForm.verification_amount_cutoff?.trim() ? parseFloat(restaurantForm.verification_amount_cutoff) : null,
        flagged_item_ids: restaurantForm.flagged_item_ids || [],
        near_expiry_threshold_days: restaurantForm.near_expiry_threshold_days,
        notification_emails: (restaurantForm.notification_emails || []).map(e => e.trim()).filter(Boolean),
        notification_phones: (restaurantForm.notification_phones || []).map(p => p.trim()).filter(Boolean),
        email: restaurantForm.email?.trim() || null,
        bill_qr_url: restaurantForm.bill_qr_url?.trim() || null,
        place_of_supply: restaurantForm.place_of_supply?.trim() || null,
        loyalty_points_per_100_inr: restaurantForm.loyalty_points_per_100_inr || 0,
        loyalty_redemption_tiers: restaurantForm.loyalty_redemption_tiers,
        loyalty_max_bill_percentage: restaurantForm.loyalty_max_bill_percentage?.trim() ? parseFloat(restaurantForm.loyalty_max_bill_percentage) : 100,
        invoice_terms_conditions: restaurantForm.invoice_terms_conditions?.trim() || null,
        weighing_scale_barcode_format: restaurantForm.weighing_scale_barcode_format || null,
        interstate_mode: restaurantForm.interstate_mode || "OFF",
        b2b_enabled: Boolean(restaurantForm.b2b_enabled),
      };

      const updated = await apiRequest<RestaurantProfile>(
        "/api/admin/outlets/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setRestaurant(updated);
      setNotice("Outlet configuration updated.");
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to update outlet settings."
      );
    } finally {
      setIsSavingRestaurant(false);
    }
  };

  return {
    restaurantForm,
    setRestaurantForm,
    isSavingRestaurant,
    onSubmitRestaurantSettings,
  };
}
