from decimal import Decimal

import pytest

from app.services.pricing import (
    allocate_discount,
    discount_percent,
    effective_unit_cost,
    order_discount,
    purchase_line_total,
    weighted_average_cost,
)


def test_weighted_average_example_from_spec():
    # docs/01-business-spec.md §7.2: tồn 10 × 8.000, nhập 20 × 9.500 → 9.000
    assert weighted_average_cost(10, Decimal("8000"), 20, Decimal("9500")) == Decimal("9000.0000")


def test_out_of_stock_takes_incoming_cost():
    assert weighted_average_cost(0, Decimal("8000"), 5, Decimal("12345.5")) == Decimal("12345.5000")


def test_average_is_rounded_to_four_decimals():
    # (1 × 1 + 2 × 2) / 3 = 1.6666... → 1.6667
    assert weighted_average_cost(1, Decimal("1"), 2, Decimal("2")) == Decimal("1.6667")


def test_return_at_same_cost_keeps_average():
    assert weighted_average_cost(25, Decimal("9000"), 2, Decimal("9000")) == Decimal("9000.0000")


def test_incoming_quantity_must_be_positive():
    with pytest.raises(ValueError):
        weighted_average_cost(10, Decimal("1"), 0, Decimal("1"))


def test_purchase_line_total_and_effective_cost():
    # 24 chai × 5.000 - chiết khấu 12.000 = 108.000 → 4.500/chai
    total = purchase_line_total(24, Decimal("5000"), Decimal("12000"))
    assert total == Decimal("108000.00")
    assert effective_unit_cost(total, 24) == Decimal("4500.0000")


def test_effective_cost_can_have_fractions():
    # Thùng 100.000 cho 24 chai → 4.166,6667/chai
    assert effective_unit_cost(Decimal("100000"), 24) == Decimal("4166.6667")


# ---------- Giảm giá đơn hàng ----------


def D(value) -> Decimal:
    return Decimal(str(value))


@pytest.mark.parametrize(
    "subtotal, kind, value, expected",
    [
        ("180000", "PERCENT", "10", "18000"),
        ("33333", "PERCENT", "10", "3333"),  # 3.333,3 → làm tròn đến đồng
        ("33335", "PERCENT", "10", "3334"),  # 3.333,5 → làm tròn lên
        ("50000", "AMOUNT", "20000", "20000"),
        ("50000", "AMOUNT", "80000", "50000"),  # không vượt tạm tính
        ("50000", None, "0", "0"),
    ],
)
def test_order_discount(subtotal, kind, value, expected):
    assert order_discount(D(subtotal), kind, D(value)) == D(expected)


def test_discount_percent_of_amount_discount():
    assert discount_percent(D(200000), D(30000)) == D(15)
    assert discount_percent(D(0), D(0)) == 0


def test_allocation_example_from_api_doc():
    # 160.000 + 20.000, giảm 18.000 → 16.000 + 2.000
    assert allocate_discount([D(160000), D(20000)], D(18000)) == [D(16000), D(2000)]


def test_allocation_rounding_remainder_goes_to_largest_line():
    # 10.000 chia đều 3 dòng 1/3 → 3.333 + 3.333 + 3.333 = 9.999 → dòng lớn nhất (dòng đầu) nhận thêm 1
    result = allocate_discount([D(30000), D(30000), D(30000)], D(10000))
    assert sum(result) == D(10000)
    assert result == [D(3334), D(3333), D(3333)]


@pytest.mark.parametrize("lines", [[1], [7, 3], [99999, 1, 1], [12345, 67890, 11111, 5]])
@pytest.mark.parametrize("discount", [0, 1, 7, 999, 12345])
def test_allocation_always_sums_exactly_and_never_exceeds_line(lines, discount):
    lines = [D(x) for x in lines]
    discount = min(D(discount), sum(lines))

    result = allocate_discount(lines, discount)

    assert sum(result) == discount
    assert all(0 <= alloc <= line for alloc, line in zip(result, lines, strict=True))
    assert all(alloc == alloc.to_integral_value() for alloc in result)
