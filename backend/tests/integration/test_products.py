import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog, Inventory

PRODUCTS = "/api/v1/products"

# Ảnh hợp lệ tối thiểu: chỉ cần đúng "magic bytes" ở đầu file
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 100


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER)


@pytest.fixture
def category(client, manager):
    root = client.post("/api/v1/categories", headers=manager, json={"name": "Đồ uống"}).json()
    child = client.post(
        "/api/v1/categories", headers=manager, json={"name": "Sữa", "parent_id": root["id"]}
    ).json()
    return {"root": root, "child": child}


@pytest.fixture
def new_product(client, manager, category):
    def _new_product(**overrides):
        payload = {
            "sku": "sua-th-1l",
            "barcode": "8935217400133",
            "name": "Sữa tươi TH True Milk 1L",
            "category_id": category["child"]["id"],
            "unit": "hộp",
            "sale_price": "32000",
            "min_stock": 10,
            **overrides,
        }
        response = client.post(PRODUCTS, headers=manager, json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _new_product


# ---------- Tạo & xem ----------


def test_create_product_normalizes_sku_and_starts_with_zero_stock(new_product, db):
    product = new_product(sku="  sua-th-1l ")

    assert product["sku"] == "SUA-TH-1L"
    assert product["sale_price"] == "32000.00"  # tiền trả về dạng chuỗi để không mất độ chính xác
    assert product["quantity"] == 0
    assert product["avg_cost"] == "0.0000"
    assert product["is_low_stock"] is True  # 0 <= min_stock 10
    assert product["category"]["name"] == "Sữa"

    inventory = db.get(Inventory, product["id"])
    assert (inventory.quantity, inventory.avg_cost) == (0, 0)


def test_cashier_sees_product_without_cost(client, auth_headers, new_product):
    product = new_product()
    cashier = auth_headers(RoleCode.CASHIER)

    detail = client.get(f"{PRODUCTS}/{product['id']}", headers=cashier).json()
    listing = client.get(PRODUCTS, headers=cashier).json()

    assert "avg_cost" not in detail
    assert "avg_cost" not in listing["items"][0]
    assert detail["quantity"] == 0  # thu ngân vẫn thấy tồn kho để bán hàng
    assert detail["barcode"] == "8935217400133"  # các trường khác vẫn đầy đủ


def test_cashier_cannot_create_or_update_products(client, auth_headers, new_product, category):
    product = new_product()
    cashier = auth_headers(RoleCode.CASHIER)

    assert client.post(PRODUCTS, headers=cashier, json={}).status_code == 403
    assert client.patch(f"{PRODUCTS}/{product['id']}", headers=cashier, json={"name": "X"}).status_code == 403


def test_duplicate_sku_and_barcode(client, manager, new_product, category):
    new_product()

    dup_sku = client.post(
        PRODUCTS,
        headers=manager,
        json={
            "sku": "SUA-th-1L",
            "name": "X",
            "category_id": category["child"]["id"],
            "unit": "hộp",
            "sale_price": 1,
        },
    )
    dup_barcode = client.post(
        PRODUCTS,
        headers=manager,
        json={
            "sku": "KHAC",
            "barcode": "8935217400133",
            "name": "X",
            "category_id": category["child"]["id"],
            "unit": "hộp",
            "sale_price": 1,
        },
    )

    assert dup_sku.status_code == 409 and dup_sku.json()["error"]["code"] == "DUPLICATE_SKU"
    assert dup_barcode.status_code == 409 and dup_barcode.json()["error"]["code"] == "DUPLICATE_BARCODE"


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"sku": "SUA TH"}, "sku"),
        ({"sku": "SỮA"}, "sku"),
        ({"sale_price": "1000.5"}, "sale_price"),
        ({"sale_price": -1}, "sale_price"),
        ({"min_stock": -1}, "min_stock"),
        ({"name": "   "}, "name"),
        ({"quantity": 100}, "quantity"),  # không được đặt tồn kho qua form sản phẩm
        ({"avg_cost": 5000}, "avg_cost"),
    ],
)
def test_create_product_validation(client, manager, category, overrides, field):
    payload = {
        "sku": "OK",
        "name": "Tên",
        "category_id": category["child"]["id"],
        "unit": "cái",
        "sale_price": 1000,
    }

    response = client.post(PRODUCTS, headers=manager, json={**payload, **overrides})

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


def test_cannot_set_stock_through_update(client, manager, new_product, db):
    product = new_product()

    response = client.patch(f"{PRODUCTS}/{product['id']}", headers=manager, json={"quantity": 999})

    assert response.status_code == 422
    assert db.get(Inventory, product["id"]).quantity == 0


def test_inactive_category_is_rejected(client, manager, category):
    other = client.post("/api/v1/categories", headers=manager, json={"name": "Cũ"}).json()
    client.patch(f"/api/v1/categories/{other['id']}", headers=manager, json={"is_active": False})

    response = client.post(
        PRODUCTS,
        headers=manager,
        json={"sku": "X", "name": "X", "category_id": other["id"], "unit": "cái", "sale_price": 1},
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "category_id"


# ---------- Sửa & ngừng kinh doanh ----------


def test_update_product_and_audit_money_fields(client, manager, new_product, db):
    product = new_product()

    response = client.patch(
        f"{PRODUCTS}/{product['id']}", headers=manager, json={"sale_price": 35000, "barcode": None}
    )

    assert response.status_code == 200
    assert response.json()["sale_price"] == "35000.00"
    assert response.json()["barcode"] is None
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "PRODUCT_UPDATE"))
    assert audit.old_values == {"sale_price": "32000.00", "barcode": "8935217400133"}
    assert audit.new_values == {"sale_price": "35000", "barcode": None}


def test_deactivate_product_and_reactivation_needs_active_category(client, manager, new_product, category):
    product = new_product()
    client.patch(f"{PRODUCTS}/{product['id']}", headers=manager, json={"is_active": False})
    client.patch(f"/api/v1/categories/{category['child']['id']}", headers=manager, json={"is_active": False})

    response = client.patch(f"{PRODUCTS}/{product['id']}", headers=manager, json={"is_active": True})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_INACTIVE"


def test_update_missing_product_returns_404(client, manager):
    assert client.patch(f"{PRODUCTS}/999999", headers=manager, json={"name": "X"}).status_code == 404


# ---------- Tìm kiếm, lọc, phân trang ----------


def test_search_by_name_sku_prefix_and_exact_barcode(client, manager, new_product):
    new_product()
    new_product(sku="BANH-COSY", barcode="8934680000001", name="Bánh quy Cosy", sale_price=20000)

    def skus(**params):
        return [p["sku"] for p in client.get(PRODUCTS, headers=manager, params=params).json()["items"]]

    assert skus(q="true milk") == ["SUA-TH-1L"]
    assert skus(q="banh") == ["BANH-COSY"]  # SKU bắt đầu bằng "banh" (không phân biệt hoa thường)
    assert skus(q="8934680000001") == ["BANH-COSY"]
    assert skus(q="893468") == []  # mã vạch phải khớp chính xác
    assert skus(q="%") == []  # ký tự đại diện của LIKE được coi là ký tự thường


def test_filter_by_parent_category_includes_children(client, manager, new_product, category):
    new_product()

    by_parent = client.get(PRODUCTS, headers=manager, params={"category_id": category["root"]["id"]}).json()

    assert by_parent["total"] == 1


def test_low_stock_filter_sort_and_pagination(client, manager, new_product):
    new_product(sku="A", barcode=None, sale_price=3000, min_stock=0)
    new_product(sku="B", barcode=None, sale_price=1000, min_stock=5)
    new_product(sku="C", barcode=None, sale_price=2000, min_stock=5)

    low = client.get(PRODUCTS, headers=manager, params={"low_stock": True, "sort": "sku"}).json()
    page2 = client.get(
        PRODUCTS, headers=manager, params={"sort": "-sale_price", "page": 2, "page_size": 2}
    ).json()

    assert [p["sku"] for p in low["items"]] == ["A", "B", "C"]  # tồn 0 <= min_stock (kể cả min_stock 0)
    assert page2["total"] == 3
    assert [p["sku"] for p in page2["items"]] == ["B"]


# ---------- Ảnh sản phẩm ----------


def upload(client, headers, product_id, content, filename="anh.png", content_type="image/png"):
    return client.post(
        f"{PRODUCTS}/{product_id}/image", headers=headers, files={"file": (filename, content, content_type)}
    )


def test_upload_image_saves_file_and_replaces_old_one(client, manager, new_product):
    from app.core.config import get_settings

    product = new_product()
    upload_dir = get_settings().upload_dir

    first = upload(client, manager, product["id"], PNG_BYTES)
    assert first.status_code == 200
    first_url = first.json()["image_url"]
    assert first_url.startswith("/uploads/products/") and first_url.endswith(".png")
    first_file = upload_dir / first_url.removeprefix("/uploads/")
    assert first_file.read_bytes() == PNG_BYTES

    second = upload(client, manager, product["id"], JPEG_BYTES, "anh.jpg", "image/jpeg")
    assert second.json()["image_url"].endswith(".jpg")
    assert not first_file.exists()  # ảnh cũ đã được xóa


def test_upload_rejects_non_image_content_even_with_image_name(client, manager, new_product):
    product = new_product()

    response = upload(client, manager, product["id"], b"<script>alert(1)</script>", "anh.png", "image/png")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "FILE_INVALID"


def test_upload_rejects_too_large_file(client, manager, new_product):
    product = new_product()

    response = upload(client, manager, product["id"], PNG_BYTES + b"\x00" * (2 * 1024 * 1024))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_cashier_cannot_upload_image(client, auth_headers, new_product):
    product = new_product()

    assert upload(client, auth_headers(RoleCode.CASHIER), product["id"], PNG_BYTES).status_code == 403
