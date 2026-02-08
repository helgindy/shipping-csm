from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from ..database import get_db
from ..models import Setting
from ..schemas import SettingsResponse, SettingsUpdate, DefaultFromAddress
from ..services import easypost_service

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Default settings values
DEFAULT_FROM_ADDRESS = {
    "name": "KeystonedTCG",
    "street1": "PO BOX 112",
    "street2": "",
    "city": "ALBRIGHTSVILLE",
    "state": "PA",
    "zip": "18210",
    "country": "US",
    "phone": "000-000-0000"
}

DEFAULT_PARCEL_PRESETS = {
    "card": {
        "name": "Card",
        "predefined_package": "card",
        "weight": 3.0,
        "length": None,
        "width": None,
        "height": None
    },
    "standard": {
        "name": "Standard",
        "predefined_package": None,
        "length": 6.0,
        "width": 4.5,
        "height": 0.016,
        "weight": 5.0
    }
}


class EnvironmentSwitch(BaseModel):
    environment: str  # "test" or "production"


class ParcelPreset(BaseModel):
    name: str
    predefined_package: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: float


class ParcelPresetCreate(BaseModel):
    key: str  # unique identifier like "card", "standard", "bubble_mailer"
    preset: ParcelPreset


class SavedAddress(BaseModel):
    name: str
    street1: str
    street2: Optional[str] = ""
    city: str
    state: str
    zip: str
    country: str = "US"
    phone: Optional[str] = ""
    label: str  # Display label like "Main Warehouse", "Home Office"


class SavedAddressCreate(BaseModel):
    key: str  # unique identifier
    address: SavedAddress


def get_setting(db: Session, key: str) -> Any:
    """Get a setting value from the database."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        return setting.value
    return None


def set_setting(db: Session, key: str, value: Any) -> Setting:
    """Set a setting value in the database."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = Setting(key=key, value=value)
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


@router.get("")
async def get_settings(db: Session = Depends(get_db)):
    """Get all application settings including API environment."""
    # Get from address or use default
    from_address = get_setting(db, "default_from_address")
    if not from_address:
        from_address = DEFAULT_FROM_ADDRESS
        set_setting(db, "default_from_address", from_address)

    # Get parcel presets or use default
    parcel_presets = get_setting(db, "parcel_presets")
    if not parcel_presets:
        parcel_presets = DEFAULT_PARCEL_PRESETS
        set_setting(db, "parcel_presets", parcel_presets)

    # Get API environment info
    env_info = easypost_service.get_environment_info()

    return {
        "default_from_address": from_address,
        "parcel_presets": parcel_presets,
        "api_environment": env_info
    }


@router.put("")
async def update_settings(
    settings_update: SettingsUpdate,
    db: Session = Depends(get_db)
):
    """Update application settings."""
    if settings_update.default_from_address:
        set_setting(
            db,
            "default_from_address",
            settings_update.default_from_address.model_dump()
        )

    if settings_update.parcel_presets:
        set_setting(db, "parcel_presets", settings_update.parcel_presets)

    # Return updated settings
    return await get_settings(db)


@router.get("/from-address")
async def get_from_address(db: Session = Depends(get_db)):
    """Get just the default from address."""
    from_address = get_setting(db, "default_from_address")
    if not from_address:
        from_address = DEFAULT_FROM_ADDRESS
        set_setting(db, "default_from_address", from_address)
    return from_address


@router.put("/from-address")
async def update_from_address(
    address: DefaultFromAddress,
    db: Session = Depends(get_db)
):
    """Update the default from address."""
    set_setting(db, "default_from_address", address.model_dump())
    return address


@router.get("/environment")
async def get_api_environment():
    """Get current API environment info."""
    return easypost_service.get_environment_info()


@router.put("/environment")
async def switch_api_environment(switch: EnvironmentSwitch):
    """Switch between test and production API environments."""
    try:
        result = easypost_service.set_environment(switch.environment)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Parcel Presets endpoints
@router.get("/parcel-presets")
async def get_parcel_presets(db: Session = Depends(get_db)):
    """Get all parcel presets."""
    presets = get_setting(db, "parcel_presets")
    if not presets:
        presets = DEFAULT_PARCEL_PRESETS
        set_setting(db, "parcel_presets", presets)
    return presets


@router.post("/parcel-presets")
async def add_parcel_preset(
    preset_data: ParcelPresetCreate,
    db: Session = Depends(get_db)
):
    """Add a new parcel preset."""
    presets = get_setting(db, "parcel_presets")
    if not presets:
        presets = DEFAULT_PARCEL_PRESETS.copy()

    # Add the new preset
    presets[preset_data.key] = preset_data.preset.model_dump()
    set_setting(db, "parcel_presets", presets)

    return {"message": "Preset added", "presets": presets}


@router.put("/parcel-presets/{preset_key}")
async def update_parcel_preset(
    preset_key: str,
    preset: ParcelPreset,
    db: Session = Depends(get_db)
):
    """Update an existing parcel preset."""
    presets = get_setting(db, "parcel_presets")
    if not presets:
        presets = DEFAULT_PARCEL_PRESETS.copy()

    if preset_key not in presets:
        raise HTTPException(status_code=404, detail="Preset not found")

    presets[preset_key] = preset.model_dump()
    set_setting(db, "parcel_presets", presets)

    return {"message": "Preset updated", "presets": presets}


@router.delete("/parcel-presets/{preset_key}")
async def delete_parcel_preset(
    preset_key: str,
    db: Session = Depends(get_db)
):
    """Delete a parcel preset."""
    presets = get_setting(db, "parcel_presets")
    if not presets:
        raise HTTPException(status_code=404, detail="No presets found")

    if preset_key not in presets:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Don't allow deleting built-in presets
    if preset_key in ["card", "standard"]:
        raise HTTPException(status_code=400, detail="Cannot delete built-in presets")

    del presets[preset_key]
    set_setting(db, "parcel_presets", presets)

    return {"message": "Preset deleted", "presets": presets}


# Saved Addresses endpoints
@router.get("/saved-addresses")
async def get_saved_addresses(db: Session = Depends(get_db)):
    """Get all saved sender addresses."""
    addresses = get_setting(db, "saved_addresses")
    if not addresses:
        # Initialize with default address
        default = get_setting(db, "default_from_address") or DEFAULT_FROM_ADDRESS
        addresses = {
            "default": {
                **default,
                "label": "Default Address"
            }
        }
        set_setting(db, "saved_addresses", addresses)
    return addresses


@router.post("/saved-addresses")
async def add_saved_address(
    address_data: SavedAddressCreate,
    db: Session = Depends(get_db)
):
    """Add a new saved address."""
    addresses = get_setting(db, "saved_addresses")
    if not addresses:
        addresses = {}

    if address_data.key in addresses:
        raise HTTPException(status_code=400, detail="Address key already exists")

    addresses[address_data.key] = address_data.address.model_dump()
    set_setting(db, "saved_addresses", addresses)

    return {"message": "Address saved", "addresses": addresses}


@router.put("/saved-addresses/{address_key}")
async def update_saved_address(
    address_key: str,
    address: SavedAddress,
    db: Session = Depends(get_db)
):
    """Update an existing saved address."""
    addresses = get_setting(db, "saved_addresses")
    if not addresses:
        raise HTTPException(status_code=404, detail="No addresses found")

    if address_key not in addresses:
        raise HTTPException(status_code=404, detail="Address not found")

    addresses[address_key] = address.model_dump()
    set_setting(db, "saved_addresses", addresses)

    return {"message": "Address updated", "addresses": addresses}


@router.delete("/saved-addresses/{address_key}")
async def delete_saved_address(
    address_key: str,
    db: Session = Depends(get_db)
):
    """Delete a saved address."""
    addresses = get_setting(db, "saved_addresses")
    if not addresses:
        raise HTTPException(status_code=404, detail="No addresses found")

    if address_key not in addresses:
        raise HTTPException(status_code=404, detail="Address not found")

    # Don't allow deleting the default address
    if address_key == "default":
        raise HTTPException(status_code=400, detail="Cannot delete default address")

    del addresses[address_key]
    set_setting(db, "saved_addresses", addresses)

    return {"message": "Address deleted", "addresses": addresses}


@router.put("/saved-addresses/{address_key}/set-default")
async def set_default_address(
    address_key: str,
    db: Session = Depends(get_db)
):
    """Set a saved address as the default from address."""
    addresses = get_setting(db, "saved_addresses")
    if not addresses:
        raise HTTPException(status_code=404, detail="No addresses found")

    if address_key not in addresses:
        raise HTTPException(status_code=404, detail="Address not found")

    # Get the address data (without the label)
    address_data = addresses[address_key].copy()
    label = address_data.pop("label", "Default Address")

    # Update the default from address
    set_setting(db, "default_from_address", address_data)

    return {"message": f"'{label}' set as default address", "default_from_address": address_data}
