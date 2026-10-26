import pytest

from app.core.permissions import RoleCode

CATEGORIES = "/api/v1/categories"
BRANDS = "/api/v1/brands"
PRODUCTS = "/api/v1/products"


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER)


def create_category(client, headers, name, parent_id=None):
    response = client.post(CATEGORIES, headers=headers, json={"name": name, "parent_id": parent_id})
    assert response.status_code == 201, response.text
    return response.json()


# ---------- Danh mục ----------


def test_create_two_level_categories_and_tree(client, manager):
    drinks = create_category(client, manager, "Đồ uống")
    create_category(client, manager, "Nước ngọt", drinks["id"])
    create_category(client, manager, "Bánh kẹo")

    tree = client.get(CATEGORIES, headers=manager, params={"tree": True}).json()

    assert [c["name"] for c in tree] == ["Bánh kẹo", "Đồ uống"]
    assert [c["name"] for c in tree[1]["children"]] == ["Nước ngọt"]
    assert tree[1]["children"][0]["parent_name"] == "Đồ uống"


def test_third_level_category_is_rejected(client, manager):
    root = create_category(client, manager, "Đồ uống")
    child = create_category(client, manager, "Nước ngọt", root["id"])

    response = client.post(CATEGORIES, headers=manager, json={"name": "Cola", "parent_id": child["id"]})

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "parent_id"


def test_category_name_unique_within_same_parent_only(client, manager):
    a = create_category(client, manager, "Nhóm A")
    b = create_category(client, manager, "Nhóm B")
    create_category(client, manager, "Khác", a["id"])

    same_parent = client.post(CATEGORIES, headers=manager, json={"name": "KHÁC", "parent_id": a["id"]})
    other_parent = client.post(CATEGORIES, headers=manager, json={"name": "Khác", "parent_id": b["id"]})
    duplicate_root = client.post(CATEGORIES, headers=manager, json={"name": "nhóm a"})

    assert same_parent.status_code == 409
    assert same_parent.json()["error"]["code"] == "DUPLICATE_CATEGORY"
    assert other_parent.status_code == 201
    assert duplicate_root.status_code == 409


def test_parent_with_children_cannot_become_child(client, manager):
    a = create_category(client, manager, "A")
    create_category(client, manager, "A1", a["id"])
    b = create_category(client, manager, "B")

    response = client.patch(f"{CATEGORIES}/{a['id']}", headers=manager, json={"parent_id": b["id"]})

    assert response.status_code == 422


def test_cannot_deactivate_category_with_active_products(client, manager):
    category = create_category(client, manager, "Sữa")
    product = client.post(
        PRODUCTS,
        headers=manager,
        json={
            "sku": "SUA-1",
            "name": "Sữa",
            "category_id": category["id"],
            "unit": "hộp",
            "sale_price": 10000,
        },
    ).json()

    blocked = client.patch(f"{CATEGORIES}/{category['id']}", headers=manager, json={"is_active": False})
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "CATEGORY_IN_USE"

    client.patch(f"{PRODUCTS}/{product['id']}", headers=manager, json={"is_active": False})
    allowed = client.patch(f"{CATEGORIES}/{category['id']}", headers=manager, json={"is_active": False})
    assert allowed.status_code == 200
    assert allowed.json()["is_active"] is False


def test_category_product_count(client, manager):
    category = create_category(client, manager, "Sữa")
    for sku in ("A", "B"):
        client.post(
            PRODUCTS,
            headers=manager,
            json={"sku": sku, "name": sku, "category_id": category["id"], "unit": "hộp", "sale_price": 1000},
        )

    assert client.get(f"{CATEGORIES}/{category['id']}", headers=manager).json()["product_count"] == 2


def test_cashier_can_view_but_not_manage_catalog(client, auth_headers, manager):
    create_category(client, manager, "Sữa")
    cashier = auth_headers(RoleCode.CASHIER)

    assert client.get(CATEGORIES, headers=cashier).status_code == 200
    assert client.get(BRANDS, headers=cashier).status_code == 200
    assert client.post(CATEGORIES, headers=cashier, json={"name": "X"}).status_code == 403
    assert client.post(BRANDS, headers=cashier, json={"name": "X"}).status_code == 403


# ---------- Thương hiệu ----------


def test_brand_create_update_and_duplicate(client, manager):
    created = client.post(BRANDS, headers=manager, json={"name": "Vinamilk"})
    assert created.status_code == 201

    duplicate = client.post(BRANDS, headers=manager, json={"name": "  VINAMILK "})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DUPLICATE_BRAND"

    updated = client.patch(f"{BRANDS}/{created.json()['id']}", headers=manager, json={"is_active": False})
    assert updated.json()["is_active"] is False
    assert client.get(BRANDS, headers=manager, params={"is_active": True}).json() == []
