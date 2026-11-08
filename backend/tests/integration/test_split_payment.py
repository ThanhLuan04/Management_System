"""Thanh toán kết hợp (tiền mặt + chuyển khoản + thẻ), hủy đơn và trả hàng với nhiều phương thức."""

import uuid

import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import Inventory
from tests.factories import make_category, make_product, set_stock

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
    set_stock(db, product, 20, "20000")
    return product


def post_order(client, headers, body):
    return client.post(ORDERS, headers={**headers, "Idempotency-Key": str(uuid.uuid4())}, json=body)


def split_sale(client, headers, milk, quantity, payments):
    response = post_order(
        client, headers, {"items": [{"product_id": milk.id, "quantity": quantity}], "payments": payments}
    )
    assert response.status_code == 201, response.text
    return response.json()


def return_items(client, headers, order, quantity, refund_method=None):
    body = {
        "reason": "Khách đổi ý",
        "items": [
            {"order_item_id": order["items"][0]["id"], "quantity": quantity, "condition": "RESELLABLE"}
        ],
    }
    if refund_method:
        body["refund_method"] = refund_method
    return client.post(
        f"{ORDERS}/{order['id']}/returns",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json=body,
    )


def refunds_of(client, headers, order_id):
    payments = client.get(f"{ORDERS}/{order_id}", headers=headers).json()["payments"]
    return sorted((p["method"], p["amount"]) for p in payments if p["type"] == "REFUND")


def test_split_payment_records_each_part_and_change_only_on_cash(client, cashier, milk):
    order = split_sale(
        client,
        cashier,
        milk,
        2,  # 64.000 ₫
        [
            {"method": "CASH", "amount": 14000, "cash_received": 20000},
            {"method": "BANK_TRANSFER", "amount": 50000, "reference_note": "SS7K2M9Q"},
        ],
    )

    assert order["total_amount"] == "64000.00"
    payments = {p["method"]: p for p in order["payments"]}
    assert payments["CASH"]["amount"] == "14000.00"
    assert payments["CASH"]["change_amount"] == "6000.00"
    assert payments["BANK_TRANSFER"]["amount"] == "50000.00"
    assert payments["BANK_TRANSFER"]["reference_note"] == "SS7K2M9Q"
    summary = client.get(ORDERS, headers=cashier).json()["items"][0]
    assert summary["payment_method"] == "MIXED"


def test_cash_part_without_cash_received_means_exact_amount(client, cashier, milk):
    order = split_sale(
        client, cashier, milk, 1, [{"method": "CASH", "amount": 2000}, {"method": "CARD", "amount": 30000}]
    )
    cash = next(p for p in order["payments"] if p["method"] == "CASH")
    assert cash["cash_received"] == "2000.00" and cash["change_amount"] == "0.00"


def test_parts_must_add_up_to_the_server_computed_total(client, cashier, milk, db):
    response = post_order(
        client,
        cashier,
        {
            "items": [{"product_id": milk.id, "quantity": 1}],
            "payments": [{"method": "CASH", "amount": 10000}, {"method": "BANK_TRANSFER", "amount": 20000}],
        },
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "PAYMENT_MISMATCH"
    assert error["details"] == {"total_amount": "32000.00", "paid": "30000.00"}
    assert db.scalar(select(Inventory.quantity).where(Inventory.product_id == milk.id)) == 20  # không trừ kho


@pytest.mark.parametrize(
    "body_extra",
    [
        {
            "payment": {"method": "CARD"},
            "payments": [{"method": "CASH", "amount": 1}, {"method": "CARD", "amount": 1}],
        },
        {"payments": [{"method": "CASH", "amount": 32000}]},  # kết hợp cần ít nhất 2 khoản
        {"payments": [{"method": "CASH", "amount": 16000}, {"method": "CASH", "amount": 16000}]},
        {
            "payments": [
                {"method": "CARD", "amount": 2000, "cash_received": 5000},
                {"method": "CASH", "amount": 30000},
            ]
        },
        {},  # không có thông tin thanh toán
    ],
    ids=["both_forms", "single_part", "duplicate_method", "cash_received_on_card", "missing"],
)
def test_invalid_payment_shapes_are_rejected(client, cashier, milk, body_extra):
    response = post_order(client, cashier, {"items": [{"product_id": milk.id, "quantity": 1}], **body_extra})
    assert response.status_code == 422


def test_cash_part_needs_enough_cash(client, cashier, milk):
    response = post_order(
        client,
        cashier,
        {
            "items": [{"product_id": milk.id, "quantity": 1}],
            "payments": [
                {"method": "CASH", "amount": 12000, "cash_received": 10000},
                {"method": "CARD", "amount": 20000},
            ],
        },
    )
    assert response.json()["error"]["code"] == "INSUFFICIENT_PAYMENT"


def test_cancel_refunds_every_part_with_its_own_method(client, cashier, manager, milk):
    order = split_sale(
        client,
        cashier,
        milk,
        2,
        [{"method": "CASH", "amount": 14000}, {"method": "BANK_TRANSFER", "amount": 50000}],
    )

    response = client.post(
        f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Nhập nhầm đơn"}
    )

    assert response.status_code == 200, response.text
    assert refunds_of(client, manager, order["id"]) == [("BANK_TRANSFER", "50000.00"), ("CASH", "14000.00")]


def test_return_refunds_with_the_chosen_method(client, cashier, milk):
    order = split_sale(
        client,
        cashier,
        milk,
        2,
        [{"method": "CASH", "amount": 14000}, {"method": "BANK_TRANSFER", "amount": 50000}],
    )

    response = return_items(client, cashier, order, 1, refund_method="BANK_TRANSFER")

    assert response.status_code == 201, response.text
    assert response.json()["refund_method"] == "BANK_TRANSFER"
    assert refunds_of(client, cashier, order["id"]) == [("BANK_TRANSFER", "32000.00")]


def test_refund_overflows_to_other_methods_instead_of_getting_stuck(client, cashier, milk):
    # 14.000 tiền mặt + 50.000 chuyển khoản; trả lần lượt 2 hộp 32.000
    order = split_sale(
        client,
        cashier,
        milk,
        2,
        [{"method": "CASH", "amount": 14000}, {"method": "BANK_TRANSFER", "amount": 50000}],
    )
    assert return_items(client, cashier, order, 1, refund_method="BANK_TRANSFER").status_code == 201

    # Còn 14.000 tiền mặt + 18.000 chuyển khoản: không phương thức nào đủ 32.000 một mình
    second = return_items(client, cashier, order, 1)

    assert second.status_code == 201, second.text
    assert second.json()["refund_method"] == "MIXED"
    assert refunds_of(client, cashier, order["id"]) == [
        ("BANK_TRANSFER", "18000.00"),
        ("BANK_TRANSFER", "32000.00"),
        ("CASH", "14000.00"),
    ]


def test_default_refund_prefers_cash_and_never_exceeds_what_each_method_received(client, cashier, milk):
    order = split_sale(
        client, cashier, milk, 1, [{"method": "CASH", "amount": 2000}, {"method": "CARD", "amount": 30000}]
    )

    response = return_items(client, cashier, order, 1)

    assert response.status_code == 201
    assert refunds_of(client, cashier, order["id"]) == [("CARD", "30000.00"), ("CASH", "2000.00")]


def test_cannot_refund_with_a_method_the_customer_did_not_use(client, cashier, milk):
    order = split_sale(
        client, cashier, milk, 1, [{"method": "CASH", "amount": 2000}, {"method": "CARD", "amount": 30000}]
    )

    response = return_items(client, cashier, order, 1, refund_method="BANK_TRANSFER")

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "REFUND_METHOD_INVALID"
    assert error["details"]["available"] == {"CASH": "2000.00", "CARD": "30000.00"}


def test_cash_drawer_counts_only_the_cash_part(client, cashier, milk):
    split_sale(
        client,
        cashier,
        milk,
        2,
        [
            {"method": "CASH", "amount": 14000, "cash_received": 50000},
            {"method": "BANK_TRANSFER", "amount": 50000},
        ],
    )

    mine = client.get("/api/v1/reports/my-sales", headers=cashier).json()

    assert mine["cash_in_drawer"] == "14000.00"  # tiền thừa đã trả lại khách không tính vào két
