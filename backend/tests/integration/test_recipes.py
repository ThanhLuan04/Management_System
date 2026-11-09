"""
Món ăn theo công thức định lượng: bán món trừ nguyên liệu, hủy hoàn đúng lượng đã trừ, trả món không nhập kho,
nhập nguyên liệu theo đơn vị nhập (kg) quy đổi sang đơn vị kho (g).
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog, Inventory, InventoryTransaction, Product, ProductKind, RecipeItem
from tests.factories import make_category, make_product, make_supplier, set_stock
from tests.integration.test_orders import _run_concurrently, card_order

pytestmark = pytest.mark.usefixtures("open_shift")

PRODUCTS = "/api/v1/products"
ORDERS = "/api/v1/orders"


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


def ingredient(db, category, sku, unit, quantity, avg_cost):
    product = make_product(db, category, sku, sale_price="0")
    product.kind, product.unit = ProductKind.INGREDIENT, unit
    db.commit()
    set_stock(db, product, quantity, avg_cost)
    return product


def dish(db, category, sku, price, recipe):
    product = make_product(db, category, sku, sale_price=price)
    product.kind, product.unit = ProductKind.DISH, "tô"
    product.recipe = [RecipeItem(ingredient_id=ing.id, quantity=qty) for ing, qty in recipe]
    db.commit()
    return product


@pytest.fixture
def kitchen(db):
    """
    Thịt bò 1.000 g (giá vốn 180 ₫/g), bánh phở 2.000 g (20 ₫/g).
    Phở bò 50.000 ₫ = 150 g bò + 200 g bánh → giá vốn 27.000 + 4.000 = 31.000 ₫.
    Bò xào 70.000 ₫ = 250 g bò.
    """
    category = make_category(db, "Món ăn")
    beef = ingredient(db, category, "BO", "g", 1000, "180")
    noodle = ingredient(db, category, "BANHPHO", "g", 2000, "20")
    pho = dish(db, category, "PHOBO", "50000", [(beef, 150), (noodle, 200)])
    stir_fry = dish(db, category, "BOXAO", "70000", [(beef, 250)])
    return {"category": category, "beef": beef, "noodle": noodle, "pho": pho, "stir_fry": stir_fry}


def sell(client, headers, items):
    return client.post(
        ORDERS,
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": p.id, "quantity": q} for p, q in items],
            "payment": {"method": "CASH", "cash_received": 1_000_000},
        },
    )


def stock(db, product) -> int:
    db.expire_all()
    return db.get(Inventory, product.id).quantity


# ---------- Khai báo sản phẩm và công thức ----------


def test_create_dish_and_ingredient_with_purchase_unit(client, manager, kitchen, db):
    base = {"category_id": kitchen["category"].id, "sale_price": 0}

    created = client.post(
        PRODUCTS,
        headers=manager,
        json={
            **base,
            "sku": "THITHEO",
            "name": "Thịt heo",
            "unit": "g",
            "kind": "INGREDIENT",
            "purchase_unit": "kg",
            "purchase_factor": 1000,
            "min_stock": 500,
        },
    )
    assert created.status_code == 201
    assert (created.json()["kind"], created.json()["purchase_unit"], created.json()["purchase_factor"]) == (
        "INGREDIENT",
        "kg",
        1000,
    )

    dish_body = {**base, "sku": "COMTAM", "name": "Cơm tấm", "unit": "đĩa", "kind": "DISH", "min_stock": 5}
    created_dish = client.post(PRODUCTS, headers=manager, json=dish_body).json()
    assert created_dish["min_stock"] == 0  # món không có tồn riêng → không cảnh báo sắp hết
    assert created_dish["recipe"] == [] and created_dish["quantity"] == 0

    # Loại sản phẩm không đổi được sau khi tạo
    assert (
        client.patch(f"{PRODUCTS}/{created_dish['id']}", headers=manager, json={"kind": "GOODS"}).status_code
        == 422
    )


@pytest.mark.parametrize(
    ("extra", "field"),
    [
        ({"kind": "INGREDIENT", "purchase_factor": 1000}, "purchase_unit"),  # thiếu tên đơn vị nhập
        ({"kind": "INGREDIENT", "purchase_unit": "kg"}, "purchase_factor"),  # 1 kg = 1 g?
        (
            {"kind": "DISH", "purchase_unit": "kg", "purchase_factor": 1000},
            "purchase_factor",
        ),  # món không nhập
    ],
)
def test_purchase_unit_rules(client, manager, kitchen, extra, field):
    body = {
        "sku": "X1",
        "name": "X",
        "unit": "g",
        "category_id": kitchen["category"].id,
        "sale_price": 0,
        **extra,
    }

    response = client.post(PRODUCTS, headers=manager, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == field


def test_recipe_shows_cost_portions_and_is_audited(client, manager, cashier, kitchen, db):
    pho = client.get(f"{PRODUCTS}/{kitchen['pho'].id}", headers=manager).json()

    assert pho["avg_cost"] == "31000.0000"  # 150 × 180 + 200 × 20
    assert pho["quantity"] == 6  # bò: 1000 // 150 = 6, bánh: 2000 // 200 = 10 → 6 phần
    assert pho["is_low_stock"] is False
    assert [(line["ingredient"]["sku"], line["quantity"]) for line in pho["recipe"]] == [
        ("BO", 150),
        ("BANHPHO", 200),
    ]

    # Thu ngân không thấy giá vốn — kể cả giá vốn nguyên liệu trong công thức
    seen_by_cashier = client.get(f"{PRODUCTS}/{kitchen['pho'].id}", headers=cashier).json()
    assert "avg_cost" not in seen_by_cashier and "avg_cost" not in seen_by_cashier["recipe"][0]["ingredient"]

    updated = client.put(
        f"{PRODUCTS}/{kitchen['pho'].id}/recipe",
        headers=manager,
        json={"items": [{"ingredient_id": kitchen["beef"].id, "quantity": 200}]},
    )
    assert updated.status_code == 200
    assert updated.json()["avg_cost"] == "36000.0000" and updated.json()["quantity"] == 5

    log = db.scalar(select(AuditLog).where(AuditLog.action == "RECIPE_UPDATE"))
    assert log.new_values == {"recipe": [{"ingredient_id": kitchen["beef"].id, "quantity": 200}]}
    assert (
        client.put(f"{PRODUCTS}/{kitchen['pho'].id}/recipe", headers=cashier, json={"items": []}).status_code
        == 403
    )


@pytest.mark.parametrize("case", ["duplicate", "dish_in_dish", "goods_has_no_recipe"])
def test_invalid_recipes(client, manager, kitchen, case):
    beef, pho, stir_fry = kitchen["beef"], kitchen["pho"], kitchen["stir_fry"]
    target, items, code = {
        "duplicate": (pho, [(beef, 100), (beef, 50)], "VALIDATION_ERROR"),
        "dish_in_dish": (pho, [(stir_fry, 1)], "VALIDATION_ERROR"),
        "goods_has_no_recipe": (beef, [(kitchen["noodle"], 1)], "NOT_A_DISH"),
    }[case]

    response = client.put(
        f"{PRODUCTS}/{target.id}/recipe",
        headers=manager,
        json={"items": [{"ingredient_id": p.id, "quantity": q} for p, q in items]},
    )

    assert response.json()["error"]["code"] == code


def test_sellable_filter_hides_ingredients_from_the_counter(client, cashier, kitchen):
    skus = {
        p["sku"] for p in client.get(PRODUCTS, headers=cashier, params={"sellable": True}).json()["items"]
    }
    assert skus == {"PHOBO", "BOXAO"}

    ingredients = client.get(PRODUCTS, headers=cashier, params={"kind": "INGREDIENT"}).json()["items"]
    assert {p["sku"] for p in ingredients} == {"BO", "BANHPHO"}
    stocked = client.get(PRODUCTS, headers=cashier, params={"stocked": True}).json()["items"]
    assert {p["sku"] for p in stocked} == {"BO", "BANHPHO"}  # phiếu nhập / kiểm kê không có món


# ---------- Bán, hủy, trả ----------


def test_selling_dishes_deducts_ingredients_and_books_their_cost(client, cashier, manager, kitchen, db):
    response = sell(client, cashier, [(kitchen["pho"], 2), (kitchen["stir_fry"], 1)])

    assert response.status_code == 201
    # Bò dùng chung cho 2 món: 2 × 150 + 250 = 550 g
    assert stock(db, kitchen["beef"]) == 450
    assert stock(db, kitchen["noodle"]) == 1600

    order = client.get(f"{ORDERS}/{response.json()['id']}", headers=manager).json()
    costs = {item["sku"]: item["unit_cost"] for item in order["items"]}
    assert costs == {"PHOBO": "31000.0000", "BOXAO": "45000.0000"}
    assert all(item["is_dish"] for item in order["items"])
    # Lợi nhuận gộp = 170.000 − (2 × 31.000 + 45.000) = 63.000
    assert order["gross_profit"] == "63000.00"

    ledger = db.scalars(
        select(InventoryTransaction).where(InventoryTransaction.reference_id == response.json()["id"])
    ).all()
    assert sorted((tx.product_id, tx.quantity_change, tx.type) for tx in ledger) == sorted(
        [(kitchen["beef"].id, -550, "SALE"), (kitchen["noodle"].id, -400, "SALE")]
    )


def test_not_enough_ingredients_blocks_the_sale_and_names_them(client, cashier, kitchen, db):
    response = sell(client, cashier, [(kitchen["pho"], 4), (kitchen["stir_fry"], 2)])  # bò cần 1.100 g

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "INSUFFICIENT_INGREDIENTS"
    assert "Sản phẩm BO (cần 1100 g, còn 1000)" in error["message"]
    assert error["details"] == [
        {
            "product_id": kitchen["beef"].id,
            "sku": "BO",
            "name": "Sản phẩm BO",
            "unit": "g",
            "required": 1100,
            "available": 1000,
        }
    ]
    assert stock(db, kitchen["beef"]) == 1000  # không trừ gì


def test_ingredients_and_dishes_without_recipe_cannot_be_sold(client, cashier, kitchen, db):
    assert sell(client, cashier, [(kitchen["beef"], 1)]).json()["error"]["code"] == "PRODUCT_NOT_SELLABLE"

    empty = dish(db, kitchen["category"], "TRADA", "5000", [])
    assert sell(client, cashier, [(empty, 1)]).json()["error"]["code"] == "RECIPE_MISSING"


def test_cancel_restores_what_was_actually_used_even_after_recipe_change(
    client, cashier, manager, kitchen, db
):
    order = sell(client, cashier, [(kitchen["pho"], 2)]).json()
    # Đổi công thức sau khi bán: hủy đơn vẫn phải hoàn 300 g bò + 400 g bánh (lượng đã trừ), không phải công thức mới
    client.put(
        f"{PRODUCTS}/{kitchen['pho'].id}/recipe",
        headers=manager,
        json={"items": [{"ingredient_id": kitchen["beef"].id, "quantity": 999}]},
    )

    cancelled = client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Khách đổi ý"})

    assert cancelled.status_code == 200
    assert (stock(db, kitchen["beef"]), stock(db, kitchen["noodle"])) == (1000, 2000)
    db.expire_all()
    assert db.get(Inventory, kitchen["beef"].id).avg_cost == Decimal("180")  # hoàn theo giá vốn lúc bán


def test_returned_dish_is_refunded_but_never_restocked(client, cashier, kitchen, db):
    order = sell(client, cashier, [(kitchen["pho"], 2)]).json()
    line = order["items"][0]["id"]

    def give_back(condition):
        return client.post(
            f"{ORDERS}/{order['id']}/returns",
            headers={**cashier, "Idempotency-Key": str(uuid.uuid4())},
            json={
                "reason": "Món nguội",
                "items": [{"order_item_id": line, "quantity": 1, "condition": condition}],
            },
        )

    resold = give_back("RESELLABLE")
    assert resold.status_code == 422
    assert resold.json()["error"]["details"][0]["field"] == "items.0.condition"

    damaged = give_back("DAMAGED")
    assert damaged.status_code == 201 and damaged.json()["total_refund"] == "50000.00"
    assert stock(db, kitchen["beef"]) == 700  # vẫn trừ 300 g, không hoàn


def test_two_cashiers_race_for_the_last_portion(cashier, kitchen, db):
    set_stock(db, kitchen["beef"], 400, "180")  # bò đủ cho 2 tô (300 g)
    set_stock(db, kitchen["noodle"], 200, "20")  # nhưng bánh phở chỉ đủ 1 tô → đúng 1 thu ngân bán được

    results = _run_concurrently(
        "thungan",
        [
            (card_order((kitchen["pho"].id, 1)), uuid.uuid4()),
            (card_order((kitchen["pho"].id, 1)), uuid.uuid4()),
        ],
    )

    assert sorted(map(str, results))[-1] == "INSUFFICIENT_INGREDIENTS"
    assert len([r for r in results if isinstance(r, int)]) == 1
    assert (stock(db, kitchen["beef"]), stock(db, kitchen["noodle"])) == (250, 0)


# ---------- Nhập kho, tồn kho ----------


def test_purchase_in_kg_is_stocked_in_grams(client, manager, kitchen, db):
    beef = kitchen["beef"]
    beef.purchase_unit, beef.purchase_factor = "kg", 1000
    db.commit()
    supplier = make_supplier(db)

    draft = client.post(
        "/api/v1/purchases",
        headers=manager,
        json={
            "supplier_id": supplier.id,
            "items": [{"product_id": beef.id, "quantity": 2, "unit_cost": 200000}],
        },
    ).json()
    line = draft["items"][0]
    assert (line["quantity"], line["purchase_unit"], line["stock_quantity"], line["line_total"]) == (
        2,
        "kg",
        2000,
        "400000.00",
    )

    # Đổi quy đổi sau khi lập phiếu: phiếu đã chốt 1 kg = 1000 g
    beef.purchase_factor = 500
    db.commit()
    assert client.post(f"/api/v1/purchases/{draft['id']}/confirm", headers=manager).status_code == 200

    db.expire_all()
    inventory = db.get(Inventory, beef.id)
    # 1.000 g × 180 + 2.000 g × 200 → 3.000 g, giá vốn (180.000 + 400.000) / 3.000 = 193,33 ₫/g
    assert inventory.quantity == 3000
    assert inventory.avg_cost == Decimal("193.3333")


def test_dishes_have_no_stock_of_their_own(client, manager, kitchen, db):
    supplier = make_supplier(db)
    pho = kitchen["pho"]

    purchase = client.post(
        "/api/v1/purchases",
        headers=manager,
        json={
            "supplier_id": supplier.id,
            "items": [{"product_id": pho.id, "quantity": 1, "unit_cost": 1000}],
        },
    )
    assert purchase.status_code == 422

    adjustment = client.post(
        "/api/v1/inventory/adjustments",
        headers=manager,
        json={
            "type": "STOCKTAKE",
            "reason": "Kiểm kê",
            "items": [{"product_id": pho.id, "counted_quantity": 3}],
        },
    )
    assert adjustment.json()["error"]["code"] == "NOT_STOCKED"

    listed = {row["sku"] for row in client.get("/api/v1/inventory", headers=manager).json()["items"]}
    assert listed == {"BO", "BANHPHO"}
    low = client.get("/api/v1/reports/inventory", headers=manager, params={"low_stock": True}).json()
    assert "PHOBO" not in {row["sku"] for row in low["items"]}
    assert db.scalar(select(Product.min_stock).where(Product.id == pho.id)) == 0
