from sqlalchemy import Column, String, Float, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.models.base import Base

class GroceryItem(Base):
    __tablename__ = "grocery_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), index=True)
    name = Column(String, nullable=False)
    danish_term = Column(String)
    unit_price_dkk = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ScanLog(Base):
    __tablename__ = "scan_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), index=True)
    confidence_score = Column(Float)
    is_blurry = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
