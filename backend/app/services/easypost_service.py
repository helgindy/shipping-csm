import easypost
import os
from typing import Optional, List, Dict, Any
from ..config import get_settings

# Store clients for both environments
_clients: Dict[str, easypost.EasyPostClient] = {}
_current_environment: str = "production"


def _get_settings():
    """Get fresh settings (not cached for env var changes)."""
    return get_settings()


def _get_api_key(environment: str) -> str:
    """Get API key for specified environment, checking env vars directly."""
    if environment == "test":
        # Check env var directly first, then fall back to settings
        key = os.environ.get("EASYPOST_API_KEY_TEST", "")
        if key:
            return key
        return _get_settings().get_test_key()
    else:
        key = os.environ.get("EASYPOST_API_KEY_PRODUCTION", "")
        if key:
            return key
        return _get_settings().get_production_key()


def _get_client() -> easypost.EasyPostClient:
    """Get the EasyPost client for the current environment."""
    global _clients, _current_environment

    if _current_environment not in _clients:
        api_key = _get_api_key(_current_environment)

        if not api_key:
            raise Exception(f"No API key configured for {_current_environment} environment")

        _clients[_current_environment] = easypost.EasyPostClient(api_key)

    return _clients[_current_environment]


def get_current_environment() -> str:
    """Get the current API environment."""
    return _current_environment


def set_environment(env: str) -> Dict[str, Any]:
    """
    Switch between test and production environments.

    Args:
        env: Either "test" or "production"

    Returns:
        Dictionary with environment info
    """
    global _current_environment

    if env not in ["test", "production"]:
        raise ValueError("Environment must be 'test' or 'production'")

    _current_environment = env

    # Verify the key exists
    api_key = _get_api_key(env)

    if not api_key:
        raise Exception(f"No API key configured for {env} environment")

    # Clear cached client to force reload
    if env in _clients:
        del _clients[env]

    return {
        "environment": env,
        "key_prefix": api_key[:10] + "..." if api_key else None,
        "is_production": env == "production"
    }


def get_environment_info() -> Dict[str, Any]:
    """Get info about current and available environments."""
    prod_key = _get_api_key("production")
    test_key = _get_api_key("test")

    return {
        "current_environment": _current_environment,
        "is_production": _current_environment == "production",
        "production_configured": bool(prod_key),
        "test_configured": bool(test_key),
        "production_key_prefix": prod_key[:10] + "..." if prod_key else None,
        "test_key_prefix": test_key[:10] + "..." if test_key else None,
    }


def create_shipment(
    from_address: Dict[str, Any],
    to_address: Dict[str, Any],
    parcel: Dict[str, Any],
) -> Any:
    """Create a shipment without buying it (for rate quotes)."""
    client = _get_client()
    try:
        shipment = client.shipment.create(
            from_address=from_address,
            to_address=to_address,
            parcel=parcel,
        )
        return shipment
    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def buy_shipment(shipment_id: str, rate: Any) -> Any:
    """Buy a shipment with the specified rate."""
    client = _get_client()
    try:
        bought_shipment = client.shipment.buy(shipment_id, rate=rate)
        return bought_shipment
    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def create_and_buy_label(
    from_address: Dict[str, Any],
    to_address: Dict[str, Any],
    parcel_type: str = "card",
    custom_parcel: Optional[Dict[str, Any]] = None,
    insurance_amount: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Create and purchase a shipping label.

    Args:
        from_address: Sender address details
        to_address: Recipient address details
        parcel_type: "card" for predefined card package, "standard" for standard dimensions
        custom_parcel: Custom parcel dimensions if provided
        insurance_amount: Optional insurance value in dollars (e.g., 100.00)

    Returns:
        Dictionary with shipment details including label URL and tracking code
    """
    client = _get_client()

    # Determine parcel based on type
    if custom_parcel:
        parcel = custom_parcel
    elif parcel_type == "card":
        parcel = {
            "predefined_package": "card",
            "weight": 3.0,
        }
    else:  # standard
        parcel = {
            "length": 6.0,
            "width": 4.5,
            "height": 0.016,
            "weight": 5.0,
        }

    try:
        # Create shipment
        shipment = client.shipment.create(
            from_address=from_address,
            to_address=to_address,
            parcel=parcel,
        )

        if not shipment.rates:
            raise Exception("No rates available for this shipment")

        # Get lowest rate
        lowest_rate = shipment.lowest_rate()
        if not lowest_rate:
            raise Exception("Could not determine lowest rate")

        # Buy the shipment with optional insurance
        if insurance_amount and insurance_amount > 0:
            bought_shipment = client.shipment.buy(
                shipment.id,
                rate=lowest_rate,
                insurance=insurance_amount
            )
        else:
            bought_shipment = client.shipment.buy(shipment.id, rate=lowest_rate)

        # Calculate total cost (shipping + insurance if purchased)
        shipping_cost = float(lowest_rate.rate)
        insurance_cost = 0.0
        if bought_shipment.insurance and hasattr(bought_shipment, 'insurance'):
            # EasyPost returns insurance info on the shipment after purchase
            if hasattr(bought_shipment.insurance, 'amount'):
                # Insurance was purchased - the cost is typically included in the response
                pass  # Insurance cost handling if EasyPost provides it

        return {
            "easypost_id": bought_shipment.id,
            "tracking_code": bought_shipment.tracking_code,
            "label_url": bought_shipment.postage_label.label_url,
            "carrier": lowest_rate.carrier,
            "service": lowest_rate.service,
            "cost": shipping_cost,
            "method": parcel_type,
            "parcel": parcel,
            "insurance_amount": insurance_amount if insurance_amount and insurance_amount > 0 else None,
        }

    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error ({e.code}): {e.message}")


def get_rates(
    from_address: Dict[str, Any],
    to_address: Dict[str, Any],
    parcel_type: str = "card",
) -> List[Dict[str, Any]]:
    """
    Get shipping rate quotes without purchasing.

    Returns:
        List of available rates with carrier, service, and price
    """
    client = _get_client()

    if parcel_type == "card":
        parcel = {
            "predefined_package": "card",
            "weight": 3.0,
        }
    else:
        parcel = {
            "length": 6.0,
            "width": 4.5,
            "height": 0.016,
            "weight": 5.0,
        }

    try:
        shipment = client.shipment.create(
            from_address=from_address,
            to_address=to_address,
            parcel=parcel,
        )

        rates = []
        for rate in shipment.rates:
            rates.append({
                "carrier": rate.carrier,
                "service": rate.service,
                "rate": float(rate.rate),
                "delivery_days": getattr(rate, 'delivery_days', None),
            })

        # Sort by price
        rates.sort(key=lambda x: x["rate"])

        return rates

    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def get_all_shipments(page_size: int = 100) -> List[Any]:
    """Retrieve all recent shipments from EasyPost."""
    client = _get_client()
    try:
        response = client.shipment.all(page_size=page_size)

        # Handle different response formats
        if hasattr(response, 'shipments'):
            return response.shipments
        elif hasattr(response, 'data'):
            return response.data
        elif isinstance(response, list):
            return response
        else:
            return []

    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def get_shipment_by_id(shipment_id: str) -> Any:
    """Retrieve a specific shipment by EasyPost ID."""
    client = _get_client()
    try:
        return client.shipment.retrieve(shipment_id)
    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def create_scan_form(shipment_ids: List[str]) -> Dict[str, Any]:
    """
    Create a USPS ScanForm (SCAN form) for multiple shipments.

    All shipments must:
    - Share the same origin address
    - Not already be part of another ScanForm
    - Not be refunded

    Args:
        shipment_ids: List of EasyPost shipment IDs (e.g., ["shp_...", "shp_..."])

    Returns:
        Dictionary with scan_form details including form_url
    """
    client = _get_client()

    if not shipment_ids:
        raise Exception("At least one shipment ID is required")

    try:
        # Create shipment objects with just IDs for the API
        shipments = [{"id": sid} for sid in shipment_ids]

        scan_form = client.scan_form.create(shipments=shipments)

        return {
            "id": scan_form.id,
            "status": scan_form.status,
            "form_url": scan_form.form_url,
            "tracking_codes": scan_form.tracking_codes or [],
            "created_at": scan_form.created_at,
        }

    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def get_all_scan_forms(page_size: int = 100) -> List[Dict[str, Any]]:
    """Retrieve all recent scan forms from EasyPost."""
    client = _get_client()
    try:
        response = client.scan_form.all(page_size=page_size)

        # Handle different response formats
        if hasattr(response, 'scan_forms'):
            scan_forms = response.scan_forms
        elif hasattr(response, 'data'):
            scan_forms = response.data
        elif isinstance(response, list):
            scan_forms = response
        else:
            scan_forms = []

        result = []
        for sf in scan_forms:
            result.append({
                "id": sf.id,
                "status": sf.status,
                "form_url": sf.form_url,
                "tracking_codes": sf.tracking_codes or [],
                "created_at": sf.created_at,
            })

        return result

    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def check_shipment_manifested(shipment_id: str) -> Optional[str]:
    """
    Check if a shipment is already manifested (via ScanForm or Batch).

    Args:
        shipment_id: EasyPost shipment ID (e.g., "shp_...")

    Returns:
        Manifest ID if manifested (ScanForm ID or "batch:BATCH_ID"), None otherwise
    """
    client = _get_client()
    try:
        shipment = client.shipment.retrieve(shipment_id)

        # Check if shipment has a scan_form attached
        if hasattr(shipment, 'scan_form') and shipment.scan_form:
            return shipment.scan_form.id if hasattr(shipment.scan_form, 'id') else str(shipment.scan_form)

        # Check if shipment was created via Batch API (auto-manifested)
        if hasattr(shipment, 'batch_id') and shipment.batch_id:
            return f"batch:{shipment.batch_id}"

        return None
    except easypost.errors.api_error.ApiError as e:
        raise Exception(f"EasyPost API Error: {e.message}")


def check_shipments_manifested(shipment_ids: List[str]) -> Dict[str, Optional[str]]:
    """
    Check multiple shipments for manifest status.

    Args:
        shipment_ids: List of EasyPost shipment IDs

    Returns:
        Dictionary mapping shipment_id to scan_form_id (or None if not manifested)
    """
    result = {}
    for sid in shipment_ids:
        try:
            result[sid] = check_shipment_manifested(sid)
        except Exception:
            result[sid] = None  # Assume not manifested if we can't check
    return result


