"""Script thiết lập quán bánh mì / xôi: tạo đủ thực đơn bán được ngay, chạy lại không tạo trùng."""

import uuid

import pytest
from sqlalchemy import func, select

from app.core.permissions import RoleCode
from app.models import Category, Inventory, ModifierGroup, Product, PurchaseOrder, User
from scripts.setup_food_store import DISHES, INGREDIENTS, OPENING_NOTE, setup
from tests.factories import make_category, make_product

pytestmark = pytest.mark.usefixtures("open_shift")


def test_sets_up_a_sellable_menu_once_and_retires_old_groceries(client, db, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    admin = auth_headers(RoleCode.ADMIN, username="chuquan") and db.scalar(
        select(User).where(User.username == "chuquan")
    )
    drinks = make_category(db, "Đồ uống")
    soda = make_product(db, drinks, "COCA")
    cosmetics = make_category(db, "Hóa mỹ phẩm")
    shampoo = make_product(db, cosmetics, "DAUGOI")

    first = setup(db, admin)
    second = setup(db, admin)

    assert second == []  # chạy lại: không đổi gì
    assert any(line.startswith("+ phiếu nhập đầu kỳ") for line in first)
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Product).where(Product.kind == "DISH")) == len(DISHES)
    assert db.scalar(select(func.count()).select_from(Product).where(Product.kind == "INGREDIENT")) == len(
        INGREDIENTS
    )
    assert db.scalar(select(func.count()).select_from(ModifierGroup)) == 4
    assert (
        db.scalar(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.note == OPENING_NOTE))
        == 1
    )
    assert db.get(Product, soda.id).is_active and not db.get(Product, shampoo.id).is_active
    assert db.get(Category, cosmetics.id).is_active is False

    # Bán thử ngay: bánh mì thịt + thêm trứng → trừ bánh mì, chả, trứng
    banh_mi = db.scalar(select(Product).where(Product.sku == "BM-THIT"))
    egg_option = next(o.id for g in banh_mi.modifier_links for o in g.group.options if o.name == "Thêm trứng")
    egg_id = db.scalar(select(Product.id).where(Product.sku == "NL-TRUNG"))
    response = client.post(
        "/api/v1/orders",
        headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": banh_mi.id, "quantity": 2, "option_ids": [egg_option]}],
            "payment": {"method": "CASH", "cash_received": 100_000},
        },
    )

    assert response.status_code == 201
    assert response.json()["total_amount"] == "60000.00"  # 2 × (25.000 + 5.000)
    db.expire_all()
    assert db.get(Inventory, egg_id).quantity == 4 * 30 - 2  # nhập 4 vỉ × 30 quả
    settings = client.get("/api/v1/settings", headers=cashier).json()
    assert settings["store_name"] == "A Mập"
