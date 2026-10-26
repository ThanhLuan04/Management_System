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


DONG = Decimal("1")  # tiền bán hàng làm tròn đến đồng


def round_dong(value: Decimal) -> Decimal:
    return value.quantize(DONG, rounding=ROUND_HALF_UP)


def order_discount(subtotal: Decimal, discount_type: str | None, discount_value: Decimal) -> Decimal:
    """Số tiền giảm của cả đơn. PERCENT làm tròn đến đồng; không bao giờ vượt tạm tính."""
    if discount_type is None or discount_value == 0:
        return Decimal("0")
    if discount_type == "PERCENT":
        amount = round_dong(subtotal * discount_value / 100)
    else:
        amount = discount_value
    return min(amount, subtotal)


def discount_percent(subtotal: Decimal, discount_amount: Decimal) -> Decimal:
    """Tỷ lệ giảm thực tế (%) — dùng để so với giới hạn của vai trò, kể cả khi giảm theo số tiền."""
    if subtotal == 0:
        return Decimal("0")
    return discount_amount * 100 / subtotal


def allocate_discount(line_subtotals: list[Decimal], discount: Decimal) -> list[Decimal]:
    """
    Phân bổ tiền giảm của đơn vào từng dòng theo tỷ lệ thành tiền, làm tròn đến đồng.
    Phần chênh do làm tròn dồn vào dòng có thành tiền lớn nhất → tổng phân bổ luôn đúng bằng `discount`.
    Cần phân bổ để khi khách trả một phần hàng, tiền hoàn được tính đúng theo giá đã giảm của dòng đó.
    """
    total = sum(line_subtotals, Decimal("0"))
    if discount == 0 or total == 0:
        return [Decimal("0")] * len(line_subtotals)
    allocated = [round_dong(line * discount / total) for line in line_subtotals]
    largest = max(range(len(line_subtotals)), key=lambda i: line_subtotals[i])
    allocated[largest] += discount - sum(allocated, Decimal("0"))
    return allocated


def effective_unit_cost(line_total: Decimal, quantity: int) -> Decimal:
    """Giá nhập thực tế của 1 đơn vị sau chiết khấu dòng — giá dùng để tính giá vốn bình quân."""
    return round_cost(line_total / quantity)
