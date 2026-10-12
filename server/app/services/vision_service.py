from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.vision import RawShelfAnalysis, ProductBoundingBox
import json
import time
import hashlib
from pathlib import Path

# Directory for caching vision results by SHA256 image hash
CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

def get_mock_shelf_analysis() -> RawShelfAnalysis:
    """
    Returns a realistic mock shelf analysis with 2-3 products for UI testing without consuming Gemini API quota.
    """
    return RawShelfAnalysis(
        detected_products=[
            ProductBoundingBox(
                box_2d=[200, 150, 650, 420],
                label="Arla Øko Letmælk 1L",
                danish_term="Letmælk 1,5%",
                unit_price_dkk=13.95,
                unit="L",
                package_price_dkk=13.95,
                pant_fee_dkk=None,
                multipack_offer=None,
                fat_percentage=1.5,
                sugar_g_per_100g=4.7,
                protein_g_per_100g=3.5,
                is_organic=True,
                is_lactose_free=False,
                is_plant_based=False,
                matches_constraints=True,
            ),
            ProductBoundingBox(
                box_2d=[210, 450, 660, 710],
                label="Naturli' Organic Oat Drink 1L",
                danish_term="Havredrik Økologisk",
                unit_price_dkk=18.50,
                unit="L",
                package_price_dkk=18.50,
                pant_fee_dkk=None,
                multipack_offer="Ta' 2 for 30 kr",
                fat_percentage=1.2,
                sugar_g_per_100g=3.8,
                protein_g_per_100g=1.0,
                is_organic=True,
                is_lactose_free=True,
                is_plant_based=True,
                matches_constraints=True,
            ),
            ProductBoundingBox(
                box_2d=[220, 730, 670, 940],
                label="Carlsberg Pilsner 33cl",
                danish_term="Pilsner Øl",
                unit_price_dkk=24.24,
                unit="L",
                package_price_dkk=8.00,
                pant_fee_dkk=1.0,
                multipack_offer=None,
                fat_percentage=None,
                sugar_g_per_100g=0.1,
                protein_g_per_100g=0.3,
                is_organic=False,
                is_lactose_free=True,
                is_plant_based=True,
                matches_constraints=False,
            ),
        ],
        recommended_product_index=1,
        confidence_score=0.95,
        is_blurry_or_obscured=False,
        decision_reason="Naturli Organic Oat Drink is plant-based, organic, has a multi-pack discount, and meets user preferences.",
    )

def analyze_shelf_image(image_bytes: bytes, mime_type: str, user_preferences: dict) -> RawShelfAnalysis:
    """
    Analyzes an image of a grocery shelf to extract products, prices, and match user dietary preferences.
    Uses SHA256 image caching and optional mock mode to prevent API quota exhaustion during development and testing.
    """
    # 1. Mock Mode (bypass network & quota)
    if getattr(settings, "MOCK_VISION", False):
        time.sleep(0.45)  # Simulated latency (400-500ms)
        return get_mock_shelf_analysis()

    # 2. Check SHA256 Cache
    image_hash = hashlib.sha256(image_bytes).hexdigest()
    cache_file = CACHE_DIR / f"{image_hash}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached_json = f.read()
            print(f"Returning cached vision analysis for hash {image_hash[:10]}...")
            return RawShelfAnalysis.model_validate_json(cached_json)
        except Exception as cache_err:
            print(f"Warning: Failed to load cache for {image_hash[:10]}: {cache_err}. Proceeding with API call.")

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "placeholder_key" or settings.GEMINI_API_KEY == "":
        raise ValueError("GEMINI_API_KEY non configurata o non valida. Aggiungi la tua API Key nel file .env.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""
    You are an expert grocery assistant for expats in Denmark.
    Analyze the provided supermarket shelf image and extract the visible products, their prices, and their nutritional information.
    Identifica i singoli prodotti acquistabili in primo piano associati ai loro cartellini dei prezzi (fino a un massimo di 6-8 prodotti rilevanti). Non creare riquadri per interi vassoi espositivi o confezioni secondarie nascoste. Assicurati che ogni bounding box contenga una singola unità o cartellino ben definito.
    Se il prezzo non è chiaramente visibile nella foto, imposta il campo del prezzo (package_price_dkk o unit_price_dkk) a null e non a 0.0.
    Se il prodotto è una bevanda, individua se c'è un logo Pant (A, B, C) o un costo cauzione e inseriscilo in pant_fee_dkk.
    Se sul cartellino c'è un'offerta per acquisto multiplo (es. "Ta' 2 for 40 kr", "Mængderabat"), inserisci il testo esatto in multipack_offer.
    
    Here are the user's current dietary preferences:
    {json.dumps(user_preferences, indent=2)}
    
    Evaluate each product against these preferences to determine if it is suitable.
    Pick the single best product recommendation that matches all constraints (if any) and identify its 0-based index.
    If the image is too blurry to confidently read prices or ingredients, set is_blurry_or_obscured to true.
    """
    
    # Supported fallback models (gemini-1.5-flash and gemini-1.5-pro removed due to 404 NOT_FOUND)
    models_to_try = [
        'gemini-3.8-flash',
        'gemini-3.8-pro',
        'gemini-3-flash'
    ]
    # Remove duplicates preserving order
    models_to_try = list(dict.fromkeys(models_to_try))
    max_retries = 3
    
    def process_and_deduplicate(analysis_obj: RawShelfAnalysis) -> RawShelfAnalysis:
        def calculate_iou(box1, box2):
            y1_min, x1_min, y1_max, x1_max = box1
            y2_min, x2_min, y2_max, x2_max = box2
            
            inter_y_min = max(y1_min, y2_min)
            inter_x_min = max(x1_min, x2_min)
            inter_y_max = min(y1_max, y2_max)
            inter_x_max = min(x1_max, x2_max)
            
            if inter_y_max <= inter_y_min or inter_x_max <= inter_x_min:
                return 0.0
                
            inter_area = (inter_y_max - inter_y_min) * (inter_x_max - inter_x_min)
            area1 = (y1_max - y1_min) * (x1_max - x1_min)
            area2 = (y2_max - y2_min) * (x2_max - x2_min)
            
            return inter_area / float(area1 + area2 - inter_area)

        keep = []
        original_idx_to_new_idx = {}
        for i, prod in enumerate(analysis_obj.detected_products):
            overlap = False
            for k in keep:
                if calculate_iou(prod.box_2d, k.box_2d) > 0.60:
                    overlap = True
                    break
            if not overlap:
                original_idx_to_new_idx[i] = len(keep)
                keep.append(prod)
                
        new_rec_idx = analysis_obj.recommended_product_index
        if new_rec_idx is not None and new_rec_idx in original_idx_to_new_idx:
            analysis_obj.recommended_product_index = original_idx_to_new_idx[new_rec_idx]
        else:
            analysis_obj.recommended_product_index = None

        analysis_obj.detected_products = keep
        return analysis_obj

    last_error_was_429 = False
    last_error_was_503 = False
    for model_name in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        prompt,
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RawShelfAnalysis,
                        temperature=0.1,
                    )
                )
                
                if hasattr(response, 'parsed') and response.parsed:
                    final_analysis = process_and_deduplicate(response.parsed)
                else:
                    parsed_obj = RawShelfAnalysis.model_validate_json(response.text)
                    final_analysis = process_and_deduplicate(parsed_obj)

                # Persist to SHA256 cache
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        f.write(final_analysis.model_dump_json(indent=2))
                    print(f"[Vision Service] Cached vision analysis for hash {image_hash[:10]}.")
                except Exception as cache_err:
                    print(f"[Vision Service] Warning: Failed to write cache for {image_hash[:10]}: {cache_err}")

                return final_analysis
                
            except Exception as e:
                error_msg = str(e).lower()
                print(f"[Vision Service] Model {model_name} (attempt {attempt + 1}/{max_retries}) error: {e}")
                if "429" in error_msg or "resource_exhausted" in error_msg or "quota" in error_msg:
                    print(f"[Vision Service] Model {model_name} quota exceeded (429). Falling back to next model...")
                    last_error_was_429 = True
                    break
                elif "404" in error_msg or "not_found" in error_msg:
                    print(f"[Vision Service] Model {model_name} not found (404). Falling back...")
                    last_error_was_429 = False
                    break
                elif "503" in error_msg or "unavailable" in error_msg:
                    last_error_was_503 = True
                    if attempt < max_retries - 1:
                        backoff = 1.0 * (2 ** attempt)
                        print(f"[Vision Service] 503 Unavailable. Retrying in {backoff:.1f}s...")
                        time.sleep(backoff)
                        continue
                    else:
                        last_error_was_429 = False
                        break
                else:
                    raise e
                    
    # If all remote models failed but mock vision is enabled, fallback to mock analysis
    if getattr(settings, "MOCK_VISION", False):
        print("[Vision Service] Remote calls failed but MOCK_VISION is enabled. Returning mock fixture.")
        return get_mock_shelf_analysis()

    if last_error_was_429:
        raise RuntimeError("AI service quota reached. Please retry in 60 seconds or verify your API key.")
        
    if last_error_was_503:
        raise RuntimeError("Analysis servers are temporarily busy or unavailable. Please try again in a moment.")

    raise RuntimeError("Analysis servers are temporarily unavailable. Please try again shortly.")
