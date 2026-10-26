from app.core.permissions import Permission, RoleCode, permissions_for


def test_admin_has_every_permission():
    assert permissions_for(RoleCode.ADMIN) == frozenset(Permission)


def test_manager_cannot_manage_users_settings_or_audit():
    granted = permissions_for(RoleCode.MANAGER)

    assert Permission.USERS_MANAGE not in granted
    assert Permission.SETTINGS_MANAGE not in granted
    assert Permission.AUDIT_VIEW not in granted
    assert {Permission.PURCHASES_MANAGE, Permission.ORDERS_CANCEL, Permission.COST_VIEW} <= granted


def test_cashier_can_sell_but_not_see_cost_or_cancel():
    granted = permissions_for(RoleCode.CASHIER)

    assert {Permission.ORDERS_CREATE, Permission.RETURNS_CREATE, Permission.CATALOG_VIEW} <= granted
    assert Permission.COST_VIEW not in granted
    assert Permission.ORDERS_CANCEL not in granted
    assert Permission.REPORTS_VIEW not in granted
    assert Permission.CATALOG_MANAGE not in granted


def test_unknown_role_has_no_permissions():
    assert permissions_for("GUEST") == frozenset()
