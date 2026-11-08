"""Ca làm việc của két chung: bắt buộc có ca cho mọi giao dịch tiền, đối soát tiền mặt khi đóng ca."""

import threading
import time
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.db.session import SessionLocal
from app.models import CashShift, Payment, ShiftStatus, User
from app.services import shift_service
from tests.factories import make_category, make_product, set_stock

SHIFTS = "/api/v1/shifts"
ORDERS = "/api/v1/orders"


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


@pytest.fixture
def milk(db):
    product = make_product(db, make_category(db), "SUA", sale_price="32000")
    set_stock(db, product, 50, "20000")
    return product


def sell(client, headers, milk, quantity=1, **payment):
    body = {
        "items": [{"product_id": milk.id, "quantity": quantity}],
        **(payment or {"payment": {"method": "CARD"}}),
    }
    return client.post(ORDERS, headers={**headers, "Idempotency-Key": str(uuid.uuid4())}, json=body)


def give_back(client, headers, order, quantity=1):
    body = {
        "reason": "Khách đổi ý",
        "items": [
            {"order_item_id": order["items"][0]["id"], "quantity": quantity, "condition": "RESELLABLE"}
        ],
    }
    return client.post(
        f"{ORDERS}/{order['id']}/returns",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json=body,
    )


def open_(client, headers, opening=500000):
    response = client.post(f"{SHIFTS}/open", headers=headers, json={"opening_cash": opening})
    assert response.status_code == 201, response.text
    return response.json()


def close(client, headers, shift_id, counted, note=None):
    return client.post(
        f"{SHIFTS}/{shift_id}/close", headers=headers, json={"counted_cash": counted, "note": note}
    )


def test_money_transactions_need_an_open_shift(client, cashier, manager, milk):
    response = sell(client, cashier, milk)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_OPEN_SHIFT"

    shift = open_(client, cashier)
    order = sell(client, cashier, milk, 2).json()
    assert close(client, cashier, shift["id"], 500000).status_code == 200

    assert give_back(client, cashier, order).json()["error"]["code"] == "NO_OPEN_SHIFT"
    cancel = client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Nhập nhầm"})
    assert cancel.json()["error"]["code"] == "NO_OPEN_SHIFT"


def test_only_one_shift_can_be_open(client, cashier, manager, db):
    open_(client, cashier)

    second = client.post(f"{SHIFTS}/open", headers=manager, json={"opening_cash": 0})

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SHIFT_ALREADY_OPEN"


def test_database_rejects_a_second_open_shift_even_without_the_service_check(db, make_user):
    user = make_user("a")
    db.add(CashShift(code="CA-1", status=ShiftStatus.OPEN, opening_cash=0, opened_by=user.id))
    db.commit()
    db.add(CashShift(code="CA-2", status=ShiftStatus.OPEN, opening_cash=0, opened_by=user.id))
    with pytest.raises(IntegrityError):
        db.commit()


def test_close_reconciles_cash_across_cashiers_and_methods(client, cashier, manager, milk):
    shift = open_(client, cashier, 500000)
    # Thu ngân: 2 hộp tiền mặt (64.000, khách đưa 100.000 → thối 36.000 không tính vào két)
    cash_order = sell(client, cashier, milk, 2, payment={"method": "CASH", "cash_received": 100000}).json()
    # Quản lý cùng bán trong ca (két chung): kết hợp 10.000 tiền mặt + 22.000 chuyển khoản
    sell(
        client,
        manager,
        milk,
        1,
        payments=[{"method": "CASH", "amount": 10000}, {"method": "BANK_TRANSFER", "amount": 22000}],
    )
    # Trả 1 hộp đơn tiền mặt → hoàn 32.000 tiền mặt ra khỏi két
    assert give_back(client, cashier, cash_order).status_code == 201

    current = client.get(f"{SHIFTS}/current", headers=cashier).json()["shift"]
    expected = 500000 + 64000 + 10000 - 32000
    assert Decimal(current["current_expected_cash"]) == expected
    assert current["cash_received"] == "74000.00" and current["cash_refunded"] == "32000.00"
    assert {m["method"]: m["amount"] for m in current["received_by_method"]} == {
        "BANK_TRANSFER": "22000.00",
        "CASH": "74000.00",
    }
    assert current["order_count"] == 2
    assert {c["user"]["full_name"]: c["revenue"] for c in current["by_cashier"]} == {
        "Thungan": "64000.00",
        "Quanly": "32000.00",
    }

    closed = close(client, cashier, shift["id"], expected)

    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["status"] == "CLOSED"
    assert Decimal(body["expected_cash"]) == expected and Decimal(body["difference"]) == 0


def test_discrepancy_requires_a_note(client, cashier, milk):
    shift = open_(client, cashier, 200000)
    sell(client, cashier, milk, 1, payment={"method": "CASH", "cash_received": 32000})

    missing = close(client, cashier, shift["id"], 222000)  # thiếu 10.000

    assert missing.status_code == 422
    error = missing.json()["error"]
    assert error["code"] == "CLOSE_NOTE_REQUIRED"
    assert error["details"] == {
        "expected_cash": "232000.00",
        "counted_cash": "222000.00",
        "difference": "-10000.00",
    }

    closed = close(client, cashier, shift["id"], 222000, note="Thối nhầm cho khách")
    assert closed.json()["difference"] == "-10000.00"
    assert closed.json()["close_note"] == "Thối nhầm cho khách"


def test_next_shift_suggests_the_counted_cash_and_refunds_count_in_the_shift_where_they_happen(
    client, cashier, manager, milk
):
    first = open_(client, cashier, 100000)
    order = sell(client, cashier, milk, 1, payment={"method": "CASH", "cash_received": 32000}).json()
    close(client, cashier, first["id"], 132000)

    assert client.get(f"{SHIFTS}/current", headers=cashier).json() == {
        "shift": None,
        "suggested_opening_cash": "132000.00",
    }

    second = open_(client, cashier, 132000)
    assert give_back(client, cashier, order).status_code == 201  # hoàn ở ca sau

    detail_first = client.get(f"{SHIFTS}/{first['id']}", headers=manager).json()
    detail_second = client.get(f"{SHIFTS}/{second['id']}", headers=manager).json()
    assert detail_first["expected_cash"] == "132000.00"  # số đã chốt không đổi
    assert detail_second["current_expected_cash"] == "100000.00"  # 132.000 − 32.000 hoàn
    assert detail_second["order_count"] == 0


def test_cashier_manages_current_shift_but_only_managers_see_history(client, cashier, manager):
    shift = open_(client, cashier)

    assert client.get(SHIFTS, headers=cashier).status_code == 403
    assert client.get(f"{SHIFTS}/{shift['id']}", headers=cashier).status_code == 403
    assert client.get(SHIFTS, headers=manager).json()["total"] == 1


def test_history_can_show_only_shifts_with_discrepancy(client, cashier, manager):
    exact = open_(client, cashier, 0)
    close(client, cashier, exact["id"], 0)
    short = open_(client, cashier, 0)
    close(client, cashier, short["id"], 5000, note="Thừa tiền chưa rõ")

    items = client.get(SHIFTS, headers=manager, params={"discrepancy_only": True}).json()["items"]

    assert [s["id"] for s in items] == [short["id"]]


def test_closed_shift_cannot_be_closed_again(client, cashier):
    shift = open_(client, cashier, 0)
    close(client, cashier, shift["id"], 0)

    again = close(client, cashier, shift["id"], 0)

    assert again.json()["error"]["code"] == "SHIFT_ALREADY_CLOSED"


def test_closing_waits_for_an_in_flight_payment_so_nothing_escapes_the_shift(client, cashier, milk, db):
    """Giao dịch đang dở (giữ khóa chia sẻ) → đóng ca phải chờ nó commit rồi mới cộng số liệu."""
    shift = open_(client, cashier, 0)
    order = sell(client, cashier, milk, 1, payment={"method": "CASH", "cash_received": 32000}).json()
    actor = db.scalar(select(User).where(User.username == "thungan"))

    in_flight = SessionLocal()
    locked = shift_service.open_shift_for_money(in_flight)  # khóa chia sẻ, chưa commit
    in_flight.add(
        Payment(
            sales_order_id=order["id"],
            type="PAYMENT",
            method="CASH",
            amount=Decimal("1000"),
            shift_id=locked.id,
            created_by=actor.id,
        )
    )
    in_flight.flush()

    result: dict = {}

    def close_in_background():
        with SessionLocal() as session:
            closer = session.get(User, actor.id)
            try:
                result["shift"] = shift_service.close_shift(
                    session, shift["id"], Decimal("33000"), None, closer, None
                )
                result["expected"] = result["shift"].expected_cash
            except AppError as exc:  # pragma: no cover — chỉ để báo lỗi rõ nếu test hỏng
                result["error"] = exc.code

    worker = threading.Thread(target=close_in_background)
    worker.start()
    time.sleep(0.5)
    assert worker.is_alive(), "đóng ca phải chờ giao dịch đang giữ khóa ca"

    in_flight.commit()
    in_flight.close()
    worker.join(timeout=10)

    assert result.get("expected") == Decimal("33000.00")  # 32.000 + 1.000 của giao dịch đang dở
