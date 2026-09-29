import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import get_password_hash, generate_salt, verify_password

client = TestClient(app)

def test_password_hashing():
    password = "supersecretpassword123"
    salt = generate_salt()
    hashed = get_password_hash(password, salt)
    
    assert verify_password(password, salt, hashed) is True
    assert verify_password("wrongpassword", salt, hashed) is False

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to VognPilot API"}
