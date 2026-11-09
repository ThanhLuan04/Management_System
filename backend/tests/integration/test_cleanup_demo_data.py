"""Dọn dữ liệu demo: chạy thử không xóa gì; chạy thật chỉ để lại quán sạch, sổ kho khớp tồn, bán tiếp được."""

import uuid

import pytest
from sqlalchemy import func, select

from app.core.permissions import RoleCode
from app.models import (
    AuditLog,
    Category,
    Customer,
    Inventory,
    InventoryTransaction,
    Product,
    SalesOrder,
    User,
)
from scripts.cleanup_demo_data import cleanup
from scripts.setup_food_store import setup
from tests.factories import make_category, make_product, set_stock

pytestmark = pytest.mark.usefixtures("open_shift")


def count(db, model, *where) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*where))


def sell(client, headers, product_id, **item):
    return client.post(
        "/api/v1/orders",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"items": [{"product_id": product_id, "quantity": 1, **item}], "payment": {"method": "CARD"}},
    )


def test_cleanup_leaves_a_clean_store_that_still_sells(client, db, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    auth_headers(RoleCode.ADMIN, username="chuquan")
    admin = db.scalar(select(User).where(User.username == "chuquan"))
    # Dữ liệu demo: đồ uống còn bán + hàng tạp hóa sẽ bị ngừng, đều đã có đơn; một khách hàng
    soda = make_product(db, make_category(db, "Đồ uống"), "COCA")
    shampoo = make_product(db, make_category(db, "Hóa mỹ phẩm"), "DAUGOI")
    set_stock(db, soda, 20, "8000")
    set_stock(db, shampoo, 5, "50000")
    assert sell(client, cashier, soda.id).status_code == 201
    assert sell(client, cashier, shampoo.id).status_code == 201
    db.add(Customer(code="KH000001", name="Khách demo"))
    db.commit()
    setup(db, admin)
    egg = db.scalar(select(Product).where(Product.sku == "NL-TRUNG"))
    egg_stock = db.get(Inventory, egg.id).quantity
    shampoo_id, soda_id, egg_id = shampoo.id, soda.id, egg.id
    # Một đơn bán thử món sau khi thiết lập: đã trừ 2 quả trứng — xóa đơn thì tồn phải khớp lại với sổ kho
    banh_mi = db.scalar(select(Product.id).where(Product.sku == "BM-TRUNG"))
    assert sell(client, cashier, banh_mi).status_code == 201

    dry_run = dict(cleanup(db, admin, apply=False))

    assert dry_run["đơn hàng"] == 3 and dry_run["sản phẩm đã ngừng"] == 1
    db.expire_all()
    assert count(db, SalesOrder) == 3  # chạy thử: không xóa gì

    cleanup(db, admin, apply=True)

    db.expire_all()
    assert count(db, SalesOrder) == 0 and count(db, Customer) == 0
    assert db.get(Product, shampoo_id) is None
    assert count(db, Category, Category.name == "Hóa mỹ phẩm") == 0
    assert db.get(Inventory, soda_id).quantity == 0  # tồn demo không có chứng từ → về 0
    assert db.get(Inventory, egg_id).quantity == egg_stock  # nguyên liệu nhập đầu kỳ còn nguyên
    # Sổ kho khớp tồn: mỗi sản phẩm, tổng thay đổi trong sổ = số tồn hiện tại
    for inventory in db.scalars(select(Inventory)):
        ledger = db.scalar(
            select(func.coalesce(func.sum(InventoryTransaction.quantity_change), 0)).where(
                InventoryTransaction.product_id == inventory.product_id
            )
        )
        assert ledger == inventory.quantity
    assert [a.action for a in db.scalars(select(AuditLog))] == ["DEMO_DATA_CLEANUP"]

    # Bán tiếp được, mã đơn đánh lại từ đầu (đơn đầu tiên ở cuối mã là -0001)
    order = sell(client, cashier, banh_mi)
    assert order.status_code == 409  # ca két demo đã bị xóa → phải mở ca mới
    assert order.json()["error"]["code"] == "NO_OPEN_SHIFT"
    assert client.post("/api/v1/shifts/open", headers=cashier, json={"opening_cash": 0}).status_code == 201
    first = sell(client, cashier, banh_mi).json()
    assert first["code"].endswith("-0001") and first["queue_number"] == 1
