"""Chấm công theo giờ: vào/ra ca, lương theo giờ chốt lúc vào ca, quản lý sửa giờ có lý do."""

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.permissions import RoleCode
from app.models import AuditLog, TimeEntry, User
from app.utils.time import utcnow

ATT = "/api/v1/attendance"


@pytest.fixture
def kitchen(auth_headers):
    return auth_headers(RoleCode.KITCHEN, username="bep1")


@pytest.fixture
def manager(auth_headers):
    return auth_headers(RoleCode.MANAGER, username="quanly")


@pytest.fixture
def admin(auth_headers):
    return auth_headers(RoleCode.ADMIN, username="admin")


def user_id(db, username):
    return db.scalar(select(User.id).where(User.username == username))


def iso(dt):
    return dt.isoformat()


def add_entry(client, headers, uid, hours_ago_in, hours_ago_out, reason="Quên bấm vào ca"):
    now = utcnow()
    return client.post(
        ATT,
        headers=headers,
        json={
            "user_id": uid,
            "clock_in_at": iso(now - timedelta(hours=hours_ago_in)),
            "clock_out_at": iso(now - timedelta(hours=hours_ago_out)),
            "reason": reason,
        },
    )


def test_kitchen_role_exists_and_only_clocks_in_and_out(client, kitchen, admin):
    roles = {r["code"]: r["name"] for r in client.get("/api/v1/roles", headers=admin).json()}
    assert roles["KITCHEN"] == "Nhân viên bếp"

    assert client.post(f"{ATT}/clock-in", headers=kitchen).status_code == 201
    me = client.get(f"{ATT}/me", headers=kitchen).json()
    assert me["current"]["user"]["full_name"] == "Bep1"
    assert client.post(f"{ATT}/clock-out", headers=kitchen).status_code == 200

    # Không xem tiền, bán hàng, báo cáo hay bảng công của người khác
    for url in (
        "/api/v1/orders",
        "/api/v1/reports/inventory",
        ATT,
        f"{ATT}/summary",
        "/api/v1/shifts/current",
    ):
        assert client.get(url, headers=kitchen).status_code == 403, url


def test_cannot_clock_in_twice_or_clock_out_without_clocking_in(client, kitchen):
    assert client.post(f"{ATT}/clock-out", headers=kitchen).json()["error"]["code"] == "NOT_CLOCKED_IN"
    client.post(f"{ATT}/clock-in", headers=kitchen)

    second = client.post(f"{ATT}/clock-in", headers=kitchen)

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_CLOCKED_IN"


def test_rate_is_locked_in_at_clock_in(client, kitchen, admin, db):
    uid = user_id(db, "bep1")
    assert client.patch(f"/api/v1/users/{uid}", headers=admin, json={"hourly_rate": 25000}).status_code == 200
    first = client.post(f"{ATT}/clock-in", headers=kitchen).json()
    assert first["hourly_rate"] == "25000.00"

    client.patch(f"/api/v1/users/{uid}", headers=admin, json={"hourly_rate": 30000})

    assert db.get(TimeEntry, first["id"]).hourly_rate == Decimal("25000.00")


def test_summary_adds_hours_and_pay_but_not_open_entries(client, manager, make_user, db, auth_headers):
    staff = make_user("phucvu", RoleCode.CASHIER)
    staff.hourly_rate = Decimal("25000")
    db.commit()
    assert add_entry(client, manager, staff.id, 30, 22).status_code == 201  # 8 giờ
    assert add_entry(client, manager, staff.id, 20, 16.5).status_code == 201  # 3,5 giờ
    # Lượt đang mở quá 16 giờ (quên ra ca): không tính tiền, được đánh dấu
    db.add(
        TimeEntry(
            user_id=staff.id, clock_in_at=utcnow() - timedelta(hours=15.9), hourly_rate=Decimal("25000")
        )
    )
    db.commit()
    db.execute(
        TimeEntry.__table__.update()
        .where(TimeEntry.clock_out_at.is_(None))
        .values(clock_in_at=utcnow() - timedelta(hours=17))
    )
    db.commit()

    rows = client.get(f"{ATT}/summary", headers=manager, params={"date_from": "2000-01-01"}).json()
    row = next(r for r in rows if r["user"]["full_name"] == "Phucvu")

    assert row["minutes"] == 11 * 60 + 30
    assert row["pay"] == "287500.00"  # 11,5 giờ × 25.000
    assert row["entry_count"] == 3
    assert row["open_entries"] == 1 and row["forgotten"] == 1


@pytest.mark.parametrize(
    ("in_ago", "out_ago", "code"),
    [
        (5, 6, "INVALID_TIME_RANGE"),  # ra trước vào
        (30, 4, "INVALID_TIME_RANGE"),  # quá 24 giờ
        (2, -1, "INVALID_TIME_RANGE"),  # ra ca trong tương lai
    ],
)
def test_invalid_manual_entries_are_rejected(client, manager, make_user, in_ago, out_ago, code):
    staff = make_user("phucvu")
    assert add_entry(client, manager, staff.id, in_ago, out_ago).json()["error"]["code"] == code


def test_entries_of_the_same_person_cannot_overlap(client, manager, make_user):
    staff = make_user("phucvu")
    assert add_entry(client, manager, staff.id, 10, 6).status_code == 201

    overlap = add_entry(client, manager, staff.id, 8, 4)

    assert overlap.status_code == 409
    assert overlap.json()["error"]["code"] == "TIME_OVERLAP"
    assert add_entry(client, manager, staff.id, 6, 2).status_code == 201  # nối tiếp, không chồng


def test_manager_cannot_edit_own_attendance_but_admin_can(client, manager, admin, db):
    manager_id = user_id(db, "quanly")

    assert add_entry(client, manager, manager_id, 9, 1).status_code == 403
    assert add_entry(client, admin, manager_id, 9, 1).status_code == 201


def test_update_and_delete_need_a_reason_and_are_audited(client, manager, make_user, db):
    staff = make_user("phucvu")
    entry = add_entry(client, manager, staff.id, 10, 6).json()
    now = utcnow()

    missing = client.patch(
        f"{ATT}/{entry['id']}",
        headers=manager,
        json={"clock_in_at": iso(now - timedelta(hours=9)), "clock_out_at": iso(now - timedelta(hours=6))},
    )
    assert missing.status_code == 422

    updated = client.patch(
        f"{ATT}/{entry['id']}",
        headers=manager,
        json={
            "clock_in_at": iso(now - timedelta(hours=9)),
            "clock_out_at": iso(now - timedelta(hours=6)),
            "reason": "Đến muộn 1 tiếng",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["minutes"] == 180 and updated.json()["note"] == "Đến muộn 1 tiếng"

    assert client.delete(f"{ATT}/{entry['id']}", headers=manager).status_code == 422  # thiếu lý do
    assert (
        client.delete(
            f"{ATT}/{entry['id']}", headers=manager, params={"reason": "Chấm nhầm người"}
        ).status_code
        == 204
    )

    actions = list(
        db.scalars(select(AuditLog.action).where(AuditLog.entity_type == "time_entry").order_by(AuditLog.id))
    )
    assert actions == ["ATTENDANCE_CREATE", "ATTENDANCE_UPDATE", "ATTENDANCE_DELETE"]


def test_staff_list_for_managers_has_names_only(client, manager, make_user):
    make_user("bepphu", RoleCode.KITCHEN, full_name="Trần Văn Bếp")
    make_user("nghiviec", is_active=False)

    staff = client.get(f"{ATT}/staff", headers=manager).json()

    assert {"full_name": "Trần Văn Bếp", "role": "Nhân viên bếp"} in [
        {k: s[k] for k in ("full_name", "role")} for s in staff
    ]
    assert all(set(s) == {"id", "full_name", "role"} for s in staff)  # không lộ email / SĐT / lương
    assert "Nghiviec" not in [s["full_name"] for s in staff]


def test_cashier_sees_only_own_attendance(client, auth_headers):
    cashier = auth_headers(RoleCode.CASHIER, username="thungan")

    assert client.get(f"{ATT}/me", headers=cashier).status_code == 200
    assert client.get(f"{ATT}/summary", headers=cashier).status_code == 403
    assert client.get(ATT, headers=cashier).status_code == 403
