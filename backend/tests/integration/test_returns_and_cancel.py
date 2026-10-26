import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy import func, select, text

from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.db.session import SessionLocal
from app.models import Inventory, InventoryTransaction, Payment, User
from app.schemas.sales import ReturnCreate
from app.services import return_service, sales_service
from tests.factories import make_category, make_product, set_stock

ORDERS = "/api/v1/orders"


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


@pytest.fixture
def goods(db):
    category = make_category(db)
    milk = make_product(db, category, "SUA", sale_price="32000")
    cake = make_product(db, category, "BANH", sale_price="10000")
    set_stock(db, milk, 30, "9000")
    set_stock(db, cake, 10, "6000")
    return {"milk": milk, "cake": cake}


def sell(client, headers, items, discount=None, customer_id=None):
    body = {"items": items, "payment": {"method": "CASH", "cash_received": 1000000}}
    if discount:
        body["discount"] = discount
    if customer_id:
        body["customer_id"] = customer_id
    response = client.post(ORDERS, headers={**headers, "Idempotency-Key": str(uuid.uuid4())}, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def give_back(client, headers, order, lines, reason="Khách đổi ý", key=None):
    """lines: [(chỉ số dòng trong đơn, số lượng, tình trạng)]"""
    items = [
        {"order_item_id": order["items"][index]["id"], "quantity": qty, "condition": condition}
        for index, qty, condition in lines
    ]
    return client.post(
        f"{ORDERS}/{order['id']}/returns",
        headers={**headers, "Idempotency-Key": str(key or uuid.uuid4())},
        json={"reason": reason, "items": items},
    )


def stock(db, product) -> tuple[int, Decimal]:
    db.expire_all()
    inventory = db.get(Inventory, product.id)
    return inventory.quantity, inventory.avg_cost


def backdate(db, order_id: int, days: int) -> None:
    db.execute(
        text("UPDATE sales_orders SET created_at = created_at - make_interval(days => :d) WHERE id = :id"),
        {"d": days, "id": order_id},
    )
    db.commit()


# ====================== Trả hàng ======================


def test_partial_return_refunds_discounted_price_and_restocks(client, cashier, goods, db):
    # Ví dụ API doc: 5 sữa + 2 bánh, giảm 10% → dòng sữa 144.000 sau giảm
    order = sell(
        client,
        cashier,
        [{"product_id": goods["milk"].id, "quantity": 5}, {"product_id": goods["cake"].id, "quantity": 2}],
        discount={"type": "PERCENT", "value": 10},
    )

    response = give_back(client, cashier, order, [(0, 2, "RESELLABLE")])

    assert response.status_code == 201
    body = response.json()
    assert body["code"].startswith("TH")
    assert body["total_refund"] == "57600.00"  # 144.000 × 2 / 5
    assert body["refund_method"] == "CASH"
    assert body["order"]["code"] == order["code"]
    assert "unit_cost" not in body["items"][0]  # thu ngân không thấy giá vốn
    assert stock(db, goods["milk"]) == (27, Decimal("9000.0000"))

    detail = client.get(f"{ORDERS}/{order['id']}", headers=cashier).json()
    assert detail["return_status"] == "PARTIAL"
    assert [(i["returned_quantity"], i["returnable_quantity"]) for i in detail["items"]] == [(2, 3), (0, 2)]
    assert [r["code"] for r in detail["returns"]] == [body["code"]]
    refund = [p for p in detail["payments"] if p["type"] == "REFUND"]
    assert [(p["method"], p["amount"]) for p in refund] == [("CASH", "57600.00")]

    tx = db.scalars(select(InventoryTransaction).where(InventoryTransaction.type == "SALE_RETURN")).one()
    assert (tx.quantity_change, tx.unit_cost, tx.reference_id) == (2, Decimal("9000.0000"), body["id"])


def test_several_returns_add_up_exactly_to_line_total(client, auth_headers, goods):
    # 3 bánh = 30.000, giảm 20.000 (Admin, không giới hạn giảm giá) → dòng còn 10.000 (3.333,33/cái)
    manager = auth_headers(RoleCode.ADMIN)
    order = sell(
        client,
        manager,
        [{"product_id": goods["cake"].id, "quantity": 3}],
        discount={"type": "AMOUNT", "value": 20000},
    )

    refunds = [
        give_back(client, manager, order, [(0, 1, "RESELLABLE")]).json()["total_refund"] for _ in range(3)
    ]
    extra = give_back(client, manager, order, [(0, 1, "RESELLABLE")])

    assert refunds == ["3333.00", "3333.00", "3334.00"]
    assert extra.status_code == 409
    assert extra.json()["error"]["code"] == "RETURN_QUANTITY_EXCEEDED"
    assert client.get(f"{ORDERS}/{order['id']}", headers=manager).json()["return_status"] == "FULL"


def test_damaged_items_are_refunded_but_not_restocked(client, cashier, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])

    response = give_back(client, cashier, order, [(0, 1, "DAMAGED")])

    assert response.json()["total_refund"] == "32000.00"
    assert stock(db, goods["milk"])[0] == 28  # không nhập lại kho
    assert db.scalar(select(func.count()).where(InventoryTransaction.type == "SALE_RETURN")) == 0


def test_restock_uses_original_sale_cost_in_weighted_average(client, cashier, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 5}])  # bán ở giá vốn 9.000
    set_stock(db, goods["milk"], 25, "12000")  # sau đó giá vốn bình quân tăng (nhập hàng đắt hơn)

    give_back(client, cashier, order, [(0, 2, "RESELLABLE")])

    # (25 × 12.000 + 2 × 9.000) / 27 = 11.777,7778
    assert stock(db, goods["milk"]) == (27, Decimal("11777.7778"))


def test_return_validation_errors(client, cashier, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])
    other = sell(client, cashier, [{"product_id": goods["cake"].id, "quantity": 1}])

    too_many = give_back(client, cashier, order, [(0, 3, "RESELLABLE")])
    foreign_item = client.post(
        f"{ORDERS}/{order['id']}/returns",
        headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "reason": "Sai",
            "items": [{"order_item_id": other["items"][0]["id"], "quantity": 1, "condition": "DAMAGED"}],
        },
    )
    no_reason = give_back(client, cashier, order, [(0, 1, "DAMAGED")], reason="")
    bad_condition = give_back(client, cashier, order, [(0, 1, "BROKEN")])
    missing_order = client.post(
        f"{ORDERS}/999999/returns",
        headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
        json={"reason": "Abc", "items": [{"order_item_id": 1, "quantity": 1, "condition": "DAMAGED"}]},
    )

    assert too_many.status_code == 409
    assert too_many.json()["error"]["details"][0] == {
        "order_item_id": order["items"][0]["id"],
        "sku": "SUA",
        "requested": 3,
        "returnable": 2,
    }
    assert foreign_item.json()["error"]["details"][0]["field"] == "items.0.order_item_id"
    assert no_reason.status_code == 422
    assert bad_condition.status_code == 422
    assert missing_order.status_code == 404
    assert stock(db, goods["milk"])[0] == 28  # không lỗi nào làm đổi tồn kho


def test_return_window(client, cashier, goods, db):
    within = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}])
    expired = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}])
    backdate(db, within["id"], 7)
    backdate(db, expired["id"], 8)

    assert give_back(client, cashier, within, [(0, 1, "RESELLABLE")]).status_code == 201
    response = give_back(client, cashier, expired, [(0, 1, "RESELLABLE")])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RETURN_PERIOD_EXPIRED"


def test_return_idempotency(client, cashier, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 3}])
    key = uuid.uuid4()

    first = give_back(client, cashier, order, [(0, 1, "RESELLABLE")], key=key)
    again = give_back(client, cashier, order, [(0, 1, "RESELLABLE")], key=key)
    different = give_back(client, cashier, order, [(0, 2, "RESELLABLE")], key=key)

    assert (first.status_code, again.status_code, different.status_code) == (201, 200, 409)
    assert first.json()["id"] == again.json()["id"]
    assert stock(db, goods["milk"])[0] == 28  # 30 - 3 + 1, chỉ nhập lại một lần


def test_concurrent_returns_cannot_exceed_sold_quantity(cashier, client, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 5}])
    item_id = order["items"][0]["id"]
    with SessionLocal() as s:
        actor_id = s.scalar(select(User.id).where(User.username == "thungan"))
    barrier = Barrier(5)

    def return_two(_):
        with SessionLocal() as session:
            body = ReturnCreate(
                reason="Trả hàng",
                items=[{"order_item_id": item_id, "quantity": 2, "condition": "RESELLABLE"}],
            )
            barrier.wait()
            try:
                return_service.create_return(
                    session, order["id"], body, uuid.uuid4(), session.get(User, actor_id), None
                )
                return "ok"
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(return_two, range(5)))

    assert sorted(results) == ["RETURN_QUANTITY_EXCEEDED"] * 3 + ["ok", "ok"]  # 2 + 2 ≤ 5, lần thứ 3 vượt
    assert stock(db, goods["milk"])[0] == 25 + 4


def test_gross_profit_accounts_for_returns(client, manager, goods):
    order = sell(
        client, manager, [{"product_id": goods["milk"].id, "quantity": 5}]
    )  # 160.000, giá vốn 45.000
    assert client.get(f"{ORDERS}/{order['id']}", headers=manager).json()["gross_profit"] == "115000.00"

    give_back(client, manager, order, [(0, 2, "RESELLABLE")])  # hoàn 64.000, giá vốn nhập lại 18.000
    assert client.get(f"{ORDERS}/{order['id']}", headers=manager).json()["gross_profit"] == "69000.00"

    give_back(client, manager, order, [(0, 1, "DAMAGED")])  # hoàn 32.000, hàng hỏng: giá vốn là tổn thất
    assert client.get(f"{ORDERS}/{order['id']}", headers=manager).json()["gross_profit"] == "37000.00"


def test_customer_total_spent_is_net_of_refunds(client, cashier, goods):
    customer = client.post("/api/v1/customers", headers=cashier, json={"name": "Khách A"}).json()
    order = sell(
        client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}], customer_id=customer["id"]
    )
    give_back(client, cashier, order, [(0, 1, "RESELLABLE")])

    detail = client.get(f"/api/v1/customers/{customer['id']}", headers=cashier).json()

    assert (detail["order_count"], detail["total_spent"]) == (1, "32000.00")


def test_list_and_get_returns(client, cashier, manager, goods):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])
    created = give_back(client, cashier, order, [(0, 1, "RESELLABLE")]).json()

    listing = client.get("/api/v1/returns", headers=cashier, params={"q": order["code"]}).json()
    detail = client.get(f"/api/v1/returns/{created['id']}", headers=manager).json()

    assert [r["code"] for r in listing["items"]] == [created["code"]]
    assert detail["items"][0]["unit_cost"] == "9000.0000"  # quản lý thấy giá vốn
    assert client.get("/api/v1/returns/999999", headers=manager).status_code == 404


# ====================== Hủy đơn ======================


def test_manager_cancels_order_same_day(client, cashier, manager, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 5}])

    response = client.post(
        f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Khách đổi ý tại quầy"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "CANCELLED"
    assert body["cancel_reason"] == "Khách đổi ý tại quầy"
    assert body["cancelled_by"]["full_name"] == "Quanly"
    assert body["gross_profit"] == "0.00"
    assert body["items"][0]["returnable_quantity"] == 0
    assert [(p["type"], p["amount"]) for p in body["payments"]] == [
        ("PAYMENT", "160000.00"),
        ("REFUND", "160000.00"),
    ]
    assert stock(db, goods["milk"]) == (30, Decimal("9000.0000"))
    tx = db.scalars(select(InventoryTransaction).where(InventoryTransaction.type == "ORDER_CANCEL")).one()
    assert (tx.quantity_change, tx.unit_cost) == (5, Decimal("9000.0000"))


def test_cancel_rules(client, cashier, manager, goods):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])

    by_cashier = client.post(f"{ORDERS}/{order['id']}/cancel", headers=cashier, json={"reason": "Thử hủy"})
    no_reason = client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": ""})
    first = client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Hủy lần 1"})
    second = client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Hủy lần 2"})
    return_after_cancel = give_back(client, cashier, order, [(0, 1, "RESELLABLE")])

    assert by_cashier.status_code == 403
    assert no_reason.status_code == 422
    assert first.status_code == 200
    assert second.status_code == 409 and second.json()["error"]["code"] == "INVALID_STATE"
    assert (
        return_after_cancel.status_code == 409
        and return_after_cancel.json()["error"]["code"] == "INVALID_STATE"
    )


def test_cannot_cancel_order_with_returns_or_from_previous_day(client, cashier, manager, goods, db):
    with_return = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])
    give_back(client, cashier, with_return, [(0, 1, "RESELLABLE")])
    yesterday = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}])
    backdate(db, yesterday["id"], 1)

    a = client.post(f"{ORDERS}/{with_return['id']}/cancel", headers=manager, json={"reason": "Thử hủy"})
    b = client.post(f"{ORDERS}/{yesterday['id']}/cancel", headers=manager, json={"reason": "Thử hủy"})

    assert (a.status_code, a.json()["error"]["details"]) == (409, {"reason": "HAS_RETURNS"})
    assert (b.status_code, b.json()["error"]["details"]) == (409, {"reason": "NOT_SAME_DAY"})


def test_concurrent_cancels_restock_once(client, cashier, manager, goods, db):
    order = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 5}])
    with SessionLocal() as s:
        actor_id = s.scalar(select(User.id).where(User.username == "quanly"))
    barrier = Barrier(5)

    def cancel(_):
        with SessionLocal() as session:
            barrier.wait()
            try:
                sales_service.cancel_order(session, order["id"], "Hủy", session.get(User, actor_id), None)
                return "ok"
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(cancel, range(5)))

    assert sorted(results) == ["INVALID_STATE"] * 4 + ["ok"]
    assert stock(db, goods["milk"])[0] == 30  # chỉ hoàn kho một lần
    assert db.scalar(select(func.count()).select_from(Payment).where(Payment.type == "REFUND")) == 1


def test_cancelled_orders_do_not_count_for_customer(client, cashier, manager, goods):
    customer = client.post("/api/v1/customers", headers=cashier, json={"name": "Khách B"}).json()
    order = sell(
        client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}], customer_id=customer["id"]
    )
    client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Hủy đơn"})

    detail = client.get(f"/api/v1/customers/{customer['id']}", headers=cashier).json()

    assert (detail["order_count"], detail["total_spent"]) == (0, "0")


def test_ledger_matches_stock_after_sales_returns_and_cancels(client, cashier, manager, goods, db):
    a = sell(
        client,
        cashier,
        [{"product_id": goods["milk"].id, "quantity": 4}, {"product_id": goods["cake"].id, "quantity": 3}],
    )
    b = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}])
    give_back(client, cashier, a, [(0, 1, "RESELLABLE"), (1, 2, "DAMAGED")])
    client.post(f"{ORDERS}/{b['id']}/cancel", headers=manager, json={"reason": "Hủy đơn"})

    db.expire_all()
    for product, start in ((goods["milk"], 30), (goods["cake"], 10)):
        moved = db.scalar(
            select(func.coalesce(func.sum(InventoryTransaction.quantity_change), 0)).where(
                InventoryTransaction.product_id == product.id
            )
        )
        assert stock(db, product)[0] == start + moved
    assert stock(db, goods["milk"])[0] == 30 - 4 + 1  # đơn b đã hủy → hoàn đủ
    assert stock(db, goods["cake"])[0] == 10 - 3  # bánh trả về bị hỏng → không nhập lại
