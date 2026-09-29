from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from app.core.config import settings
import os
import hashlib

# Configure Argon2id according to guidelines:
# Minimum memory cost: 65536 KiB (64 MiB), time cost: 3, parallelism: 4
password_hash = PasswordHash((
    Argon2Hasher(
        time_cost=3,
        memory_cost=65536,
        parallelism=4,
    ),
))

def generate_salt() -> bytes:
    """Generate a 16-byte cryptographically secure random salt."""
    return os.urandom(16)

def get_password_hash(password: str, salt: bytes) -> str:
    """Hash the password with the salt using Argon2id."""
    combined = salt.hex() + password
    return password_hash.hash(combined)

def verify_password(plain_password: str, salt: bytes, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    combined = salt.hex() + plain_password
    return password_hash.verify(combined, hashed_password)

def create_access_token(subject: str | int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: str | int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def hash_refresh_token(token: str) -> str:
    """Hash refresh token for database storage."""
    return hashlib.sha256(token.encode()).hexdigest()
