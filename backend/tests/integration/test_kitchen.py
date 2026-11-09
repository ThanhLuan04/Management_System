"""Đơn quán ăn: ăn tại chỗ / mang đi, số thứ tự, ghi chú món, màn hình bếp theo từng món."""

import uuid

import pytest

from app.core.permissions import RoleCode
from tests.factories import make_category, make_product, set_stock
from tests.integration.test_recipes import dish, ingredient

pytestmark = pytest.mark.usefixtures("open_shift")

ORDERS = "/api/v1/orders"
KITCHEN = "/api/v1/kitchen"


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


@pytest.fixture
def cook(auth_headers):
    return auth_headers(RoleCode.KITCHEN, username="bep1")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


@pytest.fixture
def menu(db):
    category = make_category(db, "Quán")
    beef = ingredient(db, category, "BO", "g", 10_000, "180")
    pho = dish(db, category, "PHOBO", "50000", [(beef, 150)])
    rice = dish(db, category, "COMBO", "60000", [(beef, 200)])
    water = make_product(db, category, "NUOC", sale_price="10000")
    set_stock(db, water, 50, "4000")
    return {"pho": pho, "rice": rice, "water": water}


def sell(client, headers, lines, **extra):
    return client.post(
        ORDERS,
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": p.id, "quantity": q, **({"note": n} if n else {})} for p, q, n in lines],
            "payment": {"method": "CASH", "cash_received": 1_000_000},
            **extra,
        },
    )


def tickets(client, headers):
    return client.get(f"{KITCHEN}/tickets", headers=headers).json()


# ---------- Bán hàng ----------


def test_food_order_gets_a_daily_queue_number_and_kitchen_lines(client, cashier, menu):
    first = sell(
        client,
        cashier,
        [(menu["pho"], 2, None), (menu["pho"], 1, "không hành"), (menu["water"], 2, None)],
        service_type="DINE_IN",
        table_label="Bàn 5",
    ).json()
    second = sell(client, cashier, [(menu["rice"], 1, None)]).json()
    drinks_only = sell(client, cashier, [(menu["water"], 1, None)]).json()

    assert (first["queue_number"], first["service_type"], first["table_label"]) == (1, "DINE_IN", "Bàn 5")
    assert (second["queue_number"], second["service_type"]) == (2, "TAKEAWAY")  # mặc định mang đi
    assert (drinks_only["queue_number"], drinks_only["service_type"]) == (None, None)  # không qua bếp
    lines = [(i["sku"], i["quantity"], i["note"], i["kitchen_status"]) for i in first["items"]]
    assert lines == [
        ("PHOBO", 2, None, "NEW"),
        ("PHOBO", 1, "không hành", "NEW"),  # cùng món khác ghi chú → tách dòng
        ("NUOC", 2, None, None),  # hàng hóa đưa luôn tại quầy
    ]


def test_order_validation_for_tables_and_duplicate_lines(client, cashier, menu):
    no_table = sell(client, cashier, [(menu["pho"], 1, None)], service_type="DINE_IN")
    duplicate = sell(client, cashier, [(menu["pho"], 1, "ít bánh"), (menu["pho"], 1, " ít bánh ")])

    assert no_table.status_code == 422
    assert duplicate.status_code == 422  # cùng món cùng ghi chú → tăng số lượng thay vì thêm dòng


# ---------- Màn hình bếp ----------


def test_kitchen_sees_only_dishes_oldest_first(client, cashier, cook, menu):
    first = sell(client, cashier, [(menu["pho"], 1, "không hành"), (menu["water"], 1, None)]).json()
    second = sell(client, cashier, [(menu["rice"], 2, None)]).json()

    board = tickets(client, cook)

    assert [t["order_id"] for t in board] == [first["id"], second["id"]]
    assert [(i["product_name"], i["note"], i["kitchen_status"]) for i in board[0]["items"]] == [
        ("Sản phẩm PHOBO", "không hành", "NEW")
    ]
    assert board[0]["queue_number"] == 1 and board[0]["cancelled"] is False


def test_items_move_one_step_at_a_time_and_leave_when_served(client, cashier, cook, menu):
    order = sell(client, cashier, [(menu["pho"], 1, None), (menu["rice"], 1, None)]).json()
    pho, rice = (i["id"] for i in order["items"])

    def move(item_id, status):
        return client.patch(f"{KITCHEN}/items/{item_id}", headers=cook, json={"status": status})

    assert move(pho, "READY").json()["error"]["code"] == "INVALID_KITCHEN_TRANSITION"  # nhảy cóc
    assert move(pho, "COOKING").status_code == 200
    assert move(pho, "NEW").status_code == 200  # lùi một bước khi bấm nhầm
    for status in ("COOKING", "READY", "SERVED"):
        assert move(pho, status).status_code == 200

    board = tickets(client, cook)
    assert [(i["id"], i["kitchen_status"]) for i in board[0]["items"]] == [(pho, "SERVED"), (rice, "NEW")]

    # "Xong cả phiếu" rồi "Giao cả phiếu" → hết món chưa giao → phiếu rời màn hình
    ready = client.post(
        f"{KITCHEN}/tickets/{order['id']}/status", headers=cook, json={"status": "READY"}
    ).json()
    assert [i["kitchen_status"] for i in ready["items"]] == [
        "SERVED",
        "READY",
    ]  # món đã giao không bị kéo lùi
    client.post(f"{KITCHEN}/tickets/{order['id']}/status", headers=cook, json={"status": "SERVED"})
    assert tickets(client, cook) == []


def test_cancelled_order_stays_flagged_until_the_kitchen_acknowledges(client, cashier, cook, manager, menu):
    order = sell(client, cashier, [(menu["pho"], 1, None)]).json()
    client.patch(f"{KITCHEN}/items/{order['items'][0]['id']}", headers=cook, json={"status": "COOKING"})

    client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Khách đổi ý"})

    board = tickets(client, cook)
    assert board[0]["cancelled"] is True and board[0]["cancel_reason"] == "Khách đổi ý"
    blocked = client.patch(
        f"{KITCHEN}/items/{order['items'][0]['id']}", headers=cook, json={"status": "READY"}
    )
    assert blocked.json()["error"]["code"] == "ORDER_CANCELLED"

    assert client.post(f"{KITCHEN}/tickets/{order['id']}/acknowledge", headers=cook).status_code == 204
    assert tickets(client, cook) == []


def test_fully_served_order_that_is_cancelled_does_not_bother_the_kitchen(
    client, cashier, cook, manager, menu
):
    order = sell(client, cashier, [(menu["pho"], 1, None)]).json()
    client.post(f"{KITCHEN}/tickets/{order['id']}/status", headers=cook, json={"status": "SERVED"})

    client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Món bị lỗi"})

    assert tickets(client, cook) == []


def test_kitchen_role_cannot_sell_or_see_money(client, cook, menu):
    assert sell(client, cook, [(menu["pho"], 1, None)]).status_code == 403
    assert client.get(ORDERS, headers=cook).status_code == 403
    assert client.get(f"{KITCHEN}/tickets", headers=cook).status_code == 200
