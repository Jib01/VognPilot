from pydantic import BaseModel, EmailStr, Field

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Plaintext password, hashed server-side with Argon2id")
    favorite_currency: str = Field(default="EUR", max_length=3)

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class OAuthLoginRequest(BaseModel):
    provider: str = Field(description="'google' or 'apple'")
    id_token: str = Field(description="Identity token received from Google/Apple SDK")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutes
