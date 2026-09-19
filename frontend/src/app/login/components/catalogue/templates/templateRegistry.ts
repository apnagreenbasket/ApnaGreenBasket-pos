/**
 * templateRegistry — maps template ID strings to their React components.
 */

import { MandiLedgerTemplate } from "./MandiLedgerTemplate";
import { AisleGridTemplate } from "./AisleGridTemplate";

export const templateRegistry = {
  "mandi-ledger": MandiLedgerTemplate,
  "aisle-grid": AisleGridTemplate,
} as const;

export type TemplateId = keyof typeof templateRegistry;

export interface CatalogueItem {
  id: string;
  name_en: string;
  name_hi?: string;
  image_url: string;
  mrp: number;
  price: number;
  discount_pct: number;
  evening_price?: number;
}

export interface CatalogueCategory {
  id: string;
  name_en: string;
  name_hi?: string;
  order: number;
  source_category_id?: string;
  items: CatalogueItem[];
}

export interface CatalogueBatch {
  id: string;
  name: string;
  template: TemplateId;
  show_evening_price: boolean;
  show_evening_special_label: boolean;
  categories: CatalogueCategory[];
  created_at?: string;
  updated_at?: string;
}

export interface OutletPrintHeader {
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  fssai_no?: string;
  bill_qr_url?: string;
}

export interface TemplateProps {
  batch: CatalogueBatch;
  pageNumber: number;
  totalPages: number;
  outletInfo: OutletPrintHeader;
}
