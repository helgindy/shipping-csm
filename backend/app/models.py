from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from .database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    easypost_id = Column(String(255), unique=True, index=True)
    tracking_code = Column(String(255), index=True)
    label_url = Column(Text)

    # From address
    from_name = Column(String(255))
    from_street1 = Column(String(255))
    from_street2 = Column(String(255), nullable=True)
    from_city = Column(String(255))
    from_state = Column(String(50))
    from_zip = Column(String(20))
    from_country = Column(String(10), default="US")
    from_phone = Column(String(50))

    # To address
    to_name = Column(String(255))
    to_street1 = Column(String(255))
    to_street2 = Column(String(255), nullable=True)
    to_city = Column(String(255))
    to_state = Column(String(50))
    to_zip = Column(String(20))
    to_country = Column(String(10), default="US")
    to_phone = Column(String(50))

    # Shipping details
    carrier = Column(String(100))
    service = Column(String(100))
    cost = Column(Float)
    method = Column(String(50))  # "card" or "tracked"

    # Parcel info
    parcel_length = Column(Float, nullable=True)
    parcel_width = Column(Float, nullable=True)
    parcel_height = Column(Float, nullable=True)
    parcel_weight = Column(Float)
    parcel_predefined = Column(String(50), nullable=True)  # e.g., "card"

    # Status and timestamps
    status = Column(String(50), default="created")
    manifested = Column(String(255), nullable=True)  # ScanForm ID if already manifested
    easypost_created_at = Column(DateTime(timezone=True), nullable=True)  # When EasyPost created the shipment
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # When we saved it locally
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True)
    value = Column(JSON)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ScanForm(Base):
    __tablename__ = "scanforms"

    id = Column(Integer, primary_key=True, index=True)
    easypost_id = Column(String(255), unique=True, index=True)  # sf_...
    status = Column(String(50))  # creating, created, failed
    form_url = Column(Text)
    tracking_codes = Column(JSON)  # List of tracking codes included
    shipment_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
