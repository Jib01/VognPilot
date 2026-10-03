from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.vision import RawShelfAnalysis
import json
import time

def analyze_shelf_image(image_bytes: bytes, mime_type: str, user_preferences: dict) -> RawShelfAnalysis:
    """
    Analyzes an image of a grocery shelf to extract products, prices, and match user dietary preferences.
    """
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
                    return process_and_deduplicate(response.parsed)
                    
                parsed_obj = RawShelfAnalysis.model_validate_json(response.text)
                return process_and_deduplicate(parsed_obj)
                
            except Exception as e:
                error_msg = str(e).lower()
                if "429" in error_msg or "resource_exhausted" in error_msg or "quota" in error_msg:
                    print(f"Model {model_name} quota exceeded (429). Falling back...")
                    last_error_was_429 = True
                    break
                elif "404" in error_msg or "not_found" in error_msg:
                    print(f"Model {model_name} not found (404). Falling back...")
                    last_error_was_429 = False
                    break
                elif "503" in error_msg or "unavailable" in error_msg:
                    if attempt < max_retries - 1:
                        time.sleep(1.0 * (2 ** attempt))
                        continue
                    else:
                        last_error_was_429 = False
                        break
                else:
                    raise e
                    
    if last_error_was_429:
        raise RuntimeError("Quota API temporaneamente esaurita per il test. Riprova tra 60 secondi o verifica la chiave su Google AI Studio.")
        
    raise RuntimeError("I server di analisi sono momentaneamente occupati o non disponibili. Riprova più tardi.")
