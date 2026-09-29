from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token, generate_salt
from app.core.config import settings
from app.models.user import User
from app.schemas.auth import UserRegisterRequest, UserLoginRequest, OAuthLoginRequest, TokenResponse

router = APIRouter()

@router.post("/register", response_model=TokenResponse)
async def register(request: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    salt = generate_salt()
    hashed_password = get_password_hash(request.password, salt)

    new_user = User(
        email=request.email,
        hashed_password=hashed_password,
        salt=salt
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    access_token = create_access_token(subject=new_user.id)
    return TokenResponse(access_token=access_token)

@router.post("/login", response_model=TokenResponse)
async def login(request: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalars().first()

    if not user or not verify_password(request.password, user.salt, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(subject=user.id)
    return TokenResponse(access_token=access_token)

@router.post("/oauth/google", response_model=TokenResponse)
async def google_oauth(request: OAuthLoginRequest, db: AsyncSession = Depends(get_db)):
    if request.provider != "google":
        raise HTTPException(status_code=400, detail="Only google is supported here")

    try:
        idinfo = id_token.verify_oauth2_token(
            request.id_token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
        email = idinfo.get("email")
        if not email:
            raise ValueError("Email not provided in token")

        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

        if not user:
            import uuid
            salt = generate_salt()
            random_pass = str(uuid.uuid4())
            hashed_password = get_password_hash(random_pass, salt)
            
            user = User(
                email=email,
                hashed_password=hashed_password,
                salt=salt
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        access_token = create_access_token(subject=user.id)
        return TokenResponse(access_token=access_token)

    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")
