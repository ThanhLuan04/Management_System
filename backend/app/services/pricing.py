"""Các phép tính tiền/giá vốn thuần túy (không truy cập DB) — dễ unit test đầy đủ trường hợp biên."""

from decimal import ROUND_HALF_UP, Decimal

COST_QUANT = Decimal("0.0001")  # giá vốn lưu 4 chữ số thập phân
MONEY_QUANT = Decimal("0.01")


def round_cost(value: Decimal) -> Decimal:
    return value.quantize(COST_QUANT, rounding=ROUND_HALF_UP)


def round_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def weighted_average_cost(
    on_hand: int, avg_cost: Decimal, incoming_qty: int, incoming_cost: Decimal
) -> Decimal:
    """
    Giá vốn bình quân gia quyền sau khi nhập thêm hàng:
        avg_mới = (tồn × avg_cũ + SL_nhập × giá_nhập) / (tồn + SL_nhập)
    Khi tồn ≤ 0 (hết hàng), giá vốn mới chính là giá nhập — hàng cũ không còn để "bình quân" cùng.
    """
    if incoming_qty <= 0:
        raise ValueError("incoming_qty phải > 0")
    if on_hand <= 0:
        return round_cost(incoming_cost)
    total_value = on_hand * avg_cost + incoming_qty * incoming_cost
    return round_cost(total_value / (on_hand + incoming_qty))


def purchase_line_total(quantity: int, unit_cost: Decimal, discount_amount: Decimal) -> Decimal:
    return round_money(quantity * unit_cost - discount_amount)


def effective_unit_cost(line_total: Decimal, quantity: int) -> Decimal:
    """Giá nhập thực tế của 1 đơn vị sau chiết khấu dòng — giá dùng để tính giá vốn bình quân."""
    return round_cost(line_total / quantity)
