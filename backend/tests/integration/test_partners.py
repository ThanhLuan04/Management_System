import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog

SUPPLIERS = "/api/v1/suppliers"
CUSTOMERS = "/api/v1/customers"


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER)


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


# ---------- Nhà cung cấp ----------


def test_create_suppliers_with_generated_codes(client, manager):
    first = client.post(
        SUPPLIERS,
        headers=manager,
        json={
            "name": "Công ty Vinamilk",
            "contact_name": "Chị Lan",
            "phone": "028 5415 5555",
            "tax_code": "0300588569",
        },
    )
    second = client.post(SUPPLIERS, headers=manager, json={"name": "Nhà phân phối Hòa Phát"})

    assert first.status_code == 201
    assert first.json()["code"] == "NCC0001"
    assert second.json()["code"] == "NCC0002"


def test_supplier_validation(client, manager):
    response = client.post(
        SUPPLIERS,
        headers=manager,
        json={"name": "X", "email": "khong-hop-le", "tax_code": "abc", "code": "NCC9"},
    )

    assert response.status_code == 422
    fields = {d["field"] for d in response.json()["error"]["details"]}
    assert fields == {"email", "tax_code", "code"}  # mã do hệ thống sinh, client không được tự đặt


def test_search_filter_and_deactivate_supplier(client, manager, db):
    a = client.post(SUPPLIERS, headers=manager, json={"name": "Vinamilk", "contact_name": "Chị Lan"}).json()
    client.post(SUPPLIERS, headers=manager, json={"name": "Masan"})

    assert [
        s["name"] for s in client.get(SUPPLIERS, headers=manager, params={"q": "lan"}).json()["items"]
    ] == ["Vinamilk"]
    assert (
        client.get(SUPPLIERS, headers=manager, params={"q": "ncc0002"}).json()["items"][0]["name"] == "Masan"
    )

    updated = client.patch(f"{SUPPLIERS}/{a['id']}", headers=manager, json={"is_active": False, "name": None})
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False
    assert updated.json()["name"] == "Vinamilk"  # name=null bị bỏ qua, không xóa tên

    active = client.get(SUPPLIERS, headers=manager, params={"is_active": True}).json()
    assert [s["name"] for s in active["items"]] == ["Masan"]
    assert db.scalar(select(AuditLog).where(AuditLog.action == "SUPPLIER_UPDATE")).new_values == {
        "is_active": False
    }


def test_cashier_cannot_access_suppliers(client, cashier):
    assert client.get(SUPPLIERS, headers=cashier).status_code == 403
    assert client.post(SUPPLIERS, headers=cashier, json={"name": "X"}).status_code == 403


def test_missing_supplier_returns_404(client, manager):
    assert client.get(f"{SUPPLIERS}/999", headers=manager).status_code == 404


# ---------- Khách hàng ----------


def test_cashier_creates_customer_with_normalized_phone(client, cashier):
    response = client.post(
        CUSTOMERS, headers=cashier, json={"name": "Trần Thị B", "phone": "+84 901 234 567"}
    )

    assert response.status_code == 201
    assert response.json()["code"] == "KH000001"
    assert response.json()["phone"] == "0901234567"


def test_customer_phone_must_be_unique_in_any_format(client, cashier):
    client.post(CUSTOMERS, headers=cashier, json={"name": "A", "phone": "0901234567"})

    response = client.post(CUSTOMERS, headers=cashier, json={"name": "B", "phone": "0901.234.567"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_PHONE"


def test_customer_without_phone_is_allowed_multiple_times(client, cashier):
    for name in ("Khách A", "Khách B"):
        assert client.post(CUSTOMERS, headers=cashier, json={"name": name, "phone": ""}).status_code == 201


def test_invalid_customer_phone(client, cashier):
    response = client.post(CUSTOMERS, headers=cashier, json={"name": "A", "phone": "12345"})

    assert response.status_code == 422
    assert response.json()["error"]["details"] == [
        {"field": "phone", "message": "Số điện thoại không hợp lệ"}
    ]


def test_search_customer_by_partial_phone_name_or_code(client, cashier):
    client.post(CUSTOMERS, headers=cashier, json={"name": "Trần Thị B", "phone": "0901234567"})
    client.post(CUSTOMERS, headers=cashier, json={"name": "Lê Văn C", "phone": "0987654321"})

    def names(q):
        return [c["name"] for c in client.get(CUSTOMERS, headers=cashier, params={"q": q}).json()["items"]]

    assert names("234 567") == ["Trần Thị B"]  # gõ có khoảng trắng vẫn tìm được
    assert names("lê văn") == ["Lê Văn C"]
    assert names("KH000002") == ["Lê Văn C"]


def test_update_customer_phone_conflict_and_success(client, cashier):
    a = client.post(CUSTOMERS, headers=cashier, json={"name": "A", "phone": "0901234567"}).json()
    b = client.post(CUSTOMERS, headers=cashier, json={"name": "B", "phone": "0911111111"}).json()

    conflict = client.patch(f"{CUSTOMERS}/{b['id']}", headers=cashier, json={"phone": "0901 234 567"})
    same_customer = client.patch(f"{CUSTOMERS}/{a['id']}", headers=cashier, json={"phone": "0901234567"})
    cleared = client.patch(f"{CUSTOMERS}/{b['id']}", headers=cashier, json={"phone": None})

    assert conflict.status_code == 409
    assert same_customer.status_code == 200  # giữ nguyên SĐT của chính mình không bị coi là trùng
    assert cleared.json()["phone"] is None


def test_customer_endpoints_require_login(client):
    assert client.get(CUSTOMERS).status_code == 401
