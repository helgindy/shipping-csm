from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from ..database import get_db
from ..models import ScanForm
from ..services import easypost_service

router = APIRouter(prefix="/api/scanforms", tags=["scanforms"], dependencies=[Depends(get_current_user)])


class ScanFormResponse(BaseModel):
    id: int
    easypost_id: str
    status: str
    form_url: str
    tracking_codes: List[str]
    shipment_count: int
    created_at: str

    class Config:
        from_attributes = True


class ScanFormListResponse(BaseModel):
    scanforms: List[ScanFormResponse]
    total: int


@router.get("", response_model=ScanFormListResponse)
async def get_scanforms(db: Session = Depends(get_db)):
    """Get all scan forms from database."""
    scanforms = db.query(ScanForm).order_by(ScanForm.created_at.desc()).all()

    result = []
    for sf in scanforms:
        result.append(ScanFormResponse(
            id=sf.id,
            easypost_id=sf.easypost_id,
            status=sf.status,
            form_url=sf.form_url or "",
            tracking_codes=sf.tracking_codes or [],
            shipment_count=sf.shipment_count or len(sf.tracking_codes or []),
            created_at=sf.created_at.isoformat() if sf.created_at else "",
        ))

    return ScanFormListResponse(scanforms=result, total=len(result))


@router.post("/sync")
async def sync_scanforms(db: Session = Depends(get_db)):
    """Sync scan forms from EasyPost to database."""
    try:
        easypost_scanforms = easypost_service.get_all_scan_forms()

        imported = 0
        for sf_data in easypost_scanforms:
            # Check if already exists
            existing = db.query(ScanForm).filter(
                ScanForm.easypost_id == sf_data["id"]
            ).first()

            if not existing:
                scanform = ScanForm(
                    easypost_id=sf_data["id"],
                    status=sf_data["status"],
                    form_url=sf_data["form_url"],
                    tracking_codes=sf_data["tracking_codes"],
                    shipment_count=len(sf_data["tracking_codes"]),
                )
                db.add(scanform)
                imported += 1
            else:
                # Update status if changed
                if existing.status != sf_data["status"]:
                    existing.status = sf_data["status"]
                if existing.form_url != sf_data["form_url"]:
                    existing.form_url = sf_data["form_url"]

        db.commit()

        return {
            "message": f"Synced {imported} new scan forms",
            "imported": imported,
            "total": len(easypost_scanforms)
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{scanform_id}")
async def get_scanform(scanform_id: int, db: Session = Depends(get_db)):
    """Get a specific scan form by ID."""
    scanform = db.query(ScanForm).filter(ScanForm.id == scanform_id).first()
    if not scanform:
        raise HTTPException(status_code=404, detail="ScanForm not found")

    return ScanFormResponse(
        id=scanform.id,
        easypost_id=scanform.easypost_id,
        status=scanform.status,
        form_url=scanform.form_url or "",
        tracking_codes=scanform.tracking_codes or [],
        shipment_count=scanform.shipment_count or len(scanform.tracking_codes or []),
        created_at=scanform.created_at.isoformat() if scanform.created_at else "",
    )
