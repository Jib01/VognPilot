export interface ProductCard {
  label: string;
  danish_term: string;
  unit_price_dkk?: number | null;
  package_price_dkk?: number | null;
  pant_fee_dkk?: number | null;
  multipack_offer?: string | null;
  fat_percentage?: number | null;
  sugar_g_per_100g?: number | null;
  protein_g_per_100g?: number | null;
  is_organic: boolean;
  is_lactose_free: boolean;
  is_plant_based: boolean;
  is_gluten_free?: boolean;
  matches_constraints: boolean;
  summary?: string | null;
}

export interface ScanResult {
  detected_products: ProductCard[];
  items?: any[];
  recommended_product_index?: number | null;
  decision_reason?: string | null;
  is_blurry_or_obscured?: boolean;
  is_demo_fallback?: boolean;
  notice?: string | null;
}
