"""Tùy chọn món (size, topping): nhóm dùng chung, giá cộng thêm, nguyên liệu trừ thêm, chụp lại khi bán."""

import uuid

import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog, Inventory, ModifierOption
from tests.factories import make_category, make_product, set_stock
from tests.integration.test_recipes import dish, ingredient

pytestmark = pytest.mark.usefixtures("open_shift")

GROUPS = "/api/v1/modifier-groups"
PRODUCTS = "/api/v1/products"
ORDERS = "/api/v1/orders"


@pytest.fixture
def cashier(auth_headers):
    return auth_headers(RoleCode.CASHIER, username="thungan")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


@pytest.fixture
def menu(db):
    """Phở bò 50.000 ₫ = 150 g bò (180 ₫/g). Trứng 3.000 ₫/quả."""
    category = make_category(db, "Quán")
    beef = ingredient(db, category, "BO", "g", 1000, "180")
    egg = ingredient(db, category, "TRUNG", "quả", 10, "3000")
    pho = dish(db, category, "PHOBO", "50000", [(beef, 150)])
    bun = dish(db, category, "BUNBO", "45000", [(beef, 100)])
    water = make_product(db, category, "NUOC", sale_price="10000")
    set_stock(db, water, 10, "4000")
    return {"beef": beef, "egg": egg, "pho": pho, "bun": bun, "water": water}


def create_group(client, headers, body):
    return client.post(GROUPS, headers=headers, json=body)


@pytest.fixture
def groups(client, manager, menu):
    """Size (bắt buộc chọn 1): Vừa / Lớn +10.000 (+50 g bò). Topping (0–2): Thêm trứng +5.000 (1 quả), Không hành."""
    size = create_group(
        client,
        manager,
        {
            "name": "Size",
            "min_select": 1,
            "max_select": 1,
            "options": [
                {"name": "Vừa"},
                {
                    "name": "Lớn",
                    "price_delta": 10000,
                    "ingredients": [{"ingredient_id": menu["beef"].id, "quantity": 50}],
                },
            ],
        },
    ).json()
    topping = create_group(
        client,
        manager,
        {
            "name": "Topping",
            "min_select": 0,
            "max_select": 2,
            "options": [
                {
                    "name": "Thêm trứng",
                    "price_delta": 5000,
                    "ingredients": [{"ingredient_id": menu["egg"].id, "quantity": 1}],
                },
                {"name": "Không hành"},
            ],
        },
    ).json()
    for product in (menu["pho"], menu["bun"]):
        response = client.put(
            f"{PRODUCTS}/{product.id}/modifier-groups",
            headers=manager,
            json={"group_ids": [size["id"], topping["id"]]},
        )
        assert response.status_code == 200
    opt = {o["name"]: o["id"] for g in (size, topping) for o in g["options"]}
    return {"size": size, "topping": topping, "opt": opt}


def sell(client, headers, lines):
    return client.post(
        ORDERS,
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
        json={
            "items": [{"product_id": p.id, "quantity": q, "option_ids": ids} for p, q, ids in lines],
            "payment": {"method": "CASH", "cash_received": 1_000_000},
        },
    )


def stock(db, product) -> int:
    db.expire_all()
    return db.get(Inventory, product.id).quantity


# ---------- Khai báo ----------


def test_groups_are_shared_by_dishes_and_shown_on_the_product(client, manager, cashier, menu, groups):
    listed = {g["name"]: g for g in client.get(GROUPS, headers=cashier).json()}
    assert listed["Size"]["dish_count"] == 2  # dùng chung cho phở và bún
    assert listed["Size"]["options"][1]["ingredients"][0]["ingredient"]["sku"] == "BO"

    pho = client.get(f"{PRODUCTS}/{menu['pho'].id}", headers=cashier).json()
    assert [
        (g["name"], g["min_select"], [o["name"] for o in g["options"]]) for g in pho["modifier_groups"]
    ] == [
        ("Size", 1, ["Vừa", "Lớn"]),
        ("Topping", 0, ["Thêm trứng", "Không hành"]),
    ]
    assert create_group(client, cashier, {"name": "X", "options": [{"name": "A"}]}).status_code == 403


@pytest.mark.parametrize(
    "body",
    [
        {"name": "Size", "min_select": 2, "max_select": 1, "options": [{"name": "A"}, {"name": "B"}]},
        {"name": "Size", "min_select": 3, "max_select": 3, "options": [{"name": "A"}, {"name": "B"}]},
        {"name": "Size", "options": [{"name": "Lớn"}, {"name": "lớn"}]},  # trùng tên
        {"name": "Size", "options": [{"name": "A", "price_delta": 1500.5}]},  # lẻ đồng
    ],
)
def test_invalid_groups(client, manager, body):
    assert create_group(client, manager, body).status_code == 422


def test_dish_cannot_be_an_option_ingredient_and_goods_take_no_options(client, manager, menu, groups):
    bad = create_group(
        client,
        manager,
        {
            "name": "X",
            "options": [{"name": "A", "ingredients": [{"ingredient_id": menu["bun"].id, "quantity": 1}]}],
        },
    )
    assert bad.status_code == 422

    goods = client.put(
        f"{PRODUCTS}/{menu['water'].id}/modifier-groups",
        headers=manager,
        json={"group_ids": [groups["size"]["id"]]},
    )
    assert goods.json()["error"]["code"] == "NOT_A_DISH"


def test_removed_option_is_deactivated_not_deleted(client, manager, cashier, menu, groups, db):
    order = sell(client, cashier, [(menu["pho"], 1, [groups["opt"]["Lớn"]])]).json()
    size = groups["size"]

    updated = client.put(
        f"{GROUPS}/{size['id']}",
        headers=manager,
        json={
            "name": "Size",
            "min_select": 1,
            "max_select": 1,
            "options": [
                {"id": groups["opt"]["Vừa"], "name": "Vừa"},
                {"name": "Đặc biệt", "price_delta": 20000},
            ],
        },
    )

    assert updated.status_code == 200
    assert [o["name"] for o in updated.json()["options"]] == ["Vừa", "Đặc biệt"]
    assert db.get(ModifierOption, groups["opt"]["Lớn"]).is_active is False  # đơn cũ vẫn tham chiếu được
    detail = client.get(f"{ORDERS}/{order['id']}", headers=manager).json()
    assert detail["items"][0]["options"] == [
        {"group_name": "Size", "option_name": "Lớn", "price_delta": "10000.00"}
    ]
    assert sell(client, cashier, [(menu["pho"], 1, [groups["opt"]["Lớn"]])]).status_code == 422
    assert db.scalar(select(AuditLog.action).where(AuditLog.action == "MODIFIER_GROUP_UPDATE")) is not None


# ---------- Bán ----------


def test_options_add_to_price_cost_and_ingredients(client, cashier, manager, menu, groups, db):
    opt = groups["opt"]
    response = sell(
        client,
        cashier,
        [
            (menu["pho"], 2, [opt["Lớn"], opt["Thêm trứng"]]),
            (menu["pho"], 1, [opt["Vừa"], opt["Không hành"]]),  # cùng món khác lựa chọn → dòng riêng
        ],
    )

    assert response.status_code == 201
    order = client.get(f"{ORDERS}/{response.json()['id']}", headers=manager).json()
    big, normal = order["items"]
    assert (big["unit_price"], big["line_subtotal"]) == ("65000.00", "130000.00")  # 50.000 + 10.000 + 5.000
    # Giá vốn: (150 + 50) g bò × 180 + 1 trứng × 3.000 = 39.000
    assert big["unit_cost"] == "39000.0000"
    assert [o["option_name"] for o in big["options"]] == ["Lớn", "Thêm trứng"]
    assert (normal["unit_price"], normal["unit_cost"]) == ("50000.00", "27000.0000")
    assert order["total_amount"] == "180000.00"
    # Bò: 2 × 200 + 150 = 550 g; trứng: 2 quả
    assert (stock(db, menu["beef"]), stock(db, menu["egg"])) == (450, 8)

    ticket = client.get("/api/v1/kitchen/tickets", headers=cashier).json()[0]
    assert [i["options"] for i in ticket["items"]] == [["Lớn", "Thêm trứng"], ["Vừa", "Không hành"]]

    client.post(f"{ORDERS}/{order['id']}/cancel", headers=manager, json={"reason": "Khách đổi ý"})
    assert (stock(db, menu["beef"]), stock(db, menu["egg"])) == (1000, 10)  # hoàn cả nguyên liệu của lựa chọn


@pytest.mark.parametrize(
    ("case", "message"),
    [
        ("missing_required", "Chọn Size cho Sản phẩm PHOBO"),
        ("too_many_in_group", "Size: chọn tối đa 1"),
        ("goods_with_option", "Sản phẩm này không có tùy chọn"),
        ("unknown_option", "Có lựa chọn không thuộc món này hoặc đã ngừng dùng"),
    ],
)
def test_option_rules_are_checked_on_the_server(client, cashier, menu, groups, case, message):
    opt = groups["opt"]
    product, ids = {
        "missing_required": (menu["pho"], [opt["Thêm trứng"]]),
        "too_many_in_group": (menu["pho"], [opt["Vừa"], opt["Lớn"]]),
        "goods_with_option": (menu["water"], [opt["Vừa"]]),
        "unknown_option": (menu["pho"], [999999]),
    }[case]

    response = sell(client, cashier, [(product, 1, ids)])

    assert response.status_code == 422
    assert response.json()["error"]["details"][0] == {"field": "items.0.option_ids", "message": message}


def test_line_price_cannot_go_negative_and_duplicate_lines_are_rejected(
    client, manager, cashier, menu, groups
):
    cheap = create_group(
        client, manager, {"name": "Khuyến mãi", "options": [{"name": "Giảm sâu", "price_delta": -60000}]}
    ).json()
    client.put(
        f"{PRODUCTS}/{menu['bun'].id}/modifier-groups",
        headers=manager,
        json={"group_ids": [groups["size"]["id"], cheap["id"]]},
    )
    opt = groups["opt"]

    negative = sell(client, cashier, [(menu["bun"], 1, [opt["Vừa"], cheap["options"][0]["id"]])])
    duplicate = sell(client, cashier, [(menu["pho"], 1, [opt["Vừa"]]), (menu["pho"], 2, [opt["Vừa"]])])

    assert negative.json()["error"]["details"][0]["message"] == "Giá món sau khi trừ tùy chọn không được âm"
    assert duplicate.status_code == 422
