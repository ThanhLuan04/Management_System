from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.permissions import RoleCode
from app.models import Inventory, InventoryTransaction
from tests.factories import make_category, make_product, make_supplier

ADJUST = "/api/v1/inventory/adjustments"


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER)


@pytest.fixture
def stocked(client, manager, db):
    """Hai sản phẩm đã nhập kho: A 10 cái giá 8.000, B 5 cái giá 20.000."""
    category = make_category(db)
    supplier = make_supplier(db)
    a = make_product(db, category, "A", min_stock=12)
    b = make_product(db, category, "B")
    order = client.post(
        "/api/v1/purchases",
        headers=manager,
        json={
            "supplier_id": supplier.id,
            "items": [
                {"product_id": a.id, "quantity": 10, "unit_cost": "8000"},
                {"product_id": b.id, "quantity": 5, "unit_cost": "20000"},
            ],
        },
    ).json()
    assert client.post(f"/api/v1/purchases/{order['id']}/confirm", headers=manager).status_code == 200
    return {"a": a, "b": b, "purchase": order}


def quantity(db, product) -> int:
    db.expire_all()
    return db.get(Inventory, product.id).quantity


# ---------- Điều chỉnh ----------


def test_adjustment_increases_and_decreases_stock(client, manager, stocked, db):
    response = client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "ADJUSTMENT",
            "reason": "Vỡ 3 cái khi xếp kệ, phát hiện thừa 1",
            "items": [
                {"product_id": stocked["a"].id, "quantity_change": -3},
                {"product_id": stocked["b"].id, "quantity_change": 1},
            ],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["code"].startswith("DC")
    assert [(i["quantity_before"], i["quantity_change"]) for i in body["items"]] == [(10, -3), (5, 1)]
    assert quantity(db, stocked["a"]) == 7
    assert quantity(db, stocked["b"]) == 6
    # Hàng thừa ghi theo giá vốn bình quân hiện tại → giá vốn không đổi
    assert db.get(Inventory, stocked["b"].id).avg_cost == Decimal("20000.0000")


def test_adjustment_cannot_make_stock_negative_and_rolls_back(client, manager, stocked, db):
    tx_before = db.scalar(select(func.count()).select_from(InventoryTransaction))

    response = client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "ADJUSTMENT",
            "reason": "Thử giảm quá tồn",
            "items": [
                {"product_id": stocked["a"].id, "quantity_change": -1},
                {"product_id": stocked["b"].id, "quantity_change": -6},
            ],
        },
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NEGATIVE_STOCK"
    assert response.json()["error"]["details"] == {
        "product_id": stocked["b"].id,
        "requested": 6,
        "available": 5,
    }
    assert quantity(db, stocked["a"]) == 10  # dòng A hợp lệ cũng không được áp dụng
    assert db.scalar(select(func.count()).select_from(InventoryTransaction)) == tx_before


@pytest.mark.parametrize(
    "payload",
    [
        {
            "type": "ADJUSTMENT",
            "reason": "x",
            "items": [{"product_id": 1, "quantity_change": 1}],
        },  # lý do quá ngắn
        {"type": "ADJUSTMENT", "reason": "Lý do", "items": [{"product_id": 1, "quantity_change": 0}]},
        {"type": "ADJUSTMENT", "reason": "Lý do", "items": [{"product_id": 1, "counted_quantity": 5}]},
        {"type": "STOCKTAKE", "reason": "Lý do", "items": [{"product_id": 1, "quantity_change": 5}]},
        {"type": "KHAC", "reason": "Lý do", "items": [{"product_id": 1, "quantity_change": 5}]},
    ],
)
def test_adjustment_validation(client, manager, payload):
    assert client.post(ADJUST, headers=manager, json=payload).status_code == 422


# ---------- Kiểm kê ----------


def test_stocktake_records_only_differences(client, manager, stocked, db):
    response = client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "STOCKTAKE",
            "reason": "Kiểm kê cuối tháng",
            "items": [
                {"product_id": stocked["a"].id, "counted_quantity": 8},
                {"product_id": stocked["b"].id, "counted_quantity": 5},  # khớp sổ → bỏ qua
            ],
        },
    )

    assert response.status_code == 201
    items = response.json()["items"]
    assert [(i["product_id"], i["counted_quantity"], i["quantity_change"]) for i in items] == [
        (stocked["a"].id, 8, -2)
    ]
    assert quantity(db, stocked["a"]) == 8


def test_stocktake_with_no_difference_is_rejected(client, manager, stocked):
    response = client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "STOCKTAKE",
            "reason": "Kiểm kê",
            "items": [{"product_id": stocked["a"].id, "counted_quantity": 10}],
        },
    )

    assert response.status_code == 422


# ---------- Tra cứu ----------


def test_inventory_list_with_cost_for_manager_and_without_for_cashier(client, manager, auth_headers, stocked):
    cashier = auth_headers(RoleCode.CASHIER)

    as_manager = client.get("/api/v1/inventory", headers=manager, params={"sort": "sku"}).json()["items"]
    as_cashier = client.get("/api/v1/inventory", headers=cashier, params={"sort": "sku"}).json()["items"]

    assert as_manager[0] == {
        "product_id": stocked["a"].id,
        "sku": "A",
        "name": "Sản phẩm A",
        "unit": "cái",
        "category_name": "Đồ uống",
        "is_active": True,
        "quantity": 10,
        "min_stock": 12,
        "is_low_stock": True,
        "avg_cost": "8000.0000",
        "stock_value": "80000.00",
    }
    assert "avg_cost" not in as_cashier[0] and "stock_value" not in as_cashier[0]
    assert as_cashier[0]["quantity"] == 10


def test_inventory_filters(client, manager, stocked, db):
    category = make_category(db, "Khác")
    make_product(db, category, "C")  # chưa nhập → hết hàng

    def skus(**params):
        return [
            i["sku"] for i in client.get("/api/v1/inventory", headers=manager, params=params).json()["items"]
        ]

    assert skus(low_stock=True) == ["A", "C"]
    assert skus(out_of_stock=True) == ["C"]
    assert skus(sort="-stock_value") == ["B", "A", "C"]  # 100.000 > 80.000 > 0


def test_transaction_history_with_reference_codes(client, manager, stocked):
    client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "ADJUSTMENT",
            "reason": "Hư hỏng",
            "items": [{"product_id": stocked["a"].id, "quantity_change": -1}],
        },
    )

    history = client.get(
        "/api/v1/inventory/transactions", headers=manager, params={"product_id": stocked["a"].id}
    ).json()

    assert [(t["type"], t["quantity_change"], t["quantity_after"]) for t in history["items"]] == [
        ("ADJUSTMENT", -1, 9),
        ("PURCHASE", 10, 10),
    ]
    assert history["items"][1]["reference_code"] == stocked["purchase"]["code"]
    assert history["items"][0]["reference_code"].startswith("DC")
    assert history["items"][0]["created_by"]["full_name"] == "Manager"

    only_purchases = client.get(
        "/api/v1/inventory/transactions", headers=manager, params={"type": "purchase"}
    ).json()
    assert only_purchases["total"] == 2
    assert (
        client.get("/api/v1/inventory/transactions", headers=manager, params={"type": "X"}).status_code == 422
    )


def test_cashier_cannot_see_ledger_or_adjust(client, auth_headers, stocked):
    cashier = auth_headers(RoleCode.CASHIER)

    assert client.get("/api/v1/inventory/transactions", headers=cashier).status_code == 403
    assert client.post(ADJUST, headers=cashier, json={}).status_code == 403


def test_product_stock_endpoint(client, manager, auth_headers, stocked):
    as_manager = client.get(f"/api/v1/products/{stocked['a'].id}/inventory", headers=manager).json()
    as_cashier = client.get(
        f"/api/v1/products/{stocked['a'].id}/inventory", headers=auth_headers(RoleCode.CASHIER)
    ).json()

    assert as_manager["quantity"] == 10
    assert as_manager["avg_cost"] == "8000.0000"
    assert as_manager["recent_transactions"][0]["unit_cost"] == "8000.0000"
    assert "avg_cost" not in as_cashier
    assert "unit_cost" not in as_cashier["recent_transactions"][0]


def test_stock_always_equals_sum_of_ledger(client, manager, stocked, db):
    """Đối soát: tồn hiện tại của mọi sản phẩm = tổng các biến động trong sổ cái kho."""
    client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "STOCKTAKE",
            "reason": "Kiểm kê",
            "items": [{"product_id": stocked["a"].id, "counted_quantity": 4}],
        },
    )
    client.post(
        ADJUST,
        headers=manager,
        json={
            "type": "ADJUSTMENT",
            "reason": "Thừa",
            "items": [{"product_id": stocked["b"].id, "quantity_change": 7}],
        },
    )

    ledger = dict(
        db.execute(
            select(InventoryTransaction.product_id, func.sum(InventoryTransaction.quantity_change)).group_by(
                InventoryTransaction.product_id
            )
        ).all()
    )
    db.expire_all()
    for inventory in db.scalars(select(Inventory)):
        assert inventory.quantity == ledger.get(inventory.product_id, 0)
