"""Nhóm tùy chọn món (size, topping) dùng chung cho nhiều món, và kiểm tra lựa chọn khi bán."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    ModifierGroup,
    ModifierOption,
    ModifierOptionIngredient,
    Product,
    ProductKind,
    ProductModifierGroup,
    User,
)
from app.schemas.modifier import GroupIn, GroupOut, GroupRef, OptionOut, OptionRef
from app.services import audit_service


def _field_error(field: str, message: str) -> AppError:
    return AppError("VALIDATION_ERROR", "Dữ liệu không hợp lệ", 422, [{"field": field, "message": message}])


def active_options(group: ModifierGroup) -> list[ModifierOption]:
    return [o for o in group.options if o.is_active]


def to_out(group: ModifierGroup, dish_count: int) -> GroupOut:
    return GroupOut(
        id=group.id,
        name=group.name,
        min_select=group.min_select,
        max_select=group.max_select,
        is_active=group.is_active,
        options=[
            OptionOut(
                id=o.id,
                name=o.name,
                price_delta=o.price_delta,
                ingredients=[
                    {
                        "ingredient": {
                            "id": i.ingredient.id,
                            "sku": i.ingredient.sku,
                            "name": i.ingredient.name,
                            "unit": i.ingredient.unit,
                        },
                        "quantity": i.quantity,
                    }
                    for i in o.ingredients
                ],
            )
            for o in active_options(group)
        ],
        dish_count=dish_count,
    )


def product_groups(product: Product) -> list[GroupRef]:
    """Nhóm đang dùng của món (bỏ nhóm đã ngừng) — để quầy hiện hộp chọn."""
    return [
        GroupRef(
            id=link.group.id,
            name=link.group.name,
            min_select=link.group.min_select,
            max_select=link.group.max_select,
            options=[
                OptionRef(id=o.id, name=o.name, price_delta=o.price_delta) for o in active_options(link.group)
            ],
        )
        for link in product.modifier_links
        if link.group.is_active
    ]


def dish_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(ProductModifierGroup.group_id, func.count()).group_by(ProductModifierGroup.group_id)
    ).all()
    return dict(rows)


def list_groups(db: Session) -> list[ModifierGroup]:
    return list(db.scalars(select(ModifierGroup).order_by(ModifierGroup.name)))


def get_group(db: Session, group_id: int) -> ModifierGroup:
    group = db.get(ModifierGroup, group_id)
    if group is None:
        raise AppError("NOT_FOUND", "Không tìm thấy nhóm tùy chọn", 404)
    return group


def _validate_ingredients(db: Session, data: GroupIn) -> None:
    for oi, option in enumerate(data.options):
        for ii, line in enumerate(option.ingredients):
            ingredient = db.get(Product, line.ingredient_id)
            if ingredient is None or ingredient.kind not in ProductKind.STOCKED:
                raise _field_error(
                    f"options.{oi}.ingredients.{ii}.ingredient_id",
                    "Chỉ dùng nguyên liệu hoặc hàng hóa có tồn kho",
                )


def _summary(group: ModifierGroup) -> dict:
    return {
        "name": group.name,
        "min_select": group.min_select,
        "max_select": group.max_select,
        "is_active": group.is_active,
        "options": [{"name": o.name, "price_delta": o.price_delta} for o in active_options(group)],
    }


def save_group(
    db: Session, group_id: int | None, data: GroupIn, actor: User, ip: str | None
) -> ModifierGroup:
    _validate_ingredients(db, data)
    if group_id is None:
        group = ModifierGroup()
        db.add(group)
        before = None
    else:
        group = get_group(db, group_id)
        before = _summary(group)

    group.name, group.min_select, group.max_select, group.is_active = (
        data.name,
        data.min_select,
        data.max_select,
        data.is_active,
    )
    existing = {o.id: o for o in group.options}
    keep: set[int] = set()
    for index, item in enumerate(data.options):
        if item.id is not None:
            option = existing.get(item.id)
            if option is None:
                raise _field_error(f"options.{index}.id", "Lựa chọn không thuộc nhóm này")
            keep.add(option.id)
        else:
            option = ModifierOption()
            group.options.append(option)
        option.name, option.price_delta, option.sort_order, option.is_active = (
            item.name,
            item.price_delta,
            index,
            True,
        )
        option.ingredients.clear()
        db.flush()  # xóa nguyên liệu cũ trước khi thêm lại (unique lựa chọn + nguyên liệu)
        option.ingredients.extend(
            ModifierOptionIngredient(ingredient_id=i.ingredient_id, quantity=i.quantity)
            for i in item.ingredients
        )
    # Lựa chọn bị bỏ khỏi danh sách: ngừng dùng chứ không xóa (dòng đơn cũ còn tham chiếu)
    for option_id, option in existing.items():
        if option_id not in keep:
            option.is_active = False
    db.flush()

    db.refresh(group)
    after = _summary(group)
    if before != after:
        audit_service.record(
            db,
            action="MODIFIER_GROUP_CREATE" if before is None else "MODIFIER_GROUP_UPDATE",
            user_id=actor.id,
            entity_type="modifier_group",
            entity_id=group.id,
            old_values=before,
            new_values=after,
            ip_address=ip,
        )
    db.commit()
    db.expire_all()
    return get_group(db, group.id)


def set_product_groups(
    db: Session, product: Product, group_ids: list[int], actor: User, ip: str | None
) -> Product:
    if product.kind != ProductKind.DISH:
        raise AppError("NOT_A_DISH", "Chỉ món ăn mới có tùy chọn", 409)
    for index, group_id in enumerate(group_ids):
        group = db.get(ModifierGroup, group_id)
        if group is None or not group.is_active:
            raise _field_error(f"group_ids.{index}", "Nhóm tùy chọn không tồn tại hoặc đã ngừng dùng")

    before = [link.group_id for link in product.modifier_links]
    product.modifier_links.clear()
    db.flush()
    product.modifier_links.extend(
        ProductModifierGroup(group_id=group_id, sort_order=index) for index, group_id in enumerate(group_ids)
    )
    if before != group_ids:
        audit_service.record(
            db,
            action="PRODUCT_MODIFIERS_UPDATE",
            user_id=actor.id,
            entity_type="product",
            entity_id=product.id,
            old_values={"group_ids": before},
            new_values={"group_ids": group_ids},
            ip_address=ip,
        )
    db.commit()
    db.expire_all()
    return db.get(Product, product.id)


def resolve_options(product: Product, option_ids: list[int]) -> list[ModifierOption]:
    """
    Kiểm tra lựa chọn khách chọn cho một dòng món: thuộc nhóm của món, đang dùng, đủ số lượng tối thiểu /
    không quá tối đa mỗi nhóm. Trả về lựa chọn theo thứ tự nhóm → lựa chọn. Sai → ValueError (thông điệp tiếng Việt).
    """
    groups = [link.group for link in product.modifier_links if link.group.is_active]
    if option_ids and product.kind != ProductKind.DISH:
        raise ValueError("Sản phẩm này không có tùy chọn")
    by_id = {o.id: (g, o) for g in groups for o in active_options(g)}
    unknown = [oid for oid in option_ids if oid not in by_id]
    if unknown:
        raise ValueError("Có lựa chọn không thuộc món này hoặc đã ngừng dùng")
    chosen = set(option_ids)
    result: list[ModifierOption] = []
    for group in groups:
        picked = [o for o in active_options(group) if o.id in chosen]
        if len(picked) < group.min_select:
            raise ValueError(f"Chọn {group.name} cho {product.name}")
        if len(picked) > group.max_select:
            raise ValueError(f"{group.name}: chọn tối đa {group.max_select}")
        result.extend(picked)
    return result
