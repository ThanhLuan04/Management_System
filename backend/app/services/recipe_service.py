"""
Công thức định lượng của món ăn.

- Món (DISH) không có tồn riêng: bán 1 phần thì trừ các nguyên liệu theo công thức.
- Lượng nguyên liệu là SỐ NGUYÊN theo đơn vị kho của nguyên liệu (g, ml, cái) → không có sai số làm tròn khi trừ kho.
- Giá vốn món = Σ(lượng × giá vốn bình quân hiện tại của nguyên liệu), chốt vào dòng đơn lúc bán.
"""

from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Product, ProductKind, RecipeItem, User
from app.schemas.catalog import RecipeUpdate
from app.services import audit_service
from app.services.pricing import round_cost


def portions_available(dish: Product) -> int:
    """Số phần còn làm được với lượng nguyên liệu trong kho (chỉ để hiển thị — lúc bán kiểm tra lại trên dòng đã khóa)."""
    if not dish.recipe:
        return 0
    return min(line.ingredient.inventory.quantity // line.quantity for line in dish.recipe)


def estimated_cost(dish: Product) -> Decimal:
    return round_cost(
        sum((line.quantity * line.ingredient.inventory.avg_cost for line in dish.recipe), Decimal("0"))
    )


def stock_needs(lines: list[tuple[Product, int]]) -> dict[int, int]:
    """Tổng lượng cần trừ theo từng sản phẩm có tồn: hàng hóa trừ chính nó, món trừ nguyên liệu (cộng dồn các món)."""
    needs: dict[int, int] = defaultdict(int)
    for product, quantity in lines:
        if product.kind == ProductKind.DISH:
            for line in product.recipe:
                needs[line.ingredient_id] += line.quantity * quantity
        else:
            needs[product.id] += quantity
    return dict(needs)


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


def _snapshot(dish: Product) -> list[dict]:
    return [{"ingredient_id": line.ingredient_id, "quantity": line.quantity} for line in dish.recipe]


def set_recipe(db: Session, dish: Product, data: RecipeUpdate, actor: User, ip: str | None) -> Product:
    if dish.kind != ProductKind.DISH:
        raise AppError("NOT_A_DISH", "Chỉ món ăn mới có công thức định lượng", 409)

    ids = [line.ingredient_id for line in data.items]
    for index, ingredient_id in enumerate(ids):
        if ids.index(ingredient_id) != index:
            raise _field_error(f"items.{index}.ingredient_id", "Nguyên liệu bị lặp — gộp thành một dòng")
        ingredient = db.get(Product, ingredient_id)
        if ingredient is None:
            raise _field_error(f"items.{index}.ingredient_id", "Nguyên liệu không tồn tại")
        if ingredient.kind not in ProductKind.STOCKED or ingredient.id == dish.id:
            # Không lồng món trong món: giữ việc trừ kho một cấp, dễ kiểm tra
            raise _field_error(
                f"items.{index}.ingredient_id", "Chỉ dùng nguyên liệu hoặc hàng hóa có tồn kho"
            )

    before = _snapshot(dish)
    dish.recipe.clear()
    # Xóa dòng cũ trước khi thêm dòng mới: cùng nguyên liệu sẽ vướng unique (dish_id, ingredient_id)
    db.flush()
    dish.recipe.extend(
        RecipeItem(ingredient_id=line.ingredient_id, quantity=line.quantity) for line in data.items
    )
    db.flush()

    after = [{"ingredient_id": line.ingredient_id, "quantity": line.quantity} for line in data.items]
    if before != after:
        audit_service.record(
            db,
            action="RECIPE_UPDATE",
            user_id=actor.id,
            entity_type="product",
            entity_id=dish.id,
            old_values={"recipe": before},
            new_values={"recipe": after},
            ip_address=ip,
        )
    db.commit()
    db.expire_all()
    return db.get(Product, dish.id)
