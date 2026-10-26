import pytest

from app.schemas.partner import normalize_phone


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("0901234567", "0901234567"),
        ("0901 234 567", "0901234567"),
        ("0901.234.567", "0901234567"),
        ("+84 901 234 567", "0901234567"),
        ("84901234567", "0901234567"),
        ("028 3822 1234", "02838221234"),  # số bàn 11 chữ số
    ],
)
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["12345", "abc", "0901-abc", "1901234567", "090123456789"])
def test_invalid_phone(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)
