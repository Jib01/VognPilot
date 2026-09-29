from google import genai
from google.genai import types
from app.core.config import settings
from app.schemas.vision import RawShelfAnalysis
import json

client = genai.Client(api_key=settings.GEMINI_API_KEY)

def analyze_shelf_image(image_bytes: bytes, mime_type: str, user_preferences: dict) -> RawShelfAnalysis:
    """
    Analyzes an image of a grocery shelf to extract products, prices, and match user dietary preferences.
    """
    prompt = f"""
    You are an expert grocery assistant for expats in Denmark.
    Analyze the provided supermarket shelf image and extract the visible products, their prices, and their nutritional information.
    
    Here are the user's current dietary preferences:
    {json.dumps(user_preferences, indent=2)}
    
    Evaluate each product against these preferences to determine if it is suitable.
    Pick the single best product recommendation that matches all constraints (if any) and identify its 0-based index.
    If the image is too blurry to confidently read prices or ingredients, set is_blurry_or_obscured to true.
    """
    
    response = client.models.generate_content(
        model='gemini-1.5-flash',
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
        return response.parsed
        
    return RawShelfAnalysis.model_validate_json(response.text)
