from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..models import Shipment
from ..schemas import ShipmentResponse, ShipmentListResponse, DashboardStats
from ..services import easypost_service

router = APIRouter(prefix="/api/shipments", tags=["shipments"])


@router.get("", response_model=ShipmentListResponse)
async def list_shipments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    method: Optional[str] = None,
    carrier: Optional[str] = None,
    manifested: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    """
    List all shipments with pagination and filtering.
    """
    query = db.query(Shipment)

    # Apply filters
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Shipment.to_name.ilike(search_term)) |
            (Shipment.tracking_code.ilike(search_term)) |
            (Shipment.to_city.ilike(search_term))
        )

    if method:
        query = query.filter(Shipment.method == method)

    if carrier:
        query = query.filter(Shipment.carrier == carrier)

    if manifested == "yes":
        query = query.filter(Shipment.manifested.isnot(None))
    elif manifested == "no":
        query = query.filter(Shipment.manifested.is_(None))

    if start_date:
        query = query.filter(Shipment.created_at >= start_date)

    if end_date:
        query = query.filter(Shipment.created_at <= end_date)

    # Get total count
    total = query.count()

    # Apply pagination - order by EasyPost creation time (most recent first), fall back to local created_at
    offset = (page - 1) * page_size
    shipments = query.order_by(
        desc(Shipment.easypost_created_at).nulls_last(),
        desc(Shipment.created_at)
    ).offset(offset).limit(page_size).all()

    total_pages = (total + page_size - 1) // page_size

    return ShipmentListResponse(
        shipments=[ShipmentResponse.model_validate(s) for s in shipments],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    # Total stats
    total_shipments = db.query(Shipment).count()
    total_cost = db.query(func.sum(Shipment.cost)).scalar() or 0

    # Today stats
    today_query = db.query(Shipment).filter(Shipment.created_at >= today_start)
    shipments_today = today_query.count()
    cost_today = db.query(func.sum(Shipment.cost)).filter(
        Shipment.created_at >= today_start
    ).scalar() or 0

    # Week stats
    week_query = db.query(Shipment).filter(Shipment.created_at >= week_start)
    shipments_this_week = week_query.count()
    cost_this_week = db.query(func.sum(Shipment.cost)).filter(
        Shipment.created_at >= week_start
    ).scalar() or 0

    # Method breakdown
    card_shipments = db.query(Shipment).filter(Shipment.method == "card").count()
    tracked_shipments = db.query(Shipment).filter(Shipment.method == "tracked").count()

    return DashboardStats(
        total_shipments=total_shipments,
        total_cost=round(total_cost, 2),
        shipments_today=shipments_today,
        cost_today=round(cost_today, 2),
        shipments_this_week=shipments_this_week,
        cost_this_week=round(cost_this_week, 2),
        card_shipments=card_shipments,
        tracked_shipments=tracked_shipments
    )


@router.get("/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    """Get a single shipment by ID."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Shipment not found")
    return ShipmentResponse.model_validate(shipment)


@router.post("/sync")
async def sync_from_easypost(db: Session = Depends(get_db)):
    """
    Sync shipments from EasyPost to local database.
    Imports any shipments not already in the database.
    Also checks and updates manifested status for existing shipments.
    """
    try:
        easypost_shipments = easypost_service.get_all_shipments(page_size=100)
        imported = 0
        skipped = 0
        manifested_updated = 0
        timestamps_updated = 0

        for ep_shipment in easypost_shipments:
            # Check if already exists
            existing = db.query(Shipment).filter(
                Shipment.easypost_id == ep_shipment.id
            ).first()

            if existing:
                updated = False

                # Check if manifested status needs updating (check both ScanForm and Batch)
                manifest_id = None

                # First check for ScanForm
                if hasattr(ep_shipment, 'scan_form') and ep_shipment.scan_form:
                    if hasattr(ep_shipment.scan_form, 'id'):
                        manifest_id = ep_shipment.scan_form.id
                    else:
                        manifest_id = str(ep_shipment.scan_form)

                # Also check for Batch (batch-created shipments are auto-manifested by EasyPost)
                if hasattr(ep_shipment, 'batch_id') and ep_shipment.batch_id:
                    batch_manifest = f"batch:{ep_shipment.batch_id}"
                    # Prefer ScanForm ID if present, otherwise use batch ID
                    if not manifest_id:
                        manifest_id = batch_manifest

                if manifest_id and not existing.manifested:
                    existing.manifested = manifest_id
                    manifested_updated += 1
                    updated = True

                # Update easypost_created_at if not set
                if not existing.easypost_created_at and hasattr(ep_shipment, 'created_at') and ep_shipment.created_at:
                    try:
                        existing.easypost_created_at = datetime.fromisoformat(ep_shipment.created_at.replace('Z', '+00:00'))
                        timestamps_updated += 1
                    except (ValueError, AttributeError):
                        pass

                skipped += 1
                continue

            # Skip shipments without labels
            if not ep_shipment.postage_label or not ep_shipment.selected_rate:
                continue

            # Extract addresses
            from_addr = ep_shipment.from_address
            to_addr = ep_shipment.to_address
            rate = ep_shipment.selected_rate
            parcel = ep_shipment.parcel

            # Determine method based on parcel type
            method = "card"
            if hasattr(parcel, 'predefined_package') and parcel.predefined_package == "card":
                method = "card"
            elif float(rate.rate) > 1.0:
                method = "tracked"

            # Check if this shipment is already manifested (via ScanForm or Batch)
            manifest_id = None
            if hasattr(ep_shipment, 'scan_form') and ep_shipment.scan_form:
                if hasattr(ep_shipment.scan_form, 'id'):
                    manifest_id = ep_shipment.scan_form.id
                else:
                    manifest_id = str(ep_shipment.scan_form)

            # Also check for Batch (batch-created shipments are auto-manifested)
            if hasattr(ep_shipment, 'batch_id') and ep_shipment.batch_id:
                batch_manifest = f"batch:{ep_shipment.batch_id}"
                if not manifest_id:
                    manifest_id = batch_manifest

            # Parse EasyPost created_at timestamp
            ep_created_at = None
            if hasattr(ep_shipment, 'created_at') and ep_shipment.created_at:
                try:
                    # EasyPost returns ISO format timestamps
                    ep_created_at = datetime.fromisoformat(ep_shipment.created_at.replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    pass

            # Create shipment record
            shipment = Shipment(
                easypost_id=ep_shipment.id,
                tracking_code=ep_shipment.tracking_code,
                label_url=ep_shipment.postage_label.label_url,
                from_name=from_addr.name or "",
                from_street1=from_addr.street1 or "",
                from_street2=from_addr.street2 or "",
                from_city=from_addr.city or "",
                from_state=from_addr.state or "",
                from_zip=from_addr.zip or "",
                from_country=from_addr.country or "US",
                from_phone=from_addr.phone or "",
                to_name=to_addr.name or "",
                to_street1=to_addr.street1 or "",
                to_street2=to_addr.street2 or "",
                to_city=to_addr.city or "",
                to_state=to_addr.state or "",
                to_zip=to_addr.zip or "",
                to_country=to_addr.country or "US",
                to_phone=to_addr.phone or "",
                carrier=rate.carrier,
                service=rate.service,
                cost=float(rate.rate),
                method=method,
                parcel_weight=float(parcel.weight) if parcel.weight else 0,
                parcel_length=float(parcel.length) if hasattr(parcel, 'length') and parcel.length else None,
                parcel_width=float(parcel.width) if hasattr(parcel, 'width') and parcel.width else None,
                parcel_height=float(parcel.height) if hasattr(parcel, 'height') and parcel.height else None,
                parcel_predefined=parcel.predefined_package if hasattr(parcel, 'predefined_package') else None,
                status="created",
                manifested=manifest_id,  # Set manifested status from EasyPost (ScanForm or Batch)
                easypost_created_at=ep_created_at,  # Original creation time from EasyPost
            )

            db.add(shipment)
            imported += 1

        db.commit()

        return {
            "message": "Sync completed",
            "imported": imported,
            "skipped": skipped,
            "manifested_updated": manifested_updated,
            "timestamps_updated": timestamps_updated,
            "total_processed": len(easypost_shipments)
        }

    except Exception as e:
        return {"error": str(e)}


@router.post("/refresh-manifested")
async def refresh_manifested_status(db: Session = Depends(get_db)):
    """
    Check all tracked shipments against EasyPost and update their manifested status.
    Use this to sync manifested status for shipments that were manifested outside this app.
    """
    try:
        # Get all tracked shipments that are not yet marked as manifested
        shipments = db.query(Shipment).filter(
            Shipment.method != "card",
            Shipment.manifested.is_(None)
        ).all()

        updated = 0
        errors = 0

        for shipment in shipments:
            try:
                scan_form_id = easypost_service.check_shipment_manifested(shipment.easypost_id)
                if scan_form_id:
                    shipment.manifested = scan_form_id
                    updated += 1
            except Exception:
                errors += 1

        db.commit()

        return {
            "message": "Manifested status refresh completed",
            "checked": len(shipments),
            "updated": updated,
            "errors": errors
        }

    except Exception as e:
        return {"error": str(e)}


@router.post("/clear-batch-manifested")
async def clear_batch_manifested(db: Session = Depends(get_db)):
    """
    Clear manifested status for shipments that were incorrectly marked as manifested
    due to a batch_id check. This only clears manifested values that start with "batch:".
    Real ScanForm manifested values (starting with "sf_") are preserved.
    """
    try:
        # Find shipments with batch manifested values
        batch_shipments = db.query(Shipment).filter(
            Shipment.manifested.like("batch:%")
        ).all()

        cleared = len(batch_shipments)

        for shipment in batch_shipments:
            shipment.manifested = None

        db.commit()

        return {
            "message": "Cleared incorrect batch manifested values",
            "cleared": cleared
        }

    except Exception as e:
        return {"error": str(e)}


@router.get("/debug/{shipment_id}")
async def debug_easypost_shipment(shipment_id: int, db: Session = Depends(get_db)):
    """
    Debug endpoint to see raw EasyPost data for a shipment.
    Returns what EasyPost returns for scan_form and batch_id fields.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Shipment not found")

    try:
        ep_shipment = easypost_service.get_shipment_by_id(shipment.easypost_id)

        return {
            "db_shipment": {
                "id": shipment.id,
                "easypost_id": shipment.easypost_id,
                "manifested": shipment.manifested,
                "method": shipment.method,
            },
            "easypost_data": {
                "id": ep_shipment.id,
                "has_scan_form_attr": hasattr(ep_shipment, 'scan_form'),
                "scan_form": str(ep_shipment.scan_form) if hasattr(ep_shipment, 'scan_form') and ep_shipment.scan_form else None,
                "scan_form_type": type(ep_shipment.scan_form).__name__ if hasattr(ep_shipment, 'scan_form') and ep_shipment.scan_form else None,
                "has_batch_id_attr": hasattr(ep_shipment, 'batch_id'),
                "batch_id": ep_shipment.batch_id if hasattr(ep_shipment, 'batch_id') else None,
                "batch_id_type": type(ep_shipment.batch_id).__name__ if hasattr(ep_shipment, 'batch_id') and ep_shipment.batch_id else None,
            }
        }
    except Exception as e:
        return {"error": str(e)}
