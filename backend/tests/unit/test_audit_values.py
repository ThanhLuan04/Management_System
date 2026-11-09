from datetime import date
from decimal import Decimal

from app.services.audit_service import _scrub


def test_nested_money_and_dates_become_json_safe_and_secrets_are_dropped():
    values = {
        "options": [{"name": "Lớn", "price_delta": Decimal("10000.00")}],
        "period": (date(2026, 11, 9),),
        "password": "bí mật",
    }

    assert _scrub(values) == {
        "options": [{"name": "Lớn", "price_delta": "10000.00"}],
        "period": ["2026-11-09"],
    }
