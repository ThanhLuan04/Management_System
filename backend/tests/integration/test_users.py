import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog, User
from tests.conftest import login

USERS = "/api/v1/users"

NEW_USER = {
    "username": "thungan01",
    "password": "ThuNgan123",
    "full_name": "Lê Văn C",
    "email": "c@example.com",
    "phone": "0901234567",
    "role_id": 3,
}


@pytest.mark.parametrize("role", [RoleCode.MANAGER, RoleCode.CASHIER])
def test_non_admin_cannot_access_user_management(client, auth_headers, role):
    headers = auth_headers(role)

    for response in (
        client.get(USERS, headers=headers),
        client.post(USERS, headers=headers, json=NEW_USER),
        client.get("/api/v1/roles", headers=headers),
    ):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_user_management_requires_login(client):
    assert client.get(USERS).status_code == 401


def test_admin_creates_user_who_can_then_log_in(client, auth_headers, db):
    headers = auth_headers(RoleCode.ADMIN)

    response = client.post(USERS, headers=headers, json=NEW_USER)

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "thungan01"
    assert body["role"]["code"] == "CASHIER"
    assert "password" not in body and "password_hash" not in body
    assert login(client, "thungan01", "ThuNgan123").status_code == 200

    audit = db.scalar(select(AuditLog).where(AuditLog.action == "USER_CREATE"))
    assert audit.entity_id == body["id"]
    assert "ThuNgan123" not in str(audit.new_values)


@pytest.mark.parametrize(
    "changes, field",
    [
        ({"username": "a b"}, "username"),
        ({"password": "abcdefgh"}, "password"),
        ({"password": "1234567"}, "password"),
        ({"email": "khong-phai-email"}, "email"),
        ({"phone": "abc"}, "phone"),
        ({"full_name": ""}, "full_name"),
    ],
)
def test_create_user_validates_fields(client, auth_headers, changes, field):
    headers = auth_headers(RoleCode.ADMIN)

    response = client.post(USERS, headers=headers, json={**NEW_USER, **changes})

    assert response.status_code == 422
    assert [d["field"] for d in response.json()["error"]["details"]] == [field]


def test_duplicate_username_and_email_are_case_insensitive(client, auth_headers):
    headers = auth_headers(RoleCode.ADMIN)
    client.post(USERS, headers=headers, json=NEW_USER)

    dup_username = client.post(
        USERS, headers=headers, json={**NEW_USER, "username": "ThuNgan01", "email": None}
    )
    dup_email = client.post(
        USERS, headers=headers, json={**NEW_USER, "username": "khac", "email": "C@EXAMPLE.com"}
    )

    assert dup_username.status_code == 409 and dup_username.json()["error"]["code"] == "DUPLICATE_USERNAME"
    assert dup_email.status_code == 409 and dup_email.json()["error"]["code"] == "DUPLICATE_EMAIL"


def test_create_user_with_unknown_role(client, auth_headers):
    headers = auth_headers(RoleCode.ADMIN)

    response = client.post(USERS, headers=headers, json={**NEW_USER, "role_id": 99})

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "role_id"


def test_list_users_with_search_filter_and_pagination(client, auth_headers, make_user):
    headers = auth_headers(RoleCode.ADMIN)
    for i in range(3):
        make_user(f"thungan{i}", RoleCode.CASHIER, full_name=f"Thu Ngân {i}")
    make_user("quanly", RoleCode.MANAGER, full_name="Quản Lý")

    page = client.get(
        USERS, headers=headers, params={"role": "cashier", "page_size": 2, "sort": "username"}
    ).json()
    assert page["total"] == 3
    assert [u["username"] for u in page["items"]] == ["thungan0", "thungan1"]

    found = client.get(USERS, headers=headers, params={"q": "quản"}).json()
    assert [u["username"] for u in found["items"]] == ["quanly"]


def test_list_users_rejects_unknown_sort_field(client, auth_headers):
    headers = auth_headers(RoleCode.ADMIN)

    response = client.get(USERS, headers=headers, params={"sort": "password_hash"})

    assert response.status_code == 422


def test_role_change_takes_effect_on_next_request(client, auth_headers, make_user):
    admin_headers = auth_headers(RoleCode.ADMIN)
    manager = make_user("quanly", RoleCode.MANAGER)
    manager_headers = {"Authorization": f"Bearer {login(client, 'quanly').json()['access_token']}"}

    response = client.patch(f"{USERS}/{manager.id}", headers=admin_headers, json={"role_id": 3})
    assert response.status_code == 200

    me = client.get("/api/v1/auth/me", headers=manager_headers).json()
    assert me["role"]["code"] == "CASHIER"
    assert "purchases.manage" not in me["permissions"]


def test_deactivated_user_loses_access(client, auth_headers, make_user):
    admin_headers = auth_headers(RoleCode.ADMIN)
    cashier = make_user("thungan")
    login(client, "thungan")

    response = client.patch(f"{USERS}/{cashier.id}/status", headers=admin_headers, json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    assert login(client, "thungan").json()["error"]["code"] == "ACCOUNT_DISABLED"
    # Refresh token của thu ngân đã bị thu hồi
    assert client.post("/api/v1/auth/refresh").status_code == 401


@pytest.mark.parametrize("payload, path", [({"is_active": False}, "/status"), ({"role_id": 3}, "")])
def test_admin_cannot_lock_or_demote_self(client, auth_headers, db, payload, path):
    headers = auth_headers(RoleCode.ADMIN)
    admin = db.scalar(select(User).where(User.username == "admin"))

    response = client.patch(f"{USERS}/{admin.id}{path}", headers=headers, json=payload)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CANNOT_MODIFY_SELF"


def test_admin_resets_password_and_unlocks(client, auth_headers, make_user):
    headers = auth_headers(RoleCode.ADMIN)
    cashier = make_user("thungan")
    for _ in range(5):
        login(client, "thungan", "Sai12345")
    assert login(client, "thungan").json()["error"]["code"] == "ACCOUNT_LOCKED"

    response = client.post(
        f"{USERS}/{cashier.id}/reset-password", headers=headers, json={"new_password": "MatKhauMoi1"}
    )

    assert response.status_code == 204
    assert login(client, "thungan", "MatKhauMoi1").status_code == 200


def test_update_user_records_only_changed_fields(client, auth_headers, make_user, db):
    headers = auth_headers(RoleCode.ADMIN)
    cashier = make_user("thungan", full_name="Tên Cũ")

    client.patch(f"{USERS}/{cashier.id}", headers=headers, json={"full_name": "Tên Mới", "phone": None})

    audit = db.scalar(select(AuditLog).where(AuditLog.action == "USER_UPDATE"))
    assert audit.old_values == {"full_name": "Tên Cũ"}
    assert audit.new_values == {"full_name": "Tên Mới"}


def test_get_missing_user_returns_404(client, auth_headers):
    headers = auth_headers(RoleCode.ADMIN)

    response = client.get(f"{USERS}/999999", headers=headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
