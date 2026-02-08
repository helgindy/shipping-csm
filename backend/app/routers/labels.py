from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import shutil
import tempfile
import pandas as pd
import httpx
from io import BytesIO
from PIL import Image

from ..database import get_db
from ..models import Shipment, Setting, ScanForm
from ..schemas import (
    CreateLabelRequest,
    RateQuoteRequest,
    RateQuoteResponse,
    Rate,
    LabelResponse,
    CreateScanFormRequest,
    ScanFormResponse,
)
from ..services import easypost_service
from .settings import get_setting, DEFAULT_FROM_ADDRESS

router = APIRouter(prefix="/api/labels", tags=["labels"])


def get_default_from_address(db: Session) -> dict:
    """Get the default from address from settings."""
    from_address = get_setting(db, "default_from_address")
    if not from_address:
        return DEFAULT_FROM_ADDRESS
    return from_address


@router.post("/create", response_model=LabelResponse)
async def create_label(
    request: CreateLabelRequest,
    db: Session = Depends(get_db)
):
    """
    Create and purchase a shipping label.
    Uses default from address if not provided.
    """
    # Get from address (use default if not provided)
    if request.from_address:
        from_address = request.from_address.model_dump()
    else:
        from_address = get_default_from_address(db)

    # Convert to EasyPost format
    to_address = request.to_address.model_dump()

    try:
        # Create and buy label
        result = easypost_service.create_and_buy_label(
            from_address=from_address,
            to_address=to_address,
            parcel_type=request.parcel_type,
            custom_parcel=request.parcel.model_dump() if request.parcel else None,
            insurance_amount=request.insurance_amount
        )

        # Save to database
        parcel = result["parcel"]
        shipment = Shipment(
            easypost_id=result["easypost_id"],
            tracking_code=result["tracking_code"],
            label_url=result["label_url"],
            from_name=from_address["name"],
            from_street1=from_address["street1"],
            from_street2=from_address.get("street2", ""),
            from_city=from_address["city"],
            from_state=from_address["state"],
            from_zip=from_address["zip"],
            from_country=from_address.get("country", "US"),
            from_phone=from_address.get("phone", ""),
            to_name=to_address["name"],
            to_street1=to_address["street1"],
            to_street2=to_address.get("street2", ""),
            to_city=to_address["city"],
            to_state=to_address["state"],
            to_zip=to_address["zip"],
            to_country=to_address.get("country", "US"),
            to_phone=to_address.get("phone", ""),
            carrier=result["carrier"],
            service=result["service"],
            cost=result["cost"],
            method=result["method"],
            parcel_weight=parcel.get("weight", 0),
            parcel_length=parcel.get("length"),
            parcel_width=parcel.get("width"),
            parcel_height=parcel.get("height"),
            parcel_predefined=parcel.get("predefined_package"),
            status="created",
            easypost_created_at=datetime.now(timezone.utc),  # Created right now
        )

        db.add(shipment)
        db.commit()
        db.refresh(shipment)

        return LabelResponse(
            id=shipment.id,
            easypost_id=shipment.easypost_id,
            tracking_code=shipment.tracking_code,
            label_url=shipment.label_url,
            to_name=shipment.to_name,
            carrier=shipment.carrier,
            service=shipment.service,
            cost=shipment.cost,
            method=shipment.method,
            created_at=shipment.created_at
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rates", response_model=RateQuoteResponse)
async def get_rates(
    request: RateQuoteRequest,
    db: Session = Depends(get_db)
):
    """
    Get shipping rate quotes without purchasing.
    """
    # Get from address
    if request.from_address:
        from_address = request.from_address.model_dump()
    else:
        from_address = get_default_from_address(db)

    to_address = request.to_address.model_dump()

    try:
        rates = easypost_service.get_rates(
            from_address=from_address,
            to_address=to_address,
            parcel_type=request.parcel_type
        )

        rate_list = [Rate(**r) for r in rates]
        lowest = rate_list[0] if rate_list else None

        return RateQuoteResponse(
            rates=rate_list,
            lowest_rate=lowest
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk")
async def create_bulk_labels(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Create labels from a CSV file upload.
    CSV should have columns: FirstName, LastName, Address1, Address2, City, State, PostalCode, Value Of Products
    """
    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Read CSV
        df = pd.read_csv(tmp_path)

        # Get default from address
        from_address = get_default_from_address(db)

        results = []
        total_tracked_cost = 0.0
        total_card_cost = 0.0

        for _, row in df.iterrows():
            # Parse postal code
            postal_code = str(row["PostalCode"]).split("-")[0]

            to_address = {
                "name": f"{row['FirstName']} {row['LastName']}",
                "street1": row["Address1"],
                "street2": row["Address2"] if pd.notna(row.get("Address2")) else "",
                "city": row["City"],
                "state": row["State"],
                "zip": postal_code,
                "country": "US",
                "phone": "000-000-0000"
            }

            # Determine parcel type based on value
            value = float(row.get("Value Of Products", 0))
            parcel_type = "tracked" if value > 50.0 else "card"

            try:
                result = easypost_service.create_and_buy_label(
                    from_address=from_address,
                    to_address=to_address,
                    parcel_type="standard" if parcel_type == "tracked" else "card"
                )

                # Save to database
                parcel = result["parcel"]
                shipment = Shipment(
                    easypost_id=result["easypost_id"],
                    tracking_code=result["tracking_code"],
                    label_url=result["label_url"],
                    from_name=from_address["name"],
                    from_street1=from_address["street1"],
                    from_street2=from_address.get("street2", ""),
                    from_city=from_address["city"],
                    from_state=from_address["state"],
                    from_zip=from_address["zip"],
                    from_country=from_address.get("country", "US"),
                    from_phone=from_address.get("phone", ""),
                    to_name=to_address["name"],
                    to_street1=to_address["street1"],
                    to_street2=to_address.get("street2", ""),
                    to_city=to_address["city"],
                    to_state=to_address["state"],
                    to_zip=to_address["zip"],
                    to_country="US",
                    to_phone="",
                    carrier=result["carrier"],
                    service=result["service"],
                    cost=result["cost"],
                    method=parcel_type,
                    parcel_weight=parcel.get("weight", 0),
                    parcel_length=parcel.get("length"),
                    parcel_width=parcel.get("width"),
                    parcel_height=parcel.get("height"),
                    parcel_predefined=parcel.get("predefined_package"),
                    status="created",
                    easypost_created_at=datetime.now(timezone.utc),  # Created right now
                )

                db.add(shipment)

                cost = result["cost"]
                if parcel_type == "tracked":
                    total_tracked_cost += cost
                else:
                    total_card_cost += cost

                results.append({
                    "to": to_address["name"],
                    "label_url": result["label_url"],
                    "tracking_code": result["tracking_code"],
                    "method": parcel_type,
                    "cost": cost
                })

            except Exception as e:
                results.append({
                    "to": to_address["name"],
                    "error": str(e)
                })

        db.commit()

        return {
            "results": results,
            "total_tracked_cost": round(total_tracked_cost, 2),
            "total_card_cost": round(total_card_cost, 2),
            "total_cost": round(total_tracked_cost + total_card_cost, 2)
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        # Clean up temp file
        import os
        os.unlink(tmp_path)


@router.get("/print/{shipment_id}")
async def get_printable_label(
    shipment_id: int,
    rotate: bool = True,
    db: Session = Depends(get_db)
):
    """
    Fetch a label image, optionally rotate it 90 degrees for portrait printing,
    and return it as a PNG image.
    """
    # Get shipment from database
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.label_url:
        raise HTTPException(status_code=400, detail="No label URL for this shipment")

    try:
        # Fetch the label image from EasyPost/S3
        async with httpx.AsyncClient() as client:
            response = await client.get(shipment.label_url, follow_redirects=True)
            response.raise_for_status()

        # Open image with PIL
        img = Image.open(BytesIO(response.content))

        # Rotate 90 degrees clockwise for portrait orientation (for card labels)
        if rotate and shipment.method == "card":
            img = img.rotate(-90, expand=True)

        # Save to bytes
        output = BytesIO()
        img.save(output, format="PNG")
        output.seek(0)

        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=label_{shipment.tracking_code}.png"
            }
        )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch label: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process label: {str(e)}")


@router.post("/scanform", response_model=ScanFormResponse)
async def create_scan_form(
    request: CreateScanFormRequest,
    db: Session = Depends(get_db)
):
    """
    Create a USPS ScanForm for multiple shipments.

    A ScanForm allows you to hand all packages to USPS at once with a single scan,
    rather than having each package scanned individually.

    Requirements:
    - All shipments must share the same origin address
    - Shipments must be tracked (not card/letter shipments)
    - Each shipment can only be in one ScanForm
    """
    if not request.shipment_ids:
        raise HTTPException(status_code=400, detail="At least one shipment ID is required")

    # Get the shipments from database
    shipments = db.query(Shipment).filter(Shipment.id.in_(request.shipment_ids)).all()

    if len(shipments) != len(request.shipment_ids):
        raise HTTPException(status_code=404, detail="One or more shipments not found")

    # Get EasyPost IDs
    easypost_ids = [s.easypost_id for s in shipments]

    # Verify all shipments are tracked (not card)
    card_shipments = [s for s in shipments if s.method == "card"]
    if card_shipments:
        raise HTTPException(
            status_code=400,
            detail=f"ScanForms can only be created for tracked shipments. {len(card_shipments)} card shipment(s) selected."
        )

    # Check if any shipments are already manifested
    already_manifested = [s for s in shipments if s.manifested]
    if already_manifested:
        raise HTTPException(
            status_code=400,
            detail=f"{len(already_manifested)} shipment(s) have already been added to a scan form and cannot be added again."
        )

    try:
        result = easypost_service.create_scan_form(easypost_ids)

        # Save scan form to database
        scanform = ScanForm(
            easypost_id=result["id"],
            status=result["status"],
            form_url=result["form_url"],
            tracking_codes=result["tracking_codes"],
            shipment_count=len(result["tracking_codes"]),
        )
        db.add(scanform)

        # Mark all shipments as manifested
        for shipment in shipments:
            shipment.manifested = result["id"]

        db.commit()

        return ScanFormResponse(
            id=result["id"],
            status=result["status"],
            form_url=result["form_url"],
            tracking_codes=result["tracking_codes"],
            created_at=result["created_at"],
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
