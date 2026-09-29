import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.schemas.vision import RawShelfAnalysis

client = TestClient(app)

@patch('app.api.v1.scan.analyze_shelf_image')
def test_scan_image_endpoint(mock_analyze):
    # Setup mock response
    mock_response = RawShelfAnalysis(
        detected_products=[],
        recommended_product_index=None,
        confidence_score=0.9,
        is_blurry_or_obscured=False,
        decision_reason="No products detected in image."
    )
    mock_analyze.return_value = mock_response

    # Create dummy image
    image_content = b"fake image bytes"
    
    response = client.post(
        "/api/v1/scan/",
        files={"file": ("test.jpg", image_content, "image/jpeg")},
        data={"preferences": '{"dietary_lifestyle": ["vegetarian"]}'}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["confidence_score"] == 0.9
    assert data["decision_reason"] == "No products detected in image."
