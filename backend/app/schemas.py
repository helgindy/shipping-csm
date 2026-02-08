from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Address schemas
class AddressBase(BaseModel):
    name: str
    street1: str
    street2: Optional[str] = ""
    city: str
    state: str
    zip: str
    country: str = "US"
    phone: str = "000-000-0000"


class FromAddress(AddressBase):
    pass


class ToAddress(AddressBase):
    pass


# Parcel schemas
class ParcelBase(BaseModel):
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: float
    predefined_package: Optional[str] = None  # e.g., "card"


class ParcelCard(BaseModel):
    predefined_package: str = "card"
    weight: float = 3.0


class ParcelStandard(BaseModel):
    length: float = 6.0
    width: float = 4.5
    height: float = 0.016
    weight: float = 5.0


# Label creation schemas
class CreateLabelRequest(BaseModel):
    to_address: ToAddress
    from_address: Optional[FromAddress] = None  # Use default if not provided
    parcel_type: str = "card"  # "card" or "standard"
    parcel: Optional[ParcelBase] = None  # Custom parcel dimensions
    insurance_amount: Optional[float] = None  # Insurance value in dollars (e.g., 100.00)


class RateQuoteRequest(BaseModel):
    to_address: ToAddress
    from_address: Optional[FromAddress] = None
    parcel_type: str = "card"


class Rate(BaseModel):
    carrier: str
    service: str
    rate: float
    delivery_days: Optional[int] = None


class RateQuoteResponse(BaseModel):
    rates: List[Rate]
    lowest_rate: Optional[Rate] = None


class LabelResponse(BaseModel):
    id: int
    easypost_id: str
    tracking_code: str
    label_url: str
    to_name: str
    carrier: str
    service: str
    cost: float
    method: str
    created_at: datetime


# Shipment schemas
class ShipmentBase(BaseModel):
    easypost_id: str
    tracking_code: str
    label_url: str
    from_name: str
    from_street1: str
    from_street2: Optional[str] = None
    from_city: str
    from_state: str
    from_zip: str
    from_country: str = "US"
    from_phone: str
    to_name: str
    to_street1: str
    to_street2: Optional[str] = None
    to_city: str
    to_state: str
    to_zip: str
    to_country: str = "US"
    to_phone: str
    carrier: str
    service: str
    cost: float
    method: str
    parcel_weight: float
    parcel_length: Optional[float] = None
    parcel_width: Optional[float] = None
    parcel_height: Optional[float] = None
    parcel_predefined: Optional[str] = None


class ShipmentCreate(ShipmentBase):
    pass


class ShipmentResponse(ShipmentBase):
    id: int
    status: str
    manifested: Optional[str] = None  # ScanForm ID if already manifested
    easypost_created_at: Optional[datetime] = None  # When EasyPost created the shipment
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ShipmentListResponse(BaseModel):
    shipments: List[ShipmentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# Settings schemas
class DefaultFromAddress(BaseModel):
    name: str = "KeystonedTCG"
    street1: str = "PO BOX 112"
    street2: str = ""
    city: str = "ALBRIGHTSVILLE"
    state: str = "PA"
    zip: str = "18210"
    country: str = "US"
    phone: str = "000-000-0000"


class SettingsResponse(BaseModel):
    default_from_address: DefaultFromAddress
    parcel_presets: dict


class SettingsUpdate(BaseModel):
    default_from_address: Optional[DefaultFromAddress] = None
    parcel_presets: Optional[dict] = None


# Dashboard stats
class DashboardStats(BaseModel):
    total_shipments: int
    total_cost: float
    shipments_today: int
    cost_today: float
    shipments_this_week: int
    cost_this_week: float
    card_shipments: int
    tracked_shipments: int


# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


# ScanForm schemas
class CreateScanFormRequest(BaseModel):
    shipment_ids: List[int]  # Database IDs of shipments to include


class ScanFormResponse(BaseModel):
    id: str  # EasyPost scan form ID (sf_...)
    status: str
    form_url: str
    tracking_codes: List[str]
    created_at: str
