"""
Thiết lập cửa hàng bán bánh mì, xôi mặn "A Mập" trên database đang cấu hình (DATABASE_URL trong backend/.env).

    cd backend
    .\\.venv\\Scripts\\python.exe -m scripts.setup_food_store

Tạo bằng chính các nghiệp vụ của hệ thống (có nhật ký thao tác, sổ kho, giá vốn bình quân):
  - danh mục Bánh mì / Xôi / Nguyên liệu, ~18 nguyên liệu (đơn vị kho g / ml / cái, đơn vị nhập kg / vỉ / bịch…)
  - 9 món có công thức định lượng ƯỚC TÍNH (sửa lại theo quán ở trang chi tiết món)
  - nhóm tùy chọn: topping bánh mì, topping xôi, size xôi, tùy chỉnh (không rau / ớt…)
  - một phiếu nhập kho đầu kỳ đã xác nhận để bán thử ngay (bỏ qua bằng --no-opening-stock)
  - giữ đồ uống / sữa, ngừng kinh doanh hàng tạp hóa còn lại (không xóa dữ liệu, lịch sử đơn vẫn còn)
  - đổi tên cửa hàng in trên hóa đơn

Chạy lại nhiều lần an toàn: thứ gì đã có (theo SKU, tên nhóm, tên nhà cung cấp, ghi chú phiếu nhập) thì bỏ qua.
"""

import argparse
import sys
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Category, ModifierGroup, Product, PurchaseOrder, Supplier, User
from app.schemas.catalog import CategoryCreate, ProductCreate, RecipeUpdate
from app.schemas.modifier import GroupIn
from app.schemas.partner import SupplierCreate
from app.schemas.purchase import PurchaseCreate
from app.services import (
    catalog_service,
    modifier_service,
    partner_service,
    product_service,
    purchase_service,
    recipe_service,
    settings_service,
)

STORE_NAME = "A Mập"
OPENING_NOTE = "Nhập kho đầu kỳ (setup_food_store)"
SUPPLIER_NAME = "Chợ đầu mối Bình Điền"
# Danh mục hàng cũ vẫn bán kèm (kể cả danh mục con)
KEEP_CATEGORIES = {"Đồ uống", "Sữa"}


@dataclass(frozen=True)
class Ingredient:
    sku: str
    name: str
    unit: str
    purchase_unit: str | None
    factor: int
    min_stock: int
    opening: int  # số lượng nhập đầu kỳ, theo đơn vị nhập
    cost: int  # giá nhập 1 đơn vị nhập (đồng)


INGREDIENTS = [
    Ingredient("NL-BANHMI", "Ổ bánh mì", "cái", "bịch", 10, 20, 10, 30_000),
    Ingredient("NL-TRUNG", "Trứng gà", "quả", "vỉ", 30, 30, 4, 90_000),
    Ingredient("NL-TRUNGCUT", "Trứng cút luộc", "quả", "hộp", 50, 50, 4, 40_000),
    Ingredient("NL-CHALUA", "Chả lụa", "g", "kg", 1000, 500, 4, 160_000),
    Ingredient("NL-THITNGUOI", "Thịt nguội", "g", "kg", 1000, 300, 2, 160_000),
    Ingredient("NL-PATE", "Pate gan", "g", "kg", 1000, 300, 2, 120_000),
    Ingredient("NL-XIUMAI", "Xíu mại", "viên", "khay", 50, 30, 4, 150_000),
    Ingredient("NL-HEOQUAY", "Heo quay", "g", "kg", 1000, 300, 2, 260_000),
    Ingredient("NL-DOCHUA", "Đồ chua (cà rốt, củ cải)", "g", "kg", 1000, 500, 3, 30_000),
    Ingredient("NL-RAU", "Rau thơm, dưa leo", "g", "kg", 1000, 300, 2, 40_000),
    Ingredient("NL-NUOCSOT", "Nước sốt, tương ớt", "ml", "chai", 500, 200, 4, 25_000),
    Ingredient("NL-NEP", "Gạo nếp", "g", "kg", 1000, 2000, 10, 32_000),
    Ingredient("NL-LAPXUONG", "Lạp xưởng", "g", "kg", 1000, 300, 2, 220_000),
    Ingredient("NL-CHABONG", "Chà bông", "g", "kg", 1000, 200, 1, 300_000),
    Ingredient("NL-GA", "Gà luộc xé", "g", "kg", 1000, 500, 3, 150_000),
    Ingredient("NL-HANHPHI", "Hành phi, mỡ hành", "g", "kg", 1000, 200, 1, 120_000),
    Ingredient("NL-TUI", "Túi giấy bánh mì", "cái", "xấp", 100, 50, 3, 30_000),
    Ingredient("NL-HOP", "Hộp xốp đựng xôi", "cái", "lốc", 100, 50, 3, 60_000),
]

BANH_MI_BASE = [("NL-BANHMI", 1), ("NL-DOCHUA", 30), ("NL-RAU", 10), ("NL-NUOCSOT", 10), ("NL-TUI", 1)]
XOI_BASE = [("NL-NEP", 120), ("NL-HANHPHI", 10), ("NL-HOP", 1)]

# (SKU, tên, danh mục, đơn vị, giá bán, công thức cho 1 phần)
DISHES = [
    (
        "BM-THIT",
        "Bánh mì thịt",
        "Bánh mì",
        "ổ",
        25_000,
        [*BANH_MI_BASE, ("NL-CHALUA", 25), ("NL-THITNGUOI", 20), ("NL-PATE", 15)],
    ),
    (
        "BM-TRUNG",
        "Bánh mì trứng ốp la",
        "Bánh mì",
        "ổ",
        20_000,
        [*BANH_MI_BASE, ("NL-TRUNG", 2), ("NL-PATE", 10)],
    ),
    ("BM-XIUMAI", "Bánh mì xíu mại", "Bánh mì", "ổ", 25_000, [*BANH_MI_BASE, ("NL-XIUMAI", 3)]),
    (
        "BM-CHALUA",
        "Bánh mì chả lụa",
        "Bánh mì",
        "ổ",
        20_000,
        [*BANH_MI_BASE, ("NL-CHALUA", 40), ("NL-PATE", 10)],
    ),
    (
        "BM-HEOQUAY",
        "Bánh mì heo quay",
        "Bánh mì",
        "ổ",
        30_000,
        [*BANH_MI_BASE, ("NL-HEOQUAY", 50), ("NL-PATE", 10)],
    ),
    (
        "XOI-THAPCAM",
        "Xôi mặn thập cẩm",
        "Xôi",
        "hộp",
        30_000,
        [*XOI_BASE, ("NL-LAPXUONG", 20), ("NL-CHALUA", 20), ("NL-CHABONG", 10), ("NL-TRUNGCUT", 2)],
    ),
    ("XOI-GA", "Xôi gà xé", "Xôi", "hộp", 35_000, [*XOI_BASE, ("NL-GA", 70)]),
    ("XOI-XIUMAI", "Xôi xíu mại", "Xôi", "hộp", 30_000, [*XOI_BASE, ("NL-XIUMAI", 2)]),
    ("XOI-PATE", "Xôi pate trứng", "Xôi", "hộp", 25_000, [*XOI_BASE, ("NL-PATE", 20), ("NL-TRUNG", 1)]),
]

# (tên nhóm, tối thiểu, tối đa, [(lựa chọn, giá cộng thêm, [(nguyên liệu, lượng)])])
GROUPS = [
    (
        "Topping bánh mì",
        0,
        3,
        [
            ("Thêm trứng", 5_000, [("NL-TRUNG", 1)]),
            ("Thêm pate", 5_000, [("NL-PATE", 15)]),
            ("Thêm chả", 7_000, [("NL-CHALUA", 25)]),
        ],
    ),
    ("Size xôi", 1, 1, [("Vừa", 0, []), ("Lớn", 10_000, [("NL-NEP", 60)])]),
    (
        "Topping xôi",
        0,
        3,
        [
            ("Thêm trứng cút", 5_000, [("NL-TRUNGCUT", 3)]),
            ("Thêm lạp xưởng", 7_000, [("NL-LAPXUONG", 20)]),
            ("Thêm chà bông", 5_000, [("NL-CHABONG", 10)]),
        ],
    ),
    (
        "Tùy chỉnh",
        0,
        4,
        [("Không rau", 0, []), ("Không ớt", 0, []), ("Không đồ chua", 0, []), ("Không hành", 0, [])],
    ),
]
GROUPS_BY_CATEGORY = {
    "Bánh mì": ["Topping bánh mì", "Tùy chỉnh"],
    "Xôi": ["Size xôi", "Topping xôi", "Tùy chỉnh"],
}


def _category(db: Session, name: str, actor: User, log: list[str]) -> int:
    existing = db.scalar(select(Category.id).where(Category.name == name, Category.parent_id.is_(None)))
    if existing:
        return existing
    log.append(f"+ danh mục {name}")
    return catalog_service.create_category(db, CategoryCreate(name=name), actor, None).id


def _product_id(db: Session, sku: str) -> int | None:
    return db.scalar(select(Product.id).where(Product.sku == sku))


def setup(db: Session, actor: User, *, opening_stock: bool = True) -> list[str]:
    """Trả về danh sách thay đổi đã làm (rỗng nếu đã thiết lập đủ từ trước)."""
    log: list[str] = []

    # 1. Nguyên liệu
    ingredients_category = _category(db, "Nguyên liệu", actor, log)
    ids: dict[str, int] = {}
    for ing in INGREDIENTS:
        product_id = _product_id(db, ing.sku)
        if product_id is None:
            product_id = product_service.create_product(
                db,
                ProductCreate(
                    sku=ing.sku,
                    name=ing.name,
                    category_id=ingredients_category,
                    unit=ing.unit,
                    sale_price=Decimal(0),
                    min_stock=ing.min_stock,
                    kind="INGREDIENT",
                    purchase_unit=ing.purchase_unit,
                    purchase_factor=ing.factor,
                ),
                actor,
                None,
            ).id
            log.append(f"+ nguyên liệu {ing.name}")
        ids[ing.sku] = product_id

    # 2. Món + công thức
    for sku, name, category_name, unit, price, recipe in DISHES:
        if _product_id(db, sku) is not None:
            continue
        dish = product_service.create_product(
            db,
            ProductCreate(
                sku=sku,
                name=name,
                category_id=_category(db, category_name, actor, log),
                unit=unit,
                sale_price=Decimal(price),
                kind="DISH",
            ),
            actor,
            None,
        )
        recipe_service.set_recipe(
            db,
            dish,
            RecipeUpdate(items=[{"ingredient_id": ids[s], "quantity": q} for s, q in recipe]),
            actor,
            None,
        )
        log.append(f"+ món {name} ({price:,}đ)".replace(",", "."))

    # 3. Nhóm tùy chọn, gắn vào món theo danh mục (chỉ gắn cho món chưa có nhóm nào)
    group_ids: dict[str, int] = {}
    for group_name, min_select, max_select, options in GROUPS:
        group_id = db.scalar(select(ModifierGroup.id).where(ModifierGroup.name == group_name))
        if group_id is None:
            group_id = modifier_service.save_group(
                db,
                None,
                GroupIn(
                    name=group_name,
                    min_select=min_select,
                    max_select=max_select,
                    options=[
                        {
                            "name": option,
                            "price_delta": Decimal(delta),
                            "ingredients": [{"ingredient_id": ids[s], "quantity": q} for s, q in extra],
                        }
                        for option, delta, extra in options
                    ],
                ),
                actor,
                None,
            ).id
            log.append(f"+ nhóm tùy chọn {group_name}")
        group_ids[group_name] = group_id
    for sku, _, category_name, *_ in DISHES:
        dish = db.get(Product, _product_id(db, sku))
        if not dish.modifier_links:
            modifier_service.set_product_groups(
                db, dish, [group_ids[g] for g in GROUPS_BY_CATEGORY[category_name]], actor, None
            )

    # 4. Phiếu nhập đầu kỳ (đã xác nhận → có tồn và giá vốn để bán thử)
    if (
        opening_stock
        and db.scalar(select(PurchaseOrder.id).where(PurchaseOrder.note == OPENING_NOTE)) is None
    ):
        supplier_id = db.scalar(select(Supplier.id).where(Supplier.name == SUPPLIER_NAME))
        if supplier_id is None:
            supplier_id = partner_service.create_supplier(
                db, SupplierCreate(name=SUPPLIER_NAME), actor, None
            ).id
        purchase = purchase_service.create_purchase(
            db,
            PurchaseCreate(
                supplier_id=supplier_id,
                note=OPENING_NOTE,
                items=[
                    {"product_id": ids[i.sku], "quantity": i.opening, "unit_cost": Decimal(i.cost)}
                    for i in INGREDIENTS
                ],
            ),
            actor,
            None,
        )
        purchase_service.confirm_purchase(db, purchase.id, actor, None)
        log.append(f"+ phiếu nhập đầu kỳ {purchase.code} (đã xác nhận)")

    # 5. Hàng tạp hóa cũ: giữ đồ uống / sữa, ngừng kinh doanh phần còn lại (không xóa)
    keep = set(db.scalars(select(Category.id).where(Category.name.in_(KEEP_CATEGORIES))))
    keep |= set(db.scalars(select(Category.id).where(Category.parent_id.in_(keep))))
    keep |= {_category(db, n, actor, log) for n in ("Bánh mì", "Xôi", "Nguyên liệu")}
    for product in (
        db.scalars(select(Product).where(Product.is_active.is_(True), Product.category_id.not_in(keep)))
        .unique()
        .all()
    ):
        product_service.update_product(db, product.id, {"is_active": False}, actor, None)
        log.append(f"- ngừng kinh doanh {product.name}")
    # Danh mục không còn dùng: ẩn khỏi bộ lọc ở quầy (danh mục con trước, cha sau)
    retired = db.scalars(
        select(Category)
        .where(Category.is_active.is_(True), Category.id.not_in(keep))
        .order_by(Category.parent_id.is_(None))
    ).all()
    for category in retired:
        catalog_service.update_category(db, category.id, {"is_active": False}, actor, None)
        log.append(f"- ẩn danh mục {category.name}")

    # 6. Tên cửa hàng trên hóa đơn
    if settings_service.get_value(db, "store_name") != STORE_NAME:
        settings_service.update_settings(db, {"store_name": STORE_NAME}, actor, None)
        log.append(f"~ tên cửa hàng: {STORE_NAME}")
    return log


def food_cost_table(db: Session) -> list[str]:
    rows = []
    for sku, *_ in DISHES:
        dish = db.get(Product, _product_id(db, sku))
        cost = recipe_service.estimated_cost(dish)
        percent = cost / dish.sale_price * 100 if dish.sale_price else Decimal(0)
        rows.append(
            f"  {dish.name:<24} giá {int(dish.sale_price):>7,}  vốn ~{int(cost):>7,}  ({percent:.0f}%)"
            f"  còn làm được {recipe_service.portions_available(dish)}".replace(",", ".")
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--admin", default="admin", help="Tài khoản thực hiện (ghi vào nhật ký thao tác)")
    parser.add_argument("--no-opening-stock", action="store_true", help="Không tạo phiếu nhập đầu kỳ")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    with SessionLocal() as db:
        actor = db.scalar(select(User).where(User.username == args.admin))
        if actor is None:
            print(f"Không tìm thấy tài khoản {args.admin!r}")
            return 1
        log = setup(db, actor, opening_stock=not args.no_opening_stock)
        print("\n".join(log) if log else "Đã thiết lập đủ từ trước — không có gì thay đổi.")
        print("\nThực đơn (giá vốn ước tính theo công thức):")
        print("\n".join(food_cost_table(db)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
