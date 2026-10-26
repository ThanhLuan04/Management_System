"""
Kịch bản cố định để kiểm tra báo cáo bằng số liệu tính tay (giờ VN = UTC+7):

    Đơn A  01/10 10:00   5 sữa (32.000, giá vốn 9.000)  = 160.000, giá vốn 45.000
    Đơn B  01/10 23:30   2 bánh (10.000, giá vốn 6.000) =  20.000, giá vốn 12.000
    Đơn C  02/10 00:30   3 bánh                          =  30.000, giá vốn 18.000   ← 17:30 ngày 01/10 theo UTC!
    Đơn D  02/10 09:00   1 sữa — ĐÃ HỦY                  → không tính
    Trả R1 03/10 08:00   2 sữa của đơn A, còn bán được   → hoàn 64.000, giá vốn nhập lại 18.000
    Trả R2 03/10 09:00   1 sữa của đơn A, hỏng           → hoàn 32.000, không nhập lại kho

    Ngày   | đơn | doanh thu gộp | hoàn   | thuần   | giá vốn | lợi nhuận
    01/10  |  2  | 180.000       | 0      | 180.000 | 57.000  | 123.000
    02/10  |  1  |  30.000       | 0      |  30.000 | 18.000  |  12.000
    03/10  |  0  |       0       | 96.000 | -96.000 | -18.000 | -78.000
    Tổng   |  3  | 210.000       | 96.000 | 114.000 | 57.000  |  57.000
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.permissions import RoleCode
from tests.factories import make_category, make_product, make_supplier, set_stock

PARAMS = {"date_from": "2026-10-01", "date_to": "2026-10-03"}


@pytest.fixture
def admin(auth_headers):
    return auth_headers(RoleCode.ADMIN)


@pytest.fixture
def goods(db):
    category = make_category(db)
    milk = make_product(db, category, "SUA", sale_price="32000")
    cake = make_product(db, category, "BANH", sale_price="10000")
    set_stock(db, milk, 100, "9000")
    set_stock(db, cake, 100, "6000")
    return {"milk": milk, "cake": cake}


def _sell(client, headers, product, qty):
    response = client.post(
        "/api/v1/orders",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": product.id, "quantity": qty}],
            "payment": {"method": "CASH", "cash_received": 1000000},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _return(client, headers, order, qty, condition):
    response = client.post(
        f"/api/v1/orders/{order['id']}/returns",
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "reason": "Trả hàng",
            "items": [{"order_item_id": order["items"][0]["id"], "quantity": qty, "condition": condition}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _set_time(db, table: str, row_id: int, vn_time: str):
    db.execute(
        text(
            f"UPDATE {table} SET created_at = (:t)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' WHERE id = :id"
        ),
        {"t": vn_time, "id": row_id},
    )
    db.commit()


@pytest.fixture
def scenario(client, admin, goods, db):
    a = _sell(client, admin, goods["milk"], 5)
    b = _sell(client, admin, goods["cake"], 2)
    c = _sell(client, admin, goods["cake"], 3)
    d = _sell(client, admin, goods["milk"], 1)
    client.post(f"/api/v1/orders/{d['id']}/cancel", headers=admin, json={"reason": "Khách đổi ý"})
    r1 = _return(client, admin, a, 2, "RESELLABLE")
    r2 = _return(client, admin, a, 1, "DAMAGED")

    for order, moment in (
        (a, "2026-10-01 10:00"),
        (b, "2026-10-01 23:30"),
        (c, "2026-10-02 00:30"),
        (d, "2026-10-02 09:00"),
    ):
        _set_time(db, "sales_orders", order["id"], moment)
    _set_time(db, "sales_returns", r1["id"], "2026-10-03 08:00")
    _set_time(db, "sales_returns", r2["id"], "2026-10-03 09:00")
    return {"a": a, "b": b, "c": c, "d": d}


def money(*values):
    return [f"{Decimal(v):.2f}" for v in values]


# ---------- Doanh thu ----------


def test_daily_revenue_matches_hand_calculation(client, admin, scenario):
    report = client.get("/api/v1/reports/revenue", headers=admin, params=PARAMS).json()

    rows = [
        (
            r["period"],
            r["order_count"],
            r["gross_revenue"],
            r["refunds"],
            r["net_revenue"],
            r["cogs"],
            r["gross_profit"],
        )
        for r in report["series"]
    ]
    assert rows == [
        ("2026-10-01", 2, *money(180000, 0, 180000, 57000, 123000)),
        ("2026-10-02", 1, *money(30000, 0, 30000, 18000, 12000)),
        ("2026-10-03", 0, *money(0, 96000, -96000, -18000, -78000)),
    ]
    totals = report["totals"]
    assert (totals["order_count"], totals["gross_revenue"], totals["refunds"]) == (3, *money(210000, 96000))
    assert (totals["net_revenue"], totals["cogs"], totals["gross_profit"]) == tuple(
        money(114000, 57000, 57000)
    )
    assert totals["average_order_value"] == "70000.00"


def test_order_just_after_midnight_vn_counts_for_next_day(client, admin, scenario):
    """Đơn C lúc 00:30 ngày 02/10 giờ VN (= 17:30 ngày 01/10 UTC) phải thuộc ngày 02/10."""
    only_oct_1 = client.get(
        "/api/v1/reports/revenue", headers=admin, params={"date_from": "2026-10-01", "date_to": "2026-10-01"}
    ).json()

    assert only_oct_1["totals"]["order_count"] == 2
    assert only_oct_1["totals"]["gross_revenue"] == "180000.00"


@pytest.mark.parametrize("group_by, period", [("week", "2026-09-28"), ("month", "2026-10-01")])
def test_weekly_and_monthly_grouping(client, admin, scenario, group_by, period):
    report = client.get(
        "/api/v1/reports/revenue", headers=admin, params={**PARAMS, "group_by": group_by}
    ).json()

    assert [r["period"] for r in report["series"]] == [period]
    assert report["series"][0]["gross_profit"] == "57000.00"


def test_empty_days_are_filled_with_zero(client, admin, scenario):
    report = client.get(
        "/api/v1/reports/revenue", headers=admin, params={"date_from": "2026-09-29", "date_to": "2026-10-01"}
    ).json()

    assert [(r["period"], r["order_count"]) for r in report["series"]] == [
        ("2026-09-29", 0),
        ("2026-09-30", 0),
        ("2026-10-01", 2),
    ]


def test_invalid_ranges(client, admin):
    reversed_range = client.get(
        "/api/v1/reports/revenue", headers=admin, params={"date_from": "2026-10-03", "date_to": "2026-10-01"}
    )
    too_long = client.get(
        "/api/v1/reports/revenue", headers=admin, params={"date_from": "2025-01-01", "date_to": "2026-10-01"}
    )
    bad_group = client.get("/api/v1/reports/revenue", headers=admin, params={"group_by": "year"})

    assert (reversed_range.status_code, too_long.status_code, bad_group.status_code) == (422, 422, 422)


# ---------- Sản phẩm bán chạy ----------


def test_top_products_are_net_of_returns_and_cancellations(client, admin, scenario):
    by_quantity = client.get("/api/v1/reports/top-products", headers=admin, params=PARAMS).json()
    by_revenue = client.get(
        "/api/v1/reports/top-products", headers=admin, params={**PARAMS, "by": "revenue"}
    ).json()

    # Sữa: bán 5 (đơn D đã hủy không tính), trả 3 → ròng 2, doanh thu 160.000 − 96.000
    assert [(r["sku"], r["quantity"], r["revenue"]) for r in by_quantity] == [
        ("BANH", 5, "50000.00"),
        ("SUA", 2, "64000.00"),
    ]
    assert [r["sku"] for r in by_revenue] == ["SUA", "BANH"]


# ---------- CSV ----------


def test_revenue_csv_export(client, admin, scenario):
    response = client.get("/api/v1/reports/revenue", headers=admin, params={**PARAMS, "format": "csv"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="doanh-thu-20261001-20261003.csv"' in response.headers["content-disposition"]
    content = response.content.decode("utf-8")
    assert content.startswith("﻿")  # BOM cho Excel
    lines = content.lstrip("﻿").splitlines()
    assert lines[0] == "Kỳ,Số đơn,Doanh thu gộp,Tiền hoàn,Doanh thu thuần,Giá vốn,Lợi nhuận gộp"
    assert lines[1] == "01/10/2026,2,180000.00,0.00,180000.00,57000.00,123000.00"
    assert len(lines) == 4


def test_csv_neutralizes_formula_injection(client, admin, db):
    category = make_category(db, "Khác")
    evil = make_product(db, category, "EVIL")
    evil.name = '=HYPERLINK("http://evil.example","Bấm vào")'
    db.commit()

    response = client.get("/api/v1/reports/inventory", headers=admin, params={"format": "csv"})

    row = response.content.decode("utf-8").splitlines()[1]
    assert "'=HYPERLINK" in row  # Excel hiển thị như chữ, không chạy công thức


# ---------- Tồn kho & nhập hàng ----------


def test_inventory_report_values(client, admin, goods):
    report = client.get("/api/v1/reports/inventory", headers=admin).json()

    assert report["total_quantity"] == 200
    assert report["total_value"] == "1500000.00"  # 100 × 9.000 + 100 × 6.000
    assert [i["stock_value"] for i in report["items"]] == [
        "600000.00",
        "900000.00",
    ]  # sắp theo tên: BANH, SUA


def test_purchases_by_supplier(client, admin, goods, db):
    supplier = make_supplier(db)
    for qty in (10, 20):
        purchase = client.post(
            "/api/v1/purchases",
            headers=admin,
            json={
                "supplier_id": supplier.id,
                "items": [{"product_id": goods["milk"].id, "quantity": qty, "unit_cost": 9000}],
            },
        ).json()
        client.post(f"/api/v1/purchases/{purchase['id']}/confirm", headers=admin)
    client.post(  # phiếu nháp không được tính
        "/api/v1/purchases",
        headers=admin,
        json={
            "supplier_id": supplier.id,
            "items": [{"product_id": goods["milk"].id, "quantity": 99, "unit_cost": 1}],
        },
    )

    rows = client.get("/api/v1/reports/purchases-by-supplier", headers=admin).json()

    assert [
        (r["supplier_code"], r["purchase_count"], r["total_quantity"], r["total_amount"]) for r in rows
    ] == [("NCC0001", 2, 30, "270000.00")]


# ---------- Dashboard & doanh số của tôi ----------


def test_dashboard(client, admin, auth_headers, goods, db):
    goods["cake"].min_stock = 200
    db.commit()
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    _sell(client, cashier, goods["milk"], 2)  # hôm nay

    dashboard = client.get("/api/v1/reports/dashboard", headers=admin).json()

    kpis = dashboard["kpis"]
    assert (kpis["today_order_count"], kpis["today_net_revenue"]) == (1, "64000.00")
    assert (kpis["active_product_count"], kpis["low_stock_count"]) == (2, 1)
    assert kpis["inventory_value"] == "1482000.00"  # 98 × 9.000 + 100 × 6.000
    assert len(dashboard["revenue_series"]) == 30  # mặc định 30 ngày gần nhất
    assert dashboard["top_products"][0]["sku"] == "SUA"
    assert dashboard["recent_orders"][0]["total_amount"] == "64000.00"
    assert [i["sku"] for i in dashboard["low_stock_items"]] == ["BANH"]


def test_my_sales_for_shift_handover(client, auth_headers, admin, goods):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    order = _sell(client, cashier, goods["milk"], 2)  # 64.000 tiền mặt
    client.post(
        "/api/v1/orders",
        headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
        json={"items": [{"product_id": goods["cake"].id, "quantity": 1}], "payment": {"method": "CARD"}},
    )
    _return(client, cashier, order, 1, "RESELLABLE")  # hoàn 32.000 tiền mặt
    _sell(client, admin, goods["cake"], 5)  # của người khác → không tính

    mine = client.get("/api/v1/reports/my-sales", headers=cashier).json()

    assert (mine["order_count"], mine["gross_revenue"], mine["refunds"], mine["net_revenue"]) == (
        2,
        *money(74000, 32000, 42000),
    )
    assert mine["received_by_method"] == [
        {"method": "CARD", "amount": "10000.00"},
        {"method": "CASH", "amount": "64000.00"},
    ]
    assert mine["cash_in_drawer"] == "32000.00"


def test_report_permissions(client, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")
    manager = auth_headers(RoleCode.MANAGER, username="quanly")

    for path in ("dashboard", "revenue", "top-products", "inventory", "purchases-by-supplier"):
        assert client.get(f"/api/v1/reports/{path}", headers=cashier).status_code == 403
        assert client.get(f"/api/v1/reports/{path}", headers=manager).status_code == 200
    assert client.get("/api/v1/reports/my-sales", headers=cashier).status_code == 200
