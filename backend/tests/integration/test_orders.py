import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy import func, select

from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.db.session import SessionLocal
from app.models import Customer, Inventory, InventoryTransaction, SalesOrder, User
from app.schemas.sales import OrderCreate
from app.services import sales_service
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
    """Sữa 32.000đ (giá vốn 9.000, tồn 30) và Bánh 10.000đ (giá vốn 6.000, tồn 10)."""
    category = make_category(db)
    milk = make_product(db, category, "SUA", sale_price="32000")
    cake = make_product(db, category, "BANH", sale_price="10000")
    set_stock(db, milk, 30, "9000")
    set_stock(db, cake, 10, "6000")
    return {"milk": milk, "cake": cake}


def sell(client, headers, items, *, discount=None, payment=None, key=None, customer_id=None):
    body = {"items": items, "payment": payment or {"method": "CASH", "cash_received": 500000}}
    if discount:
        body["discount"] = discount
    if customer_id:
        body["customer_id"] = customer_id
    return client.post(ORDERS, headers={**headers, "Idempotency-Key": str(key or uuid.uuid4())}, json=body)


def stock(db, product) -> int:
    db.expire_all()
    return db.get(Inventory, product.id).quantity


def order_count(db) -> int:
    return db.scalar(select(func.count()).select_from(SalesOrder))


# ---------- Bán hàng cơ bản ----------


def test_cash_sale_computes_everything_on_server(client, cashier, goods, db):
    response = sell(
        client,
        cashier,
        [{"product_id": goods["milk"].id, "quantity": 5}, {"product_id": goods["cake"].id, "quantity": 2}],
        discount={"type": "PERCENT", "value": 10},
        payment={"method": "CASH", "cash_received": 200000},
    )

    assert response.status_code == 201
    order = response.json()
    assert order["code"].startswith("HD") and order["status"] == "COMPLETED"
    assert (order["subtotal"], order["discount_amount"], order["total_amount"]) == (
        "180000.00",
        "18000.00",
        "162000.00",
    )
    assert [(i["line_subtotal"], i["discount_allocated"], i["line_total"]) for i in order["items"]] == [
        ("160000.00", "16000.00", "144000.00"),
        ("20000.00", "2000.00", "18000.00"),
    ]
    payment = order["payments"][0]
    assert (payment["type"], payment["method"], payment["amount"]) == ("PAYMENT", "CASH", "162000.00")
    assert (payment["cash_received"], payment["change_amount"]) == ("200000.00", "38000.00")
    assert order["payment_method"] == "CASH"
    # Thu ngân không thấy giá vốn / lợi nhuận
    assert "gross_profit" not in order and "unit_cost" not in order["items"][0]

    assert stock(db, goods["milk"]) == 25
    assert stock(db, goods["cake"]) == 8
    tx = db.scalars(
        select(InventoryTransaction).where(InventoryTransaction.product_id == goods["milk"].id)
    ).one()
    assert (tx.type, tx.quantity_change, tx.quantity_after, tx.reference_id) == ("SALE", -5, 25, order["id"])


def test_manager_sees_cost_snapshot_and_gross_profit(client, manager, goods):
    order = sell(client, manager, [{"product_id": goods["milk"].id, "quantity": 5}]).json()

    detail = client.get(f"{ORDERS}/{order['id']}", headers=manager).json()

    assert detail["items"][0]["unit_cost"] == "9000.0000"
    assert detail["gross_profit"] == "115000.00"  # 160.000 - 5 × 9.000


def test_order_keeps_price_and_cost_at_time_of_sale(client, manager, goods, db):
    order = sell(client, manager, [{"product_id": goods["milk"].id, "quantity": 1}]).json()
    goods["milk"].sale_price = Decimal("99000")
    goods["milk"].name = "Tên mới"
    db.get(Inventory, goods["milk"].id).avg_cost = Decimal("50000")
    db.commit()

    detail = client.get(f"{ORDERS}/{order['id']}", headers=manager).json()

    item = detail["items"][0]
    assert (item["unit_price"], item["unit_cost"], item["product_name"]) == (
        "32000.00",
        "9000.0000",
        "Sản phẩm SUA",
    )


@pytest.mark.parametrize(
    "extra, field",
    [
        ({"total_amount": 1}, "total_amount"),
        ({"items": [{"product_id": 1, "quantity": 1, "unit_price": 1}]}, "items.0.unit_price"),
        ({"items": [{"product_id": 1, "quantity": 0}]}, "items.0.quantity"),
        ({"items": [{"product_id": 1, "quantity": 1}, {"product_id": 1, "quantity": 2}]}, "items"),
    ],
)
def test_client_cannot_send_prices_or_bad_items(client, cashier, extra, field):
    body = {"items": [{"product_id": 1, "quantity": 1}], "payment": {"method": "CARD"}, **extra}

    response = client.post(ORDERS, headers={**cashier, "Idempotency-Key": str(uuid.uuid4())}, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


# ---------- Giảm giá theo quyền ----------


def test_cashier_discount_limit(client, cashier, goods):
    item = [{"product_id": goods["milk"].id, "quantity": 5}]  # 160.000

    assert sell(client, cashier, item, discount={"type": "PERCENT", "value": 10}).status_code == 201
    over_percent = sell(client, cashier, item, discount={"type": "PERCENT", "value": "10.5"})
    over_amount = sell(client, cashier, item, discount={"type": "AMOUNT", "value": 16001})  # > 10%

    for response in (over_percent, over_amount):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "DISCOUNT_EXCEEDS_LIMIT"
        assert response.json()["error"]["details"] == {"max_percent": "10"}


def test_manager_limit_and_admin_unlimited(client, manager, auth_headers, goods):
    admin = auth_headers(RoleCode.ADMIN)
    item = [{"product_id": goods["cake"].id, "quantity": 1}]

    assert sell(client, manager, item, discount={"type": "PERCENT", "value": 30}).status_code == 201
    assert sell(client, manager, item, discount={"type": "PERCENT", "value": 31}).status_code == 403

    free = sell(client, admin, item, discount={"type": "PERCENT", "value": 100}, payment={"method": "CARD"})
    assert free.status_code == 201
    assert free.json()["total_amount"] == "0.00"
    assert free.json()["payments"] == []  # đơn 0đ không phát sinh dòng tiền


def test_discount_limit_comes_from_settings(client, cashier, goods, db):
    from app.models import Setting

    db.get(Setting, "max_discount_percent_cashier").value = 5
    db.commit()

    response = sell(
        client,
        cashier,
        [{"product_id": goods["cake"].id, "quantity": 1}],
        discount={"type": "PERCENT", "value": 6},
    )

    assert response.status_code == 403
    db.get(Setting, "max_discount_percent_cashier").value = 10
    db.commit()


# ---------- Thanh toán ----------


@pytest.mark.parametrize(
    "payment, status, code",
    [
        ({"method": "CASH", "cash_received": 9999}, 422, "INSUFFICIENT_PAYMENT"),
        ({"method": "CASH"}, 422, "VALIDATION_ERROR"),
        ({"method": "BANK_TRANSFER", "cash_received": 10000}, 422, "VALIDATION_ERROR"),
        ({"method": "MOMO"}, 422, "VALIDATION_ERROR"),
    ],
)
def test_payment_validation(client, cashier, goods, db, payment, status, code):
    response = sell(client, cashier, [{"product_id": goods["cake"].id, "quantity": 1}], payment=payment)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert order_count(db) == 0
    assert stock(db, goods["cake"]) == 10


def test_bank_transfer_records_reference(client, cashier, goods):
    order = sell(
        client,
        cashier,
        [{"product_id": goods["cake"].id, "quantity": 1}],
        payment={"method": "BANK_TRANSFER", "reference_note": "FT26299123"},
    ).json()

    assert order["payments"][0]["method"] == "BANK_TRANSFER"
    assert order["payments"][0]["reference_note"] == "FT26299123"
    assert order["payments"][0]["cash_received"] is None


# ---------- Tồn kho & sản phẩm ----------


def test_out_of_stock_rejects_whole_order(client, cashier, goods, db):
    response = sell(
        client,
        cashier,
        [{"product_id": goods["milk"].id, "quantity": 1}, {"product_id": goods["cake"].id, "quantity": 11}],
    )

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "OUT_OF_STOCK"
    assert error["details"] == [
        {"product_id": goods["cake"].id, "sku": "BANH", "requested": 11, "available": 10}
    ]
    assert stock(db, goods["milk"]) == 30  # dòng hợp lệ cũng không bị trừ
    assert order_count(db) == 0


def test_inactive_product_and_customer(client, cashier, goods, db):
    customer = Customer(code="KH000001", name="Khách cũ", is_active=False)
    db.add(customer)
    goods["cake"].is_active = False
    db.commit()

    inactive_product = sell(client, cashier, [{"product_id": goods["cake"].id, "quantity": 1}])
    inactive_customer = sell(
        client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}], customer_id=customer.id
    )

    assert inactive_product.status_code == 409
    assert inactive_product.json()["error"]["code"] == "PRODUCT_INACTIVE"
    assert inactive_customer.json()["error"]["details"][0]["field"] == "customer_id"


# ---------- Idempotency ----------


def test_same_key_same_body_returns_same_order(client, cashier, goods, db):
    key = uuid.uuid4()
    items = [{"product_id": goods["milk"].id, "quantity": 2}]

    first = sell(client, cashier, items, key=key)
    second = sell(client, cashier, items, key=key)

    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert order_count(db) == 1
    assert stock(db, goods["milk"]) == 28  # chỉ trừ kho một lần


def test_same_key_different_body_or_user_conflicts(client, cashier, manager, goods):
    key = uuid.uuid4()
    sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 2}], key=key)

    different_body = sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 3}], key=key)
    different_user = sell(client, manager, [{"product_id": goods["milk"].id, "quantity": 2}], key=key)

    for response in (different_body, different_user):
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_idempotency_key_is_required(client, cashier, goods):
    body = {"items": [{"product_id": goods["milk"].id, "quantity": 1}], "payment": {"method": "CARD"}}

    missing = client.post(ORDERS, headers=cashier, json=body)
    invalid = client.post(ORDERS, headers={**cashier, "Idempotency-Key": "abc"}, json=body)

    assert missing.status_code == 400
    assert missing.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert invalid.status_code == 422


# ---------- Đồng thời ----------


def _run_concurrently(username: str, bodies: list[tuple[OrderCreate, uuid.UUID]]):
    """Mỗi luồng một kết nối DB riêng, cùng xuất phát một lúc (Barrier) để tạo tranh chấp thật."""
    with SessionLocal() as s:
        actor_id = s.scalar(select(User.id).where(User.username == username))
    barrier = Barrier(len(bodies))

    def worker(args):
        body, key = args
        with SessionLocal() as session:
            actor = session.get(User, actor_id)
            barrier.wait()
            try:
                order, _ = sales_service.create_order(session, body, key, actor, None)
                return order.id
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=len(bodies)) as pool:
        return list(pool.map(worker, bodies))


def card_order(*items) -> OrderCreate:
    return OrderCreate(
        items=[{"product_id": pid, "quantity": qty} for pid, qty in items], payment={"method": "CARD"}
    )


def test_five_cashiers_race_for_the_last_unit(cashier, goods, db):
    set_stock(db, goods["milk"], 1, "9000")

    results = _run_concurrently(
        "thungan", [(card_order((goods["milk"].id, 1)), uuid.uuid4()) for _ in range(5)]
    )

    winners = [r for r in results if isinstance(r, int)]
    assert len(winners) == 1
    assert sorted(r for r in results if isinstance(r, str)) == ["OUT_OF_STOCK"] * 4
    assert stock(db, goods["milk"]) == 0  # không bao giờ âm
    assert order_count(db) == 1


def test_duplicate_submits_in_parallel_create_one_order(cashier, goods, db):
    """Bấm "Thanh toán" liên tục: 5 request cùng key đến cùng lúc → đúng 1 đơn, ai cũng nhận về đơn đó."""
    set_stock(db, goods["milk"], 1, "9000")  # kể cả khi đơn đó mua món hàng cuối cùng
    key = uuid.uuid4()
    body = card_order((goods["milk"].id, 1))

    results = _run_concurrently("thungan", [(body, key)] * 5)

    assert len(set(results)) == 1 and isinstance(results[0], int)
    assert order_count(db) == 1
    assert stock(db, goods["milk"]) == 0


def test_opposite_product_order_does_not_deadlock(cashier, goods, db):
    """Đơn A→B và B→A chạy song song: khóa theo product_id tăng dần nên không bao giờ deadlock."""
    milk, cake = goods["milk"].id, goods["cake"].id
    bodies = [
        (card_order((milk, 1), (cake, 1)) if i % 2 == 0 else card_order((cake, 1), (milk, 1)), uuid.uuid4())
        for i in range(10)
    ]

    results = _run_concurrently("thungan", bodies)

    assert all(isinstance(r, int) for r in results), results
    assert stock(db, goods["milk"]) == 20
    assert stock(db, goods["cake"]) == 0


def test_purchase_confirm_and_sales_on_same_product_in_parallel(cashier, auth_headers, client, goods, db):
    """Nhập hàng và bán hàng cùng lúc trên một sản phẩm: không thao tác nào được ghi đè lên thao tác khác."""
    from app.models import PurchaseOrder, PurchaseOrderItem
    from app.services import purchase_service
    from tests.factories import make_supplier

    auth_headers(RoleCode.MANAGER, username="kho")
    supplier = make_supplier(db)
    purchase = PurchaseOrder(
        code="PN-TEST",
        supplier_id=supplier.id,
        status="DRAFT",
        total_amount=Decimal("200000"),
        created_by=db.scalar(select(User.id).where(User.username == "kho")),
        items=[
            PurchaseOrderItem(
                product_id=goods["cake"].id,
                quantity=20,
                unit_cost=Decimal("10000"),
                discount_amount=Decimal("0"),
                line_total=Decimal("200000"),
            )
        ],
    )
    db.add(purchase)
    db.commit()
    with SessionLocal() as s:
        cashier_id = s.scalar(select(User.id).where(User.username == "thungan"))
        keeper_id = s.scalar(select(User.id).where(User.username == "kho"))
    barrier = Barrier(6)

    def sell_one(_):
        with SessionLocal() as session:
            barrier.wait()
            sales_service.create_order(
                session, card_order((goods["cake"].id, 1)), uuid.uuid4(), session.get(User, cashier_id), None
            )

    def confirm(_):
        with SessionLocal() as session:
            barrier.wait()
            purchase_service.confirm_purchase(session, purchase.id, session.get(User, keeper_id), None)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(sell_one, i) for i in range(5)] + [pool.submit(confirm, 0)]
        for future in futures:
            future.result()

    assert stock(db, goods["cake"]) == 10 - 5 + 20


# ---------- Tra cứu ----------


def test_list_filters_and_customer_history(client, cashier, manager, goods, db):
    customer = client.post(
        "/api/v1/customers", headers=cashier, json={"name": "Trần Thị B", "phone": "0901234567"}
    ).json()
    sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 1}], customer_id=customer["id"])
    sell(
        client,
        cashier,
        [{"product_id": goods["cake"].id, "quantity": 2}],
        customer_id=customer["id"],
        payment={"method": "CARD"},
    )
    sell(client, manager, [{"product_id": goods["cake"].id, "quantity": 1}])

    def codes(**params):
        return client.get(ORDERS, headers=cashier, params=params).json()["total"]

    cashier_id = db.scalar(select(User.id).where(User.username == "thungan"))
    assert codes() == 3
    assert codes(q="0901 234") == 2  # tìm theo SĐT khách
    assert codes(payment_method="card") == 1
    assert codes(created_by=cashier_id) == 2

    detail = client.get(f"/api/v1/customers/{customer['id']}", headers=cashier).json()
    assert (detail["order_count"], detail["total_spent"]) == (2, "52000.00")
    history = client.get(f"/api/v1/customers/{customer['id']}/orders", headers=cashier).json()
    assert history["total"] == 2
    assert history["items"][0]["customer"]["name"] == "Trần Thị B"


def test_ledger_matches_stock_after_sales(client, cashier, goods, db):
    sell(client, cashier, [{"product_id": goods["milk"].id, "quantity": 3}])
    sell(
        client,
        cashier,
        [{"product_id": goods["milk"].id, "quantity": 4}, {"product_id": goods["cake"].id, "quantity": 1}],
    )

    sold = db.scalar(
        select(func.sum(InventoryTransaction.quantity_change)).where(
            InventoryTransaction.product_id == goods["milk"].id
        )
    )
    assert sold == -7
    assert stock(db, goods["milk"]) == 30 - 7
