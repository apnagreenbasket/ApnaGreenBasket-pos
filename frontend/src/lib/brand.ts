/**
 * Brand configuration — centralized, swappable tokens.
 *
 * Drop in a real brand kit later by updating values here.
 * Every frontend file imports brand strings from this module
 * instead of hardcoding them.
 */

export const BRAND = {
  /** Primary display name */
  name: "ApnaGreen Basket",
  /** Short name for compact spaces */
  shortName: "ApnaGreen",
  /** One-line tagline */
  tagline: "Fresh Fruits, Vegetables & Drinks — Multi-Outlet Mart",
  /** SEO meta title */
  metaTitle: "ApnaGreen Basket — Fresh Fruits, Vegetables & Drinks",
  /** SEO meta description */
  metaDescription:
    "ApnaGreen Basket is a multi-outlet fruits, vegetables & drinks mart in Jammu with self-checkout baskets and counter billing.",
  /** Contact email */
  contactEmail: "hello@apnagreenbasket.com",
  /** Support email */
  supportEmail: "support@apnagreenbasket.com",
  /** Superadmin default email (dev only) */
  superadminEmail: "superadmin@apnagreenbasket.com",
  /** Domain terminology */
  terms: {
    /** What was "Table" — now "Basket" */
    basket: "Basket",
    /** What was "Menu" — now "Product Catalog" */
    catalog: "Product Catalog",
    /** What was "Menu Item" — now "Product" */
    product: "Product",
    /** What was "Menu Items" — now "Products" */
    products: "Products",
    /** What was "Diner" — now "Customer" */
    customer: "Customer",
    /** What was "Floor Staff" — now "Floor Staff" */
    floorStaff: "Floor Staff",
    /** What was "Kitchen Columns" — now "Basket Columns" */
    basketColumns: "Basket Columns",
    /** What was "Restaurant" — now "Outlet" */
    outlet: "Outlet",
  },
  /** Footer / legal */
  copyrightHolder: "ApnaGreen Basket",
  /** City */
  city: "Jammu",
  /** Outlets (informational — never hardcode count checks against this) */
  outletLocations: ["Gandhinagar", "Channi Himmat", "Kunjwani"],
} as const;

export type Brand = typeof BRAND;
