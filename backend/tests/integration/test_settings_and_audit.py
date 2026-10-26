import pytest

from app.core.permissions import RoleCode

SETTINGS = "/api/v1/settings"
AUDIT = "/api/v1/audit-logs"


@pytest.fixture
def admin(auth_headers):
    return auth_headers(RoleCode.ADMIN)


def test_admin_reads_and_updates_settings(client, admin):
    response = client.patch(
        SETTINGS,
        headers=admin,
        json={
            "store_name": "Tạp hóa Minh Anh",
            "max_discount_percent_cashier": "7.5",
            "return_window_days": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["store_name"] == "Tạp hóa Minh Anh"
    assert body["max_discount_percent_cashier"] == "7.5"
    assert body["return_window_days"] == 3
    assert body["my_max_discount_percent"] is None  # Admin không giới hạn
    assert client.get(SETTINGS, headers=admin).json()["store_name"] == "Tạp hóa Minh Anh"


def test_cashier_sees_only_store_info_and_own_limit(client, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")

    body = client.get(SETTINGS, headers=cashier).json()

    assert body == {
        "store_name": "SmartStore",
        "store_address": "",
        "store_phone": "",
        "return_window_days": 7,
        "my_max_discount_percent": "10",
    }


def test_only_admin_can_update_settings(client, auth_headers):
    manager = auth_headers(RoleCode.MANAGER, username="quanly")

    assert client.patch(SETTINGS, headers=manager, json={"store_name": "X"}).status_code == 403


@pytest.mark.parametrize(
    "payload, field",
    [
        ({"max_discount_percent_cashier": 101}, "max_discount_percent_cashier"),
        ({"return_window_days": -1}, "return_window_days"),
        ({"store_name": ""}, "store_name"),
        ({"unknown_key": 1}, "unknown_key"),
    ],
)
def test_settings_validation(client, admin, payload, field):
    response = client.patch(SETTINGS, headers=admin, json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


def test_settings_change_takes_effect_in_business_rules(client, admin, auth_headers, db):
    from tests.factories import make_category, make_product, set_stock

    product = make_product(db, make_category(db), "A", sale_price="10000")
    set_stock(db, product, 10, "5000")
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    client.patch(SETTINGS, headers=admin, json={"max_discount_percent_cashier": 0})

    import uuid

    response = client.post(
        "/api/v1/orders",
        headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": product.id, "quantity": 1}],
            "discount": {"type": "AMOUNT", "value": 1000},
            "payment": {"method": "CARD"},
        },
    )

    assert response.status_code == 403
    assert response.json()["error"]["details"] == {"max_percent": "0"}


def test_audit_log_lists_changes_with_filters(client, admin):
    client.patch(SETTINGS, headers=admin, json={"store_phone": "028 1234 5678"})
    client.post("/api/v1/auth/login", json={"username": "admin", "password": "Sai12345"})

    everything = client.get(AUDIT, headers=admin).json()
    settings_only = client.get(AUDIT, headers=admin, params={"action": "settings_update"}).json()

    assert [log["action"] for log in everything["items"]][:2] == ["LOGIN_FAILED", "SETTINGS_UPDATE"]
    change = settings_only["items"][0]
    assert change["user"]["full_name"] == "Admin"
    assert change["old_values"] == {"store_phone": ""}
    assert change["new_values"] == {"store_phone": "028 1234 5678"}


def test_only_admin_can_read_audit_log(client, auth_headers):
    manager = auth_headers(RoleCode.MANAGER, username="quanly")

    assert client.get(AUDIT, headers=manager).status_code == 403
