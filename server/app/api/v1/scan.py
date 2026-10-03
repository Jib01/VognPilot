from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.core.database import get_db
from app.schemas.vision import RawShelfAnalysis
from app.services.vision_service import analyze_shelf_image

router = APIRouter()

@router.post("/", response_model=RawShelfAnalysis)
async def scan_image(
    file: UploadFile = File(...),
    preferences: str = Form("{}"),
    db: AsyncSession = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        user_prefs = json.loads(preferences)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Preferences must be valid JSON")
        
    image_bytes = await file.read()
    
    try:
        analysis = analyze_shelf_image(image_bytes, file.content_type, user_prefs)
        return analysis
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision API error: {str(e)}")
