from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy import func, select

from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.db.session import SessionLocal
from app.models import Inventory, InventoryTransaction, PurchaseOrder, User
from app.services import purchase_service
from tests.factories import make_category, make_product, make_supplier

PURCHASES = "/api/v1/purchases"


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER)


@pytest.fixture
def setup(db):
    category = make_category(db)
    return {
        "supplier": make_supplier(db),
        "milk": make_product(db, category, "SUA"),
        "water": make_product(db, category, "NUOC"),
    }


def draft(client, headers, setup, items=None):
    payload = {
        "supplier_id": setup["supplier"].id,
        "items": items
        or [
            {"product_id": setup["milk"].id, "quantity": 20, "unit_cost": "9500"},
            {
                "product_id": setup["water"].id,
                "quantity": 24,
                "unit_cost": "5000",
                "discount_amount": "12000",
            },
        ],
    }
    response = client.post(PURCHASES, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def stock(db, product) -> tuple[int, Decimal]:
    db.expire_all()
    inventory = db.get(Inventory, product.id)
    return inventory.quantity, inventory.avg_cost


# ---------- Tạo nháp ----------


def test_draft_computes_totals_and_does_not_touch_stock(client, manager, setup, db):
    order = draft(client, manager, setup)

    assert order["code"].startswith("PN") and order["code"].endswith("-0001")
    assert order["status"] == "DRAFT"
    assert [i["line_total"] for i in order["items"]] == ["190000.00", "108000.00"]
    assert order["total_amount"] == "298000.00"
    assert order["created_by"]["full_name"] == "Manager"
    assert stock(db, setup["milk"]) == (0, Decimal("0"))  # nháp: chưa cộng kho
    assert db.scalar(select(func.count()).select_from(InventoryTransaction)) == 0


@pytest.mark.parametrize(
    "items, field",
    [
        ([], "items"),
        (
            [
                {"product_id": 1, "quantity": 1, "unit_cost": 1},
                {"product_id": 1, "quantity": 2, "unit_cost": 1},
            ],
            "items",
        ),
        ([{"product_id": 1, "quantity": 0, "unit_cost": 1}], "items.0.quantity"),
        ([{"product_id": 1, "quantity": 1, "unit_cost": "1.555"}], "items.0.unit_cost"),
        ([{"product_id": 1, "quantity": 1, "unit_cost": 1, "line_total": 5}], "items.0.line_total"),
    ],
)
def test_draft_schema_validation(client, manager, setup, items, field):
    response = client.post(
        PURCHASES, headers=manager, json={"supplier_id": setup["supplier"].id, "items": items}
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


def test_discount_cannot_exceed_line_amount(client, manager, setup):
    response = client.post(
        PURCHASES,
        headers=manager,
        json={
            "supplier_id": setup["supplier"].id,
            "items": [
                {
                    "product_id": setup["milk"].id,
                    "quantity": 2,
                    "unit_cost": "1000",
                    "discount_amount": "2001",
                }
            ],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "items.0.discount_amount"


def test_inactive_product_or_supplier_rejected(client, manager, setup, db):
    setup["water"].is_active = False
    db.commit()
    inactive_product = client.post(
        PURCHASES,
        headers=manager,
        json={
            "supplier_id": setup["supplier"].id,
            "items": [{"product_id": setup["water"].id, "quantity": 1, "unit_cost": 1}],
        },
    )
    unknown_supplier = client.post(
        PURCHASES,
        headers=manager,
        json={
            "supplier_id": 9999,
            "items": [{"product_id": setup["milk"].id, "quantity": 1, "unit_cost": 1}],
        },
    )

    assert inactive_product.json()["error"]["details"][0]["field"] == "items.0.product_id"
    assert unknown_supplier.json()["error"]["details"][0]["field"] == "supplier_id"


def test_cashier_cannot_manage_purchases(client, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER)

    assert client.get(PURCHASES, headers=cashier).status_code == 403
    assert client.post(PURCHASES, headers=cashier, json={}).status_code == 403


# ---------- Sửa nháp ----------


def test_replace_draft_items(client, manager, setup):
    order = draft(client, manager, setup)

    response = client.put(
        f"{PURCHASES}/{order['id']}",
        headers=manager,
        json={
            "supplier_id": setup["supplier"].id,
            "note": "Sửa lại",
            "items": [{"product_id": setup["milk"].id, "quantity": 5, "unit_cost": "9000"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_amount"] == "45000.00"
    assert [i["product_id"] for i in body["items"]] == [setup["milk"].id]
    assert body["note"] == "Sửa lại"


# ---------- Xác nhận ----------


def test_confirm_adds_stock_with_weighted_average_cost(client, manager, setup, db):
    first = draft(
        client, manager, setup, [{"product_id": setup["milk"].id, "quantity": 10, "unit_cost": "8000"}]
    )
    client.post(f"{PURCHASES}/{first['id']}/confirm", headers=manager)
    assert stock(db, setup["milk"]) == (10, Decimal("8000.0000"))

    # Ví dụ trong tài liệu: tồn 10 × 8.000, nhập 20 × 9.500 → bình quân 9.000
    second = draft(client, manager, setup)
    response = client.post(f"{PURCHASES}/{second['id']}/confirm", headers=manager)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "CONFIRMED"
    assert body["confirmed_by"]["full_name"] == "Manager"
    assert body["confirmed_at"] is not None
    assert stock(db, setup["milk"]) == (30, Decimal("9000.0000"))
    # Nước: 24 chai, thành tiền 108.000 sau chiết khấu → giá vốn thực 4.500/chai
    assert stock(db, setup["water"]) == (24, Decimal("4500.0000"))

    tx = db.scalars(
        select(InventoryTransaction).where(
            InventoryTransaction.reference_id == second["id"],
            InventoryTransaction.product_id == setup["milk"].id,
        )
    ).one()
    assert (tx.type, tx.quantity_change, tx.quantity_after) == ("PURCHASE", 20, 30)
    assert (tx.unit_cost, tx.avg_cost_after) == (Decimal("9500.0000"), Decimal("9000.0000"))


def test_confirm_twice_is_rejected_and_stock_added_once(client, manager, setup, db):
    order = draft(client, manager, setup)
    assert client.post(f"{PURCHASES}/{order['id']}/confirm", headers=manager).status_code == 200

    again = client.post(f"{PURCHASES}/{order['id']}/confirm", headers=manager)

    assert again.status_code == 409
    assert again.json()["error"]["code"] == "INVALID_STATE"
    assert stock(db, setup["milk"])[0] == 20


def test_concurrent_confirms_add_stock_exactly_once(client, manager, setup, db):
    """Hai người bấm "Xác nhận" cùng lúc trên cùng một phiếu → chỉ một lần cộng kho."""
    order = draft(client, manager, setup)
    actor_id = db.scalar(select(User.id).where(User.username == "manager"))
    start_together = Barrier(5)

    def confirm(_):
        with SessionLocal() as session:
            actor = session.get(User, actor_id)
            start_together.wait()
            try:
                purchase_service.confirm_purchase(session, order["id"], actor, None)
                return "ok"
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(confirm, range(5)))

    assert sorted(results) == ["INVALID_STATE"] * 4 + ["ok"]
    assert stock(db, setup["milk"]) == (20, Decimal("9500.0000"))
    assert (
        db.scalar(select(func.count()).select_from(InventoryTransaction)) == 2
    )  # 2 dòng hàng, mỗi dòng 1 lần


def test_confirm_rolls_back_everything_when_a_product_became_inactive(client, manager, setup, db):
    order = draft(client, manager, setup)
    setup["water"].is_active = False
    db.commit()

    response = client.post(f"{PURCHASES}/{order['id']}/confirm", headers=manager)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_INACTIVE"
    db.expire_all()
    assert db.get(PurchaseOrder, order["id"]).status == "DRAFT"  # trạng thái được hoàn tác
    assert stock(db, setup["milk"])[0] == 0  # sản phẩm còn lại cũng KHÔNG được cộng
    assert db.scalar(select(func.count()).select_from(InventoryTransaction)) == 0


def test_confirmed_purchase_cannot_be_edited_or_cancelled(client, manager, setup):
    order = draft(client, manager, setup)
    client.post(f"{PURCHASES}/{order['id']}/confirm", headers=manager)

    edit = client.put(
        f"{PURCHASES}/{order['id']}",
        headers=manager,
        json={
            "supplier_id": setup["supplier"].id,
            "items": [{"product_id": setup["milk"].id, "quantity": 1, "unit_cost": 1}],
        },
    )
    cancel = client.post(f"{PURCHASES}/{order['id']}/cancel", headers=manager)

    assert edit.status_code == 409
    assert cancel.status_code == 409


# ---------- Hủy & tra cứu ----------


def test_cancelled_draft_cannot_be_confirmed(client, manager, setup, db):
    order = draft(client, manager, setup)

    cancelled = client.post(f"{PURCHASES}/{order['id']}/cancel", headers=manager)
    confirm = client.post(f"{PURCHASES}/{order['id']}/confirm", headers=manager)

    assert cancelled.json()["status"] == "CANCELLED"
    assert confirm.status_code == 409
    assert stock(db, setup["milk"])[0] == 0


def test_list_and_filter_purchases(client, manager, setup):
    a = draft(client, manager, setup)
    draft(client, manager, setup)
    client.post(f"{PURCHASES}/{a['id']}/confirm", headers=manager)

    confirmed = client.get(PURCHASES, headers=manager, params={"status": "CONFIRMED"}).json()
    by_code = client.get(PURCHASES, headers=manager, params={"q": a["code"]}).json()
    bad_range = client.get(
        PURCHASES, headers=manager, params={"date_from": "2026-12-31", "date_to": "2026-01-01"}
    )

    assert [p["code"] for p in confirmed["items"]] == [a["code"]]
    assert confirmed["items"][0]["item_count"] == 2
    assert by_code["total"] == 1
    assert bad_range.status_code == 422


def test_missing_purchase(client, manager):
    assert client.get(f"{PURCHASES}/999", headers=manager).status_code == 404
    assert client.post(f"{PURCHASES}/999/confirm", headers=manager).status_code == 404
