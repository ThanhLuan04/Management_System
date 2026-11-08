import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.common import Password

password = TypeAdapter(Password)


def error_of(value: str) -> str:
    with pytest.raises(ValidationError) as exc:
        password.validate_python(value)
    return exc.value.errors()[0]["msg"]


@pytest.mark.parametrize("value", ["Passw0rd!", "Demo@123", "Đường#2026", "a B 1 #xyz", "Mật-khẩu-9X"])
def test_accepts_passwords_with_upper_lower_digit_and_special(value):
    assert password.validate_python(value) == value


@pytest.mark.parametrize(
    ("value", "missing"),
    [
        ("passw0rd!", "chữ hoa"),
        ("PASSW0RD!", "chữ thường"),
        ("Password!", "chữ số"),
        ("Passw0rd1", "ký tự đặc biệt"),
        ("Pass w0rd", "ký tự đặc biệt"),  # khoảng trắng không tính là ký tự đặc biệt
    ],
)
def test_names_exactly_what_is_missing(value, missing):
    assert error_of(value) == f"Value error, Mật khẩu còn thiếu: {missing}"


def test_lists_every_missing_part():
    assert error_of("abcdefgh") == "Value error, Mật khẩu còn thiếu: chữ hoa, chữ số, ký tự đặc biệt"


def test_vietnamese_capital_letter_counts_as_upper_case():
    assert password.validate_python("đẹp#trai9Đ")


def test_minimum_length_still_applies():
    assert "at least 8" in error_of("Aa1@")
