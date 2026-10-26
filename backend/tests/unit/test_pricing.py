from decimal import Decimal

import pytest

from app.services.pricing import effective_unit_cost, purchase_line_total, weighted_average_cost


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
