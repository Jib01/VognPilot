export interface ProductBoundingBox {
  box_2d: [number, number, number, number];
  label: string;
  danish_term: string;
  unit_price_dkk: number;
  unit: string;
  package_price_dkk?: number | null;
  fat_percentage?: number | null;
  sugar_g_per_100g?: number | null;
  protein_g_per_100g?: number | null;
  is_organic: boolean;
  is_lactose_free: boolean;
  is_plant_based: boolean;
  matches_constraints: boolean;
}

export interface RawShelfAnalysis {
  detected_products: ProductBoundingBox[];
  recommended_product_index?: number | null;
  confidence_score: number;
  is_blurry_or_obscured: boolean;
  decision_reason: string;
}
