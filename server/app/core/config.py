import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "VognPilot API"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/vognpilot"
    
    # Security
    JWT_SECRET_KEY: str = "change_this_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # OAuth2
    GOOGLE_CLIENT_ID: str = "your_google_client_id_here"
    APPLE_CLIENT_ID: str = "your_apple_client_id_here"

    # AI Integration
    GEMINI_API_KEY: str = "placeholder_key"
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-3.8-pro"
    
    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()
