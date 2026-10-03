from pydantic import BaseModel, Field
from typing import List, Optional

class ProductBoundingBox(BaseModel):
    box_2d: List[int] = Field(
        description="Normalized coordinates [ymin, xmin, ymax, xmax] scaled between 0 and 1000"
    )
    label: str = Field(description="English brand and product designation")
    danish_term: str = Field(description="Danish name found on label, e.g., Letmælk, Piskefløde, Hakket Oksekød")
    unit_price_dkk: Optional[float] = Field(None, description="Normalized unit price per liter or per kilogram")
    unit: str = Field(description="'L', 'kg', or 'piece'")
    package_price_dkk: Optional[float] = Field(None, description="Total sticker price on the tag")
    pant_fee_dkk: Optional[float] = Field(None, description="Pant deposit fee if applicable (e.g. 1.0, 1.5, 3.0)")
    multipack_offer: Optional[str] = Field(None, description="Multi-pack discount text (e.g. 'Ta 2 for 30 kr', 'Mængderabat')")
    fat_percentage: Optional[float] = Field(None, description="Identified fat percentage if applicable")
    sugar_g_per_100g: Optional[float] = Field(None, description="Sugars in grams per 100g if readable")
    protein_g_per_100g: Optional[float] = Field(None, description="Protein in grams per 100g if readable")
    is_organic: bool = Field(default=False, description="True if marked with Ø-mærke or EU leaf")
    is_lactose_free: bool = Field(default=False, description="True if labeled laktosefri")
    is_plant_based: bool = Field(default=False, description="True if vegetarian/vegan")
    matches_constraints: bool = Field(description="True if it satisfies all active user requirements")

class RawShelfAnalysis(BaseModel):
    detected_products: List[ProductBoundingBox]
    recommended_product_index: Optional[int] = Field(
        None, description="0-based index of the recommended product. Null if no item matches constraints."
    )
    confidence_score: float = Field(
        description="Model confidence from 0.0 to 1.0 regarding tag clarity and product identification"
    )
    is_blurry_or_obscured: bool = Field(
        description="True if image blurriness or glare prevents high-confidence identification"
    )
    decision_reason: str = Field(
        description="Concise English justification under 25 words"
    )
