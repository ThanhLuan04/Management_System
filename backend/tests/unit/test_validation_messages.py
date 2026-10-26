from pydantic import ValidationError

from app.core.errors import _validation_message
from app.schemas.catalog import ProductCreate
from app.schemas.user import UserCreate


def messages(model, **data) -> dict[str, str]:
    try:
        model(**data)
    except ValidationError as exc:
        return {".".join(map(str, e["loc"])): _validation_message(e) for e in exc.errors()}
    return {}


def test_common_errors_are_translated_to_vietnamese():
    result = messages(
        ProductCreate,
        sku="OK",
        name="Tên",
        category_id="abc",
        unit="x" * 21,
        sale_price=-1,
        quantity=100,
    )

    assert result == {
        "category_id": "Phải là số nguyên",
        "unit": "Tối đa 20 ký tự",
        "sale_price": "Phải lớn hơn hoặc bằng 0",
        "quantity": "Trường này không được phép gửi lên",
    }


def test_missing_field_and_custom_validator_messages():
    result = messages(UserCreate, username="abc", password="abcdefgh", full_name="A", email="x@")

    assert result["role_id"] == "Trường này là bắt buộc"
    assert result["password"] == "Mật khẩu phải có cả chữ và số"  # không còn tiền tố "Value error, "
    assert result["email"] == "Email không hợp lệ"
